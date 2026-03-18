const express = require("express");
const router = express.Router();
const multer = require("multer");
const adminAuthController = require("../controllers/auth/adminAuthController");
const { 
  loginAdminSchema, 
  crearAgenteSchema, 
  crearOrdenCompraSchema, 
  recibirInventarioSchema, 
  ajusteInventarioSchema, 
  abonoSchema 
} = require("../middlewares/validators/schemas");
const validate = require("../middlewares/validate");
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
const productosAdminController = require("../controllers/productosAdminController");
const clientesAdminController = require("../controllers/clientesAdminController");
const proveedoresAdminController = require("../controllers/proveedoresAdminController");
const categoriasAdminController = require("../controllers/categoriasAdminController");
const variantesAdminController = require("../controllers/variantesAdminController");
const cxcAdminController = require("../controllers/cxcAdminController");
const agentesAdminController = require("../controllers/agentesAdminController");
const comisionesAdminController = require("../controllers/comisionesAdminController");
const pedidosAdminController = require("../controllers/pedidosAdminController");
const pdfController = require("../controllers/pdfController");
const cxpAdminController = require("../controllers/cxpAdminController");
const movimientosInventarioController = require("../controllers/movimientosInventarioController");
const medidasAdminController = require("../controllers/medidasAdminController");
const configuracionController = require("../controllers/admin/configuracionController");
const tamanosAdminController = require("../controllers/tamanosAdminController");
const dashboardAdminController = require("../controllers/dashboardAdminController");
const dashboardComprasController = require("../controllers/dashboardComprasController");
const reportesVentasController = require("../controllers/reportesVentasController");
const authAdminController = require("../controllers/authAdminController");
const inventarioResumenController = require("../controllers/inventarioResumenController");
const exportacionInventarioController = require("../controllers/exportacionInventarioController");
const busquedaInventarioController = require("../controllers/busquedaInventarioController");
const ajustesInventarioController = require("../controllers/ajustesInventarioController");
const recepcionManualController = require("../controllers/recepcionManualController");
const reglasEmpaqueController = require("../controllers/reglasEmpaqueController");
const tiposProductoController = require("../controllers/tiposProductoController");
const detallesProductoController = require("../controllers/detallesProductoController");
const variantesPendientesController = require("../controllers/variantesPendientesController");
const toggleVisibilidadController = require("../controllers/toggleVisibilidadController");
const desvincularClienteController = require("../controllers/desvincularClienteController");
const imagenesProductoController = require("../controllers/imagenesProductoController");
const administradoresController = require("../controllers/administradoresController");
const solicitudesProveedorController = require("../controllers/solicitudesProveedorController");
const gestionOrdenCompraController = require("../controllers/gestionOrdenCompraController");
const busquedaVariantesController = require("../controllers/busquedaVariantesController");
const optimizacionController = require("../controllers/optimizacionController");
const reportesOrdenesCompraController = require("../controllers/reportesOrdenesCompraController");
const ajustesInventarioFiltradosController = require("../controllers/ajustesInventarioFiltradosController");
const backorderController = require("../controllers/backorderController");
const evidenciasController = require("../controllers/evidenciasController");
const remisionesPedidosController = require("../controllers/remisionesPedidosController");
const gestionPedidosAdminController = require("../controllers/gestionPedidosAdminController");
const sesionesRecepcionController = require("../controllers/sesionesRecepcionController");
const recepcionItemsController = require("../controllers/recepcionItemsController");
const detallesOrdenCompraController = require("../controllers/detallesOrdenCompraController");
const comprasPendientesController = require("../controllers/comprasPendientesController");
const validacionRecepcionController = require("../controllers/validacionRecepcionController");
const itemsOrdenCompraController = require("../controllers/itemsOrdenCompraController");
const excelOrdenCompraController = require("../controllers/excelOrdenCompraController");
const administradoresOCController = require("../controllers/administradoresOCController");
const recepcionMasivaController = require("../controllers/recepcionMasivaController");
const ordenCompraPDFController = require("../controllers/ordenCompraPDFController");
const fifoRecalculationController = require("../controllers/fifoRecalculationController");
const reasignarOrdenController = require("../controllers/reasignarOrdenController");
const ordenesGruposController = require("../controllers/ordenesGruposController");
const gruposOrdenesPDFController = require("../controllers/gruposOrdenesPDFController");
const gruposOrdenesExcelController = require("../controllers/gruposOrdenesExcelController");
const solicitudesModificacionController = require("../controllers/solicitudesModificacionController");
const pickingController = require("../controllers/pickingController");
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
  authorizeRole,
} = require("../middlewares/roleMiddleware");

// Rate limiter para proteger login de admin contra ataques de fuerza bruta
const { authLimiter, heavyOperationLimiter } = require("../middlewares/rateLimiter");

/**
 * @swagger
 * /api/admin/login:
 *   post:
 *     summary: Login de administrador
 *     tags: [Admin - Autenticación]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Login exitoso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         description: Credenciales inválidas
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: Demasiados intentos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
/**
 * Rutas de autenticación de admin (públicas)
 */
// ✅ REFACTORED: Migrado a authAdminController.js
// 🔒 SECURITY: Rate limited a 10 intentos cada 15 minutos
router.post("/login", authLimiter, loginAdminSchema, validate, authAdminController.loginAdmin);

