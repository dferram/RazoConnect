const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { authenticate, authorize } = require('../middlewares/authMiddleware');
const entregasController = require('../controllers/agentes/entregasController');

// Configurar multer para subida de evidencias
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/evidencias/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'evidencia-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes (jpeg, jpg, png, gif, webp)'));
    }
  }
});

// Todas las rutas requieren autenticación de agente
router.use(authenticate);
router.use(authorize(['agente', 'admin']));

/**
 * POST /api/agente/entregas/confirmar
 * Confirma la entrega de un pedido con evidencia fotográfica
 */
router.post('/entregas/confirmar', upload.single('foto_evidencia'), entregasController.confirmarEntrega);

/**
 * GET /api/agente/entregas/pendientes
 * Obtiene la lista de entregas pendientes del agente
 */
router.get('/entregas/pendientes', entregasController.obtenerEntregasPendientes);

module.exports = router;
