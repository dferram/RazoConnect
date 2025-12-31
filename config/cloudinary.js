/**
 * Configuración de Cloudinary para almacenamiento de imágenes
 * Inicializa la conexión con Cloudinary usando variables de entorno
 */

const cloudinary = require("cloudinary").v2;

// Validar que existan las credenciales
if (!process.env.CLOUDINARY_CLOUD_NAME) {
  throw new Error("CLOUDINARY_CLOUD_NAME no está definido en las variables de entorno");
}
if (!process.env.CLOUDINARY_API_KEY) {
  throw new Error("CLOUDINARY_API_KEY no está definido en las variables de entorno");
}
if (!process.env.CLOUDINARY_API_SECRET) {
  throw new Error("CLOUDINARY_API_SECRET no está definido en las variables de entorno");
}

// Configurar Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true, // Usar HTTPS
});

console.log("✅ Cloudinary configurado correctamente");

module.exports = cloudinary;
