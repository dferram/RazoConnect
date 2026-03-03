 const express = require('express');
const router = express.Router();
const inventarioController = require('../controllers/inventarioController');
const inventoryAuditController = require('../controllers/inventoryAuditController');
const { authenticate, authorizeAdmin, authorizeRole } = require('../middlewares/roleMiddleware');

// ============================================================================
// RUTAS DE SESIONES DE INVENTARIO
// ============================================================================

/**
 * @swagger
 * /api/inventario/sesiones:
 *   post:
 *     summary: Crear nueva sesión de inventario
 *     tags: [Admin - Inventario]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre]
 *             properties:
 *               nombre:
 *                 type: string
 *                 example: Inventario Marzo 2024
 *     responses:
 *       201:
 *         description: Sesión creada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         description: No autenticado o no es admin
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
router.post('/sesiones', authenticate, authorizeRole(['super_admin', 'admin', 'gerente_operaciones', 'jefe_almacen']), inventoryAuditController.crearSesion);

/**
 * @swagger
 * /api/inventario/sesiones:
 *   get:
 *     summary: Listar sesiones de inventario
 *     description: Admin ve todas, Agente solo sus asignadas
 *     tags: [Admin - Inventario]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sesiones obtenidas exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 sesiones:
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
// NOTA: Agentes con toma de inventario también pasan - lógica en el controlador
router.get('/sesiones', authenticate, inventoryAuditController.listarSesiones);

/**
 * @swagger
 * /api/inventario/sesiones/{sesionId}:
 *   get:
 *     summary: Obtener detalle de una sesión de inventario
 *     tags: [Admin - Inventario]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sesionId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la sesión
 *         example: 10
 *     responses:
 *       200:
 *         description: Sesión obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 sesion:
 *                   type: object
 *       401:
 *         description: No autenticado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Sesión no asignada al agente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Sesión no encontrada
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
// NOTA: Mantener validación 403 existente si agente no está asignado a esa sesión
router.get('/sesiones/:sesionId', authenticate, inventarioController.obtenerSesionInventario);

/**
 * @swagger
 * /api/inventario/sesiones/{sesionId}/dashboard:
 *   get:
 *     summary: Obtener dashboard de una sesión con todos los conteos
 *     tags: [Admin - Inventario]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sesionId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la sesión
 *         example: 10
 *     responses:
 *       200:
 *         description: Dashboard obtenido exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 dashboard:
 *                   type: object
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
router.get('/sesiones/:sesionId/dashboard', authenticate, inventoryAuditController.getDashboardSesion);

/**
 * @swagger
 * /api/inventario/sesiones/{sesionId}/aplicar:
 *   post:
 *     summary: Aplicar resultados de sesión de inventario al stock
 *     tags: [Admin - Inventario]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sesionId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la sesión
 *         example: 10
 *     responses:
 *       200:
 *         description: Sesión aplicada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         description: No autenticado o no es admin
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Sesión no encontrada
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
// Cerrar y sincronizar - acción crítica solo para gerentes
router.post('/sesiones/:sesionId/aplicar', authenticate, authorizeRole(['super_admin', 'admin', 'gerente_operaciones']), inventoryAuditController.aplicarSesion);

/**
 * @swagger
 * /api/inventario/registrar-conteo:
 *   post:
 *     summary: Registrar conteo de un producto en una sesión
 *     tags: [Admin - Inventario]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sesionId, varianteId, cantidad]
 *             properties:
 *               sesionId:
 *                 type: integer
 *                 example: 10
 *               varianteId:
 *                 type: integer
 *                 example: 456
 *               cantidad:
 *                 type: integer
 *                 example: 50
 *     responses:
 *       201:
 *         description: Conteo registrado exitosamente
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
// NOTA: agente también pasa si está asignado (lógica en controlador)
router.post('/registrar-conteo', authenticate, inventoryAuditController.registrarConteo);

/**
 * @swagger
 * /api/inventario/buscar-productos:
 *   get:
 *     summary: Buscar productos para registrar en inventario
 *     tags: [Admin - Inventario]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Término de búsqueda
 *         example: rosa
 *     responses:
 *       200:
 *         description: Productos encontrados
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 productos:
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
router.get('/buscar-productos', authenticate, inventoryAuditController.buscarProductos);

/**
 * @swagger
 * /api/inventario/variante-por-sku:
 *   get:
 *     summary: Obtener variante de producto por SKU
 *     tags: [Admin - Inventario]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: sku
 *         required: true
 *         schema:
 *           type: string
 *         description: SKU del producto
 *         example: ROSA-50-ROJO
 *     responses:
 *       200:
 *         description: Variante encontrada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 variante:
 *                   type: object
 *       401:
 *         description: No autenticado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Variante no encontrada
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
router.get('/variante-por-sku', authenticate, inventoryAuditController.getVariantePorSku);

/**
 * @swagger
 * /api/inventario/sesiones/{sesionId}/asignar-agente:
 *   put:
 *     summary: Asignar agente a una sesión de inventario
 *     tags: [Admin - Inventario]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sesionId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la sesión
 *         example: 10
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [agenteId]
 *             properties:
 *               agenteId:
 *                 type: integer
 *                 example: 5
 *     responses:
 *       200:
 *         description: Agente asignado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         description: No autenticado o no es admin
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Sesión o agente no encontrado
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
router.put('/sesiones/:sesionId/asignar-agente', authenticate, authorizeRole(['super_admin', 'admin', 'gerente_operaciones', 'jefe_almacen']), inventoryAuditController.asignarAgenteASesion);

/**
 * @swagger
 * /api/inventario/agentes-disponibles:
 *   get:
 *     summary: Obtener lista de agentes activos para asignación
 *     tags: [Admin - Inventario]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Agentes obtenidos exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 agentes:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: No autenticado o no es admin
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
router.get('/agentes-disponibles', authenticate, authorizeAdmin, inventoryAuditController.obtenerAgentesDisponibles);

// ============================================================================
// RUTAS DE GESTIÓN DE INVENTARIO (Existentes)
// ============================================================================

/**
 * @swagger
 * /api/inventario/exportar-entradas:
 *   get:
 *     summary: Exportar entradas de almacén a Excel
 *     tags: [Admin - Inventario]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Excel generado exitosamente
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         description: No autenticado o no es admin
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
router.get('/exportar-entradas', authenticate, authorizeAdmin, inventarioController.exportarEntradasAlmacen);

/**
 * @swagger
 * /api/inventario/ordenes-pendientes:
 *   get:
 *     summary: Obtener órdenes de compra pendientes con paginación
 *     tags: [Admin - Inventario]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         example: 20
 *     responses:
 *       200:
 *         description: Órdenes obtenidas exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 ordenes:
 *                   type: array
 *                   items:
 *                     type: object
 *                 total:
 *                   type: integer
 *                   example: 50
 *       401:
 *         description: No autenticado o no es admin
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
router.get('/ordenes-pendientes', authenticate, authorizeAdmin, inventarioController.getOrdenesPendientes);

module.exports = router;
