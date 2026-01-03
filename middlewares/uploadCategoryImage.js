/**
 * Middleware de carga de archivos para imágenes de categorías
 * Usa Cloudinary con carpeta específica 'categories'
 */

const multer = require("multer");
const CloudinaryStorage = require("./cloudinaryStorage");
const cloudinary = require("../config/cloudinary");
const path = require("path");

// Configuración de almacenamiento en Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  folder: "categories",
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

// Configurar multer para categorías
const uploadCategoryImage = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // Límite de 5MB
  },
});

module.exports = uploadCategoryImage;
