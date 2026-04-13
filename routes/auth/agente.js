const express = require("express");
const router = express.Router();
const agenteAuthController = require("../../controllers/auth/agenteAuthController");
const agentesController = require("../../controllers/agentesController");
const { authenticate, authorize } = require("../../middlewares/authMiddleware");
const { registerLimiter } = require("../../middlewares/rateLimiter");

/**
 * @swagger
 * /api/registro/agente:
 *   post:
 *     summary: Registrar un nuevo agente de ventas
 *     tags: [Autenticación]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [Nombre, Apellido, Email, Password, CodigoAgente]
 *             properties:
 *               Nombre:
 *                 type: string
 *                 example: María
 *               Apellido:
 *                 type: string
 *                 example: García
 *               Email:
 *                 type: string
 *                 format: email
 *                 example: maria@ejemplo.com
 *               Password:
 *                 type: string
 *                 format: password
 *                 example: Password123!
 *               CodigoAgente:
 *                 type: string
 *                 example: AG-001
 *     responses:
 *       201:
 *         description: Agente registrado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Datos inválidos o código de agente inválido
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
router.post("/registro/agente", registerLimiter, agenteAuthController.registroAgente);

/**
 * @swagger
 * /api/agentes/vincular-cliente:
 *   post:
 *     summary: Vincular un cliente a un agente
 *     tags: [Autenticación]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [clienteId]
 *             properties:
 *               clienteId:
 *                 type: integer
 *                 example: 45
 *     responses:
 *       200:
 *         description: Cliente vinculado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
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
router.post(
  "/agentes/vincular-cliente",
  authenticate,
  authorize(["agente"]),
  agentesController.vincularCliente
);

/**
 * @swagger
 * /api/agentes/mis-clientes:
 *   get:
 *     summary: Obtener lista de clientes del agente
 *     tags: [Autenticación]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de clientes obtenida
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 clientes:
 *                   type: array
 *                   items:
 *                     type: object
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
  "/agentes/mis-clientes",
  authenticate,
  authorize(["agente"]),
  agentesController.obtenerClientesDelAgente
);

router.get(
  "/agente/clientes",
  authenticate,
  authorize(["agente"]),
  agentesController.obtenerClientesDelAgente
);

/**
 * @swagger
 * /api/agentes/clientes-disponibles:
 *   get:
 *     summary: Obtener clientes disponibles para vincular
 *     tags: [Autenticación]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de clientes disponibles
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 clientes:
 *                   type: array
 *                   items:
 *                     type: object
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
  "/agentes/clientes-disponibles",
  authenticate,
  authorize(["agente"]),
  agentesController.obtenerClientesDisponibles
);

/**
 * @swagger
 * /api/agente/pedidos:
 *   get:
 *     summary: Obtener pedidos del agente
 *     tags: [Autenticación]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de pedidos del agente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 pedidos:
 *                   type: array
 *                   items:
 *                     type: object
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
  "/agente/pedidos",
  authenticate,
  authorize(["agente"]),
  agentesController.obtenerPedidosDelAgente
);

/**
 * @swagger
 * /api/agente/pedidos/{id}:
 *   get:
 *     summary: Obtener detalle de un pedido específico
 *     tags: [Autenticación]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del pedido
 *         example: 123
 *     responses:
 *       200:
 *         description: Detalle del pedido obtenido
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 pedido:
 *                   type: object
 *       401:
 *         description: No autenticado o no es agente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Pedido no encontrado
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
  "/agente/pedidos/:id",
  authenticate,
  authorize(["agente"]),
  agentesController.obtenerPedidoDetalleAgente
);

/**
 * @swagger
 * /api/agente/pedidos/{id}/estatus:
 *   put:
 *     summary: Actualizar estatus de un pedido
 *     tags: [Autenticación]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del pedido
 *         example: 123
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               estatus:
 *                 type: string
 *                 example: Entregado
 *     responses:
 *       200:
 *         description: Estatus actualizado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         description: No autenticado o no es agente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Pedido no encontrado
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
  "/agente/pedidos/:id/estatus",
  authenticate,
  authorize(["agente"]),
  agentesController.actualizarEstatusPedidoAgente
);

router.post(
  "/agente/pedidos/:id/solicitar-estatus",
  authenticate,
  authorize(["agente"]),
  agentesController.solicitarCambioEstatusPedidoAgente
);

router.post(
  "/agentes/pedidos/:id/solicitar-confirmacion",
  authenticate,
  authorize(["agente"]),
  agentesController.solicitarConfirmacionPedidoAgente
);

/**
 * @swagger
 * /api/agente/dashboard-stats:
 *   get:
 *     summary: Obtener estadísticas del dashboard del agente
 *     tags: [Autenticación]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Estadísticas obtenidas exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 stats:
 *                   type: object
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
  "/agente/dashboard-stats",
  authenticate,
  authorize(["agente"]),
  agentesController.obtenerDashboardStats
);

router.get(
  "/agente/comisiones",
  authenticate,
  authorize(["agente"]),
  agentesController.obtenerComisionesDelAgente
);

router.get(
  "/agente/cxc",
  authenticate,
  authorize(["agente"]),
  agentesController.getCxCAgente
);

module.exports = router;
