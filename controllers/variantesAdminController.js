/**
 * VARIANTES ADMIN CONTROLLER
 * 
 * Controlador especializado para la gestión de variantes de productos.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * NOTA: Las funciones crearVariante y actualizarVariante son extremadamente
 * complejas (500+ líneas cada una) con lógica de control de cambios, galería
 * de imágenes, y validaciones múltiples. Se mantienen con transacciones manuales.
 * 
 * @module controllers/variantesAdminController
 * @author RazoConnect Team
 * @date 2026-02-26
 */

const db = require('../db');

// Helper functions (mantenidas del código original)
const parseGaleriaPayload = (galeria) => {
  if (!galeria) return null;
  if (Array.isArray(galeria)) return galeria;
  try {
    const parsed = JSON.parse(galeria);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const normalizeUploadedFiles = (req) => {
  if (!req.files) return [];
  if (Array.isArray(req.files)) return req.files;
  if (req.files.galeria) {
    return Array.isArray(req.files.galeria) ? req.files.galeria : [req.files.galeria];
  }
  return [];
};

const safeUnlinkUploads = async (files) => {
  const fs = require('fs').promises;
  for (const file of files) {
    try {
      if (file?.path) await fs.unlink(file.path);
    } catch (e) {
      console.warn('Error al eliminar archivo:', e.message);
    }
  }
};

/**
 * Crear una nueva variante de producto
 * 
 * NOTA: Esta función es extremadamente compleja (~500 líneas) con:
 * - Control de cambios (INSERT en control_cambios)
 * - Gestión de galería de imágenes
 * - Generación automática de SKU
 * - Validaciones múltiples
 * 
 * Se mantiene la transacción manual por complejidad.
 * 
 * @route POST /api/admin/variantes
 */
const crearVariante = async (req, res) => {
  // NOTA: Por complejidad extrema (~500 líneas), esta función se mantiene
  // en adminController.js por ahora. Requiere refactorización adicional.
  return res.status(501).json({
    success: false,
    message: "Función crearVariante aún en proceso de migración. Use adminController temporalmente.",
  });
};

/**
 * Actualizar una variante existente
 * 
 * NOTA: Similar a crearVariante, extremadamente compleja (~500 líneas).
 * Se mantiene en adminController.js por ahora.
 * 
 * @route PUT /api/admin/variantes/:id
 */
const actualizarVariante = async (req, res) => {
  // NOTA: Por complejidad extrema (~500 líneas), esta función se mantiene
  // en adminController.js por ahora. Requiere refactorización adicional.
  return res.status(501).json({
    success: false,
    message: "Función actualizarVariante aún en proceso de migración. Use adminController temporalmente.",
  });
};

module.exports = {
  crearVariante,
  actualizarVariante
};
