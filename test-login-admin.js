const db = require('./db');
const bcrypt = require('bcrypt');

async function testLogin() {
  try {
    const email = 'admin@razoconnect.com';
    const password = 'Admin123!';

    console.log('🔐 Probando login de admin...\n');
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}\n`);

    // Buscar administrador
    console.log('1️⃣ Buscando admin en la base de datos...');
    const result = await db.query(
      'SELECT * FROM Administradores WHERE Email = $1 AND Activo = TRUE',
      [email]
    );

    if (result.rows.length === 0) {
      console.log('❌ ADMIN NO ENCONTRADO con ese email y activo=true');
      console.log('\nVerifica:');
      console.log('  - Email exacto: admin@razoconnect.com');
      console.log('  - Activo = true');
      process.exit(1);
    }

    console.log('✅ Admin encontrado\n');
    const admin = result.rows[0];

    console.log('Datos del admin:');
    console.log(`  - AdminID: ${admin.adminid}`);
    console.log(`  - Nombre: ${admin.nombre}`);
    console.log(`  - Email: ${admin.email}`);
    console.log(`  - Rol: ${admin.rol}`);
    console.log(`  - Activo: ${admin.activo}`);
    console.log(`  - Password Hash: ${admin.passwordhash.substring(0, 30)}...`);

    // Verificar contraseña
    console.log('\n2️⃣ Verificando contraseña...');
    const isPasswordValid = await bcrypt.compare(password, admin.passwordhash);

    if (!isPasswordValid) {
      console.log('❌ CONTRASEÑA INCORRECTA');
      console.log('\nLa contraseña "Admin123!" NO coincide con el hash en la base de datos');
      console.log('Ejecuta: node insert-admin.js para recrear el admin');
      process.exit(1);
    }

    console.log('✅ Contraseña correcta\n');

    console.log('3️⃣ Generando JWT token...');
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      {
        id: admin.adminid,
        email: admin.email,
        rol: admin.rol,
        tipo: 'admin'
      },
      process.env.JWT_SECRET || 'RazoConnect_secret_key_change_in_production',
      { expiresIn: '8h' }
    );

    console.log('✅ Token generado');
    console.log(`Token: ${token.substring(0, 50)}...`);

    console.log('\n✅✅✅ LOGIN EXITOSO ✅✅✅');
    console.log('El login debería funcionar correctamente\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testLogin();
