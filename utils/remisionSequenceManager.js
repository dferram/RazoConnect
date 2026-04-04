/**
 * 🔢 SISTEMA DE SECUENCIALES DE REMISIONES - CONTROL DE IDs
 * 
 * Sistema para manejar IDs de remisión secuenciales con control estricto
 * Solo permite edición en dos casos: inicialización y corrección de errores
 */

const { Pool } = require('../db');
const logger = require('../utils/logger');

class RemisionSequenceManager {
  constructor() {
    this.pool = new Pool();
  }

  /**
   * 1. INICIALIZAR SECUENCIAL - Solo se puede hacer una vez
   * @param {number} tenant_id - ID del tenant
   * @param {number} numero_inicial - Número inicial (ej: 100)
   * @param {number} usuario_id - ID del usuario que inicializa
   * @returns {Promise<object>}
   */
  async inicializarSecuencia(tenant_id, numero_inicial, usuario_id) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Verificar si ya existe una secuencia para este tenant
      const existeSecuencia = await client.query(`
        SELECT secuencia_id, numero_actual, inicializado_en, inicializado_por
        FROM remision_secuencias
        WHERE tenant_id = $1
        FOR UPDATE
      `, [tenant_id]);
      
      if (existeSecuencia.rows.length > 0) {
        const secuencia = existeSecuencia.rows[0];
        
        if (secuencia.inicializado_en) {
          await client.query('ROLLBACK');
          return {
            success: false,
            error: 'La secuencia ya fue inicializada',
            secuencia_actual: secuencia.numero_actual,
            inicializado_en: secuencia.inicializado_en,
            inicializado_por: secuencia.inicializado_por
          };
        }
      }
      
      // Insertar o actualizar la secuencia
      if (existeSecuencia.rows.length === 0) {
        await client.query(`
          INSERT INTO remision_secuencias 
          (tenant_id, numero_actual, inicializado_en, inicializado_por, ultima_actualizacion)
          VALUES ($1, $2, NOW(), $3, NOW())
        `, [tenant_id, numero_inicial, usuario_id]);
      } else {
        await client.query(`
          UPDATE remision_secuencias
          SET numero_actual = $2,
              inicializado_en = NOW(),
              inicializado_por = $3,
              ultima_actualizacion = NOW()
          WHERE tenant_id = $1
        `, [tenant_id, numero_inicial, usuario_id]);
      }
      
      // Registrar en auditoría
      await client.query(`
        INSERT INTO remision_secuencia_auditoria
        (tenant_id, accion, numero_anterior, numero_nuevo, usuario_id, observaciones)
        VALUES ($1, 'INICIALIZACION', NULL, $2, $3, $4)
      `, [tenant_id, numero_inicial, usuario_id, `Secuencia inicializada en ${numero_inicial}`]);
      
      await client.query('COMMIT');
      
      logger.info('🔢 [SECUENCIA] Secuencia de remisiones inicializada', {
        tenant_id,
        numero_inicial,
        usuario_id,
        timestamp: new Date().toISOString()
      });
      
