/**
 * RUTAS DE MANTENIMIENTO
 * 
 * Endpoints para mantenimiento y corrección de estados
 * 
 * @module routes/mantenimientoRoutes
 * @author RazoConnect Team
 * @date 2026-05-15
 */

const express = require('express');
const router = express.Router();
const estadosMantenimientoController = require('../controllers/mantenimiento/estadosMantenimientoController');
const { authenticate } = require('../middlewares/authMiddleware');

// Aplicar middlewares a todas las rutas
router.use(authenticate);

/**
 * POST /api/mantenimiento/estados/sincronizar-pedido/:id
 * Sincroniza estados de un pedido específico
 */
router.post('/estados/sincronizar-pedido/:id', estadosMantenimientoController.sincronizarPedido);

/**
 * POST /api/mantenimiento/estados/validar-pedido/:id
 * Valida y corrige inconsistencias en un pedido
 */
router.post('/estados/validar-pedido/:id', estadosMantenimientoController.validarPedido);

/**
 * POST /api/mantenimiento/estados/recalcular-masivo
 * Recalcula estados de todos los pedidos activos
 */
router.post('/estados/recalcular-masivo', estadosMantenimientoController.recalcularMasivo);

/**
 * GET /api/mantenimiento/estados/diagnostico-pedido/:id
 * Obtiene diagnóstico detallado del estado de un pedido
 */
router.get('/estados/diagnostico-pedido/:id', estadosMantenimientoController.diagnosticoPedido);

module.exports = router;
