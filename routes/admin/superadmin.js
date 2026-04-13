const express = require("express");
const router = express.Router();
const adminAuthController = require("../../controllers/auth/adminAuthController");
const changeRequestController = require("../../controllers/changeRequestController");
const { authenticate, authorizeSuperAdmin } = require("../../middlewares/roleMiddleware");

/**
 * Rutas de super-admin (requieren autenticación y rol super-admin)
 */

router.post(
  "/crear-admin",
  authenticate,
  authorizeSuperAdmin,
  adminAuthController.crearAdmin
);

router.post(
  "/cambios/aprobar-lote",
  authenticate,
  authorizeSuperAdmin,
  changeRequestController.aprobarCambios
);

router.post(
  "/cambios/rechazar-lote",
  authenticate,
  authorizeSuperAdmin,
  changeRequestController.rechazarCambios
);

router.get(
  "/cambios/pendientes",
  authenticate,
  authorizeSuperAdmin,
  changeRequestController.obtenerPendientes
);

module.exports = router;
