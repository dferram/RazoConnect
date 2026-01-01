/**
 * Helper para operaciones con Cloudinary
 * Incluye eliminación física de imágenes
 */

const cloudinary = require("../config/cloudinary");

/**
 * Elimina una imagen de Cloudinary usando su public_id
 * @param {string} publicId - El public_id de la imagen en Cloudinary
 * @returns {Promise<Object>} - Resultado de la eliminación
 */
async function eliminarImagenCloudinary(publicId) {
  if (!publicId || typeof publicId !== "string") {
    throw new Error("public_id inválido para eliminación");
  }

  try {
    const result = await cloudinary.uploader.destroy(publicId);
    
    if (result.result === "ok") {
      return { success: true, publicId, result: result.result };
    } else if (result.result === "not found") {
      console.warn(`⚠️ Imagen no encontrada en Cloudinary: ${publicId}`);
      return { success: false, publicId, result: result.result, message: "Imagen no encontrada" };
    } else {
      console.error(`❌ Error eliminando imagen de Cloudinary: ${publicId}`, result);
      return { success: false, publicId, result: result.result };
    }
  } catch (error) {
    console.error(`❌ Excepción eliminando imagen de Cloudinary: ${publicId}`, error);
    throw error;
  }
}

/**
 * Elimina múltiples imágenes de Cloudinary
 * @param {Array<string>} publicIds - Array de public_ids
 * @returns {Promise<Object>} - Resultado con éxitos y fallos
 */
async function eliminarImagenesCloudinary(publicIds) {
  if (!Array.isArray(publicIds) || publicIds.length === 0) {
    return { success: true, deleted: [], failed: [] };
  }

  const results = {
    deleted: [],
    failed: [],
  };

  for (const publicId of publicIds) {
    try {
      const result = await eliminarImagenCloudinary(publicId);
      if (result.success) {
        results.deleted.push(publicId);
      } else {
        results.failed.push({ publicId, reason: result.message || "Error desconocido" });
      }
    } catch (error) {
      results.failed.push({ publicId, reason: error.message });
    }
  }

  return {
    success: results.failed.length === 0,
    deleted: results.deleted,
    failed: results.failed,
  };
}

/**
 * Extrae el public_id de una URL de Cloudinary
 * @param {string} url - URL completa de Cloudinary
 * @returns {string|null} - public_id extraído o null
 */
function extraerPublicIdDeUrl(url) {
  if (!url || typeof url !== "string") {
    return null;
  }

  try {
    // Formato típico: https://res.cloudinary.com/{cloud_name}/image/upload/v{version}/{public_id}.{format}
    // O: https://res.cloudinary.com/{cloud_name}/image/upload/{public_id}.{format}
    
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.\w+$/);
    if (match && match[1]) {
      return match[1];
    }

    // Si la URL ya es un public_id (sin extensión)
    if (!url.includes("http") && !url.includes(".")) {
      return url;
    }

    return null;
  } catch (error) {
    console.error("Error extrayendo public_id de URL:", error);
    return null;
  }
}

module.exports = {
  eliminarImagenCloudinary,
  eliminarImagenesCloudinary,
  extraerPublicIdDeUrl,
};
