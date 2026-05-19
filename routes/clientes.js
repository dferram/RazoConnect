const express = require("express");
const router = express.Router();

const {
  obtenerNotificacionesCliente,
  obtenerConteoNotificacionesNoLeidas,
} = require("../controllers/clientes/notificacionesController");
const {
  checkAuthCredit,
  obtenerPerfilCredito,
  obtenerMovimientosCredito,
  registrarPagoCliente,
  obtenerMovimientosPendientes,
  enviarSolicitudCredito,
  obtenerEstadoCuentaMensual,
  obtenerMesesDisponibles,
} = require("../controllers/clientes/creditoController");
const {
  actualizarPerfil,
  cambiarPassword,
  asignarEstado,
} = require("../controllers/clientes/perfilController");
const { authenticate } = require("../middlewares/authMiddleware");
const verifyTenantContext = require("../middlewares/verifyTenantContext");
const { generarPDFEstadoCuenta } = require("../controllers/pdf/pdfEstadoCuentaController");
const { heavyOperationLimiter } = require("../middlewares/rateLimiter");
const estadoCuentaController = require("../controllers/estadoCuentaController");

/**
 * @swagger
 * /api/cliente/notificaciones:
 *   get:
 *     summary: Obtener notificaciones del cliente
 *     tags: [Cliente - Notificaciones]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notificaciones obtenidas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 notificaciones:
 *                   type: array
 *                   items:
 *                     type: object
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
router.get("/notificaciones", authenticate, verifyTenantContext, obtenerNotificacionesCliente);
/**
 * @swagger
 * /api/cliente/notificaciones/count:
 *   get:
 *     summary: Obtener conteo de notificaciones no leídas
 *     tags: [Cliente - Notificaciones]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Conteo obtenido
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count:
 *                   type: integer
 *                   example: 5
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
router.get(
  "/notificaciones/count",
  authenticate,
  verifyTenantContext,
  obtenerConteoNotificacionesNoLeidas
);

/**
 * @swagger
 * /api/cliente/perfil:
 *   put:
 *     summary: Actualizar perfil del cliente
 *     tags: [Cliente - Perfil]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               Nombre:
 *                 type: string
 *                 example: Juan
 *               Apellido:
 *                 type: string
 *                 example: Pérez
 *               Telefono:
 *                 type: string
 *                 example: "5512345678"
 *     responses:
 *       200:
 *         description: Perfil actualizado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
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
router.put("/perfil", authenticate, verifyTenantContext, actualizarPerfil);
/**
 * @swagger
 * /api/cliente/cambiar-password:
 *   put:
 *     summary: Cambiar contraseña del cliente
 *     tags: [Cliente - Perfil]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 format: password
 *                 example: OldPass123!
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 example: NewPass123!
 *     responses:
 *       200:
 *         description: Contraseña actualizada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Contraseña actual incorrecta
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
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
router.put("/cambiar-password", authenticate, verifyTenantContext, cambiarPassword);

/**
 * @swagger
 * /api/cliente/check-auth-credit:
 *   get:
 *     summary: Verificar si el cliente tiene crédito autorizado
 *     tags: [Cliente - Crédito]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Estado de crédito obtenido
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 hasCredit:
 *                   type: boolean
 *                   example: true
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
router.get("/check-auth-credit", authenticate, verifyTenantContext, checkAuthCredit);
/**
 * @swagger
 * /api/cliente/perfil-credito:
 *   get:
 *     summary: Obtener perfil de crédito del cliente
 *     tags: [Cliente - Crédito]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil de crédito obtenido
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 limiteCredito:
 *                   type: number
 *                   example: 50000
 *                 saldoActual:
 *                   type: number
 *                   example: 15000
 *                 disponible:
 *                   type: number
 *                   example: 35000
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
router.get("/perfil-credito", authenticate, verifyTenantContext, obtenerPerfilCredito);
/**
 * @swagger
 * /api/cliente/credito:
 *   get:
 *     summary: Obtener movimientos de crédito del cliente
 *     tags: [Cliente - Crédito]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Movimientos obtenidos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 movimientos:
 *                   type: array
 *                   items:
 *                     type: object
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
router.get("/credito", authenticate, verifyTenantContext, obtenerMovimientosCredito);
/**
 * @swagger
 * /api/cliente/credito/pendientes:
 *   get:
 *     summary: Obtener movimientos de crédito pendientes de pago
 *     tags: [Cliente - Crédito]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Movimientos pendientes obtenidos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 pendientes:
 *                   type: array
 *                   items:
 *                     type: object
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
router.get("/credito/pendientes", authenticate, verifyTenantContext, obtenerMovimientosPendientes);
/**
 * @swagger
 * /api/cliente/estado-cuenta/{mes}/{anio}:
 *   get:
 *     summary: Obtener estado de cuenta mensual
 *     tags: [Cliente - Crédito]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: mes
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 12
 *         example: 3
 *       - in: path
 *         name: anio
 *         required: true
 *         schema:
 *           type: integer
 *         example: 2024
 *     responses:
 *       200:
 *         description: Estado de cuenta obtenido
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 movimientos:
 *                   type: array
 *                   items:
 *                     type: object
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
router.get("/estado-cuenta/meses-disponibles", authenticate, verifyTenantContext, obtenerMesesDisponibles);
router.get("/estado-cuenta/:mes/:anio", authenticate, verifyTenantContext, obtenerEstadoCuentaMensual);
/**
 * @swagger
 * /api/cliente/estado-cuenta/{mes}/{anio}/pdf:
 *   get:
 *     summary: Generar PDF del estado de cuenta mensual
 *     tags: [Cliente - Crédito]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: mes
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 12
 *         example: 3
 *       - in: path
 *         name: anio
 *         required: true
 *         schema:
 *           type: integer
 *         example: 2024
 *     responses:
 *       200:
 *         description: PDF generado exitosamente
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
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
router.get("/estado-cuenta/:mes/:anio/pdf", authenticate, verifyTenantContext, heavyOperationLimiter, generarPDFEstadoCuenta);
/**
 * @swagger
 * /api/cliente/pagar-credito:
 *   post:
 *     summary: Registrar pago de crédito
 *     tags: [Cliente - Crédito]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [monto]
 *             properties:
 *               monto:
 *                 type: number
 *                 example: 5000
 *               referencia:
 *                 type: string
 *                 example: REF123456
 *     responses:
 *       201:
 *         description: Pago registrado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Datos inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
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
router.post("/pagar-credito", authenticate, verifyTenantContext, registrarPagoCliente);
/**
 * @swagger
 * /api/cliente/solicitar-credito:
 *   post:
 *     summary: Enviar solicitud de crédito
 *     tags: [Cliente - Crédito]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [montoSolicitado]
 *             properties:
 *               montoSolicitado:
 *                 type: number
 *                 example: 50000
 *               justificacion:
 *                 type: string
 *                 example: Ampliación de negocio
 *     responses:
 *       201:
 *         description: Solicitud enviada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Datos inválidos o ya tiene solicitud pendiente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
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
router.post("/solicitar-credito", authenticate, verifyTenantContext, enviarSolicitudCredito);

/**
 * @swagger
 * /api/cliente/asignar-estado:
 *   post:
 *     summary: Asignar estado al cliente (modal requerido)
 *     tags: [Cliente - Perfil]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               estadoId:
 *                 type: integer
 *                 description: ID del estado a asignar
 *     responses:
 *       200:
 *         description: Estado asignado exitosamente
 *       400:
 *         description: Datos inválidos
 *       500:
 *         description: Error del servidor
 */
