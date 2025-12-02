/**
 * Script para ejecutar migraciones SQL usando la conexión de la app
 */
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { Pool } = require("pg");

const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "razoconnect",
  password: process.env.DB_PASSWORD || "",
  port: process.env.DB_PORT || 5432,
});

async function runMigration() {
  const sqlFile = process.argv[2] || "add_codigo_modelo.sql";
  const sqlPath = path.join(__dirname, sqlFile);

  if (!fs.existsSync(sqlPath)) {
    console.error(`❌ Archivo no encontrado: ${sqlPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(sqlPath, "utf8");

  console.log(`\n🔄 Ejecutando migración: ${sqlFile}\n`);
  console.log("SQL a ejecutar:");
  console.log("─".repeat(50));
  console.log(sql);
  console.log("─".repeat(50));

  try {
    const client = await pool.connect();

    // Ejecutar cada statement por separado
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("--"));

    for (const statement of statements) {
      if (statement) {
        console.log(`\n▶ Ejecutando: ${statement.substring(0, 60)}...`);
        await client.query(statement);
        console.log("  ✅ OK");
      }
    }

    client.release();
    console.log("\n✅ Migración completada exitosamente!\n");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error ejecutando migración:", error.message);
    process.exit(1);
  }
}

runMigration();
