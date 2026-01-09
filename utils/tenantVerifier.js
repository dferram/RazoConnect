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
        console.warn('⚠️  QUERY SIN FILTRO DE TENANT DETECTADA:');
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
  
  console.log('🔍 Tenant Verification ENABLED - Monitoreando queries sin filtro de tenant_id');
}

function disableTenantVerification() {
  const db = require('../db');
  db.query = originalQuery;
  console.log('🔍 Tenant Verification DISABLED');
}

function getQueryLog() {
  return queryLog;
}

function clearQueryLog() {
  queryLog = [];
}

function printSuspiciousQueries() {
  if (queryLog.length === 0) {
    console.log('✅ No se detectaron queries sospechosas sin filtro de tenant_id');
    return;
  }
  
  console.log('\n⚠️  QUERIES SOSPECHOSAS DETECTADAS:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  queryLog.forEach((log, index) => {
    console.log(`\n${index + 1}. ${log.timestamp}`);
    console.log(`   Query: ${log.query}`);
    console.log(`   Params:`, log.params);
  });
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

// Middleware Express para verificar tenant en cada request
function tenantVerificationMiddleware(req, res, next) {
  if (!req.tenant || !req.tenant.tenant_id) {
    console.warn('⚠️  Request sin tenant detectado:', req.method, req.path);
  } else {
    console.log(`✅ Request con tenant_id: ${req.tenant.tenant_id} (${req.tenant.nombre_cliente})`);
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
