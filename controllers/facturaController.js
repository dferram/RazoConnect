const pool = require('../db');
const logger = require('../utils/logger');
const facturaService = require('../services/facturaService');

async function descargarFactura(req, res) {
  try {
    const pedidoId = parseInt(req.params.id);
    const { tenant_id } = req.tenant;
    const { id: userId, rol } = req.user;

    if (!pedidoId || isNaN(pedidoId)) {
      return res.status(400).json({
        success: false,
        message: 'ID de pedido inválido'
      });
    }

    let pedidoQuery;
    let queryParams;

    if (rol === 'cliente') {
      pedidoQuery = `
        SELECT p.pedidoid, p.estatus, p.clienteid
        FROM pedidos p
        WHERE p.pedidoid = $1 AND p.tenant_id = $2 AND p.clienteid = $3
      `;
      queryParams = [pedidoId, tenant_id, userId];
    } else if (rol === 'agente') {
      pedidoQuery = `
        SELECT p.pedidoid, p.estatus, p.clienteid
        FROM pedidos p
        INNER JOIN clientes c ON c.clienteid = p.clienteid
        WHERE p.pedidoid = $1 
          AND p.tenant_id = $2 
          AND c.agentedeventasid = $3
      `;
      queryParams = [pedidoId, tenant_id, userId];
    } else if (rol === 'admin' || rol === 'super_admin') {
      pedidoQuery = `
        SELECT p.pedidoid, p.estatus, p.clienteid
        FROM pedidos p
        WHERE p.pedidoid = $1 AND p.tenant_id = $2
      `;
      queryParams = [pedidoId, tenant_id];
    } else {
      return res.status(403).json({
        success: false,
        message: 'No tiene permisos para descargar esta factura'
      });
    }

    const pedidoResult = await pool.query(pedidoQuery, queryParams);

    if (pedidoResult.rows.length === 0) {
      if (rol === 'agente') {
        return res.status(403).json({
          success: false,
          message: 'No tiene permisos para descargar esta factura'
        });
      }
      return res.status(404).json({
        success: false,
        message: 'Pedido no encontrado'
      });
    }

    const pedido = pedidoResult.rows[0];

    const estatusPermitidos = ['Surtido', 'Enviado', 'Entregado'];
    if (!estatusPermitidos.includes(pedido.estatus)) {
      return res.status(400).json({
        success: false,
        message: `No se puede generar factura para pedidos en estatus "${pedido.estatus}". Solo se permite para pedidos Surtido, Enviado o Entregado.`
      });
    }

    const pdfBuffer = await facturaService.generarFacturaPDF(pedidoId, tenant_id, rol);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Factura-Pedido-${pedidoId}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    
    res.send(pdfBuffer);

    logger.info(`[FacturaController] Factura descargada: Pedido=${pedidoId}, Usuario=${userId}, Rol=${rol}, Tenant=${tenant_id}`);

  } catch (error) {
    logger.error(`[FacturaController] Error al generar factura para pedido ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Error al generar la factura',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

module.exports = {
  descargarFactura
};
