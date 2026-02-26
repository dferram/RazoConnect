/**
 * TRANSACTION MANAGER - Sistema de Transacciones Atómicas con Rollback Automático
 * 
 * Este módulo garantiza la integridad de datos en operaciones críticas del sistema.
 * Si cualquier parte de una operación falla, TODA la operación se revierte automáticamente.
 * 
 * CARACTERÍSTICAS:
 * - Rollback automático en caso de error
 * - Logging detallado para debugging (invisible al cliente)
 * - Validaciones pre-commit
 * - Manejo de errores centralizado
 * - Soporte para transacciones anidadas
 * 
 * USO:
 * ```javascript
 * const result = await executeTransaction(async (client) => {
 *   await client.query('UPDATE stock...');
 *   await client.query('INSERT INTO cxc...');
 *   return { success: true, data: {...} };
 * });
 * ```
 */

const db = require('../db');

/**
 * Genera un ID único para tracking de transacciones
 */
function generateTransactionId() {
  return `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Logger interno para transacciones (NO visible al cliente)
 */
class TransactionLogger {
  constructor(transactionId, context = {}) {
    this.transactionId = transactionId;
    this.context = context;
    this.startTime = Date.now();
    this.operations = [];
  }

  logOperation(operation, details = {}) {
    this.operations.push({
      timestamp: Date.now(),
      operation,
      details
    });
  }

  logSuccess() {
    const duration = Date.now() - this.startTime;
    console.log(`✅ [TXN:${this.transactionId}] COMMIT exitoso (${duration}ms)`);
    console.log(`   Operaciones: ${this.operations.length}`);
    if (this.context.userId) {
      console.log(`   Usuario: ${this.context.userId}`);
    }
    if (this.context.endpoint) {
      console.log(`   Endpoint: ${this.context.endpoint}`);
    }
  }

  logRollback(error) {
    const duration = Date.now() - this.startTime;
    console.error(`🔴 [TXN:${this.transactionId}] ROLLBACK ejecutado (${duration}ms)`);
    console.error(`   Error: ${error.message}`);
    console.error(`   Operaciones antes del fallo: ${this.operations.length}`);
    
    // Log detallado de operaciones para debugging
    if (this.operations.length > 0) {
      console.error(`   📋 Historial de operaciones:`);
      this.operations.forEach((op, idx) => {
        console.error(`      ${idx + 1}. ${op.operation} (${op.timestamp - this.startTime}ms)`);
      });
    }

    // Log del stack trace completo
    if (error.stack) {
      console.error(`   Stack trace:`, error.stack);
    }

    // Log del contexto
    if (Object.keys(this.context).length > 0) {
      console.error(`   Contexto:`, JSON.stringify(this.context, null, 2));
    }
  }

  logWarning(message, details = {}) {
    console.warn(`⚠️ [TXN:${this.transactionId}] ${message}`, details);
  }
}

/**
 * Ejecuta una función dentro de una transacción atómica
 * Si la función lanza un error, se hace ROLLBACK automático
 * Si la función completa exitosamente, se hace COMMIT
 * 
 * @param {Function} callback - Función async que recibe el client de DB
 * @param {Object} options - Opciones de configuración
 * @param {Object} options.context - Contexto para logging (userId, endpoint, etc.)
 * @param {boolean} options.isolationLevel - Nivel de aislamiento (default: READ COMMITTED)
 * @param {number} options.timeout - Timeout en ms (default: 30000)
 * @returns {Promise<any>} Resultado de la función callback
 */
async function executeTransaction(callback, options = {}) {
  const {
    context = {},
    isolationLevel = 'READ COMMITTED',
    timeout = 30000
  } = options;

  const transactionId = generateTransactionId();
  const logger = new TransactionLogger(transactionId, context);
  const client = await db.pool.connect();
  
  let timeoutHandle;
  let transactionStarted = false;

  try {
    // Configurar timeout
    if (timeout > 0) {
      timeoutHandle = setTimeout(() => {
        throw new Error(`Transaction timeout after ${timeout}ms`);
      }, timeout);
    }

    // Iniciar transacción
    await client.query('BEGIN');
    transactionStarted = true;
    logger.logOperation('BEGIN', { isolationLevel });

    // Configurar nivel de aislamiento si es necesario
    if (isolationLevel !== 'READ COMMITTED') {
      await client.query(`SET TRANSACTION ISOLATION LEVEL ${isolationLevel}`);
      logger.logOperation('SET ISOLATION LEVEL', { level: isolationLevel });
    }

    // Ejecutar callback con el client
    const result = await callback(client, logger);

    // Validar resultado antes de commit
    if (result && typeof result === 'object' && result.skipCommit) {
      logger.logWarning('Commit omitido por solicitud del callback');
      await client.query('ROLLBACK');
      transactionStarted = false;
      return result;
    }

    // COMMIT exitoso
    await client.query('COMMIT');
    transactionStarted = false;
    logger.logOperation('COMMIT');
    logger.logSuccess();

    return result;

  } catch (error) {
    // ROLLBACK automático en caso de error
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
        logger.logRollback(error);
      } catch (rollbackError) {
        console.error(`❌ [TXN:${transactionId}] ERROR CRÍTICO: Fallo al ejecutar ROLLBACK`, rollbackError);
      }
    }

    // Re-lanzar el error para que el controlador lo maneje
    throw error;

  } finally {
    // Limpiar timeout
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }

    // Liberar conexión
    client.release();
  }
}

/**
 * Wrapper para operaciones de lectura (sin transacción)
 * Útil para queries que no modifican datos
 */
async function executeQuery(query, params = []) {
  const client = await db.pool.connect();
  try {
    const result = await client.query(query, params);
    return result;
  } finally {
    client.release();
  }
}

/**
 * Validador de consistencia de datos
 * Ejecuta validaciones antes de hacer COMMIT
 */
class DataValidator {
  constructor(client) {
    this.client = client;
    this.validations = [];
  }

  /**
   * Valida que la suma de detalles coincida con el total del pedido
   */
  async validatePedidoTotal(pedidoId, expectedTotal, tolerance = 0.50) {
    const result = await this.client.query(
      `SELECT 
        p.montototal,
        COALESCE(SUM(d.precioporpaquete * d.cantidadpaquetes), 0) as suma_detalles
       FROM pedidos p
       LEFT JOIN detallesdelpedido d ON d.pedidoid = p.pedidoid
       WHERE p.pedidoid = $1
       GROUP BY p.pedidoid, p.montototal`,
      [pedidoId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Pedido ${pedidoId} no encontrado en validación`);
    }

    const { montototal, suma_detalles } = result.rows[0];
    const diferencia = Math.abs(parseFloat(montototal) - parseFloat(suma_detalles));

    if (diferencia > tolerance) {
      throw new Error(
        `Inconsistencia detectada en Pedido ${pedidoId}: ` +
        `Total=${montototal}, Suma Detalles=${suma_detalles}, Diferencia=${diferencia.toFixed(2)}`
      );
    }

    this.validations.push({
      type: 'pedido_total',
      pedidoId,
      status: 'OK',
      diferencia
    });

    return true;
  }

  /**
   * Valida que el stock no sea negativo
   */
  async validateStockNonNegative(varianteId, adminId = null) {
    let query, params;

    if (adminId) {
      // Validar stock_admin
      query = `SELECT cantidad FROM stock_admin WHERE variante_id = $1 AND admin_id = $2`;
      params = [varianteId, adminId];
    } else {
      // Validar stock global
      query = `SELECT stock FROM producto_variantes WHERE varianteid = $1`;
      params = [varianteId];
    }

    const result = await this.client.query(query, params);

    if (result.rows.length === 0) {
      throw new Error(`Variante ${varianteId} no encontrada en validación de stock`);
    }

    const stock = parseInt(result.rows[0].cantidad || result.rows[0].stock);

    if (stock < 0) {
      throw new Error(
        `Stock negativo detectado: Variante ${varianteId}, ` +
        `Admin ${adminId || 'GLOBAL'}, Stock=${stock}`
      );
    }

    this.validations.push({
      type: 'stock_non_negative',
      varianteId,
      adminId,
      stock,
      status: 'OK'
    });

    return true;
  }

  /**
   * Valida que el saldo de crédito no exceda el límite
   */
  async validateCreditoLimit(clienteId) {
    const result = await this.client.query(
      `SELECT 
        limite_credito,
        saldo_deudor
       FROM cliente_creditos
       WHERE clienteid = $1`,
      [clienteId]
    );

    if (result.rows.length === 0) {
      return true; // Cliente sin crédito configurado
    }

    const { limite_credito, saldo_deudor } = result.rows[0];

    if (parseFloat(saldo_deudor) > parseFloat(limite_credito)) {
      throw new Error(
        `Límite de crédito excedido: Cliente ${clienteId}, ` +
        `Límite=${limite_credito}, Saldo=${saldo_deudor}`
      );
    }

    this.validations.push({
      type: 'credito_limit',
      clienteId,
      limite_credito,
      saldo_deudor,
      status: 'OK'
    });

    return true;
  }

  /**
   * Retorna todas las validaciones ejecutadas
   */
  getValidations() {
    return this.validations;
  }
}

/**
 * Helper para crear un validador dentro de una transacción
 */
function createValidator(client) {
  return new DataValidator(client);
}

module.exports = {
  executeTransaction,
  executeQuery,
  createValidator,
  TransactionLogger,
  DataValidator
};
