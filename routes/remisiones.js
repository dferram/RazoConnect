const express = require('express');
const router = express.Router();
const remisionesController = require('../controllers/remisionesController');
const { authenticate, authorizeAdmin } = require('../middlewares/authMiddleware');

router.use(authenticate);
router.use(authorizeAdmin);

/**
 * @swagger
 * /api/remisiones/generar:
 *   post:
 *     summary: Generar remisión para un pedido
 *     tags: [Admin - Remisiones]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [pedidoId, items]
 *             properties:
 *               pedidoId:
 *                 type: integer
 *                 example: 123
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       201:
 *         description: Remisión generada exitosamente
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
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/generar', remisionesController.generarRemision);
/**
 * @swagger
 * /api/remisiones/pedido/{pedido_id}/pendiente:
 *   get:
 *     summary: Obtener items pendientes de surtir de un pedido
 *     tags: [Admin - Remisiones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: pedido_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del pedido
 *         example: 123
 *     responses:
 *       200:
 *         description: Items pendientes obtenidos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 items:
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
router.get('/pedido/:pedido_id/pendiente', remisionesController.obtenerItemsPendientesSurtir);
/**
 * @swagger
 * /api/remisiones/{id}:
 *   get:
 *     summary: Obtener detalle de una remisión
 *     tags: [Admin - Remisiones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la remisión
 *         example: 50
 *     responses:
 *       200:
 *         description: Remisión obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 remision:
 *                   type: object
 *       401:
 *         description: No autenticado o no es admin
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Remisión no encontrada
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
router.get('/:id', remisionesController.obtenerRemision);
/**
 * @swagger
 * /api/remisiones:
 *   get:
 *     summary: Listar todas las remisiones
 *     tags: [Admin - Remisiones]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Remisiones obtenidas exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 remisiones:
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
router.get('/', remisionesController.listarRemisiones);
/**
 * @swagger
 * /api/remisiones/{id}/cancelar:
 *   put:
 *     summary: Cancelar una remisión
 *     tags: [Admin - Remisiones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la remisión
 *         example: 50
 *     responses:
 *       200:
 *         description: Remisión cancelada exitosamente
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
 *         description: Remisión no encontrada
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
router.put('/:id/cancelar', remisionesController.cancelarRemision);

module.exports = router;
