const express = require("express");
const router = express.Router();

const {
  obtenerNotificacionesCliente,
} = require("../controllers/clientes/notificacionesController");
const { authenticate } = require("../middlewares/authMiddleware");

router.get("/notificaciones", authenticate, obtenerNotificacionesCliente);

module.exports = router;
