/**
 * Configuración de Cloudinary para almacenamiento de imágenes
 * Inicializa la conexión con Cloudinary usando variables de entorno
 */

require("dotenv").config();

const isTest = process.env.NODE_ENV === 'test';

// En entorno de test, exportar mock para evitar fallos por credenciales faltantes
if (isTest && (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET)) {
  console.log("⚠️ [TEST MODE] Cloudinary credentials not found, using mock implementation");
  
  // Mock de Cloudinary para tests
  module.exports = {
    uploader: {
      upload: async (file, options) => ({
        url: 'http://example.com/mock-image.jpg',
        secure_url: 'https://example.com/mock-image.jpg',
        public_id: 'mock_' + Date.now(),
        format: 'jpg',
        width: 800,
        height: 600,
        bytes: 12345,
        created_at: new Date().toISOString()
      }),
      destroy: async (publicId) => ({
        result: 'ok'
      }),
      upload_stream: (options, callback) => {
        // Mock stream upload
        return {
          end: () => {
            if (callback) {
              callback(null, {
                url: 'http://example.com/mock-stream.jpg',
                public_id: 'mock_stream_' + Date.now()
              });
            }
          }
        };
      }
    },
    config: () => {},
    api: {
      delete_resources: async () => ({ deleted: {} })
    }
  };
} else {
  // Producción/Desarrollo: validar credenciales
  const cloudinary = require("cloudinary").v2;
  
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
}
