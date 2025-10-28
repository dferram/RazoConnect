/**
 * Script para generar hash bcrypt para administrador
 * Ejecuta: node generate-admin-hash.js
 */

const bcrypt = require('bcrypt');

async function generateAdminHash() {
  try {
    const password = 'Admin123!'; // Contraseña por defecto
    const saltRounds = 10;
    
    console.log('\n🔐 Generando hash bcrypt para administrador...\n');
    console.log('Contraseña:', password);
    console.log('Salt Rounds:', saltRounds);
    
    const hash = await bcrypt.hash(password, saltRounds);
    
    console.log('\n✅ Hash generado exitosamente:\n');
    console.log(hash);
    
    console.log('\n📋 Copia y ejecuta este SQL en tu base de datos:\n');
    console.log(`INSERT INTO Administradores (Nombre, Apellido, Email, Password, Rol, Activo)
VALUES (
    'Administrador',
    'Sistema',
    'admin@razoconnect.com',
    '${hash}',
    'superadmin',
    TRUE
);`);
    
    console.log('\n✨ Credenciales para login:');
    console.log('Email: admin@razoconnect.com');
    console.log('Password: Admin123!');
    console.log('\n');
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

generateAdminHash();
