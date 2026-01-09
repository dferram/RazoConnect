const db = require('../db');
const { getTenantByDomain, extractRootDomain } = require('../config/domainMapper');

const WHITELISTED_PATHS = [
  '/developer',
  '/api/developer',
  '/auth/developer',
  '/suspended',
  '/suspended.html',
  '/tienda-no-encontrada',
  '/tienda-no-encontrada.html',
  '/icon/',
  '/favicon.ico'
];

async function tenantGuard(req, res, next) {
  const path = req.path;

  if (WHITELISTED_PATHS.some(whitelisted => path.startsWith(whitelisted))) {
    return next();
  }

  try {
    let tenant;
    let detectionMethod;

    // PRIORIDAD 1: FORCE_TENANT_ID (para desarrollo/testing)
    if (process.env.FORCE_TENANT_ID) {
      const forcedTenantId = parseInt(process.env.FORCE_TENANT_ID, 10);
      console.log(`🔧 FORCE_TENANT_ID detectado: ${forcedTenantId}`);
      
      const result = await db.query(
        'SELECT tenant_id, nombre_cliente, is_active, tema FROM tenants WHERE tenant_id = $1',
        [forcedTenantId]
      );

      if (result.rows.length === 0) {
        console.error(`❌ FORCE_TENANT_ID=${forcedTenantId} no existe en la base de datos`);
        return res.status(500).send('Configuración de tenant inválida');
      }

      tenant = result.rows[0];
      tenant.dominio = 'localhost';
      detectionMethod = 'FORCE_TENANT_ID';
    } 
    // PRIORIDAD 2: Detección por dominio raíz (producción)
    else {
      const hostname = req.hostname;
      const rootDomain = extractRootDomain(hostname);
      
      console.log(`🔍 Hostname: ${hostname} | Root Domain: ${rootDomain}`);
      
      tenant = await getTenantByDomain(rootDomain);

      if (!tenant) {
        console.warn(`⚠️  Tenant no encontrado para dominio: ${hostname} (root: ${rootDomain})`);
        if (path !== '/tienda-no-encontrada' && path !== '/tienda-no-encontrada.html') {
          return res.redirect('/tienda-no-encontrada.html');
        }
        return next();
      }

      detectionMethod = `root domain: ${rootDomain}`;
    }

    // Verificar si el tenant está activo
    if (tenant.is_active === false) {
      console.warn(`🚫 Servicio suspendido para tenant: ${tenant.nombre_cliente}`);
      if (path !== '/suspended' && path !== '/suspended.html') {
        return res.redirect('/suspended.html');
      }
      return next();
    }

    // Si hay un cambio de tenant en la sesión, destruir la sesión completamente
    // para evitar contaminación entre dominios
    if (req.session && req.session.tenant_id && req.session.tenant_id !== tenant.tenant_id) {
      console.warn(`⚠️  Tenant cambió de ${req.session.tenant_id} a ${tenant.tenant_id}. Destruyendo sesión...`);
      req.session.destroy((err) => {
        if (err) {
          console.error('Error al destruir sesión:', err);
        }
      });
    }

    // Guardar tenant_id en sesión para futuras validaciones
    if (req.session && !req.session.tenant_id) {
      req.session.tenant_id = tenant.tenant_id;
      console.log(`🔐 Tenant ID ${tenant.tenant_id} asignado a sesión ${req.sessionID}`);
    }

    req.tenant = tenant;
    console.log(`✅ Tenant detectado: ${tenant.nombre_cliente} (ID: ${tenant.tenant_id}) via ${detectionMethod}`);
    next();

  } catch (error) {
    console.error('❌ Error en tenantGuard:', error);
    return res.status(500).send('Error al verificar el estado del servicio');
  }
}

module.exports = tenantGuard;
