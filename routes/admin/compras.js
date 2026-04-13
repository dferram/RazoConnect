const express = require("express");
const router = express.Router();
const ordenesCompraController = require("../../controllers/ordenesCompraController");
const gestionOrdenCompraController = require("../../controllers/gestionOrdenCompraController");
const recepcionInventarioController = require("../../controllers/recepcionInventarioController");
const comprasPendientesController = require("../../controllers/comprasPendientesController");
const validacionRecepcionController = require("../../controllers/validacionRecepcionController");
const purchaseSuggestionController = require("../../controllers/purchaseSuggestionController");
const backorderController = require("../../controllers/backorderController");
const itemsOrdenCompraController = require("../../controllers/itemsOrdenCompraController");
const excelOrdenCompraController = require("../../controllers/excelOrdenCompraController");
const detallesOrdenCompraController = require("../../controllers/detallesOrdenCompraController");
const reportesOrdenesCompraController = require("../../controllers/reportesOrdenesCompraController");
const administradoresOCController = require("../../controllers/administradoresOCController");
const sesionesRecepcionController = require("../../controllers/sesionesRecepcionController");
const recepcionItemsController = require("../../controllers/recepcionItemsController");
const recepcionMasivaController = require("../../controllers/recepcionMasivaController");
const evidenciasController = require("../../controllers/evidenciasController");
const ordenesGruposController = require("../../controllers/ordenesGruposController");
const gruposOrdenesPDFController = require("../../controllers/gruposOrdenesPDFController");
const gruposOrdenesExcelController = require("../../controllers/gruposOrdenesExcelController");
const reasignarOrdenController = require("../../controllers/reasignarOrdenController");
const optimizacionController = require("../../controllers/optimizacionController");
const ajustesAlmacenController = require("../../controllers/ajustesAlmacenController");
const fifoRecalculationController = require("../../controllers/fifoRecalculationController");
const ordenCompraPDFController = require("../../controllers/ordenCompraPDFController");
const { authenticate, authorizeRole, authorizeAdmin, authorizeSuperAdmin } = require("../../middlewares/roleMiddleware");
const { heavyOperationLimiter } = require("../../middlewares/rateLimiter");
const { crearOrdenCompraSchema, recibirInventarioSchema } = require("../../middlewares/validators/schemas");
const validate = require("../../middlewares/validate");
const upload = require("../../middlewares/upload");

/**
 * Conteo Ciego (Blind Count) - Recepción de Órdenes de Compra
 */
router.get(
  "/compras/pendientes",
  authenticate,
  authorizeAdmin,
  comprasPendientesController.getComprasPendientes
);

router.get(
  "/compras/:id/detalle-ciego",
  authenticate,
  authorizeAdmin,
  comprasPendientesController.getCompraDetalleCiego
);

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
router.get(
  "/ordenes-compra",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'gerente_operaciones', 'compras', 'jefe_almacen', 'recepcionista_compras', 'contador', 'auditor_interno']),
  ordenesCompraController.getAllOrdenesCompra
);

router.get(
  "/ordenes-compra/reportes",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'gerente_operaciones', 'compras', 'jefe_almacen', 'almacenista', 'recepcionista_compras', 'contador', 'auditor_interno']),
  reportesOrdenesCompraController.getOrdenesCompraReportes
);

router.get(
  "/ordenes-compra/administradores",
  authenticate,
  authorizeAdmin,
  administradoresOCController.getAdministradoresOrdenesCompra
);

router.get(
  "/ordenes-compra/:id/detalles",
  authenticate,
  authorizeAdmin,
  detallesOrdenCompraController.getDetallesOrdenCompra
);

router.get(
  "/ordenes-compra/:id/recepcion",
  authenticate,
  authorizeAdmin,
  detallesOrdenCompraController.getRecepcionOrdenCompra
);

router.get(
  "/ordenes-compra/:id/reporte-detallado",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'gerente_operaciones', 'compras', 'jefe_almacen', 'almacenista', 'recepcionista_compras', 'contador', 'auditor_interno']),
  reportesOrdenesCompraController.getOrdenCompraReporteDetallado
);

