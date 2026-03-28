/**
 * Middleware especializado para carga de imágenes de productos
 * Soporta imagen maestro + imágenes por color usando Cloudinary
 * Usa implementación directa de Cloudinary para evitar problemas de firma
 */

const multer = require("multer");
const CloudinaryStorage = require("./cloudinaryStorage");
const cloudinary = require("../config/cloudinary");
const path = require("path");
const { UPLOAD_LIMITS, formatBytes } = require("../config/uploadLimits");

// Configuración de almacenamiento en Cloudinary para imágenes de productos
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  folder: "razoconnect_productos",
});

// Filtro para solo aceptar imágenes (incluye HEIC/HEIF de iOS)
const fileFilter = (req, file, cb) => {
  // Extensiones permitidas (incluye formatos de iOS)
  const allowedExtensions = /jpeg|jpg|png|webp|heic|heif|tiff|tif/;
  // MIME types permitidos (iOS puede enviar image/heic o application/octet-stream)
  const allowedMimeTypes = /image\/(jpeg|jpg|png|webp|heic|heif|tiff)/;

  const extname = allowedExtensions.test(
    path.extname(file.originalname).toLowerCase()
  );
  const mimetype = allowedMimeTypes.test(file.mimetype) || 
                   (file.mimetype === 'application/octet-stream' && 
                    /\.(heic|heif)$/i.test(file.originalname));

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb(
      new Error(
        "Solo se permiten archivos de imagen (JPG, PNG, WEBP, HEIC)"
      ),
      false
    );
  }
};

// Configurar multer para múltiples campos con límites centralizados
const uploadProductImages = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: UPLOAD_LIMITS.PRODUCT_IMAGES.maxSizeBytes,
  },
}).fields([
  { name: "imagenMaestro", maxCount: 1 }, // Imagen principal del producto
  { name: "imagenes", maxCount: 12 }, // Imágenes generales (legacy)
  { name: "imagenesColor", maxCount: 50 }, // Imágenes por color (múltiples colores)
]);

// Middleware de manejo de errores
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      const maxSize = formatBytes(UPLOAD_LIMITS.PRODUCT_IMAGES.maxSizeBytes);
      return res.status(413).json({
        success: false,
        error: 'FILE_TOO_LARGE',
        message: `Una o más imágenes exceden el tamaño máximo permitido de ${maxSize}`,
        maxSize: UPLOAD_LIMITS.PRODUCT_IMAGES.maxSizeMB,
        hint: 'Reduce el tamaño de las imágenes o usa formato WEBP para mejor compresión'
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

module.exports = uploadProductImages;
module.exports.handleUploadError = handleUploadError;
