const express = require('express');
const router = express.Router();
const carritoController = require('../controllers/carritoController');
const { authenticate, authorize } = require('../middlewares/authMiddleware');

/**
 * @route   GET /api/carrito
 * @desc    Obtener el carrito del cliente logueado
 * @access  Private (Cliente)
 */
router.get('/carrito', authenticate, authorize(['cliente']), carritoController.obtenerCarrito);

/**
 * @route   POST /api/carrito
 * @desc    Añadir producto al carrito
 * @access  Private (Cliente)
 * @body    { ProductoID, CantidadPaquetes }
 */
router.post('/carrito', authenticate, authorize(['cliente']), carritoController.agregarAlCarrito);

module.exports = router;
