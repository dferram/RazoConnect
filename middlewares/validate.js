/**
 * EXPRESS-VALIDATOR MIDDLEWARE
 * Middleware que evalúa los resultados de express-validator
 * Úsalo al final de cualquier array de validaciones en una ruta
 * 
 * @module middlewares/validate
 * @author RazoConnect Team
 * @date 2026-03-01
 */

const { validationResult } = require('express-validator');

/**
 * Middleware que evalúa los resultados de express-validator
 * Úsalo al final de cualquier array de validaciones en una ruta
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Datos de entrada inválidos',
      errors: errors.array().map(e => ({
        field: e.path,
        message: e.msg,
      })),
    });
  }
  next();
};

module.exports = validate;
