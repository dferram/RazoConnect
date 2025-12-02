const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const authController = require("../controllers/authController");
const {
  authenticate,
  authorizeAdmin,
  authorizeSuperAdmin,
} = require("../middlewares/authMiddleware");

/**
 * Rutas de autenticación de admin (públicas)
 */
router.post("/login", adminController.loginAdmin);

/**
 * Rutas protegidas de admin (requieren autenticación y rol admin)
 */
router.get(
  "/verify",
  authenticate,
  authorizeAdmin,
  adminController.verifyAdmin
);
router.get(
  "/profile",
  authenticate,
  authorizeAdmin,
  adminController.getAdminProfile
);
router.post(
  "/refresh-token",
  authenticate,
  authorizeAdmin,
  adminController.refreshAdminToken
);

/**
 * Rutas de super-admin (requieren autenticación y rol super-admin)
 */
router.post(
  "/crear-admin",
  authenticate,
  authorizeSuperAdmin,
  authController.crearAdmin
);

/**
 * Dashboard y estadísticas
 */
router.get(
  "/dashboard-stats",
  authenticate,
  authorizeAdmin,
  adminController.getDashboardStats
);

/**
 * Gestión de pedidos
 */
router.get(
  "/pedidos",
  authenticate,
  authorizeAdmin,
  adminController.getAllPedidos
);
router.put(
  "/pedidos/:id",
  authenticate,
  authorizeAdmin,
  adminController.updatePedidoEstatus
);
router.put(
  "/pedidos/:id/costo-envio",
  authenticate,
  authorizeAdmin,
  adminController.updateCostoEnvio
);

/**
 * Gestión de productos
 */
router.get(
  "/productos",
  authenticate,
  authorizeAdmin,
  adminController.getAllProductos
);
router.get(
  "/productos/:id",
  authenticate,
  authorizeAdmin,
  adminController.getProductoDetalle
);
router.post(
  "/productos",
  authenticate,
  authorizeAdmin,
  adminController.crearProducto
);
router.put(
  "/productos/:id",
  authenticate,
  authorizeAdmin,
  adminController.actualizarProducto
);
router.post(
  "/variantes",
  authenticate,
  authorizeAdmin,
  adminController.crearVariante
);
router.get(
  "/tamanos-paquetes",
  authenticate,
  authorizeAdmin,
  adminController.getTamanosPaquetes
);
router.get(
  "/categorias",
  authenticate,
  authorizeAdmin,
  adminController.getCategorias
);
router.post(
  "/categorias",
  authenticate,
  authorizeAdmin,
  adminController.crearCategoria
);
router.put(
  "/categorias/:id",
  authenticate,
  authorizeAdmin,
  adminController.actualizarCategoria
);
router.delete(
  "/categorias/:id",
  authenticate,
  authorizeAdmin,
  adminController.eliminarCategoria
);
router.get(
  "/medidas",
  authenticate,
  authorizeAdmin,
  adminController.getMedidas
);

/**
 * Gestión de inventario
 */
router.get(
  "/inventario",
  authenticate,
  authorizeAdmin,
  adminController.getInventarioResumen
);
router.post(
  "/inventario/ajuste",
  authenticate,
  authorizeAdmin,
  adminController.ajustarInventario
);

/**
 * Gestión de agentes
 */
router.get(
  "/agentes",
  authenticate,
  authorizeAdmin,
  adminController.getAllAgentes
);
router.post(
  "/agentes",
  authenticate,
  authorizeAdmin,
  adminController.crearAgente
);
router.get(
  "/agentes/:id",
  authenticate,
  authorizeAdmin,
  adminController.getAgenteDetalle
);
router.get(
  "/agentes/:id/clientes",
  authenticate,
  authorizeAdmin,
  adminController.getAgenteClientes
);
router.put(
  "/agentes/:id/desactivar",
  authenticate,
  authorizeAdmin,
  adminController.desactivarAgente
);

/**
 * Gestión de comisiones
 */
router.get(
  "/comisiones",
  authenticate,
  authorizeAdmin,
  adminController.getAllComisiones
);
router.put(
  "/comisiones/:id/pagar",
  authenticate,
  authorizeAdmin,
  adminController.pagarComision
);

/**
 * Gestión de clientes
 */
router.get(
  "/clientes",
  authenticate,
  authorizeAdmin,
  adminController.getAllClientes
);
router.get(
  "/clientes/:id",
  authenticate,
  authorizeAdmin,
  adminController.getClienteDetalle
);
router.put(
  "/clientes/:id/estado",
  authenticate,
  authorizeAdmin,
  adminController.actualizarEstadoCliente
);
router.put(
  "/clientes/:id/desvincular",
  authenticate,
  authorizeAdmin,
  adminController.desvincularClienteDeAgente
);

/**
 * Detalle de pedido
 */
router.get(
  "/pedidos/:id/detalle",
  authenticate,
  authorizeAdmin,
  adminController.getPedidoDetalle
);

/**
 * Gestión de proveedores
 */
router.get(
  "/proveedores",
  authenticate,
  authorizeAdmin,
  adminController.getAllProveedores
);
router.post(
  "/proveedores",
  authenticate,
  authorizeAdmin,
  adminController.crearProveedor
);
router.put(
  "/proveedores/:id",
  authenticate,
  authorizeAdmin,
  adminController.actualizarProveedor
);

/**
 * Gestión de órdenes de compra
 */
router.get(
  "/ordenes-compra",
  authenticate,
  authorizeAdmin,
  adminController.getAllOrdenesCompra
);
router.get(
  "/ordenes-compra/:id/detalles",
  authenticate,
  authorizeAdmin,
  adminController.getDetallesOrdenCompra
);
router.post(
  "/ordenes-compra",
  authenticate,
  authorizeAdmin,
  adminController.crearOrdenCompra
);
router.post(
  "/ordenes-compra/recibir",
  authenticate,
  authorizeAdmin,
  adminController.recibirInventario
);

module.exports = router;
