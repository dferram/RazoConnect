const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { authenticate, authorize } = require('../middlewares/authMiddleware');
const entregasController = require('../controllers/agentes/entregasController');
const inventoryAuditController = require('../controllers/inventoryAuditController');
const { heavyOperationLimiter } = require('../middlewares/rateLimiter');

// Configurar multer para subida de evidencias
// CRÍTICO: Usar memoryStorage para evitar pérdida de datos en Azure App Service
// Los archivos se guardan en memoria temporal y se suben directamente a Cloudinary
const storage = multer.memoryStorage();

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
router.post('/entregas/confirmar', heavyOperationLimiter, upload.single('foto_evidencia'), entregasController.confirmarEntrega);

/**
 * GET /api/agente/entregas/pendientes
 * Obtiene la lista de entregas pendientes del agente
 */
router.get('/entregas/pendientes', entregasController.obtenerEntregasPendientes);

/**
 * GET /api/agente/auditoria-inventario/sesiones
 * Obtiene las sesiones de inventario asignadas al agente
 */
router.get('/auditoria-inventario/sesiones', inventoryAuditController.listarSesiones);

/**
 * GET /api/agente/auditoria-inventario/dashboard/:sesionId
 * Obtiene el dashboard de una sesión (solo si está asignada al agente)
 */
router.get('/auditoria-inventario/dashboard/:sesionId', inventoryAuditController.getDashboardSesion);

/**
 * POST /api/agente/auditoria-inventario/registrar-conteo
 * Registra un conteo de inventario
 */
router.post('/auditoria-inventario/registrar-conteo', inventoryAuditController.registrarConteo);

module.exports = router;
