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

module.exports = router;
