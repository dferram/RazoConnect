const express = require('express');
const router = express.Router();
const direccionesController = require('../controllers/direccionesController');
const { authenticate, authorize } = require('../middlewares/authMiddleware');

/**
 * @route   GET /api/direcciones
 * @desc    Obtener todas las direcciones del cliente logueado
 * @access  Private (Cliente)
 */
router.get('/direcciones', authenticate, authorize(['cliente']), direccionesController.obtenerDirecciones);

/**
 * @route   POST /api/direcciones
 * @desc    Crear una nueva dirección
 * @access  Private (Cliente)
 * @body    { Etiqueta, Receptor, Calle, NumeroExt, NumeroInt, Colonia, Ciudad, EstadoID, CodigoPostal, TelefonoContacto }
 */
router.post('/direcciones', authenticate, authorize(['cliente']), direccionesController.crearDireccion);

/**
 * @route   PUT /api/direcciones/:id
 * @desc    Actualizar una dirección existente
 * @access  Private (Cliente)
 * @body    { Etiqueta, Receptor, Calle, NumeroExt, NumeroInt, Colonia, Ciudad, EstadoID, CodigoPostal, TelefonoContacto }
 */
router.put('/direcciones/:id', authenticate, authorize(['cliente']), direccionesController.actualizarDireccion);

module.exports = router;
