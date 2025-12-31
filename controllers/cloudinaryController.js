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

    // ⚠️ HARDCODED CREDENTIALS PARA PRUEBA NUCLEAR ⚠️
    const HARDCODED_API_KEY = "669552955213541";
    const HARDCODED_API_SECRET = "nDg1jA0-S2LCHiSlat5s2Wj1C5Q";
    const HARDCODED_CLOUD_NAME = "daylne1ml";

    console.log("⚠️⚠️⚠️ USANDO CREDENCIALES HARDCODED PARA PRUEBA ⚠️⚠️⚠️");
    console.log("API Secret hardcoded:", HARDCODED_API_SECRET);
    console.log("API Secret from env:", process.env.CLOUDINARY_API_SECRET);
    console.log("¿Son iguales?:", HARDCODED_API_SECRET === process.env.CLOUDINARY_API_SECRET);

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

    // Generar firma usando SDK oficial CON CREDENCIAL HARDCODED
    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      HARDCODED_API_SECRET  // ⚠️ USANDO HARDCODED
    );

    console.log("🔐 Signature generada:", signature);
    console.log("===================================");

    // Devolver todos los datos necesarios para el upload
    const response = {
      signature: signature,
      timestamp: timestamp,
      apiKey: HARDCODED_API_KEY,  // ⚠️ USANDO HARDCODED
      cloudName: HARDCODED_CLOUD_NAME,  // ⚠️ USANDO HARDCODED
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
