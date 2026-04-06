const express = require('express');
const router = express.Router();
const { obtenerEstados } = require('../controllers/direccionesController');
const { getAllEstados } = require('../controllers/estadosController');
const landingEditorController = require('../controllers/landingEditorController');
const { authenticate } = require('../middlewares/authMiddleware');

/**
 * @swagger
 * /api/estados:
 *   get:
 *     summary: Obtener todos los estados disponibles
 *     tags: [Público]
 *     security: []
 *     responses:
 *       200:
 *         description: Estados obtenidos exitosamente
 *       500:
 *         description: Error del servidor
 */
router.get('/estados-all', getAllEstados);

/**
 * @swagger
 * /api/public/estados:
 *   get:
 *     summary: Obtener catálogo de estados
 *     tags: [Público]
 *     security: []
 *     responses:
 *       200:
 *         description: Estados obtenidos exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 estados:
 *                   type: array
 *                   items:
 *                     type: object
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/estados', obtenerEstados);

/**
 * @swagger
 * /api/landing-content:
 *   get:
 *     summary: Obtener contenido dinámico de la landing page
 *     tags: [Público]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: preview
 *         schema:
 *           type: string
 *           enum: [true, false]
 *         description: Modo preview (requiere autenticación admin)
 *         example: false
 *     responses:
 *       200:
 *         description: Contenido obtenido exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 content:
 *                   type: object
 *       401:
 *         description: No autenticado (solo en modo preview)
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
router.get('/landing-content', (req, res, next) => {
  if (req.query.preview === 'true') {
    return authenticate(req, res, next);
  }
  next();
}, landingEditorController.getPublicContent);

/**
 * @swagger
 * /api/public/landing-items:
 *   get:
 *     summary: Obtener categorías y marcas con imágenes para landing page
 *     tags: [Público]
 *     security: []
 *     responses:
 *       200:
 *         description: Items obtenidos exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 categorias:
 *                   type: array
 *                   items:
 *                     type: object
 *                 marcas:
 *                   type: array
 *                   items:
 *                     type: object
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/landing-items', landingEditorController.getPublicLandingItems);

module.exports = router;
