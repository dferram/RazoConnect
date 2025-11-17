const express = require('express');
const router = express.Router();
const { obtenerEstados } = require('../controllers/direccionesController');

/**
 * @route   GET /api/public/estados
 * @desc    Obtener catálogo de estados
 * @access  Public
 */
router.get('/estados', obtenerEstados);

module.exports = router;
