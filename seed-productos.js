const db = require('./db');

async function seedProductos() {
  try {
    console.log('📦 Insertando productos de ejemplo...\n');

    // Primero verificar que haya categorías
    const categorias = await db.query('SELECT * FROM Categorias ORDER BY CategoriaID');
    
    if (categorias.rows.length === 0) {
      console.log('⚠️  No hay categorías. Creando categorías primero...');
      await db.query(`
        INSERT INTO Categorias (Nombre, Descripcion) VALUES
        ('Ropa Dama', 'Blusas, vestidos, pantalones para mujer'),
        ('Ropa Caballero', 'Camisas, pantalones, playeras para hombre'),
        ('Accesorios', 'Bolsas, cinturones, joyería'),
        ('Calzado', 'Zapatos, tenis, sandalias'),
        ('Infantil', 'Ropa y accesorios para niños')
        ON CONFLICT DO NOTHING
      `);
      console.log('✅ Categorías creadas\n');
    }

    // Obtener IDs de categorías
    const cats = await db.query('SELECT CategoriaID, Nombre FROM Categorias');
    const categoriaMap = {};
    cats.rows.forEach(cat => {
      categoriaMap[cat.nombre] = cat.categoriaid;
    });

    // Productos de ejemplo
    const productos = [
      {
        sku: 'CAJA-BLUSA-001',
        nombre: 'Caja de Blusas Fashion Dama',
        descripcion: 'Caja con 24 blusas de moda variadas en diferentes colores y tallas. Incluye estilos casual y elegante.',
        costoUnitario: 45.00,
        piezasPorPaquete: 24,
        precioPaquete: 1320.00,
        stock: 50,
        categoriaId: categoriaMap['Ropa Dama'] || 1,
        imagenUrl: 'https://images.unsplash.com/photo-1485968579580-b6d095142e6e?w=400'
      },
      {
        sku: 'CAJA-VESTIDO-001',
        nombre: 'Caja de Vestidos Casuales',
        descripcion: 'Paquete con 12 vestidos casuales de diferentes estilos y colores. Tallas S-XL.',
        costoUnitario: 85.00,
        piezasPorPaquete: 12,
        precioPaquete: 1380.00,
        stock: 35,
        categoriaId: categoriaMap['Ropa Dama'] || 1,
        imagenUrl: 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=400'
      },
      {
        sku: 'CAJA-CAMISA-H001',
        nombre: 'Caja de Camisas Caballero',
        descripcion: 'Caja con 18 camisas de vestir y casual para hombre. Colores sólidos y estampados.',
        costoUnitario: 55.00,
        piezasPorPaquete: 18,
        precioPaquete: 1260.00,
        stock: 40,
        categoriaId: categoriaMap['Ropa Caballero'] || 2,
        imagenUrl: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=400'
      },
      {
        sku: 'CAJA-PLAYERA-001',
        nombre: 'Caja de Playeras Premium',
        descripcion: 'Paquete con 30 playeras de algodón 100%. Variedad de colores y diseños modernos.',
        costoUnitario: 35.00,
        piezasPorPaquete: 30,
        precioPaquete: 1350.00,
        stock: 75,
        categoriaId: categoriaMap['Ropa Caballero'] || 2,
        imagenUrl: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400'
      },
      {
        sku: 'CAJA-BOLSA-001',
        nombre: 'Caja de Bolsas de Mano',
        descripcion: 'Caja con 15 bolsas de mano fashion. Diferentes estilos: clutch, crossbody, tote.',
        costoUnitario: 65.00,
        piezasPorPaquete: 15,
        precioPaquete: 1350.00,
        stock: 28,
        categoriaId: categoriaMap['Accesorios'] || 3,
        imagenUrl: 'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=400'
      },
      {
        sku: 'CAJA-CINTURON-001',
        nombre: 'Caja de Cinturones Fashion',
        descripcion: 'Paquete con 20 cinturones variados para dama y caballero. Incluye estilos casual y formal.',
        costoUnitario: 28.00,
        piezasPorPaquete: 20,
        precioPaquete: 840.00,
        stock: 60,
        categoriaId: categoriaMap['Accesorios'] || 3,
        imagenUrl: 'https://images.unsplash.com/photo-1624222247344-550fb60583bb?w=400'
      },
      {
        sku: 'CAJA-TENIS-001',
        nombre: 'Caja de Tenis Deportivos',
        descripcion: 'Caja con 12 pares de tenis deportivos. Varios modelos y tallas disponibles.',
        costoUnitario: 120.00,
        piezasPorPaquete: 12,
        precioPaquete: 1920.00,
        stock: 20,
        categoriaId: categoriaMap['Calzado'] || 4,
        imagenUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400'
      },
      {
        sku: 'CAJA-SANDALIAS-001',
        nombre: 'Caja de Sandalias Dama',
        descripcion: 'Paquete con 18 pares de sandalias para mujer. Estilos casual y elegante.',
        costoUnitario: 45.00,
        piezasPorPaquete: 18,
        precioPaquete: 1170.00,
        stock: 32,
        categoriaId: categoriaMap['Calzado'] || 4,
        imagenUrl: 'https://images.unsplash.com/photo-1603487742131-4160ec999306?w=400'
      },
      {
        sku: 'CAJA-INFANTIL-001',
        nombre: 'Caja de Ropa Infantil Mixta',
        descripcion: 'Caja con 25 prendas infantiles variadas. Tallas 2-8 años. Incluye playeras, shorts, vestidos.',
        costoUnitario: 32.00,
        piezasPorPaquete: 25,
        precioPaquete: 1200.00,
        stock: 45,
        categoriaId: categoriaMap['Infantil'] || 5,
        imagenUrl: 'https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?w=400'
      },
      {
        sku: 'CAJA-JEANS-D001',
        nombre: 'Caja de Jeans Dama',
        descripcion: 'Paquete con 12 jeans para mujer. Diferentes cortes: skinny, boyfriend, wide leg.',
        costoUnitario: 95.00,
        piezasPorPaquete: 12,
        precioPaquete: 1560.00,
        stock: 25,
        categoriaId: categoriaMap['Ropa Dama'] || 1,
        imagenUrl: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=400'
      },
      {
        sku: 'CAJA-JOYERIA-001',
        nombre: 'Caja de Joyería Fashion',
        descripcion: 'Caja con 40 piezas de joyería fashion: aretes, collares, pulseras, anillos.',
        costoUnitario: 15.00,
        piezasPorPaquete: 40,
        precioPaquete: 960.00,
        stock: 55,
        categoriaId: categoriaMap['Accesorios'] || 3,
        imagenUrl: 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=400'
      },
      {
        sku: 'CAJA-SHORTS-001',
        nombre: 'Caja de Shorts Casuales',
        descripcion: 'Paquete con 20 shorts casuales para dama y caballero. Diferentes estilos y colores.',
        costoUnitario: 38.00,
        piezasPorPaquete: 20,
        precioPaquete: 1140.00,
        stock: 42,
        categoriaId: categoriaMap['Ropa Dama'] || 1,
        imagenUrl: 'https://images.unsplash.com/photo-1591195853828-11db59a44f6b?w=400'
      },
      {
        sku: 'CAJA-PANTALON-H001',
        nombre: 'Caja de Pantalones Caballero',
        descripcion: 'Caja con 15 pantalones de vestir y casual para hombre. Colores clásicos.',
        costoUnitario: 72.00,
        piezasPorPaquete: 15,
        precioPaquete: 1440.00,
        stock: 30,
        categoriaId: categoriaMap['Ropa Caballero'] || 2,
        imagenUrl: 'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=400'
      },
      {
        sku: 'CAJA-SUDADERA-001',
        nombre: 'Caja de Sudaderas Unisex',
        descripcion: 'Paquete con 18 sudaderas con y sin capucha. Colores variados y diseños modernos.',
        costoUnitario: 58.00,
        piezasPorPaquete: 18,
        precioPaquete: 1440.00,
        stock: 38,
        categoriaId: categoriaMap['Ropa Caballero'] || 2,
        imagenUrl: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=400'
      },
      {
        sku: 'CAJA-LENTES-001',
        nombre: 'Caja de Lentes de Sol',
        descripcion: 'Caja con 24 lentes de sol fashion. Diferentes estilos y colores de moda.',
        costoUnitario: 22.00,
        piezasPorPaquete: 24,
        precioPaquete: 840.00,
        stock: 5,  // Stock bajo para probar alertas
        categoriaId: categoriaMap['Accesorios'] || 3,
        imagenUrl: 'https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=400'
      }
    ];

    // Obtener admin ID para el log de inventario
    const adminResult = await db.query('SELECT AdminID FROM Administradores LIMIT 1');
    const adminId = adminResult.rows[0]?.adminid || 1;

    // Insertar productos
    let insertados = 0;
    let actualizados = 0;

    for (const producto of productos) {
      // Verificar si el SKU ya existe
      const existing = await db.query(
        'SELECT ProductoID FROM Productos WHERE SKU = $1',
        [producto.sku]
      );

      if (existing.rows.length > 0) {
        console.log(`⚠️  ${producto.sku} ya existe, actualizando stock...`);
        
        // Actualizar stock existente
        await db.query(
          `UPDATE Productos 
           SET Stock = Stock + $1 
           WHERE SKU = $2`,
          [producto.stock, producto.sku]
        );
        
        actualizados++;
      } else {
        // Insertar nuevo producto
        const result = await db.query(
          `INSERT INTO Productos 
            (SKU, NombreProducto, Descripcion, CostoUnitario, PiezasPorPaquete, PrecioPaquete, Stock, CategoriaID)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING ProductoID`,
          [
            producto.sku,
            producto.nombre,
            producto.descripcion,
            producto.costoUnitario,
            producto.piezasPorPaquete,
            producto.precioPaquete,
            producto.stock,
            producto.categoriaId
          ]
        );

        const productoId = result.rows[0].productoid;

        // Registrar en log de inventario
        await db.query(
          `INSERT INTO Log_Inventario (ProductoID, CantidadCambiado, NuevoStock, Motivo, UsuarioID)
           VALUES ($1, $2, $3, 'Stock inicial - Datos de ejemplo', $4)`,
          [productoId, producto.stock, producto.stock, adminId]
        );

        console.log(`✅ ${producto.nombre} - Stock: ${producto.stock} paquetes`);
        insertados++;
      }
    }

    console.log(`\n📊 Resumen:`);
    console.log(`   ✅ Productos insertados: ${insertados}`);
    console.log(`   🔄 Productos actualizados: ${actualizados}`);
    console.log(`   📦 Total productos en catálogo: ${insertados + actualizados}`);
    console.log(`\n✅ ¡Productos agregados exitosamente!`);
    console.log(`\n🌐 Puedes verlos en:`);
    console.log(`   - Dashboard: http://localhost:3000/admin-dashboard.html`);
    console.log(`   - Productos: http://localhost:3000/admin-agregar-producto.html`);
    console.log(`   - Inventario: http://localhost:3000/admin-inventario.html`);
    console.log(`   - Catálogo público: http://localhost:3000/catalogo.html\n`);

    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

seedProductos();
