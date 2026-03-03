const express = require("express");
const router = express.Router();
const { authenticate, authorizeRole } = require("../middlewares/roleMiddleware");
const creditoController = require("../controllers/creditoController");

// Rutas protegidas con roles granulares
router.get(
  "/pendientes", 
  authenticate, 
  authorizeRole(['super_admin', 'admin', 'encargado_credito', 'gerente_finanzas']),
  creditoController.obtenerSolicitudesPendientes
);

router.get(
  "/analisis/:solicitud_id", 
  authenticate, 
  authorizeRole(['super_admin', 'admin', 'encargado_credito', 'gerente_finanzas']),
  creditoController.analizarRiesgoCredito
);

router.post(
  "/aprobar", 
  authenticate, 
  authorizeRole(['super_admin', 'admin', 'encargado_credito']),
  creditoController.aprobarSolicitud
);

router.post(
  "/rechazar", 
  authenticate, 
  authorizeRole(['super_admin', 'admin', 'encargado_credito']),
  creditoController.rechazarSolicitud
);

module.exports = router;
