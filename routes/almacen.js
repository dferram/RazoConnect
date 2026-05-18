/**
 * @file routes/almacen.js
 * @description Rutas para el módulo de almacén/inventarios
 */

const express = require('express');
const router = express.Router();
const { surtirProducto, surtirProductosLote } = require('../controllers/almacen/surtidoController');
const { requireRoleAndTenant } = require('../middleware/roleAuth');

// Aplicar middleware de autenticación, tenant y rol a todas las rutas
// Solo usuarios con rol 'inventarios' o 'admin' pueden acceder
router.use(requireRoleAndTenant(['inventarios', 'admin']));

// POST /api/almacen/surtir - Marca un producto como 'Surtido'
router.post('/surtir', surtirProducto);

// POST /api/almacen/surtir-lote - Marca múltiples productos como 'Surtido'
router.post('/surtir-lote', surtirProductosLote);

module.exports = router;
