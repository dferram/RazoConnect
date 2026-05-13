/**
 * PEDIDOS FINANZAS CONTROLLER
 * 
 * Responsabilidad: Gestión de pedidos para finanzas
 * - Confirmar surtido → Facturado (Surtido → Facturado)
 * - Rechazar surtido → Volver a Con stock (Surtido → Con stock)
 * - Generar movimientos CXC
 * 
 * @module controllers/pedidos/pedidosFinanzasController
 * @author RazoConnect Team
 * @date 2026-05-12
 */

const db = require('../../db');
const logger = require('../../utils/logger');
const { confirmarSurtidoFinanzas } = require('../finanzas/confirmController');
const { rechazarPedidoFinanzas } = require('../finanzas/rejectController');

/**
 * GET /api/finanzas/pedidos
 * Listar pedidos listos para confirmar (estado: Listo para remisionar)
 */
exports.listarPedidosFinanzas = async (req, res) => {
  try {
    const { tenant_id, userId, userRole } = req;

    // Validar que sea finanzas
    if (userRole !== 'finanzas' && !req.userRoles.includes('gerente_finanzas')) {
      return res.status(403).json({
        success: false,
        message: 'Solo finanzas pueden acceder a esta ruta'
      });
    }

    // Obtener pedidos listos para confirmar
    const query = `
      SELECT 
        p.pedidoid,
        p.numero_pedido_cliente,
        p.fechapedido,
        p.estatus,
        p.total,
        p.es_credito,
        p.admin_asignado_id,
        a.nombre as admin_nombre,
        c.nombre as cliente_nombre,
        c.apellido as cliente_apellido,
        c.email as cliente_email,
        COUNT(dp.detalleid) as total_productos,
        SUM(CASE WHEN LOWER(dp.estado_producto) = 'surtido' THEN 1 ELSE 0 END) as productos_surtidos,
        SUM(CASE WHEN LOWER(dp.estado_producto) = 'facturado' THEN 1 ELSE 0 END) as productos_facturados,
        SUM(dp.preciounitario * dp.cantidadsurtida) as monto_surtido
      FROM pedidos p
      INNER JOIN clientes c ON p.clienteid = c.clienteid AND c.tenant_id = p.tenant_id
      LEFT JOIN detallesdelpedido dp ON p.pedidoid = dp.pedidoid AND dp.tenant_id = p.tenant_id
      LEFT JOIN administradores a ON p.admin_asignado_id = a.adminid AND a.tenant_id = p.tenant_id
      WHERE p.tenant_id = $1
        AND p.estatus IN ('Listo para remisionar', 'Surtido completo')
      GROUP BY p.pedidoid, p.numero_pedido_cliente, p.fechapedido, p.estatus, 
               p.total, p.es_credito, p.admin_asignado_id,
               a.nombre, c.nombre, c.apellido, c.email
      ORDER BY p.fechapedido ASC
      LIMIT 100
    `;

    const result = await db.query(query, [tenant_id]);

    logger.info('✅ [FINANZAS] Pedidos listos para confirmar', {
      userId,
      totalPedidos: result.rows.length,
      tenantId: tenant_id,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    logger.error('Error al listar pedidos para finanzas:', {
      error: error.message,
      stack: error.stack,
      userId: req.userId,
      tenantId: req.tenant_id
    });
    res.status(500).json({
      success: false,
      message: 'Error al obtener pedidos'
    });
  }
};

/**
 * POST /api/finanzas/pedidos/:id/confirmar
 * Confirmar surtido → Facturado
 * Transición: Surtido → Facturado
 * Genera movimientos CXC para pedidos a crédito
 */
exports.confirmarSurtido = async (req, res) => {
  try {
    const { tenant_id, userId, userRole, userRoles } = req;
    const { id: pedidoId } = req.params;
    const { detalleIds } = req.body; // Array de IDs de productos a confirmar

    // Validar que sea finanzas
    if (userRole !== 'finanzas' && !userRoles.includes('gerente_finanzas')) {
      return res.status(403).json({
        success: false,
        message: 'Solo finanzas pueden confirmar surtidos'
      });
    }

    // Validar detalleIds
    if (!detalleIds || !Array.isArray(detalleIds) || detalleIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Debes seleccionar al menos un producto para confirmar'
      });
    }

    logger.info('ℹ️ [FINANZAS] Iniciando confirmación de surtido', {
      pedidoId,
      detalleIds,
      userId,
      userRole,
      tenant_id,
      timestamp: new Date().toISOString()
    });

    // Delegar a confirmController existente
    await confirmarSurtidoFinanzas(req, res);

  } catch (error) {
    logger.error('Error al confirmar surtido:', {
      error: error.message,
      stack: error.stack,
      pedidoId: req.params.id,
      userId: req.userId,
      tenantId: req.tenant_id
    });
    
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Error al confirmar surtido'
      });
    }
  }
};

/**
 * POST /api/finanzas/pedidos/:id/rechazar
 * Rechazar surtido → Volver a Con stock
 * Transición: Surtido → Con stock
 * Revierte stock al admin
 */