/**
 * Rutas protegidas de admin (requieren autenticación y rol admin)
 */

/**
 * @swagger
 * /api/admin/cloudinary/signature:
 *   post:
 *     summary: Generar firma para upload a Cloudinary
 *     tags: [Admin - Utilidades]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Firma generada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 signature:
 *                   type: string
 *                 timestamp:
 *                   type: integer
 *       401:
 *         description: No autenticado o no es admin
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  "/cloudinary/signature",
  authenticate,
  authorizeAdmin,
  cloudinaryController.generarFirmaUpload
);

/**
 * @swagger
 * /api/admin/verify:
 *   get:
 *     summary: Verificar autenticación de administrador
 *     tags: [Admin - Autenticación]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Admin verificado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 admin:
 *                   type: object
 *       401:
 *         description: No autenticado o no es admin
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  "/verify",
  authenticate,
  authorizeAdmin,
  authAdminController.verifyAdmin
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
  adminAuthController.crearAdmin
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
// ✅ REFACTORED: Migrado a dashboardAdminController.js
router.get(
  "/dashboard-stats",
  authenticate,
  authorizeAdmin,
  dashboardAdminController.getDashboardStats
);

/**
 * @swagger
 * /api/admin/pedidos:
 *   get:
 *     summary: Listar pedidos del tenant
 *     tags: [Admin - Pedidos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Número de página
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Resultados por página
 *       - in: query
 *         name: estatus
 *         schema:
 *           type: string
 *           enum: [Pendiente, En proceso, Enviado, Entregado, Cancelado]
 *         description: Filtrar por estatus
 *     responses:
 *       200:
 *         description: Lista de pedidos paginada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                 pagination:
 *                   $ref: '#/components/schemas/PaginationMeta'
 *       401:
 *         description: No autorizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
/**
 * Gestión de pedidos
 */
// ✅ REFACTORED: Migrado a pedidosAdminController.js
router.get(
  "/pedidos",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'inventarios', 'gerente_comercial', 'supervisor_ventas', 'soporte_cliente', 'auditor_interno']),
  pedidosAdminController.getAllPedidos
);
// ✅ REFACTORED: Migrado a pedidosStatusController.js (Strangler Pattern)
router.put(
  "/pedidos/:id",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'inventarios', 'gerente_comercial', 'supervisor_ventas']),
  pedidosStatusController.updatePedidoEstatus
);
// ✅ REFACTORED: Migrado a gestionPedidosAdminController.js
router.put(
  "/pedidos/:id/costo-envio",
  authenticate,
  authorizeAdmin,
  gestionPedidosAdminController.updateCostoEnvio
);

// ✅ REFACTORED: Migrado a pedidosAdminController.js
router.post(
  "/pedidos/:id/confirmar",
  authenticate,
  authorizeAdmin,
  pedidosAdminController.confirmarPedido
);

// Surtir pedido (marcar como listo para surtir - inventarios)
router.post(
  "/pedidos/:id/surtir",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'inventarios', 'gerente_operaciones', 'jefe_almacen']),
  pedidosAdminController.surtirPedido
);

// Confirmar surtido y reducir inventario (finanzas y secretaria)
router.post(
  "/pedidos/:id/confirmar-surtido",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_finanzas', 'secretaria']),
  pedidosAdminController.confirmarSurtidoFinanzas
);

// Rechazar pedido y regresar a almacén (finanzas)
router.post(
  "/pedidos/:id/rechazar-finanzas",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_finanzas']),
  pedidosAdminController.rechazarPedidoFinanzas
);

// Generar PDF de remisión para pedido (admin)
// Supports ?mostrarPrecios=false query param for inventarios role
router.get(
  "/pedidos/:id/pdf",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'inventarios', 'finanzas', 'gerente_comercial', 'gerente_finanzas']),
  heavyOperationLimiter,
  pdfController.generarPDFPedido
);

// Generar factura PDF para pedido (admin)
// Available for admin and finanzas roles
const facturaController = require("../controllers/facturaController");
router.get(
  "/pedidos/:id/factura",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_finanzas']),
  heavyOperationLimiter,
  facturaController.descargarFactura
);

/**
 * Solicitudes de Modificación de Pedidos (Sistema de Autorizaciones)
 */
// Crear solicitud de modificación (inventarios)
router.post(
  "/solicitudes-modificacion",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'inventarios', 'jefe_almacen']),
  solicitudesModificacionController.crearSolicitud
);

// Obtener solicitudes de modificación (con filtros)
router.get(
  "/solicitudes-modificacion",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'inventarios', 'gerente_operaciones', 'jefe_almacen', 'supervisor_ventas']),
  solicitudesModificacionController.obtenerSolicitudes
);

// Aprobar solicitud de modificación (supervisores y gerentes)
router.put(
  "/solicitudes-modificacion/:id/aprobar",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'gerente_operaciones', 'jefe_almacen', 'supervisor_ventas']),
  solicitudesModificacionController.aprobarSolicitud
);

// Rechazar solicitud de modificación (supervisores y gerentes)
router.put(
  "/solicitudes-modificacion/:id/rechazar",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'gerente_operaciones', 'jefe_almacen', 'supervisor_ventas']),
  solicitudesModificacionController.rechazarSolicitud
);

/**
 * Picking/Separación de Productos (Inventarios)
 */
