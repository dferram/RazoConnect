/**
 * Controlador para operaciones de Cloudinary
 * Genera firmas para uploads seguros
 */

const cloudinary = require("../config/cloudinary");

/**
 * Genera firma para upload directo a Cloudinary
 * @route POST /api/cloudinary/signature
 */
const generarFirmaUpload = async (req, res) => {
  try {
    const timestamp = Math.round(Date.now() / 1000);
    const folder = req.body.folder || "razoconnect_productos";

    // Parámetros EXACTOS para firmar (en orden alfabético)
    const paramsToSign = {
      folder: folder,
      timestamp: timestamp,
    };

    console.log("=== GENERANDO FIRMA CLOUDINARY ===");
    console.log("📦 Parámetros a firmar:", paramsToSign);
    
    // Generar string to sign en orden alfabético
    const stringToSign = Object.keys(paramsToSign)
      .sort()
      .map(key => `${key}=${paramsToSign[key]}`)
      .join('&');
    console.log("📝 String to sign:", stringToSign);

    // Generar firma usando SDK oficial
    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      cloudinary.config().api_secret
    );

    console.log("🔐 Signature generada:", signature);
    console.log("===================================");

    // Devolver todos los datos necesarios para el upload
    const response = {
      signature: signature,
      timestamp: timestamp,
      apiKey: cloudinary.config().api_key,
      cloudName: cloudinary.config().cloud_name,
      folder: folder,
    };

    res.json(response);
  } catch (error) {
    console.error("❌ Error generando firma Cloudinary:", error);
    res.status(500).json({
      error: "Error generando firma de Cloudinary",
      details: error.message,
    });
  }
};

module.exports = {
  generarFirmaUpload,
};
