/**
 * 🛣️ RUTAS PARA SECUENCIAS DE REMISIONES
 * 
 * Endpoints para manejar IDs secuenciales de remisión con control estricto
 */

const express = require('express');
const router = express.Router();

const {
  obtenerEstadoSecuencia,
  inicializarSecuencia,
  obtenerSiguienteNumero,
  validarNumero,
  corregirSecuencia,
  obtenerEstadisticas,
  obtenerAuditoria
} = require('../controllers/remisionSequenceController');

/**
 * Middleware para validar permisos de administración
 */
function requireAdmin(req, res, next) {
  const userRole = req.user?.rol?.toLowerCase()?.trim() || '';
  const allowedRoles = ['admin', 'superadmin', 'finanzas'];
  
  if (!allowedRoles.includes(userRole)) {
    return res.status(403).json({
      success: false,
      error: 'No tienes permisos para realizar esta acción'
    });
  }
  
  next();
}

/**
 * Middleware para validar permisos de corrección (solo admin/superadmin)
 */
function requireSuperAdmin(req, res, next) {
  const userRole = req.user?.rol?.toLowerCase()?.trim() || '';
  const allowedRoles = ['admin', 'superadmin'];
  
  if (!allowedRoles.includes(userRole)) {
    return res.status(403).json({
      success: false,
      error: 'Esta acción solo puede ser realizada por administradores'
    });
  }
  
  next();
}

// =============================================================================
// 📊 ENDPOINTS DE CONSULTA (READ-ONLY)
// =============================================================================

/**
 * GET /api/remisiones/secuencia/estado
 * Obtener estado actual de la secuencia
 * 
 * @access Private (cualquier usuario autenticado)
 * @example GET /api/remisiones/secuencia/estado
 */
router.get('/estado', obtenerEstadoSecuencia);

/**
 * GET /api/remisiones/secuencia/estadisticas
 * Obtener estadísticas de uso de la secuencia
 * 
 * @access Private (requiere admin)
 * @example GET /api/remisiones/secuencia/estadisticas
 */
router.get('/estadisticas', requireAdmin, obtenerEstadisticas);

/**
 * GET /api/remisiones/secuencia/auditoria
 * Obtener historial de auditoría
 * 
 * @access Private (requiere admin)
 * @query limite - Número máximo de registros (default: 50)
 * @example GET /api/remisiones/secuencia/auditoria?limite=20
 */
router.get('/auditoria', requireAdmin, obtenerAuditoria);

// =============================================================================
// 🔢 ENDPOINTS DE SECUENCIA (CONTROLADOS)
// =============================================================================

/**
 * POST /api/remisiones/secuencia/inicializar
 * Inicializar secuencia (solo se puede hacer una vez)
 * 
 * @access Private (requiere admin)
 * @body { numero_inicial: number }
 * @example POST /api/remisiones/secuencia/inicializar
 */
router.post('/inicializar', requireAdmin, inicializarSecuencia);

/**
 * GET /api/remisiones/secuencia/siguiente
 * Obtener siguiente número disponible (incrementa contador)
 * 
 * @access Private (requiere admin)
 * @example GET /api/remisiones/secuencia/siguiente
 */
router.get('/siguiente', requireAdmin, obtenerSiguienteNumero);

/**
 * POST /api/remisiones/secuencia/validar
 * Validar si un número ya existe
 * 
 * @access Private (requiere admin)
 * @body { numero: number }
 * @example POST /api/remisiones/secuencia/validar
 */
router.post('/validar', requireAdmin, validarNumero);

/**
 * POST /api/remisiones/secuencia/corregir
 * Corregir número (solo para corrección de errores)
 * 
 * @access Private (requiere superadmin)
 * @body { 
 *   numero_corregido: number,
 *   justificacion: string
 * }
 * @example POST /api/remisiones/secuencia/corregir
 */
router.post('/corregir', requireSuperAdmin, corregirSecuencia);

// =============================================================================
// 📋 DOCUMENTACIÓN DE ENDPOINTS
// =============================================================================

