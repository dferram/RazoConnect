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

/**
 * @route   PUT /api/carrito/:productoId
 * @desc    Actualizar cantidad de un producto en el carrito
 * @access  Private (Cliente)
 * @body    { CantidadPaquetes }
 */
router.put('/carrito/:productoId', authenticate, authorize(['cliente']), carritoController.actualizarCarrito);

/**
 * @route   DELETE /api/carrito/:productoId
 * @desc    Eliminar un producto del carrito
 * @access  Private (Cliente)
 */
router.delete('/carrito/:productoId', authenticate, authorize(['cliente']), carritoController.eliminarDelCarrito);

module.exports = router;
