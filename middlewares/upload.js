/**
 * Middleware de carga de archivos usando Multer
 * Configurado para imágenes de productos
 */

const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Asegurar que existe la carpeta de uploads
const uploadDir = path.join(__dirname, "..", "public", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log("✅ Carpeta uploads creada:", uploadDir);
}

// Configuración de almacenamiento
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generar nombre único: timestamp + nombre original
    const uniqueName = Date.now() + "-" + file.originalname;
    cb(null, uniqueName);
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
