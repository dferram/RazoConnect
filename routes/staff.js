const express = require("express");
const router = express.Router();

const notificacionesController = require("../controllers/notificacionesController");
const numCuentaController = require("../controllers/numCuentaController");
const { authenticate, authorize } = require("../middlewares/authMiddleware");

router.get(
  "/notificaciones",
  authenticate,
  authorize(["admin", "superadmin", "agente"]),
  notificacionesController.obtenerNotificacionesStaff
);

router.get(
  "/notificaciones/unread-count",
  authenticate,
  authorize(["admin", "superadmin", "agente"]),
  notificacionesController.obtenerConteoNoLeidasStaff
);

router.post(
  "/notificaciones/marcar-todas-leidas",
  authenticate,
  authorize(["admin", "superadmin", "agente"]),
  notificacionesController.marcarTodasLeidasStaff
);

router.get(
  "/numcuenta",
  authenticate,
  authorize(["agente"]),
  numCuentaController.obtenerCuentaAgente
);

router.put(
  "/numcuenta",
  authenticate,
  authorize(["agente"]),
  numCuentaController.actualizarCuentaAgente
);

module.exports = router;
