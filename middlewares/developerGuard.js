function developerGuard(req, res, next) {
  if (req.session && req.session.isDeveloper === true) {
    return next();
  }

  if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
    return res.status(401).json({ 
      error: 'Acceso denegado',
      message: 'Se requiere autenticación de developer' 
    });
  }

  return res.redirect('/developer/login');
}

module.exports = developerGuard;
