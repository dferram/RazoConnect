const express = require('express');
const router = express.Router();
const productosController = require('../controllers/productosController');

/**
 * @route   GET /api/productos
 * @desc    Obtener todos los productos con imagen principal
 * @access  Public
 */
router.get('/productos', productosController.obtenerProductos);

/**
 * @route   GET /api/productos/:id
 * @desc    Obtener un producto específico con todas sus imágenes
 * @access  Public
 */
router.get('/productos/:id', productosController.obtenerProductoPorId);

module.exports = router;
