/**
 * ════════════════════════════════════════════════════════════
 * MIDDLEWARE DE ROLES GRANULARES
 * ════════════════════════════════════════════════════════════
 * 
 * Unifica y re-exporta funciones de authMiddleware más helpers
 * específicos para grupos de roles con acceso a módulos comunes.
 * 
 * Este archivo centraliza la autorización por roles granulares
 * y proporciona helpers convenientes para proteger rutas por módulo.
 */

const { 
  authorizeRole, 
  authorizePermiso, 
  authenticate,
  authorize,
  authorizeAdmin,
  authorizeAdminOrAgente,
  authorizeAdminOnly,
  authorizeSuperAdmin,
  verifySuperAdmin,
} = require('./authMiddleware');

// ════════════════════════════════════════════════════════════
// HELPERS: Grupos de roles con acceso a módulos específicos
// ════════════════════════════════════════════════════════════

/**
 * Helper: Grupo de roles con acceso financiero
 * Permite acceso a: finanzas, crédito, cobranza
 */
const authorizeFinanzas = authorizeRole([
  'super_admin',
  'admin',
  'gerente_finanzas',
  'contador',
  'encargado_credito',
  'ejecutivo_cobranza'
]);

/**
 * Helper: Grupo de roles con acceso a inventario
 * Permite acceso a: inventario, conteos, ajustes
 */
const authorizeInventario = authorizeRole([
  'super_admin',
  'admin',
  'gerente_operaciones',
  'jefe_almacen',
  'almacenista',
  'recepcionista_compras',
  'compras'
]);

/**
 * Helper: Grupo de roles con acceso a compras
 * Permite acceso a: órdenes de compra, proveedores, recepción
 */
const authorizeCompras = authorizeRole([
  'super_admin',
  'admin',
  'gerente_operaciones',
  'jefe_almacen',
  'recepcionista_compras',
  'compras'
]);

/**
 * Helper: Grupo de roles con acceso a ventas
 * Permite acceso a: pedidos, clientes, agentes
 */
const authorizeVentas = authorizeRole([
  'super_admin',
  'admin',
  'gerente_comercial',
  'supervisor_ventas',
  'ejecutivo_ventas'
]);

/**
 * Helper: Grupo de roles con acceso a reportes
 * Permite acceso a: reportes generales, exportaciones
 */
const authorizeReportes = authorizeRole([
  'super_admin',
  'admin',
  'gerente_finanzas',
  'gerente_operaciones',
  'gerente_comercial',
  'contador',
  'auditor_interno'
]);

/**
 * Helper: Grupo de roles con acceso a gestión de crédito
 * Permite acceso a: líneas de crédito, límites, aprobaciones
 */
const authorizeCredito = authorizeRole([
  'super_admin',
  'admin',
  'gerente_finanzas',
  'encargado_credito'
]);

/**
 * Helper: Grupo de roles con acceso a cobranza
 * Permite acceso a: CXC, seguimiento de pagos, recordatorios
 */
const authorizeCobranza = authorizeRole([
  'super_admin',
  'admin',
  'gerente_finanzas',
  'ejecutivo_cobranza'
]);

/**
 * Helper: Grupo de roles con acceso a gestión de productos
 * Permite acceso a: catálogo, variantes, precios
 */
const authorizeProductos = authorizeRole([
  'super_admin',
  'admin',
  'gerente_operaciones',
  'compras',
  'marketing'
]);

/**
 * Helper: Grupo de roles con acceso a gestión de agentes
 * Permite acceso a: carteras, comisiones, asignaciones
 */
const authorizeAgentes = authorizeRole([
  'super_admin',
  'admin',
  'gerente_comercial',
  'supervisor_ventas'
]);

/**
 * Helper: Grupo de roles con acceso a auditoría
 * Permite acceso a: logs, auditorías, revisiones
 */
const authorizeAuditoria = authorizeRole([
  'super_admin',
  'admin',
  'auditor_interno'
]);

// ════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════

module.exports = {
  // Re-exportar funciones base de authMiddleware
  authenticate,
  authorize,
  authorizeAdmin,
  authorizeAdminOrAgente,
  authorizeAdminOnly,
  authorizeSuperAdmin,
  verifySuperAdmin,
  
  // Funciones granulares
  authorizeRole,
  authorizePermiso,
  
  // Helpers por módulo
  authorizeFinanzas,
  authorizeInventario,
  authorizeCompras,
  authorizeVentas,
  authorizeReportes,
  authorizeCredito,
  authorizeCobranza,
  authorizeProductos,
  authorizeAgentes,
  authorizeAuditoria,
};
