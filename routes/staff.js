const express = require("express");
const router = express.Router();

const notificacionesController = require("../controllers/notificacionesController");
const numCuentaController = require("../controllers/numCuentaController");
const { authenticate, authorize } = require("../middlewares/authMiddleware");

/**
 * @swagger
 * /api/staff/notificaciones:
 *   get:
 *     summary: Obtener notificaciones del staff
 *     tags: [Staff]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notificaciones obtenidas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 notificaciones:
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
router.get(
  "/notificaciones",
  authenticate,
  authorize(["admin", "superadmin", "super_admin", "agente"]),
  notificacionesController.obtenerNotificacionesStaff
);

/**
 * @swagger
 * /api/staff/notificaciones/unread-count:
 *   get:
 *     summary: Obtener conteo de notificaciones no leídas
 *     tags: [Staff]
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
 *                   example: 7
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
router.get(
  "/notificaciones/unread-count",
  authenticate,
  authorize(["admin", "superadmin", "super_admin", "agente"]),
  notificacionesController.obtenerConteoNoLeidasStaff
);

/**
 * @swagger
 * /api/staff/notificaciones/marcar-todas-leidas:
 *   post:
 *     summary: Marcar todas las notificaciones como leídas
 *     tags: [Staff]
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
router.post(
  "/notificaciones/marcar-todas-leidas",
  authenticate,
  authorize(["admin", "superadmin", "super_admin", "agente"]),
  notificacionesController.marcarTodasLeidasStaff
);

/**
 * @swagger
 * /api/staff/numcuenta:
 *   get:
 *     summary: Obtener número de cuenta del agente
 *     tags: [Staff]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Número de cuenta obtenido
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 numeroCuenta:
 *                   type: string
 *                   example: "1234567890"
 *       401:
 *         description: No autenticado o no es agente
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
  "/numcuenta",
  authenticate,
  authorize(["agente"]),
  numCuentaController.obtenerCuentaAgente
);

/**
 * @swagger
 * /api/staff/numcuenta:
 *   put:
 *     summary: Actualizar número de cuenta del agente
 *     tags: [Staff]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [numeroCuenta]
 *             properties:
 *               numeroCuenta:
 *                 type: string
 *                 example: "9876543210"
 *     responses:
 *       200:
 *         description: Número de cuenta actualizado
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
 *         description: No autenticado o no es agente
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
  "/numcuenta",
  authenticate,
  authorize(["agente"]),
  numCuentaController.actualizarCuentaAgente
);

module.exports = router;
