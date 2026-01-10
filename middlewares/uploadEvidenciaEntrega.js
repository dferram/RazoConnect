const multer = require("multer");
const CloudinaryStorage = require("./cloudinaryStorage");
const cloudinary = require("../config/cloudinary");
const path = require("path");

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  folder: "razoconnect_evidencias_entrega",
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
      "Solo se permiten evidencias en formato PDF o imagen (JPG, PNG, HEIC)"
    ),
    false
  );
};

const uploadEvidenciaEntrega = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 15 * 1024 * 1024, // Aumentado para iOS
  },
});

module.exports = uploadEvidenciaEntrega;
