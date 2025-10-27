const db = require('../db');

/**
 * Obtener todos los productos con imagen principal
 * GET /api/productos
 */
const obtenerProductos = async (req, res) => {
  try {
    const query = `
      SELECT 
        p.ProductoID,
        p.SKU,
        p.NombreProducto,
        p.Descripcion,
        p.Dimensiones,
        p.PiezasPorPaquete,
        p.PrecioPaquete,
        p.Stock,
        p.CategoriaID,
        c.Nombre as CategoriaNombre,
        pi.URL_Imagen,
        pi.TextoAlternativo
      FROM Productos p
      LEFT JOIN Categorias c ON p.CategoriaID = c.CategoriaID
      LEFT JOIN Producto_Imagenes pi ON p.ProductoID = pi.ProductoID AND pi.Orden = 0
      ORDER BY p.ProductoID DESC
    `;

    const result = await db.query(query);

    // Formatear la respuesta
    const productos = result.rows.map(row => ({
      productoId: row.productoid,
      sku: row.sku,
      nombreProducto: row.nombreproducto,
      descripcion: row.descripcion,
      dimensiones: row.dimensiones,
      piezasPorPaquete: row.piezasporpaquete,
      precioPaquete: parseFloat(row.preciopaquete),
      stock: row.stock,
      categoria: row.categoriaid ? {
        categoriaId: row.categoriaid,
        nombre: row.categorianombre
      } : null,
      imagenPrincipal: row.url_imagen ? {
        url: row.url_imagen,
        alt: row.textoalternativo
      } : null
    }));

    res.status(200).json({
      success: true,
      message: 'Productos obtenidos exitosamente',
      data: {
        productos,
        total: productos.length
      }
    });

  } catch (error) {
    console.error('Error al obtener productos:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener los productos',
      error: error.message
    });
  }
};

/**
 * Obtener un producto por ID con todas sus imágenes
 * GET /api/productos/:id
 */
const obtenerProductoPorId = async (req, res) => {
  try {
    const { id } = req.params;

    // Validar que el ID sea un número
    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: 'ID de producto inválido'
      });
    }

    // Obtener el producto
    const productoQuery = `
      SELECT 
        p.ProductoID,
        p.SKU,
        p.NombreProducto,
        p.Descripcion,
        p.Dimensiones,
        p.CostoUnitario,
        p.PiezasPorPaquete,
        p.PrecioPaquete,
        p.Stock,
        p.CategoriaID,
        c.Nombre as CategoriaNombre,
        c.Descripcion as CategoriaDescripcion
      FROM Productos p
      LEFT JOIN Categorias c ON p.CategoriaID = c.CategoriaID
      WHERE p.ProductoID = $1
    `;

    const productoResult = await db.query(productoQuery, [id]);

    if (productoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Producto no encontrado'
      });
    }

    const producto = productoResult.rows[0];

    // Obtener todas las imágenes del producto
    const imagenesQuery = `
      SELECT 
        ImagenID,
        URL_Imagen,
        TextoAlternativo,
        Orden
      FROM Producto_Imagenes
      WHERE ProductoID = $1
      ORDER BY Orden ASC
    `;

    const imagenesResult = await db.query(imagenesQuery, [id]);

    // Formatear la respuesta
    const productoDetalle = {
      productoId: producto.productoid,
      sku: producto.sku,
      nombreProducto: producto.nombreproducto,
      descripcion: producto.descripcion,
      dimensiones: producto.dimensiones,
      costoUnitario: parseFloat(producto.costounitario),
      piezasPorPaquete: producto.piezasporpaquete,
      precioPaquete: parseFloat(producto.preciopaquete),
      precioPorPieza: parseFloat((producto.preciopaquete / producto.piezasporpaquete).toFixed(2)),
      stock: producto.stock,
      categoria: producto.categoriaid ? {
        categoriaId: producto.categoriaid,
        nombre: producto.categorianombre,
        descripcion: producto.categoriadescripcion
      } : null,
      imagenes: imagenesResult.rows.map(img => ({
        imagenId: img.imagenid,
        url: img.url_imagen,
        alt: img.textoalternativo,
        orden: img.orden
      }))
    };

    res.status(200).json({
      success: true,
      message: 'Producto obtenido exitosamente',
      data: {
        producto: productoDetalle
      }
    });

  } catch (error) {
    console.error('Error al obtener producto:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener el producto',
      error: error.message
    });
  }
};

module.exports = {
  obtenerProductos,
  obtenerProductoPorId
};
