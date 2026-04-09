const db = require('../../db');
const logger = require('../../utils/logger');
const { registrarCambio } = require('../../services/auditService');

/**
 * Obtiene la lista de pedidos con pago por transferencia pendientes de validación
 * @route GET /api/admin/pagos/pendientes
 */
async function getPagosPendientes(req, res) {
  try {
    const tenant_id = req.tenant?.tenant_id || 1;
    
    const query = `
      SELECT 
        p.pedidoid,
        p.clienteid,
        p.fechapedido,
        p.montototal,
        p.estatus,
        p.comprobante_url,
        p.transaccion_id,
        p.metodo_pago,
        p.saldo_pendiente,
        c.nombre,
        c.apellido,
        c.email
      FROM pedidos p
      INNER JOIN clientes c ON c.clienteid = p.clienteid
      WHERE p.pagado = false
        AND p.comprobante_url IS NOT NULL
        AND p.estatus NOT IN ('Cancelado', 'Rechazado')
        AND p.tenant_id = $1
        AND c.tenant_id = $1
      ORDER BY p.fechapedido DESC
    `;

    const { rows } = await db.query(query, [tenant_id]);

    res.json({
      success: true,
      pagos: rows
    });
  } catch (error) {
    logger.error('Error al obtener pagos pendientes:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: 'Error al obtener pagos pendientes'
    });
  }
}

/**
 * Aprueba un pedido con pago por transferencia
 * @route PUT /api/admin/pagos/:pagoId/aprobar
 */
async function aprobarPago(req, res) {
  const client = await db.pool.connect();
  const { pagoId } = req.params;
  const adminId = req.user?.admin_responsable_id ?? req.user?.id;
  const tenant_id = req.tenant?.tenant_id || 1;

  try {
    await client.query('BEGIN');

    const pedidoQuery = await client.query(
      `SELECT 
        p.pedidoid,
        p.clienteid,
        p.montototal,
        p.estatus,
        p.pagado,
        p.metodo_pago,
        c.nombre,
        c.apellido
      FROM pedidos p
      INNER JOIN clientes c ON c.clienteid = p.clienteid
      WHERE p.pedidoid = $1 AND p.tenant_id = $2 AND c.tenant_id = $2`,
      [pagoId, tenant_id]
    );

    if (pedidoQuery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Pedido no encontrado'
      });
    }

    const pedido = pedidoQuery.rows[0];

    if (pedido.pagado) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Este pedido ya fue marcado como pagado'
      });
    }

    await client.query(
      `UPDATE pedidos 
       SET pagado = true,
           estatus = 'Confirmado',
           saldo_pendiente = 0.00
       WHERE pedidoid = $1 AND tenant_id = $2`,
      [pagoId, tenant_id]
    );

    await client.query(
      `INSERT INTO notificaciones (clienteid, tipo, titulo, mensaje, prioridad, url, tenant_id)
       VALUES ($1, 'sistema', 'Pago Aprobado', $2, 'normal', '/mis-pedidos.html', $3)`,
      [
        pedido.clienteid,
        `Tu pago para el pedido #${pagoId} ha sido validado exitosamente.`,
        tenant_id
      ]
    );

    await registrarCambio(
      'pedidos',
      pagoId,
      'UPDATE',
      { estatus: pedido.estatus, pagado: false },
      { 
        estatus: 'Confirmado', 
        pagado: true,
        monto: pedido.montototal, 
        cliente: `${pedido.nombre} ${pedido.apellido}`,
        accion: 'APROBAR_PAGO_TRANSFERENCIA'
      },
      adminId
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Pago aprobado exitosamente. El pedido ha sido confirmado.'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error al aprobar pago:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: 'Error al aprobar pago'
    });
  } finally {
    client.release();
  }
}

/**
 * Rechaza un pedido con pago por transferencia
 * @route PUT /api/admin/pagos/:pagoId/rechazar
 */
async function rechazarPago(req, res) {
  const client = await db.pool.connect();
  const { pagoId } = req.params;
  const { motivo } = req.body;
  const adminId = req.user?.admin_responsable_id ?? req.user?.id;
  const tenant_id = req.tenant?.tenant_id || 1;

  try {
    await client.query('BEGIN');

    const pedidoQuery = await client.query(
      `SELECT 
        p.pedidoid,
        p.clienteid,
        p.montototal,
        p.estatus,
        p.pagado,
        c.nombre,
        c.apellido
      FROM pedidos p
      INNER JOIN clientes c ON c.clienteid = p.clienteid
      WHERE p.pedidoid = $1 AND p.tenant_id = $2 AND c.tenant_id = $2`,
      [pagoId, tenant_id]
    );

    if (pedidoQuery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Pedido no encontrado'
      });
    }

    const pedido = pedidoQuery.rows[0];

    if (pedido.pagado) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Este pedido ya fue marcado como pagado'
      });
    }

    await client.query(
      `UPDATE pedidos 
       SET estatus = 'Rechazado',
           comprobante_url = NULL
       WHERE pedidoid = $1 AND tenant_id = $2`,
      [pagoId, tenant_id]
    );

    const mensajeRechazo = motivo 
      ? `Tu comprobante para el pedido #${pagoId} fue rechazado. Motivo: ${motivo}`
      : `Tu comprobante para el pedido #${pagoId} fue rechazado. Por favor, contacta con soporte.`;

    await client.query(
      `INSERT INTO notificaciones (clienteid, tipo, titulo, mensaje, prioridad, url, tenant_id)
       VALUES ($1, 'sistema', 'Problema con tu pago', $2, 'alta', '/mis-pedidos.html', $3)`,
      [pedido.clienteid, mensajeRechazo, tenant_id]
    );

    await registrarCambio(
      'pedidos',
      pagoId,
      'UPDATE',
      { estatus: pedido.estatus, pagado: false },
      { 
        estatus: 'Rechazado', 
        monto: pedido.montototal, 
        cliente: `${pedido.nombre} ${pedido.apellido}`, 
        motivo,
        accion: 'RECHAZAR_PAGO_TRANSFERENCIA'
      },
      adminId
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Pago rechazado. El pedido ha sido marcado como rechazado.'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error al rechazar pago:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: 'Error al rechazar pago'
    });
  } finally {
    client.release();
  }
}

module.exports = {
  getPagosPendientes,
  aprobarPago,
  rechazarPago
};
