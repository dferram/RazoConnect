const express = require("express");
const router = express.Router();
const pedidosController = require("../controllers/pedidosController");
const pdfController = require("../controllers/pdfController");
const { authenticate, authorize } = require("../middlewares/authMiddleware");
const checkCreditStatus = require("../middlewares/checkCreditStatus");
const uploadComprobante = require("../middlewares/uploadComprobante");

/**
 * @route   GET /api/pedidos
 * @desc    Obtener historial de pedidos del cliente logueado
 * @access  Private (Cliente)
 */
router.get(
  "/pedidos",
  authenticate,
  authorize(["cliente"]),
  pedidosController.obtenerPedidos
);
router.get(
  "/pedidos/:id",
  authenticate,
  authorize(["cliente"]),
  pedidosController.obtenerPedidoPorId
);

/**
 * @route   POST /api/pedidos
 * @desc    Crear un nuevo pedido desde el carrito
 * @access  Private (Cliente)
 * @body    { DireccionEnvioID, CodigoAgente (opcional) }
 */
router.post(
  "/pedidos",
  authenticate,
  authorize(["cliente"]),
  pedidosController.crearPedido
);

router.post(
  "/pedidos/finalizar",
  authenticate,
  authorize(["cliente"]),
  uploadComprobante.single("comprobante"),
  checkCreditStatus(),
  pedidosController.crearPedido
);

/**
 * @route   GET /api/pedidos/:id/payment-trigger
 * @desc    Verificar si el pedido tiene remisión y obtener datos de pago
 * @access  Private (Cliente propietario)
 */
router.get(
  "/pedidos/:id/payment-trigger",
  authenticate,
  authorize(["cliente"]),
  pedidosController.obtenerDatosPago
);

/**
 * @route   GET /api/pedidos/:id/pdf
 * @desc    Generar PDF de remisión para un pedido
 * @access  Private (Cliente propietario o Admin)
 */
router.get(
  "/pedidos/:id/pdf",
  authenticate,
  authorize(["cliente", "admin", "superadmin"]),
  pdfController.generarPDFPedido
);

module.exports = router;
