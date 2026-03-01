const express = require("express");
const router = express.Router();
const { authenticate, authorizeAdmin } = require("../middlewares/authMiddleware");
const solicitudesCreditoController = require("../controllers/solicitudesCreditoController");

/**
 * @swagger
 * /api/pendientes:
 *   get:
 *     summary: Obtener solicitudes de crédito pendientes
 *     tags: [Admin - Solicitudes de Crédito]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Solicitudes pendientes obtenidas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 solicitudes:
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
  "/pendientes",
  authenticate,
  authorizeAdmin,
  solicitudesCreditoController.obtenerSolicitudesPendientes
);

/**
 * @swagger
 * /api/{id}/analisis:
 *   get:
 *     summary: Obtener análisis de solicitud de crédito
 *     tags: [Admin - Solicitudes de Crédito]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la solicitud
 *         example: 15
 *     responses:
 *       200:
 *         description: Análisis obtenido exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 analisis:
 *                   type: object
 *       401:
 *         description: No autenticado o no es admin
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Solicitud no encontrada
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
  "/:id/analisis",
  authenticate,
  authorizeAdmin,
  solicitudesCreditoController.obtenerAnalisisSolicitud
);

/**
 * @swagger
 * /api/{id}/aprobar:
 *   post:
 *     summary: Aprobar solicitud de crédito
 *     tags: [Admin - Solicitudes de Crédito]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la solicitud
 *         example: 15
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [limiteCredito]
 *             properties:
 *               limiteCredito:
 *                 type: number
 *                 example: 50000
 *     responses:
 *       200:
 *         description: Solicitud aprobada exitosamente
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
 *         description: Solicitud no encontrada
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
  "/:id/aprobar",
  authenticate,
  authorizeAdmin,
  solicitudesCreditoController.aprobarSolicitud
);

/**
 * @swagger
 * /api/{id}/rechazar:
 *   post:
 *     summary: Rechazar solicitud de crédito
 *     tags: [Admin - Solicitudes de Crédito]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la solicitud
 *         example: 15
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
 *                 example: Historial crediticio insuficiente
 *     responses:
 *       200:
 *         description: Solicitud rechazada exitosamente
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
 *         description: Solicitud no encontrada
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
  "/:id/rechazar",
  authenticate,
  authorizeAdmin,
  solicitudesCreditoController.rechazarSolicitud
);

module.exports = router;
