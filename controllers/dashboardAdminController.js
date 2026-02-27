/**
 * DASHBOARD ADMIN CONTROLLER
 * 
 * Controlador especializado para estadísticas del dashboard de administración.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/dashboardAdminController
 * @author RazoConnect Team
 * @date 2026-02-27
 */

const db = require('../db');

/**
 * Obtener estadísticas del dashboard de administrador
 * GET /api/admin/dashboard-stats
 */
const getDashboardStats = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;
    console.log('📊 [Dashboard Stats] Tenant ID:', tenant_id);

    // Obtener total de pedidos
    const pedidosResult = await db.query(
      `SELECT COUNT(*) as total FROM pedidos WHERE tenant_id = $1`,
      [tenant_id]
    );
    console.log('📦 Total Pedidos:', pedidosResult.rows[0]);

    // Obtener pedidos pendientes (no confirmados, no entregados, no cancelados)
    const pedidosPendientesResult = await db.query(
      `SELECT COUNT(*) as total FROM pedidos 
       WHERE tenant_id = $1 
       AND estatus NOT IN ('Confirmado', 'Entregado', 'Cancelado')`,
      [tenant_id]
    );
    console.log('⏳ Pedidos Pendientes:', pedidosPendientesResult.rows[0]);

    // Obtener pedidos entregados
    const pedidosEntregadosResult = await db.query(
      `SELECT COUNT(*) as total FROM pedidos 
       WHERE tenant_id = $1 AND estatus = 'Entregado'`,
      [tenant_id]
    );
    console.log('✅ Pedidos Entregados:', pedidosEntregadosResult.rows[0]);

    // Obtener total de clientes activos
    const clientesResult = await db.query(
      `SELECT COUNT(*) as total FROM clientes 
       WHERE tenant_id = $1 AND activo = TRUE`,
      [tenant_id]
    );
    console.log('👥 Clientes Activos:', clientesResult.rows[0]);

    // Obtener agentes activos
    const agentesResult = await db.query(
      `SELECT COUNT(*) as total FROM agentesdeventas 
       WHERE tenant_id = $1 AND activo = TRUE`,
      [tenant_id]
    );
    console.log('💼 Agentes Activos:', agentesResult.rows[0]);

    // Obtener venta total (suma de todos los pedidos no cancelados)
    const ventaTotalResult = await db.query(
      `SELECT COALESCE(SUM(montototal), 0) as total 
       FROM pedidos 
       WHERE tenant_id = $1 
       AND estatus NOT IN ('Cancelado')`,
      [tenant_id]
    );
    console.log('💵 Venta Total:', ventaTotalResult.rows[0]);

    // Calcular utilidad total (precio - costo) de todos los pedidos no cancelados
    const utilidadTotalResult = await db.query(
      `SELECT COALESCE(SUM(
        (dp.preciounitario - pv.costounitario) * dp.piezastotales
       ), 0) as utilidad
       FROM detallesdelpedido dp
       INNER JOIN pedidos ped ON dp.pedidoid = ped.pedidoid
       INNER JOIN producto_variantes pv ON dp.varianteid = pv.varianteid
       WHERE ped.tenant_id = $1 
       AND ped.estatus NOT IN ('Cancelado')`,
      [tenant_id]
    );
    console.log('💰 Utilidad Total:', utilidadTotalResult.rows[0]);

    // Obtener comisiones pendientes
    const comisionesPendientesResult = await db.query(
      `SELECT COALESCE(SUM(montocomision), 0) as total 
       FROM comisiones 
       WHERE tenant_id = $1 AND estatus = 'Pendiente'`,
      [tenant_id]
    );
    console.log('💳 Comisiones Pendientes:', comisionesPendientesResult.rows[0]);

    // ✅ SMART STOCK: Calcular valor de inventario usando stock_admin (por administrador)
    const userId = req.user?.id;
    const userRoles = req.user?.roles || [req.user?.rol];
    const userRol = req.user?.rol?.toLowerCase();
    const isSuperAdmin = userRol === 'superadmin' || userRol === 'super-admin' || userRol === 'developer';

    let valorInventarioResult;
    
    if (isSuperAdmin) {
      // Super Admin: Ver valor de inventario GLOBAL (producto_variantes.stock)
      valorInventarioResult = await db.query(
        `SELECT 
          COALESCE(SUM(pv.stock * pv.preciounitario), 0) as valor_venta,
          COALESCE(SUM(pv.stock * pv.costounitario), 0) as valor_costo,
          COUNT(*) as total_variantes_con_stock
         FROM producto_variantes pv
         INNER JOIN productos p ON pv.productoid = p.productoid
         WHERE p.tenant_id = $1 
         AND pv.stock > 0`,
        [tenant_id]
      );
      console.log('📦 [Dashboard] Super Admin - Valor Inventario GLOBAL:', valorInventarioResult.rows[0]);
    } else {
      // Admin regular: Ver valor de inventario de SU STOCK (stock_admin)
      valorInventarioResult = await db.query(
        `SELECT 
          COALESCE(SUM(sa.cantidad * pv.preciounitario), 0) as valor_venta,
          COALESCE(SUM(sa.cantidad * pv.costounitario), 0) as valor_costo,
          COUNT(DISTINCT sa.variante_id) as total_variantes_con_stock
         FROM stock_admin sa
         INNER JOIN producto_variantes pv ON sa.variante_id = pv.varianteid
         INNER JOIN productos p ON pv.productoid = p.productoid
         WHERE sa.tenant_id = $1 
         AND sa.admin_id = $2
         AND sa.cantidad > 0`,
        [tenant_id, userId]
      );
      console.log(`📦 [Dashboard] Admin ${userId} - Valor Inventario LOCAL:`, valorInventarioResult.rows[0]);
    }

    const responseData = {
      totalPedidos: parseInt(pedidosResult.rows[0].total),
      pedidosPendientes: parseInt(pedidosPendientesResult.rows[0].total),
      pedidosEntregados: parseInt(pedidosEntregadosResult.rows[0].total),
      clientesActivos: parseInt(clientesResult.rows[0].total),
      agentesActivos: parseInt(agentesResult.rows[0].total),
      ventaTotal: parseFloat(ventaTotalResult.rows[0].total),
      ingresosTotales: parseFloat(utilidadTotalResult.rows[0].utilidad),
      comisionesPendientes: parseFloat(comisionesPendientesResult.rows[0].total),
      valorInventarioVenta: parseFloat(valorInventarioResult.rows[0].valor_venta || 0),
      valorInventarioCosto: parseFloat(valorInventarioResult.rows[0].valor_costo || 0),
      isSuperAdmin // ✅ Indicar al frontend si es Super Admin
    };

    console.log('📤 Response Data:', responseData);

    res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error("❌ Error al obtener estadísticas del dashboard:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener estadísticas",
      error: error.message
    });
  }
};

module.exports = {
  getDashboardStats
};
