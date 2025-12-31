/**
 * Middleware de carga de archivos usando Multer + Cloudinary
 * Configurado para imágenes de productos
 */

const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");
const path = require("path");

// Configuración de almacenamiento en Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "razoconnect_productos", // Carpeta en Cloudinary
    allowed_formats: ["jpg", "jpeg", "png", "webp"], // Formatos permitidos
    transformation: [{ quality: "auto", fetch_format: "auto" }], // Optimización automática
  },
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

// Configurar multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // Límite de 5MB
  },
});

module.exports = upload;
