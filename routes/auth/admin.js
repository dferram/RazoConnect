const express = require("express");
const router = express.Router();
const adminAuthController = require("../../controllers/auth/adminAuthController");
const { registerLimiter } = require("../../middlewares/rateLimiter");

/**
 * @swagger
 * /api/auth/registro-admin:
 *   post:
 *     summary: Registrar un nuevo administrador
 *     description: Requiere SUPER_ADMIN_KEY en el body para autorización
 *     tags: [Autenticación]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [Nombre, Apellido, Email, Password, adminKey]
 *             properties:
 *               Nombre:
 *                 type: string
 *                 example: Carlos
 *               Apellido:
 *                 type: string
 *                 example: Admin
 *               Email:
 *                 type: string
 *                 format: email
 *                 example: admin@ejemplo.com
 *               Password:
 *                 type: string
 *                 format: password
 *                 example: AdminPass123!
 *               Rol:
 *                 type: string
 *                 enum: [admin, superadmin]
 *                 example: admin
 *               adminKey:
 *                 type: string
 *                 example: super-secret-key
 *     responses:
 *       201:
 *         description: Administrador registrado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Datos inválidos o adminKey incorrecta
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
router.post("/auth/registro-admin", registerLimiter, adminAuthController.registroAdmin);

module.exports = router;
