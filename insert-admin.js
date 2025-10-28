/**
 * Script para insertar administrador en la base de datos
 */

const bcrypt = require('bcrypt');
const db = require('./db');

async function insertAdmin() {
  try {
    console.log('\n🔐 Generando hash para administrador...');
    
    const password = 'Admin123!';
    const hash = await bcrypt.hash(password, 10);
    
    console.log('✅ Hash generado');
    console.log('\n📝 Insertando administrador en la base de datos...');
    
    const result = await db.query(
      `INSERT INTO Administradores (Nombre, Email, PasswordHash, Rol, Activo)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING AdminID, Nombre, Email, Rol`,
      ['Administrador Sistema', 'admin@razoconnect.com', hash, 'superadmin', true]
    );
    
    console.log('\n✅ Administrador creado exitosamente!');
    console.log('\n📋 Datos del administrador:');
    console.log(result.rows[0]);
    console.log('\n🔐 Credenciales de acceso:');
    console.log('URL: http://localhost:3000/admin-login.html');
    console.log('Email: admin@razoconnect.com');
    console.log('Password: Admin123!');
    console.log('\n');
    
    process.exit(0);
  } catch (error) {
    if (error.code === '23505') {
      console.error('\n⚠️  El administrador con ese email ya existe.');
      console.log('\n🔐 Credenciales existentes:');
      console.log('Email: admin@razoconnect.com');
      console.log('Password: Admin123!');
    } else {
      console.error('\n❌ Error al insertar administrador:', error.message);
    }
    process.exit(1);
  }
}

insertAdmin();
