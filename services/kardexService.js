const pool = require('../config/db');

/**
 * =====================================================
 * KARDEX SERVICE - Sistema de Trazabilidad de Inventario
 * =====================================================
 * Servicio centralizado para registrar TODOS los movimientos
 * de inventario de forma atómica e inmutable.
 * =====================================================
 */

class KardexService {
  /**
   * Registra un movimiento de inventario en el Kardex
   * @param {Object} params - Parámetros del movimiento
   * @param {number} params.varianteId - ID de la variante de producto
   * @param {number} params.adminId - ID del admin que ejecuta (NULL para sistema)
   * @param {number} params.tenantId - ID del tenant
   * @param {string} params.tipo - ENTRADA, SALIDA, AJUSTE, MERMA, ADICION
   * @param {number} params.cantidad - Cantidad del movimiento (positivo o negativo)
   * @param {string} params.motivo - Descripción del motivo
   * @param {string} params.referenciaTipo - Tipo de documento (ORDEN_COMPRA, PEDIDO, etc.)
   * @param {string} params.referenciaId - ID del documento origen
   * @param {string} params.observaciones - Observaciones adicionales (opcional)
   * @param {string} params.ipOrigen - IP del usuario (opcional)
   * @param {Object} client - Cliente de transacción (opcional, para usar transacción existente)
   * @returns {Promise<Object>} Registro del movimiento creado
   */
  async registrarMovimiento({
    varianteId,
    adminId = null,
    tenantId,
    tipo,
    cantidad,
    motivo,
    referenciaTipo = null,
    referenciaId = null,
    observaciones = null,
    ipOrigen = null
  }, client = null) {
    
    const useExternalTransaction = !!client;
    const dbClient = client || await pool.connect();

    try {
      if (!useExternalTransaction) {
        await dbClient.query('BEGIN');
      }

      // 1. Obtener stock actual de inventarios_admin
      const stockQuery = `
        SELECT ia.cantidad as stock_actual
        FROM inventarios_admin ia
        WHERE ia.variante_id = $1 
          AND ia.admin_id = $2
          AND ia.tenant_id = $3
        FOR UPDATE
      `;
      
      const stockResult = await dbClient.query(stockQuery, [varianteId, adminId || 1, tenantId]);
      
      let stockPrevio = 0;
      if (stockResult.rows.length > 0) {
        stockPrevio = parseInt(stockResult.rows[0].stock_actual) || 0;
      }

      // 2. Calcular stock posterior
      const cantidadNumerica = parseInt(cantidad);
      const stockPosterior = stockPrevio + cantidadNumerica;

      // 3. Validar que el stock no quede negativo (solo para SALIDA)
      if (tipo === 'SALIDA' && stockPosterior < 0) {
        throw new Error(`Stock insuficiente. Stock actual: ${stockPrevio}, Cantidad solicitada: ${Math.abs(cantidadNumerica)}`);
      }

      // 4. Insertar registro en movimientos_inventario
      const insertQuery = `
        INSERT INTO movimientos_inventario (
          variante_id,
          admin_id,
          tenant_id,
          tipo,
          cantidad,
          stock_previo,
          stock_posterior,
          motivo,
          referencia_tipo,
          referencia_id,
          observaciones,
          ip_origen,
          fecha_movimiento
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
        RETURNING *
      `;

      const insertResult = await dbClient.query(insertQuery, [
        varianteId,
        adminId,
        tenantId,
        tipo,
        cantidadNumerica,
        stockPrevio,
        stockPosterior,
        motivo,
        referenciaTipo,
        referenciaId,
        observaciones,
        ipOrigen
      ]);

      const movimiento = insertResult.rows[0];

      // 5. Logging para auditoría
      console.log(`📊 [KARDEX] Movimiento registrado:`, {
        movimiento_id: movimiento.movimiento_id,
        variante_id: varianteId,
        tipo,
        cantidad: cantidadNumerica,
        stock_previo: stockPrevio,
        stock_posterior: stockPosterior,
        motivo,
        referencia: `${referenciaTipo}-${referenciaId}`
      });

      if (!useExternalTransaction) {
        await dbClient.query('COMMIT');
      }

      return movimiento;

    } catch (error) {
      if (!useExternalTransaction) {
        await dbClient.query('ROLLBACK');
      }
      console.error('❌ [KARDEX] Error al registrar movimiento:', error.message);
      throw error;
    } finally {
      if (!useExternalTransaction) {
        dbClient.release();
      }
    }
  }

