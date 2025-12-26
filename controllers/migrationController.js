const db = require("../db");

/**
 * Sincroniza imágenes de variantes por color
 * Para cada producto, busca variantes con el mismo color y propaga la imagen
 * de la primera variante que tenga imagen a todas las hermanas sin imagen
 */
const sincronizarImagenesPorColor = async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    await client.query("BEGIN");

    console.log("🔄 Iniciando sincronización de imágenes por color...");

    // 1. Obtener todos los productos con variantes que tienen color
    const productosResult = await client.query(`
      SELECT DISTINCT productoid 
      FROM producto_variantes 
      WHERE color_nombre IS NOT NULL 
      AND TRIM(color_nombre) != ''
      ORDER BY productoid
    `);

    let totalProductos = 0;
    let totalVariantesActualizadas = 0;
    const detalles = [];

    for (const prod of productosResult.rows) {
      const productoid = prod.productoid;

      // 2. Para cada producto, obtener los colores únicos
      const coloresResult = await client.query(`
        SELECT DISTINCT color_nombre 
        FROM producto_variantes 
        WHERE productoid = $1 
        AND color_nombre IS NOT NULL 
        AND TRIM(color_nombre) != ''
      `, [productoid]);

      for (const colorRow of coloresResult.rows) {
        const colorNombre = colorRow.color_nombre;

        // 3. Buscar la primera variante con imagen para este color
        const varianteConImagenResult = await client.query(`
          SELECT varianteid, url_imagen_variante 
          FROM producto_variantes 
          WHERE productoid = $1 
          AND color_nombre = $2 
          AND url_imagen_variante IS NOT NULL 
          AND TRIM(url_imagen_variante) != ''
          ORDER BY varianteid ASC 
          LIMIT 1
        `, [productoid, colorNombre]);

        if (varianteConImagenResult.rows.length === 0) {
          // No hay ninguna variante con imagen para este color, skip
          continue;
        }

        const imagenReferencia = varianteConImagenResult.rows[0].url_imagen_variante;
        const varianteidReferencia = varianteConImagenResult.rows[0].varianteid;

        // 4. Actualizar todas las variantes hermanas sin imagen
        const updateResult = await client.query(`
          UPDATE producto_variantes 
          SET url_imagen_variante = $1 
          WHERE productoid = $2 
          AND color_nombre = $3 
          AND (url_imagen_variante IS NULL OR TRIM(url_imagen_variante) = '')
          AND varianteid != $4
        `, [imagenReferencia, productoid, colorNombre, varianteidReferencia]);

        if (updateResult.rowCount > 0) {
          totalProductos++;
          totalVariantesActualizadas += updateResult.rowCount;
          
          detalles.push({
            productoid,
            color: colorNombre,
            variantesActualizadas: updateResult.rowCount,
            imagenPropagada: imagenReferencia
          });

          console.log(`✅ Producto ${productoid} - Color "${colorNombre}": ${updateResult.rowCount} variante(s) sincronizada(s)`);
        }
      }
    }

    await client.query("COMMIT");

    console.log(`🎉 Sincronización completada: ${totalVariantesActualizadas} variantes actualizadas en ${totalProductos} producto(s)`);

    return res.json({
      success: true,
      message: `Sincronización completada exitosamente`,
      data: {
        totalProductos,
        totalVariantesActualizadas,
        detalles
      }
    });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Error en sincronización de imágenes:", error);
    
    return res.status(500).json({
      success: false,
      message: "Error al sincronizar imágenes por color",
      error: error.message
    });
  } finally {
    client.release();
  }
};

module.exports = {
  sincronizarImagenesPorColor
};
