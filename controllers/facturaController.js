const pool = require('../db');
const logger = require('../utils/logger');
const facturaService = require('../services/facturaService');

async function descargarFactura(req, res) {
  try {
    const pedidoId = parseInt(req.params.id);
    const { tenant_id } = req.tenant;
    const { id: userId, rol } = req.user;

    // Log de diagnóstico para confirmar que el rol llega correctamente
    logger.info('[FacturaController] Request recibida', {
      pedidoId,
      userId,
      rol,
      tenant_id,
      requestId: req.requestId
    });

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
    } else if (['admin', 'super_admin', 'superadmin', 'finanzas', 'gerente_finanzas', 'inventarios', 'gerente_comercial'].includes(rol)) {
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

    // Verificar que el pedido tiene productos confirmados por finanzas (cantidadsurtida > 0)
    const productosSurtidosQuery = await pool.query(
      `SELECT COUNT(*) as total_surtido
       FROM detallesdelpedido
       WHERE pedidoid = $1 AND tenant_id = $2 AND cantidadsurtida > 0`,
      [pedidoId, tenant_id]
    );

    const totalSurtido = parseInt(productosSurtidosQuery.rows[0]?.total_surtido || 0);

    if (totalSurtido === 0) {
      return res.status(400).json({
        success: false,
        message: 'No se puede generar factura. El pedido debe tener al menos un producto confirmado por finanzas.'
      });
    }

    // Validación adicional de estatus del pedido
    const estatusPermitidos = ['Surtido', 'Completado', 'Enviado', 'Entregado', 'Parcial', 'Pendiente de Confirmación'];
    if (!estatusPermitidos.includes(pedido.estatus)) {
      return res.status(400).json({
        success: false,
        message: `No se puede generar factura para pedidos en estatus "${pedido.estatus}". Solo se permite para pedidos con productos confirmados.`
      });
    }

    // BUG FIX 2: Add timeout to prevent indefinite 'Procesando' state
    const FACTURA_TIMEOUT = 30000; // 30 seconds
    let pdfBuffer;
    
    try {
      pdfBuffer = await Promise.race([
        facturaService.generarFacturaPDF(pedidoId, tenant_id, rol),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout: La generación de factura excedió el tiempo límite de 30 segundos')), FACTURA_TIMEOUT)
        )
      ]);
    } catch (timeoutError) {
      logger.error(`[FacturaController] Timeout al generar factura para pedido ${pedidoId}:`, {
        error: timeoutError.message,
        pedidoId,
        tenant_id,
        requestId: req.requestId
      });
      
      // Registrar el error en la base de datos para retry manual
      try {
        await pool.query(
          `INSERT INTO facturas_errores (pedido_id, error_mensaje, tenant_id, fecha_error)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (pedido_id, tenant_id) 
           DO UPDATE SET error_mensaje = $2, fecha_error = NOW(), intentos = facturas_errores.intentos + 1`,
          [pedidoId, timeoutError.message, tenant_id]
        );
      } catch (dbError) {
        logger.error('[FacturaController] Error al registrar fallo de factura:', dbError);
      }
      
      return res.status(504).json({
        success: false,
        message: 'La generación de factura está tardando más de lo esperado. Por favor intente nuevamente en unos momentos.',
        error: 'TIMEOUT',
        pedidoId
      });
    }

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
