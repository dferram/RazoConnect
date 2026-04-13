const express = require("express");
const router = express.Router();
const profileController = require("../../controllers/auth/profileController");
const { authenticate } = require("../../middlewares/authMiddleware");
const passport = require("passport");

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Obtener información del usuario actual
 *     tags: [Autenticación]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Información del usuario obtenida
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 nombre:
 *                   type: string
 *                   example: Juan Pérez
 *                 email:
 *                   type: string
 *                   example: juan@ejemplo.com
 *                 rol:
 *                   type: string
 *                   example: cliente
 *                 iniciales:
 *                   type: string
 *                   example: JP
 *                 tipo:
 *                   type: string
 *                   example: cliente
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
router.get("/auth/me", authenticate, profileController.getCurrentUser);

router.get(
  "/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    prompt: "select_account",
  })
);

router.get(
  "/auth/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: "/login.html",
  }),
  profileController.googleCallback
);

module.exports = router;
