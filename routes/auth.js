const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const agentesController = require("../controllers/agentesController");
const { authenticate, authorize } = require("../middlewares/authMiddleware");

/**
 * @route   POST /api/registro/cliente
 * @desc    Registrar un nuevo cliente
 * @access  Public
 * @body    { Nombre, Apellido, Email, Password, Telefono }
 */
router.post("/registro/cliente", authController.registroCliente);

/**
 * @route   POST /api/registro/agente
 * @desc    Registrar un nuevo agente de ventas
 * @access  Public
 * @body    { Nombre, Apellido, Email, Password, CodigoAgente }
 */
router.post("/registro/agente", authController.registroAgente);

/**
 * @route   POST /api/login
 * @desc    Iniciar sesión (cliente o agente)
 * @access  Public
 * @body    { Email, Password }
 */
router.post("/login", authController.login);

/**
 * @route   GET /api/clientes/verify
 * @desc    Verificar token de cliente
 * @access  Private (requiere token de cliente)
 */
router.get("/clientes/verify", authenticate, authController.verifyCliente);

/**
 * @route   POST /api/clientes/refresh-token
 * @desc    Renovar token de cliente
 * @access  Private (requiere token de cliente)
 */
router.post(
  "/clientes/refresh-token",
  authenticate,
  authController.refreshClienteToken
);

router.post("/auth/forgot-password", authController.forgotPassword);
router.post("/auth/reset-password", authController.resetPassword);

/**
 * @route   GET /api/auth/me
 * @desc    Obtener información del usuario actual (admin, agente o cliente)
 * @access  Private (requiere token válido)
 * @returns { nombre, email, rol, iniciales, tipo }
 */
router.get("/auth/me", authenticate, authController.getCurrentUser);

/**
 * @route   POST /api/auth/registro-admin
 * @desc    Registrar un nuevo administrador (protegido por SUPER_ADMIN_KEY)
 * @access  Public (requiere adminKey en el body)
 * @body    { Nombre, Apellido, Email, Password, Rol?, adminKey }
 */
router.post("/auth/registro-admin", authController.registroAdmin);

// Rutas privadas para agentes
router.post(
  "/agentes/vincular-cliente",
  authenticate,
  authorize(["agente"]),
  agentesController.vincularCliente
);

router.get(
  "/agentes/mis-clientes",
  authenticate,
  authorize(["agente"]),
  agentesController.obtenerClientesDelAgente
);

router.get(
  "/agente/clientes",
  authenticate,
  authorize(["agente"]),
  agentesController.obtenerClientesDelAgente
);

router.get(
  "/agentes/clientes-disponibles",
  authenticate,
  authorize(["agente"]),
  agentesController.obtenerClientesDisponibles
);

router.get(
  "/agente/pedidos",
  authenticate,
  authorize(["agente"]),
  agentesController.obtenerPedidosDelAgente
);

router.get(
  "/agente/pedidos/:id",
  authenticate,
  authorize(["agente"]),
  agentesController.obtenerPedidoDetalleAgente
);

router.get(
  "/agente/dashboard-stats",
  authenticate,
  authorize(["agente"]),
  agentesController.obtenerDashboardStats
);

router.get(
  "/agente/comisiones",
  authenticate,
  authorize(["agente"]),
  agentesController.obtenerComisionesDelAgente
);

module.exports = router;
