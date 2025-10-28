const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticate, authorizeAdmin } = require('../middlewares/authMiddleware');

/**
 * Rutas de autenticación de admin (públicas)
 */
router.post('/login', adminController.loginAdmin);

/**
 * Rutas protegidas de admin (requieren autenticación y rol admin)
 */
router.get('/verify', authenticate, authorizeAdmin, adminController.verifyAdmin);
router.get('/profile', authenticate, authorizeAdmin, adminController.getAdminProfile);

/**
 * Dashboard y estadísticas
 */
router.get('/dashboard-stats', authenticate, authorizeAdmin, adminController.getDashboardStats);

/**
 * Gestión de pedidos
 */
router.get('/pedidos', authenticate, authorizeAdmin, adminController.getAllPedidos);
router.put('/pedidos/:id', authenticate, authorizeAdmin, adminController.updatePedidoEstatus);

/**
 * Gestión de productos
 */
router.get('/productos', authenticate, authorizeAdmin, adminController.getAllProductos);
router.post('/productos', authenticate, authorizeAdmin, adminController.crearProducto);
router.get('/categorias', authenticate, authorizeAdmin, adminController.getCategorias);

/**
 * Gestión de inventario
 */
router.post('/inventario/ajuste', authenticate, authorizeAdmin, adminController.ajustarInventario);

/**
 * Gestión de agentes
 */
router.get('/agentes', authenticate, authorizeAdmin, adminController.getAllAgentes);
router.post('/agentes', authenticate, authorizeAdmin, adminController.crearAgente);
router.get('/agentes/:id', authenticate, authorizeAdmin, adminController.getAgenteDetalle);
router.put('/agentes/:id/desactivar', authenticate, authorizeAdmin, adminController.desactivarAgente);

/**
 * Gestión de comisiones
 */
router.get('/comisiones', authenticate, authorizeAdmin, adminController.getAllComisiones);
router.put('/comisiones/:id/pagar', authenticate, authorizeAdmin, adminController.pagarComision);

/**
 * Gestión de clientes
 */
router.get('/clientes', authenticate, authorizeAdmin, adminController.getAllClientes);

/**
 * Detalle de pedido
 */
router.get('/pedidos/:id/detalle', authenticate, authorizeAdmin, adminController.getPedidoDetalle);

module.exports = router;
