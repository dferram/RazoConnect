const express = require("express");
const router = express.Router();

const mercadoPagoController = require("../controllers/mercadoPagoController");
const db = require("../db");
const { authenticate, authorize } = require("../middlewares/authMiddleware");

router.post(
  "/procesar-tarjeta",
  authenticate,
  authorize(["cliente"]),
  mercadoPagoController.procesarPagoTarjeta
);

router.get(
  "/info-transferencia",
  authenticate,
  authorize(["cliente"]),
  async (req, res) => {
    try {
      const result = await db.query(
        `SELECT banco, numero_cuenta, clabe, titular
         FROM datos_bancarios_empresa
         WHERE es_principal = true
         LIMIT 1`
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "No hay cuenta bancaria configurada",
        });
      }

      res.json({
        success: true,
        cuenta: result.rows[0],
      });
    } catch (error) {
      console.error("Error al obtener información de transferencia:", error);
      res.status(500).json({
        success: false,
        error: "Error al obtener información bancaria",
      });
    }
  }
);

module.exports = router;
