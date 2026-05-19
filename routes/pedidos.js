const express = require("express");
const router = express.Router();
const pedidosController = require("../controllers/pedidosController");
const pdfController = require("../controllers/pdfController");
const facturaController = require("../controllers/facturaController");
const { authenticate, authorize } = require("../middlewares/authMiddleware");
const checkCreditStatus = require("../middlewares/checkCreditStatus");
const uploadComprobante = require("../middlewares/uploadComprobante");
const { heavyOperationLimiter } = require("../middlewares/rateLimiter");

// ==========================================
// NUEVOS CONTROLADORES ESPECIALIZADOS
// ==========================================
const pedidosClienteController = require("../controllers/pedidos/pedidosClienteController");
const pedidosInventarioController = require("../controllers/pedidos/pedidosInventarioController");
const pedidosFinanzasController = require("../controllers/pedidos/pedidosFinanzasController");

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
// PDF para clientes y agentes (vista simplificada)
const pdfClienteController = require('../controllers/pdf/pdfClienteController');
router.get(
  "/pedidos/:id/pdf",
  authenticate,
  authorize(["cliente", "agente"]),
  heavyOperationLimiter,
  pdfClienteController.generarPDFCliente
);

// ==========================================
// RUTAS INVENTARIOS
// ==========================================

/**
 * @swagger
 * /api/inventarios/pedidos:
 *   get:
 *     summary: Listar pedidos activos para inventarios
 *     tags: [Inventarios]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pedidos activos obtenidos
 *       403:
 *         description: No autorizado
 */
router.get(
  "/inventarios/pedidos",
  authenticate,
  authorize(["inventarios"]),
  pedidosInventarioController.listarPedidosInventarios
);

/**
 * @swagger
 * /api/inventarios/pedidos/{id}/surtir:
 *   post:
 *     summary: Marcar productos como Surtido (Con stock → Surtido)
 *     tags: [Inventarios]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [detalleIds]
 *             properties:
 *               detalleIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 example: [1, 2, 3]
 *     responses:
 *       200:
 *         description: Productos surtidos exitosamente
 *       400:
 *         description: Error en validación
 *       403:
 *         description: No autorizado
 */
router.post(
  "/inventarios/pedidos/:id/surtir",
  authenticate,
  authorize(["inventarios"]),
  pedidosInventarioController.surtirProductos
);

/**
 * @swagger
 * /api/inventarios/pedidos/{id}/marcar-backorder:
 *   post:
 *     summary: Marcar productos como Bajo pedido
 *     tags: [Inventarios]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [detalleIds]
 *             properties:
 *               detalleIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *     responses:
 *       200:
 *         description: Productos marcados como bajo pedido
 *       403:
 *         description: No autorizado
 */
router.post(
  "/inventarios/pedidos/:id/marcar-backorder",
  authenticate,
  authorize(["inventarios"]),
  pedidosInventarioController.marcarBajoPedido
);

// ==========================================
// RUTAS FINANZAS
// ==========================================

/**
 * @swagger
 * /api/finanzas/pedidos:
 *   get:
 *     summary: Listar pedidos listos para confirmar (Listo para remisionar)
 *     tags: [Finanzas]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pedidos listos para confirmar
 *       403:
 *         description: No autorizado
 */
router.get(
  "/finanzas/pedidos",
  authenticate,
  authorize(["finanzas", "gerente_finanzas"]),
  pedidosFinanzasController.listarPedidosFinanzas
);

/**
 * @swagger
 * /api/finanzas/pedidos/{id}/detalle:
 *   get:
 *     summary: Obtener detalle de pedido para finanzas
 *     tags: [Finanzas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Detalle del pedido con totales financieros
 *       403:
 *         description: No autorizado
 *       404:
 *         description: Pedido no encontrado
 */
router.get(
  "/finanzas/pedidos/:id/detalle",
  authenticate,
  authorize(["finanzas", "gerente_finanzas"]),
  pedidosFinanzasController.obtenerDetallePedidoFinanzas
);

/**
 * @swagger
 * /api/finanzas/pedidos/{id}/confirmar:
 *   post:
 *     summary: Confirmar surtido → Facturado (genera CXC)
 *     tags: [Finanzas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [detalleIds]
 *             properties:
 *               detalleIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *     responses:
 *       200:
 *         description: Surtido confirmado exitosamente
 *       403:
 *         description: No autorizado
 */
router.post(
  "/finanzas/pedidos/:id/confirmar",
  authenticate,
  authorize(["finanzas", "gerente_finanzas"]),
  pedidosFinanzasController.confirmarSurtido
);

/**
 * @swagger
 * /api/finanzas/pedidos/{id}/rechazar:
 *   post:
 *     summary: Rechazar surtido → Volver a Con stock (revierte stock)
 *     tags: [Finanzas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [detalleIds]
 *             properties:
 *               detalleIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *               motivo:
 *                 type: string
 *     responses:
 *       200:
 *         description: Surtido rechazado exitosamente
 *       403:
 *         description: No autorizado
 */
router.post(
  "/finanzas/pedidos/:id/rechazar",
  authenticate,
  authorize(["finanzas", "gerente_finanzas"]),
  pedidosFinanzasController.rechazarSurtido
);

// ==========================================
// RUTAS CLIENTE (NUEVAS - OPCIONAL)
// ==========================================
// Nota: Las rutas de cliente ya existen arriba usando pedidosController
// Estas son alternativas usando el nuevo controlador especializado
// Descomentar si quieres migrar a los nuevos controladores

/*
router.get(
  "/clientes/pedidos",
  authenticate,
  authorize(["cliente"]),
  pedidosClienteController.listarPedidosCliente
);

router.get(
  "/clientes/pedidos/:id",
  authenticate,
  authorize(["cliente"]),
  pedidosClienteController.obtenerDetallePedido
);

router.get(
  "/clientes/pedidos/:id/estado",
  authenticate,
  authorize(["cliente"]),
  pedidosClienteController.obtenerEstadoPedido
);
*/

module.exports = router;
