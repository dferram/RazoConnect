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
 * @desc    Añadir variante al carrito
 * @access  Private (Cliente)
 * @body    { VarianteID, CantidadPaquetes }
 */
router.post('/carrito', authenticate, authorize(['cliente']), carritoController.agregarAlCarrito);

/**
 * @route   PUT /api/carrito/:varianteId
 * @desc    Actualizar cantidad de una variante en el carrito
 * @access  Private (Cliente)
 * @body    { CantidadPaquetes }
 */
router.put('/carrito/:varianteId', authenticate, authorize(['cliente']), carritoController.actualizarCarrito);

/**
 * @route   PUT /api/carrito/item/:itemId/cambiar-variante
 * @desc    Cambiar la variante (medida) de una línea específica del carrito
 * @access  Private (Cliente)
 */
router.put(
  '/carrito/item/:itemId/cambiar-variante',
  authenticate,
  authorize(['cliente']),
  carritoController.cambiarVarianteItemCarrito
);

/**
 * @route   DELETE /api/carrito/:itemId
 * @desc    Eliminar una línea específica del carrito (item)
 * @access  Private (Cliente)
 */
router.delete('/carrito/:itemId', authenticate, authorize(['cliente']), carritoController.eliminarDelCarrito);

module.exports = router;