/**
 * @swagger
 * components:
 *   schemas:
 *     SecuenciaEstado:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         data:
 *           type: object
 *           properties:
 *             secuencia:
 *               type: object
 *               properties:
 *                 numero_actual:
 *                   type: integer
 *                 siguiente_numero:
 *                   type: integer
 *                 estado:
 *                   type: string
 *                   enum: [ACTIVA, PENDIENTE_INICIALIZACION]
 *                 inicializado_en:
 *                   type: string
 *                   format: date-time
 *                 nombre_inicializador:
 *                   type: string
 *     
 *     SecuenciaError:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         error:
 *           type: string
 *         numero_existente:
 *           type: integer
 *         remision_existente:
 *           type: object
 *         correccion_sugerida:
 *           type: integer
 * 
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 * 
 *   responses:
 *     UnauthorizedError:
 *       description: No autorizado
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success:
 *                 type: boolean
 *                 example: false
 *               error:
 *                 type: string
 *                 example: "No autorizado"
 *     ForbiddenError:
 *       description: Permisos insuficientes
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success:
 *                 type: boolean
 *                 example: false
 *               error:
 *                 type: string
 *                 example: "No tienes permisos para realizar esta acción"
 */

/**
 * @swagger
 * /api/remisiones/secuencia/estado:
 *   get:
 *     summary: Obtener estado actual de la secuencia
 *     tags: [Secuencia Remisiones]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Estado obtenido exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SecuenciaEstado'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         description: No existe secuencia configurada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "No existe secuencia configurada"
 *                 requiere_inicializacion:
 *                   type: boolean
 *                   example: true
 */

/**
 * @swagger
 * /api/remisiones/secuencia/inicializar:
 *   post:
 *     summary: Inicializar secuencia de remisiones
 *     tags: [Secuencia Remisiones]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - numero_inicial
 *             properties:
 *               numero_inicial:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 99999
 *                 description: Número inicial para la secuencia
 *                 example: 100
 *     responses:
 *       200:
 *         description: Secuencia inicializada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Secuencia inicializada correctamente en 100"
 *                 data:
 *                   type: object
 *                   properties:
 *                     siguiente_numero:
 *                       type: integer
 *                       example: 100
 *       400:
 *         description: Error en la inicialización
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SecuenciaError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */

/**
 * @swagger
 * /api/remisiones/secuencia/validar:
 *   post:
 *     summary: Validar si un número de remisión ya existe
 *     tags: [Secuencia Remisiones]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - numero
 *             properties:
 *               numero:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 99999
 *                 description: Número a validar
 *                 example: 105
 *     responses:
 *       200:
 *         description: Número válido y disponible
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Número 105 disponible para usar"
 *                 data:
 *                   type: object
 *                   properties:
 *                     numero_valido:
 *                       type: boolean
 *                       example: true
 *                     numero:
 *                       type: integer
 *                       example: 105
 *       400:
 *         description: Número ya existe o inválido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SecuenciaError'
 */

/**
 * @swagger
 * /api/remisiones/secuencia/corregir:
 *   post:
 *     summary: Corregir número de secuencia (solo para errores)
 *     tags: [Secuencia Remisiones]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - numero_corregido
 *               - justificacion
 *             properties:
 *               numero_corregido:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 99999
 *                 description: Número corregido para la secuencia
 *                 example: 150
 *               justificacion:
 *                 type: string
 *                 minLength: 10
 *                 description: Justificación detallada de la corrección
 *                 example: "Error en sistema generó número duplicado, se corrige para continuar flujo normal"
 *     responses:
 *       200:
 *         description: Secuencia corregida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Secuencia corregida de 145 a 150"
 *                 data:
 *                   type: object
 *                   properties:
 *                     numero_anterior:
 *                       type: integer
 *                       example: 145
 *                     numero_corregido:
 *                       type: integer
 *                       example: 150
 *                     siguiente_numero:
 *                       type: integer
 *                       example: 151
 *       400:
 *         description: Error en la corrección
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SecuenciaError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */

module.exports = router;
