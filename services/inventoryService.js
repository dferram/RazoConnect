const SmartStockService = require('./SmartStockService');

function createServiceError(message, status = 500, code = "INVENTORY_SERVICE_ERROR") {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

/**
 * Registrar movimiento de inventario usando SmartStockService
 * ✅ REFACTORIZADO: Ahora usa SmartStockService.adjustStock para registrar en stock_admin
 * ✅ TRAZABILIDAD: Registra el origen del movimiento (orden de compra, auditoría, ajuste manual)
 * 
 * @param {Object} client - Cliente de transacción PostgreSQL
 * @param {Object} params - Parámetros del movimiento
 * @param {number} params.varianteId - ID de la variante
 * @param {number} params.cantidadDelta - Cantidad a ajustar (positivo=entrada, negativo=salida)
 * @param {string} params.motivo - Motivo del movimiento
 * @param {number} params.usuarioId - ID del usuario que registra el movimiento
 * @param {boolean} params.esExcepcion - Si es una excepción
 * @param {number} params.tenantId - ID del tenant (requerido para SmartStockService)
 * @param {Array<string>} params.userRole - Roles del usuario (requerido para SmartStockService)
 * @param {string} params.tipoOrigen - Tipo de origen: ORDEN_COMPRA, AUDITORIA, AJUSTE_MANUAL, MERMA, ADICION, VENTA, DEVOLUCION
 * @param {number} params.ordenCompraId - ID de la orden de compra (si aplica)
 * @param {number} params.sesionAuditoriaId - ID de la sesión de auditoría (si aplica)
 * @param {number} params.ajusteId - ID del ajuste manual (si aplica)
 * @returns {Promise<{stockAnterior: number, stockNuevo: number}>}
 */
async function registrarMovimiento(
  client,
  { 
    varianteId, 
    cantidadDelta, 
    motivo, 
    usuarioId, 
    esExcepcion, 
    tenantId, 
    userRole,
    tipoOrigen = null,
    ordenCompraId = null,
    sesionAuditoriaId = null,
    ajusteId = null
  }
) {
  const id = Number.parseInt(varianteId, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw createServiceError("varianteId inválido", 400, "VARIANTE_ID_INVALIDO");
  }

  const delta = Number.parseInt(cantidadDelta, 10);
  if (!Number.isInteger(delta) || delta === 0) {
    throw createServiceError(
      "cantidadDelta inválida",
      400,
      "CANTIDAD_DELTA_INVALIDA"
    );
  }

  const motivoNormalizado = (motivo || "").toString().trim();
  if (!motivoNormalizado) {
    throw createServiceError("motivo es requerido", 400, "MOTIVO_REQUERIDO");
  }

  const userIdParsed = Number.parseInt(usuarioId, 10);
  const userId = Number.isInteger(userIdParsed) ? userIdParsed : null;

  if (!userId) {
    throw createServiceError("usuarioId es requerido", 400, "USUARIO_ID_REQUERIDO");
  }

  // ✅ SMART STOCK: Obtener stock actual antes del ajuste
  let stockAnterior = 0;
  try {
    stockAnterior = await SmartStockService.getStock({
      varianteId: id,
      userId,
      userRole: userRole || ['admin'],
      tenantId: tenantId || 1
    });
  } catch (error) {
    console.error('[inventoryService] Error al obtener stock previo:', error);
  }

  // ✅ SMART STOCK: Aplicar ajuste usando SmartStockService
  let resultado;
  try {
    resultado = await SmartStockService.adjustStock({
      varianteId: id,
      cantidad: delta,
      userId,
      userRole: userRole || ['admin'],
      tenantId: tenantId || 1,
      motivo: motivoNormalizado,
      client // ✅ Usar misma transacción
    });

    if (!resultado.success) {
      throw createServiceError(
        resultado.message || 'Error al ajustar stock',
        400,
        "AJUSTE_STOCK_FALLIDO"
      );
    }
  } catch (error) {
    console.error('❌ [inventoryService] Error al ajustar stock con SmartStockService:', error);
    throw createServiceError(
      error.message || 'Error al ajustar inventario',
      400,
      "SMART_STOCK_ERROR"
    );
  }

  const stockNuevo = resultado.newStock;

  // ✅ Registrar en log_inventario para auditoría con trazabilidad de origen
  const excepcion = Boolean(esExcepcion);

  try {
    await client.query(
      `INSERT INTO log_inventario (
        varianteid, cantidadcambiado, nuevostock, motivo, usuarioid, es_excepcion,
        tipo_origen, orden_compra_id, sesion_auditoria_id, ajuste_id, tenant_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [id, delta, stockNuevo, motivoNormalizado, userId, excepcion, tipoOrigen, ordenCompraId, sesionAuditoriaId, ajusteId, tenantId]
    );
  } catch (error) {
    if (error && error.code === "42703") {
      // Fallback para columnas que no existen (migración pendiente)
      await client.query(
        "INSERT INTO log_inventario (varianteid, cantidadcambiado, nuevostock, motivo, usuarioid) VALUES ($1, $2, $3, $4, $5)",
        [id, delta, stockNuevo, motivoNormalizado, userId]
      );
    } else {
      // No fallar si log_inventario falla (es solo auditoría)
      console.error('[inventoryService] Error al insertar en log_inventario:', error);
    }
  }

  console.log(`✅ [inventoryService] Movimiento registrado: ${delta > 0 ? 'ENTRADA' : 'SALIDA'} de ${Math.abs(delta)} unidades - Variante ${id} (${stockAnterior} → ${stockNuevo})`);

  return { stockAnterior, stockNuevo };
}

module.exports = {
  registrarMovimiento,
};
