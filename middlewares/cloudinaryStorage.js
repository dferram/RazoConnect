/**
 * Custom Cloudinary Storage para Multer
 * Implementación directa sin multer-storage-cloudinary para evitar problemas de firma
 * Incluye procesamiento de imágenes para iOS/Safari HEIC y optimización automática
 */

const cloudinary = require("../config/cloudinary");
const { Readable } = require("stream");
const { processImageStream } = require("../utils/imageProcessor");

class CloudinaryStorage {
  constructor(options) {
    this.cloudinary = options.cloudinary;
    this.folder = options.folder || "uploads";
    this.processImages = options.processImages !== false; // Default true
    this.imageOptions = options.imageOptions || {
      maxWidth: 1920,
      maxHeight: 1920,
      quality: 80,
      format: "jpeg", // jpeg for maximum compatibility
    };
  }

  async _handleFile(req, file, cb) {
    try {
      // Generar timestamp manualmente para tener control sobre la firma
      const timestamp = Math.round(Date.now() / 1000);
      
      const uploadParams = {
        folder: this.folder,
        timestamp: timestamp,
      };

      let streamToUpload = file.stream;

      // Process image if enabled (converts HEIC, resizes, compresses)
      if (this.processImages) {
        try {
          console.log(`🔄 Processing image: ${file.originalname}`);
          const processed = await processImageStream(file.stream, this.imageOptions);
          streamToUpload = processed.stream;
          console.log(`✅ Image processed successfully: ${file.originalname}`);
        } catch (processError) {
          console.error(`⚠️ Image processing failed for ${file.originalname}, uploading original:`, processError.message);
          // If processing fails, upload original (fallback)
          streamToUpload = file.stream;
        }
      }

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

      streamToUpload.pipe(uploadStream);
    } catch (error) {
      console.error("❌ Error in _handleFile:", error);
      cb(error);
    }
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
