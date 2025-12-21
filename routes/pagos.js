const express = require("express");
const router = express.Router();

const mercadoPagoController = require("../controllers/mercadoPagoController");
const { authenticate, authorize } = require("../middlewares/authMiddleware");

router.post(
  "/procesar-tarjeta",
  authenticate,
  authorize(["cliente"]),
  mercadoPagoController.procesarPagoTarjeta
);

module.exports = router;
