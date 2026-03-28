/**
 * Middleware de carga de archivos usando Multer + Cloudinary
 * Configurado para imágenes de productos
 * Usa implementación directa de Cloudinary para evitar problemas de firma
 */

const multer = require("multer");
const CloudinaryStorage = require("./cloudinaryStorage");
const cloudinary = require("../config/cloudinary");
const path = require("path");
const { UPLOAD_LIMITS, formatBytes } = require("../config/uploadLimits");

// Configuración de almacenamiento en Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  folder: "razoconnect_productos",
});

// Filtro para solo aceptar imágenes
const fileFilter = (req, file, cb) => {
  // Extensiones permitidas
  const allowedExtensions = /jpeg|jpg|png|webp/;
  // MIME types permitidos
  const allowedMimeTypes = /image\/(jpeg|jpg|png|webp)/;

  const extname = allowedExtensions.test(
    path.extname(file.originalname).toLowerCase()
  );
  const mimetype = allowedMimeTypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb(
      new Error(
        "Solo se permiten archivos de imagen (JPG, PNG, JPEG, WEBP)"
      ),
      false
    );
  }
};

// Configurar multer con límites centralizados
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: UPLOAD_LIMITS.PRODUCT_IMAGES.maxSizeBytes,
  },
});

// Middleware de manejo de errores mejorado
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      const maxSize = formatBytes(UPLOAD_LIMITS.PRODUCT_IMAGES.maxSizeBytes);
      return res.status(413).json({
        success: false,
        error: 'FILE_TOO_LARGE',
        message: `La imagen excede el tamaño máximo permitido de ${maxSize}`,
        maxSize: UPLOAD_LIMITS.PRODUCT_IMAGES.maxSizeMB,
        hint: 'Por favor, reduce el tamaño de la imagen o usa un formato más comprimido (WEBP recomendado)'
      });
    }
    return res.status(400).json({
      success: false,
      error: err.code,
      message: err.message
    });
  }
  
  if (err) {
    return res.status(400).json({
      success: false,
      error: 'UPLOAD_ERROR',
      message: err.message
    });
  }
  
  next();
};

module.exports = upload;
module.exports.handleUploadError = handleUploadError;
