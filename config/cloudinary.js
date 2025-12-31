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
console.log("✅ Cloudinary configurado:");
console.log("   Cloud Name:", config.cloud_name);
console.log("   API Key:", config.api_key);
console.log("   API Secret:", config.api_secret ? "***" + config.api_secret.slice(-4) : "NOT SET");
console.log("   API Secret Length:", config.api_secret.length);

// Test signature generation
const testTimestamp = Math.round(Date.now() / 1000);
const testParams = {
  folder: "razoconnect_productos",
  timestamp: testTimestamp
};
const testSignature = cloudinary.utils.api_sign_request(testParams, config.api_secret);
console.log("   Test Signature Generation: ✅");

module.exports = cloudinary;
