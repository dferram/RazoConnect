const express = require("express");
const router = express.Router();

const {
  obtenerNotificacionesCliente,
  obtenerConteoNotificacionesNoLeidas,
} = require("../controllers/clientes/notificacionesController");
const {
  checkAuthCredit,
  obtenerPerfilCredito,
  obtenerMovimientosCredito,
  registrarPagoCliente,
  obtenerMovimientosPendientes,
  enviarSolicitudCredito,
} = require("../controllers/clientes/creditoController");
const { authenticate } = require("../middlewares/authMiddleware");

router.get("/notificaciones", authenticate, obtenerNotificacionesCliente);
router.get(
  "/notificaciones/count",
  authenticate,
  obtenerConteoNotificacionesNoLeidas
);

router.get("/check-auth-credit", authenticate, checkAuthCredit);
router.get("/perfil-credito", authenticate, obtenerPerfilCredito);
router.get("/credito", authenticate, obtenerMovimientosCredito);
router.get("/credito/pendientes", authenticate, obtenerMovimientosPendientes);
router.post("/pagar-credito", authenticate, registrarPagoCliente);
router.post("/solicitar-credito", authenticate, enviarSolicitudCredito);

module.exports = router;
