/**
 * Script de prueba para generarBackorderProveedor
 *
 * Para ejecutar: node services/test-backorder.js
 */

const db = require("../db");
const { generarBackorderProveedor } = require("./ordenesService");

async function testBackorder() {
  const client = await db.pool.connect();

  try {
    console.log("🧪 Iniciando prueba de generarBackorderProveedor...\n");

    await client.query("BEGIN");

    // ============================================
    // CONFIGURAR ESTOS VALORES PARA TU PRUEBA
    // ============================================
    const TEST_PRODUCTO_ID = 1; // Cambia esto a un ProductoID válido
    const TEST_VARIANTE_ID = 1; // Cambia esto a un VarianteID válido
    const TEST_CANTIDAD = 5; // Cantidad de paquetes a solicitar
    const TEST_TAMANO_ID = null; // O un TamanoID válido (puede ser null)

    console.log("📋 Parámetros de prueba:");
    console.log(`   - ProductoID: ${TEST_PRODUCTO_ID}`);
    console.log(`   - VarianteID: ${TEST_VARIANTE_ID}`);
    console.log(`   - Cantidad: ${TEST_CANTIDAD}`);
    console.log(`   - TamañoID: ${TEST_TAMANO_ID || "NULL"}\n`);

    // Verificar que el producto existe y tiene proveedor
    console.log("🔍 Verificando producto...");
    const productoCheck = await client.query(
      `SELECT p.ProductoID, p.NombreProducto, p.ProveedorID_Default, 
              pr.NombreProveedor
       FROM Productos p
       LEFT JOIN Proveedores pr ON pr.ProveedorID = p.ProveedorID_Default
       WHERE p.ProductoID = $1`,
      [TEST_PRODUCTO_ID]
    );

    if (productoCheck.rows.length === 0) {
      throw new Error(`❌ Producto ${TEST_PRODUCTO_ID} no encontrado`);
    }

    const producto = productoCheck.rows[0];
    console.log(`   ✅ Producto: ${producto.nombreproducto}`);
    console.log(
      `   ✅ Proveedor: ${producto.nombreproveedor || "NO ASIGNADO"}\n`
    );

    if (!producto.proveedorid_default) {
      throw new Error("❌ Este producto no tiene proveedor asignado");
    }

    // ============================================
    // EJECUTAR LA FUNCIÓN
    // ============================================
    console.log("🚀 Ejecutando generarBackorderProveedor...\n");

    const resultado = await generarBackorderProveedor(
      client,
      TEST_PRODUCTO_ID,
      TEST_VARIANTE_ID,
      TEST_CANTIDAD,
      TEST_TAMANO_ID
    );

    console.log("✅ Resultado exitoso:");
    console.log(JSON.stringify(resultado, null, 2));
    console.log();

    // Verificar la orden creada/actualizada
    console.log("🔍 Verificando orden de compra generada...");
    const ordenCheck = await client.query(
      `SELECT oc.OrdenCompraID, oc.ProveedorID, oc.Estatus, 
              oc.FechaCreacion, oc.FechaEntregaEsperada,
              pr.NombreProveedor
       FROM OrdenesDeCompra oc
       INNER JOIN Proveedores pr ON pr.ProveedorID = oc.ProveedorID
       WHERE oc.OrdenCompraID = $1`,
      [resultado.ordenCompraID]
    );

    if (ordenCheck.rows.length > 0) {
      const orden = ordenCheck.rows[0];
      console.log(`   ✅ Orden #${orden.ordencompraid}`);
      console.log(`   - Proveedor: ${orden.nombreproveedor}`);
      console.log(`   - Estatus: ${orden.estatus}`);
      console.log(`   - Fecha creación: ${orden.fechacreacion}`);
      console.log(`   - Fecha entrega: ${orden.fechaentregaesperada}\n`);
    }

    // Verificar el detalle
    console.log("🔍 Verificando detalle de la orden...");
    const detalleCheck = await client.query(
      `SELECT doc.DetalleOC_ID, doc.ProductoID, doc.VarianteID, 
              doc.CantidadSolicitada, doc.CantidadRecibida, doc.TamanoID,
              p.NombreProducto, pv.SKU
       FROM DetallesOrdenCompra doc
       INNER JOIN Productos p ON p.ProductoID = doc.ProductoID
       INNER JOIN Producto_Variantes pv ON pv.VarianteID = doc.VarianteID
       WHERE doc.DetalleOC_ID = $1`,
      [resultado.detalleOrdenID]
    );

    if (detalleCheck.rows.length > 0) {
      const detalle = detalleCheck.rows[0];
      console.log(`   ✅ Detalle #${detalle.detalleoc_id}`);
      console.log(`   - Producto: ${detalle.nombreproducto}`);
      console.log(`   - SKU: ${detalle.sku}`);
      console.log(`   - Cantidad solicitada: ${detalle.cantidadsolicitada}`);
      console.log(`   - Cantidad recibida: ${detalle.cantidadrecibida}`);
      console.log(`   - TamañoID: ${detalle.tamanoid || "NULL"}\n`);
    }

    // ROLLBACK para no afectar la BD (cambiar a COMMIT si quieres guardar)
    console.log("⏪ Haciendo ROLLBACK (la prueba no afectará la BD)...");
    await client.query("ROLLBACK");

    console.log("\n✅ Prueba completada exitosamente!");
    console.log(
      "💡 Si quieres guardar los cambios, cambia ROLLBACK por COMMIT\n"
    );
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("\n❌ Error en la prueba:");
    console.error(error.message);
    console.error("\n📋 Stack trace:");
    console.error(error.stack);
  } finally {
    client.release();
    process.exit(0);
  }
}

// Ejecutar prueba
testBackorder();