router.get(
  "/productos/variantes-proveedor/:proveedorId",
  authenticate,
  authorizeAdmin,
  gestionOrdenCompraController.getVariantesProveedor
);

router.post(
  "/ordenes-compra/:id/agregar-producto",
  authenticate,
  authorizeAdmin,
  gestionOrdenCompraController.agregarProductoAOrdenCompra
);

router.delete(
  "/ordenes-compra/:id/quitar-producto/:detalleId",
  authenticate,
  authorizeAdmin,
  gestionOrdenCompraController.quitarProductoDeOrdenCompra
);

router.post(
  "/ordenes-compra/:id/confirmar",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'gerente_operaciones', 'compras']),
  backorderController.confirmarOrdenBackorder
);

router.post(
  "/ordenes-compra/:id/cancelar",
  authenticate,
  authorizeAdmin,
  backorderController.cancelarOrdenBackorder
);

router.post(
  "/ordenes-compra",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'gerente_operaciones', 'compras']),
  crearOrdenCompraSchema,
  validate,
  ordenesCompraController.crearOrdenCompra
);

router.post(
  "/ordenes-compra/:id/items",
  authenticate,
  authorizeAdmin,
  itemsOrdenCompraController.addItemToOrder
);

router.delete(
  "/ordenes-compra/:id/items/:detalleId",
  authenticate,
  authorizeAdmin,
  itemsOrdenCompraController.removeItemFromOrder
);

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

router.post(
  "/ordenes-compra/recibir",
  authenticate,
  authorizeAdmin,
  recibirInventarioSchema,
  validate,
  recepcionInventarioController.recibirInventario
);

router.post(
  "/ordenes-compra/:id/cerrar-sesion",
  authenticate,
  authorizeAdmin,
  recepcionItemsController.cerrarSesionRecepcion
);

router.post(
  "/ordenes-compra/:id/recibir-item",
  authenticate,
  authorizeAdmin,
  recepcionItemsController.recibirItemOrdenCompra
);

/**
 * Ajustes de Almacén - Reconciliación de entradas con CxP
 */
router.get(
  "/ajustes-almacen/entradas-erroneas",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_finanzas', 'compras', 'inventarios']),
  ajustesAlmacenController.getEntradasErroneas
);

router.get(
  "/ajustes-almacen/entrada/:id/detalles",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_finanzas', 'compras', 'inventarios']),
  ajustesAlmacenController.getDetallesEntrada
);

router.post(
  "/ajustes-almacen/reconciliar",
  authenticate,
  authorizeRole(['super_admin', 'finanzas', 'gerente_finanzas', 'compras']),
  ajustesAlmacenController.reconciliarEntrada
);

// Reasignar orden de compra (solo super admin)
router.patch(
  "/ordenes-compra/:id/reasignar",
  authenticate,
  authorizeSuperAdmin,
  reasignarOrdenController.reasignarOrdenCompra
);

router.post(
  "/ordenes-compra/:id/bloquear-sesion",
  authenticate,
  authorizeAdmin,
  sesionesRecepcionController.bloquearSesionRecepcion
);

router.post(
  "/ordenes-compra/:id/desbloquear-sesion",
  authenticate,
  authorizeAdmin,
  sesionesRecepcionController.desbloquearSesionRecepcion
);

router.get(
  "/ordenes-compra/:id/verificar-bloqueo",
  authenticate,
  authorizeAdmin,
  sesionesRecepcionController.verificarBloqueoSesion
);

router.post(
  "/ordenes-compra/:id/reasignar-sesion",
  authenticate,
  authorizeSuperAdmin,
  sesionesRecepcionController.reasignarSesion
);

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
router.get(
  "/ordenes/sugerencias-optimizacion",
  authenticate,
  authorizeAdmin,
  optimizacionController.getSugerenciasOptimizacion
);

router.post(
  "/ordenes/crear-grupo-optimizado",
  authenticate,
  authorizeAdmin,
  optimizacionController.crearGrupoOptimizado
);

/**
 * FIFO Allocation Recalculation
 * Endpoints para recalcular el estatus de surtido de pedidos usando lógica FIFO
 */
router.post(
  "/fifo/recalcular",
  authenticate,
  authorizeRole(['super_admin', 'admin']),
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

module.exports = router;