exports.rechazarSurtido = async (req, res) => {
  try {
    const { tenant_id, userId, userRole, userRoles } = req;
    const { id: pedidoId } = req.params;
    const { detalleIds, motivo } = req.body;

    // Validar que sea finanzas
    if (userRole !== 'finanzas' && !userRoles.includes('gerente_finanzas')) {
      return res.status(403).json({
        success: false,
        message: 'Solo finanzas pueden rechazar surtidos'
      });
    }

    // Validar detalleIds
    if (!detalleIds || !Array.isArray(detalleIds) || detalleIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Debes seleccionar al menos un producto para rechazar'
      });
    }

    logger.info('ℹ️ [FINANZAS] Iniciando rechazo de surtido', {
      pedidoId,
      detalleIds,
      motivo,
      userId,
      userRole,
      tenant_id,
      timestamp: new Date().toISOString()
    });

    // Delegar a rejectController existente
    await rechazarPedidoFinanzas(req, res);

  } catch (error) {
    logger.error('Error al rechazar surtido:', {
      error: error.message,
      stack: error.stack,
      pedidoId: req.params.id,
      userId: req.userId,
      tenantId: req.tenant_id
    });
    
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Error al rechazar surtido'
      });
    }
  }
};

/**
 * GET /api/finanzas/pedidos/:id/detalle
 * Obtener detalle de pedido para finanzas
 */
exports.obtenerDetallePedidoFinanzas = async (req, res) => {
  try {
    const { tenant_id, userId, userRole, userRoles } = req;
    const { id: pedidoId } = req.params;

    // Validar que sea finanzas
    if (userRole !== 'finanzas' && !userRoles.includes('gerente_finanzas')) {
      return res.status(403).json({
        success: false,
        message: 'Solo finanzas pueden acceder a esta ruta'
      });
    }

    // Obtener información del pedido
    const pedidoQuery = `
      SELECT 
        p.*,
        c.nombre as cliente_nombre,
        c.apellido as cliente_apellido,
        c.telefono as cliente_telefono,
        c.email as cliente_email,
        a.nombre as admin_nombre,
        d.calle,
        d.numeroext,
        d.numeroint,
        d.colonia,
        d.ciudad,
        d.codigopostal,
        e.nombre as estado_nombre
      FROM pedidos p
      INNER JOIN clientes c ON p.clienteid = c.clienteid AND c.tenant_id = p.tenant_id
      LEFT JOIN administradores a ON p.admin_asignado_id = a.adminid AND a.tenant_id = p.tenant_id
      LEFT JOIN direcciones d ON p.direccionid = d.direccionid AND d.tenant_id = p.tenant_id
      LEFT JOIN estados e ON d.estadoid = e.estadoid
      WHERE p.pedidoid = $1
        AND p.tenant_id = $2
    `;

    const pedidoResult = await db.query(pedidoQuery, [pedidoId, tenant_id]);

    if (pedidoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Pedido no encontrado'
      });
    }

    const pedido = pedidoResult.rows[0];

    // Obtener detalles de productos
    const detallesQuery = `
      SELECT 
        dp.detalleid,
        dp.cantidadpaquetes,
        dp.preciounitario,
        dp.piezastotales,
        dp.cantidadsurtida,
        dp.cantidadbackorder,
        dp.esbackorder,
        COALESCE(dp.estado_producto, 'Pendiente') as estado_producto,
        p.nombreproducto,
        pv.sku,
        pv.color_nombre,
        pv.dimensiones,
        pv.stock as stock_actual,
        t.cantidad as tamano_cantidad,
        (dp.preciounitario * dp.cantidadsurtida) as subtotal_surtido
      FROM detallesdelpedido dp
      INNER JOIN producto_variantes pv ON dp.varianteid = pv.varianteid AND pv.tenant_id = dp.tenant_id
      INNER JOIN productos p ON pv.productoid = p.productoid AND p.tenant_id = dp.tenant_id
      LEFT JOIN cat_tamanopaquetes t ON dp.tamanoid = t.tamanoid AND t.tenant_id = dp.tenant_id
      WHERE dp.pedidoid = $1
        AND dp.tenant_id = $2
      ORDER BY 
        CASE 
          WHEN LOWER(dp.estado_producto) = 'surtido' THEN 1
          WHEN LOWER(dp.estado_producto) = 'facturado' THEN 2
          ELSE 3
        END,
        dp.detalleid
    `;

    const detallesResult = await db.query(detallesQuery, [pedidoId, tenant_id]);

    // Calcular totales
    const totales = {
      total_surtido: 0,
      total_facturado: 0,
      productos_surtidos: 0,
      productos_facturados: 0
    };

    detallesResult.rows.forEach(row => {
      const estado = (row.estado_producto || '').toLowerCase().trim();
      const subtotal = parseFloat(row.subtotal_surtido || 0);
      
      if (estado === 'surtido') {
        totales.total_surtido += subtotal;
        totales.productos_surtidos++;
      } else if (estado === 'facturado') {
        totales.total_facturado += subtotal;
        totales.productos_facturados++;
      }
    });

    logger.info('✅ [FINANZAS] Detalle de pedido consultado', {
      userId,
      pedidoId,
      totalProductos: detallesResult.rows.length,
      tenantId: tenant_id,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      data: {
        pedido,
        detalles: detallesResult.rows,
        totales
      }
    });

  } catch (error) {
    logger.error('Error al obtener detalle del pedido:', {
      error: error.message,
      stack: error.stack,
      pedidoId: req.params.id,
      userId: req.userId,
      tenantId: req.tenant_id
    });
    res.status(500).json({
      success: false,
      message: 'Error al obtener detalle del pedido'
    });
  }
};
