const express = require("express");
const router = express.Router();

const {
  obtenerNotificacionesCliente,
  obtenerConteoNotificacionesNoLeidas,
} = require("../controllers/clientes/notificacionesController");
const { checkAuthCredit } = require("../controllers/clientes/creditoController");
const { authenticate } = require("../middlewares/authMiddleware");

router.get("/notificaciones", authenticate, obtenerNotificacionesCliente);
router.get(
  "/notificaciones/count",
  authenticate,
  obtenerConteoNotificacionesNoLeidas
);

router.get("/check-auth-credit", authenticate, checkAuthCredit);

module.exports = router;
