const express = require('express');
const router = express.Router();
const carritoController = require('../controllers/carritoController');
const { authenticate, authorize } = require('../middlewares/authMiddleware');

/**
 * @swagger
 * /api/carrito:
 *   get:
 *     summary: Obtener el carrito del cliente logueado
 *     tags: [Carrito]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Carrito obtenido exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 carrito:
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
router.get('/carrito', authenticate, authorize(['cliente']), carritoController.obtenerCarrito);

/**
 * @swagger
 * /api/carrito:
 *   post:
 *     summary: Añadir variante al carrito
 *     tags: [Carrito]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [VarianteID, CantidadPaquetes]
 *             properties:
 *               VarianteID:
 *                 type: integer
 *                 example: 456
 *               CantidadPaquetes:
 *                 type: integer
 *                 example: 2
 *     responses:
 *       201:
 *         description: Producto agregado al carrito
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
router.post('/carrito', authenticate, authorize(['cliente']), carritoController.agregarAlCarrito);

/**
 * @swagger
 * /api/carrito/{varianteId}:
 *   put:
 *     summary: Actualizar cantidad de una variante en el carrito
 *     tags: [Carrito]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: varianteId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la variante
 *         example: 456
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [CantidadPaquetes]
 *             properties:
 *               CantidadPaquetes:
 *                 type: integer
 *                 example: 3
 *     responses:
 *       200:
 *         description: Cantidad actualizada exitosamente
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
router.put('/carrito/:varianteId', authenticate, authorize(['cliente']), carritoController.actualizarCarrito);

/**
 * @swagger
 * /api/carrito/item/{itemId}/cambiar-variante:
 *   put:
 *     summary: Cambiar la variante (medida) de una línea del carrito
 *     tags: [Carrito]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del item en el carrito
 *         example: 789
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nuevaVarianteId]
 *             properties:
 *               nuevaVarianteId:
 *                 type: integer
 *                 example: 460
 *     responses:
 *       200:
 *         description: Variante cambiada exitosamente
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
router.put(
  '/carrito/item/:itemId/cambiar-variante',
  authenticate,
  authorize(['cliente']),
  carritoController.cambiarVarianteItemCarrito
);

/**
 * @swagger
 * /api/carrito/{itemId}:
 *   delete:
 *     summary: Eliminar una línea específica del carrito
 *     tags: [Carrito]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del item en el carrito
 *         example: 789
 *     responses:
 *       200:
 *         description: Item eliminado exitosamente
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
 *       404:
 *         description: Item no encontrado
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
router.delete('/carrito/:itemId', authenticate, authorize(['cliente']), carritoController.eliminarDelCarrito);

module.exports = router;