      return {
        success: true,
        mensaje: `Secuencia inicializada correctamente en ${numero_inicial}`,
        siguiente_numero: numero_inicial
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('❌ [SECUENCIA] Error inicializando secuencia', {
        tenant_id,
        numero_inicial,
        error: error.message
      });
      
      return {
        success: false,
        error: 'Error al inicializar secuencia: ' + error.message
      };
    } finally {
      client.release();
    }
  }

  /**
   * 2. OBTENER SIGUIENTE NÚMERO - Incrementa y devuelve el siguiente
   * @param {number} tenant_id - ID del tenant
   * @returns {Promise<object>}
   */
  async obtenerSiguienteNumero(tenant_id) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Obtener y bloquear la secuencia
      const secuenciaResult = await client.query(`
        SELECT secuencia_id, numero_actual, inicializado_en
        FROM remision_secuencias
        WHERE tenant_id = $1
        FOR UPDATE
      `, [tenant_id]);
      
      if (secuenciaResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'No existe secuencia configurada para este tenant',
          requiere_inicializacion: true
        };
      }
      
      const secuencia = secuenciaResult.rows[0];
      
      if (!secuencia.inicializado_en) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'La secuencia no ha sido inicializada',
          requiere_inicializacion: true
        };
      }
      
      const numeroActual = secuencia.numero_actual;
      const siguienteNumero = numeroActual + 1;
      
      // Actualizar al siguiente número
      await client.query(`
        UPDATE remision_secuencias
        SET numero_actual = $1, ultima_actualizacion = NOW()
        WHERE tenant_id = $2
      `, [siguienteNumero, tenant_id]);
      
      await client.query('COMMIT');
      
      logger.debug('🔢 [SECUENCIA] Siguiente número generado', {
        tenant_id,
        anterior: numeroActual,
        siguiente: siguienteNumero
      });
      
      return {
        success: true,
        numero_anterior: numeroActual,
        siguiente_numero: siguienteNumero
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('❌ [SECUENCIA] Error obteniendo siguiente número', {
        tenant_id,
        error: error.message
      });
      
      return {
        success: false,
        error: 'Error al obtener siguiente número: ' + error.message
      };
    } finally {
      client.release();
    }
  }

  /**
   * 3. VALIDAR NÚMERO - Verifica si un número ya existe
   * @param {number} tenant_id - ID del tenant
   * @param {number} numero - Número a validar
   * @returns {Promise<object>}
   */
  async validarNumero(tenant_id, numero) {
    const client = await this.pool.connect();
    
    try {
      // Buscar si el número ya existe en alguna remisión
      const existeNumero = await client.query(`
        SELECT remision_id, folio, estado, created_at
        FROM remisiones
        WHERE tenant_id = $1 AND folio::text = $2::text
        ORDER BY remision_id
        LIMIT 5
      `, [tenant_id, numero.toString()]);
      
      if (existeNumero.rows.length > 0) {
        // El número ya existe
        const remisionExistente = existeNumero.rows[0];
        
        logger.warn('⚠️ [SECUENCIA] Número de remisión ya existe', {
          tenant_id,
          numero_intentado: numero,
          remision_existente: remisionExistente
        });
        
        // Obtener el siguiente número disponible
        const siguienteDisponible = await this.obtenerSiguienteNumero(tenant_id);
        
        return {
          success: false,
          error: 'El número de remisión ya existe',
          numero_existente: numero,
          remision_existente: {
            id: remisionExistente.remision_id,
            folio: remisionExistente.folio,
            estado: remisionExistente.estado,
            fecha: remisionExistente.created_at
          },
          correccion_sugerida: siguienteDisponible.success ? siguienteDisponible.siguiente_numero : null,
          mensaje: `El número ${numero} ya está siendo usado por la remisión ${remisionExistente.folio}. Sugerencia: usar ${siguienteDisponible.siguiente_numero || 'consultar administración'}`
        };
      }
      
      // El número está disponible
      return {
        success: true,
        mensaje: `Número ${numero} disponible para usar`
      };
      
    } catch (error) {
      logger.error('❌ [SECUENCIA] Error validando número', {
        tenant_id,
        numero,
        error: error.message
      });
      
      return {
        success: false,
        error: 'Error al validar número: ' + error.message
      };
    } finally {
      client.release();
    }
  }

  /**
   * 4. CORREGIR NÚMERO - Solo para corrección de errores (requiere justificación)
   * @param {number} tenant_id - ID del tenant
   * @param {number} numero_corregido - Número corregido
   * @param {number} usuario_id - ID del usuario que corrige
   * @param {string} justificacion - Motivo de la corrección
   * @returns {Promise<object>}
   */
  async corregirNumero(tenant_id, numero_corregido, usuario_id, justificacion) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Verificar que la secuencia exista y esté inicializada
      const secuenciaResult = await client.query(`
        SELECT secuencia_id, numero_actual, inicializado_en
        FROM remision_secuencias
        WHERE tenant_id = $1
        FOR UPDATE
      `, [tenant_id]);
      
      if (secuenciaResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'No existe secuencia configurada para este tenant'
        };
      }
      
      const secuencia = secuenciaResult.rows[0];
      
      if (!secuencia.inicializado_en) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'La secuencia no ha sido inicializada'
        };
      }
      
      // Validar que el número corregido no exista
      const validacion = await this.validarNumero(tenant_id, numero_corregido);
      
      if (!validacion.success && validacion.numero_existente) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'No se puede corregir a un número que ya existe',
          conflicto_con: validacion.remision_existente
        };
      }
      
      const numeroAnterior = secuencia.numero_actual;
      
      // Actualizar la secuencia
      await client.query(`
        UPDATE remision_secuencias
        SET numero_actual = $1, ultima_actualizacion = NOW()
        WHERE tenant_id = $2
      `, [numero_corregido, tenant_id]);
      
      // Registrar en auditoría
      await client.query(`
        INSERT INTO remision_secuencia_auditoria
        (tenant_id, accion, numero_anterior, numero_nuevo, usuario_id, observaciones)
        VALUES ($1, 'CORRECCION', $2, $3, $4, $5)
      `, [tenant_id, numeroAnterior, numero_corregido, usuario_id, justificacion]);
      
      await client.query('COMMIT');
      
      logger.warn('🔧 [SECUENCIA] Secuencia corregida', {
        tenant_id,
        numero_anterior: numeroAnterior,
        numero_corregido,
        usuario_id,
        justificacion
      });
      
      return {
        success: true,
        mensaje: `Secuencia corregida de ${numeroAnterior} a ${numero_corregido}`,
        numero_anterior: numeroAnterior,
        numero_corregido: numero_corregido,
        siguiente_numero: numero_corregido + 1
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('❌ [SECUENCIA] Error corrigiendo secuencia', {
        tenant_id,
        numero_corregido,
        usuario_id,
        error: error.message
      });
      
      return {
        success: false,
        error: 'Error al corregir secuencia: ' + error.message
      };
    } finally {
      client.release();
    }
  }

  /**
   * 5. OBTENER ESTADO ACTUAL - Para fines informativos
   * @param {number} tenant_id - ID del tenant
   * @returns {Promise<object>}
   */
  async obtenerEstado(tenant_id) {
    const client = await this.pool.connect();
    
    try {
      const secuenciaResult = await client.query(`
        SELECT secuencia_id, numero_actual, inicializado_en, inicializado_por, 
               ultima_actualizacion, (SELECT username FROM admin_users WHERE adminid = inicializado_por) as nombre_inicializador
        FROM remision_secuencias
        WHERE tenant_id = $1
      `, [tenant_id]);
      
      if (secuenciaResult.rows.length === 0) {
        return {
          success: false,
          error: 'No existe secuencia configurada',
          requiere_inicializacion: true
        };
      }
      
      const secuencia = secuenciaResult.rows[0];
      
      // Obtener últimas auditorías
      const auditoriaResult = await client.query(`
        SELECT accion, numero_anterior, numero_nuevo, usuario_id, observaciones, created_at,
               (SELECT username FROM admin_users WHERE adminid = usuario_id) as nombre_usuario
        FROM remision_secuencia_auditoria
        WHERE tenant_id = $1
        ORDER BY created_at DESC
        LIMIT 10
      `, [tenant_id]);
      
      return {
        success: true,
        secuencia: {
          numero_actual: secuencia.numero_actual,
          inicializado_en: secuencia.inicializado_en,
          inicializado_por: secuencia.inicializado_por,
          nombre_inicializador: secuencia.nombre_inicializador,
          ultima_actualizacion: secuencia.ultima_actualizacion,
          siguiente_numero: secuencia.numero_actual + 1
        },
        auditoria_reciente: auditoriaResult.rows,
        estado: secuencia.inicializado_en ? 'ACTIVA' : 'PENDIENTE_INICIALIZACION'
      };
      
    } catch (error) {
      logger.error('❌ [SECUENCIA] Error obteniendo estado', {
        tenant_id,
        error: error.message
      });
      
      return {
        success: false,
        error: 'Error al obtener estado: ' + error.message
      };
    } finally {
      client.release();
    }
  }
}

module.exports = RemisionSequenceManager;
