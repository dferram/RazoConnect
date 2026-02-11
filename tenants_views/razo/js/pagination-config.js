/**
 * Configuración de Paginación para Tablas del Sistema
 * Define los parámetros de paginación para cada tabla
 */

const PAGINATION_CONFIG = {
  // Número de registros por página por defecto
  DEFAULT_ITEMS_PER_PAGE: 15,
  
  // Configuración específica por tabla
  tables: {
    'ordenes-compra': {
      itemsPerPage: 15,
      containerId: 'paginationWrapper',
      tableId: 'ordenesTable',
      tbodyId: 'ordenesTableBody',
      badgeId: 'resultadosBadge'
    },
    'pedidos': {
      itemsPerPage: 15,
      containerId: 'paginationWrapper',
      tableId: 'pedidosTable',
      tbodyId: 'pedidosTableBody',
      badgeId: 'resultadosBadge'
    },
    'clientes': {
      itemsPerPage: 20,
      containerId: 'paginationWrapper',
      tableId: 'clientesTable',
      tbodyId: 'clientesTableBody',
      badgeId: 'resultadosBadge'
    },
    'productos': {
      itemsPerPage: 20,
      containerId: 'paginationWrapper',
      tableId: 'productosTable',
      tbodyId: 'productosTableBody',
      badgeId: 'resultadosBadge'
    },
    'proveedores': {
      itemsPerPage: 15,
      containerId: 'paginationWrapper',
      tableId: 'proveedoresTable',
      tbodyId: 'proveedoresTableBody',
      badgeId: 'resultadosBadge'
    },
    'cupones': {
      itemsPerPage: 15,
      containerId: 'paginationWrapper',
      tableId: 'cuponesTable',
      tbodyId: 'cuponesTableBody',
      badgeId: 'resultadosBadge'
    },
    'categorias': {
      itemsPerPage: 20,
      containerId: 'paginationWrapper',
      tableId: 'categoriasTable',
      tbodyId: 'categoriasTableBody',
      badgeId: 'resultadosBadge'
    },
    'inventario': {
      itemsPerPage: 20,
      containerId: 'paginationWrapper',
      tableId: 'inventarioTable',
      tbodyId: 'inventarioTableBody',
      badgeId: 'resultadosBadge'
    },
    'remisiones': {
      itemsPerPage: 15,
      containerId: 'paginationWrapper',
      tableId: 'tabla-remisiones',
      tbodyId: 'tabla-remisiones',
      badgeId: 'resultadosBadge'
    },
    'agentes': {
      itemsPerPage: 15,
      containerId: 'paginationWrapper',
      tableId: 'agentsTable',
      tbodyId: 'agentsTableBody',
      badgeId: 'resultadosBadge'
    },
    'comisiones': {
      itemsPerPage: 15,
      containerId: 'paginationWrapper',
      tableId: 'comisionesTable',
      tbodyId: 'comisionesTableBody',
      badgeId: 'resultadosBadge'
    },
    'cxc': {
      itemsPerPage: 15,
      containerId: 'paginationWrapper',
      tableId: 'cxcTable',
      tbodyId: 'cxcTbody',
      badgeId: 'resultadosBadge'
    },
    'cxp': {
      itemsPerPage: 15,
      containerId: 'paginationWrapper',
      tableId: 'cxpTable',
      tbodyId: 'cxpTbody',
      badgeId: 'resultadosBadge'
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PAGINATION_CONFIG;
}