// Obtener estado de picking de un pedido
router.get(
  "/pedidos/:id/picking",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'inventarios', 'gerente_operaciones', 'jefe_almacen']),
  pickingController.obtenerEstadoPicking
);

// Marcar todos los productos como separados (DEBE IR ANTES de /:detalleId)
router.post(
  "/pedidos/:id/picking/marcar-todos",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'inventarios', 'jefe_almacen']),
  pickingController.marcarTodosSeparados
);

// Marcar producto como separado
router.post(
  "/pedidos/:id/picking/:detalleId",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'inventarios', 'jefe_almacen', 'almacenista']),
  pickingController.marcarProductoSeparado
);

// Desmarcar producto (quitar separación)
router.delete(
  "/pedidos/:id/picking/:detalleId",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'inventarios', 'jefe_almacen']),
  pickingController.desmarcarProductoSeparado
);

/**
 * Gestión de productos
 */
// ✅ REFACTORED: Migrado a productosAdminController.js
router.get(
  "/productos",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'gerente_operaciones', 'jefe_almacen', 'almacenista', 'compras', 'marketing', 'soporte_cliente']),
  productosAdminController.getAllProductos
);

// ✅ REFACTORED: Migrado a busquedaInventarioController.js
router.get(
  "/productos/buscar",
  authenticate,
  authorizeAdmin,
  busquedaInventarioController.buscarProductosAjuste
);

// ✅ REFACTORED: Migrado a busquedaInventarioController.js
router.get(
  "/productos/buscar-compra",
  authenticate,
  authorizeAdminOrAgente,
  busquedaInventarioController.buscarProductosCompra
);

// ✅ REFACTORED: Migrado a detallesProductoController.js
router.get(
  "/productos/:id",
  authenticate,
  authorizeAdmin,
  detallesProductoController.getProductoDetalle
);

// ✅ REFACTORED: Migrado a variantesPendientesController.js
router.get(
  "/productos/:id/variantes-pendientes",
  authenticate,
  authorizeAdmin,
  variantesPendientesController.getVariantesPendientesProducto
);
// ✅ REFACTORED: Migrado a productosAdminController.js
router.post(
  "/productos",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'gerente_operaciones', 'compras']),
  uploadProductImages,
  productosAdminController.crearProducto
);
// ✅ REFACTORED: Migrado a productosAdminController.js
router.put(
  "/productos/:id",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'gerente_operaciones', 'compras', 'marketing']),
  uploadProductImages,
  productosAdminController.actualizarProducto
);

// ✅ REFACTORED: Migrado a toggleVisibilidadController.js
router.put(
  "/productos/:id/toggle-visibilidad",
  authenticate,
  authorizeAdmin,
  toggleVisibilidadController.toggleProductoVisibilidad
);

/**
 * @route   POST /api/admin/productos/:id/imagen
 * @desc    Subir imagen para un producto
 * @access  Private (Admin only)
 */
// ✅ REFACTORED: Migrado a imagenesProductoController.js
router.post(
  "/productos/:id/imagen",
  authenticate,
  authorizeAdmin,
  heavyOperationLimiter,
  upload.single("imagen"),
  imagenesProductoController.subirImagenProducto
);

router.post(
  "/productos/:id/imagenes",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'gerente_operaciones', 'compras', 'marketing']),
  heavyOperationLimiter,
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
  imagenesProductoController.subirImagenesProductoMultiple
);

// DELETE: Eliminar imagen de producto (físicamente de Cloudinary + BD)
// ✅ REFACTORED: Migrado a imagenesProductoController.js
router.delete(
  "/productos/imagenes/:id",
  authenticate,
  authorizeAdmin,
  imagenesProductoController.eliminarImagenProducto
);

router.post(
  "/variantes",
  authenticate,
  authorizeAdmin,
  heavyOperationLimiter,
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
  variantesAdminController.crearVariante
);
router.put(
  "/variantes/:id",
  authenticate,
  authorizeAdmin,
  heavyOperationLimiter,
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
  variantesAdminController.actualizarVariante
);

router.get(
  "/variantes/:id/imagenes",
  authenticate,
  authorizeAdmin,
  imagenesProductoController.getImagenesVariante
);

router.post(
  "/variantes/:id/imagenes",
  authenticate,
  authorizeAdmin,
  heavyOperationLimiter,
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
  imagenesProductoController.subirImagenesVarianteMultiple
);

// ✅ REFACTORED: Migrado a imagenesProductoController.js
router.put(
  "/variantes/:id/orden-imagenes",
  authenticate,
  authorizeAdmin,
  imagenesProductoController.actualizarOrdenImagenesVariante
);
// ✅ REFACTORED: Migrado a tamanosAdminController.js
router.get(
  "/tamanos-paquetes",
  authenticate,
  authorizeAdmin,
  tamanosAdminController.getTamanosPaquetes
);

