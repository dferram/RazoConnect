/**
 * Middleware de carga de archivos para imágenes de categorías
 * Usa Cloudinary con carpeta específica 'categories'
 */

const multer = require("multer");
const CloudinaryStorage = require("./cloudinaryStorage");
const cloudinary = require("../config/cloudinary");
const path = require("path");
const { UPLOAD_LIMITS, formatBytes } = require("../config/uploadLimits");

// Configuración de almacenamiento en Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  folder: "categories",
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

// Configurar multer para categorías con límites centralizados
const uploadCategoryImage = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: UPLOAD_LIMITS.CATEGORY_IMAGES.maxSizeBytes,
  },
});

// Middleware de manejo de errores
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      const maxSize = formatBytes(UPLOAD_LIMITS.CATEGORY_IMAGES.maxSizeBytes);
      return res.status(413).json({
        success: false,
        error: 'FILE_TOO_LARGE',
        message: `La imagen excede el tamaño máximo permitido de ${maxSize}`,
        maxSize: UPLOAD_LIMITS.CATEGORY_IMAGES.maxSizeMB,
        hint: 'Reduce el tamaño de la imagen antes de subirla'
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

module.exports = uploadCategoryImage;
module.exports.handleUploadError = handleUploadError;
