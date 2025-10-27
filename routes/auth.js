const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

/**
 * @route   POST /api/registro/cliente
 * @desc    Registrar un nuevo cliente
 * @access  Public
 * @body    { Nombre, Apellido, Email, Password, Telefono }
 */
router.post('/registro/cliente', authController.registroCliente);

/**
 * @route   POST /api/registro/agente
 * @desc    Registrar un nuevo agente de ventas
 * @access  Public
 * @body    { Nombre, Apellido, Email, Password, CodigoAgente }
 */
router.post('/registro/agente', authController.registroAgente);

/**
 * @route   POST /api/login
 * @desc    Iniciar sesión (cliente o agente)
 * @access  Public
 * @body    { Email, Password }
 */
router.post('/login', authController.login);

module.exports = router;
