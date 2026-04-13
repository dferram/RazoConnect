const express = require("express");
const router = express.Router();
const cxcController = require("../../controllers/cxcController");
const cxcAdminController = require("../../controllers/cxcAdminController");
const cxcDetalladoController = require("../../controllers/cxcDetalladoController");
const cxcEnhancedController = require("../../controllers/cxcEnhancedController");
const cxpController = require("../../controllers/cxpController");
const cxpAdminController = require("../../controllers/cxpAdminController");
const comisionesAdminController = require("../../controllers/comisionesAdminController");
const pagosController = require("../../controllers/admin/pagosController");
const { authenticate, authorizeAdmin, authorizeRole, authorizeAdminOrAgente } = require("../../middlewares/roleMiddleware");
const { abonoSchema } = require("../../middlewares/validators/schemas");
const validate = require("../../middlewares/validate");
const uploadComprobante = require("../../middlewares/uploadComprobante");

/**
 * Gestión de comisiones
 */
router.get(
  "/comisiones",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_comercial', 'supervisor_ventas', 'ejecutivo_cobranza']),
  comisionesAdminController.getAllComisiones
);

router.put(
  "/comisiones/:id/pagar",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_comercial', 'gerente_finanzas']),
  comisionesAdminController.pagarComision
);

/**
 * Cuentas por Pagar (CxP)
 */
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
  cxpAdminController.getCuentasPorPagar
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

router.get(
  "/cxp/pdf",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_finanzas', 'contador', 'compras', 'auditor_interno']),
  cxpController.generarPDFCxP
);

/**
 * Estado de Cuenta CxP (Proveedores)
 */
router.get(
  "/estado-cuenta/resumen",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_finanzas', 'contador', 'compras', 'auditor_interno']),
  cxpAdminController.getResumenEstadoCuentaProveedores
);

router.get(
  "/estado-cuenta/proveedores/:id/movimientos",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_finanzas', 'contador', 'compras', 'auditor_interno']),
  cxpAdminController.getEstadoCuentaProveedorMovimientos
);

router.get(
  "/estado-cuenta/cxp/:id/productos",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_finanzas', 'contador', 'compras', 'auditor_interno']),
  cxpAdminController.getProductosRecibidosPorCxp
);

/**
 * Cuentas por Cobrar (CxC)
 */
router.get(
  "/cxc-summary",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_finanzas', 'ejecutivo_cobranza', 'contador', 'auditor_interno']),
  cxcAdminController.getCxcSummary
);

// Configuración de número de factura
router.get(
  "/cxc/config-factura",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_finanzas', 'contador']),
  cxcAdminController.obtenerConfigFactura
);

router.post(
  "/cxc/config-factura",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_finanzas', 'contador']),
  cxcAdminController.actualizarConfigFactura
);

router.post(
  "/cxc/validar-factura",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_finanzas', 'contador']),
  cxcAdminController.validarNumeroFactura
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

/**
 * PAGOS DE CLIENTES (tabla pagos_clientes)
 */

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
  "/cxc/pdf",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_finanzas', 'ejecutivo_cobranza', 'contador', 'auditor_interno']),
  cxcController.generarPDFCxC
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

router.post(
  "/registrar-abono",
  authenticate,
  authorizeAdminOrAgente,
  abonoSchema,
  validate,
  cxcAdminController.registrarAbonoCxC
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

module.exports = router;