// ✅ REFACTORED: Migrado a tamanosAdminController.js
router.get(
  "/productos/:id/tamanos-disponibles",
  authenticate,
  authorizeAdmin,
  tamanosAdminController.getTamanosDisponiblesProducto
);
// ✅ REFACTORED: Migrado a categoriasAdminController.js
router.get(
  "/categorias",
  authenticate,
  authorizeAdminOrAgente,
  categoriasAdminController.getCategorias
);
// ✅ REFACTORED: Migrado a categoriasAdminController.js
router.post(
  "/categorias",
  authenticate,
  authorizeAdmin,
  heavyOperationLimiter,
  uploadCategoryImage.single("image"),
  categoriasAdminController.crearCategoria
);
// ✅ REFACTORED: Migrado a categoriasAdminController.js
router.put(
  "/categorias/:id",
  authenticate,
  authorizeAdmin,
  heavyOperationLimiter,
  uploadCategoryImage.single("image"),
  categoriasAdminController.actualizarCategoria
);
// ✅ REFACTORED: Migrado a categoriasAdminController.js
router.delete(
  "/categorias/:id",
  authenticate,
  authorizeAdmin,
  categoriasAdminController.eliminarCategoria
);
// ✅ REFACTORED: Migrado a medidasAdminController.js
router.get(
  "/medidas",
  authenticate,
  authorizeAdmin,
  medidasAdminController.getMedidas
);
// ✅ REFACTORED: Migrado a medidasAdminController.js
router.get(
  "/medidas-existentes",
  authenticate,
  authorizeAdminOrAgente,
  medidasAdminController.getMedidasExistentes
);

/**
 * Gestión de inventario
 */
// ✅ REFACTORED: Migrado a inventarioResumenController.js
router.get(
  "/inventario",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'inventarios']),
  inventarioResumenController.getInventarioResumen
);

// ✅ REFACTORED: Migrado a administradoresController.js
router.get(
  "/administradores",
  authenticate,
  authorizeAdmin,
  administradoresController.getAllAdministradores
);

// ✅ REFACTORED: Migrado a exportacionInventarioController.js
router.get(
  "/inventario/exportar-pdf",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'inventarios']),
  exportacionInventarioController.exportarInventarioPDF
);

// ✅ REFACTORED: Migrado a inventarioResumenController.js
router.get(
  "/inventario/producto-detalle/:id",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'inventarios']),
  inventarioResumenController.getProductoDetalleInventario
);

// ✅ REFACTORED: Migrado a ajustesInventarioController.js
router.post(
  "/inventario/ajuste",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'inventarios']),
  ajusteInventarioSchema,
  validate,
  ajustesInventarioController.ajustarInventario
);

// ✅ REFACTORED: Migrado a movimientosInventarioController.js
router.get(
  "/inventario/:varianteId/historial",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'inventarios']),
  movimientosInventarioController.getHistorialInventarioVariante
);

// ✅ REFACTORED: Migrado a movimientosInventarioController.js
router.get(
  "/movimientos",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'inventarios']),
  movimientosInventarioController.getMovimientosInventario
);

// Búsqueda de variantes con autocompletado para movimientos
// ✅ REFACTORED: Migrado a busquedaVariantesController.js
router.get(
  "/variantes/search",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'inventarios']),
  busquedaVariantesController.searchVariantesMovimientos
);

// Ajustes de inventario con filtros avanzados para conciliación
// ✅ REFACTORED: Migrado a ajustesInventarioFiltradosController.js
router.get(
  "/ajustes-inventario/filtrados",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'inventarios']),
  ajustesInventarioFiltradosController.getAjustesInventarioFiltrados
);

// Obtener tipos de ajuste disponibles
// ✅ REFACTORED: Migrado a ajustesInventarioFiltradosController.js
router.get(
  "/ajustes-inventario/tipos",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'inventarios']),
  ajustesInventarioFiltradosController.getTiposAjusteInventario
);

// ✅ REFACTORED: Migrado a recepcionManualController.js
router.post(
  "/recepcion",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'inventarios']),
  recepcionManualController.recepcionarMercancia
);

/**
 * Gestión de agentes
 */
// ✅ REFACTORED: Migrado a agentesAdminController.js
router.get(
  "/agentes",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'gerente_comercial', 'supervisor_ventas']),
  agentesAdminController.getAllAgentes
);
// ✅ REFACTORED: Migrado a agentesAdminController.js
router.post(
  "/agentes",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'gerente_comercial']),
  crearAgenteSchema,
  validate,
  agentesAdminController.crearAgente
);
// ✅ REFACTORED: Migrado a agentesAdminController.js
router.get(
  "/agentes/:id",
  authenticate,
  authorizeAdmin,
  agentesAdminController.getAgenteDetalle
);
// ✅ REFACTORED: Migrado a agentesAdminController.js
router.get(
  "/agentes/:id/clientes",
  authenticate,
  authorizeAdmin,
  agentesAdminController.getAgenteClientes
);
// ✅ REFACTORED: Migrado a agentesAdminController.js
router.put(
  "/agentes/:id",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'gerente_comercial']),
  agentesAdminController.actualizarAgente
);
// ✅ REFACTORED: Migrado a agentesAdminController.js
router.put(
  "/agentes/:id/desactivar",
  authenticate,
  authorizeAdmin,
  agentesAdminController.desactivarAgente
);

/**
 * Gestión de comisiones
 */
// ✅ REFACTORED: Migrado a comisionesAdminController.js
router.get(
  "/comisiones",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_comercial', 'supervisor_ventas', 'ejecutivo_cobranza']),
  comisionesAdminController.getAllComisiones
);
// ✅ REFACTORED: Migrado a comisionesAdminController.js
router.put(
  "/comisiones/:id/pagar",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_comercial', 'gerente_finanzas']),
  comisionesAdminController.pagarComision
);

