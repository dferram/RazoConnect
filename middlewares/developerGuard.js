function developerGuard(req, res, next) {
  // Debugging: Ver estado de la sesión
  console.log('🔍 [developerGuard] Sesión actual:', {
    sessionID: req.sessionID,
    isDeveloper: req.session?.isDeveloper,
    developerId: req.session?.developerId,
    developerUsername: req.session?.developerUsername,
    path: req.path
  });

  if (req.session && req.session.isDeveloper === true) {
    console.log('✅ [developerGuard] Acceso permitido para:', req.session.developerUsername);
    return next();
  }

  console.warn('⚠️ [developerGuard] Acceso denegado - Sesión no válida');

  if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
    return res.status(401).json({ 
      error: 'Acceso denegado',
      message: 'Se requiere autenticación de developer' 
    });
  }

  return res.redirect('/developer/login');
}

module.exports = developerGuard;
