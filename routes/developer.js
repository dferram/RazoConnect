const express = require('express');
const router = express.Router();
const developerController = require('../controllers/developerController');
const onboardingController = require('../controllers/onboardingController');
const developerGuard = require('../middlewares/developerGuard');
const { authLimiter } = require('../middlewares/rateLimiter');

/**
 * @swagger
 * /developer/login:
 *   get:
 *     summary: Página de login del developer
 *     tags: [Developer]
 *     x-internal: true
 *     security: []
 *     responses:
 *       200:
 *         description: Página de login
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 */
router.get('/login', developerController.loginPage);
/**
 * @swagger
 * /developer/login:
 *   post:
 *     summary: Autenticar developer
 *     tags: [Developer]
 *     x-internal: true
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username:
 *                 type: string
 *                 example: developer
 *               password:
 *                 type: string
 *                 format: password
 *                 example: devpass123
 *     responses:
 *       200:
 *         description: Login exitoso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         description: Credenciales inválidas
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
router.post('/login', authLimiter, developerController.login);
/**
 * @swagger
 * /developer/logout:
 *   post:
 *     summary: Cerrar sesión de developer
 *     tags: [Developer]
 *     x-internal: true
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout exitoso
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
 */
router.post('/logout', developerGuard, developerController.logout);

/**
 * @swagger
 * /developer/dashboard:
 *   get:
 *     summary: Dashboard del developer
 *     tags: [Developer]
 *     x-internal: true
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard obtenido
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 *       401:
 *         description: No autenticado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/dashboard', developerGuard, developerController.dashboardPage);

/**
 * @swagger
 * /developer/tenants:
 *   get:
 *     summary: Obtener lista de tenants
 *     tags: [Developer]
 *     x-internal: true
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Tenants obtenidos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 tenants:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: No autenticado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/tenants', developerGuard, developerController.getTenants);

/**
 * @swagger
 * /developer/tenants/toggle:
 *   post:
 *     summary: Activar/Desactivar tenant
 *     tags: [Developer]
 *     x-internal: true
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tenantId, activo]
 *             properties:
 *               tenantId:
 *                 type: integer
 *                 example: 1
 *               activo:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Estado actualizado
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
 */
router.post('/tenants/toggle', developerGuard, developerController.toggleTenantStatus);

/**
 * @swagger
 * /developer/api/tenants:
 *   get:
 *     summary: Listar todos los tenants (API)
 *     tags: [Developer]
 *     x-internal: true
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Tenants obtenidos
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *       401:
 *         description: No autenticado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/api/tenants', developerGuard, onboardingController.listarTenants);

/**
 * @swagger
 * /developer/api/tenants/{id}:
 *   get:
 *     summary: Obtener tenant por ID
 *     tags: [Developer]
 *     x-internal: true
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del tenant
 *         example: 1
 *     responses:
 *       200:
 *         description: Tenant obtenido
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       401:
 *         description: No autenticado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Tenant no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/api/tenants/:id', developerGuard, onboardingController.obtenerTenant);

/**
 * @swagger
 * /developer/api/tenants/create:
 *   post:
 *     summary: Crear nuevo tenant
 *     tags: [Developer]
 *     x-internal: true
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre, dominio]
 *             properties:
 *               nombre:
 *                 type: string
 *                 example: Nuevo Tenant
 *               dominio:
 *                 type: string
 *                 example: nuevo.ejemplo.com
 *     responses:
 *       201:
 *         description: Tenant creado exitosamente
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
 */
router.post('/api/tenants/create', developerGuard, onboardingController.crearTenant);

/**
 * @swagger
 * /developer/api/tenants/{tenantId}/iva:
 *   get:
 *     summary: Obtener configuración de IVA de un tenant
 *     tags: [Developer]
 *     x-internal: true
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del tenant
 *         example: 1
 *     responses:
 *       200:
 *         description: Configuración de IVA obtenida
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     tasa:
 *                       type: number
 *                       example: 0.16
 *                     porcentaje:
 *                       type: string
 *                       example: "16%"
 *       401:
 *         description: No autenticado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/api/tenants/:tenantId/iva', developerGuard, developerController.getIvaConfig);

/**
 * @swagger
 * /developer/api/tenants/{tenantId}/iva:
 *   put:
 *     summary: Actualizar configuración de IVA de un tenant
 *     tags: [Developer]
 *     x-internal: true
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del tenant
 *         example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tasa]
 *             properties:
 *               tasa:
 *                 type: number
 *                 example: 0.16
 *                 description: Tasa de IVA (0-1, ej 0.16 = 16%)
 *     responses:
 *       200:
 *         description: Configuración actualizada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Configuración de IVA actualizada correctamente"
 *                 data:
 *                   type: object
 *                   properties:
 *                     tasa:
 *                       type: number
 *                       example: 0.16
 *                     porcentaje:
 *                       type: string
 *                       example: "16%"
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
 */
router.put('/api/tenants/:tenantId/iva', developerGuard, developerController.updateIvaConfig);

module.exports = router;
