const express = require('express');
const router = express.Router();
const inventarioController = require('../controllers/inventarioController');
const { authenticate } = require('../middlewares/authenticate');
const { authorizeAdmin } = require('../middlewares/authorizeAdmin');

// ============================================================================
// RUTAS DE SESIONES DE INVENTARIO
// ============================================================================

/**
 * POST /api/inventario/sesiones
 * Crear nueva sesión de inventario (Solo Admin)
 */
router.post('/sesiones', authenticate, authorizeAdmin, inventarioController.crearSesionInventario);

/**
 * GET /api/inventario/sesiones
 * Listar sesiones de inventario con control de acceso
 * - Admin: Ve todas las sesiones
 * - Agente: Solo ve sus sesiones asignadas
 */
router.get('/sesiones', authenticate, inventarioController.listarSesionesInventario);

/**
 * GET /api/inventario/sesiones/:sesionId
 * Obtener detalle de una sesión específica
 * - Valida que el agente solo pueda ver sus sesiones asignadas
 * - Retorna 403 si el agente intenta acceder a sesión no asignada
 */
router.get('/sesiones/:sesionId', authenticate, inventarioController.obtenerSesionInventario);

/**
 * PUT /api/inventario/sesiones/:sesionId/asignar-agente
 * Asignar agente a una sesión de inventario (Solo Admin)
 */
router.put('/sesiones/:sesionId/asignar-agente', authenticate, authorizeAdmin, inventarioController.asignarAgenteASesion);

/**
 * GET /api/inventario/agentes-disponibles
 * Obtener lista de agentes activos para asignación (Solo Admin)
 */
router.get('/agentes-disponibles', authenticate, authorizeAdmin, inventarioController.obtenerAgentesDisponibles);

/**
 * PUT /api/inventario/sesiones/:sesionId/estatus
 * Actualizar estatus de una sesión (Solo Admin)
 */
router.put('/sesiones/:sesionId/estatus', authenticate, authorizeAdmin, inventarioController.actualizarEstatusSesion);

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
