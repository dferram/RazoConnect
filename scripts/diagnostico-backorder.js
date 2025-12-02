/**
 * Script de diagnóstico para el sistema de Backorder
 * Verifica que los productos tengan proveedores asignados
 *
 * Ejecutar: node scripts/diagnostico-backorder.js
 */

const db = require("../db");

async function diagnosticarBackorder() {
  try {
    console.log("🔍 Diagnóstico del Sistema de Backorder\n");
    console.log("=".repeat(60));

    // 1. Verificar productos sin proveedor
    console.log("\n📦 1. Verificando productos sin proveedor...\n");
    const productosSinProveedor = await db.query(`
      SELECT 
        p.ProductoID,
        p.NombreProducto,
        p.ProveedorID_Default,
        COUNT(pv.VarianteID) as TotalVariantes
      FROM Productos p
      LEFT JOIN Producto_Variantes pv ON pv.ProductoID = p.ProductoID
      WHERE p.ProveedorID_Default IS NULL
      GROUP BY p.ProductoID, p.NombreProducto, p.ProveedorID_Default
      ORDER BY p.ProductoID
    `);

    if (productosSinProveedor.rows.length === 0) {
      console.log("   ✅ Todos los productos tienen proveedor asignado");
    } else {
      console.log(
        `   ⚠️  ${productosSinProveedor.rows.length} producto(s) sin proveedor:\n`
      );
      productosSinProveedor.rows.forEach((p) => {
        console.log(`      • Producto #${p.productoid}: ${p.nombreproducto}`);
        console.log(`        Variantes afectadas: ${p.totalvariantes}`);
      });
      console.log(
        "\n   ❌ ACCIÓN REQUERIDA: Asignar proveedores a estos productos"
      );
      console.log("   📝 SQL de ejemplo:");
      console.log(
        "      UPDATE Productos SET ProveedorID_Default = [ID_PROVEEDOR] WHERE ProductoID = [ID];"
      );
    }

    // 2. Verificar proveedores disponibles
    console.log("\n\n🏭 2. Proveedores disponibles:\n");
    const proveedores = await db.query(`
      SELECT 
        pr.ProveedorID,
        pr.NombreEmpresa,
        pr.ContactoNombre,
        pr.Email,
        pr.Telefono,
        COUNT(p.ProductoID) as ProductosAsignados
      FROM Proveedores pr
      LEFT JOIN Productos p ON p.ProveedorID_Default = pr.ProveedorID
      GROUP BY pr.ProveedorID, pr.NombreEmpresa, pr.ContactoNombre, pr.Email, pr.Telefono
      ORDER BY pr.ProveedorID
    `);

    if (proveedores.rows.length === 0) {
      console.log("   ⚠️  No hay proveedores registrados");
      console.log("   ❌ ACCIÓN REQUERIDA: Crear al menos un proveedor");
    } else {
      proveedores.rows.forEach((prov) => {
        console.log(`   • #${prov.proveedorid}: ${prov.nombreempresa}`);
        console.log(
          `     Contacto: ${prov.contactonombre || "No especificado"}`
        );
        console.log(`     Email: ${prov.email || "No especificado"}`);
        console.log(`     Productos asignados: ${prov.productosasignados}`);
        console.log("");
      });
    }

    // 3. Verificar variantes con stock bajo o cero
    console.log("\n📊 3. Variantes con stock <= 5 piezas:\n");
    const variantesStockBajo = await db.query(`
      SELECT 
        pv.VarianteID,
        pv.SKU,
        pv.Stock,
        p.ProductoID,
        p.NombreProducto,
        p.ProveedorID_Default,
        pr.NombreEmpresa
      FROM Producto_Variantes pv
      INNER JOIN Productos p ON p.ProductoID = pv.ProductoID
      LEFT JOIN Proveedores pr ON pr.ProveedorID = p.ProveedorID_Default
      WHERE pv.Stock <= 5
      ORDER BY pv.Stock ASC, pv.VarianteID
      LIMIT 10
    `);

    if (variantesStockBajo.rows.length === 0) {
      console.log("   ✅ No hay variantes con stock bajo");
    } else {
      variantesStockBajo.rows.forEach((v) => {
        const stockIcon = v.stock === 0 ? "🔴" : v.stock <= 2 ? "🟠" : "🟡";
        console.log(`   ${stockIcon} SKU: ${v.sku} (${v.nombreproducto})`);
        console.log(`      Stock actual: ${v.stock} piezas`);
        console.log(
          `      Proveedor: ${v.nombreempresa || "❌ SIN PROVEEDOR"}`
        );
        if (!v.proveedorid_default) {
          console.log(
            `      ⚠️  No se puede generar backorder (sin proveedor)`
          );
        }
        console.log("");
      });
    }

    // 4. Verificar órdenes de compra pendientes
    console.log("\n📋 4. Órdenes de Compra Pendientes:\n");
    const ordenesPendientes = await db.query(`
      SELECT 
        oc.OrdenCompraID,
        oc.FechaCreacion,
        oc.FechaEntregaEsperada,
        pr.NombreEmpresa,
        COUNT(doc.DetalleOC_ID) as TotalItems,
        SUM(doc.CantidadSolicitada) as TotalSolicitado,
        SUM(doc.CantidadRecibida) as TotalRecibido
      FROM OrdenesDeCompra oc
      INNER JOIN Proveedores pr ON pr.ProveedorID = oc.ProveedorID
      LEFT JOIN DetallesOrdenCompra doc ON doc.OrdenCompraID = oc.OrdenCompraID
      WHERE oc.Estatus = 'Pendiente'
      GROUP BY oc.OrdenCompraID, oc.FechaCreacion, oc.FechaEntregaEsperada, pr.NombreEmpresa
      ORDER BY oc.FechaCreacion DESC
    `);

    if (ordenesPendientes.rows.length === 0) {
      console.log("   ℹ️  No hay órdenes de compra pendientes");
    } else {
      ordenesPendientes.rows.forEach((orden) => {
        console.log(`   • OC #${orden.ordencompraid} - ${orden.nombreempresa}`);
        console.log(
          `     Creada: ${new Date(orden.fechacreacion).toLocaleDateString()}`
        );
        console.log(
          `     Entrega esperada: ${new Date(
            orden.fechaentregaesperada
          ).toLocaleDateString()}`
        );
        console.log(
          `     Items: ${orden.totalitems || 0} | Solicitado: ${
            orden.totalsolicitado || 0
          } | Recibido: ${orden.totalrecibido || 0}`
        );
        console.log("");
      });
    }

    // 5. Instrucciones de prueba
    console.log("\n" + "=".repeat(60));
    console.log("\n🧪 CÓMO PROBAR EL SISTEMA DE BACKORDER:\n");
    console.log("1. Asegúrate de que el producto tenga un proveedor asignado");
    console.log("2. Verifica que el stock sea menor a la cantidad solicitada");
    console.log("3. Haz login como CLIENTE (no admin)");
    console.log("4. Agrega el producto al carrito");
    console.log("5. Completa el checkout");
    console.log("6. Revisa la consola del servidor para ver logs");
    console.log("7. Verifica en OrdenesDeCompra si se creó la orden\n");

    console.log("📝 SQL para verificar la orden creada:");
    console.log(`
    SELECT 
      oc.OrdenCompraID,
      oc.FechaCreacion,
      pr.NombreEmpresa,
      doc.CantidadSolicitada,
      p.NombreProducto,
      pv.SKU
    FROM OrdenesDeCompra oc
    INNER JOIN Proveedores pr ON pr.ProveedorID = oc.ProveedorID
    INNER JOIN DetallesOrdenCompra doc ON doc.OrdenCompraID = oc.OrdenCompraID
    INNER JOIN Producto_Variantes pv ON pv.VarianteID = doc.VarianteID
    INNER JOIN Productos p ON p.ProductoID = pv.ProductoID
    WHERE oc.Estatus = 'Pendiente'
    ORDER BY oc.FechaCreacion DESC
    LIMIT 5;
    `);

    console.log("\n" + "=".repeat(60));
    console.log("✅ Diagnóstico completado\n");
  } catch (error) {
    console.error("\n❌ Error en diagnóstico:", error.message);
    console.error(error.stack);
  } finally {
    process.exit(0);
  }
}

// Ejecutar diagnóstico
diagnosticarBackorder();
