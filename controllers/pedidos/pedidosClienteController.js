/**
 * PEDIDOS CLIENTE CONTROLLER
 * 
 * Responsabilidad: Vista de pedidos para clientes y agentes
 * - Solo lectura de pedidos propios
 * - Estados visibles: Con stock, Bajo pedido, Surtido, Facturado
 * - NO puede cambiar estados
 * 
 * @module controllers/pedidos/pedidosClienteController
 * @author RazoConnect Team
 * @date 2026-05-12
 */

const db = require('../../db');
const logger = require('../../utils/logger');
const { calcularEstadoPedidoCorrect } = require('../../utils/pedidoStatus');

/**
 * GET /api/clientes/pedidos
 * Listar pedidos del cliente autenticado
 */
exports.listarPedidosCliente = async (req, res) => {
  try {
    const { tenant_id, userId, userRole } = req;

    // Validar que sea cliente
    if (userRole !== 'cliente') {
      return res.status(403).json({
        success: false,
        message: 'Solo clientes pueden acceder a esta ruta'
      });
    }

    // Obtener pedidos del cliente
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
        COUNT(dp.detalleid) as total_productos,
        SUM(CASE WHEN LOWER(dp.estado_producto) = 'facturado' THEN 1 ELSE 0 END) as productos_facturados,
        SUM(CASE WHEN LOWER(dp.estado_producto) = 'surtido' THEN 1 ELSE 0 END) as productos_surtidos,
        SUM(CASE WHEN LOWER(COALESCE(dp.estado_producto, '')) = 'con stock' THEN 1 ELSE 0 END) as productos_con_stock,
        SUM(CASE WHEN LOWER(COALESCE(dp.estado_producto, 'bajo pedido')) = 'bajo pedido' THEN 1 ELSE 0 END) as productos_bajo_pedido
      FROM pedidos p
      LEFT JOIN detallesdelpedido dp ON p.pedidoid = dp.pedidoid AND dp.tenant_id = p.tenant_id
      LEFT JOIN administradores a ON p.admin_asignado_id = a.adminid AND a.tenant_id = p.tenant_id
      WHERE p.clienteid = $1
        AND p.tenant_id = $2
        AND p.estatus NOT IN ('Cancelado')
      GROUP BY p.pedidoid, p.numero_pedido_cliente, p.fechapedido, p.estatus, 
               p.total, p.es_credito, p.admin_asignado_id, a.nombre
      ORDER BY p.fechapedido DESC
      LIMIT 100
    `;

    const result = await db.query(query, [userId, tenant_id]);

    logger.info('✅ [CLIENTE] Pedidos listados', {
      clienteId: userId,
      totalPedidos: result.rows.length,
      tenantId: tenant_id,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    logger.error('Error al listar pedidos del cliente:', {
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
 * GET /api/clientes/pedidos/:id
 * Ver detalle de un pedido específico
 */
exports.obtenerDetallePedido = async (req, res) => {
  try {
    const { tenant_id, userId, userRole } = req;
    const { id: pedidoId } = req.params;

    // Validar que sea cliente
    if (userRole !== 'cliente') {
      return res.status(403).json({
        success: false,
        message: 'Solo clientes pueden acceder a esta ruta'
      });
    }

    // Verificar que el pedido pertenece al cliente
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
        AND p.clienteid = $2
        AND p.tenant_id = $3
    `;

    const pedidoResult = await db.query(pedidoQuery, [pedidoId, userId, tenant_id]);

    if (pedidoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Pedido no encontrado o no tienes permiso para verlo'
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
        t.cantidad as tamano_cantidad
      FROM detallesdelpedido dp
      INNER JOIN producto_variantes pv ON dp.varianteid = pv.varianteid
      INNER JOIN productos p ON pv.productoid = p.productoid
      LEFT JOIN cat_tamanopaquetes t ON dp.tamanoid = t.tamanoid
      WHERE dp.pedidoid = $1
        AND dp.tenant_id = $2
      ORDER BY dp.detalleid
    `;

    const detallesResult = await db.query(detallesQuery, [pedidoId, tenant_id]);

    logger.info('✅ [CLIENTE] Detalle de pedido consultado', {
      clienteId: userId,
      pedidoId,
      totalProductos: detallesResult.rows.length,
      tenantId: tenant_id,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      data: {
        pedido,
        detalles: detallesResult.rows
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

/**
 * GET /api/clientes/pedidos/:id/estado
 * Obtener estado actualizado del pedido con desglose por producto
 */
exports.obtenerEstadoPedido = async (req, res) => {
  try {
    const { tenant_id, userId, userRole } = req;
    const { id: pedidoId } = req.params;

    // Validar que sea cliente
    if (userRole !== 'cliente') {
      return res.status(403).json({
        success: false,
        message: 'Solo clientes pueden acceder a esta ruta'
      });
    }

    // Verificar que el pedido pertenece al cliente
    const pedidoQuery = `
      SELECT pedidoid, estatus, clienteid
      FROM pedidos
      WHERE pedidoid = $1
        AND clienteid = $2
        AND tenant_id = $3
    `;

    const pedidoResult = await db.query(pedidoQuery, [pedidoId, userId, tenant_id]);

    if (pedidoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Pedido no encontrado'
      });
    }

    // Obtener desglose de estados de productos
    const estadosQuery = `
      SELECT 
        LOWER(COALESCE(estado_producto, 'pendiente')) as estado,
        COUNT(*) as cantidad
      FROM detallesdelpedido
      WHERE pedidoid = $1
        AND tenant_id = $2
      GROUP BY LOWER(COALESCE(estado_producto, 'pendiente'))
    `;

    const estadosResult = await db.query(estadosQuery, [pedidoId, tenant_id]);

    const desglose = {
      facturado: 0,
      surtido: 0,
      con_stock: 0,
      bajo_pedido: 0,
      pendiente: 0
    };

    estadosResult.rows.forEach(row => {
      const estado = row.estado.trim();
      const cantidad = parseInt(row.cantidad, 10);
      
      if (estado === 'facturado') desglose.facturado = cantidad;
      else if (estado === 'surtido') desglose.surtido = cantidad;
      else if (estado === 'con stock') desglose.con_stock = cantidad;
      else if (estado === 'bajo pedido') desglose.bajo_pedido = cantidad;
      else desglose.pendiente = cantidad;
    });

    res.json({
      success: true,
      data: {
        pedidoId,
        estatus: pedidoResult.rows[0].estatus,
        desglose
      }
    });

  } catch (error) {
    logger.error('Error al obtener estado del pedido:', {
      error: error.message,
      pedidoId: req.params.id,
      userId: req.userId,
      tenantId: req.tenant_id
    });
    res.status(500).json({
      success: false,
      message: 'Error al obtener estado del pedido'
    });
  }
};
