const express = require('express');
const router = express.Router();
const remisionesController = require('../controllers/remisionesController');
const { authenticate, authorizeAdmin, authorizeRole, requirePermission } = require('../middlewares/authMiddleware');

// Todas las rutas requieren autenticación
router.use(authenticate);

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
// Generar remisión: Solo finanzas y admin
router.post('/generar', authorizeRole(['finanzas', 'admin', 'super_admin']), remisionesController.generarRemision);
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
// Items pendientes: Finanzas, inventarios y admin
router.get('/pedido/:pedido_id/pendiente', authorizeRole(['finanzas', 'inventarios', 'admin', 'super_admin']), remisionesController.obtenerItemsPendientesSurtir);
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
// Ver remisión: Finanzas, almacenista, cliente (si es suya) y admin
router.get('/:id', authorizeAdmin, remisionesController.obtenerRemision);
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
// Listar remisiones: Finanzas, inventarios y admin
router.get('/', authorizeRole(['finanzas', 'inventarios', 'admin', 'super_admin']), remisionesController.listarRemisiones);
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
// Cancelar remisión: Solo finanzas y admin
router.put('/:id/cancelar', authorizeRole(['finanzas', 'admin', 'super_admin']), remisionesController.cancelarRemision);

/**
 * @swagger
 * /api/remisiones/{id}/confirmar-almacen:
 *   post:
 *     summary: Confirmar remisión después de verificación física (almacenista)
 *     tags: [Almacén - Remisiones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la remisión
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notas_almacen:
 *                 type: string
 *               discrepancias:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: Remisión confirmada por almacén
 *       400:
 *         description: Estado inválido
 *       403:
 *         description: Sin permisos
 */
router.post('/:id/confirmar-almacen', authorizeRole(['inventarios', 'admin', 'super_admin']), remisionesController.confirmarRemisionAlmacen);

/**
 * @swagger
 * /api/remisiones/{id}/corregir:
 *   put:
 *     summary: Corregir items de remisión sin cancelar
 *     tags: [Admin - Remisiones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               items_corregir:
 *                 type: array
 *                 items:
 *                   type: object
 *               motivo_correccion:
 *                 type: string
 *     responses:
 *       200:
 *         description: Remisión corregida
 *       400:
 *         description: Datos inválidos
 */
router.put('/:id/corregir', authorizeRole(['finanzas', 'inventarios', 'admin', 'super_admin']), remisionesController.corregirRemision);

/**
 * @swagger
 * /api/remisiones/{id}/confirmar-finanzas:
 *   post:
 *     summary: Confirmación final por finanzas - afecta CxC
 *     tags: [Finanzas - Remisiones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Remisión confirmada y CxC generado
 *       400:
 *         description: Estado inválido
 *       403:
 *         description: Sin permisos
 */
router.post('/:id/confirmar-finanzas', authorizeRole(['finanzas', 'admin', 'super_admin']), remisionesController.confirmarRemisionFinanzas);

/**
 * @swagger
 * /api/remisiones/{id}/rechazar-finanzas:
 *   post:
 *     summary: Rechazar remisión y regresar a almacén para corrección
 *     tags: [Finanzas - Remisiones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [observaciones_finanzas]
 *             properties:
 *               observaciones_finanzas:
 *                 type: string
 *     responses:
 *       200:
 *         description: Remisión regresada al almacén
 *       400:
 *         description: Estado inválido o faltan observaciones
 *       403:
 *         description: Sin permisos
 */
router.post('/:id/rechazar-finanzas', authorizeRole(['finanzas', 'admin', 'super_admin']), remisionesController.rechazarRemisionFinanzas);

module.exports = router;
