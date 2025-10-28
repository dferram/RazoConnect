const db = require('./db');

async function verificarTabla() {
  try {
    const result = await db.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'agentes'
      ORDER BY ordinal_position
    `);

    console.log('\n📋 Estructura de la tabla Agentes:\n');
    result.rows.forEach(col => {
      console.log(`  ${col.column_name.padEnd(20)} - ${col.data_type.padEnd(25)} - ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

verificarTabla();
