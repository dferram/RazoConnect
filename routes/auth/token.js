const express = require("express");
const router = express.Router();
const tokenController = require("../../controllers/auth/tokenController");

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Renovar Access Token usando Refresh Token
 *     tags: [Autenticación]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *     responses:
 *       200:
 *         description: Access token renovado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 accessToken:
 *                   type: string
 *       401:
 *         description: Refresh token inválido o expirado
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
router.post("/auth/refresh", tokenController.refreshAccessToken);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Cerrar sesión (invalidar Refresh Token)
 *     tags: [Autenticación]
 *     security: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: integer
 *                 example: 123
 *               rol:
 *                 type: string
 *                 enum: [cliente, agente, admin, super_admin]
 *                 example: cliente
 *     responses:
 *       200:
 *         description: Sesión cerrada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/auth/logout", tokenController.logout);

/**
 * @swagger
 * /api/auth/session-status:
 *   get:
 *     summary: Verificar si existe una sesión activa
 *     tags: [Autenticación]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 123
 *       - in: query
 *         name: rol
 *         required: true
 *         schema:
 *           type: string
 *           enum: [cliente, agente, admin, super_admin]
 *         example: cliente
 *     responses:
 *       200:
 *         description: Estado de sesión obtenido
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 hasActiveSession:
 *                   type: boolean
 *                   example: true
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/auth/session-status", tokenController.checkSessionStatus);

module.exports = router;
