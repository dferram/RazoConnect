/**
 * @file routes/finanzas.js
 * @description Rutas para el módulo de finanzas
 */

const express = require('express');
const router = express.Router();
const { confirmarFacturacion, confirmarFacturacionLote } = require('../controllers/finanzas/confirmacionController');
const { requireRoleAndTenant } = require('../middleware/roleAuth');

// Aplicar middleware de autenticación, tenant y rol a todas las rutas
// Solo usuarios con rol 'finanzas' o 'admin' pueden acceder
router.use(requireRoleAndTenant(['finanzas', 'admin']));

// POST /api/finanzas/confirmar-facturacion - Confirma facturación de un producto
router.post('/confirmar-facturacion', confirmarFacturacion);

// POST /api/finanzas/confirmar-facturacion-lote - Confirma facturación en lote
router.post('/confirmar-facturacion-lote', confirmarFacturacionLote);

module.exports = router;
