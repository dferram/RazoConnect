/**
 * NO-CACHE MIDDLEWARE
 * Añade headers de no-caché a las respuestas para prevenir que el navegador
 * guarde copias de páginas protegidas en el caché (BFCache).
 * 
 * Esto previene que usuarios puedan ver páginas protegidas usando el botón
 * "Atrás" del navegador después de cerrar sesión.
 */

const noCacheMiddleware = (req, res, next) => {
  // Configurar headers para prevenir caché en el navegador
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  
  next();
};

module.exports = noCacheMiddleware;
