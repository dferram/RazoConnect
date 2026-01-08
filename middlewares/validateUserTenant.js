/**
 * Middleware para validar que el tenant del usuario autenticado coincida con el tenant actual
 * Debe ejecutarse DESPUÉS de passport.session() y DESPUÉS de tenantGuard
 */
function validateUserTenant(req, res, next) {
  // Solo validar si hay usuario autenticado y tenant detectado
  if (!req.user || !req.tenant) {
    return next();
  }

  const userTenantId = req.user.tenant_id;
  const requestTenantId = req.tenant.tenant_id;

  // Si los tenant_id coinciden, todo bien
  if (userTenantId === requestTenantId) {
    return next();
  }

  // MISMATCH DETECTADO: Usuario de un tenant intentando acceder a otro
  console.log('🚨 SECURITY ALERT: Tenant mismatch detected!');
  console.log(`   User: ${req.user.email || req.user.nombre}`);
  console.log(`   Token tenant_id: ${userTenantId}`);
  console.log(`   Request tenant_id: ${requestTenantId}`);
  console.log(`   Domain: ${req.hostname}`);
  console.log(`   Path: ${req.path}`);

  // Hacer logout de Passport primero (esto limpia req.user)
  req.logout((err) => {
    if (err) {
      console.error('Error en logout:', err);
    }

    // Luego destruir la sesión completa
    if (req.session) {
      req.session.destroy((destroyErr) => {
        if (destroyErr) {
          console.error('Error al destruir sesión:', destroyErr);
        }
        
        // Limpiar cookie
        res.clearCookie('razoconnect.sid');
        
        // Retornar error 401
        return res.status(401).json({
          error: 'Sesión invalidada',
          message: 'Tu sesión pertenece a otro sitio. Por favor inicia sesión nuevamente.',
          code: 'TENANT_MISMATCH'
        });
      });
    } else {
      // Si no hay sesión, solo retornar error
      res.clearCookie('razoconnect.sid');
      return res.status(401).json({
        error: 'Sesión invalidada',
        message: 'Tu sesión pertenece a otro sitio. Por favor inicia sesión nuevamente.',
        code: 'TENANT_MISMATCH'
      });
    }
  });
}

module.exports = validateUserTenant;
