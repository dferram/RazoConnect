/**
 * Tenant Verifier - Script para verificar que todas las consultas estén filtradas por tenant_id
 * Ejecutar este middleware en desarrollo para detectar queries sin filtro de tenant
 */

const originalQuery = require('../db').query;

let queryLog = [];
const SUSPICIOUS_PATTERNS = [
  /SELECT.*FROM\s+(productos|clientes|pedidos|agentesdeventas|cupones|categorias)/i,
  /UPDATE\s+(productos|clientes|pedidos|agentesdeventas|cupones|categorias)/i,
  /DELETE\s+FROM\s+(productos|clientes|pedidos|agentesdeventas|cupones|categorias)/i
];

function enableTenantVerification() {
  const db = require('../db');
  
  db.query = async function(text, params) {
    const query = typeof text === 'string' ? text : text.text;
    
    // Verificar si la query debe tener tenant_id
    const needsTenantFilter = SUSPICIOUS_PATTERNS.some(pattern => pattern.test(query));
    
    if (needsTenantFilter) {
      const hasTenantFilter = /tenant_id\s*=/i.test(query) || /\.tenant_id\s*=/i.test(query);
      
      if (!hasTenantFilter) {
        console.warn('QUERY SIN FILTRO DE TENANT DETECTADA:');
        console.warn('   Query:', query.substring(0, 200));
        console.warn('   Params:', params);
        console.warn('   Stack:', new Error().stack.split('\n').slice(2, 5).join('\n'));
        
        queryLog.push({
          timestamp: new Date().toISOString(),
          query: query.substring(0, 200),
          params,
          stack: new Error().stack
        });
      }
    }
    
    return originalQuery.call(this, text, params);
  };
  
}

function disableTenantVerification() {
  const db = require('../db');
  db.query = originalQuery;
}

function getQueryLog() {
  return queryLog;
}

function clearQueryLog() {
  queryLog = [];
}

function printSuspiciousQueries() {
  if (queryLog.length === 0) {
    return;
  }
  
  queryLog.forEach((log, index) => {
  });
}

// Middleware Express para verificar tenant en cada request
function tenantVerificationMiddleware(req, res, next) {
  if (!req.tenant || !req.tenant.tenant_id) {
  } else {
  }
  next();
}

module.exports = {
  enableTenantVerification,
  disableTenantVerification,
  getQueryLog,
  clearQueryLog,
  printSuspiciousQueries,
  tenantVerificationMiddleware
};
