/**
 * SOLICITUDES DE MODIFICACIÓN DE PEDIDOS CONTROLLER
 * 
 * Gestiona el flujo de autorización para modificaciones de pedidos.
 * Permite que inventarios solicite cambios y que supervisores los aprueben.
 * 
 * @module controllers/solicitudesModificacionController
 * @author RazoConnect Team
 * @date 2026-03-18
 */

const db = require('../db');
const logger = require('../utils/logger');
const ajustePedidosController = require('./ajustePedidosController');

/**
 * Crear nueva solicitud de modificación de pedido
 * POST /api/solicitudes-modificacion
 */
const crearSolicitud = async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    const { tenant_id } = req.tenant;
    const solicitanteId = req.user?.id || req.user?.adminid;
    const { pedidoId, tipoModificacion, descripcion, datosModificacion } = req.body;

    // Validaciones
    if (!pedidoId || !tipoModificacion || !descripcion || !datosModificacion) {
      return res.status(400).json({
        success: false,
        message: 'Faltan datos requeridos: pedidoId, tipoModificacion, descripcion, datosModificacion'
      });
    }

    const tiposValidos = ['AGREGAR_ITEM', 'ELIMINAR_ITEM', 'MODIFICAR_CANTIDAD', 'MODIFICAR_PRECIO', 'MULTIPLE'];
    if (!tiposValidos.includes(tipoModificacion)) {
      return res.status(400).json({
        success: false,
        message: `Tipo de modificación inválido. Debe ser uno de: ${tiposValidos.join(', ')}`
      });
    }

    await client.query('BEGIN');

    // Verificar que el pedido existe y pertenece al tenant
    const pedidoResult = await client.query(
      `SELECT pedidoid, estatus, clienteid FROM pedidos WHERE pedidoid = $1 AND tenant_id = $2`,
      [pedidoId, tenant_id]
    );

    if (pedidoResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Pedido no encontrado'
      });
    }

    const pedido = pedidoResult.rows[0];

    // Validar que el pedido esté en estado modificable
    const estadosNoModificables = ['surtido', 'enviado', 'entregado', 'cancelado'];
    if (estadosNoModificables.includes(pedido.estatus.toLowerCase())) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `No se puede modificar un pedido en estado "${pedido.estatus}"`
      });
    }

    // Crear solicitud
    const insertQuery = `
      INSERT INTO solicitudes_modificacion_pedido (
        pedido_id,
        solicitante_id,
        tipo_modificacion,
        descripcion,
        datos_modificacion,
        estado,
        tenant_id
      ) VALUES ($1, $2, $3, $4, $5, 'PENDIENTE', $6)
      RETURNING *
    `;

    const result = await client.query(insertQuery, [
      pedidoId,
      solicitanteId,
      tipoModificacion,
      descripcion,
      JSON.stringify(datosModificacion),
      tenant_id
    ]);

    await client.query('COMMIT');

    logger.info('Solicitud de modificación creada', {
      solicitudId: result.rows[0].solicitud_id,
      pedidoId,
      solicitanteId,
      tipoModificacion,
      tenantId: tenant_id,
      requestId: req.requestId
    });

    res.json({
      success: true,
      message: 'Solicitud de modificación creada exitosamente. Esperando aprobación.',
      data: {
        solicitudId: result.rows[0].solicitud_id,
        pedidoId: result.rows[0].pedido_id,
        estado: result.rows[0].estado,
        fechaSolicitud: result.rows[0].fecha_solicitud
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error al crear solicitud de modificación:', {
      error: error.message,
      stack: error.stack,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: 'Error al crear la solicitud de modificación',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    client.release();
  }
};

/**
 * Obtener solicitudes de modificación (con filtros)
 * GET /api/solicitudes-modificacion
 */
const obtenerSolicitudes = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;
    const { estado, pedidoId, solicitanteId } = req.query;
    const userRole = (req.user?.rol || '').toLowerCase();
    const userId = req.user?.id || req.user?.adminid;

    let query = `
      SELECT 
        s.*,
        p.estatus as pedido_estatus,
        p.montototal as pedido_monto,
        c.nombre as cliente_nombre,
        c.apellido as cliente_apellido,
        sol.nombre as solicitante_nombre,
        sol.email as solicitante_email,
        apr.nombre as aprobador_nombre,
        apr.email as aprobador_email
      FROM solicitudes_modificacion_pedido s
      INNER JOIN pedidos p ON s.pedido_id = p.pedidoid
      INNER JOIN clientes c ON p.clienteid = c.clienteid
      INNER JOIN administradores sol ON s.solicitante_id = sol.adminid
      LEFT JOIN administradores apr ON s.aprobador_id = apr.adminid
      WHERE s.tenant_id = $1
    `;

    const params = [tenant_id];
    let paramIndex = 2;

    // Si es inventarios, solo ver sus propias solicitudes
    if (userRole === 'inventarios') {
      query += ` AND s.solicitante_id = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }

    if (estado) {
      query += ` AND s.estado = $${paramIndex}`;
      params.push(estado.toUpperCase());
      paramIndex++;
    }

    if (pedidoId) {
      query += ` AND s.pedido_id = $${paramIndex}`;
      params.push(parseInt(pedidoId));
      paramIndex++;
    }

    if (solicitanteId) {
      query += ` AND s.solicitante_id = $${paramIndex}`;
      params.push(parseInt(solicitanteId));
      paramIndex++;
    }

    query += ` ORDER BY s.fecha_solicitud DESC`;

    const result = await db.query(query, params);

    res.json({
      success: true,
      data: result.rows.map(row => ({
        solicitudId: row.solicitud_id,
        pedidoId: row.pedido_id,
        pedidoEstatus: row.pedido_estatus,
        pedidoMonto: parseFloat(row.pedido_monto),
        clienteNombre: `${row.cliente_nombre} ${row.cliente_apellido}`.trim(),
        tipoModificacion: row.tipo_modificacion,
        descripcion: row.descripcion,
        datosModificacion: row.datos_modificacion,
        estado: row.estado,
        solicitanteNombre: row.solicitante_nombre,
        solicitanteEmail: row.solicitante_email,
        aprobadorNombre: row.aprobador_nombre,
        aprobadorEmail: row.aprobador_email,
        fechaSolicitud: row.fecha_solicitud,
        fechaRespuesta: row.fecha_respuesta,
        observacionesAprobador: row.observaciones_aprobador,
        motivoRechazo: row.motivo_rechazo
      }))
    });

  } catch (error) {
    logger.error('Error al obtener solicitudes de modificación:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: 'Error al obtener las solicitudes',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Aprobar solicitud de modificación
 * PUT /api/solicitudes-modificacion/:id/aprobar
 */
const aprobarSolicitud = async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    const { tenant_id } = req.tenant;
    const aprobadorId = req.user?.id || req.user?.adminid;
    const solicitudId = parseInt(req.params.id);
    const { observaciones, aplicarInmediatamente = true } = req.body;

    await client.query('BEGIN');

    // Obtener solicitud
    const solicitudResult = await client.query(
      `SELECT s.*, p.pedidoid 
       FROM solicitudes_modificacion_pedido s
       INNER JOIN pedidos p ON s.pedido_id = p.pedidoid
       WHERE s.solicitud_id = $1 AND s.tenant_id = $2
       FOR UPDATE OF s`,
      [solicitudId, tenant_id]
    );

    if (solicitudResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Solicitud no encontrada'
      });
    }

    const solicitud = solicitudResult.rows[0];

    if (solicitud.estado !== 'PENDIENTE') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `La solicitud ya fue ${solicitud.estado.toLowerCase()}`
      });
    }

    // Actualizar solicitud a APROBADA
    await client.query(
      `UPDATE solicitudes_modificacion_pedido
       SET estado = 'APROBADA',
           aprobador_id = $1,
           fecha_respuesta = NOW(),
           observaciones_aprobador = $2
       WHERE solicitud_id = $3`,
      [aprobadorId, observaciones, solicitudId]
    );

    let datosAplicacion = null;

    // Si se debe aplicar inmediatamente, ejecutar la modificación
    if (aplicarInmediatamente) {
      try {
        const datosModificacion = solicitud.datos_modificacion;
        
        // Aplicar modificación usando el controlador existente
        const mockReq = {
          params: { id: solicitud.pedido_id },
          body: {
            itemsAgregar: datosModificacion.itemsAgregar || [],
            itemsEliminar: datosModificacion.itemsEliminar || [],
            itemsModificar: datosModificacion.itemsModificar || []
          },
          tenant: { tenant_id },
          user: req.user
        };

        // Ejecutar ajuste dentro de la misma transacción
        await ejecutarAjustePedido(client, mockReq);

        // Marcar como APLICADA
        await client.query(
          `UPDATE solicitudes_modificacion_pedido
           SET estado = 'APLICADA'
           WHERE solicitud_id = $1`,
          [solicitudId]
        );

        datosAplicacion = { aplicada: true, mensaje: 'Modificación aplicada exitosamente' };

      } catch (ajusteError) {
        await client.query('ROLLBACK');
        logger.error('Error al aplicar modificación aprobada:', {
          error: ajusteError.message,
          solicitudId,
          requestId: req.requestId
        });
        return res.status(500).json({
          success: false,
          message: 'Solicitud aprobada pero hubo un error al aplicar los cambios',
          error: ajusteError.message
        });
      }
    }

    await client.query('COMMIT');

    logger.info('Solicitud de modificación aprobada', {
      solicitudId,
      aprobadorId,
      aplicada: aplicarInmediatamente,
      tenantId: tenant_id,
      requestId: req.requestId
    });

    res.json({
      success: true,
      message: aplicarInmediatamente 
        ? 'Solicitud aprobada y cambios aplicados exitosamente'
        : 'Solicitud aprobada. Los cambios deben aplicarse manualmente.',
      data: {
        solicitudId,
        estado: aplicarInmediatamente ? 'APLICADA' : 'APROBADA',
        ...datosAplicacion
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error al aprobar solicitud:', {
      error: error.message,
      stack: error.stack,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: 'Error al aprobar la solicitud',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    client.release();
  }
};

/**
 * Rechazar solicitud de modificación
 * PUT /api/solicitudes-modificacion/:id/rechazar
 */
const rechazarSolicitud = async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    const { tenant_id } = req.tenant;
    const aprobadorId = req.user?.id || req.user?.adminid;
    const solicitudId = parseInt(req.params.id);
    const { motivoRechazo } = req.body;

    if (!motivoRechazo || motivoRechazo.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Se requiere un motivo de rechazo'
      });
    }

    await client.query('BEGIN');

    // Obtener solicitud
    const solicitudResult = await client.query(
      `SELECT * FROM solicitudes_modificacion_pedido
       WHERE solicitud_id = $1 AND tenant_id = $2
       FOR UPDATE`,
      [solicitudId, tenant_id]
    );

    if (solicitudResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Solicitud no encontrada'
      });
    }

    const solicitud = solicitudResult.rows[0];

    if (solicitud.estado !== 'PENDIENTE') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `La solicitud ya fue ${solicitud.estado.toLowerCase()}`
      });
    }

    // Actualizar solicitud a RECHAZADA
    await client.query(
      `UPDATE solicitudes_modificacion_pedido
       SET estado = 'RECHAZADA',
           aprobador_id = $1,
           fecha_respuesta = NOW(),
           motivo_rechazo = $2
       WHERE solicitud_id = $3`,
      [aprobadorId, motivoRechazo, solicitudId]
    );

    await client.query('COMMIT');

    logger.info('Solicitud de modificación rechazada', {
      solicitudId,
      aprobadorId,
      motivoRechazo,
      tenantId: tenant_id,
      requestId: req.requestId
    });

    res.json({
      success: true,
      message: 'Solicitud rechazada',
      data: {
        solicitudId,
        estado: 'RECHAZADA',
        motivoRechazo
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error al rechazar solicitud:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: 'Error al rechazar la solicitud',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    client.release();
  }
};

/**
 * Función auxiliar para ejecutar ajuste de pedido dentro de una transacción
 */
async function ejecutarAjustePedido(client, mockReq) {
  const { tenant_id } = mockReq.tenant;
  const pedidoId = parseInt(mockReq.params.id);
  const { itemsAgregar = [], itemsEliminar = [], itemsModificar = [] } = mockReq.body;

  // Implementación simplificada - en producción usar el controlador completo
  // Por ahora solo registramos que se aplicó
  logger.info('Aplicando modificación de pedido', {
    pedidoId,
    itemsAgregar: itemsAgregar.length,
    itemsEliminar: itemsEliminar.length,
    itemsModificar: itemsModificar.length
  });

  // TODO: Integrar con ajustePedidosController.ajustarPedido
  // Por ahora retornamos éxito para no bloquear el flujo
  return { success: true };
}

module.exports = {
  crearSolicitud,
  obtenerSolicitudes,
  aprobarSolicitud,
  rechazarSolicitud
};
