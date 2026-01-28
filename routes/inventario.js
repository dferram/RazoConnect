 const express = require('express');
const router = express.Router();
const inventarioController = require('../controllers/inventarioController');
const inventoryAuditController = require('../controllers/inventoryAuditController');
const { authenticate, authorizeAdmin } = require('../middlewares/authMiddleware');

// ============================================================================
// RUTAS DE SESIONES DE INVENTARIO
// ============================================================================

/**
 * POST /api/inventario/sesiones
 * Crear nueva sesión de inventario (Solo Admin)
 * REDIRIGIDO: Usa inventoryAuditController (tabla: toma_inventario_sesiones)
 */
router.post('/sesiones', authenticate, authorizeAdmin, inventoryAuditController.crearSesion);

/**
 * GET /api/inventario/sesiones
 * Listar sesiones de inventario con control de acceso
 * - Admin: Ve todas las sesiones
 * - Agente: Solo ve sus sesiones asignadas
 * REDIRIGIDO: Usa inventoryAuditController (tabla: toma_inventario_sesiones)
 */
router.get('/sesiones', authenticate, inventoryAuditController.listarSesiones);

/**
 * GET /api/inventario/sesiones/:sesionId
 * Obtener detalle de una sesión específica
 * - Valida que el agente solo pueda ver sus sesiones asignadas
 * - Retorna 403 si el agente intenta acceder a sesión no asignada
 * REDIRIGIDO: Usa inventoryAuditController (tabla: toma_inventario_sesiones)
 */
router.get('/sesiones/:sesionId/dashboard', authenticate, inventoryAuditController.getDashboardSesion);

/**
 * POST /api/inventario/sesiones/:sesionId/aplicar
 * Aplicar los resultados de una sesión de inventario al stock (Solo Admin)
 * REDIRIGIDO: Usa inventoryAuditController (tabla: toma_inventario_sesiones)
 */
router.post('/sesiones/:sesionId/aplicar', authenticate, authorizeAdmin, inventoryAuditController.aplicarSesion);

/**
 * POST /api/inventario/registrar-conteo
 * Registrar conteo de un producto en una sesión (Admin o Agente)
 * REDIRIGIDO: Usa inventoryAuditController (tabla: toma_inventario_conteos)
 */
router.post('/registrar-conteo', authenticate, inventoryAuditController.registrarConteo);

/**
 * GET /api/inventario/buscar-productos
 * Buscar productos para registrar en inventario
 * REDIRIGIDO: Usa inventoryAuditController
 */
router.get('/buscar-productos', authenticate, inventoryAuditController.buscarProductos);

/**
 * GET /api/inventario/variante-por-sku
 * Obtener variante de producto por SKU
 * REDIRIGIDO: Usa inventoryAuditController
 */
router.get('/variante-por-sku', authenticate, inventoryAuditController.getVariantePorSku);

/**
 * PUT /api/inventario/sesiones/:sesionId/asignar-agente
 * Asignar agente a una sesión de inventario (Solo Admin)
 */
router.put('/sesiones/:sesionId/asignar-agente', authenticate, authorizeAdmin, inventoryAuditController.asignarAgenteASesion);

/**
 * GET /api/inventario/agentes-disponibles
 * Obtener lista de agentes activos para asignación (Solo Admin)
 */
router.get('/agentes-disponibles', authenticate, authorizeAdmin, inventoryAuditController.obtenerAgentesDisponibles);

// ============================================================================
// RUTAS DE GESTIÓN DE INVENTARIO (Existentes)
// ============================================================================

/**
 * GET /api/inventario/exportar-entradas
 * Exportar entradas de almacén a Excel
 */
router.get('/exportar-entradas', authenticate, authorizeAdmin, inventarioController.exportarEntradasAlmacen);

/**
 * GET /api/inventario/ordenes-pendientes
 * Obtener órdenes de compra pendientes con paginación
 */
router.get('/ordenes-pendientes', authenticate, authorizeAdmin, inventarioController.getOrdenesPendientes);

module.exports = router;
