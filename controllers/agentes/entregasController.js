const pool = require('../../db');
const cloudinary = require('../../config/cloudinary');
const fs = require('fs');

/**
 * POST /api/agente/entregas/confirmar
 * Confirma la entrega de un pedido con evidencia fotográfica
 * 
 * Body esperado:
 * {
 *   pedido_id: number,
 *   remision_id: number (opcional),
 *   foto_evidencia: file (multipart/form-data)
 * }
 */
exports.confirmarEntrega = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { pedido_id, remision_id } = req.body;
    const { tenant_id } = req.tenant;
    const agente_id = req.user.userId;

    // Validaciones básicas
    if (!pedido_id) {
      return res.status(400).json({ 
        success: false,
        error: 'Se requiere el ID del pedido' 
      });
    }

    await client.query('BEGIN');

    // 1. Validar que el pedido existe y pertenece al agente
    const pedidoQuery = await client.query(
      `SELECT p.*, c.nombre AS cliente_nombre, c.apellido AS cliente_apellido, c.email AS cliente_email
       FROM pedidos p
       INNER JOIN clientes c ON p.clienteid = c.clienteid
       WHERE p.pedidoid = $1 AND p.agenteid = $2 AND p.tenant_id = $3`,
      [pedido_id, agente_id, tenant_id]
    );

    if (pedidoQuery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        success: false,
        error: 'Pedido no encontrado o no pertenece a este agente' 
      });
    }

    const pedido = pedidoQuery.rows[0];
    const metodoPago = (pedido.metodo_pago || '').toLowerCase();
    const esContraEntrega = metodoPago === 'contra_entrega';

    // 2. Validar que para pedidos de CONTRA_ENTREGA se requiere foto obligatoriamente
    if (esContraEntrega && !req.file) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false,
        error: 'Para pedidos de Pago contra entrega, la foto de la remisión firmada es OBLIGATORIA' 
      });
    }

    // 3. Subir foto a Cloudinary si existe
    let urlEvidencia = null;
    if (req.file) {
      try {
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: 'evidencias_entrega',
          resource_type: 'image'
        });
        urlEvidencia = result.secure_url;

        // Eliminar archivo temporal
        fs.unlink(req.file.path, (err) => {
          if (err) console.error('Error eliminando archivo temporal:', err);
        });
      } catch (uploadError) {
        await client.query('ROLLBACK');
        return res.status(500).json({ 
          success: false,
          error: 'Error al subir la foto de evidencia',
          detalle: uploadError.message 
        });
      }
    }

    // 4. Actualizar el pedido con la evidencia y marcar como entregado
    const fechaEntregaReal = new Date();
    
    await client.query(
      `UPDATE pedidos 
       SET url_evidencia_entrega = $1,
           fecha_entrega_real = $2,
           estatus = 'Entregado'
       WHERE pedidoid = $3 AND tenant_id = $4`,
      [urlEvidencia, fechaEntregaReal, pedido_id, tenant_id]
    );

    // 5. Si es CONTRA_ENTREGA, marcar como pagado automáticamente
    if (esContraEntrega) {
      await client.query(
        `UPDATE pedidos 
         SET pagado = TRUE,
             fecha_pago = $1
         WHERE pedidoid = $2 AND tenant_id = $3`,
        [fechaEntregaReal, pedido_id, tenant_id]
      );
    }

    // 6. Actualizar remisión si se proporcionó
    if (remision_id) {
      await client.query(
        `UPDATE remisiones 
         SET estado = 'ENTREGADA',
             url_evidencia_entrega = $1,
             fecha_entrega = $2
         WHERE remision_id = $3 AND tenant_id = $4`,
        [urlEvidencia, fechaEntregaReal, remision_id, tenant_id]
      );
    }

    // 7. Crear notificación para el cliente
    const mensajeCliente = esContraEntrega 
      ? `Tu pedido #${pedido_id} ha sido entregado y el pago fue recibido por tu agente. ¡Gracias por tu compra!`
      : `Tu pedido #${pedido_id} ha sido entregado exitosamente. ¡Gracias por tu compra!`;

    await client.query(
      `INSERT INTO notificaciones (
         cliente_id,
         tipo,
         titulo,
         mensaje,
         referencia_tipo,
         referencia_id,
         tenant_id
       )
       VALUES ($1, 'PEDIDO_ENTREGADO', $2, $3, 'PEDIDO', $4, $5)`,
      [
        pedido.clienteid,
        '✅ Pedido entregado',
        mensajeCliente,
        pedido_id,
        tenant_id
      ]
    );

    await client.query('COMMIT');

    // 8. Enviar email al cliente (async, no bloquea respuesta)
    if (pedido.cliente_email) {
      const { sendTemplatedEmail } = require('../../services/emailService');
      const frontendUrl = process.env.FRONTEND_BASE_URL || 'http://localhost:3000';
      
      const emailMessage = esContraEntrega
        ? `Tu pedido #${pedido_id} ha sido entregado exitosamente y el pago fue recibido por tu agente de ventas. ¡Gracias por tu preferencia!`
        : `Tu pedido #${pedido_id} ha sido entregado exitosamente. ¡Gracias por tu preferencia!`;

      sendTemplatedEmail(pedido.cliente_email, 'Pedido entregado', {
        title: '✅ Tu pedido ha sido entregado',
        name: pedido.cliente_nombre || 'Cliente',
        message: emailMessage,
        buttonText: 'Ver Mi Pedido',
        buttonUrl: `${frontendUrl}/dashboard?tab=pedidos&pedido=${pedido_id}`,
        additionalInfo: `<strong>Pedido:</strong> #${pedido_id}<br><strong>Fecha de entrega:</strong> ${fechaEntregaReal.toLocaleDateString('es-MX')}`
      }).catch(err => {
        console.error('Error enviando email de confirmación de entrega:', err);
      });
    }

    res.status(200).json({
      success: true,
      message: esContraEntrega 
        ? 'Entrega confirmada y pago registrado exitosamente'
        : 'Entrega confirmada exitosamente',
      data: {
        pedido_id,
        fecha_entrega: fechaEntregaReal,
        url_evidencia: urlEvidencia,
        pagado: esContraEntrega,
        metodo_pago: metodoPago
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al confirmar entrega:', error);
    
    // Eliminar archivo temporal si existe
    if (req.file?.path) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Error eliminando archivo temporal:', err);
      });
    }

    res.status(500).json({ 
      success: false,
      error: 'Error al confirmar entrega',
      detalle: error.message 
    });
  } finally {
    client.release();
  }
};

