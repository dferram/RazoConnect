const { Pool } = require('pg');
require('dotenv').config();

// Configuración del pool de conexiones a PostgreSQL
// Variables de entorno SSL disponibles:
// - DB_SSL=true: Habilita SSL
// - DB_SSL_REJECT_UNAUTHORIZED=false: Permite certificados autofirmados (solo para dev/legacy)
// En producción Azure: usar DB_SSL=true sin DB_SSL_REJECT_UNAUTHORIZED para validar certificados
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'razoconnect',
  password: process.env.DB_PASSWORD || '',
  port: process.env.DB_PORT || 5432,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: process.env.DB_SSL === 'true' 
    ? { 
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false'
      } 
    : false
});

pool.on('connect', () => {
  console.log('✅ Conectado a la base de datos PostgreSQL en Azure');
});

pool.on('error', (err) => {
  console.error('❌ Error inesperado en el cliente de PostgreSQL:', err.message);
  // NO matar el servidor - el pool manejará la reconexión automáticamente
  // Solo logear el error para debugging
});

const testConnection = async () => {
  try {
    const client = await pool.connect();
    // Opcional: Imprimir la versión para confirmar que es Azure
    const res = await client.query('SELECT version()');
    console.log('✅ Prueba de conexión exitosa:', res.rows[0].version);
    client.release();
  } catch (err) {
    console.error('❌ Error al conectar a PostgreSQL:', err.message);
  }
};

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
  testConnection
};