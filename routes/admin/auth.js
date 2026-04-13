const express = require("express");
const router = express.Router();
const authAdminController = require("../../controllers/authAdminController");
const { loginAdminSchema } = require("../../middlewares/validators/schemas");
const validate = require("../../middlewares/validate");
const { authenticate, authorizeAdmin } = require("../../middlewares/roleMiddleware");
const { authLimiter } = require("../../middlewares/rateLimiter");

/**
 * @swagger
 * /api/admin/login:
 *   post:
 *     summary: Login de administrador
 *     tags: [Admin - Autenticación]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Login exitoso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         description: Credenciales inválidas
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: Demasiados intentos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

/**
 * Rutas de autenticación de admin (públicas)
 */
// 🔒 SECURITY: Rate limited a 10 intentos cada 15 minutos
router.post("/login", authLimiter, loginAdminSchema, validate, authAdminController.loginAdmin);

/**
 * @swagger
 * /api/admin/verify:
 *   get:
 *     summary: Verificar autenticación de administrador
 *     tags: [Admin - Autenticación]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Admin verificado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 admin:
 *                   type: object
 *       401:
 *         description: No autenticado o no es admin
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  "/verify",
  authenticate,
  authorizeAdmin,
  authAdminController.verifyAdmin
);

module.exports = router;
