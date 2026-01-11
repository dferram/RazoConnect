const express = require('express');
const router = express.Router();
const remisionesController = require('../controllers/remisionesController');
const { authenticate, authorizeAdmin } = require('../middlewares/authMiddleware');

router.use(authenticate);
router.use(authorizeAdmin);

router.post('/generar', remisionesController.generarRemision);
router.get('/pedido/:pedido_id/pendiente', remisionesController.obtenerItemsPendientesSurtir);
router.get('/:id', remisionesController.obtenerRemision);
router.get('/', remisionesController.listarRemisiones);
router.put('/:id/cancelar', remisionesController.cancelarRemision);

module.exports = router;
