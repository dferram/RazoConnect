/**
 * Middleware: Tenant Session Guard
 * 
 * CRITICAL SECURITY: Prevents cross-tenant session hijacking and infinite redirect loops.
 * 
 * This middleware validates that the authenticated user's tenant_id (from JWT token)
 * matches the current request's tenant_id (from domain resolution).
 * 
 * If mismatch detected:
 * - Destroys the invalid session immediately
 * - Returns 401 Unauthorized (API routes)
 * - Redirects to login with clear error message (HTML routes)
 * 
 * This prevents:
 * 1. Users from Tenant A accessing Tenant B with their credentials
 * 2. Infinite redirect loops when tenant mismatch occurs
 * 3. Session persistence across different tenant domains
 */

const tenantSessionGuard = (req, res, next) => {
  // Only apply to authenticated requests (req.user exists after authenticate middleware)
  if (!req.user) {
    return next();
  }

  // Skip if tenant info is not available (shouldn't happen in normal flow)
  if (!req.tenant || !req.tenant.tenant_id) {
    return next();
  }

  const requestTenantId = req.tenant.tenant_id;
  const userTenantId = req.user.tenant_id;

  // If user token doesn't have tenant_id, allow (backward compatibility for old tokens)
  if (!userTenantId) {
    console.warn(`⚠️  User ${req.user.email || req.user.id} has token without tenant_id`);
    return next();
  }

  // CRITICAL CHECK: Tenant mismatch detected
  if (userTenantId !== requestTenantId) {
    console.error(
      `🚨 SECURITY ALERT: Tenant mismatch detected!\n` +
      `   User: ${req.user.email || req.user.id}\n` +
      `   Token tenant_id: ${userTenantId}\n` +
      `   Request tenant_id: ${requestTenantId}\n` +
      `   Domain: ${req.hostname}\n` +
      `   Path: ${req.path}`
    );

    // Clear the user session to prevent loops
    delete req.user;

    // Determine if this is an API request or HTML page request
    const isApiRequest = req.path.startsWith('/api/');

    if (isApiRequest) {
      // API routes: return JSON error
      return res.status(401).json({
        success: false,
        message: 'Sesión inválida para este dominio. Por favor inicia sesión nuevamente.',
        code: 'TENANT_MISMATCH'
      });
    } else {
      // HTML routes: redirect to login with error message
      const loginPath = req.path.includes('/admin') ? '/admin-login.html' : '/login.html';
      return res.redirect(`${loginPath}?error=tenant_mismatch`);
    }
  }

  // Tenant matches, proceed normally
  next();
};

module.exports = tenantSessionGuard;
