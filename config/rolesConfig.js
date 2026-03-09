/**
 * Matriz de Permisos RBAC - RazoConnect
 * 
 * Define los 7 roles base del sistema y sus permisos granulares.
 * Esta es la fuente única de verdad para el sistema de autorización.
 * 
 * Roles Base:
 * - super_admin: Acceso total dentro de su tenant (bypass en middleware, respeta tenant_id)
 * - admin: Acceso total dentro de su tenant (bypass en middleware, respeta tenant_id)
 * - inventarios: Gestión de stock, ajustes, auditorías
 * - catalogo: Productos, categorías, pedidos, tienda
 * - finanzas: CxC, CxP, créditos, comisiones, reportes financieros
 * - compras: Proveedores, órdenes de compra, recepciones
 * - agente: Ventas, clientes, catálogo visual, comisiones propias
 * 
 * Estructura de permisos:
 * {
 *   modulo: ['accion1', 'accion2', ...]
 * }
 * 
 * Acciones comunes:
 * - ver: Consultar información
 * - crear: Crear nuevos registros
 * - modificar: Editar registros existentes
 * - eliminar: Borrar registros
 * - exportar: Exportar datos
 * - importar: Importar datos masivos
 */

const ROLES_PERMISOS = {
  /**
   * INVENTARIOS
   * Responsable de la gestión de stock, ajustes, auditorías y recepciones
   * También puede ver y gestionar pedidos para surtir
   */
  inventarios: {
    inventario: ['ver', 'modificar'],
    ajustes: ['ver', 'crear', 'modificar'],
    historial_ajustes: ['ver'],
    toma_inventario: ['ver', 'modificar'],
    auditoria: ['ver', 'modificar'],
    reportes: ['ver'], // Reportes generales
    reportes_inventario: ['ver', 'exportar'], // Reportes específicos de inventario
    recibir_inventario: ['ver', 'modificar'],
    productos: ['ver'], // Solo consulta para verificar stock
    pedidos: ['ver', 'modificar'], // Ver pedidos y marcar como surtido
  },

  /**
   * CATALOGO
   * Responsable de productos, categorías, pedidos y contenido de tienda
   */
  catalogo: {
    productos: ['ver', 'crear', 'modificar', 'importar', 'exportar', 'imagenes'],
    categorias: ['ver', 'crear', 'modificar'],
    vista_tienda: ['ver'],
    editor_portada: ['ver', 'modificar'],
    pedidos: ['ver', 'crear', 'modificar', 'cambiar_estatus'],
    inventario: ['ver'], // Solo consulta para verificar disponibilidad
    clientes: ['ver'], // Solo consulta para pedidos
  },

  /**
   * FINANZAS
   * Rol con restricciones quirúrgicas - Solo gestión monetaria
   * ACCESO PERMITIDO: comisiones, validar_pagos, cxc, cxp, reportes_financieros
   * BLOQUEADO: inventario, conciliacion, reportes_inventario, configuracion_sistema, productos
   */
  finanzas: {
    comisiones: ['ver', 'exportar'], // Comisiones de agentes
    validar_pagos: ['ver', 'modificar', 'aprobar', 'rechazar'], // Validación de comprobantes
    cxc: ['ver', 'crear_pago', 'exportar', 'modificar'], // Cuentas por cobrar
    cxp: ['ver', 'crear_pago', 'exportar'], // Cuentas por pagar
    reportes_financieros: ['ver', 'exportar'], // Reportes de ventas y cobranza
    reportes_ventas: ['ver', 'exportar'], // Reportes de ventas
    historial_pagados: ['ver'], // Historial de pagos realizados
    edo_cuenta_proveedores: ['ver'], // Estado de cuenta proveedores
    credito: ['ver', 'modificar'], // Gestión de créditos
    cobranza: ['ver', 'modificar'], // Gestión de cobranza
    clientes: ['ver'], // Solo consulta para CXC
    pedidos: ['ver'], // Solo consulta para facturación
    // EXPLÍCITAMENTE BLOQUEADO (no incluir estos módulos):
    // inventario, productos, categorias, ajustes, configuracion_sistema
    // conciliacion, reportes_inventario, reportes_recepciones, reportes (general)
  },

  /**
   * COMPRAS
   * Responsable de proveedores, órdenes de compra y recepciones
   */
  compras: {
    proveedores: ['ver', 'crear', 'modificar'],
    ordenes_compra: ['ver', 'crear', 'modificar'],
    consolidacion_compras: ['ver', 'modificar'],
    recibir_inventario: ['ver', 'modificar'],
    reportes_recepciones: ['ver', 'exportar'],
    conciliacion: ['ver'],
    inventario: ['ver'], // Solo consulta para planificar compras
    productos: ['ver'], // Solo consulta para crear OC
  },

  /**
   * AGENTE
   * Equipo de ventas: pedidos, clientes, catálogo y comisiones propias
   * NO tiene acceso a compras, ajustes de inventario o validación de pagos
   */
  agente: {
    pedidos: ['ver', 'crear', 'modificar'],
    clientes: ['ver', 'crear', 'modificar'],
    catalogo_visual: ['ver'],
    cxc: ['ver_basico'], // Solo ver deuda de sus clientes
    comisiones_propias: ['ver'], // Solo sus propias comisiones
    productos: ['ver'], // Solo consulta para crear pedidos
  },
};

