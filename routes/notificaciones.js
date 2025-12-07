const express = require("express");
const router = express.Router();
const notificacionesController = require("../controllers/notificacionesController");
const { authenticate } = require("../middlewares/auth");

/**
 * Todas las rutas requieren autenticación de cliente
 */

// Obtener notificaciones del cliente autenticado
router.get("/", authenticate, notificacionesController.obtenerNotificaciones);

// Marcar notificación como leída
router.post(
  "/:id/marcar-leida",
  authenticate,
  notificacionesController.marcarComoLeida
);

// Marcar todas las notificaciones como leídas
router.post(
  "/marcar-todas-leidas",
  authenticate,
  notificacionesController.marcarTodasLeidas
);

// Eliminar una notificación
router.delete("/:id", authenticate, notificacionesController.eliminarNotificacion);

module.exports = router;
