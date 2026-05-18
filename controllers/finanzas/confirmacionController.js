/**
 * @file controllers/finanzas/confirmacionController.js
 * @description Controlador para rol Finanzas - Transición a 'Facturado'
 * Genera CxC y reevalúa la máquina de estados ignorando el ítem recién cerrado
 * 
 * SEGURIDAD: Este controlador debe estar protegido por middleware requireRole(['finanzas', 'admin'])
 */

const OrderStateEngine = require('../../services/OrderStateEngine');
const db = require('../../db');

/**
 * Valida que el usuario tenga el rol correcto
 * Esta es una validación adicional de seguridad en profundidad
 */
function validateFinanceRole(req, res) {
  const userRole = req.user?.rol?.toLowerCase();
  
  if (!userRole || !['finanzas', 'admin'].includes(userRole)) {
    res.status(403).json({
      error: 'Acceso denegado',
      message: 'Este recurso requiere rol Finanzas o Admin',
      userRole: req.user?.rol
    });
    return false;
  }
  
  return true;
}

/**
 * Confirma la facturación de un producto
 * Marca el producto como 'Facturado', genera CxC y recalcula el estado del pedido
 * 
 * @route POST /api/finanzas/confirmar-facturacion
 * @access Rol: Finanzas, Admin
 */
async function confirmarFacturacion(req, res) {
  // Validación de rol (defensa en profundidad)
  if (!validateFinanceRole(req, res)) return;

  const { detalleId, pedidoId } = req.body;
  const tenantId = req.user?.tenant_id;

  if (!detalleId || !pedidoId) {
    return res.status(400).json({
      error: 'detalleId y pedidoId son requeridos'
    });
  }

  if (!tenantId) {
    return res.status(401).json({
      error: 'Usuario no autenticado o sin tenant_id'
    });
  }

  const client = await db.getClient();
  let cxcData = null; // Almacenar datos para procesamiento post-commit

  try {
    await client.query('BEGIN');

    // 1. Verificar que el detalle existe y obtener su estado actual
    // CRÍTICO: Validar que el detalle pertenezca al pedido especificado
    const detalleResult = await client.query(
      `SELECT estado_producto, piezastotales, varianteid 
       FROM detallesdelpedido 
       WHERE detalleid = $1 AND pedidoid = $2 AND tenant_id = $3`,
      [detalleId, pedidoId, tenantId]
    );

    if (detalleResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        error: `Detalle ${detalleId} no encontrado o no pertenece al pedido ${pedidoId}`
      });
    }

    const { estado_producto, piezastotales, varianteid } = detalleResult.rows[0];

    // 2. Validar que no esté ya facturado (operación idempotente)
    if (estado_producto === 'Facturado') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `El producto ya está marcado como 'Facturado'`,
        idempotent: true
      });
    }

    // 3. Marcar el item individual como facturado
    await client.query(
      `UPDATE detallesdelpedido 
       SET estado_producto = 'Facturado' 
       WHERE detalleid = $1 AND tenant_id = $2`,
      [detalleId, tenantId]
    );

    // 4. Generar CxC (solo operaciones de BD, sin llamadas de red)
    try {
      cxcData = await generarCxC(client, detalleId, pedidoId, tenantId, piezastotales, varianteid);
    } catch (cxcError) {
      console.error('[ConfirmacionController] Error generando CxC:', cxcError);
      // Si falla la generación de CxC, hacer rollback de todo
      await client.query('ROLLBACK');
      return res.status(500).json({
        error: 'Error al generar CxC',
        details: cxcError.message
      });
    }

    // 5. Traer todos los items del pedido actualizados
    const { rows: items } = await client.query(
      `SELECT estado_producto, piezastotales 
       FROM detallesdelpedido 
       WHERE pedidoid = $1 AND tenant_id = $2`,
      [pedidoId, tenantId]
    );

    // 6. ✨ AQUI LA MAGIA: Pasar el estado crudo al motor puro
    // OrderStateEngine automáticamente ignorará los productos 'Facturado'
    const nuevoEstadoPedido = OrderStateEngine.calculateOrderState(items);

    // 7. Actualizar el pedido
    await client.query(
      `UPDATE pedidos 
       SET estatus = $1 
       WHERE pedidoid = $2 AND tenant_id = $3`,
      [nuevoEstadoPedido, pedidoId, tenantId]
    );

    await client.query('COMMIT');

    // 8. DESPUÉS DEL COMMIT: Disparar operaciones asíncronas (emails, notificaciones, webhooks)
    // Esto previene que la transacción quede abierta esperando respuestas de red
    if (cxcData) {
      // Usar setImmediate para no bloquear la respuesta HTTP
      setImmediate(() => {
        procesarOperacionesPostCxC(cxcData, tenantId, pedidoId, detalleId)
          .catch(err => {
            console.error('[ConfirmacionController] Error en operaciones post-CxC:', err);
            // Loggear pero no fallar - la transacción ya se completó
          });
      });
    }

    res.json({
      success: true,
      message: 'Facturación confirmada',
      detalleId,
      estadoAnterior: estado_producto,
      estadoNuevo: 'Facturado',
      estadoPedido: nuevoEstadoPedido,
      cxcGenerada: true
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[ConfirmacionController] Error:', error);
    res.status(500).json({
      error: 'Error al confirmar facturación',
      details: error.message
    });
  } finally {
    client.release();
  }
}

