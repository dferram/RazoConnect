/**
 * @file middleware/roleAuth.js
 * @description Middleware para validar roles de usuario
 */

/**
 * Middleware para requerir un rol específico o conjunto de roles
 * 
 * @param {string|string[]} allowedRoles - Rol o array de roles permitidos
 * @returns {Function} Middleware de Express
 * 
 * @example
 * router.use(requireRole('inventarios'));
 * router.use(requireRole(['inventarios', 'admin']));
 */
function requireRole(allowedRoles) {
  // Normalizar a array
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  
  // Convertir a minúsculas para comparación case-insensitive
  const normalizedRoles = roles.map(r => r.toLowerCase());

  return (req, res, next) => {
    // 1. Verificar que el usuario esté autenticado
    if (!req.user) {
      return res.status(401).json({
        error: 'No autenticado',
        message: 'Debe iniciar sesión para acceder a este recurso'
      });
    }

    // 2. Verificar que el usuario tenga un rol asignado
    if (!req.user.rol) {
      return res.status(403).json({
        error: 'Sin rol asignado',
        message: 'El usuario no tiene un rol asignado en el sistema'
      });
    }

    // 3. Normalizar el rol del usuario
    const userRole = req.user.rol.toLowerCase();

    // 4. Verificar que el rol del usuario esté en la lista de roles permitidos
    if (!normalizedRoles.includes(userRole)) {
      return res.status(403).json({
        error: 'Acceso denegado',
        message: `Este recurso requiere uno de los siguientes roles: ${roles.join(', ')}`,
        userRole: req.user.rol,
        requiredRoles: roles
      });
    }

    // 5. Usuario autorizado, continuar
    next();
  };
}

/**
 * Middleware para verificar que el usuario tenga tenant_id
 * Útil para operaciones multi-tenant
 */
function requireTenant(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: 'No autenticado',
      message: 'Debe iniciar sesión para acceder a este recurso'
    });
  }

  if (!req.user.tenant_id) {
    return res.status(403).json({
      error: 'Sin tenant asignado',
      message: 'El usuario no tiene un tenant asignado en el sistema'
    });
  }

  next();
}

/**
 * Middleware combinado: requiere autenticación, tenant y rol
 * 
 * @param {string|string[]} allowedRoles - Rol o array de roles permitidos
 * @returns {Function[]} Array de middlewares de Express
 * 
 * @example
 * router.use(requireRoleAndTenant('inventarios'));
 * router.use(requireRoleAndTenant(['inventarios', 'admin']));
 */
function requireRoleAndTenant(allowedRoles) {
  return [requireTenant, requireRole(allowedRoles)];
}

module.exports = {
  requireRole,
  requireTenant,
  requireRoleAndTenant
};
