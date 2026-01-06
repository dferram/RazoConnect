const express = require('express');
const router = express.Router();
const { obtenerEstados } = require('../controllers/direccionesController');
const landingEditorController = require('../controllers/landingEditorController');
const { authenticate } = require('../middlewares/authMiddleware');

/**
 * @route   GET /api/public/estados
 * @desc    Obtener catálogo de estados
 * @access  Public
 */
router.get('/estados', obtenerEstados);

/**
 * @route   GET /api/landing-content
 * @desc    Obtener contenido dinámico de la landing page
 * @access  Public (preview mode requires admin auth)
 */
router.get('/landing-content', (req, res, next) => {
  if (req.query.preview === 'true') {
    return authenticate(req, res, next);
  }
  next();
}, landingEditorController.getPublicContent);

module.exports = router;
