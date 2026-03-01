const express = require('express');
const router = express.Router();
const devolucionesController = require('../controllers/devolucionesController');
const { authenticate, authorizeAdmin } = require('../middlewares/authMiddleware');

// =====================================================
// RUTAS DE CLIENTE
// =====================================================

/**
 * @swagger
 * /api/cliente/devoluciones:
 *   post:
 *     summary: Crear nueva solicitud de devolución
 *     tags: [Cliente - Devoluciones]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [pedido_id, items, motivo]
 *             properties:
 *               pedido_id:
 *                 type: integer
 *                 example: 123
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *               motivo:
 *                 type: string
 *                 example: Producto defectuoso
 *     responses:
 *       201:
 *         description: Devolución creada exitosamente
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
 *         description: No autenticado
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
router.post(
  '/cliente/devoluciones',
  authenticate,
  devolucionesController.solicitarDevolucion
);

/**
 * @swagger
 * /api/cliente/devoluciones/{id}/evidencias:
 *   post:
 *     summary: Subir evidencias fotográficas de la devolución
 *     tags: [Cliente - Devoluciones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la devolución
 *         example: 45
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               evidencia:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Evidencia subida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         description: No autenticado
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
router.post(
  '/cliente/devoluciones/:id/evidencias',
  authenticate,
  devolucionesController.subirEvidencia
);

/**
 * @swagger
 * /api/cliente/devoluciones:
 *   get:
 *     summary: Listar mis devoluciones
 *     tags: [Cliente - Devoluciones]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Devoluciones obtenidas exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 devoluciones:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: No autenticado
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
router.get(
  '/cliente/devoluciones',
  authenticate,
  devolucionesController.obtenerMisDevoluciones
);

/**
 * @swagger
 * /api/cliente/devoluciones/{id}:
 *   get:
 *     summary: Ver detalle de una devolución
 *     tags: [Cliente - Devoluciones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la devolución
 *         example: 45
 *     responses:
 *       200:
 *         description: Detalle de devolución obtenido
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 devolucion:
 *                   type: object
 *       401:
 *         description: No autenticado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Devolución no encontrada
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
router.get(
  '/cliente/devoluciones/:id',
  authenticate,
  devolucionesController.obtenerDetalleDevolucion
);

// =====================================================
// RUTAS DE ADMIN
// =====================================================

/**
 * @swagger
 * /api/admin/devoluciones:
 *   get:
 *     summary: Listar todas las devoluciones (con filtros)
 *     tags: [Admin - Devoluciones]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Devoluciones obtenidas exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 devoluciones:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: No autenticado o no es admin
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
router.get(
  '/admin/devoluciones',
  authenticate,
  authorizeAdmin,
  devolucionesController.obtenerTodasDevoluciones
);

/**
 * @swagger
 * /api/admin/devoluciones/{id}:
 *   get:
 *     summary: Ver detalle de una devolución (admin)
 *     tags: [Admin - Devoluciones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la devolución
 *         example: 45
 *     responses:
 *       200:
 *         description: Detalle de devolución obtenido
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 devolucion:
 *                   type: object
 *       401:
 *         description: No autenticado o no es admin
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Devolución no encontrada
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
router.get(
  '/admin/devoluciones/:id',
  authenticate,
  authorizeAdmin,
  devolucionesController.obtenerDetalleDevolucion
);

/**
 * @swagger
 * /api/admin/devoluciones/{id}/aprobar:
 *   post:
 *     summary: Aprobar devolución
 *     tags: [Admin - Devoluciones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la devolución
 *         example: 45
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notas:
 *                 type: string
 *                 example: Devolución aprobada
 *     responses:
 *       200:
 *         description: Devolución aprobada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         description: No autenticado o no es admin
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Devolución no encontrada
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
router.post(
  '/admin/devoluciones/:id/aprobar',
  authenticate,
  authorizeAdmin,
  devolucionesController.aprobarDevolucion
);

/**
 * @swagger
 * /api/admin/devoluciones/{id}/rechazar:
 *   post:
 *     summary: Rechazar devolución
 *     tags: [Admin - Devoluciones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la devolución
 *         example: 45
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [motivo]
 *             properties:
 *               motivo:
 *                 type: string
 *                 example: No cumple con las condiciones de devolución
 *     responses:
 *       200:
 *         description: Devolución rechazada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         description: No autenticado o no es admin
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Devolución no encontrada
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
router.post(
  '/admin/devoluciones/:id/rechazar',
  authenticate,
  authorizeAdmin,
  devolucionesController.rechazarDevolucion
);

module.exports = router;
