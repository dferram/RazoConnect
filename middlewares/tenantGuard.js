const db = require('../db');

const WHITELISTED_PATHS = [
  '/developer',
  '/api/developer',
  '/auth/developer',
  '/suspended',
  '/suspended.html',
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
      detectionMethod = 'FORCE_TENANT_ID';
    } 
    // PRIORIDAD 2: Detección por dominio (producción)
    else {
      const hostname = req.hostname;
      const result = await db.query(
        'SELECT tenant_id, nombre_cliente, is_active, tema FROM tenants WHERE dominio = $1',
        [hostname]
      );

      if (result.rows.length === 0) {
        console.warn(`⚠️  Tenant no encontrado para dominio: ${hostname}`);
        if (path !== '/suspended') {
          return res.redirect('/suspended');
        }
        return next();
      }

      tenant = result.rows[0];
      detectionMethod = `hostname: ${hostname}`;
    }

    // Verificar si el tenant está activo
    if (tenant.is_active === false) {
      console.warn(`🚫 Servicio suspendido para tenant: ${tenant.nombre_cliente}`);
      if (path !== '/suspended') {
        return res.redirect('/suspended');
      }
      return next();
    }

    // CRÍTICO: Solo destruir sesión si hay un cambio REAL de tenant (no en asignación inicial)
    // Esto evita que se destruya la sesión de administradores recién loggeados
    if (req.session && req.session.tenant_id && req.session.tenant_id !== tenant.tenant_id) {
      console.warn(`⚠️  Tenant cambió de ${req.session.tenant_id} a ${tenant.tenant_id}. Limpiando sesión...`);
      // Preservar datos críticos antes de destruir
      const userData = req.session.user;
      const userId = req.session.userId;
      req.session.destroy((err) => {
        if (err) {
          console.error('Error al destruir sesión:', err);
        }
      });
      // No continuar después de destruir - forzar re-login
      return res.status(401).json({ error: 'Sesión invalidada por cambio de tenant' });
    }

    // Guardar tenant_id en sesión para futuras validaciones (solo si no existe)
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
