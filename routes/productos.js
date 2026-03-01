const express = require("express");
const router = express.Router();
const productosController = require("../controllers/productosController");

/**
 * @swagger
 * /api/categorias:
 *   get:
 *     summary: Obtener todas las categorías
 *     tags: [Productos]
 *     security: []
 *     responses:
 *       200:
 *         description: Lista de categorías obtenida
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 categorias:
 *                   type: array
 *                   items:
 *                     type: object
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/categorias", productosController.obtenerCategorias);

/**
 * @swagger
 * /api/public/proveedores:
 *   get:
 *     summary: Obtener proveedores con productos activos
 *     tags: [Productos]
 *     security: []
 *     responses:
 *       200:
 *         description: Lista de proveedores públicos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 proveedores:
 *                   type: array
 *                   items:
 *                     type: object
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  "/public/proveedores",
  productosController.obtenerProveedoresPublicos
);

/**
 * @swagger
 * /api/public/tipos-producto:
 *   get:
 *     summary: Obtener tipos de producto activos
 *     tags: [Productos]
 *     security: []
 *     responses:
 *       200:
 *         description: Lista de tipos de producto
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 tipos:
 *                   type: array
 *                   items:
 *                     type: object
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  "/public/tipos-producto",
  productosController.obtenerTiposProductoPublicos
);

/**
 * @swagger
 * /api/agentes/lista-publica:
 *   get:
 *     summary: Obtener lista pública de agentes activos
 *     tags: [Productos]
 *     security: []
 *     responses:
 *       200:
 *         description: Lista de agentes públicos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 agentes:
 *                   type: array
 *                   items:
 *                     type: object
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  "/agentes/lista-publica",
  productosController.obtenerAgentesPublicos
);

/**
 * @swagger
 * /api/productos:
 *   get:
 *     summary: Obtener todos los productos con imagen principal
 *     tags: [Productos]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         example: 20
 *       - in: query
 *         name: categoria
 *         schema:
 *           type: string
 *         example: Rosas
 *       - in: query
 *         name: showAll
 *         schema:
 *           type: boolean
 *         example: false
 *     responses:
 *       200:
 *         description: Lista de productos obtenida
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 productos:
 *                   type: array
 *                   items:
 *                     type: object
 *                 total:
 *                   type: integer
 *                   example: 150
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/productos", productosController.obtenerProductos);

/**
 * @swagger
 * /api/productos/tipos:
 *   get:
 *     summary: Obtener lista de tipos de producto
 *     tags: [Productos]
 *     security: []
 *     responses:
 *       200:
 *         description: Lista de tipos de producto
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 tipos:
 *                   type: array
 *                   items:
 *                     type: object
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/productos/tipos", productosController.obtenerTiposProducto);

/**
 * @swagger
 * /api/productos/dimensiones:
 *   get:
 *     summary: Obtener lista de dimensiones únicas
 *     tags: [Productos]
 *     security: []
 *     responses:
 *       200:
 *         description: Lista de dimensiones
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 dimensiones:
 *                   type: array
 *                   items:
 *                     type: string
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/productos/dimensiones", productosController.obtenerDimensiones);

/**
 * @swagger
 * /api/productos/search:
 *   get:
 *     summary: Búsqueda inteligente con autocomplete
 *     tags: [Productos]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Término de búsqueda
 *         example: rosa
 *     responses:
 *       200:
 *         description: Resultados de búsqueda
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 productos:
 *                   type: array
 *                   items:
 *                     type: object
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/productos/search", productosController.buscarProductosAutocomplete);

/**
 * @swagger
 * /api/productos/{id}:
 *   get:
 *     summary: Obtener un producto específico con todas sus imágenes
 *     tags: [Productos]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del producto
 *         example: 123
 *     responses:
 *       200:
 *         description: Producto obtenido exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 producto:
 *                   type: object
 *       404:
 *         description: Producto no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/productos/:id", productosController.obtenerProductoPorId);

/**
 * @swagger
 * /api/productos/{id}/variantes:
 *   get:
 *     summary: Obtener variantes de un producto con stock disponible
 *     tags: [Productos]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del producto
 *         example: 123
 *     responses:
 *       200:
 *         description: Variantes obtenidas exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 variantes:
 *                   type: array
 *                   items:
 *                     type: object
 *       404:
 *         description: Producto no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/productos/:id/variantes", productosController.obtenerVariantesProducto);

module.exports = router;
