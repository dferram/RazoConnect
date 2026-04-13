const express = require("express");
const router = express.Router();

/**
 * Auth Routes - Router delegador
 *
 * Este archivo está dividido en módulos temáticos para mejorar la mantenibilidad:
 * - auth/cliente.js: Registro, login, verificación y recuperación de contraseña de clientes
 * - auth/agente.js: Registro de agentes y gestión de clientes/pedidos de agentes
 * - auth/admin.js: Registro de administradores
 * - auth/token.js: Renovación de tokens y gestión de sesiones
 * - auth/profile.js: Información de perfil y callbacks (Google)
 * - auth/permisos.js: Obtención de permisos del usuario
 */

// Rutas de Cliente
router.use("/", require("./auth/cliente"));

// Rutas de Agente
router.use("/", require("./auth/agente"));

// Rutas de Admin
router.use("/", require("./auth/admin"));

// Rutas de Token
router.use("/", require("./auth/token"));

// Rutas de Perfil
router.use("/", require("./auth/profile"));

// Rutas de Permisos
router.use("/", require("./auth/permisos"));

module.exports = router;
