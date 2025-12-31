/**
 * Helper para upload directo a Cloudinary con firma
 * Evita problemas de multer-storage-cloudinary
 */

const CloudinaryUpload = {
  /**
   * Obtiene firma del backend
   */
  async obtenerFirma(folder = "razoconnect_productos") {
    // Usar el mismo nombre de token que auth-guard-admin.js
    const adminToken = localStorage.getItem("razoconnect_admin_token");
    
    if (!adminToken) {
      console.error("❌ No hay token de administrador");
      
      // Mostrar alerta con SweetAlert si está disponible
      if (typeof Swal !== "undefined" && Swal && typeof Swal.fire === "function") {
        await Swal.fire({
          icon: "warning",
          title: "Sesión Expirada",
          text: "Tu sesión ha expirado. Por favor, inicia sesión nuevamente.",
          confirmButtonText: "Ir al Login",
          confirmButtonColor: "#F97316",
          allowOutsideClick: false,
        });
        window.location.replace("/login.html");
      } else {
        alert("Sesión expirada. Redirigiendo al login...");
        window.location.replace("/login.html");
      }
      
      throw new Error("No hay token de administrador");
    }

    const response = await fetch(`${window.location.origin}/api/admin/cloudinary/signature`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ folder }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Token inválido o expirado
        localStorage.removeItem("razoconnect_admin_token");
        localStorage.removeItem("razoconnect_admin");
        
        if (typeof Swal !== "undefined" && Swal && typeof Swal.fire === "function") {
          await Swal.fire({
            icon: "warning",
            title: "Sesión Expirada",
            text: "Tu sesión ha expirado. Por favor, inicia sesión nuevamente.",
            confirmButtonText: "Ir al Login",
            confirmButtonColor: "#F97316",
            allowOutsideClick: false,
          });
        }
        window.location.replace("/login.html");
      }
      throw new Error(`Error obteniendo firma de Cloudinary: ${response.status}`);
    }

    return await response.json();
  },

  /**
   * Sube archivo directamente a Cloudinary API
   */
  async subirArchivo(file, folder = "razoconnect_productos") {
    console.log("=== CLOUDINARY UPLOAD FRONTEND ===");
    console.log("📁 Folder:", folder);
    console.log("📄 File:", file.name, file.type, file.size);

    // 1. Obtener firma del backend
    const signatureData = await this.obtenerFirma(folder);
    console.log("🔐 Signature data recibida:", {
      timestamp: signatureData.timestamp,
      signature: signatureData.signature,
      apiKey: signatureData.apiKey,
      cloudName: signatureData.cloudName,
      folder: signatureData.folder,
    });

    // 2. Crear FormData con EXACTAMENTE los campos firmados
    const formData = new FormData();
    formData.append("file", file);
    formData.append("api_key", signatureData.apiKey);
    formData.append("timestamp", signatureData.timestamp);
    formData.append("signature", signatureData.signature);
    formData.append("folder", signatureData.folder);

    console.log("📦 FormData a enviar:");
    for (let pair of formData.entries()) {
      console.log(`   ${pair[0]}: ${pair[1] instanceof File ? pair[1].name : pair[1]}`);
    }

    // 3. Upload directo a Cloudinary API
    const uploadUrl = `https://api.cloudinary.com/v1_1/${signatureData.cloudName}/image/upload`;
    console.log("🌐 Upload URL:", uploadUrl);

    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      body: formData,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error("❌ Error en upload:", errorText);
      throw new Error(`Error subiendo a Cloudinary: ${uploadResponse.status} ${errorText}`);
    }

    const result = await uploadResponse.json();
    console.log("✅ Upload exitoso:", result.secure_url);
    console.log("=====================================");

    return result;
  },

  /**
   * Sube múltiples archivos
   */
  async subirMultiples(files, folder = "razoconnect_productos") {
    const results = [];
    for (const file of files) {
      try {
        const result = await this.subirArchivo(file, folder);
        results.push({
          success: true,
          file: file,
          result: result,
        });
      } catch (error) {
        console.error("Error subiendo archivo:", file.name, error);
        results.push({
          success: false,
          file: file,
          error: error.message,
        });
      }
    }
    return results;
  },
};

// Exportar para uso global
window.CloudinaryUpload = CloudinaryUpload;
