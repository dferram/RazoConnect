const express = require("express");
const router = express.Router();
const clienteAuthController = require("../controllers/auth/clienteAuthController");
const agenteAuthController = require("../controllers/auth/agenteAuthController");
const adminAuthController = require("../controllers/auth/adminAuthController");
const profileController = require("../controllers/auth/profileController");
const agentesController = require("../controllers/agentesController");
const { authenticate, authorize } = require("../middlewares/authMiddleware");
const passport = require("passport");

// ============================================================================
// RATE LIMITERS DE SEGURIDAD
// ============================================================================
// Protección contra ataques de fuerza bruta en endpoints de autenticación
const { 
  authLimiter, 
  registerLimiter, 
  passwordResetLimiter 
} = require("../middlewares/rateLimiter");

/**
 * @route   POST /api/registro/cliente
 * @desc    Registrar un nuevo cliente
 * @access  Public
 * @body    { Nombre, Apellido, Email, Password, Telefono }
 * @security Rate limited: 3 registros por hora por IP
 */
router.post("/registro/cliente", registerLimiter, clienteAuthController.registroCliente);

/**
 * @route   POST /api/registro/agente
 * @desc    Registrar un nuevo agente de ventas
 * @access  Public
 * @body    { Nombre, Apellido, Email, Password, CodigoAgente }
 * @security Rate limited: 3 registros por hora por IP
 */
router.post("/registro/agente", registerLimiter, agenteAuthController.registroAgente);

/**
 * @route   POST /api/login
 * @desc    Iniciar sesión (cliente o agente)
 * @access  Public
 * @body    { Email, Password }
 * @security Rate limited: 5 intentos cada 15 minutos por IP
 */
router.post("/login", authLimiter, clienteAuthController.login);

/**
 * @route   GET /api/clientes/verify
 * @desc    Verificar token de cliente
 * @access  Private (requiere token de cliente)
 */
router.get("/clientes/verify", authenticate, clienteAuthController.verifyCliente);

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Solicitar recuperación de contraseña
 * @access  Public
 * @security Rate limited: 3 intentos por hora por IP
 */
router.post("/auth/forgot-password", passwordResetLimiter, clienteAuthController.forgotPassword);

/**
 * @route   POST /api/auth/reset-password
 * @desc    Restablecer contraseña con token
 * @access  Public
 * @security Rate limited: 3 intentos por hora por IP
 */
router.post("/auth/reset-password", passwordResetLimiter, clienteAuthController.resetPassword);

/**
 * @route   GET /api/auth/me
 * @desc    Obtener información del usuario actual (admin, agente o cliente)
 * @access  Private (requiere token válido)
 * @returns { nombre, email, rol, iniciales, tipo }
 */
router.get("/auth/me", authenticate, profileController.getCurrentUser);

router.get(
  "/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    prompt: "select_account",
  })
);

router.get(
  "/auth/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: "/login.html",
  }),
  profileController.googleCallback
);

/**
 * @route   POST /api/auth/registro-admin
 * @desc    Registrar un nuevo administrador (protegido por SUPER_ADMIN_KEY)
 * @access  Public (requiere adminKey en el body)
 * @body    { Nombre, Apellido, Email, Password, Rol?, adminKey }
 * @security Rate limited: 3 intentos por hora por IP
 */
router.post("/auth/registro-admin", registerLimiter, adminAuthController.registroAdmin);

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

router.put(
  "/agente/pedidos/:id/estatus",
  authenticate,
  authorize(["agente"]),
  agentesController.actualizarEstatusPedidoAgente
);

router.post(
  "/agente/pedidos/:id/solicitar-estatus",
  authenticate,
  authorize(["agente"]),
  agentesController.solicitarCambioEstatusPedidoAgente
);

router.post(
  "/agentes/pedidos/:id/solicitar-confirmacion",
  authenticate,
  authorize(["agente"]),
  agentesController.solicitarConfirmacionPedidoAgente
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

router.get(
  "/agente/cxc",
  authenticate,
  authorize(["agente"]),
  agentesController.getCxCAgente
);

module.exports = router;
