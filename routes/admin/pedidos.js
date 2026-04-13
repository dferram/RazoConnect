const express = require("express");
const router = express.Router();
const pedidosAdminController = require("../../controllers/pedidosAdminController");
const pedidosStatusController = require("../../controllers/pedidosStatusController");
const gestionPedidosAdminController = require("../../controllers/gestionPedidosAdminController");
const pdfController = require("../../controllers/pdfController");
const pickingController = require("../../controllers/pickingController");
const solicitudesModificacionController = require("../../controllers/solicitudesModificacionController");
const evidenciasController = require("../../controllers/evidenciasController");
const remisionesPedidosController = require("../../controllers/remisionesPedidosController");
const rejectController = require("../../controllers/finanzas/rejectController");
const pedidoEstadoSincronizadorService = require("../../services/pedidoEstadoSincronizadorService");
const logger = require("../../utils/logger");
const facturaController = require("../../controllers/facturaController");
const { authenticate, authorizeAdmin, authorizeRole, authorizeSuperAdmin } = require("../../middlewares/roleMiddleware");
const { heavyOperationLimiter } = require("../../middlewares/rateLimiter");
const uploadEvidenciaEntrega = require("../../middlewares/uploadEvidenciaEntrega");
const upload = require("../../middlewares/upload");

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
router.get(
  "/pedidos",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'inventarios', 'gerente_comercial', 'supervisor_ventas', 'soporte_cliente', 'auditor_interno']),
  pedidosAdminController.getAllPedidos
);

router.put(
  "/pedidos/:id",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'inventarios', 'gerente_comercial', 'supervisor_ventas']),
  pedidosStatusController.updatePedidoEstatus
);

router.put(
  "/pedidos/:id/costo-envio",
  authenticate,
  authorizeAdmin,
  gestionPedidosAdminController.updateCostoEnvio
);

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

// ✅ NUEVO: Rechazar y REPONER stock (cuando finanzas rechaza surtimiento)
// Stock ya fue descuento en generación de remisión, así que se debe reponer
router.post(
  "/pedidos/:id/rechazar-finanzas-reponer-stock",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_finanzas']),
  rejectController.rechazarRemisionYReponerStock
);

// Marcar/desmarcar pedido como prioritario (finanzas)
router.post(
  "/pedidos/:id/prioritario",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_finanzas']),
  pedidosAdminController.setPrioritario
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

// Generar PDF de verificación PRE-CONFIRMACIÓN para inventarios
// Shows 3 tables: Marcados | Con Stock No Marcados | Bajo Pedido
// For warehouse verification before system confirmation
router.get(
  "/pedidos/:id/pdf-verificacion",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'inventarios', 'jefe_almacen']),
  heavyOperationLimiter,
  pdfController.generarPDFVerificacion
);

// Generar factura PDF para pedido (admin)
// Available for admin and finanzas roles
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
 * Detalle de pedido
 */
router.get(
  "/pedidos/:id/detalle",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'inventarios', 'finanzas', 'gerente_finanzas']),
  pedidosAdminController.getPedidoDetalle
);

/**
 * Evidencia de Entrega / Remisión Firmada
 */
router.post(
  "/pedidos/:id/evidencia",
  authenticate,
  authorizeAdmin,
  uploadEvidenciaEntrega.single("evidencia"),
  evidenciasController.subirEvidenciaEntrega
);

router.get(
  "/pedidos/:id/remision",
  authenticate,
  authorizeAdmin,
  remisionesPedidosController.obtenerRemisionPedido
);

/**
 * Recalcular estado de pedidos
 */
router.post(
  "/pedidos/:id/recalcular-estado",
  authenticate,
  authorizeRole(['super_admin', 'admin']),
  async (req, res) => {
    try {
      const { tenant_id } = req.tenant;
      const pedidoId = parseInt(req.params.id);

      if (isNaN(pedidoId)) {
        return res.status(400).json({
          success: false,
          message: "ID de pedido inválido"
        });
      }

      const result = await pedidoEstadoSincronizadorService.recalcularUnPedido(
        pedidoId,
        tenant_id
      );

      res.json({
        success: true,
        cambio: result.cambio_realizado,
        estadoAnterior: result.estado_anterior,
        estadoNuevo: result.nuevo_estado,
        razon: result.razon
      });
    } catch (error) {
      logger.error('[Admin Routes] Error recalculando estado de pedido', {
        pedidoId: req.params.id,
        error: error.message
      });
      res.status(500).json({
        success: false,
        message: "Error recalculando estado del pedido",
        error: error.message
      });
    }
  }
);

/**
 * Historial de cambios de estados
 */
router.get(
  "/pedidos/:id/historial-cambios",
  authenticate,
  authorizeRole(['super_admin', 'admin']),
  async (req, res) => {
    try {
      const { tenant_id } = req.tenant;
      const pedidoId = parseInt(req.params.id);
      const limit = Math.min(parseInt(req.query.limit) || 50, 500);

      if (isNaN(pedidoId)) {
        return res.status(400).json({
          success: false,
          message: "ID de pedido inválido"
        });
      }

      const historial = await pedidoEstadoSincronizadorService.obtenerHistorialCambios(
        pedidoId,
        tenant_id,
        limit
      );

      res.json({
        success: true,
        data: historial,
        total: historial.length
      });
    } catch (error) {
      logger.error('[Admin Routes] Error obteniendo historial de cambios', {
        pedidoId: req.params.id,
        error: error.message
      });
      res.status(500).json({
        success: false,
        message: "Error obteniendo historial",
        error: error.message
      });
    }
  }
);

/**
 * Toggle priority
 */
const pedidosController = require("../../controllers/pedidosController");
router.post(
  "/pedidos/:id/simulate-priority",
  authenticate,
  authorizeAdmin,
  pedidosController.simulatePriorityImpact
);

router.post(
  "/pedidos/:id/toggle-priority",
  authenticate,
  authorizeAdmin,
  pedidosController.togglePrioridad
);

module.exports = router;
