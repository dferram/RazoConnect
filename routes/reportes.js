const express = require('express');
const router = express.Router();
const { authenticate, authorizeAdmin } = require('../middlewares/authMiddleware');
const reportesController = require('../controllers/reportesController');

// Reporte de rentabilidad
router.get(
  '/rentabilidad',
  authenticate,
  authorizeAdmin,
  reportesController.getReporteRentabilidad
);

router.get(
  '/valuacion-inventario',
  authenticate,
  authorizeAdmin,
  reportesController.getValuacionInventario
);

router.get(
  '/aging-backorders',
  authenticate,
  authorizeAdmin,
  reportesController.getAgingBackorders
);

module.exports = router;