router.get(
  "/cuentas-por-pagar/kpis",
  authenticate,
  authorizeAdmin,
  cxpController.getCxPKPIs
);

// ✅ REFACTORED: Migrado a cxpAdminController.js
router.get(
  "/cuentas-por-pagar",
  authenticate,
  authorizeAdmin,
  cxpAdminController.getCuentasPorPagar
);

router.get(
  "/cuentas-por-pagar/:id",
  authenticate,
  authorizeAdmin,
  cxpController.getCxPDetalle
);

// ✅ REFACTORED: Migrado a cxpAdminController.js
router.post(
  "/cuentas-por-pagar/:id/pagar",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_finanzas', 'contador']),
  uploadComprobante.single("comprobante"),
  cxpAdminController.registrarPagoCuentaPorPagar
);

router.get(
  "/cxp/exportar",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_finanzas', 'contador', 'compras', 'auditor_interno']),
  cxpController.exportarLoteCxP
);

// ✅ REFACTORED: Migrado a cxcAdminController.js
router.get(
  "/cxc-summary",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_finanzas', 'ejecutivo_cobranza', 'contador', 'auditor_interno']),
  cxcAdminController.getCxcSummary
);

router.get(
  "/cxc/metricas",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_finanzas', 'ejecutivo_cobranza', 'contador', 'auditor_interno']),
  cxcController.getMetricasCobranza
);

router.get(
  "/cxc/exportar",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_finanzas', 'ejecutivo_cobranza', 'contador', 'auditor_interno']),
  cxcController.exportarLoteCxC
);

// ========================================
// PAGOS DE CLIENTES (tabla pagos_clientes)
// ========================================

router.get(
  "/pagos-clientes/pendientes",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_finanzas', 'ejecutivo_cobranza']),
  cxcController.getPagosClientesPendientes
);

router.post(
  "/pagos-clientes/:pagoId/gestionar",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_finanzas', 'ejecutivo_cobranza']),
  cxcController.gestionarPagoCliente
);

router.get(
  "/cxc/historial-movimientos",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_finanzas', 'ejecutivo_cobranza', 'contador', 'auditor_interno']),
  cxcController.obtenerHistorialMovimientos
);

router.get(
  "/cxc/exportar-detallado",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_finanzas', 'ejecutivo_cobranza', 'contador', 'auditor_interno']),
  cxcDetalladoController.exportarCxCDetallado
);

router.get(
  "/cxc/clientes-con-credito",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_finanzas', 'ejecutivo_cobranza', 'encargado_credito']),
  cxcDetalladoController.obtenerClientesConCredito
);

router.get(
  "/cxc/summary-aging",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_finanzas', 'ejecutivo_cobranza', 'contador', 'auditor_interno']),
  cxcController.getSummaryAging
);

router.get(
  "/cxc/cliente/:clienteId",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_finanzas', 'ejecutivo_cobranza', 'encargado_credito', 'soporte_cliente']),
  cxcController.getClienteCXCDetail
);

router.get(
  "/cxc/cliente/:clienteId/movimientos",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_finanzas', 'ejecutivo_cobranza', 'encargado_credito', 'soporte_cliente']),
  cxcController.getClienteCXCMovimientos
);

router.get(
  "/cxc/estado-cuenta/:clienteId",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_finanzas', 'ejecutivo_cobranza', 'encargado_credito', 'soporte_cliente']),
  cxcEnhancedController.getEstadoCuentaCliente
);

router.post(
  "/cxc/registrar-pago-manual",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_finanzas', 'ejecutivo_cobranza']),
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
  abonoSchema,
  validate,
  cxcAdminController.registrarAbonoCxC
);

// ✅ REFACTORED: Migrado a cxpAdminController.js
router.get(
  "/estado-cuenta/resumen",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_finanzas', 'contador', 'compras', 'auditor_interno']),
  cxpAdminController.getResumenEstadoCuentaProveedores
);

// ✅ REFACTORED: Migrado a cxpAdminController.js
router.get(
  "/estado-cuenta/proveedores/:id/movimientos",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_finanzas', 'contador', 'compras', 'auditor_interno']),
  cxpAdminController.getEstadoCuentaProveedorMovimientos
);

// ✅ REFACTORED: Migrado a cxpAdminController.js
router.get(
  "/estado-cuenta/cxp/:id/productos",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_finanzas', 'contador', 'compras', 'auditor_interno']),
  cxpAdminController.getProductosRecibidosPorCxp
);

/**
 * Validación de pagos por transferencia
 */
router.get(
  "/pagos/pendientes",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas']),
  pagosController.getPagosPendientes
);

router.put(
  "/pagos/:pagoId/aprobar",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas']),
  pagosController.aprobarPago
);

router.put(
  "/pagos/:pagoId/rechazar",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas']),
  pagosController.rechazarPago
);

/**
 * Gestión de clientes
 */
