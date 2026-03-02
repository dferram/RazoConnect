const express = require("express");
const router = express.Router();
const pedidosController = require("../controllers/pedidosController");
const pdfController = require("../controllers/pdfController");
const facturaController = require("../controllers/facturaController");
const { authenticate, authorize } = require("../middlewares/authMiddleware");
const checkCreditStatus = require("../middlewares/checkCreditStatus");
const uploadComprobante = require("../middlewares/uploadComprobante");
const { heavyOperationLimiter } = require("../middlewares/rateLimiter");

/**
 * @swagger
 * /api/pedidos:
 *   get:
 *     summary: Obtener historial de pedidos del cliente logueado
 *     tags: [Pedidos]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pedidos obtenidos exitosamente
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
  "/pedidos",
  authenticate,
  authorize(["cliente"]),
  pedidosController.obtenerPedidos
);
/**
 * @swagger
 * /api/pedidos/{id}:
 *   get:
 *     summary: Obtener detalle de un pedido específico
 *     tags: [Pedidos]
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
 *         description: Pedido obtenido exitosamente
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
 *         description: No autenticado
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
  "/pedidos/:id",
  authenticate,
  authorize(["cliente"]),
  pedidosController.obtenerPedidoPorId
);

/**
 * @swagger
 * /api/pedidos:
 *   post:
 *     summary: Crear un nuevo pedido desde el carrito
 *     tags: [Pedidos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [DireccionEnvioID]
 *             properties:
 *               DireccionEnvioID:
 *                 type: integer
 *                 example: 5
 *               CodigoAgente:
 *                 type: string
 *                 example: AG-001
 *     responses:
 *       201:
 *         description: Pedido creado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Datos inválidos o carrito vacío
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
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
  "/pedidos",
  authenticate,
  authorize(["cliente"]),
  pedidosController.crearPedido
);

/**
 * @swagger
 * /api/pedidos/finalizar:
 *   post:
 *     summary: Finalizar pedido con comprobante de pago
 *     tags: [Pedidos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               comprobante:
 *                 type: string
 *                 format: binary
 *               DireccionEnvioID:
 *                 type: integer
 *                 example: 5
 *     responses:
 *       201:
 *         description: Pedido finalizado exitosamente
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
  "/pedidos/finalizar",
  authenticate,
  authorize(["cliente"]),
  heavyOperationLimiter,
  uploadComprobante.single("comprobante"),
  checkCreditStatus(),
  pedidosController.crearPedido
);

/**
 * @swagger
 * /api/pedidos/{id}/payment-trigger:
 *   get:
 *     summary: Verificar si el pedido tiene remisión y obtener datos de pago
 *     tags: [Pedidos]
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
 *         description: Datos de pago obtenidos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 datosPago:
 *                   type: object
 *       401:
 *         description: No autenticado
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
  "/pedidos/:id/payment-trigger",
  authenticate,
  authorize(["cliente"]),
  pedidosController.obtenerDatosPago
);

/**
 * @swagger
 * /api/pedidos/{id}/cancelar:
 *   put:
 *     summary: Cancelar un pedido (solo si no está confirmado)
 *     tags: [Pedidos]
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
 *         description: Pedido cancelado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: El pedido no puede ser cancelado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: No autenticado
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
  "/pedidos/:id/cancelar",
  authenticate,
  authorize(["cliente"]),
  pedidosController.cancelarPedido
);

/**
 * @swagger
 * /api/pedidos/{id}/factura:
 *   get:
 *     summary: Descargar factura PDF de un pedido (solo pedidos Surtido/Enviado/Entregado)
 *     tags: [Pedidos]
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
 *         description: Factura PDF generada exitosamente
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Pedido en estatus no válido para facturación
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: No autenticado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: No tiene permisos para descargar esta factura
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
  "/pedidos/:id/factura",
  authenticate,
  authorize(["cliente", "admin", "agente", "super_admin"]),
  heavyOperationLimiter,
  facturaController.descargarFactura
);

/**
 * @swagger
 * /api/pedidos/{id}/pdf:
 *   get:
 *     summary: Generar PDF de remisión para un pedido
 *     tags: [Pedidos]
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
 *         description: PDF generado exitosamente
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         description: No autenticado
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
  "/pedidos/:id/pdf",
  authenticate,
  authorize(["cliente", "admin", "agente", "superadmin", "super_admin"]),
  heavyOperationLimiter,
  pdfController.generarPDFPedido
);

module.exports = router;