  /**
   * Registra múltiples movimientos en una sola transacción
   * @param {Array<Object>} movimientos - Array de objetos con parámetros de movimiento
   * @returns {Promise<Array>} Array de movimientos registrados
   */
  async registrarMovimientosLote(movimientos) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const resultados = [];
      
      for (const mov of movimientos) {
        const resultado = await this.registrarMovimiento(mov, client);
        resultados.push(resultado);
      }
      
      await client.query('COMMIT');
      
      console.log(`📊 [KARDEX] Lote de ${resultados.length} movimientos registrados exitosamente`);
      
      return resultados;
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ [KARDEX] Error al registrar lote de movimientos:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Obtiene el historial de movimientos de una variante
   * @param {number} varianteId - ID de la variante
   * @param {number} tenantId - ID del tenant
   * @param {Object} filtros - Filtros opcionales (adminId, tipo, fechaInicio, fechaFin)
   * @returns {Promise<Array>} Historial de movimientos
   */
  async obtenerHistorial(varianteId, tenantId, filtros = {}) {
    try {
      let query = `
        SELECT 
          mi.*,
          a.nombre as admin_nombre,
          pv.sku,
          p.nombre as producto_nombre
        FROM movimientos_inventario mi
        LEFT JOIN administradores a ON mi.admin_id = a.adminid
        LEFT JOIN producto_variantes pv ON mi.variante_id = pv.varianteid
        LEFT JOIN productos p ON pv.productoid = p.productoid
        WHERE mi.variante_id = $1 AND mi.tenant_id = $2
      `;

      const params = [varianteId, tenantId];
      let paramIndex = 3;

      if (filtros.adminId) {
        query += ` AND mi.admin_id = $${paramIndex}`;
        params.push(filtros.adminId);
        paramIndex++;
      }

      if (filtros.tipo) {
        query += ` AND mi.tipo = $${paramIndex}`;
        params.push(filtros.tipo);
        paramIndex++;
      }

      if (filtros.fechaInicio) {
        query += ` AND mi.fecha_movimiento >= $${paramIndex}`;
        params.push(filtros.fechaInicio);
        paramIndex++;
      }

      if (filtros.fechaFin) {
        query += ` AND mi.fecha_movimiento <= $${paramIndex}`;
        params.push(filtros.fechaFin);
        paramIndex++;
      }

      query += ` ORDER BY mi.fecha_movimiento DESC`;

      const result = await pool.query(query, params);
      return result.rows;

    } catch (error) {
      console.error('❌ [KARDEX] Error al obtener historial:', error.message);
      throw error;
    }
  }

  /**
   * Obtiene el stock actual y último movimiento de una variante
   * @param {number} varianteId - ID de la variante
   * @param {number} adminId - ID del admin
   * @param {number} tenantId - ID del tenant
   * @returns {Promise<Object>} Stock actual y último movimiento
   */
  async obtenerEstadoActual(varianteId, adminId, tenantId) {
    try {
      const query = `
        SELECT 
          ia.cantidad as stock_actual,
          mi.stock_posterior as ultimo_stock_registrado,
          mi.fecha_movimiento as fecha_ultimo_movimiento,
          mi.tipo as tipo_ultimo_movimiento,
          mi.motivo as motivo_ultimo_movimiento
        FROM inventarios_admin ia
        LEFT JOIN LATERAL (
          SELECT * FROM movimientos_inventario
          WHERE variante_id = ia.variante_id 
            AND admin_id = ia.admin_id
            AND tenant_id = ia.tenant_id
          ORDER BY fecha_movimiento DESC
          LIMIT 1
        ) mi ON true
        WHERE ia.variante_id = $1 
          AND ia.admin_id = $2
          AND ia.tenant_id = $3
      `;

      const result = await pool.query(query, [varianteId, adminId, tenantId]);
      
      if (result.rows.length === 0) {
        return {
          stock_actual: 0,
          ultimo_stock_registrado: null,
          fecha_ultimo_movimiento: null
        };
      }

      return result.rows[0];

    } catch (error) {
      console.error('❌ [KARDEX] Error al obtener estado actual:', error.message);
      throw error;
    }
  }
}

module.exports = new KardexService();
