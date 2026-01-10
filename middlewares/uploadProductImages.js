/**
 * Middleware especializado para carga de imágenes de productos
 * Soporta imagen maestro + imágenes por color usando Cloudinary
 * Usa implementación directa de Cloudinary para evitar problemas de firma
 */

const multer = require("multer");
const CloudinaryStorage = require("./cloudinaryStorage");
const cloudinary = require("../config/cloudinary");
const path = require("path");

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

// Configurar multer para múltiples campos
const uploadProductImages = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 15 * 1024 * 1024, // Límite de 15MB (iOS puede enviar archivos grandes que procesaremos)
  },
}).fields([
  { name: "imagenMaestro", maxCount: 1 }, // Imagen principal del producto
  { name: "imagenes", maxCount: 12 }, // Imágenes generales (legacy)
  { name: "imagenesColor", maxCount: 50 }, // Imágenes por color (múltiples colores)
]);

module.exports = uploadProductImages;
