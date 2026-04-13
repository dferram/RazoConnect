const express = require("express");
const router = express.Router();
const { authenticate } = require("../../middlewares/authMiddleware");

/**
 * @swagger
 * /api/auth/mis-permisos:
 *   get:
 *     summary: Obtener permisos del usuario autenticado
 *     description: |
 *       Retorna el rol y permisos del usuario para que el frontend sepa qué secciones mostrar.
 *
 *       **Sistema de Manejo de Errores:**
 *       - Errores 401/403/429/500/503 redirigen automáticamente a páginas HTML personalizadas
 *       - El frontend intercepta estos errores y limpia la sesión cuando es necesario
 *     tags: [Autenticación]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Permisos obtenidos exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 rol:
 *                   type: string
 *                   example: gerente_finanzas
 *                 permisos:
 *                   type: object
 *                   description: Mapa de módulos y sus acciones permitidas
 *                   example:
 *                     finanzas: ["ver", "editar", "aprobar"]
 *                     credito: ["ver", "aprobar"]
 *                     reportes: ["ver"]
 *       401:
 *         description: |
 *           **No autenticado** - Token inválido o expirado
 *
 *           El frontend automáticamente:
 *           - Limpia localStorage (admin, agente, cliente, permissions)
 *           - Redirige a `/401.html`
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Token no proporcionado
 *       500:
 *         description: |
 *           **Error del servidor** - Error interno no manejado
 *
 *           El frontend automáticamente redirige a `/500.html`
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Error al obtener permisos del usuario
 */
router.get(
  "/auth/mis-permisos",
  authenticate,
  async (req, res) => {
    try {
      const permisosService = require('../../services/permisosService');
      const permisos = await permisosService.getPermisosRol(req.user.rol);

      res.json({
        success: true,
        rol: req.user.rol,
        permisos: permisos
      });
    } catch (error) {
      console.error('Error obteniendo permisos:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener permisos del usuario'
      });
    }
  }
);

module.exports = router;
