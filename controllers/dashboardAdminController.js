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
const logger = require('../utils/logger');

/**
 * Obtener estadísticas del dashboard de administrador
 * GET /api/admin/dashboard-stats
 */
const getDashboardStats = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;

    // Fechas del mes actual y mes anterior
    const now = new Date();
    const primerDiaMesActual = new Date(now.getFullYear(), now.getMonth(), 1);
    const primerDiaMesAnterior = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const ultimoDiaMesAnterior = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    // Obtener total de pedidos del mes actual
    const pedidosResult = await db.query(
      `SELECT COUNT(*) as total FROM pedidos 
       WHERE tenant_id = $1 
       AND fechapedido >= $2`,
      [tenant_id, primerDiaMesActual]
    );

    // Pedidos del mes anterior para comparativa
    const pedidosMesAnteriorResult = await db.query(
      `SELECT COUNT(*) as total FROM pedidos 
       WHERE tenant_id = $1 
       AND fechapedido >= $2 
       AND fechapedido <= $3`,
      [tenant_id, primerDiaMesAnterior, ultimoDiaMesAnterior]
    );

    // Obtener pedidos pendientes del mes actual
    const pedidosPendientesResult = await db.query(
      `SELECT COUNT(*) as total FROM pedidos 
       WHERE tenant_id = $1 
       AND fechapedido >= $2
       AND estatus NOT IN ('Confirmado', 'Entregado', 'Cancelado')`,
      [tenant_id, primerDiaMesActual]
    );

    // Obtener pedidos entregados del mes actual
    const pedidosEntregadosResult = await db.query(
      `SELECT COUNT(*) as total FROM pedidos 
       WHERE tenant_id = $1 
       AND fechapedido >= $2
       AND estatus = 'Entregado'`,
      [tenant_id, primerDiaMesActual]
    );

    // Obtener total de clientes activos
    const clientesResult = await db.query(
      `SELECT COUNT(*) as total FROM clientes 
       WHERE tenant_id = $1 AND activo = TRUE`,
      [tenant_id]
    );

    // Obtener agentes activos
    const agentesResult = await db.query(
      `SELECT COUNT(*) as total FROM agentesdeventas 
       WHERE tenant_id = $1 AND activo = TRUE`,
      [tenant_id]
    );

    // Obtener venta total del mes actual (suma de pedidos no cancelados)
    const ventaTotalResult = await db.query(
      `SELECT COALESCE(SUM(montototal), 0) as total 
       FROM pedidos 
       WHERE tenant_id = $1 
       AND fechapedido >= $2
       AND estatus NOT IN ('Cancelado')`,
      [tenant_id, primerDiaMesActual]
    );

    // Venta del mes anterior para comparativa
    const ventaMesAnteriorResult = await db.query(
      `SELECT COALESCE(SUM(montototal), 0) as total 
       FROM pedidos 
       WHERE tenant_id = $1 
       AND fechapedido >= $2 
       AND fechapedido <= $3
       AND estatus NOT IN ('Cancelado')`,
      [tenant_id, primerDiaMesAnterior, ultimoDiaMesAnterior]
    );

    // Calcular utilidad total del mes actual (precio - costo)
    const utilidadTotalResult = await db.query(
      `SELECT COALESCE(SUM(
        (dp.preciounitario - pv.costounitario) * dp.piezastotales
       ), 0) as utilidad
       FROM detallesdelpedido dp
       INNER JOIN pedidos ped ON dp.pedidoid = ped.pedidoid
       INNER JOIN producto_variantes pv ON dp.varianteid = pv.varianteid
       WHERE ped.tenant_id = $1 
       AND ped.fechapedido >= $2
       AND ped.estatus NOT IN ('Cancelado')`,
      [tenant_id, primerDiaMesActual]
    );

    // Utilidad del mes anterior para comparativa
    const utilidadMesAnteriorResult = await db.query(
      `SELECT COALESCE(SUM(
        (dp.preciounitario - pv.costounitario) * dp.piezastotales
       ), 0) as utilidad
       FROM detallesdelpedido dp
       INNER JOIN pedidos ped ON dp.pedidoid = ped.pedidoid
       INNER JOIN producto_variantes pv ON dp.varianteid = pv.varianteid
       WHERE ped.tenant_id = $1 
       AND ped.fechapedido >= $2 
       AND ped.fechapedido <= $3
       AND ped.estatus NOT IN ('Cancelado')`,
      [tenant_id, primerDiaMesAnterior, ultimoDiaMesAnterior]
    );

    // Obtener comisiones pendientes
    const comisionesPendientesResult = await db.query(
      `SELECT COALESCE(SUM(montocomision), 0) as total 
       FROM comisiones 
       WHERE tenant_id = $1 AND estatus = 'Pendiente'`,
      [tenant_id]
    );

    // ✅ SMART STOCK: Calcular valor de inventario usando stock_admin (por administrador)
    const userId = req.user?.id;
    const userRoles = req.user?.roles || [req.user?.rol];
    const userRol = req.user?.rol?.toLowerCase();
    const isSuperAdmin = userRol === 'superadmin' || userRol === 'super-admin' || userRol === 'super_admin' || userRol === 'developer';

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
    }

    // Calcular cambios porcentuales
    const totalPedidosMesActual = parseInt(pedidosResult.rows[0].total);
    const totalPedidosMesAnterior = parseInt(pedidosMesAnteriorResult.rows[0].total);
    const ventaMesActual = parseFloat(ventaTotalResult.rows[0].total);
    const ventaMesAnterior = parseFloat(ventaMesAnteriorResult.rows[0].total);
    const utilidadMesActual = parseFloat(utilidadTotalResult.rows[0].utilidad);
    const utilidadMesAnterior = parseFloat(utilidadMesAnteriorResult.rows[0].utilidad);

    const responseData = {
      // Datos del mes actual
      totalPedidos: totalPedidosMesActual,
      pedidosPendientes: parseInt(pedidosPendientesResult.rows[0].total),
      pedidosEntregados: parseInt(pedidosEntregadosResult.rows[0].total),
      clientesActivos: parseInt(clientesResult.rows[0].total),
      agentesActivos: parseInt(agentesResult.rows[0].total),
      ventaTotal: ventaMesActual,
      ingresosTotales: utilidadMesActual,
      comisionesPendientes: parseFloat(comisionesPendientesResult.rows[0].total),
      valorInventarioVenta: parseFloat(valorInventarioResult.rows[0].valor_venta || 0),
      valorInventarioCosto: parseFloat(valorInventarioResult.rows[0].valor_costo || 0),
      
      // Comparativas vs mes anterior
      pedidosMesAnterior: totalPedidosMesAnterior,
      ventaMesAnterior: ventaMesAnterior,
      utilidadMesAnterior: utilidadMesAnterior,
      
      // Metadata
      mesActual: now.toLocaleString('es-MX', { month: 'long', year: 'numeric' }),
      isSuperAdmin
    };


    res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    logger.error('❌ Error al obtener estadísticas del dashboard:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
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
