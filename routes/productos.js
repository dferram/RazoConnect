const express = require("express");
const router = express.Router();
const productosController = require("../controllers/productosController");

/**
 * @route   GET /api/categorias
 * @desc    Obtener todas las categorías
 * @access  Public
 */
router.get("/categorias", productosController.obtenerCategorias);

/**
 * @route   GET /api/public/proveedores
 * @desc    Obtener proveedores con productos activos (para filtro público)
 * @access  Public
 */
router.get(
  "/public/proveedores",
  productosController.obtenerProveedoresPublicos
);

/**
 * @route   GET /api/public/tipos-producto
 * @desc    Obtener tipos de producto activos (para exploración pública)
 * @access  Public
 */
router.get(
  "/public/tipos-producto",
  productosController.obtenerTiposProductoPublicos
);

/**
 * @route   GET /api/agentes/lista-publica
 * @desc    Obtener lista pública de agentes activos (solo datos no sensibles)
 * @access  Public
 */
router.get(
  "/agentes/lista-publica",
  productosController.obtenerAgentesPublicos
);

/**
 * @route   GET /api/productos
 * @desc    Obtener todos los productos con imagen principal
 * @access  Public
 */
router.get("/productos", productosController.obtenerProductos);

/**
 * @route   GET /api/productos/tipos
 * @desc    Obtener lista de tipos de producto (para sugerencias/autocompletado)
 * @access  Public
 */
router.get("/productos/tipos", productosController.obtenerTiposProducto);

/**
 * @route   GET /api/productos/dimensiones
 * @desc    Obtener lista de dimensiones únicas
 * @access  Public
 */
router.get("/productos/dimensiones", productosController.obtenerDimensiones);

/**
 * @route   GET /api/productos/:id
 * @desc    Obtener un producto específico con todas sus imágenes
 * @access  Public
 */
router.get("/productos/:id", productosController.obtenerProductoPorId);

module.exports = router;