// ✅ REFACTORED: Migrado a clientesAdminController.js
router.get(
  "/clientes",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_comercial', 'supervisor_ventas', 'ejecutivo_cobranza', 'encargado_credito', 'soporte_cliente', 'auditor_interno']),
  clientesAdminController.getAllClientes
);
// ✅ REFACTORED: Migrado a clientesAdminController.js
router.get(
  "/clientes/:id",
  authenticate,
  authorizeAdmin,
  clientesAdminController.getClienteDetalle
);
// ✅ REFACTORED: Migrado a clientesAdminController.js
router.put(
  "/clientes/:id/estado",
  authenticate,
  authorizeAdmin,
  clientesAdminController.actualizarEstadoCliente
);
// ✅ REFACTORED: Migrado a desvincularClienteController.js
router.put(
  "/clientes/:id/desvincular",
  authenticate,
  authorizeAdmin,
  desvincularClienteController.desvincularClienteDeAgente
);
router.put(
  "/clientes/:id/reset-password",
  authenticate,
  authorizeAdmin,
  adminAuthController.adminResetPassword
);
// ✅ REFACTORED: Migrado a clientesAdminController.js
router.get(
  "/clientes/:id/credito",
  authenticate,
  authorizeAdmin,
  clientesAdminController.getClienteCreditoInfo
);
// ✅ REFACTORED: Migrado a clientesAdminController.js
router.put(
  "/clientes/:id/credito",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_finanzas', 'encargado_credito']),
  clientesAdminController.actualizarCreditoCliente
);

/**
 * Detalle de pedido
 */
// ✅ REFACTORED: Migrado a pedidosAdminController.js
router.get(
  "/pedidos/:id/detalle",
  authenticate,
  authorizeAdmin,
  pedidosAdminController.getPedidoDetalle
);

/**
 * Evidencia de Entrega / Remisión Firmada
 */
const uploadEvidenciaEntrega = require("../middlewares/uploadEvidenciaEntrega");

// ✅ REFACTORED: Migrado a evidenciasController.js
router.post(
  "/pedidos/:id/evidencia",
  authenticate,
  authorizeAdmin,
  uploadEvidenciaEntrega.single("evidencia"),
  evidenciasController.subirEvidenciaEntrega
);

// ✅ REFACTORED: Migrado a remisionesPedidosController.js
router.get(
  "/pedidos/:id/remision",
  authenticate,
  authorizeAdmin,
  remisionesPedidosController.obtenerRemisionPedido
);

/**
 * Gestión de proveedores
 */
// ✅ REFACTORED: Migrado a proveedoresAdminController.js
router.get(
  "/proveedores",
  authenticate,
  authorizeAdmin,
  proveedoresAdminController.getAllProveedores
);
// ✅ REFACTORED: Migrado a proveedoresAdminController.js
router.get(
  "/proveedores/:id",
  authenticate,
  authorizeAdmin,
  proveedoresAdminController.getProveedorById
);
// ✅ REFACTORED: Migrado a proveedoresAdminController.js
router.post(
  "/proveedores",
  authenticate,
  authorizeAdmin,
  proveedoresAdminController.crearProveedor
);
// ✅ REFACTORED: Migrado a proveedoresAdminController.js
router.put(
  "/proveedores/:id",
  authenticate,
  authorizeAdmin,
  proveedoresAdminController.actualizarProveedor
);

// ✅ REFACTORED: Migrado a tiposProductoController.js
router.get(
  "/tipos-producto",
  authenticate,
  authorizeAdmin,
  tiposProductoController.getTiposProductoAdmin
);

// ✅ REFACTORED: Migrado a tiposProductoController.js
router.post(
  "/tipos-producto",
  authenticate,
  authorizeAdmin,
  tiposProductoController.crearTipoProductoAdmin
);

// ✅ REFACTORED: Migrado a solicitudesProveedorController.js
router.get(
  "/proveedores/:id/solicitudes-pendientes",
  authenticate,
  authorizeAdmin,
  solicitudesProveedorController.getSolicitudesPendientesProveedor
);

// ✅ REFACTORED: Migrado a reglasEmpaqueController.js
router.get(
  "/proveedores/:id/reglas",
  authenticate,
  authorizeAdmin,
  reglasEmpaqueController.getReglasEmpaqueProveedor
);

// ✅ REFACTORED: Migrado a reglasEmpaqueController.js
router.get(
  "/proveedores/:id/reglas-multiples",
  authenticate,
  authorizeAdmin,
  reglasEmpaqueController.getReglasEmpaqueProveedorMultiples
);

// ✅ REFACTORED: Migrado a reglasEmpaqueController.js
router.post(
  "/save-reglas-empaque",
  authenticate,
  authorizeAdmin,
  reglasEmpaqueController.saveReglasEmpaqueMultiples
);

// ✅ REFACTORED: Migrado a reglasEmpaqueController.js
router.post(
  "/proveedores/reglas",
  authenticate,
  authorizeAdmin,
  reglasEmpaqueController.saveReglaEmpaque
);

// ✅ REFACTORED: Migrado a reglasEmpaqueController.js
router.put(
  "/proveedores/:id/reglas",
  authenticate,
  authorizeAdmin,
  reglasEmpaqueController.saveReglaEmpaque
);

/**
 * Conteo Ciego (Blind Count) - Recepción de Órdenes de Compra
 */
