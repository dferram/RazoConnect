const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");
const path = require("path");

// Configuración de almacenamiento en Cloudinary para comprobantes
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "razoconnect_comprobantes", // Carpeta en Cloudinary
    allowed_formats: ["jpg", "jpeg", "png", "pdf"], // Formatos permitidos
    resource_type: "auto", // Permite imágenes y PDFs
  },
});

const fileFilter = (req, file, cb) => {
  const allowedExtensions = /jpeg|jpg|png|pdf/;
  const allowedMimeTypes = /^(image\/(jpeg|jpg|png)|application\/pdf)$/;

  const extname = allowedExtensions.test(
    path.extname(file.originalname).toLowerCase()
  );
  const mimetype = allowedMimeTypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  }

  cb(
    new Error(
      "Solo se permiten comprobantes en formato PDF o imagen (JPG, PNG, JPEG)"
    ),
    false
  );
};

const uploadComprobante = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 8 * 1024 * 1024,
  },
});

module.exports = uploadComprobante;
