const express = require("express");
const router = express.Router();
const inventoryAuditController = require("../../controllers/inventoryAuditController");
const inventarioResumenController = require("../../controllers/inventarioResumenController");
const auditController = require("../../controllers/auditController");
const ajustesInventarioController = require("../../controllers/ajustesInventarioController");
const movimientosInventarioController = require("../../controllers/movimientosInventarioController");
const busquedaVariantesController = require("../../controllers/busquedaVariantesController");
const ajustesInventarioFiltradosController = require("../../controllers/ajustesInventarioFiltradosController");
const recepcionManualController = require("../../controllers/recepcionManualController");
const inventarioAjusteController = require("../../controllers/inventarioAjusteController");
const inventarioController = require("../../controllers/inventarioController");
const exportacionInventarioController = require("../../controllers/exportacionInventarioController");
const inventarioReportesController = require("../../controllers/inventarioReportesController");
const { authenticate, authorizeAdmin, authorizeRole, authorizeAdminOrAgente, authorizeSuperAdmin, authorizeAdminOnly } = require("../../middlewares/roleMiddleware");
const { ajusteInventarioSchema } = require("../../middlewares/validators/schemas");
const validate = require("../../middlewares/validate");

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
 * Gestión de inventario
 */
router.get(
  "/inventario",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'inventarios']),
  inventarioResumenController.getInventarioResumen
);

router.get(
  "/inventario/exportar-pdf",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'inventarios']),
  exportacionInventarioController.exportarInventarioPDF
);

router.get(
  "/inventario/producto-detalle/:id",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'inventarios']),
  inventarioResumenController.getProductoDetalleInventario
);

router.post(
  "/inventario/ajuste",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'inventarios']),
  ajusteInventarioSchema,
  validate,
  ajustesInventarioController.ajustarInventario
);

router.get(
  "/inventario/:varianteId/historial",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'inventarios']),
  movimientosInventarioController.getHistorialInventarioVariante
);

router.get(
  "/movimientos",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'inventarios']),
  movimientosInventarioController.getMovimientosInventario
);

// Búsqueda de variantes con autocompletado para movimientos
router.get(
  "/variantes/search",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'inventarios']),
  busquedaVariantesController.searchVariantesMovimientos
);

// Ajustes de inventario con filtros avanzados para conciliación
router.get(
  "/ajustes-inventario/filtrados",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'inventarios']),
  ajustesInventarioFiltradosController.getAjustesInventarioFiltrados
);

// Obtener tipos de ajuste disponibles
router.get(
  "/ajustes-inventario/tipos",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'inventarios']),
  ajustesInventarioFiltradosController.getTiposAjusteInventario
);

router.post(
  "/recepcion",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'inventarios']),
  recepcionManualController.recepcionarMercancia
);

/**
 * RUTAS DE AJUSTES DE INVENTARIO (AUDITORÍA)
 */

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

/**
 * RUTAS DE AUDITORÍA MENSUAL DE INVENTARIO
 */

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
 * Rutas de Inventario
 */
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

module.exports = router;
