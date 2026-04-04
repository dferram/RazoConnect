/**
 * 🎛️ CONTROLLER PARA SECUENCIAS DE REMISIONES
 * 
 * Endpoints para manejar IDs secuenciales de remisión con control estricto
 * Solo permite edición en: 1) Inicialización, 2) Corrección de errores
 */

const RemisionSequenceManager = require('../utils/remisionSequenceManager');
const logger = require('../utils/logger');

const sequenceManager = new RemisionSequenceManager();

/**
 * GET /api/remisiones/secuencia/estado
 * Obtener estado actual de la secuencia
 */
async function obtenerEstadoSecuencia(req, res) {
  try {
    const { tenant_id } = req.tenant;
    
    const resultado = await sequenceManager.obtenerEstado(tenant_id);
    
    if (!resultado.success) {
      return res.status(404).json({
        success: false,
        error: resultado.error,
        requiere_inicializacion: resultado.requiere_inicializacion
      });
    }
    
    res.json({
      success: true,
      data: resultado
    });
    
  } catch (error) {
    logger.error('Error obteniendo estado de secuencia', {
      tenant_id: req.tenant?.tenant_id,
      error: error.message,
      requestId: req.requestId
    });
    
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
}

/**
 * POST /api/remisiones/secuencia/inicializar
 * Inicializar secuencia (solo se puede hacer una vez)
 */
async function inicializarSecuencia(req, res) {
  try {
    const { tenant_id } = req.tenant;
    const { numero_inicial } = req.body;
    const userId = req.user?.id || req.user?.adminid;
    
    // Validaciones
    if (!numero_inicial || !Number.isInteger(numero_inicial) || numero_inicial < 1) {
      return res.status(400).json({
        success: false,
        error: 'El número inicial debe ser un entero positivo mayor a 0'
      });
    }
    
    if (numero_inicial > 99999) {
      return res.status(400).json({
        success: false,
        error: 'El número inicial no puede ser mayor a 99999'
      });
    }
    
    const resultado = await sequenceManager.inicializarSecuencia(
      tenant_id, 
      numero_inicial, 
      userId
    );
    
    if (!resultado.success) {
      return res.status(400).json({
        success: false,
        error: resultado.error,
        secuencia_actual: resultado.secuencia_actual,
        inicializado_en: resultado.inicializado_en,
        inicializado_por: resultado.inicializado_por
      });
    }
    
    logger.info('🔢 [SECUENCIA] Secuencia inicializada', {
      tenant_id,
      numero_inicial,
      userId,
      requestId: req.requestId
    });
    
    res.json({
      success: true,
      message: resultado.mensaje,
      data: {
        siguiente_numero: resultado.siguiente_numero
      }
    });
    
  } catch (error) {
    logger.error('Error inicializando secuencia', {
      tenant_id: req.tenant?.tenant_id,
      body: req.body,
      error: error.message,
      requestId: req.requestId
    });
    
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
}

/**
 * GET /api/remisiones/secuencia/siguiente
 * Obtener siguiente número disponible (incrementa contador)
 */
async function obtenerSiguienteNumero(req, res) {
  try {
    const { tenant_id } = req.tenant;
    
    const resultado = await sequenceManager.obtenerSiguienteNumero(tenant_id);
    
    if (!resultado.success) {
      return res.status(400).json({
        success: false,
        error: resultado.error,
        requiere_inicializacion: resultado.requiere_inicializacion
      });
    }
    
    res.json({
      success: true,
      data: {
        numero_anterior: resultado.numero_anterior,
        siguiente_numero: resultado.siguiente_numero
      }
    });
    
  } catch (error) {
    logger.error('Error obteniendo siguiente número', {
      tenant_id: req.tenant?.tenant_id,
      error: error.message,
      requestId: req.requestId
    });
    
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
}

/**
 * POST /api/remisiones/secuencia/validar
 * Validar si un número ya existe
 */
async function validarNumero(req, res) {
  try {
    const { tenant_id } = req.tenant;
    const { numero } = req.body;
    
    // Validaciones
    if (!numero || !Number.isInteger(numero) || numero < 1) {
      return res.status(400).json({
        success: false,
        error: 'El número debe ser un entero positivo'
      });
    }
    
    if (numero > 99999) {
      return res.status(400).json({
        success: false,
        error: 'El número no puede ser mayor a 99999'
      });
    }
    
    const resultado = await sequenceManager.validarNumero(tenant_id, numero);
    
    if (!resultado.success) {
      // Registrar intento fallido
      await registrarIntentoFallido(tenant_id, numero, 'DUPLICADO', req.user?.id);
      
      return res.status(400).json({
        success: false,
        error: resultado.error,
        numero_existente: resultado.numero_existente,
        remision_existente: resultado.remision_existente,
        correccion_sugerida: resultado.correccion_sugerida,
        mensaje: resultado.mensaje
      });
    }
    
    res.json({
      success: true,
      message: resultado.mensaje,
      data: {
        numero_valido: true,
        numero: numero
      }
    });
    
  } catch (error) {
    logger.error('Error validando número', {
      tenant_id: req.tenant?.tenant_id,
      body: req.body,
      error: error.message,
      requestId: req.requestId
    });
    
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
}

/**
 * POST /api/remisiones/secuencia/corregir
 * Corregir número (solo para corrección de errores)
 */
async function corregirSecuencia(req, res) {
  try {
    const { tenant_id } = req.tenant;
    const { numero_corregido, justificacion } = req.body;
    const userId = req.user?.id || req.user?.adminid;
    
    // Validaciones
    if (!numero_corregido || !Number.isInteger(numero_corregido) || numero_corregido < 1) {
      return res.status(400).json({
        success: false,
        error: 'El número corregido debe ser un entero positivo'
      });
    }
    
    if (!justificacion || justificacion.trim().length < 10) {
      return res.status(400).json({
        success: false,
        error: 'La justificación es requerida y debe tener al menos 10 caracteres'
      });
    }
    
    if (numero_corregido > 99999) {
      return res.status(400).json({
        success: false,
        error: 'El número corregido no puede ser mayor a 99999'
      });
    }
    
    const resultado = await sequenceManager.corregirNumero(
      tenant_id,
      numero_corregido,
      userId,
      justificacion
    );
    
    if (!resultado.success) {
      return res.status(400).json({
        success: false,
        error: resultado.error,
        conflicto_con: resultado.conflicto_con
      });
    }
    
    logger.warn('🔧 [SECUENCIA] Secuencia corregida', {
      tenant_id,
      numero_corregido,
      userId,
      justificacion,
      requestId: req.requestId
    });
    
    res.json({
      success: true,
      message: resultado.mensaje,
      data: {
        numero_anterior: resultado.numero_anterior,
        numero_corregido: resultado.numero_corregido,
        siguiente_numero: resultado.siguiente_numero
      }
    });
    
  } catch (error) {
    logger.error('Error corrigiendo secuencia', {
      tenant_id: req.tenant?.tenant_id,
      body: req.body,
      error: error.message,
      requestId: req.requestId
    });
    
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
}

/**
 * GET /api/remisiones/secuencia/estadisticas
 * Obtener estadísticas de uso de la secuencia
 */
async function obtenerEstadisticas(req, res) {
  try {
    const { tenant_id } = req.tenant;
    
    const client = require('../db').pool;
    const result = await client.query(
      'SELECT * FROM estadisticas_secuencias($1)',
      [tenant_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No hay estadísticas disponibles para este tenant'
      });
    }
    
    const stats = result.rows[0];
    
    res.json({
      success: true,
      data: {
        tenant_id: stats.tenant_id,
        numero_actual: stats.numero_actual,
        siguiente_numero: stats.siguiente_numero,
        dias_desde_inicializacion: stats.dias_desde_inicializacion,
        total_correcciones: stats.total_correcciones,
        ultima_correccion: stats.ultima_correccion,
        intentos_fallidos_hoy: stats.intentos_fallidos_hoy,
        remisiones_creadas_mes: stats.remisiones_creadas_mes
      }
    });
    
  } catch (error) {
    logger.error('Error obteniendo estadísticas', {
      tenant_id: req.tenant?.tenant_id,
      error: error.message,
      requestId: req.requestId
    });
    
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
}

/**
 * GET /api/remisiones/secuencia/auditoria
 * Obtener historial de auditoría
 */
async function obtenerAuditoria(req, res) {
  try {
    const { tenant_id } = req.tenant;
    const { limite = 50 } = req.query;
    
    const client = require('../db').pool;
    const result = await client.query(`
      SELECT 
        accion,
        numero_anterior,
        numero_nuevo,
        usuario_id,
        (SELECT username FROM admin_users WHERE adminid = usuario_id) as nombre_usuario,
        observaciones,
        created_at
      FROM remision_secuencia_auditoria
      WHERE tenant_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [tenant_id, parseInt(limite)]);
    
    res.json({
      success: true,
      data: {
        auditoria: result.rows,
        total: result.rows.length
      }
    });
    
  } catch (error) {
    logger.error('Error obteniendo auditoría', {
      tenant_id: req.tenant?.tenant_id,
      error: error.message,
      requestId: req.requestId
    });
    
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
}

/**
 * Función auxiliar para registrar intentos fallidos
 */
async function registrarIntentoFallido(tenant_id, numero, tipo_error, usuario_id) {
  try {
    const client = require('../db').pool;
    await client.query(`
      INSERT INTO remision_intentos_fallidos
      (tenant_id, numero_intentado, tipo_error, usuario_id)
      VALUES ($1, $2, $3, $4)
    `, [tenant_id, numero, tipo_error, usuario_id]);
  } catch (error) {
    logger.error('Error registrando intento fallido', {
      tenant_id,
      numero,
      tipo_error,
      error: error.message
    });
  }
}

module.exports = {
  obtenerEstadoSecuencia,
  inicializarSecuencia,
  obtenerSiguienteNumero,
  validarNumero,
  corregirSecuencia,
  obtenerEstadisticas,
  obtenerAuditoria
};
