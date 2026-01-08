const db = require('../db');

const EXCLUDED_PATHS = [
  '/developer',
  '/servicio-pausado',
  '/api/',
  '/css/',
  '/js/',
  '/uploads/',
  '/components/',
  '/icon/',
  '/favicon.ico',
  '/login.html',
  '/registro.html',
  '/admin-login.html'
];

async function tenantGuard(req, res, next) {
  const path = req.path;

  if (EXCLUDED_PATHS.some(excluded => path.startsWith(excluded))) {
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
      return res.redirect('/servicio-pausado');
    }

    const tenant = result.rows[0];

    if (tenant.is_active === false) {
      console.warn(`🚫 Servicio bloqueado para tenant: ${tenant.nombre_cliente} (${hostname})`);
      return res.redirect('/servicio-pausado');
    }

    req.tenant = tenant;
    next();

  } catch (error) {
    console.error('❌ Error en tenantGuard:', error);
    return res.status(500).send('Error al verificar el estado del servicio');
  }
}

module.exports = tenantGuard;
