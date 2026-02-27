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
        dp.preciounitario,
        dp.piezastotales,
        pv.sku,
        pv.dimensiones,
        pv.stock AS stock_real_variante,
        prod.nombreproducto,
        t.etiqueta as tamano_etiqueta,
        t.valor as tamano_valor
      FROM detallesdelpedido dp
      INNER JOIN producto_variantes pv ON pv.varianteid = dp.varianteid
      INNER JOIN productos prod ON prod.productoid = pv.productoid
      LEFT JOIN cat_tamanopaquetes t ON t.tamanoid = dp.tamanoid AND t.tenant_id = dp.tenant_id
      WHERE dp.pedidoid = $1
      ORDER BY dp.detalleid ASC
    `;

    const detallesResult = await db.query(detallesQuery, [pedidoId]);

    const items = detallesResult.rows.map((item) => ({
      sku: item.sku,
      nombreProducto: item.nombreproducto,
      dimensiones: item.dimensiones,
      tamano: item.tamano_etiqueta || 'N/A',
      cantidad: parseInt(item.cantidadpaquetes, 10),
      precioUnitario: parseFloat(item.preciounitario),
      piezasTotales: item.piezastotales,
      stockReal: parseInt(item.stock_real_variante || 0, 10),
      subtotal: parseFloat(
        (parseInt(item.cantidadpaquetes, 10) * 
         (item.tamano_valor || 1) * 
         parseFloat(item.preciounitario)).toFixed(2)
      ),
    }));

    res.json({
      success: true,
      data: {
        pedido: {
          pedidoId: pedido.pedidoid,
          fechaPedido: pedido.fechapedido,
          montoTotal: parseFloat(pedido.montototal),
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
          items,
        },
      },
    });
  } catch (error) {
    console.error("Error al obtener datos de remisión:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener datos de remisión",
      error: error.message,
    });
  }
};

module.exports = {
  obtenerRemisionPedido
};