/**
 * Obtiene los permisos de un rol específico
 * @param {string} rol - Nombre del rol
 * @returns {Object|null} Objeto con los permisos del rol o null si no existe
 */
function getPermisosRol(rol) {
  const rolNormalizado = (rol || '').toString().trim().toLowerCase();
  
  // super_admin y admin tienen acceso total (se maneja en middleware)
  if (rolNormalizado === 'super_admin' || rolNormalizado === 'admin') {
    return null; // null indica bypass total
  }
  
  return ROLES_PERMISOS[rolNormalizado] || null;
}

/**
 * Verifica si un rol tiene un permiso específico
 * @param {string} rol - Nombre del rol
 * @param {string} modulo - Módulo del sistema
 * @param {string} accion - Acción a verificar
 * @returns {boolean} true si tiene el permiso, false en caso contrario
 */
function tienePermiso(rol, modulo, accion) {
  const rolNormalizado = (rol || '').toString().trim().toLowerCase();
  
  // super_admin y admin tienen acceso total
  if (rolNormalizado === 'super_admin' || rolNormalizado === 'admin') {
    return true;
  }
  
  const permisos = ROLES_PERMISOS[rolNormalizado];
  if (!permisos) {
    return false;
  }
  
  const moduloNormalizado = (modulo || '').toString().trim().toLowerCase();
  const accionNormalizada = (accion || '').toString().trim().toLowerCase();
  
  const accionesModulo = permisos[moduloNormalizado];
  if (!accionesModulo || !Array.isArray(accionesModulo)) {
    return false;
  }
  
  return accionesModulo.includes(accionNormalizada);
}

/**
 * Obtiene todos los roles válidos del sistema
 * @returns {Array<string>} Array con los nombres de los roles
 */
function getRolesValidos() {
  return [
    'super_admin',
    'admin',
    'inventarios',
    'catalogo',
    'finanzas',
    'compras',
    'agente'
  ];
}

/**
 * Valida si un rol es válido
 * @param {string} rol - Nombre del rol a validar
 * @returns {boolean} true si el rol es válido, false en caso contrario
 */
function esRolValido(rol) {
  const rolNormalizado = (rol || '').toString().trim().toLowerCase();
  return getRolesValidos().includes(rolNormalizado);
}

/**
 * Obtiene descripción legible de un rol
 * @param {string} rol - Nombre del rol
 * @returns {string} Descripción del rol
 */
function getDescripcionRol(rol) {
  const descripciones = {
    super_admin: 'Super Administrador (Acceso Total en su Tenant)',
    admin: 'Administrador (Acceso Total en su Tenant)',
    inventarios: 'Gestión de Inventarios y Auditorías',
    catalogo: 'Gestión de Productos y Catálogo',
    finanzas: 'Gestión Financiera y Créditos',
    compras: 'Gestión de Compras y Proveedores',
    agente: 'Agente de Ventas'
  };
  
  const rolNormalizado = (rol || '').toString().trim().toLowerCase();
  return descripciones[rolNormalizado] || 'Rol Desconocido';
}

module.exports = {
  ROLES_PERMISOS,
  getPermisosRol,
  tienePermiso,
  getRolesValidos,
  esRolValido,
  getDescripcionRol
};
