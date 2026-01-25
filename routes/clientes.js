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
  obtenerEstadoCuentaMensual,
} = require("../controllers/clientes/creditoController");
const {
  actualizarPerfil,
  cambiarPassword,
} = require("../controllers/clientes/perfilController");
const { authenticate } = require("../middlewares/authMiddleware");
const verifyTenantContext = require("../middlewares/verifyTenantContext");
const { generarPDFEstadoCuenta } = require("../controllers/pdfController");

router.get("/notificaciones", authenticate, verifyTenantContext, obtenerNotificacionesCliente);
router.get(
  "/notificaciones/count",
  authenticate,
  verifyTenantContext,
  obtenerConteoNotificacionesNoLeidas
);

router.put("/perfil", authenticate, verifyTenantContext, actualizarPerfil);
router.put("/cambiar-password", authenticate, verifyTenantContext, cambiarPassword);

router.get("/check-auth-credit", authenticate, verifyTenantContext, checkAuthCredit);
router.get("/perfil-credito", authenticate, verifyTenantContext, obtenerPerfilCredito);
router.get("/credito", authenticate, verifyTenantContext, obtenerMovimientosCredito);
router.get("/credito/pendientes", authenticate, verifyTenantContext, obtenerMovimientosPendientes);
router.get("/estado-cuenta/:mes/:anio", authenticate, verifyTenantContext, obtenerEstadoCuentaMensual);
router.get("/estado-cuenta/:mes/:anio/pdf", authenticate, verifyTenantContext, generarPDFEstadoCuenta);
router.post("/pagar-credito", authenticate, verifyTenantContext, registrarPagoCliente);
router.post("/solicitar-credito", authenticate, verifyTenantContext, enviarSolicitudCredito);

module.exports = router;
