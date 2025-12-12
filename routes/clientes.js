const express = require("express");
const router = express.Router();

const {
  obtenerNotificacionesCliente,
  obtenerConteoNotificacionesNoLeidas,
} = require("../controllers/clientes/notificacionesController");
const { authenticate } = require("../middlewares/authMiddleware");

router.get("/notificaciones", authenticate, obtenerNotificacionesCliente);
router.get(
  "/notificaciones/count",
  authenticate,
  obtenerConteoNotificacionesNoLeidas
);

module.exports = router;
