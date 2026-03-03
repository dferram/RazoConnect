const express = require('express');
const router = express.Router();
const { authenticate, authorizeRole, authorizeReportes } = require('../middlewares/roleMiddleware');
const reportesController = require('../controllers/reportesController');
const { heavyOperationLimiter } = require('../middlewares/rateLimiter');

/**
 * @swagger
 * /api/rentabilidad:
 *   get:
 *     summary: Obtener reporte de rentabilidad
 *     tags: [Admin - Reportes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Reporte de rentabilidad obtenido
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 reporte:
 *                   type: object
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
  '/rentabilidad',
  authenticate,
  authorizeRole(['super_admin', 'admin', 'gerente_finanzas', 'gerente_operaciones', 'gerente_comercial', 'contador', 'auditor_interno']),
  heavyOperationLimiter,
  reportesController.getReporteRentabilidad
);

/**
 * @swagger
 * /api/valuacion-inventario:
 *   get:
 *     summary: Obtener valuación del inventario
 *     tags: [Admin - Reportes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Valuación de inventario obtenida
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 valuacion:
 *                   type: object
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
  '/valuacion-inventario',
  authenticate,
  authorizeRole(['super_admin', 'admin', 'gerente_finanzas', 'gerente_operaciones', 'contador', 'auditor_interno']),
  heavyOperationLimiter,
  reportesController.getValuacionInventario
);

/**
 * @swagger
 * /api/aging-backorders:
 *   get:
 *     summary: Obtener reporte de antigüedad de backorders
 *     tags: [Admin - Reportes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Reporte de aging de backorders obtenido
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 backorders:
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
  '/aging-backorders',
  authenticate,
  authorizeRole(['super_admin', 'admin', 'gerente_operaciones', 'compras', 'auditor_interno']),
  heavyOperationLimiter,
  reportesController.getAgingBackorders
);

module.exports = router;
