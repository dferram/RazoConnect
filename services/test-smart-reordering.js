/**
 * Script de prueba para validar Smart Reordering
 * Casos de prueba según especificación:
 * - Input: 4 | Regla: 12 -> Output: 12 (Sobrante: 8)
 * - Input: 13 | Regla: 12 -> Output: 24 (Sobrante: 11)
 * - Input: 24 | Regla: 12 -> Output: 24 (Sobrante: 0)
 * 
 * Para ejecutar: node services/test-smart-reordering.js
 */

const db = require("../db");

async function normalizarCantidadPorReglaEmpaque(
  client,
  productoID,
  cantidadSolicitada
) {
  try {
    const reglaResult = await client.query(
      `SELECT pre.cantidadempaque, pre.descripcion
       FROM productos p
       INNER JOIN proveedor_reglas_empaque pre ON pre.reglaid = p.reglaid
       WHERE p.productoid = $1`,
      [productoID]
    );

    if (reglaResult.rows.length === 0) {
      console.warn(
        `⚠️ Producto ${productoID} no tiene regla de empaque definida. Se usará cantidad original.`
      );
      return {
        cantidadNormalizada: cantidadSolicitada,
        reglaEmpaque: null,
        sobranteStock: 0,
        descripcionRegla: "Sin regla de empaque",
      };
    }

    const reglaEmpaque = reglaResult.rows[0].cantidadempaque;
    const descripcionRegla = reglaResult.rows[0].descripcion;

    const cantidadNormalizada =
      Math.ceil(cantidadSolicitada / reglaEmpaque) * reglaEmpaque;

    const sobranteStock = cantidadNormalizada - cantidadSolicitada;

    return {
      cantidadNormalizada,
      reglaEmpaque,
      sobranteStock,
      descripcionRegla,
    };
  } catch (error) {
    console.error("Error en normalizarCantidadPorReglaEmpaque:", error);
    throw error;
  }
}

async function testSmartReordering() {
  const client = await db.pool.connect();

  try {
    console.log("🧪 Iniciando pruebas de Smart Reordering...\n");

    // Buscar un producto con regla de empaque = 12
    const productoTest = await client.query(
      `SELECT p.productoid, p.nombreproducto, pre.cantidadempaque, pre.descripcion
       FROM productos p
       INNER JOIN proveedor_reglas_empaque pre ON pre.reglaid = p.reglaid
       WHERE pre.cantidadempaque = 12
       LIMIT 1`
    );

    if (productoTest.rows.length === 0) {
      console.error("❌ No se encontró ningún producto con regla de empaque = 12");
      console.log("💡 Asegúrate de tener productos con regla de empaque configurada en la BD");
      return;
    }

    const producto = productoTest.rows[0];
    console.log(`📦 Producto de prueba: ${producto.nombreproducto}`);
    console.log(`   Regla de empaque: ${producto.cantidadempaque} (${producto.descripcion})\n`);

    // CASOS DE PRUEBA
    const casosPrueba = [
      { input: 4, expectedOutput: 12, expectedSobrante: 8 },
      { input: 13, expectedOutput: 24, expectedSobrante: 11 },
      { input: 24, expectedOutput: 24, expectedSobrante: 0 },
      { input: 1, expectedOutput: 12, expectedSobrante: 11 },
      { input: 12, expectedOutput: 12, expectedSobrante: 0 },
      { input: 25, expectedOutput: 36, expectedSobrante: 11 },
    ];

    let todosExitosos = true;

    for (const caso of casosPrueba) {
      console.log(`\n🔬 Caso de prueba: Solicitar ${caso.input} unidades`);
      
      const resultado = await normalizarCantidadPorReglaEmpaque(
        client,
        producto.productoid,
        caso.input
      );

      const exitoso = 
        resultado.cantidadNormalizada === caso.expectedOutput &&
        resultado.sobranteStock === caso.expectedSobrante;

      if (exitoso) {
        console.log(`   ✅ ÉXITO`);
        console.log(`      Input: ${caso.input}`);
        console.log(`      Output: ${resultado.cantidadNormalizada} (esperado: ${caso.expectedOutput})`);
        console.log(`      Sobrante: ${resultado.sobranteStock} (esperado: ${caso.expectedSobrante})`);
      } else {
        console.log(`   ❌ FALLO`);
        console.log(`      Input: ${caso.input}`);
        console.log(`      Output: ${resultado.cantidadNormalizada} (esperado: ${caso.expectedOutput})`);
        console.log(`      Sobrante: ${resultado.sobranteStock} (esperado: ${caso.expectedSobrante})`);
        todosExitosos = false;
      }
    }

    console.log("\n" + "=".repeat(60));
    if (todosExitosos) {
      console.log("✅ TODAS LAS PRUEBAS PASARON EXITOSAMENTE");
      console.log("📦 Smart Reordering está funcionando correctamente");
    } else {
      console.log("❌ ALGUNAS PRUEBAS FALLARON");
      console.log("⚠️ Revisar la implementación del algoritmo");
    }
    console.log("=".repeat(60) + "\n");

    // Prueba adicional: Producto sin regla de empaque
    console.log("\n🔬 Prueba adicional: Producto sin regla de empaque");
    const productoSinRegla = await client.query(
      `SELECT p.productoid, p.nombreproducto
       FROM productos p
       WHERE p.reglaid IS NULL
       LIMIT 1`
    );

    if (productoSinRegla.rows.length > 0) {
      const prod = productoSinRegla.rows[0];
      console.log(`   Producto: ${prod.nombreproducto}`);
      
      const resultadoSinRegla = await normalizarCantidadPorReglaEmpaque(
        client,
        prod.productoid,
        10
      );

      if (resultadoSinRegla.cantidadNormalizada === 10 && resultadoSinRegla.sobranteStock === 0) {
        console.log(`   ✅ Correcto: Sin regla, retorna cantidad original (10)`);
      } else {
        console.log(`   ❌ Error: Debería retornar cantidad original sin modificar`);
      }
    } else {
      console.log(`   ℹ️ No hay productos sin regla de empaque para probar`);
    }

  } catch (error) {
    console.error("\n❌ Error en las pruebas:");
    console.error(error.message);
    console.error("\n📋 Stack trace:");
    console.error(error.stack);
  } finally {
    client.release();
    process.exit(0);
  }
}

// Ejecutar pruebas
testSmartReordering();
