const db = require('../db');

/**
 * Obtener todos los productos con imagen principal
 * GET /api/productos
 */
const obtenerProductos = async (req, res) => {
  try {
    const { search, precioMin, precioMax, dimension, stock } = req.query;

    const filtros = [];
    const valores = [];

    if (search) {
      valores.push(`%${search}%`);
      filtros.push(`(p.NombreProducto ILIKE $${valores.length} OR p.SKU ILIKE $${valores.length})`);
    }

    if (precioMin && precioMax) {
      valores.push(precioMin);
      filtros.push(`p.PrecioPaquete >= $${valores.length}`);
      valores.push(precioMax);
      filtros.push(`p.PrecioPaquete <= $${valores.length}`);
    } else if (precioMin) {
      valores.push(precioMin);
      filtros.push(`p.PrecioPaquete >= $${valores.length}`);
    } else if (precioMax) {
      valores.push(precioMax);
      filtros.push(`p.PrecioPaquete <= $${valores.length}`);
    }

    if (dimension) {
      valores.push(`%${dimension}%`);
      filtros.push(`p.Dimensiones ILIKE $${valores.length}`);
    }

    if (stock === 'true') {
      filtros.push('p.Stock > 0');
    }

    let whereClause = '';
    if (filtros.length > 0) {
      whereClause = `WHERE ${filtros.join(' AND ')}`;
    }

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
      ${whereClause}
      ORDER BY p.ProductoID DESC
    `;

    const result = await db.query(query, valores);

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
 * Obtener lista de dimensiones únicas
 * GET /api/productos/dimensiones
 */
const obtenerDimensiones = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT DISTINCT TRIM(Dimensiones) as dimension
       FROM Productos
       WHERE Dimensiones IS NOT NULL AND Dimensiones <> ''
       ORDER BY dimension ASC`
    );

    const dimensiones = result.rows.map(row => row.dimension);

    res.status(200).json({
      success: true,
      message: 'Dimensiones obtenidas exitosamente',
      data: {
        dimensiones,
        total: dimensiones.length
      }
    });
  } catch (error) {
    console.error('Error al obtener dimensiones:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener las dimensiones',
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

/**
 * Obtener todas las categorías
 * GET /api/categorias
 */
const obtenerCategorias = async (req, res) => {
  try {
    const query = `
      SELECT 
        categoriaid,
        nombre,
        descripcion
      FROM categorias
      ORDER BY nombre ASC
    `;

    const result = await db.query(query);

    // Formatear la respuesta
    const categorias = result.rows.map(row => ({
      categoriaId: row.categoriaid,
      nombre: row.nombre,
      descripcion: row.descripcion
    }));

    res.status(200).json({
      success: true,
      message: 'Categorías obtenidas exitosamente',
      data: {
        categorias,
        total: categorias.length
      }
    });

  } catch (error) {
    console.error('Error al obtener categorías:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener las categorías',
      error: error.message
    });
  }
};

/**
 * Obtener lista pública de agentes activos
 * GET /api/agentes/lista-publica
 */
const obtenerAgentesPublicos = async (req, res) => {
  try {
    const query = `
      SELECT 
        agenteid,
        codigoagente,
        nombre,
        apellido
      FROM agentesdeventas
      WHERE activo = true
      ORDER BY codigoagente ASC
    `;

    const result = await db.query(query);

    // Formatear la respuesta
    const agentes = result.rows.map(row => ({
      agenteId: row.agenteid,
      codigoAgente: row.codigoagente,
      nombre: row.nombre,
      apellido: row.apellido
    }));

    res.status(200).json({
      success: true,
      message: 'Agentes obtenidos exitosamente',
      data: {
        agentes,
        total: agentes.length
      }
    });

  } catch (error) {
    console.error('Error al obtener agentes públicos:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener la lista de agentes',
      error: error.message
    });
  }
};

module.exports = {
  obtenerProductos,
  obtenerProductoPorId,
  obtenerCategorias,
  obtenerAgentesPublicos,
  obtenerDimensiones
};
