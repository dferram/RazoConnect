const express = require("express");
const router = express.Router();
const clienteAuthController = require("../controllers/auth/clienteAuthController");
const agenteAuthController = require("../controllers/auth/agenteAuthController");
const adminAuthController = require("../controllers/auth/adminAuthController");
const tokenController = require("../controllers/auth/tokenController");
const profileController = require("../controllers/auth/profileController");
const agentesController = require("../controllers/agentesController");
const { authenticate, authorize } = require("../middlewares/authMiddleware");
const passport = require("passport");
const { registroClienteSchema, loginAgenteSchema, loginClienteSchema } = require("../middlewares/validators/schemas");
const validate = require("../middlewares/validate");

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
 * @swagger
 * /api/registro/cliente:
 *   post:
 *     summary: Registrar un nuevo cliente
 *     tags: [Autenticación]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [Nombre, Apellido, Email, Password, Telefono]
 *             properties:
 *               Nombre:
 *                 type: string
 *                 example: Juan
 *               Apellido:
 *                 type: string
 *                 example: Pérez
 *               Email:
 *                 type: string
 *                 format: email
 *                 example: juan@ejemplo.com
 *               Password:
 *                 type: string
 *                 format: password
 *                 example: Password123!
 *               Telefono:
 *                 type: string
 *                 example: "5512345678"
 *     responses:
 *       201:
 *         description: Cliente registrado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Datos inválidos o email ya registrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/registro/cliente", registerLimiter, registroClienteSchema, validate, clienteAuthController.registroCliente);

