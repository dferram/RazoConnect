const multer = require("multer");
const CloudinaryStorage = require("./cloudinaryStorage");
const cloudinary = require("../config/cloudinary");
const path = require("path");
const { UPLOAD_LIMITS, formatBytes } = require("../config/uploadLimits");

// Configuración de almacenamiento en Cloudinary para comprobantes
// IMPORTANTE: processImages: false porque los comprobantes pueden ser PDFs
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  folder: "razoconnect_comprobantes",
  processImages: false, // No procesar porque pueden ser PDFs
});

const fileFilter = (req, file, cb) => {
  const allowedExtensions = /jpeg|jpg|png|pdf|heic|heif/;
  const allowedMimeTypes = /^(image\/(jpeg|jpg|png|heic|heif)|application\/pdf)$/;

  const extname = allowedExtensions.test(
    path.extname(file.originalname).toLowerCase()
  );
  const mimetype = allowedMimeTypes.test(file.mimetype) ||
                   (file.mimetype === 'application/octet-stream' && 
                    /\.(heic|heif)$/i.test(file.originalname));

  if (extname && mimetype) {
    return cb(null, true);
  }

  cb(
    new Error(
      "Solo se permiten comprobantes en formato PDF o imagen (JPG, PNG, HEIC)"
    ),
    false
  );
};

const uploadComprobante = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: UPLOAD_LIMITS.PAYMENT_RECEIPTS.maxSizeBytes,
  },
});

// Middleware de manejo de errores
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      const maxSize = formatBytes(UPLOAD_LIMITS.PAYMENT_RECEIPTS.maxSizeBytes);
      return res.status(413).json({
        success: false,
        error: 'FILE_TOO_LARGE',
        message: `El archivo excede el tamaño máximo permitido de ${maxSize}`,
        maxSize: UPLOAD_LIMITS.PAYMENT_RECEIPTS.maxSizeMB,
        hint: 'Si es un PDF, intenta comprimirlo. Si es una imagen, reduce su tamaño'
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

module.exports = uploadComprobante;
module.exports.handleUploadError = handleUploadError;
