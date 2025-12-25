const express = require("express");
const router = express.Router();
const { authenticate } = require("../middlewares/authMiddleware");
const { authorizeAdmin } = require("../middlewares/checkCreditAccess");
const creditoController = require("../controllers/creditoController");

// Rutas protegidas para administradores
router.get("/pendientes", authenticate, authorizeAdmin, creditoController.obtenerSolicitudesPendientes);
router.get("/analisis/:solicitud_id", authenticate, authorizeAdmin, creditoController.analizarRiesgoCredito);
router.post("/aprobar", authenticate, authorizeAdmin, creditoController.aprobarSolicitud);
router.post("/rechazar", authenticate, authorizeAdmin, creditoController.rechazarSolicitud);

module.exports = router;