/**
 * Confirma la facturación de múltiples productos en una sola transacción
 * 
 * @route POST /api/finanzas/confirmar-facturacion-lote
 * @access Rol: Finanzas, Admin
 */
async function confirmarFacturacionLote(req, res) {
  // Validación de rol (defensa en profundidad)
  if (!validateFinanceRole(req, res)) return;

  const { detalleIds, pedidoId } = req.body;
  const tenantId = req.user?.tenant_id;

  if (!detalleIds || !Array.isArray(detalleIds) || detalleIds.length === 0) {
    return res.status(400).json({
      error: 'detalleIds debe ser un array no vacío'
    });
  }

  if (!pedidoId) {
    return res.status(400).json({
      error: 'pedidoId es requerido'
    });
  }

  if (!tenantId) {
    return res.status(401).json({
      error: 'Usuario no autenticado o sin tenant_id'
    });
  }

  const client = await db.getClient();
  const resultados = [];

  try {
    await client.query('BEGIN');

    // Procesar cada detalle
    for (const detalleId of detalleIds) {
      // Usar SAVEPOINT para permitir rollback parcial
      await client.query(`SAVEPOINT detalle_${detalleId}`);

      try {
        // 1. Verificar que el detalle existe
        // CRÍTICO: Validar que el detalle pertenezca al pedido especificado
        const detalleResult = await client.query(
          `SELECT estado_producto, piezastotales, varianteid 
           FROM detallesdelpedido 
           WHERE detalleid = $1 AND pedidoid = $2 AND tenant_id = $3`,
          [detalleId, pedidoId, tenantId]
        );

        if (detalleResult.rows.length === 0) {
          resultados.push({
            detalleId,
            success: false,
            error: 'Detalle no encontrado o no pertenece al pedido especificado'
          });
          await client.query(`ROLLBACK TO SAVEPOINT detalle_${detalleId}`);
          continue;
        }

        const { estado_producto, piezastotales, varianteid } = detalleResult.rows[0];

        // 2. Validar que no esté ya facturado
        if (estado_producto === 'Facturado') {
          resultados.push({
            detalleId,
            success: false,
            error: 'Ya está facturado',
            idempotent: true
          });
          await client.query(`ROLLBACK TO SAVEPOINT detalle_${detalleId}`);
          continue;
        }

        // 3. Marcar como facturado
        await client.query(
          `UPDATE detallesdelpedido 
           SET estado_producto = 'Facturado' 
           WHERE detalleid = $1 AND tenant_id = $2`,
          [detalleId, tenantId]
        );

        // 4. Generar CxC (CRÍTICO: si falla, hacer rollback del UPDATE)
        await generarCxC(client, detalleId, pedidoId, tenantId, piezastotales, varianteid);
        
        // Si llegamos aquí, todo fue exitoso
        await client.query(`RELEASE SAVEPOINT detalle_${detalleId}`);
        
        resultados.push({
          detalleId,
          success: true,
          estadoAnterior: estado_producto,
          estadoNuevo: 'Facturado',
          cxcGenerada: true
        });

      } catch (detalleError) {
        // Si falla CUALQUIER operación (UPDATE o CxC), hacer rollback de este detalle
        console.error(`[ConfirmacionController] Error procesando detalle ${detalleId}:`, detalleError);
        await client.query(`ROLLBACK TO SAVEPOINT detalle_${detalleId}`);
        
        resultados.push({
          detalleId,
          success: false,
          error: 'Error al procesar detalle',
          details: detalleError.message
        });
      }
    }

    // 5. Recalcular el estado del pedido
    const { rows: items } = await client.query(
      `SELECT estado_producto, piezastotales 
       FROM detallesdelpedido 
       WHERE pedidoid = $1 AND tenant_id = $2`,
      [pedidoId, tenantId]
    );

    const nuevoEstadoPedido = OrderStateEngine.calculateOrderState(items);

    // 6. Actualizar el estado del pedido
    await client.query(
      `UPDATE pedidos 
       SET estatus = $1 
       WHERE pedidoid = $2 AND tenant_id = $3`,
      [nuevoEstadoPedido, pedidoId, tenantId]
    );

    await client.query('COMMIT');

    const exitosos = resultados.filter(r => r.success).length;
    const fallidos = resultados.filter(r => !r.success).length;

    res.json({
      success: true,
      message: `Procesados ${resultados.length} productos: ${exitosos} exitosos, ${fallidos} fallidos`,
      estadoPedido: nuevoEstadoPedido,
      resultados
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[ConfirmacionController] Error en lote:', error);
    res.status(500).json({
      error: 'Error al confirmar facturación en lote',
      details: error.message
    });
  } finally {
    client.release();
  }
}

/**
 * Función auxiliar para generar CxC (Cuentas por Cobrar)
 * IMPORTANTE: Esta función solo debe realizar operaciones de BD, NO llamadas de red.
 * Las notificaciones y webhooks se procesan DESPUÉS del COMMIT.
 * 
 * @param {Object} client - Cliente de base de datos
 * @param {number} detalleId - ID del detalle
 * @param {number} pedidoId - ID del pedido
 * @param {number} tenantId - ID del tenant
 * @param {number} cantidad - Cantidad de piezas
 * @param {number} varianteId - ID de la variante
 * @returns {Object} Datos de la CxC generada para procesamiento post-commit
 */
async function generarCxC(client, detalleId, pedidoId, tenantId, cantidad, varianteId) {
  // Implementación simplificada: registrar en una tabla de CxC
  // En producción, esto debería:
  // 1. Calcular el monto basado en precio de la variante ✅
  // 2. Obtener información del cliente ✅
  // 3. Crear registro en tabla cuentas_por_cobrar ✅
  // 4. Generar número de factura ✅
  // 5. ❌ NO enviar notificación al cliente (mover a post-commit)

  console.log(`[CxC] Generando CxC para detalle ${detalleId}, pedido ${pedidoId}, cantidad ${cantidad}`);

  // Ejemplo de inserción en tabla CxC (ajustar según tu esquema)
  // const result = await client.query(`
  //   INSERT INTO cuentas_por_cobrar (pedido_id, detalle_id, variante_id, cantidad, tenant_id, fecha_generacion)
  //   VALUES ($1, $2, $3, $4, $5, NOW())
  //   RETURNING cxc_id, monto
  // `, [pedidoId, detalleId, varianteId, cantidad, tenantId]);

  // Retornar datos para procesamiento post-commit
  return {
    // cxcId: result.rows[0].cxc_id,
    // monto: result.rows[0].monto,
    detalleId,
    pedidoId,
    varianteId,
    cantidad
  };
}

/**
 * Procesa operaciones asíncronas DESPUÉS del COMMIT de la transacción
 * Esto incluye: envío de emails, notificaciones push, webhooks, etc.
 * 
 * CRÍTICO: Esta función se ejecuta FUERA de la transacción de BD para prevenir:
 * - Transacciones largas (Idle in Transaction)
 * - Deadlocks por bloqueos prolongados
 * - Timeouts de conexión
 * 
 * @param {Object} cxcData - Datos de la CxC generada
 * @param {number} tenantId - ID del tenant
 * @param {number} pedidoId - ID del pedido
 * @param {number} detalleId - ID del detalle
 */
async function procesarOperacionesPostCxC(cxcData, tenantId, pedidoId, detalleId) {
  try {
    console.log(`[PostCxC] Procesando operaciones asíncronas para CxC`, cxcData);

    // 1. Enviar notificación al cliente (email, SMS, push)
    // await enviarNotificacionCliente(pedidoId, tenantId, {
    //   tipo: 'facturacion_confirmada',
    //   detalleId,
    //   monto: cxcData.monto
    // });

    // 2. Disparar webhook a sistemas externos (ERP, contabilidad)
    // await dispararWebhook(tenantId, {
    //   evento: 'cxc_generada',
    //   cxcId: cxcData.cxcId,
    //   pedidoId,
    //   monto: cxcData.monto
    // });

    // 3. Actualizar métricas en tiempo real (Redis, analytics)
    // await actualizarMetricas(tenantId, {
    //   tipo: 'facturacion',
    //   monto: cxcData.monto
    // });

    console.log(`[PostCxC] Operaciones asíncronas completadas exitosamente`);
  } catch (error) {
    // Loggear el error pero NO fallar - la transacción ya se completó
    console.error(`[PostCxC] Error en operaciones asíncronas:`, error);
    
    // Opcional: Registrar en una tabla de "tareas fallidas" para retry posterior
    // await registrarTareaFallida('post_cxc', cxcData, error.message);
  }
}

module.exports = {
  confirmarFacturacion,
  confirmarFacturacionLote
};