// ✅ REFACTORED: Migrado a comprasPendientesController.js
router.get(
  "/compras/pendientes",
  authenticate,
  authorizeAdmin,
  comprasPendientesController.getComprasPendientes
);
// ✅ REFACTORED: Migrado a comprasPendientesController.js
router.get(
  "/compras/:id/detalle-ciego",
  authenticate,
  authorizeAdmin,
  comprasPendientesController.getCompraDetalleCiego
);
// ✅ REFACTORED: Migrado a validacionRecepcionController.js
router.post(
  "/compras/:id/validar-recepcion",
  authenticate,
  authorizeAdmin,
  validacionRecepcionController.validarRecepcionCompra
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
  authorizeRole(['super_admin', 'admin', 'gerente_operaciones', 'compras', 'jefe_almacen', 'recepcionista_compras', 'contador', 'auditor_interno']),
  ordenesCompraController.getAllOrdenesCompra
);
// ✅ REFACTORED: Migrado a reportesOrdenesCompraController.js
router.get(
  "/ordenes-compra/reportes",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'gerente_operaciones', 'compras', 'jefe_almacen', 'almacenista', 'recepcionista_compras', 'contador', 'auditor_interno']),
  reportesOrdenesCompraController.getOrdenesCompraReportes
);
// ✅ REFACTORED: Migrado a administradoresOCController.js
router.get(
  "/ordenes-compra/administradores",
  authenticate,
  authorizeAdmin,
  administradoresOCController.getAdministradoresOrdenesCompra
);
// ✅ REFACTORED: Migrado a detallesOrdenCompraController.js
router.get(
  "/ordenes-compra/:id/detalles",
  authenticate,
  authorizeAdmin,
  detallesOrdenCompraController.getDetallesOrdenCompra
);
// ✅ REFACTORED: Migrado a detallesOrdenCompraController.js
router.get(
  "/ordenes-compra/:id/recepcion",
  authenticate,
  authorizeAdmin,
  detallesOrdenCompraController.getRecepcionOrdenCompra
);
// ✅ REFACTORED: Migrado a reportesOrdenesCompraController.js
router.get(
  "/ordenes-compra/:id/reporte-detallado",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'gerente_operaciones', 'compras', 'jefe_almacen', 'almacenista', 'recepcionista_compras', 'contador', 'auditor_interno']),
  reportesOrdenesCompraController.getOrdenCompraReporteDetallado
);
// ✅ REFACTORED: Migrado a gestionOrdenCompraController.js
router.get(
  "/productos/variantes-proveedor/:proveedorId",
  authenticate,
  authorizeAdmin,
  gestionOrdenCompraController.getVariantesProveedor
);
// ✅ REFACTORED: Migrado a gestionOrdenCompraController.js
router.post(
  "/ordenes-compra/:id/agregar-producto",
  authenticate,
  authorizeAdmin,
  gestionOrdenCompraController.agregarProductoAOrdenCompra
);
// ✅ REFACTORED: Migrado a gestionOrdenCompraController.js
router.delete(
  "/ordenes-compra/:id/quitar-producto/:detalleId",
  authenticate,
  authorizeAdmin,
  gestionOrdenCompraController.quitarProductoDeOrdenCompra
);
// ✅ REFACTORED: Migrado a backorderController.js
router.post(
  "/ordenes-compra/:id/confirmar",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'gerente_operaciones', 'compras']),
  backorderController.confirmarOrdenBackorder
);
// ✅ REFACTORED: Migrado a backorderController.js
router.post(
  "/ordenes-compra/:id/cancelar",
  authenticate,
  authorizeAdmin,
  backorderController.cancelarOrdenBackorder
);
// ✅ REFACTORED: Migrado a ordenesCompraController.js
router.post(
  "/ordenes-compra",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'gerente_operaciones', 'compras']),
  crearOrdenCompraSchema,
  validate,
  ordenesCompraController.crearOrdenCompra
);
// ✅ REFACTORED: Migrado a itemsOrdenCompraController.js
router.post(
  "/ordenes-compra/:id/items",
  authenticate,
  authorizeAdmin,
  itemsOrdenCompraController.addItemToOrder
);
// ✅ REFACTORED: Migrado a itemsOrdenCompraController.js
router.delete(
  "/ordenes-compra/:id/items/:detalleId",
  authenticate,
  authorizeAdmin,
  itemsOrdenCompraController.removeItemFromOrder
);
// ✅ REFACTORED: Migrado a excelOrdenCompraController.js
router.get(
  "/ordenes-compra/:id/export",
  authenticate,
  authorizeAdmin,
  heavyOperationLimiter,
  excelOrdenCompraController.getOrderDetailsForExcel
);
router.get(
  "/ordenes-compra/:id/pdf",
  authenticate,
  authorizeAdmin,
  heavyOperationLimiter,
  ordenCompraPDFController.generarPDFOrdenCompra
);
// ✅ REFACTORED: Migrado a recepcionInventarioController.js
router.post(
  "/ordenes-compra/recibir",
  authenticate,
  authorizeAdmin,
  recibirInventarioSchema,
  validate,
  recepcionInventarioController.recibirInventario
);

// ✅ REFACTORED: Migrado a recepcionItemsController.js
router.post(
  "/ordenes-compra/:id/cerrar-sesion",
  authenticate,
  authorizeAdmin,
  recepcionItemsController.cerrarSesionRecepcion
);

// ✅ REFACTORED: Migrado a recepcionItemsController.js
router.post(
  "/ordenes-compra/:id/recibir-item",
  authenticate,
  authorizeAdmin,
  recepcionItemsController.recibirItemOrdenCompra
);

// Reasignar orden de compra (solo super admin)
router.patch(
  "/ordenes-compra/:id/reasignar",
  authenticate,
  authorizeSuperAdmin,
  reasignarOrdenController.reasignarOrdenCompra
);

