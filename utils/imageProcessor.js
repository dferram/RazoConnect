/**
 * Image Processing Utility
 * Handles iOS/Safari HEIC images and optimizes all uploads
 * - Converts HEIC/TIFF/PNG/JPG to WebP or JPEG
 * - Resizes to max 1920px width maintaining aspect ratio
 * - Compresses to 80% quality
 * - Prevents timeouts and corruption from oversized images
 */

const sharp = require("sharp");
const { Readable } = require("stream");

/**
 * Process image buffer with normalization, resize, and compression
 * @param {Buffer} buffer - Original image buffer
 * @param {Object} options - Processing options
 * @returns {Promise<Buffer>} - Processed image buffer
 */
async function processImageBuffer(buffer, options = {}) {
  const {
    maxWidth = 1920,
    maxHeight = 1920,
    quality = 80,
    format = "jpeg", // 'jpeg' or 'webp'
  } = options;

  try {
    // Initialize sharp with the buffer
    let image = sharp(buffer);

    // Get metadata to check original dimensions
    const metadata = await image.metadata();
    console.log(`Processing image: ${metadata.format} ${metadata.width}x${metadata.height}`);

    // Resize if image exceeds max dimensions (maintains aspect ratio)
    if (metadata.width > maxWidth || metadata.height > maxHeight) {
      image = image.resize(maxWidth, maxHeight, {
        fit: "inside", // Maintains aspect ratio, fits within bounds
        withoutEnlargement: true, // Don't upscale smaller images
      });
      console.log(`Resizing to max ${maxWidth}x${maxHeight} (aspect ratio preserved)`);
    }

    // Convert to target format with compression
    if (format === "webp") {
      image = image.webp({ quality });
    } else {
      // Default to JPEG for maximum compatibility
      image = image.jpeg({ quality, mozjpeg: true });
    }

    // Execute the pipeline and return buffer
    const processedBuffer = await image.toBuffer();
    
    const originalSizeKB = Math.round(buffer.length / 1024);
    const processedSizeKB = Math.round(processedBuffer.length / 1024);
    const reduction = Math.round(((buffer.length - processedBuffer.length) / buffer.length) * 100);
    
    console.log(`Image processed: ${originalSizeKB}KB → ${processedSizeKB}KB (${reduction}% reduction)`);

    return processedBuffer;
  } catch (error) {
    console.error("Error processing image:", error);
    throw new Error(`Image processing failed: ${error.message}`);
  }
}

/**
 * Process image stream (for multer integration)
 * @param {Stream} stream - Input stream from multer
 * @param {Object} options - Processing options
 * @returns {Promise<{buffer: Buffer, stream: Readable}>} - Processed buffer and new stream
 */
async function processImageStream(stream, options = {}) {
  try {
    // Convert stream to buffer
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const originalBuffer = Buffer.concat(chunks);

    // Process the buffer
    const processedBuffer = await processImageBuffer(originalBuffer, options);

    // Create a new readable stream from processed buffer
    const processedStream = Readable.from(processedBuffer);

    return {
      buffer: processedBuffer,
      stream: processedStream,
    };
  } catch (error) {
    console.error("Error processing image stream:", error);
    throw error;
  }
}

/**
 * Validate if file is an image (including HEIC)
 * @param {Buffer} buffer - File buffer
 * @returns {Promise<boolean>} - True if valid image
 */
async function isValidImage(buffer) {
  try {
    const metadata = await sharp(buffer).metadata();
    return !!metadata.format;
  } catch (error) {
    return false;
  }
}

/**
 * Get image metadata
 * @param {Buffer} buffer - Image buffer
 * @returns {Promise<Object>} - Image metadata
 */
async function getImageMetadata(buffer) {
  try {
    return await sharp(buffer).metadata();
  } catch (error) {
    console.error("Error getting image metadata:", error);
    throw error;
  }
}

module.exports = {
  processImageBuffer,
  processImageStream,
  isValidImage,
  getImageMetadata,
};
