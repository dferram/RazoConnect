/**
 * Script para verificar la estructura de la tabla Administradores
 */

const db = require('./db');

async function checkAdminTable() {
  try {
    console.log('\n📋 Consultando estructura de la tabla Administradores...\n');
    
    const result = await db.query(`
      SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'administradores'
      ORDER BY ordinal_position
    `);
    
    if (result.rows.length === 0) {
      console.log('⚠️  No se encontró la tabla Administradores');
    } else {
      console.log('✅ Columnas de la tabla Administradores:');
      console.table(result.rows);
    }
    
    console.log('\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkAdminTable();