// ✅ REFACTORED: Migrado a sesionesRecepcionController.js
router.post(
  "/ordenes-compra/:id/bloquear-sesion",
  authenticate,
  authorizeAdmin,
  sesionesRecepcionController.bloquearSesionRecepcion
);

// ✅ REFACTORED: Migrado a sesionesRecepcionController.js
router.post(
  "/ordenes-compra/:id/desbloquear-sesion",
  authenticate,
  authorizeAdmin,
  sesionesRecepcionController.desbloquearSesionRecepcion
);

// ✅ REFACTORED: Migrado a sesionesRecepcionController.js
router.get(
  "/ordenes-compra/:id/verificar-bloqueo",
  authenticate,
  authorizeAdmin,
  sesionesRecepcionController.verificarBloqueoSesion
);

// ✅ REFACTORED: Migrado a sesionesRecepcionController.js
router.post(
  "/ordenes-compra/:id/reasignar-sesion",
  authenticate,
  authorizeSuperAdmin,
  sesionesRecepcionController.reasignarSesion
);

// ✅ REFACTORED: Migrado a sesionesRecepcionController.js
router.post(
  "/ordenes-compra/:id/forzar-liberacion",
  authenticate,
  authorizeSuperAdmin,
  sesionesRecepcionController.forzarLiberacionSesion
);

router.post(
  "/recepcion-masiva",
  authenticate,
  authorizeAdmin,
  recepcionMasivaController.recepcionMasivaOrdenCompra
);

// ✅ REFACTORED: Migrado a evidenciasController.js
router.post(
  "/ordenes-compra/:id/evidencia",
  authenticate,
  authorizeAdmin,
  heavyOperationLimiter,
  upload.single("evidencia"),
  evidenciasController.subirEvidenciaRecepcionOC
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
  heavyOperationLimiter,
  gruposOrdenesPDFController.generarPDFProveedorGrupo
);
router.get(
  "/ordenes-compra/grupos/:id/pdf-interno",
  authenticate,
  authorizeAdmin,
  heavyOperationLimiter,
  gruposOrdenesPDFController.generarPDFInternoGrupo
);
router.get(
  "/ordenes-compra/grupos/:id/excel-proveedor",
  authenticate,
  authorizeAdmin,
  heavyOperationLimiter,
  gruposOrdenesExcelController.generarExcelProveedorGrupo
);
router.get(
  "/ordenes-compra/grupos/:id/excel-interno",
  authenticate,
  authorizeAdmin,
  heavyOperationLimiter,
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
// ✅ REFACTORED: Migrado a optimizacionController.js
router.get(
  "/ordenes/sugerencias-optimizacion",
  authenticate,
  authorizeAdmin,
  optimizacionController.getSugerenciasOptimizacion
);
// ✅ REFACTORED: Migrado a optimizacionController.js
router.post(
  "/ordenes/crear-grupo-optimizado",
  authenticate,
  authorizeAdmin,
  optimizacionController.crearGrupoOptimizado
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
  authorizeRole(['super_admin', 'admin', 'gerente_comercial', 'marketing', 'supervisor_ventas']),
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
  authorizeRole(['super_admin', 'admin', 'gerente_comercial', 'marketing']),
  cuponesController.crearCupon
);

router.put(
  "/cupones/:id",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'gerente_comercial', 'marketing']),
  cuponesController.actualizarCupon
);

router.delete(
  "/cupones/:id",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'gerente_comercial']),
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
// ✅ REFACTORED: Migrado a reportesVentasController.js
router.get(
  "/mis-ventas",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas']),
  reportesVentasController.getMisVentas
);

// Ver breakdown de allocation de un pedido (Super Admin)
// ✅ REFACTORED: Migrado a reportesVentasController.js
router.get(
  "/pedidos/:pedidoId/allocation",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas']),
  reportesVentasController.getPedidoAllocation
);

// Reporte de ventas por administrador (Super Admin)
// ✅ REFACTORED: Migrado a reportesVentasController.js
router.get(
  "/reportes/ventas-por-admin",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas']),
  reportesVentasController.getReporteVentasPorAdmin
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

/**
 * @route   GET /api/admin/configuracion/iva
 * @desc    Obtener configuración de IVA del tenant
 * @access  Private (Financial roles)
 */
router.get(
  "/configuracion/iva",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_finanzas', 'contador']),
  configuracionController.getIvaConfig
);

/**
 * @route   PUT /api/admin/configuracion/iva
 * @desc    Actualizar configuración de IVA del tenant
 * @access  Private (Financial roles)
 */
router.put(
  "/configuracion/iva",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_finanzas', 'contador']),
  configuracionController.updateIvaConfig
);

/**
 * @route   GET /api/admin/dashboard/compras-totales
 * @desc    Obtener totales consolidados para dashboard de compras
 * @access  Private (Compras roles)
 */
router.get(
  "/dashboard/compras-totales",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'compras']),
  dashboardComprasController.getComprasTotales
);

/**
 * @route   POST /api/admin/dashboard/compras-totales/invalidar-cache
 * @desc    Invalidar caché de totales de compras
 * @access  Private (Compras roles)
 */
router.post(
  "/dashboard/compras-totales/invalidar-cache",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'compras']),
  dashboardComprasController.invalidarCacheCompras
);

module.exports = router;