/**
 * GET /api/agente/entregas/pendientes
 * Obtiene la lista de entregas pendientes del agente
 */
exports.obtenerEntregasPendientes = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;
    const agente_id = req.user.userId;

    const query = await pool.query(
      `SELECT 
        p.pedidoid,
        p.fechapedido,
        p.montototal,
        p.estatus,
        p.metodo_pago,
        p.url_evidencia_entrega,
        c.clienteid,
        c.nombre AS cliente_nombre,
        c.apellido AS cliente_apellido,
        c.telefono AS cliente_telefono,
        cd.calle,
        cd.numeroext,
        cd.colonia,
        cd.ciudad,
        e.nombre AS estado,
        cd.codigopostal,
        r.remision_id,
        r.folio AS remision_folio,
        r.total_remision
       FROM pedidos p
       INNER JOIN clientes c ON p.clienteid = c.clienteid
       LEFT JOIN cliente_direcciones cd ON p.direccionenvioid = cd.direccionid
       LEFT JOIN estados e ON cd.estadoid = e.estadoid
       LEFT JOIN remisiones r ON p.pedidoid = r.pedido_id AND r.estado = 'EMITIDA'
       WHERE p.agenteid = $1 
         AND p.tenant_id = $2
         AND p.estatus IN ('Confirmado', 'Parcial', 'Completado', 'Listo para Pago')
         AND p.url_evidencia_entrega IS NULL
       ORDER BY 
         CASE WHEN p.metodo_pago = 'contra_entrega' THEN 0 ELSE 1 END,
         p.fechapedido DESC`,
      [agente_id, tenant_id]
    );

    res.json({
      success: true,
      data: {
        entregas: query.rows,
        total: query.rows.length
      }
    });

  } catch (error) {
    console.error('Error al obtener entregas pendientes:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error al obtener entregas pendientes',
      detalle: error.message 
    });
  }
};
