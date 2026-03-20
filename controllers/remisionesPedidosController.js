/**
 * REMISIONES PEDIDOS CONTROLLER
 * 
 * Controlador especializado para obtener datos de remisión de pedidos.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/remisionesPedidosController
 * @author RazoConnect Team
 * @date 2026-02-27
 */

const db = require('../db');
const logger = require('../utils/logger');

/**
 * Obtener datos para generar remisión PDF
 * GET /api/admin/pedidos/:id/remision
 */
const obtenerRemisionPedido = async (req, res) => {
  try {
    const pedidoId = Number.parseInt(req.params.id, 10);

    if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de pedido inválido",
      });
    }

    const pedidoQuery = `
      SELECT 
        p.pedidoid,
        p.fechapedido,
        p.montototal,
        p.costoenvio,
        p.estatus,
        c.nombre as cliente_nombre,
        c.apellido as cliente_apellido,
        c.email as cliente_email,
        c.telefono as cliente_telefono,
        d.receptor,
        d.calle,
        d.ciudad,
        e.nombre as estado_nombre,
        a.nombre as agente_nombre,
        a.apellido as agente_apellido,
        a.codigoagente
      FROM pedidos p
      INNER JOIN clientes c ON c.clienteid = p.clienteid
      LEFT JOIN cliente_direcciones d ON d.direccionid = p.direccionenvioid
      LEFT JOIN estados e ON e.estadoid = d.estadoid
      LEFT JOIN agentesdeventas a ON a.agenteid = p.agenteid
      WHERE p.pedidoid = $1
    `;

    const pedidoResult = await db.query(pedidoQuery, [pedidoId]);

    if (pedidoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pedido no encontrado",
      });
    }

    const pedido = pedidoResult.rows[0];

    const detallesQuery = `
      SELECT DISTINCT ON (dp.detalleid)
        dp.detalleid,
        dp.cantidadpaquetes,
        dp.cantidadsurtida,
        dp.esbackorder,
        dp.preciounitario,
        dp.precioporpaquete,
        dp.piezastotales,
        pv.sku,
        pv.dimensiones,
        pv.stock AS stock_real_variante,
        prod.nombreproducto,
        t.cantidad as tamano_piezas
      FROM detallesdelpedido dp
      INNER JOIN producto_variantes pv ON pv.varianteid = dp.varianteid
      INNER JOIN productos prod ON prod.productoid = pv.productoid
      LEFT JOIN cat_tamanopaquetes t ON t.tamanoid = dp.tamanoid AND t.tenant_id = dp.tenant_id
      WHERE dp.pedidoid = $1
      ORDER BY dp.detalleid ASC
    `;

    const detallesResult = await db.query(detallesQuery, [pedidoId]);

    // FIX: Separar productos surtidos de productos pendientes (backorder)
    const itemsSurtidos = [];
    const itemsBackorder = [];

    detallesResult.rows.forEach((item) => {
      const cantidadSurtida = parseInt(item.cantidadsurtida || 0, 10);
      const cantidadPaquetes = parseInt(item.cantidadpaquetes, 10);
      const esBackorder = item.esbackorder || false;
      
      const precioPorPaquete = parseFloat(item.precioporpaquete || 0);
      const tamanoPiezas = item.tamano_piezas || 1;
      
      const itemData = {
        sku: item.sku,
        nombreProducto: item.nombreproducto,
        dimensiones: item.dimensiones,
        tamano: tamanoPiezas > 1 ? `Pack ${tamanoPiezas}` : 'Pack 1',
        cantidad: cantidadPaquetes,
        cantidadSurtida: cantidadSurtida,
        precioUnitario: precioPorPaquete,
        piezasTotales: item.piezastotales,
        stockReal: parseInt(item.stock_real_variante || 0, 10),
        subtotal: parseFloat((cantidadPaquetes * precioPorPaquete).toFixed(2)),
      };

      // Solo incluir en surtidos si cantidadsurtida > 0
      if (cantidadSurtida > 0) {
        itemsSurtidos.push({
          ...itemData,
          cantidad: cantidadSurtida,
          subtotal: parseFloat((cantidadSurtida * precioPorPaquete).toFixed(2)),
        });
      }
      
      // Incluir en backorder SOLO si hay cantidad pendiente (no completamente surtido)
      const cantidadPendiente = cantidadPaquetes - cantidadSurtida;
      if (cantidadPendiente > 0) {
        itemsBackorder.push({
          ...itemData,
          cantidad: cantidadPendiente,
          subtotal: parseFloat((cantidadPendiente * precioPorPaquete).toFixed(2)),
        });
      }
    });

    // Calcular total solo de productos surtidos
    const totalSurtido = itemsSurtidos.reduce((sum, item) => sum + item.subtotal, 0);

    res.json({
      success: true,
      data: {
        pedido: {
          pedidoId: pedido.pedidoid,
          fechaPedido: pedido.fechapedido,
          montoTotal: parseFloat(pedido.montototal),
          montoSurtido: parseFloat(totalSurtido.toFixed(2)), // Total de productos confirmados
          costoEnvio: parseFloat(pedido.costoenvio || 0),
          estatus: pedido.estatus,
          cliente: {
            nombre: `${pedido.cliente_nombre} ${pedido.cliente_apellido}`,
            email: pedido.cliente_email,
            telefono: pedido.cliente_telefono,
          },
          direccion: {
            receptor: pedido.receptor,
            calle: pedido.calle,
            ciudad: pedido.ciudad,
            estado: pedido.estado_nombre,
          },
          agente: pedido.agente_nombre ? {
            nombre: `${pedido.agente_nombre} ${pedido.agente_apellido}`,
            codigo: pedido.codigoagente,
          } : null,
          items: itemsSurtidos, // Solo productos confirmados
          itemsBackorder: itemsBackorder, // Productos pendientes
        },
      },
    });
  } catch (error) {
    logger.error('Error al obtener datos de remisión:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error al obtener datos de remisión"
    });
  }
};

module.exports = {
  obtenerRemisionPedido
};
