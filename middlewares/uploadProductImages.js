/**
 * Middleware especializado para carga de imágenes de productos
 * Soporta imagen maestro + imágenes por color usando Cloudinary
 */

const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");
const path = require("path");

// Configuración de almacenamiento en Cloudinary para imágenes de productos
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "razoconnect_productos",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [{ quality: "auto", fetch_format: "auto" }],
  },
});

// Filtro para solo aceptar imágenes
const fileFilter = (req, file, cb) => {
  const allowedExtensions = /jpeg|jpg|png|webp/;
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

// Configurar multer para múltiples campos
const uploadProductImages = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // Límite de 5MB por archivo
  },
}).fields([
  { name: "imagenMaestro", maxCount: 1 }, // Imagen principal del producto
  { name: "imagenes", maxCount: 12 }, // Imágenes generales (legacy)
  { name: "imagenesColor", maxCount: 50 }, // Imágenes por color (múltiples colores)
]);

module.exports = uploadProductImages;
