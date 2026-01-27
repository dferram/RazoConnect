const express = require('express');
const router = express.Router();
const comprasController = require('../controllers/comprasController');
const { authenticate } = require('../middlewares/authMiddleware');
const { authorizeAdmin } = require('../middlewares/roleMiddleware');

/**
 * Rutas para gestión flexible de Órdenes de Compra
 * Todas las rutas requieren autenticación y rol de admin
 */

// Editar items de una OC (agregar, eliminar, modificar)
router.put(
  '/orden-compra/:id/items',
  authenticate,
  authorizeAdmin,
  comprasController.editarItemsOrdenCompra
);

// Cancelar backorder vinculado a item eliminado de OC
router.post(
  '/orden-compra/cancelar-backorder',
  authenticate,
  authorizeAdmin,
  comprasController.cancelarBackorderVinculado
);

// Registrar anomalía (merma o excedente) en entrada de almacén
router.post(
  '/orden-compra/registrar-anomalia',
  authenticate,
  authorizeAdmin,
  comprasController.registrarAnomaliaEntrada
);

module.exports = router;
