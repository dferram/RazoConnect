const express = require("express");
const router = express.Router();
const { authenticate, authorizeAdmin } = require("../middlewares/authMiddleware");
const solicitudesCreditoController = require("../controllers/solicitudesCreditoController");

// Rutas para administradores
router.get(
  "/pendientes",
  authenticate,
  authorizeAdmin,
  solicitudesCreditoController.obtenerSolicitudesPendientes
);

router.get(
  "/:id/analisis",
  authenticate,
  authorizeAdmin,
  solicitudesCreditoController.obtenerAnalisisSolicitud
);

router.post(
  "/:id/aprobar",
  authenticate,
  authorizeAdmin,
  solicitudesCreditoController.aprobarSolicitud
);

router.post(
  "/:id/rechazar",
  authenticate,
  authorizeAdmin,
  solicitudesCreditoController.rechazarSolicitud
);

module.exports = router;
