const express = require("express");
const router = express.Router();
const pedidosController = require("../controllers/pedidosController");
const { authenticate, authorize } = require("../middlewares/authMiddleware");

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

module.exports = router;
