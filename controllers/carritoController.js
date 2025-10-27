const db = require('../db');

/**
 * Obtener el carrito del cliente logueado
 * GET /api/carrito
 */
const obtenerCarrito = async (req, res) => {
  try {
    const clienteId = req.user.userId;

    // Obtener o crear el carrito del cliente
    let carritoResult = await db.query(
      'SELECT CarritoID FROM CarritoDeCompra WHERE ClienteID = $1',
      [clienteId]
    );

    // Si no existe carrito, crear uno nuevo
    if (carritoResult.rows.length === 0) {
      const nuevoCarrito = await db.query(
        'INSERT INTO CarritoDeCompra (ClienteID) VALUES ($1) RETURNING CarritoID',
        [clienteId]
      );
      carritoResult = nuevoCarrito;
    }

    const carritoId = carritoResult.rows[0].carritoid;

    // Obtener los items del carrito con información de productos
    const itemsQuery = `
      SELECT 
        ic.ItemID,
        ic.ProductoID,
        ic.CantidadPaquetes,
        p.SKU,
        p.NombreProducto,
        p.PiezasPorPaquete,
        p.PrecioPaquete,
        p.Stock,
        p.Dimensiones,
        pi.URL_Imagen,
        pi.TextoAlternativo,
        (ic.CantidadPaquetes * p.PrecioPaquete) as Subtotal
      FROM ItemsDelCarrito ic
      INNER JOIN Productos p ON ic.ProductoID = p.ProductoID
      LEFT JOIN Producto_Imagenes pi ON p.ProductoID = pi.ProductoID AND pi.Orden = 0
      WHERE ic.CarritoID = $1
      ORDER BY ic.ItemID DESC
    `;

    const itemsResult = await db.query(itemsQuery, [carritoId]);

    // Calcular el total del carrito
    const montoTotal = itemsResult.rows.reduce((total, item) => {
      return total + parseFloat(item.subtotal);
    }, 0);

    // Formatear respuesta
    const items = itemsResult.rows.map(item => ({
      itemId: item.itemid,
      productoId: item.productoid,
      sku: item.sku,
      nombreProducto: item.nombreproducto,
      cantidadPaquetes: item.cantidadpaquetes,
      piezasPorPaquete: item.piezasporpaquete,
      precioPaquete: parseFloat(item.preciopaquete),
      stock: item.stock,
      dimensiones: item.dimensiones,
      subtotal: parseFloat(item.subtotal),
      imagenPrincipal: item.url_imagen ? {
        url: item.url_imagen,
        alt: item.textoalternativo
      } : null
    }));

    res.status(200).json({
      success: true,
      message: 'Carrito obtenido exitosamente',
      data: {
        carritoId,
        items,
        totalItems: items.length,
        montoTotal: parseFloat(montoTotal.toFixed(2))
      }
    });

  } catch (error) {
    console.error('Error al obtener carrito:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener el carrito',
      error: error.message
    });
  }
};

/**
 * Añadir producto al carrito
 * POST /api/carrito
 */
const agregarAlCarrito = async (req, res) => {
  try {
    const clienteId = req.user.userId;
    const { ProductoID, CantidadPaquetes } = req.body;

    // Validar datos de entrada
    if (!ProductoID || !CantidadPaquetes) {
      return res.status(400).json({
        success: false,
        message: 'ProductoID y CantidadPaquetes son requeridos'
      });
    }

    if (CantidadPaquetes <= 0) {
      return res.status(400).json({
        success: false,
        message: 'La cantidad de paquetes debe ser mayor a 0'
      });
    }

    // Verificar que el producto existe y tiene stock suficiente
    const productoResult = await db.query(
      'SELECT ProductoID, NombreProducto, Stock, PrecioPaquete FROM Productos WHERE ProductoID = $1',
      [ProductoID]
    );

    if (productoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Producto no encontrado'
      });
    }

    const producto = productoResult.rows[0];

    if (producto.stock < CantidadPaquetes) {
      return res.status(400).json({
        success: false,
        message: `Stock insuficiente. Disponible: ${producto.stock} paquetes`
      });
    }

    // Obtener o crear el carrito del cliente
    let carritoResult = await db.query(
      'SELECT CarritoID FROM CarritoDeCompra WHERE ClienteID = $1',
      [clienteId]
    );

    let carritoId;
    if (carritoResult.rows.length === 0) {
      // Crear nuevo carrito
      const nuevoCarrito = await db.query(
        'INSERT INTO CarritoDeCompra (ClienteID, UltimaModificacion) VALUES ($1, NOW()) RETURNING CarritoID',
        [clienteId]
      );
      carritoId = nuevoCarrito.rows[0].carritoid;
    } else {
      carritoId = carritoResult.rows[0].carritoid;
      // Actualizar última modificación
      await db.query(
        'UPDATE CarritoDeCompra SET UltimaModificacion = NOW() WHERE CarritoID = $1',
        [carritoId]
      );
    }

    // Verificar si el producto ya está en el carrito
    const itemExistente = await db.query(
      'SELECT ItemID, CantidadPaquetes FROM ItemsDelCarrito WHERE CarritoID = $1 AND ProductoID = $2',
      [carritoId, ProductoID]
    );

    let itemResult;
    if (itemExistente.rows.length > 0) {
      // Actualizar cantidad
      const nuevaCantidad = itemExistente.rows[0].cantidadpaquetes + CantidadPaquetes;
      
      if (producto.stock < nuevaCantidad) {
        return res.status(400).json({
          success: false,
          message: `Stock insuficiente. Ya tienes ${itemExistente.rows[0].cantidadpaquetes} en el carrito. Disponible: ${producto.stock} paquetes`
        });
      }

      itemResult = await db.query(
        'UPDATE ItemsDelCarrito SET CantidadPaquetes = $1 WHERE ItemID = $2 RETURNING ItemID, ProductoID, CantidadPaquetes',
        [nuevaCantidad, itemExistente.rows[0].itemid]
      );
    } else {
      // Insertar nuevo item
      itemResult = await db.query(
        'INSERT INTO ItemsDelCarrito (CarritoID, ProductoID, CantidadPaquetes) VALUES ($1, $2, $3) RETURNING ItemID, ProductoID, CantidadPaquetes',
        [carritoId, ProductoID, CantidadPaquetes]
      );
    }

    const item = itemResult.rows[0];

    res.status(200).json({
      success: true,
      message: 'Producto agregado al carrito exitosamente',
      data: {
        item: {
          itemId: item.itemid,
          productoId: item.productoid,
          nombreProducto: producto.nombreproducto,
          cantidadPaquetes: item.cantidadpaquetes,
          precioPaquete: parseFloat(producto.preciopaquete),
          subtotal: parseFloat((item.cantidadpaquetes * producto.preciopaquete).toFixed(2))
        }
      }
    });

  } catch (error) {
    console.error('Error al agregar al carrito:', error);
    res.status(500).json({
      success: false,
      message: 'Error al agregar producto al carrito',
      error: error.message
    });
  }
};

module.exports = {
  obtenerCarrito,
  agregarAlCarrito
};