router.post("/asignar-estado", authenticate, verifyTenantContext, asignarEstado);

/**
 * @swagger
 * /api/cliente/mi-estado-cuenta:
 *   get:
 *     summary: Obtener estado de cuenta mensual tipo banco (nuevo formato)
 *     tags: [Cliente - Crédito]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: mes
 *         schema:
 *           type: integer
 *         description: Mes (1-12)
 *       - in: query
 *         name: anio
 *         schema:
 *           type: integer
 *         description: Año (ej. 2026)
 *     responses:
 *       200:
 *         description: Estado de cuenta obtenido exitosamente
 *       401:
 *         description: No autenticado
 *       500:
 *         description: Error del servidor
 */
router.get("/mi-estado-cuenta", authenticate, verifyTenantContext, estadoCuentaController.getEstadoCuentaCliente);

/**
 * @swagger
 * /api/cliente/mi-estado-cuenta/pdf:
 *   get:
 *     summary: Generar PDF del estado de cuenta tipo banco
 *     tags: [Cliente - Crédito]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: mes
 *         schema:
 *           type: integer
 *         description: Mes (1-12)
 *       - in: query
 *         name: anio
 *         schema:
 *           type: integer
 *         description: Año (ej. 2026)
 *     responses:
 *       200:
 *         description: PDF generado exitosamente
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         description: No autenticado
 *       500:
 *         description: Error del servidor
 */
router.get("/mi-estado-cuenta/pdf", authenticate, verifyTenantContext, heavyOperationLimiter, estadoCuentaController.generarPDFEstadoCuentaCliente);

module.exports = router;