/**
 * @swagger
 * /api/registro/agente:
 *   post:
 *     summary: Registrar un nuevo agente de ventas
 *     tags: [Autenticación]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [Nombre, Apellido, Email, Password, CodigoAgente]
 *             properties:
 *               Nombre:
 *                 type: string
 *                 example: María
 *               Apellido:
 *                 type: string
 *                 example: García
 *               Email:
 *                 type: string
 *                 format: email
 *                 example: maria@ejemplo.com
 *               Password:
 *                 type: string
 *                 format: password
 *                 example: Password123!
 *               CodigoAgente:
 *                 type: string
 *                 example: AG-001
 *     responses:
 *       201:
 *         description: Agente registrado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Datos inválidos o código de agente inválido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/registro/agente", registerLimiter, agenteAuthController.registroAgente);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login de cliente
 *     tags: [Autenticación]
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
 *                 example: cliente@ejemplo.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: "MiPassword123"
 *     responses:
 *       200:
 *         description: Login exitoso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 token:
 *                   type: string
 *                 refreshToken:
 *                   type: string
 *       401:
 *         description: Credenciales inválidas
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/login", authLimiter, loginClienteSchema, validate, clienteAuthController.login);

/**
 * @swagger
 * /api/clientes/verify:
 *   get:
 *     summary: Verificar token de cliente
 *     tags: [Autenticación]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Token válido
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 usuario:
 *                   type: object
 *       401:
 *         description: Token inválido o expirado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/clientes/verify", authenticate, clienteAuthController.verifyCliente);

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Solicitar recuperación de contraseña
 *     tags: [Autenticación]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: usuario@ejemplo.com
 *     responses:
 *       200:
 *         description: Email de recuperación enviado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Email no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/auth/forgot-password", passwordResetLimiter, clienteAuthController.forgotPassword);

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Restablecer contraseña con token
 *     tags: [Autenticación]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, newPassword]
 *             properties:
 *               token:
 *                 type: string
 *                 example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 example: NuevaPassword123!
 *     responses:
 *       200:
 *         description: Contraseña restablecida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Token inválido o expirado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/auth/reset-password", passwordResetLimiter, clienteAuthController.resetPassword);

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Renovar Access Token usando Refresh Token
 *     tags: [Autenticación]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *     responses:
 *       200:
 *         description: Access token renovado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 accessToken:
 *                   type: string
 *       401:
 *         description: Refresh token inválido o expirado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/auth/refresh", tokenController.refreshAccessToken);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Cerrar sesión (invalidar Refresh Token)
 *     tags: [Autenticación]
 *     security: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: integer
 *                 example: 123
 *               rol:
 *                 type: string
 *                 enum: [cliente, agente, admin, super_admin]
 *                 example: cliente
 *     responses:
 *       200:
 *         description: Sesión cerrada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/auth/logout", tokenController.logout);

/**
 * @swagger
 * /api/auth/session-status:
 *   get:
 *     summary: Verificar si existe una sesión activa
 *     tags: [Autenticación]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 123
 *       - in: query
 *         name: rol
 *         required: true
 *         schema:
 *           type: string
 *           enum: [cliente, agente, admin, super_admin]
 *         example: cliente
 *     responses:
 *       200:
 *         description: Estado de sesión obtenido
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 hasActiveSession:
 *                   type: boolean
 *                   example: true
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/auth/session-status", tokenController.checkSessionStatus);

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Obtener información del usuario actual
 *     tags: [Autenticación]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Información del usuario obtenida
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 nombre:
 *                   type: string
 *                   example: Juan Pérez
 *                 email:
 *                   type: string
 *                   example: juan@ejemplo.com
 *                 rol:
 *                   type: string
 *                   example: cliente
 *                 iniciales:
 *                   type: string
 *                   example: JP
 *                 tipo:
 *                   type: string
 *                   example: cliente
 *       401:
 *         description: No autenticado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
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
 * @swagger
 * /api/auth/registro-admin:
 *   post:
 *     summary: Registrar un nuevo administrador
 *     description: Requiere SUPER_ADMIN_KEY en el body para autorización
 *     tags: [Autenticación]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [Nombre, Apellido, Email, Password, adminKey]
 *             properties:
 *               Nombre:
 *                 type: string
 *                 example: Carlos
 *               Apellido:
 *                 type: string
 *                 example: Admin
 *               Email:
 *                 type: string
 *                 format: email
 *                 example: admin@ejemplo.com
 *               Password:
 *                 type: string
 *                 format: password
 *                 example: AdminPass123!
 *               Rol:
 *                 type: string
 *                 enum: [admin, superadmin]
 *                 example: admin
 *               adminKey:
 *                 type: string
 *                 example: super-secret-key
 *     responses:
 *       201:
 *         description: Administrador registrado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Datos inválidos o adminKey incorrecta
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/auth/registro-admin", registerLimiter, adminAuthController.registroAdmin);

/**
 * @swagger
 * /api/agentes/vincular-cliente:
 *   post:
 *     summary: Vincular un cliente a un agente
 *     tags: [Autenticación]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [clienteId]
 *             properties:
 *               clienteId:
 *                 type: integer
 *                 example: 45
 *     responses:
 *       200:
 *         description: Cliente vinculado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         description: No autenticado o no es agente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  "/agentes/vincular-cliente",
  authenticate,
  authorize(["agente"]),
  agentesController.vincularCliente
);

/**
 * @swagger
 * /api/agentes/mis-clientes:
 *   get:
 *     summary: Obtener lista de clientes del agente
 *     tags: [Autenticación]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de clientes obtenida
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 clientes:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: No autenticado o no es agente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
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

/**
 * @swagger
 * /api/agentes/clientes-disponibles:
 *   get:
 *     summary: Obtener clientes disponibles para vincular
 *     tags: [Autenticación]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de clientes disponibles
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 clientes:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: No autenticado o no es agente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  "/agentes/clientes-disponibles",
  authenticate,
  authorize(["agente"]),
  agentesController.obtenerClientesDisponibles
);

/**
 * @swagger
 * /api/agente/pedidos:
 *   get:
 *     summary: Obtener pedidos del agente
 *     tags: [Autenticación]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de pedidos del agente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 pedidos:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: No autenticado o no es agente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  "/agente/pedidos",
  authenticate,
  authorize(["agente"]),
  agentesController.obtenerPedidosDelAgente
);

/**
 * @swagger
 * /api/agente/pedidos/{id}:
 *   get:
 *     summary: Obtener detalle de un pedido específico
 *     tags: [Autenticación]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del pedido
 *         example: 123
 *     responses:
 *       200:
 *         description: Detalle del pedido obtenido
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 pedido:
 *                   type: object
 *       401:
 *         description: No autenticado o no es agente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Pedido no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  "/agente/pedidos/:id",
  authenticate,
  authorize(["agente"]),
  agentesController.obtenerPedidoDetalleAgente
);

/**
 * @swagger
 * /api/agente/pedidos/{id}/estatus:
 *   put:
 *     summary: Actualizar estatus de un pedido
 *     tags: [Autenticación]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del pedido
 *         example: 123
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               estatus:
 *                 type: string
 *                 example: Entregado
 *     responses:
 *       200:
 *         description: Estatus actualizado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         description: No autenticado o no es agente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Pedido no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
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

/**
 * @swagger
 * /api/agente/dashboard-stats:
 *   get:
 *     summary: Obtener estadísticas del dashboard del agente
 *     tags: [Autenticación]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Estadísticas obtenidas exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 stats:
 *                   type: object
 *       401:
 *         description: No autenticado o no es agente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
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

/**
 * @swagger
 * /api/auth/mis-permisos:
 *   get:
 *     summary: Obtener permisos del usuario autenticado
 *     description: |
 *       Retorna el rol y permisos del usuario para que el frontend sepa qué secciones mostrar.
 *       
 *       **Sistema de Manejo de Errores:**
 *       - Errores 401/403/429/500/503 redirigen automáticamente a páginas HTML personalizadas
 *       - El frontend intercepta estos errores y limpia la sesión cuando es necesario
 *     tags: [Autenticación]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Permisos obtenidos exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 rol:
 *                   type: string
 *                   example: gerente_finanzas
 *                 permisos:
 *                   type: object
 *                   description: Mapa de módulos y sus acciones permitidas
 *                   example:
 *                     finanzas: ["ver", "editar", "aprobar"]
 *                     credito: ["ver", "aprobar"]
 *                     reportes: ["ver"]
 *       401:
 *         description: |
 *           **No autenticado** - Token inválido o expirado
 *           
 *           El frontend automáticamente:
 *           - Limpia localStorage (admin, agente, cliente, permissions)
 *           - Redirige a `/401.html`
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Token no proporcionado
 *       500:
 *         description: |
 *           **Error del servidor** - Error interno no manejado
 *           
 *           El frontend automáticamente redirige a `/500.html`
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Error al obtener permisos del usuario
 */
router.get(
  "/auth/mis-permisos",
  authenticate,
  async (req, res) => {
    try {
      const permisosService = require('../services/permisosService');
      const permisos = await permisosService.getPermisosRol(req.user.rol);
      
      res.json({
        success: true,
        rol: req.user.rol,
        permisos: permisos
      });
    } catch (error) {
      console.error('Error obteniendo permisos:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener permisos del usuario'
      });
    }
  }
);

module.exports = router;
