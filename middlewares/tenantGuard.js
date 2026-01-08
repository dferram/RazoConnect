const db = require('../db');

const WHITELISTED_PATHS = [
  '/developer',
  '/api/developer',
  '/auth/developer',
  '/suspended',
  '/suspended.html',
  '/css/',
  '/js/',
  '/images/',
  '/assets/',
  '/uploads/',
  '/components/',
  '/icon/',
  '/favicon.ico'
];

async function tenantGuard(req, res, next) {
  const path = req.path;

  if (WHITELISTED_PATHS.some(whitelisted => path.startsWith(whitelisted))) {
    return next();
  }

  if (path === '/suspended' || path === '/suspended.html') {
    return next();
  }

  try {
    const hostname = req.hostname;

    const result = await db.query(
      'SELECT tenant_id, nombre_cliente, is_active FROM tenants WHERE dominio = $1',
      [hostname]
    );

    if (result.rows.length === 0) {
      console.warn(`⚠️  Tenant no encontrado para dominio: ${hostname}`);
      if (path !== '/suspended') {
        return res.redirect('/suspended');
      }
      return next();
    }

    const tenant = result.rows[0];

    if (tenant.is_active === false) {
      console.warn(`🚫 Servicio suspendido para tenant: ${tenant.nombre_cliente} (${hostname})`);
      if (path !== '/suspended') {
        return res.redirect('/suspended');
      }
      return next();
    }

    req.tenant = tenant;
    next();

  } catch (error) {
    console.error('❌ Error en tenantGuard:', error);
    return res.status(500).send('Error al verificar el estado del servicio');
  }
}

module.exports = tenantGuard;
