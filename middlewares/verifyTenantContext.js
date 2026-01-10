/**
 * MIDDLEWARE DE SEGURIDAD CRÍTICA: Verificación de Contexto Tenant
 * 
 * Este middleware actúa como "safety net" para garantizar que TODAS las operaciones
 * de base de datos tengan contexto de tenant válido.
 * 
 * Debe ejecutarse DESPUÉS de:
 * - tenantGuard (detecta tenant por dominio)
 * - authenticate (valida JWT/sesión)
 * - validateUserTenant (valida coincidencia tenant)
 */

const EXEMPT_PATHS = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/webhooks',
  '/api/health',
  '/developer'
];

/**
 * Verifica que exista contexto de tenant válido antes de procesar la petición
 */
function verifyTenantContext(req, res, next) {
  const path = req.path;

  // Excepciones: Rutas públicas
  if (EXEMPT_PATHS.some(exempt => path.startsWith(exempt))) {
    return next();
  }

  // Excepciones: SuperAdmin Global (puede operar sin tenant específico en algunas rutas)
  const userRole = req.user?.rol?.toLowerCase();
  const isSuperAdmin = userRole === 'superadmin' || userRole === 'developer';
  
  // SuperAdmin puede acceder a rutas de gestión global sin tenant específico
  if (isSuperAdmin && (path.startsWith('/api/admin/tenants') || path.startsWith('/api/developer'))) {
    return next();
  }

  // VALIDACIÓN CRÍTICA 1: Debe existir req.tenant (detectado por tenantGuard)
  if (!req.tenant || !req.tenant.tenant_id) {
    console.error('🚨 SECURITY CRITICAL: Missing tenant context');
    console.error(`   Path: ${path}`);
    console.error(`   Method: ${req.method}`);
    console.error(`   User: ${req.user?.email || req.user?.nombre || 'anonymous'}`);
    console.error(`   IP: ${req.ip}`);
    
    return res.status(403).json({
      error: 'Forbidden',
      message: 'No se pudo determinar el contexto del tenant',
      code: 'MISSING_TENANT_CONTEXT'
    });
  }

  // VALIDACIÓN CRÍTICA 2: Si hay usuario autenticado, debe tener tenantId
  if (req.user && !req.user.tenantId && !req.user.tenant_id) {
    console.error('🚨 SECURITY CRITICAL: User without tenant_id');
    console.error(`   User: ${req.user.email || req.user.nombre}`);
    console.error(`   User ID: ${req.user.id || req.user.userId}`);
    console.error(`   Role: ${req.user.rol}`);
    console.error(`   Path: ${path}`);
    console.error(`   Detected Tenant: ${req.tenant.tenant_id}`);
    
    // Forzar logout para prevenir operaciones sin tenant
    req.logout((err) => {
      if (err) console.error('Error en logout:', err);
      
      if (req.session) {
        req.session.destroy((destroyErr) => {
          if (destroyErr) console.error('Error al destruir sesión:', destroyErr);
          res.clearCookie('razoconnect.sid');
        });
      }
    });
    
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Usuario sin contexto de tenant válido. Por favor inicia sesión nuevamente.',
      code: 'USER_MISSING_TENANT_ID'
    });
  }

  // VALIDACIÓN CRÍTICA 3: Tenant del usuario debe coincidir con tenant de la petición
  if (req.user) {
    const userTenantId = req.user.tenantId || req.user.tenant_id;
    const requestTenantId = req.tenant.tenant_id;
    
    if (userTenantId !== requestTenantId) {
      console.error('🚨 SECURITY CRITICAL: Tenant mismatch in verifyTenantContext');
      console.error(`   User tenant: ${userTenantId}`);
      console.error(`   Request tenant: ${requestTenantId}`);
      console.error(`   Path: ${path}`);
      
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Acceso denegado: contexto de tenant inválido',
        code: 'TENANT_MISMATCH'
      });
    }
  }

  // ✅ Todas las validaciones pasaron
  // Agregar helper para facilitar acceso al tenant_id en controladores
  req.getTenantId = () => req.tenant?.tenant_id || req.user?.tenantId || req.user?.tenant_id || 1;
  
  next();
}

module.exports = verifyTenantContext;
