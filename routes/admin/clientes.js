const express = require("express");
const router = express.Router();
const clientesAdminController = require("../../controllers/clientesAdminController");
const proveedoresAdminController = require("../../controllers/proveedoresAdminController");
const desvincularClienteController = require("../../controllers/desvincularClienteController");
const administradoresController = require("../../controllers/administradoresController");
const agentesAdminController = require("../../controllers/agentesAdminController");
const reglasEmpaqueController = require("../../controllers/reglasEmpaqueController");
const solicitudesProveedorController = require("../../controllers/solicitudesProveedorController");
const { authenticate, authorizeAdmin, authorizeRole } = require("../../middlewares/roleMiddleware");
const { crearAgenteSchema } = require("../../middlewares/validators/schemas");
const validate = require("../../middlewares/validate");

/**
 * Gestión de clientes
 */
router.get(
  "/clientes",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_comercial', 'supervisor_ventas', 'ejecutivo_cobranza', 'encargado_credito', 'soporte_cliente', 'auditor_interno']),
  clientesAdminController.getAllClientes
);

router.get(
  "/clientes/:id",
  authenticate,
  authorizeAdmin,
  clientesAdminController.getClienteDetalle
);

router.put(
  "/clientes/:id/estado",
  authenticate,
  authorizeAdmin,
  clientesAdminController.actualizarEstadoCliente
);

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
  clientesAdminController.resetPassword || require("../../controllers/auth/adminAuthController").adminResetPassword
);

router.get(
  "/clientes/:id/credito",
  authenticate,
  authorizeAdmin,
  clientesAdminController.getClienteCreditoInfo
);

router.put(
  "/clientes/:id/credito",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'finanzas', 'gerente_finanzas', 'encargado_credito']),
  clientesAdminController.actualizarCreditoCliente
);

/**
 * Gestión de administradores
 */
router.get(
  "/administradores",
  authenticate,
  authorizeAdmin,
  administradoresController.getAllAdministradores
);

/**
 * Gestión de agentes
 */
router.get(
  "/agentes",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'gerente_comercial', 'supervisor_ventas']),
  agentesAdminController.getAllAgentes
);

router.post(
  "/agentes",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'gerente_comercial']),
  crearAgenteSchema,
  validate,
  agentesAdminController.crearAgente
);

router.get(
  "/agentes/:id",
  authenticate,
  authorizeAdmin,
  agentesAdminController.getAgenteDetalle
);

router.get(
  "/agentes/:id/clientes",
  authenticate,
  authorizeAdmin,
  agentesAdminController.getAgenteClientes
);

router.put(
  "/agentes/:id",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'gerente_comercial']),
  agentesAdminController.actualizarAgente
);

router.put(
  "/agentes/:id/desactivar",
  authenticate,
  authorizeAdmin,
  agentesAdminController.desactivarAgente
);

/**
 * Gestión de proveedores
 */
router.get(
  "/proveedores",
  authenticate,
  authorizeAdmin,
  proveedoresAdminController.getAllProveedores
);

router.get(
  "/proveedores/:id",
  authenticate,
  authorizeAdmin,
  proveedoresAdminController.getProveedorById
);

router.post(
  "/proveedores",
  authenticate,
  authorizeAdmin,
  proveedoresAdminController.crearProveedor
);

router.put(
  "/proveedores/:id",
  authenticate,
  authorizeAdmin,
  proveedoresAdminController.actualizarProveedor
);

router.get(
  "/proveedores/:id/solicitudes-pendientes",
  authenticate,
  authorizeAdmin,
  solicitudesProveedorController.getSolicitudesPendientesProveedor
);

router.get(
  "/proveedores/:id/reglas",
  authenticate,
  authorizeAdmin,
  reglasEmpaqueController.getReglasEmpaqueProveedor
);

router.get(
  "/proveedores/:id/reglas-multiples",
  authenticate,
  authorizeAdmin,
  reglasEmpaqueController.getReglasEmpaqueProveedorMultiples
);

router.post(
  "/save-reglas-empaque",
  authenticate,
  authorizeAdmin,
  reglasEmpaqueController.saveReglasEmpaqueMultiples
);

router.post(
  "/proveedores/reglas",
  authenticate,
  authorizeAdmin,
  reglasEmpaqueController.saveReglaEmpaque
);

router.put(
  "/proveedores/:id/reglas",
  authenticate,
  authorizeAdmin,
  reglasEmpaqueController.saveReglaEmpaque
);

module.exports = router;
