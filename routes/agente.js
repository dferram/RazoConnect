const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { authenticate, authorize } = require('../middlewares/authMiddleware');
const entregasController = require('../controllers/agentes/entregasController');
const inventoryAuditController = require('../controllers/inventoryAuditController');
const { heavyOperationLimiter } = require('../middlewares/rateLimiter');

// Configurar multer para subida de evidencias
// CRÍTICO: Usar memoryStorage para evitar pérdida de datos en Azure App Service
// Los archivos se guardan en memoria temporal y se suben directamente a Cloudinary
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes (jpeg, jpg, png, gif, webp)'));
    }
  }
});

// Todas las rutas requieren autenticación de agente
router.use(authenticate);
router.use(authorize(['agente', 'admin']));

/**
 * @swagger
 * /api/agente/entregas/confirmar:
 *   post:
 *     summary: Confirmar entrega de un pedido con evidencia fotográfica
 *     tags: [Agente]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [pedidoId, foto_evidencia]
 *             properties:
 *               pedidoId:
 *                 type: integer
 *                 example: 123
 *               foto_evidencia:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Entrega confirmada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Datos inválidos o foto requerida
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: No autenticado o no es agente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/entregas/confirmar', heavyOperationLimiter, upload.single('foto_evidencia'), entregasController.confirmarEntrega);

/**
 * @swagger
 * /api/agente/entregas/pendientes:
 *   get:
 *     summary: Obtener lista de entregas pendientes del agente
 *     tags: [Agente]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Entregas pendientes obtenidas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 entregas:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: No autenticado o no es agente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/entregas/pendientes', entregasController.obtenerEntregasPendientes);

/**
 * @swagger
 * /api/agente/auditoria-inventario/sesiones:
 *   get:
 *     summary: Obtener sesiones de inventario asignadas al agente
 *     tags: [Agente]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sesiones obtenidas exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 sesiones:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: No autenticado o no es agente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/auditoria-inventario/sesiones', inventoryAuditController.listarSesiones);

/**
 * @swagger
 * /api/agente/auditoria-inventario/dashboard/{sesionId}:
 *   get:
 *     summary: Obtener dashboard de una sesión de inventario
 *     tags: [Agente]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sesionId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la sesión
 *         example: 10
 *     responses:
 *       200:
 *         description: Dashboard obtenido exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 dashboard:
 *                   type: object
 *       401:
 *         description: No autenticado o no es agente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Sesión no asignada al agente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Sesión no encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/auditoria-inventario/dashboard/:sesionId', inventoryAuditController.getDashboardSesion);

/**
 * @swagger
 * /api/agente/auditoria-inventario/registrar-conteo:
 *   post:
 *     summary: Registrar un conteo de inventario
 *     tags: [Agente]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sesionId, varianteId, cantidad]
 *             properties:
 *               sesionId:
 *                 type: integer
 *                 example: 10
 *               varianteId:
 *                 type: integer
 *                 example: 456
 *               cantidad:
 *                 type: integer
 *                 example: 50
 *     responses:
 *       201:
 *         description: Conteo registrado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Datos inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: No autenticado o no es agente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/auditoria-inventario/registrar-conteo', inventoryAuditController.registrarConteo);

module.exports = router;
