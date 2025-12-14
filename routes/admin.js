const express = require("express");
const router = express.Router();
const multer = require("multer");
const adminController = require("../controllers/adminController");
const authController = require("../controllers/authController");
const bitacoraController = require("../controllers/bitacoraController");
const changeRequestController = require("../controllers/changeRequestController");
const inventoryAuditController = require("../controllers/inventoryAuditController");
const upload = require("../middlewares/upload");
const {
  authenticate,
  authorizeAdmin,
  authorizeSuperAdmin,
  verifySuperAdmin,
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
 * Auditoría de Inventario (Nivel 3 - Doble Ciego)
 */
router.post(
  "/auditoria-inventario/crear-sesion",
  authenticate,
  authorizeAdmin,
  inventoryAuditController.crearSesion
);

router.get(
  "/auditoria-inventario/variante-por-sku",
  authenticate,
  authorizeAdmin,
  inventoryAuditController.getVariantePorSku
);

router.post(
  "/auditoria-inventario/registrar-conteo",
  authenticate,
  authorizeAdmin,
  inventoryAuditController.registrarConteo
);

router.get(
  "/auditoria-inventario/dashboard/:sesionId",
  authenticate,
  authorizeAdmin,
  inventoryAuditController.getDashboardSesion
);

router.post(
  "/auditoria-inventario/aplicar/:sesionId",
  authenticate,
  authorizeAdmin,
  inventoryAuditController.aplicarSesion
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

router.post(
  "/cambios/aprobar-lote",
  authenticate,
  authorizeSuperAdmin,
  changeRequestController.aprobarCambios
);

router.post(
  "/cambios/rechazar-lote",
  authenticate,
  authorizeSuperAdmin,
  changeRequestController.rechazarCambios
);

router.get(
  "/cambios/pendientes",
  authenticate,
  authorizeSuperAdmin,
  changeRequestController.obtenerPendientes
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

router.post(
  "/pedidos/:id/confirmar",
  authenticate,
  authorizeAdmin,
  adminController.confirmarPedido
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

router.get(
  "/productos/:id/variantes-pendientes",
  authenticate,
  authorizeAdmin,
  adminController.getVariantesPendientesProducto
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

/**
 * @route   POST /api/admin/productos/:id/imagen
 * @desc    Subir imagen para un producto
 * @access  Private (Admin only)
 */
router.post(
  "/productos/:id/imagen",
  authenticate,
  authorizeAdmin,
  upload.single("imagen"),
  adminController.subirImagenProducto
);

router.post(
  "/productos/:id/imagenes",
  authenticate,
  authorizeAdmin,
  (req, res, next) => {
    const handler = upload.fields([
      { name: "imagenes", maxCount: 12 },
      { name: "images", maxCount: 12 },
    ]);

    handler(req, res, (err) => {
      if (!err) return next();

      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_UNEXPECTED_FILE") {
          return res.status(400).json({
            success: false,
            message: "El límite máximo es de 12 imágenes por producto",
          });
        }

        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            success: false,
            message: "Cada imagen no debe superar 5MB",
          });
        }

        return res.status(400).json({
          success: false,
          message: err.message || "Error al subir las imágenes",
        });
      }

      return res.status(400).json({
        success: false,
        message: err.message || "Error al subir las imágenes",
      });
    });
  },
  adminController.subirImagenesProductoMultiple
);

router.post(
  "/variantes",
  authenticate,
  authorizeAdmin,
  adminController.crearVariante
);
router.put(
  "/variantes/:id",
  authenticate,
  authorizeAdmin,
  adminController.actualizarVariante
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
router.get(
  "/medidas-existentes",
  authenticate,
  authorizeAdmin,
  adminController.getMedidasExistentes
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

router.get(
  "/inventario/:varianteId/historial",
  authenticate,
  authorizeAdmin,
  adminController.getHistorialInventarioVariante
);

router.get(
  "/movimientos",
  authenticate,
  authorizeAdmin,
  adminController.getMovimientosInventario
);

router.post(
  "/recepcion",
  authenticate,
  authorizeAdmin,
  adminController.recepcionarMercancia
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
router.get(
  "/proveedores/:id",
  authenticate,
  authorizeAdmin,
  adminController.getProveedorById
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

router.get(
  "/proveedores/:id/solicitudes-pendientes",
  authenticate,
  authorizeAdmin,
  adminController.getSolicitudesPendientesProveedor
);

router.get(
  "/proveedores/:id/reglas",
  authenticate,
  authorizeAdmin,
  adminController.getReglasEmpaqueProveedor
);

router.post(
  "/proveedores/reglas",
  authenticate,
  authorizeAdmin,
  adminController.saveReglaEmpaque
);

router.put(
  "/proveedores/:id/reglas",
  authenticate,
  authorizeAdmin,
  adminController.saveReglaEmpaque
);

/**
 * Conteo Ciego (Blind Count) - Recepción de Órdenes de Compra
 */
router.get(
  "/compras/pendientes",
  authenticate,
  authorizeAdmin,
  adminController.getComprasPendientes
);
router.get(
  "/compras/:id/detalle-ciego",
  authenticate,
  authorizeAdmin,
  adminController.getCompraDetalleCiego
);
router.post(
  "/compras/:id/validar-recepcion",
  authenticate,
  authorizeAdmin,
  adminController.validarRecepcionCompra
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
  "/ordenes-compra/:id/confirmar",
  authenticate,
  authorizeAdmin,
  adminController.confirmarOrdenBackorder
);
router.post(
  "/ordenes-compra/:id/cancelar",
  authenticate,
  authorizeAdmin,
  adminController.cancelarOrdenBackorder
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

router.post(
  "/ordenes-compra/recibir/evidencia",
  authenticate,
  authorizeAdmin,
  upload.single("evidencia"),
  adminController.subirEvidenciaRecepcionOC
);

/**
 * Rutas de Bitácora de Auditoría (Solo Super Admin)
 */
router.get(
  "/bitacora",
  authenticate,
  verifySuperAdmin,
  bitacoraController.obtenerBitacora
);

router.get(
  "/bitacora/estadisticas",
  authenticate,
  verifySuperAdmin,
  bitacoraController.obtenerEstadisticas
);

router.get(
  "/bitacora/usuarios",
  authenticate,
  verifySuperAdmin,
  bitacoraController.obtenerUsuariosUnicos
);

router.get(
  "/bitacora/entidades",
  authenticate,
  verifySuperAdmin,
  bitacoraController.obtenerEntidadesUnicas
);

module.exports = router;
