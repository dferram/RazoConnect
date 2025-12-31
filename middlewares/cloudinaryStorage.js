/**
 * Custom Cloudinary Storage para Multer
 * Implementación directa sin multer-storage-cloudinary para evitar problemas de firma
 */

const cloudinary = require("../config/cloudinary");
const { Readable } = require("stream");

class CloudinaryStorage {
  constructor(options) {
    this.cloudinary = options.cloudinary;
    this.folder = options.folder || "uploads";
  }

  _handleFile(req, file, cb) {
    // Generar timestamp manualmente para tener control sobre la firma
    const timestamp = Math.round(Date.now() / 1000);
    
    const uploadParams = {
      folder: this.folder,
      timestamp: timestamp,
    };

    console.log("=== CLOUDINARY UPLOAD DEBUG ===");
    console.log("📦 Parámetros de upload:", uploadParams);
    console.log("📁 Folder:", this.folder);
    console.log("⏰ Timestamp:", timestamp);
    
    // Generar string to sign en orden alfabético
    const paramsArray = Object.keys(uploadParams).sort().map(key => `${key}=${uploadParams[key]}`);
    const stringToSign = paramsArray.join('&');
    console.log("📝 String to sign (ordenado alfabéticamente):", stringToSign);
    
    // Generar firma usando el método oficial de Cloudinary
    const signature = this.cloudinary.utils.api_sign_request(uploadParams, this.cloudinary.config().api_secret);
    console.log("🔐 Signature generada:", signature);
    console.log("🔑 API Secret length:", this.cloudinary.config().api_secret.length);
    console.log("===============================");

    const uploadStream = this.cloudinary.uploader.upload_stream(
      uploadParams,
      (error, result) => {
        if (error) {
          console.error("❌ Error en upload de Cloudinary:", error);
          console.error("❌ Error message:", error.message);
          if (error.message && error.message.includes("String to sign")) {
            console.error("⚠️ String to sign esperado por Cloudinary:", error.message.match(/String to sign - '(.+?)'/)?.[1]);
          }
          return cb(error);
        }

        console.log("✅ Upload exitoso a Cloudinary:", result.public_id);
        cb(null, {
          path: result.secure_url,
          filename: result.public_id,
          size: result.bytes,
          format: result.format,
          public_id: result.public_id,
          url: result.url,
          secure_url: result.secure_url,
        });
      }
    );

    file.stream.pipe(uploadStream);
  }

  _removeFile(req, file, cb) {
    if (file.public_id) {
      this.cloudinary.uploader.destroy(file.public_id, cb);
    } else {
      cb(null);
    }
  }
}

module.exports = CloudinaryStorage;
