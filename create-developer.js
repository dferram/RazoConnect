const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const readline = require('readline');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function createDeveloper() {
  try {
    console.log('\n=== CREAR CUENTA DE DEVELOPER ===\n');

    const username = await question('Username: ');
    if (!username || username.trim().length < 3) {
      console.error('❌ El username debe tener al menos 3 caracteres.');
      process.exit(1);
    }

    const password = await question('Password: ');
    if (!password || password.length < 8) {
      console.error('❌ La contraseña debe tener al menos 8 caracteres.');
      process.exit(1);
    }

    const confirmPassword = await question('Confirmar Password: ');
    if (password !== confirmPassword) {
      console.error('❌ Las contraseñas no coinciden.');
      process.exit(1);
    }

    console.log('\n🔐 Generando hash de contraseña...');
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    console.log('💾 Guardando en base de datos...');
    const result = await pool.query(
      'INSERT INTO developers (username, password_hash) VALUES ($1, $2) RETURNING dev_id, username, created_at',
      [username.trim(), passwordHash]
    );

    const developer = result.rows[0];
    console.log('\n✅ Developer creado exitosamente:');
    console.log(`   ID: ${developer.dev_id}`);
    console.log(`   Username: ${developer.username}`);
    console.log(`   Fecha: ${developer.created_at}`);
    console.log('\n🔒 Puedes acceder en: /developer/login\n');

  } catch (error) {
    if (error.code === '23505') {
      console.error('\n❌ Error: El username ya existe.');
    } else if (error.code === '42P01') {
      console.error('\n❌ Error: La tabla "developers" no existe.');
      console.error('   Ejecuta primero la migración: migrations/001_create_developers_table.sql');
    } else {
      console.error('\n❌ Error al crear developer:', error.message);
    }
    process.exit(1);
  } finally {
    rl.close();
    await pool.end();
  }
}

createDeveloper();
