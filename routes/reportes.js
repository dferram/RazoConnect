const express = require('express');
const router = express.Router();
const { authenticate, authorizeAdmin } = require('../middlewares/authMiddleware');
const reportesController = require('../controllers/reportesController');
const { heavyOperationLimiter } = require('../middlewares/rateLimiter');

// Reporte de rentabilidad
router.get(
  '/rentabilidad',
  authenticate,
  authorizeAdmin,
  heavyOperationLimiter,
  reportesController.getReporteRentabilidad
);

router.get(
  '/valuacion-inventario',
  authenticate,
  authorizeAdmin,
  heavyOperationLimiter,
  reportesController.getValuacionInventario
);

router.get(
  '/aging-backorders',
  authenticate,
  authorizeAdmin,
  heavyOperationLimiter,
  reportesController.getAgingBackorders
);

module.exports = router;
