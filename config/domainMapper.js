const db = require('../db');

const DOMAIN_CACHE = new Map();
const CACHE_TTL = 5 * 60 * 1000;
let lastCacheUpdate = 0;

async function loadDomainMappings() {
  try {
    const result = await db.query(
      'SELECT tenant_id, dominio, nombre_cliente, is_active, tema FROM tenants WHERE dominio IS NOT NULL'
    );
    
    DOMAIN_CACHE.clear();
    
    for (const tenant of result.rows) {
      DOMAIN_CACHE.set(tenant.dominio.toLowerCase(), {
        tenant_id: tenant.tenant_id,
        nombre_cliente: tenant.nombre_cliente,
        is_active: tenant.is_active,
        tema: tenant.tema,
        dominio: tenant.dominio
      });
    }
    
    lastCacheUpdate = Date.now();
    console.log(`✅ Domain mappings loaded: ${DOMAIN_CACHE.size} domains`);
    
    return DOMAIN_CACHE;
  } catch (error) {
    console.error('❌ Error loading domain mappings:', error);
    throw error;
  }
}

async function getTenantByDomain(hostname) {
  const now = Date.now();
  
  if (DOMAIN_CACHE.size === 0 || (now - lastCacheUpdate) > CACHE_TTL) {
    await loadDomainMappings();
  }
  
  const normalizedHostname = hostname.toLowerCase();
  return DOMAIN_CACHE.get(normalizedHostname) || null;
}

function extractRootDomain(hostname) {
  const normalizedHostname = hostname.toLowerCase();
  
  const parts = normalizedHostname.split('.');
  
  if (parts.length >= 2) {
    return parts.slice(-2).join('.');
  }
  
  return normalizedHostname;
}

function getDomainForCookie(hostname) {
  // Detectar IPs (IPv4) — no usar como cookie domain
  const isIPv4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);
  if (isIPv4) {
    // En Azure: 169.254.x.x son IPs internas de health checks
    // No establecer cookie domain para IPs — usar undefined (cookie válida para el host actual)
    console.log('🍪 Cookie domain omitido para IP interna', { hostname });
    return undefined;
  }
  
  // Detectar localhost
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return undefined;
  }
  
  // Hostname normal: usar dominio con punto inicial para compartir entre subdominios
  // Ej: "razo.com.mx" → ".razo.com.mx" (válido para www.razo.com.mx, api.razo.com.mx, etc.)
  return `.${hostname}`;
}

async function invalidateCache() {
  DOMAIN_CACHE.clear();
  lastCacheUpdate = 0;
  console.log('🔄 Domain cache invalidated');
}

module.exports = {
  loadDomainMappings,
  getTenantByDomain,
  extractRootDomain,
  getDomainForCookie,
  invalidateCache
};
