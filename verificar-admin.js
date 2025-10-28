const db = require('./db');
const bcrypt = require('bcrypt');

async function verificarAdmin() {
  try {
    console.log('🔍 Verificando tabla Administradores...\n');

    // Verificar estructura de la tabla
    const columns = await db.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'administradores'
      ORDER BY ordinal_position
    `);

    console.log('📋 Columnas de la tabla Administradores:');
    columns.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type}`);
    });

    // Verificar datos del admin
    console.log('\n👤 Datos del administrador:');
    const admin = await db.query('SELECT * FROM Administradores');
    
    if (admin.rows.length === 0) {
      console.log('❌ NO HAY ADMINISTRADORES en la base de datos');
      console.log('   Ejecuta: node insert-admin.js');
    } else {
      admin.rows.forEach((a, index) => {
        console.log(`\n  Admin ${index + 1}:`);
        console.log(`    AdminID: ${a.adminid}`);
        console.log(`    Nombre: ${a.nombre}`);
        console.log(`    Email: ${a.email}`);
        console.log(`    Rol: ${a.rol}`);
        console.log(`    Activo: ${a.activo}`);
        console.log(`    Password Hash: ${a.passwordhash ? a.passwordhash.substring(0, 20) + '...' : 'NO EXISTE'}`);
        
        // Verificar si la contraseña funciona
        if (a.passwordhash && a.email === 'admin@razoconnect.com') {
          bcrypt.compare('Admin123!', a.passwordhash).then(isValid => {
            console.log(`    ✅ Password "Admin123!" válida: ${isValid ? 'SÍ' : 'NO'}`);
          });
        }
      });
    }

    console.log('\n✅ Verificación completa\n');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

verificarAdmin();
