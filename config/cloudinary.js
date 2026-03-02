/**
 * Configuración de Cloudinary para almacenamiento de imágenes
 * Inicializa la conexión con Cloudinary usando variables de entorno
 */

require("dotenv").config();
const cloudinary = require("cloudinary").v2;

// Validar que existan las credenciales
if (!process.env.CLOUDINARY_CLOUD_NAME) {
  console.error("❌ CLOUDINARY_CLOUD_NAME no está definido");
  throw new Error("CLOUDINARY_CLOUD_NAME no está definido en las variables de entorno");
}
if (!process.env.CLOUDINARY_API_KEY) {
  console.error("❌ CLOUDINARY_API_KEY no está definido");
  throw new Error("CLOUDINARY_API_KEY no está definido en las variables de entorno");
}
if (!process.env.CLOUDINARY_API_SECRET) {
  console.error("❌ CLOUDINARY_API_SECRET no está definido");
  throw new Error("CLOUDINARY_API_SECRET no está definido en las variables de entorno");
}

// Configurar Cloudinary con las credenciales (trim para evitar espacios)
const config = {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME.trim(),
  api_key: process.env.CLOUDINARY_API_KEY.trim(),
  api_secret: process.env.CLOUDINARY_API_SECRET.trim(),
  secure: true,
};

cloudinary.config(config);

// Verificar configuración
console.log("[INFO] Cloudinary configurado correctamente");

module.exports = cloudinary;
