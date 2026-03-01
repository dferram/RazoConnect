/**
 * PAGINATION UTILITY
 * Extrae y valida parámetros de paginación de req.query
 * Uso: const { limit, offset, page } = getPaginationParams(req.query);
 * 
 * @module utils/pagination
 * @author RazoConnect Team
 * @date 2026-03-01
 */

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

/**
 * Parsea y valida parámetros de paginación
 * @param {Object} query - req.query
 * @returns {{ limit: number, offset: number, page: number }}
 */
const getPaginationParams = (query = {}) => {
  let page = parseInt(query.page, 10);
  let limit = parseInt(query.limit, 10);

  // Valores por defecto y límites
  if (isNaN(page) || page < 1) page = 1;
  if (isNaN(limit) || limit < 1) limit = DEFAULT_PAGE_SIZE;
  if (limit > MAX_PAGE_SIZE) limit = MAX_PAGE_SIZE;

  const offset = (page - 1) * limit;

  return { limit, offset, page };
};

/**
 * Construye el objeto de metadata de paginación para la respuesta
 * @param {number} total - Total de registros sin paginación
 * @param {number} page - Página actual
 * @param {number} limit - Registros por página
 */
const buildPaginationMeta = (total, page, limit) => {
  const totalPages = Math.ceil(total / limit);
  return {
    total: parseInt(total, 10),
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
};

module.exports = { 
  getPaginationParams, 
  buildPaginationMeta, 
  DEFAULT_PAGE_SIZE, 
  MAX_PAGE_SIZE 
};
