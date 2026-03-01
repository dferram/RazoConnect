const express = require('express');
const router = express.Router();
const favoritosController = require('../controllers/favoritosController');
const { authenticate } = require('../middlewares/authMiddleware');

/**
 * @swagger
 * /api/favoritos/toggle:
 *   post:
 *     summary: Agregar o quitar producto de favoritos
 *     tags: [Favoritos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [varianteId]
 *             properties:
 *               varianteId:
 *                 type: integer
 *                 example: 456
 *     responses:
 *       200:
 *         description: Favorito actualizado exitosamente
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
router.post('/toggle', authenticate, favoritosController.toggleFavorito);

/**
 * @swagger
 * /api/favoritos:
 *   get:
 *     summary: Obtener lista de favoritos del cliente
 *     tags: [Favoritos]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Favoritos obtenidos exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 favoritos:
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
router.get('/', authenticate, favoritosController.obtenerFavoritos);

/**
 * @swagger
 * /api/favoritos/verificar/{varianteId}:
 *   get:
 *     summary: Verificar si una variante está en favoritos
 *     tags: [Favoritos]
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
 *     responses:
 *       200:
 *         description: Estado de favorito obtenido
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 esFavorito:
 *                   type: boolean
 *                   example: true
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
router.get('/verificar/:varianteId', authenticate, favoritosController.verificarFavorito);

/**
 * @swagger
 * /api/favoritos/notificaciones/count:
 *   get:
 *     summary: Obtener conteo de notificaciones de restock
 *     tags: [Favoritos]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Conteo obtenido
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count:
 *                   type: integer
 *                   example: 3
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
router.get('/notificaciones/count', authenticate, favoritosController.contarNotificacionesRestock);

/**
 * @swagger
 * /api/favoritos/notificaciones/marcar-leidas:
 *   put:
 *     summary: Marcar notificaciones de restock como leídas
 *     tags: [Favoritos]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notificaciones marcadas como leídas
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
router.put('/notificaciones/marcar-leidas', authenticate, favoritosController.marcarNotificacionesLeidas);

module.exports = router;
