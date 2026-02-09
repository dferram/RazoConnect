const express = require('express');
const router = express.Router();
const devolucionesController = require('../controllers/devolucionesController');
const { authenticate, authorizeAdmin } = require('../middlewares/authMiddleware');

// =====================================================
// RUTAS DE CLIENTE
// =====================================================

// Crear nueva solicitud de devolución
router.post(
  '/cliente/devoluciones',
  authenticate,
  devolucionesController.solicitarDevolucion
);

// Subir evidencias (fotos)
router.post(
  '/cliente/devoluciones/:id/evidencias',
  authenticate,
  devolucionesController.subirEvidencia
);

// Listar mis devoluciones
router.get(
  '/cliente/devoluciones',
  authenticate,
  devolucionesController.obtenerMisDevoluciones
);

// Ver detalle de una devolución
router.get(
  '/cliente/devoluciones/:id',
  authenticate,
  devolucionesController.obtenerDetalleDevolucion
);

// =====================================================
// RUTAS DE ADMIN
// =====================================================

// Listar todas las devoluciones (con filtros)
router.get(
  '/admin/devoluciones',
  authenticate,
  authorizeAdmin,
  devolucionesController.obtenerTodasDevoluciones
);

// Ver detalle de una devolución (admin usa el mismo endpoint que cliente)
router.get(
  '/admin/devoluciones/:id',
  authenticate,
  authorizeAdmin,
  devolucionesController.obtenerDetalleDevolucion
);

// Aprobar devolución
router.post(
  '/admin/devoluciones/:id/aprobar',
  authenticate,
  authorizeAdmin,
  devolucionesController.aprobarDevolucion
);

// Rechazar devolución
router.post(
  '/admin/devoluciones/:id/rechazar',
  authenticate,
  authorizeAdmin,
  devolucionesController.rechazarDevolucion
);

module.exports = router;
