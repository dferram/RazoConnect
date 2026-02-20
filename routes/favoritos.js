const express = require('express');
const router = express.Router();
const favoritosController = require('../controllers/favoritosController');
const { authenticate } = require('../middlewares/authMiddleware');

router.post('/toggle', authenticate, favoritosController.toggleFavorito);

router.get('/', authenticate, favoritosController.obtenerFavoritos);

router.get('/verificar/:varianteId', authenticate, favoritosController.verificarFavorito);

router.get('/notificaciones/count', authenticate, favoritosController.contarNotificacionesRestock);

router.put('/notificaciones/marcar-leidas', authenticate, favoritosController.marcarNotificacionesLeidas);

module.exports = router;
