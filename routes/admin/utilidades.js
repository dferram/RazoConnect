const express = require("express");
const router = express.Router();
const logger = require("../../utils/logger");
const dashboardAdminController = require("../../controllers/dashboardAdminController");
const dashboardComprasController = require("../../controllers/dashboardComprasController");
const dashboardFinanzasController = require("../../controllers/dashboardFinanzasController");
const reportesVentasController = require("../../controllers/reportesVentasController");
const configuracionController = require("../../controllers/admin/configuracionController");
const landingEditorController = require("../../controllers/landingEditorController");
const landingConfigController = require("../../controllers/landingConfigController");
const landingItemsController = require("../../controllers/landingItemsController");
const bitacoraController = require("../../controllers/bitacoraController");
const numCuentaController = require("../../controllers/numCuentaController");
const cloudinaryController = require("../../controllers/cloudinaryController");
const ajustePedidosController = require("../../controllers/ajustePedidosController");
const cuponesController = require("../../controllers/cuponesController");
const administradorEstadosController = require("../../controllers/administradorEstadosController");
const pedidoEstadoSincronizadorService = require("../../services/pedidoEstadoSincronizadorService");
const { analizarRiesgoCredito } = require("../../services/creditAnalysisService");
const migrationController = require("../../controllers/migrationController");
const { authenticate, authorizeAdmin, authorizeRole, authorizeSuperAdmin, verifySuperAdmin } = require("../../middlewares/roleMiddleware");
const { heavyOperationLimiter } = require("../../middlewares/rateLimiter");
const upload = require("../../middlewares/upload");

/**
 * Cloudinary
 */
router.post(
  "/cloudinary/signature",
  authenticate,
  authorizeAdmin,
  cloudinaryController.generarFirmaUpload
);

/**
 * Dashboard y estadísticas
 */
router.get(
  "/dashboard-stats",
  authenticate,
  authorizeAdmin,
  dashboardAdminController.getDashboardStats
);

router.get(
  "/dashboard/compras-totales",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'compras']),
  dashboardComprasController.getComprasTotales
);

router.post(
  "/dashboard/compras-totales/invalidar-cache",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'compras']),
  dashboardComprasController.invalidarCacheCompras
);

router.get(
  "/finanzas/resumen-totales",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas']),
  dashboardFinanzasController.getFinanzasTotales
);

router.post(
  "/finanzas/resumen-totales/invalidar-cache",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas']),
  dashboardFinanzasController.invalidarCacheFinanzas
);

/**
 * Reportes de Ventas
 */
router.get(
  "/mis-ventas",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas']),
  reportesVentasController.getMisVentas
);

router.get(
  "/pedidos/:pedidoId/allocation",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas']),
  reportesVentasController.getPedidoAllocation
);

router.get(
  "/reportes/ventas-por-admin",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas']),
  reportesVentasController.getReporteVentasPorAdmin
);

/**
 * Configuración
 */
router.get(
  "/configuracion/iva",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_finanzas', 'contador']),
  configuracionController.getIvaConfig
);

router.put(
  "/configuracion/iva",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_finanzas', 'contador']),
  configuracionController.updateIvaConfig
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
 * Landing Page Editor
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
 * Ajustes de Pedidos
 */
router.put(
  "/pedidos/:id/ajustar",
  authenticate,
  authorizeAdmin,
  ajustePedidosController.ajustarPedido
);

/**
 * Gestión de Estados
 */
router.get(
  "/gestionar-estados/admins",
  authenticate,
  authorizeRole(['super_admin', 'admin']),
  administradorEstadosController.getAdminsConEstados
);

router.get(
  "/gestionar-estados/estados",
  authenticate,
  authorizeRole(['super_admin', 'admin']),
  administradorEstadosController.getEstadosConAdmins
);

router.get(
  "/gestionar-estados/clientes",
  authenticate,
  authorizeRole(['super_admin', 'admin']),
  administradorEstadosController.getClientesConEstado
);

router.post(
  "/gestionar-estados/asignar",
  authenticate,
  authorizeRole(['super_admin']),
  administradorEstadosController.asignarEstados
);

/**
 * Sincronización de Estados de Pedidos
 */
router.get(
  "/estadisticas-cambios-estados",
  authenticate,
  authorizeRole(['super_admin', 'admin']),
  async (req, res) => {
    try {
      const { tenant_id } = req.tenant;
      const periodo = req.query.periodo || 'dia';

      const estadisticas = await pedidoEstadoSincronizadorService.obtenerEstadisticasCambios(
        tenant_id,
        periodo
      );

      res.json({
        success: true,
        ...estadisticas
      });
    } catch (error) {
      logger.error('[Admin Routes] Error obteniendo estadísticas', {
        error: error.message
      });
      res.status(500).json({
        success: false,
        message: "Error obteniendo estadísticas",
        error: error.message
      });
    }
  }
);

router.post(
  "/recalcular-pedidos-admin",
  authenticate,
  authorizeSuperAdmin,
  async (req, res) => {
    try {
      const { tenant_id } = req.tenant;
      const { adminId } = req.body;

      if (!adminId || isNaN(adminId)) {
        return res.status(400).json({
          success: false,
          message: "adminId es requerido y debe ser un número"
        });
      }

      const resultados = await pedidoEstadoSincronizadorService.recalcularPedidosDelAdmin(
        adminId,
        tenant_id
      );

      const conCambios = resultados.filter(r => r.cambio).length;

      res.json({
        success: true,
        totalPedidos: resultados.length,
        procesados: resultados.filter(r => !r.error).length,
        conCambios,
        datos: resultados
      });
    } catch (error) {
      logger.error('[Admin Routes] Error recalculando pedidos masivo', {
        error: error.message
      });
      res.status(500).json({
        success: false,
        message: "Error recalculando pedidos",
        error: error.message
      });
    }
  }
);

/**
 * Bitácora de Auditoría
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

/**
 * Migración de datos
 */
router.post(
  "/migration/sincronizar-imagenes-color",
  authenticate,
  authorizeAdmin,
  migrationController.sincronizarImagenesPorColor
);

/**
 * Análisis de crédito
 */
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

module.exports = router;
