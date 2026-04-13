const express = require("express");
const router = express.Router();

/**
 * Admin Routes - Router delegador
 *
 * Este archivo está dividido en módulos temáticos para mejorar la mantenibilidad:
 * - admin/auth.js: Autenticación de administrador
 * - admin/productos.js: Gestión de productos, variantes, categorías, medidas
 * - admin/pedidos.js: Gestión de pedidos, picking, evidencias
 * - admin/inventario.js: Gestión de inventario, ajustes, auditoría
 * - admin/finanzas.js: CxC, CxP, comisiones, pagos
 * - admin/compras.js: Órdenes de compra, recepción, FIFO
 * - admin/clientes.js: Gestión de clientes, agentes, proveedores
 * - admin/utilidades.js: Dashboard, configuración, landing, bitácora, etc.
 * - admin/superadmin.js: Rutas solo para super-admin
 */

// Rutas de Autenticación
router.use("/", require("./admin/auth"));

// Rutas de Super Admin
router.use("/", require("./admin/superadmin"));

// Rutas de Productos y Categorías
router.use("/", require("./admin/productos"));

// Rutas de Pedidos
router.use("/", require("./admin/pedidos"));

// Rutas de Inventario
router.use("/", require("./admin/inventario"));

// Rutas de Finanzas (CxC, CxP, Comisiones)
router.use("/", require("./admin/finanzas"));

// Rutas de Compras (Órdenes de Compra, Recepción)
router.use("/", require("./admin/compras"));

// Rutas de Clientes, Agentes, Proveedores
router.use("/", require("./admin/clientes"));

// Rutas de Utilidades (Dashboard, Configuración, Landing, etc.)
router.use("/", require("./admin/utilidades"));

module.exports = router;
