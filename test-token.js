// Script para probar el token manualmente
require('dotenv').config();
const jwt = require("jsonwebtoken");

// Obtén tu token del navegador
// 1. Abre http://localhost:3000/test-auth.html
// 2. Click en "Verificar LocalStorage"
// 3. Copia el token de cliente
// 4. Pégalo aquí:

const token =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsInJvbCI6ImNsaWVudGUiLCJlbWFpbCI6ImRmZXJyYW1tQGdtYWlsLmNvbSIsImlhdCI6MTc2MTYxODM0NCwiZXhwIjoxNzYxNzA0NzQ0fQ.hNTelzjYUfR_Kqzq7aeHpgTJxBeJojceFwH3Dl_T57A";

console.log('🔑 JWT_SECRET siendo usado:', process.env.JWT_SECRET);

// Decodificar el token
try {
  const decoded = jwt.verify(
    token,
    process.env.JWT_SECRET || "razoconnect_secret_key"
  );
  console.log("✅ Token válido!");
  console.log("📋 Contenido del token:");
  console.log(JSON.stringify(decoded, null, 2));
} catch (error) {
  console.log("❌ Token inválido:", error.message);
}
