const express = require("express");
const router = express.Router();
const multer = require("multer");
const adminController = require("../controllers/adminController");
const authController = require("../controllers/authController");
const bitacoraController = require("../controllers/bitacoraController");
const changeRequestController = require("../controllers/changeRequestController");
const cloudinaryController = require("../controllers/cloudinaryController");
const { analizarRiesgoCredito } = require("../services/creditAnalysisService");
const inventoryAuditController = require("../controllers/inventoryAuditController");
const purchaseSuggestionController = require("../controllers/purchaseSuggestionController");
const cxcController = require("../controllers/cxcController");
const cxcDetalladoController = require("../controllers/cxcDetalladoController");
const cxcEnhancedController = require("../controllers/cxcEnhancedController");
const cxpController = require("../controllers/cxpController");
const pagosController = require("../controllers/admin/pagosController");
const inventarioController = require("../controllers/inventarioController");
const numCuentaController = require("../controllers/numCuentaController");
const migrationController = require("../controllers/migrationController");
const landingEditorController = require("../controllers/landingEditorController");
const landingConfigController = require("../controllers/landingConfigController");
const landingItemsController = require("../controllers/landingItemsController");
const inventarioAjusteController = require("../controllers/inventarioAjusteController");
const auditController = require("../controllers/auditController");
const ajustePedidosController = require("../controllers/ajustePedidosController");
const cuponesController = require("../controllers/cuponesController");
const inventarioReportesController = require("../controllers/inventarioReportesController");
const pedidosStatusController = require("../controllers/pedidosStatusController");
const ordenesCompraController = require("../controllers/ordenesCompraController");
const recepcionInventarioController = require("../controllers/recepcionInventarioController");
const ordenCompraPDFController = require("../controllers/ordenCompraPDFController");
const fifoRecalculationController = require("../controllers/fifoRecalculationController");
const reasignarOrdenController = require("../controllers/reasignarOrdenController");
const ordenesGruposController = require("../controllers/ordenesGruposController");
const gruposOrdenesPDFController = require("../controllers/gruposOrdenesPDFController");
const gruposOrdenesExcelController = require("../controllers/gruposOrdenesExcelController");
const upload = require("../middlewares/upload");
const uploadComprobante = require("../middlewares/uploadComprobante");
const uploadProductImages = require("../middlewares/uploadProductImages");
const uploadCategoryImage = require("../middlewares/uploadCategoryImage");
const {
  authenticate,
  authorizeAdmin,
  authorizeAdminOrAgente,
  authorizeAdminOnly,
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

// Cloudinary signature generation
router.post(
  "/cloudinary/signature",
  authenticate,
  authorizeAdmin,
  cloudinaryController.generarFirmaUpload
);

// Admin authentication verification endpoint
router.get(
  "/verify",
  authenticate,
  authorizeAdmin,
  adminController.verifyAdmin
);

/**
 * Auditoría de Inventario (Nivel 3 - Doble Ciego)
 */
router.post(
  "/auditoria-inventario/crear-sesion",
  authenticate,
  authorizeAdminOnly,
  inventoryAuditController.crearSesion
);

router.get(
  "/auditoria-inventario/buscar-productos",
  authenticate,
  authorizeAdminOrAgente,
  inventoryAuditController.buscarProductos
);

router.get(
  "/auditoria-inventario/sesiones",
  authenticate,
  authorizeAdminOrAgente,
  inventoryAuditController.listarSesiones
);

router.get(
  "/auditoria-inventario/variante-por-sku",
  authenticate,
  authorizeAdminOrAgente,
  inventoryAuditController.getVariantePorSku
);

router.post(
  "/auditoria-inventario/registrar-conteo",
  authenticate,
  authorizeAdminOrAgente,
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
  authorizeAdminOnly,
  inventoryAuditController.aplicarSesion
);

router.post(
  "/auditoria-inventario/finalizar-sesion/:sesionId",
  authenticate,
  authorizeAdminOnly,
  inventoryAuditController.finalizarSesion
);

router.get(
  "/auditoria-inventario/diagnostico-sesiones",
  authenticate,
  authorizeAdminOnly,
  inventoryAuditController.diagnosticoSesiones
);

router.get(
  "/auditoria-inventario/sesiones/:sesionId",
  authenticate,
  authorizeAdminOrAgente,
  inventoryAuditController.getSesionDetalle
);

router.put(
  "/auditoria-inventario/sesiones/:sesionId/asignar-agente",
  authenticate,
  authorizeAdminOnly,
  inventoryAuditController.asignarAgenteASesion
);

router.get(
  "/auditoria-inventario/agentes-disponibles",
  authenticate,
  authorizeAdmin,
  inventoryAuditController.obtenerAgentesDisponibles
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

router.get(
  "/analisis-credito/:solicitudId",
  authenticate,
  authorizeAdmin,
  async (req, res) => {
    try {
      const solicitudId = Number.parseInt(req.params.solicitudId, 10);
      if (!Number.isInteger(solicitudId)) {
        return res.status(400).json({
          success: false,
          message: "ID de solicitud inválido"
        });
      }

      const analisis = await analizarRiesgoCredito(solicitudId);
      return res.json({
        success: true,
        data: analisis
      });
    } catch (error) {
      console.error("Error en análisis de crédito:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Error al analizar solicitud de crédito"
      });
    }
  }
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
// ✅ REFACTORED: Migrado a pedidosStatusController.js (Strangler Pattern)
router.put(
  "/pedidos/:id",
  authenticate,
  authorizeAdminOrAgente,
  pedidosStatusController.updatePedidoEstatus
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
  "/productos/buscar",
  authenticate,
  authorizeAdmin,
  adminController.buscarProductosAjuste
);

router.get(
  "/productos/buscar-compra",
  authenticate,
  authorizeAdminOrAgente,
  adminController.buscarProductosCompra
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
  uploadProductImages,
  adminController.crearProducto
);
router.put(
  "/productos/:id",
  authenticate,
  authorizeAdmin,
  uploadProductImages,
  adminController.actualizarProducto
);

/**
 * @route   PUT /api/admin/productos/:id/toggle-visibilidad
 * @desc    Toggle product visibility (activo field)
 * @access  Private (Admin only)
 */
router.put(
  "/productos/:id/toggle-visibilidad",
  authenticate,
  authorizeAdmin,
  adminController.toggleProductoVisibilidad
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

// DELETE: Eliminar imagen de producto (físicamente de Cloudinary + BD)
router.delete(
  "/productos/imagenes/:id",
  authenticate,
  authorizeAdmin,
  adminController.eliminarImagenProducto
);

router.post(
  "/variantes",
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
            message: "El límite máximo es de 12 imágenes por variante",
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
  adminController.crearVariante
);
router.put(
  "/variantes/:id",
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
            message: "El límite máximo es de 12 imágenes por variante",
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
  adminController.actualizarVariante
);

router.get(
  "/variantes/:id/imagenes",
  authenticate,
  authorizeAdmin,
  adminController.getImagenesVariante
);

router.post(
  "/variantes/:id/imagenes",
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
            message: "El límite máximo es de 12 imágenes por variante",
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
  adminController.subirImagenesVarianteMultiple
);

router.put(
  "/variantes/:id/orden-imagenes",
  authenticate,
  authorizeAdmin,
  adminController.actualizarOrdenImagenesVariante
);
router.get(
  "/tamanos-paquetes",
  authenticate,
  authorizeAdmin,
  adminController.getTamanosPaquetes
);

router.get(
  "/productos/:id/tamanos-disponibles",
  authenticate,
  authorizeAdmin,
  adminController.getTamanosDisponiblesProducto
);
router.get(
  "/categorias",
  authenticate,
  authorizeAdminOrAgente,
  adminController.getCategorias
);
router.post(
  "/categorias",
  authenticate,
  authorizeAdmin,
  uploadCategoryImage.single("image"),
  adminController.crearCategoria
);
router.put(
  "/categorias/:id",
  authenticate,
  authorizeAdmin,
  uploadCategoryImage.single("image"),
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
  authorizeAdminOrAgente,
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

router.get(
  "/administradores",
  authenticate,
  authorizeAdmin,
  adminController.getAllAdministradores
);

router.get(
  "/inventario/exportar-pdf",
  authenticate,
  authorizeAdmin,
  adminController.exportarInventarioPDF
);

router.get(
  "/inventario/producto-detalle/:id",
  authenticate,
  authorizeAdmin,
  adminController.getProductoDetalleInventario
);

// router.post(
//   "/inventario/ajuste",
//   authenticate,
//   authorizeAdmin,
//   adminController.ajustarInventario
// );

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

// Búsqueda de variantes con autocompletado para movimientos
router.get(
  "/variantes/search",
  authenticate,
  authorizeAdmin,
  adminController.searchVariantesMovimientos
);

// Ajustes de inventario con filtros avanzados para conciliación
router.get(
  "/ajustes-inventario/filtrados",
  authenticate,
  authorizeAdmin,
  adminController.getAjustesInventarioFiltrados
);

// Obtener tipos de ajuste disponibles
router.get(
  "/ajustes-inventario/tipos",
  authenticate,
  authorizeAdmin,
  adminController.getTiposAjusteInventario
);

// router.post(
//   "/recepcion",
//   authenticate,
//   authorizeAdmin,
//   adminController.recepcionarMercancia
// );

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
  "/agentes/:id",
  authenticate,
  authorizeAdmin,
  adminController.actualizarAgente
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

router.get(
  "/cuentas-por-pagar/kpis",
  authenticate,
  authorizeAdmin,
  cxpController.getCxPKPIs
);

router.get(
  "/cuentas-por-pagar",
  authenticate,
  authorizeAdmin,
  cxpController.getCuentasPorPagar
);

router.get(
  "/cuentas-por-pagar/:id",
  authenticate,
  authorizeAdmin,
  cxpController.getCxPDetalle
);

router.post(
  "/cuentas-por-pagar/:id/pagar",
  authenticate,
  authorizeAdmin,
  uploadComprobante.single("comprobante"),
  cxpController.registrarPago
);

router.get(
  "/cxp/exportar",
  authenticate,
  authorizeAdmin,
  cxpController.exportarLoteCxP
);

router.get(
  "/cxc-summary",
  authenticate,
  authorizeAdmin,
  adminController.getCxcSummary
);

router.get(
  "/cxc/metricas",
  authenticate,
  authorizeAdmin,
  cxcController.getMetricasCobranza
);

router.get(
  "/cxc/exportar",
  authenticate,
  authorizeAdmin,
  cxcController.exportarLoteCxC
);

// ========================================
// PAGOS DE CLIENTES (tabla pagos_clientes)
// ========================================

router.get(
  "/pagos-clientes/pendientes",
  authenticate,
  authorizeAdmin,
  cxcController.getPagosClientesPendientes
);

router.post(
  "/pagos-clientes/:pagoId/gestionar",
  authenticate,
  authorizeAdmin,
  cxcController.gestionarPagoCliente
);

router.get(
  "/cxc/historial-movimientos",
  authenticate,
  authorizeAdmin,
  cxcController.obtenerHistorialMovimientos
);

router.get(
  "/cxc/exportar-detallado",
  authenticate,
  authorizeAdmin,
  cxcDetalladoController.exportarCxCDetallado
);

router.get(
  "/cxc/clientes-con-credito",
  authenticate,
  authorizeAdmin,
  cxcDetalladoController.obtenerClientesConCredito
);

router.get(
  "/cxc/summary-aging",
  authenticate,
  authorizeAdmin,
  cxcController.getSummaryAging
);

router.get(
  "/cxc/cliente/:clienteId",
  authenticate,
  authorizeAdmin,
  cxcController.getClienteCXCDetail
);

router.get(
  "/cxc/cliente/:clienteId/movimientos",
  authenticate,
  authorizeAdmin,
  cxcController.getClienteCXCMovimientos
);

router.get(
  "/cxc/estado-cuenta/:clienteId",
  authenticate,
  authorizeAdmin,
  cxcEnhancedController.getEstadoCuentaCliente
);

router.post(
  "/cxc/registrar-pago-manual",
  authenticate,
  authorizeAdmin,
  cxcEnhancedController.registrarPagoManual
);

router.get(
  "/cxp/exportar",
  authenticate,
  authorizeAdmin,
  cxpController.exportarLoteCxP
);

router.post(
  "/registrar-abono",
  authenticate,
  authorizeAdminOrAgente,
  adminController.registrarAbonoCxC
);

router.get(
  "/estado-cuenta/resumen",
  authenticate,
  authorizeAdmin,
  adminController.getResumenEstadoCuentaProveedores
);

router.get(
  "/estado-cuenta/proveedores/:id/movimientos",
  authenticate,
  authorizeAdmin,
  adminController.getEstadoCuentaProveedorMovimientos
);

router.get(
  "/estado-cuenta/cxp/:id/productos",
  authenticate,
  authorizeAdmin,
  adminController.getProductosRecibidosPorCxp
);

/**
 * Validación de pagos por transferencia
 */
router.get(
  "/pagos/pendientes",
  authenticate,
  authorizeAdmin,
  pagosController.getPagosPendientes
);

router.put(
  "/pagos/:pagoId/aprobar",
  authenticate,
  authorizeAdmin,
  pagosController.aprobarPago
);

router.put(
  "/pagos/:pagoId/rechazar",
  authenticate,
  authorizeAdmin,
  pagosController.rechazarPago
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
router.put(
  "/clientes/:id/reset-password",
  authenticate,
  authorizeAdmin,
  authController.adminResetPassword
);
router.get(
  "/clientes/:id/credito",
  authenticate,
  authorizeAdmin,
  adminController.getClienteCreditoInfo
);
router.put(
  "/clientes/:id/credito",
  authenticate,
  authorizeAdmin,
  adminController.actualizarCreditoCliente
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
 * Evidencia de Entrega / Remisión Firmada
 */
const uploadEvidenciaEntrega = require("../middlewares/uploadEvidenciaEntrega");

router.post(
  "/pedidos/:id/evidencia",
  authenticate,
  authorizeAdmin,
  uploadEvidenciaEntrega.single("evidencia"),
  adminController.subirEvidenciaEntrega
);

router.get(
  "/pedidos/:id/remision",
  authenticate,
  authorizeAdmin,
  adminController.obtenerRemisionPedido
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
  "/tipos-producto",
  authenticate,
  authorizeAdmin,
  adminController.getTiposProductoAdmin
);

router.post(
  "/tipos-producto",
  authenticate,
  authorizeAdmin,
  adminController.crearTipoProductoAdmin
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

router.get(
  "/proveedores/:id/reglas-multiples",
  authenticate,
  authorizeAdmin,
  adminController.getReglasEmpaqueProveedorMultiples
);

router.post(
  "/save-reglas-empaque",
  authenticate,
  authorizeAdmin,
  adminController.saveReglasEmpaqueMultiples
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

router.get(
  "/compras/sugerencias",
  authenticate,
  authorizeAdmin,
  purchaseSuggestionController.obtenerSugerencias
);

router.post(
  "/compras/generar",
  authenticate,
  authorizeAdmin,
  purchaseSuggestionController.generarOrdenCompra
);

router.post(
  "/compras/auto-generar",
  authenticate,
  authorizeAdmin,
  purchaseSuggestionController.autoGenerarOrdenes
);

/**
 * Gestión de órdenes de compra
 */
// ✅ REFACTORED: Migrado a ordenesCompraController.js
router.get(
  "/ordenes-compra",
  authenticate,
  authorizeAdmin,
  ordenesCompraController.getAllOrdenesCompra
);
router.get(
  "/ordenes-compra/reportes",
  authenticate,
  authorizeAdmin,
  adminController.getOrdenesCompraReportes
);
router.get(
  "/ordenes-compra/administradores",
  authenticate,
  authorizeAdmin,
  adminController.getAdministradoresOrdenesCompra
);
router.get(
  "/ordenes-compra/:id/detalles",
  authenticate,
  authorizeAdmin,
  adminController.getDetallesOrdenCompra
);
router.get(
  "/ordenes-compra/:id/recepcion",
  authenticate,
  authorizeAdmin,
  adminController.getRecepcionOrdenCompra
);
router.get(
  "/ordenes-compra/:id/reporte-detallado",
  authenticate,
  authorizeAdmin,
  adminController.getOrdenCompraReporteDetallado
);
router.get(
  "/productos/variantes-proveedor/:proveedorId",
  authenticate,
  authorizeAdmin,
  adminController.getVariantesProveedor
);
router.post(
  "/ordenes-compra/:id/agregar-producto",
  authenticate,
  authorizeAdmin,
  adminController.agregarProductoAOrdenCompra
);
router.delete(
  "/ordenes-compra/:id/quitar-producto/:detalleId",
  authenticate,
  authorizeAdmin,
  adminController.quitarProductoDeOrdenCompra
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
// ✅ REFACTORED: Migrado a ordenesCompraController.js
router.post(
  "/ordenes-compra",
  authenticate,
  authorizeAdmin,
  ordenesCompraController.crearOrdenCompra
);
router.post(
  "/ordenes-compra/:id/items",
  authenticate,
  authorizeAdmin,
  adminController.addItemToOrder
);
router.delete(
  "/ordenes-compra/:id/items/:detalleId",
  authenticate,
  authorizeAdmin,
  adminController.removeItemFromOrder
);
router.get(
  "/ordenes-compra/:id/export",
  authenticate,
  authorizeAdmin,
  adminController.getOrderDetailsForExcel
);
router.get(
  "/ordenes-compra/:id/pdf",
  authenticate,
  authorizeAdmin,
  ordenCompraPDFController.generarPDFOrdenCompra
);
// ✅ REFACTORED: Migrado a recepcionInventarioController.js
router.post(
  "/ordenes-compra/recibir",
  authenticate,
  authorizeAdmin,
  recepcionInventarioController.recibirInventario
);

router.post(
  "/ordenes-compra/:id/cerrar-sesion",
  authenticate,
  authorizeAdmin,
  adminController.cerrarSesionRecepcion
);

router.post(
  "/ordenes-compra/:id/recibir-item",
  authenticate,
  authorizeAdmin,
  adminController.recibirItemOrdenCompra
);

// Reasignar orden de compra (solo super admin)
router.patch(
  "/ordenes-compra/:id/reasignar",
  authenticate,
  authorizeSuperAdmin,
  reasignarOrdenController.reasignarOrdenCompra
);

// Session locking for inventory reception
router.post(
  "/ordenes-compra/:id/bloquear-sesion",
  authenticate,
  authorizeAdmin,
  adminController.bloquearSesionRecepcion
);

router.post(
  "/ordenes-compra/:id/desbloquear-sesion",
  authenticate,
  authorizeAdmin,
  adminController.desbloquearSesionRecepcion
);

router.get(
  "/ordenes-compra/:id/verificar-bloqueo",
  authenticate,
  authorizeAdmin,
  adminController.verificarBloqueoSesion
);

router.post(
  "/ordenes-compra/:id/reasignar-sesion",
  authenticate,
  authorizeSuperAdmin,
  adminController.reasignarSesion
);

router.post(
  "/ordenes-compra/:id/forzar-liberacion",
  authenticate,
  authorizeSuperAdmin,
  adminController.forzarLiberacionSesion
);

router.post(
  "/recepcion-masiva",
  authenticate,
  authorizeAdmin,
  uploadComprobante.single("archivoRemision"),
  adminController.recepcionMasivaOrdenCompra
);

router.post(
  "/ordenes-compra/recibir/evidencia",
  authenticate,
  authorizeAdmin,
  upload.single("evidencia"),
  adminController.subirEvidenciaRecepcionOC
);

/**
 * Rutas de Agrupación de Órdenes de Compra
 */
router.post(
  "/ordenes-compra/agrupar",
  authenticate,
  authorizeAdmin,
  ordenesGruposController.agruparOrdenes
);
router.get(
  "/ordenes-compra/grupos",
  authenticate,
  authorizeAdmin,
  ordenesGruposController.getAllGrupos
);
router.get(
  "/ordenes-compra/grupos/:id",
  authenticate,
  authorizeAdmin,
  ordenesGruposController.getGrupoDetalle
);
router.get(
  "/ordenes-compra/grupos/:id/consolidado",
  authenticate,
  authorizeAdmin,
  ordenesGruposController.getGrupoConsolidado
);
router.get(
  "/ordenes-compra/grupos/:id/pdf-proveedor",
  authenticate,
  authorizeAdmin,
  gruposOrdenesPDFController.generarPDFProveedorGrupo
);
router.get(
  "/ordenes-compra/grupos/:id/pdf-interno",
  authenticate,
  authorizeAdmin,
  gruposOrdenesPDFController.generarPDFInternoGrupo
);
router.get(
  "/ordenes-compra/grupos/:id/excel-proveedor",
  authenticate,
  authorizeAdmin,
  gruposOrdenesExcelController.generarExcelProveedorGrupo
);
router.get(
  "/ordenes-compra/grupos/:id/excel-interno",
  authenticate,
  authorizeAdmin,
  gruposOrdenesExcelController.generarExcelInternoGrupo
);
router.put(
  "/ordenes-compra/grupos/:id/agregar-ordenes",
  authenticate,
  authorizeAdmin,
  ordenesGruposController.agregarOrdenesAGrupo
);
router.delete(
  "/ordenes-compra/grupos/:id",
  authenticate,
  authorizeAdmin,
  ordenesGruposController.desagruparOrdenes
);

/**
 * Rutas de Optimización de Compras (Consolidación)
 */
router.get(
  "/ordenes/sugerencias-optimizacion",
  authenticate,
  authorizeAdmin,
  adminController.getSugerenciasOptimizacion
);
router.post(
  "/ordenes/crear-grupo-optimizado",
  authenticate,
  authorizeAdmin,
  adminController.crearGrupoOptimizado
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

router.get(
  "/bitacora/actividad",
  authenticate,
  verifySuperAdmin,
  bitacoraController.obtenerActividad
);

router.get(
  "/bitacora/actividad/usuarios",
  authenticate,
  verifySuperAdmin,
  bitacoraController.obtenerUsuariosActividad
);

router.get(
  "/bitacora/actividad/entidades",
  authenticate,
  verifySuperAdmin,
  bitacoraController.obtenerEntidadesActividad
);

// Rutas de Inventario
router.get(
  "/inventario/entradas/exportar",
  authenticate,
  authorizeAdmin,
  inventarioController.exportarEntradasAlmacen
);

router.get(
  "/inventario/ordenes-pendientes",
  authenticate,
  authorizeAdmin,
  inventarioController.getOrdenesPendientes
);

/**
 * Gestión de cuentas bancarias empresa (múltiples)
 */
router.get(
  "/cuenta-maestra",
  authenticate,
  authorizeAdmin,
  numCuentaController.obtenerCuentasEmpresa
);
router.post(
  "/cuenta-maestra",
  authenticate,
  authorizeAdmin,
  numCuentaController.crearCuentaEmpresa
);
router.put(
  "/cuenta-maestra/:id/activar",
  authenticate,
  authorizeAdmin,
  numCuentaController.activarCuentaEmpresa
);
router.delete(
  "/cuenta-maestra/:id",
  authenticate,
  authorizeAdmin,
  numCuentaController.eliminarCuentaEmpresa
);

/**
 * Gestión de cuentas bancarias admin individual (legacy)
 */
router.get(
  "/numcuenta",
  authenticate,
  authorizeAdmin,
  numCuentaController.obtenerCuentaAdmin
);
router.put(
  "/numcuenta",
  authenticate,
  authorizeAdmin,
  numCuentaController.actualizarCuentaAdmin
);

/**
 * Migración de datos - Sincronizar imágenes de variantes por color
 */
router.post(
  "/migration/sincronizar-imagenes-color",
  authenticate,
  authorizeAdmin,
  migrationController.sincronizarImagenesPorColor
);

/**
 * Landing Page Editor - Gestión de contenido dinámico
 */
router.get(
  "/landing/config",
  authenticate,
  authorizeAdmin,
  landingEditorController.getConfig
);

router.post(
  "/landing/draft",
  authenticate,
  authorizeAdmin,
  landingEditorController.saveDraft
);

router.post(
  "/landing/publish",
  authenticate,
  authorizeAdmin,
  landingEditorController.publishChanges
);

router.post(
  "/landing/upload-image",
  authenticate,
  authorizeAdmin,
  upload.single('image'),
  landingEditorController.uploadImage
);

router.get(
  "/landing/categories",
  authenticate,
  authorizeAdmin,
  landingEditorController.getCategories
);

router.post(
  "/landing/reset",
  authenticate,
  authorizeAdmin,
  landingEditorController.resetDraft
);

router.get(
  "/landing/smart-selector-data",
  authenticate,
  authorizeAdmin,
  landingEditorController.getSmartSelectorData
);

// Landing carousel items CRUD
router.get(
  "/landing-config",
  authenticate,
  authorizeAdmin,
  landingEditorController.getLandingItems
);

router.post(
  "/landing-config",
  authenticate,
  authorizeAdmin,
  landingEditorController.createLandingItem
);

router.put(
  "/landing-config/:id",
  authenticate,
  authorizeAdmin,
  landingEditorController.updateLandingItem
);

router.delete(
  "/landing-config/:id",
  authenticate,
  authorizeAdmin,
  landingEditorController.deleteLandingItem
);

router.post(
  "/landing-config/reorder",
  authenticate,
  authorizeAdmin,
  landingEditorController.reorderLandingItems
);

// =====================================================
// RUTAS DE AJUSTES DE INVENTARIO (AUDITORÍA)
// =====================================================

// Registrar ajuste de inventario (Merma/Adición)
router.post(
  "/inventario/ajuste",
  authenticate,
  authorizeAdmin,
  inventarioAjusteController.registrarAjusteInventario
);

// Obtener historial de movimientos (con filtros)
router.get(
  "/inventario/movimientos",
  authenticate,
  authorizeAdmin,
  inventarioAjusteController.obtenerHistorialMovimientos
);

// Obtener catálogo de motivos de ajuste
router.get(
  "/inventario/motivos-ajuste",
  authenticate,
  authorizeAdmin,
  inventarioAjusteController.obtenerMotivosAjuste
);

// Obtener estadísticas de ajustes
router.get(
  "/inventario/estadisticas-ajustes",
  authenticate,
  authorizeAdmin,
  inventarioAjusteController.obtenerEstadisticasAjustes
);

// Buscar producto por SKU (para formulario de ajuste)
router.get(
  "/inventario/buscar-producto",
  authenticate,
  authorizeAdmin,
  inventarioAjusteController.buscarProductoPorSKU
);

// Autocompletado visual de productos (SIN STOCK - Seguridad Ciega)
router.get(
  "/inventario/productos/autocompletado",
  authenticate,
  authorizeAdmin,
  inventarioAjusteController.buscarProductosAutocompletado
);

// Obtener variantes de un producto maestro (SIN STOCK - Seguridad Ciega)
router.get(
  "/inventario/productos/:productoId/variantes",
  authenticate,
  authorizeAdmin,
  inventarioAjusteController.getVariantesProducto
);

// ============================================
// RUTAS DE AUDITORÍA MENSUAL DE INVENTARIO
// ============================================

router.post(
  "/auditoria/sesiones",
  authenticate,
  authorizeAdmin,
  auditController.crearSesionAuditoria
);

router.get(
  "/auditoria/sesiones",
  authenticate,
  authorizeAdmin,
  auditController.obtenerSesionesAuditoria
);

router.get(
  "/auditoria/sesiones/:sesionId",
  authenticate,
  authorizeAdmin,
  auditController.obtenerSesionDetalle
);

router.post(
  "/auditoria/sesiones/:sesionId/conteos",
  authenticate,
  authorizeAdmin,
  auditController.registrarConteo
);

router.get(
  "/auditoria/sesiones/:sesionId/reconciliacion",
  authenticate,
  authorizeAdmin,
  auditController.obtenerReconciliacion
);

router.post(
  "/auditoria/conteos/:conteoId/comentario",
  authenticate,
  authorizeAdmin,
  auditController.agregarComentario
);

router.post(
  "/auditoria/sesiones/:sesionId/cerrar",
  authenticate,
  authorizeSuperAdmin,
  auditController.cerrarYSincronizarAuditoria
);

router.get(
  "/auditoria/sesiones/:sesionId/reporte",
  authenticate,
  authorizeAdmin,
  auditController.generarReporteAuditoria
);

router.get(
  "/auditoria/stock-teorico/:sku",
  authenticate,
  authorizeAdmin,
  auditController.obtenerStockTeorico
);

router.get(
  "/auditoria/stock-teorico-masivo",
  authenticate,
  authorizeAdmin,
  auditController.calcularStockTeoricoMasivo
);

router.put(
  "/pedidos/:id/ajustar",
  authenticate,
  authorizeAdmin,
  ajustePedidosController.ajustarPedido
);

router.get(
  "/landing-config",
  authenticate,
  authorizeAdmin,
  landingConfigController.getLandingConfig
);

router.post(
  "/landing-config",
  authenticate,
  authorizeAdmin,
  landingConfigController.createLandingItem
);

router.put(
  "/landing-config/:id",
  authenticate,
  authorizeAdmin,
  landingConfigController.updateLandingItem
);

router.delete(
  "/landing-config/:id",
  authenticate,
  authorizeAdmin,
  landingConfigController.deleteLandingItem
);

router.post(
  "/landing-config/reorder",
  authenticate,
  authorizeAdmin,
  landingConfigController.reorderLandingItems
);

// ✅ MISIÓN 2: Categories and Brands Landing Management
router.put(
  "/categorias/:id/landing",
  authenticate,
  authorizeAdmin,
  landingItemsController.updateCategoryLanding
);

router.put(
  "/proveedores/:id/landing",
  authenticate,
  authorizeAdmin,
  landingItemsController.updateProveedorLanding
);

/**
 * Gestión de cupones
 */
router.get(
  "/cupones",
  authenticate,
  authorizeAdmin,
  cuponesController.listarCupones
);

router.get(
  "/cupones/:id",
  authenticate,
  authorizeAdmin,
  cuponesController.obtenerCupon
);

router.post(
  "/cupones",
  authenticate,
  authorizeAdmin,
  cuponesController.crearCupon
);

router.put(
  "/cupones/:id",
  authenticate,
  authorizeAdmin,
  cuponesController.actualizarCupon
);

router.delete(
  "/cupones/:id",
  authenticate,
  authorizeAdmin,
  cuponesController.desactivarCupon
);

/**
 * Reportes de Inventario - Historial de Sesiones
 */
router.get(
  "/inventario/sesiones",
  authenticate,
  authorizeAdmin,
  inventarioReportesController.obtenerSesionesInventario
);

router.get(
  "/inventario/sesiones/:sesionId/detalle",
  authenticate,
  authorizeAdmin,
  inventarioReportesController.obtenerDetalleSesion
);

router.get(
  "/inventario/reporte/:sesionId",
  authenticate,
  authorizeAdmin,
  inventarioReportesController.generarReportePDF
);

/**
 * FIFO Allocation Recalculation
 * Endpoints para recalcular el estatus de surtido de pedidos usando lógica FIFO
 */
router.post(
  "/fifo/recalcular",
  authenticate,
  authorizeAdminOnly,
  fifoRecalculationController.recalcularTodosPedidos
);

router.post(
  "/fifo/recalcular/:pedidoId",
  authenticate,
  authorizeAdmin,
  fifoRecalculationController.recalcularPedidoEspecifico
);

router.get(
  "/fifo/conflictos",
  authenticate,
  authorizeAdmin,
  fifoRecalculationController.obtenerConflictosAllocation
);

/**
 * ✅ NUEVO: Rutas de Visibilidad de Ventas por Admin
 */

// Ver mis ventas (cada admin ve solo sus ventas)
router.get(
  "/mis-ventas",
  authenticate,
  authorizeAdmin,
  adminController.getMisVentas
);

// Ver breakdown de allocation de un pedido (Super Admin)
router.get(
  "/pedidos/:pedidoId/allocation",
  authenticate,
  authorizeAdmin,
  adminController.getPedidoAllocation
);

// Reporte de ventas por administrador (Super Admin)
router.get(
  "/reportes/ventas-por-admin",
  authenticate,
  authorizeAdmin,
  adminController.getReporteVentasPorAdmin
);

/**
 * @route   POST /api/admin/pedidos/:id/simulate-priority
 * @desc    Simulate impact of marking order as priority (dry-run, no DB changes)
 * @access  Private (Admin only)
 */
const pedidosController = require("../controllers/pedidosController");
router.post(
  "/pedidos/:id/simulate-priority",
  authenticate,
  authorizeAdmin,
  pedidosController.simulatePriorityImpact
);

/**
 * @route   POST /api/admin/pedidos/:id/toggle-priority
 * @desc    Toggle priority flag for manual FIFO override (VIP lane)
 * @access  Private (Admin only)
 */
router.post(
  "/pedidos/:id/toggle-priority",
  authenticate,
  authorizeAdmin,
  pedidosController.togglePrioridad
);

module.exports = router;
