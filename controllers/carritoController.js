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
        ic.itemid,
        ic.varianteid,
        ic.cantidadpaquetes,
        pv.sku,
        pv.dimensiones,
        pv.piezasporpaquete,
        pv.preciopaquete,
        pv.stock,
        p.productoid,
        p.nombreproducto,
        p.descripcion,
        p.categoriaid,
        c.nombre AS categorianombre,
        c.descripcion AS categoriadescripcion,
        imagen.url_imagen,
        imagen.textoalternativo,
        (ic.cantidadpaquetes * pv.preciopaquete) AS subtotal
      FROM itemsdelcarrito ic
      INNER JOIN producto_variantes pv ON pv.varianteid = ic.varianteid
      INNER JOIN productos p ON p.productoid = pv.productoid
      LEFT JOIN categorias c ON p.categoriaid = c.categoriaid
      LEFT JOIN LATERAL (
        SELECT
          pi.url_imagen,
          pi.textoalternativo
        FROM producto_imagenes pi
        WHERE pi.varianteid = pv.varianteid
        ORDER BY pi.orden ASC NULLS LAST, pi.imagenid ASC
        LIMIT 1
      ) imagen ON TRUE
      WHERE ic.carritoid = $1
      ORDER BY ic.itemid DESC
    `;

    const itemsResult = await db.query(itemsQuery, [carritoId]);

    const montoTotal = itemsResult.rows.reduce((total, item) => {
      const subtotal = item.subtotal !== null ? parseFloat(item.subtotal) : 0;
      return total + subtotal;
    }, 0);

    const items = itemsResult.rows.map(item => {
      const precioPaquete = item.preciopaquete !== null ? parseFloat(item.preciopaquete) : null;
      const subtotal = item.subtotal !== null ? parseFloat(item.subtotal) : null;
      const piezasPorPaquete = item.piezasporpaquete !== null ? parseInt(item.piezasporpaquete, 10) : null;
      const stock = item.stock !== null ? parseInt(item.stock, 10) : null;

      return {
        itemId: item.itemid,
        varianteId: item.varianteid,
        producto: {
          productoId: item.productoid,
          nombreProducto: item.nombreproducto,
          descripcion: item.descripcion,
          categoria: item.categoriaid ? {
            categoriaId: item.categoriaid,
            nombre: item.categorianombre,
            descripcion: item.categoriadescripcion
          } : null
        },
        sku: item.sku,
        cantidadPaquetes: item.cantidadpaquetes,
        piezasPorPaquete,
        precioPaquete,
        precioPorPieza: precioPaquete !== null && piezasPorPaquete
          ? parseFloat((precioPaquete / piezasPorPaquete).toFixed(2))
          : null,
        stock,
        dimensiones: item.dimensiones,
        subtotal,
        imagenPrincipal: item.url_imagen ? {
          url: item.url_imagen,
          alt: item.textoalternativo
        } : null
      };
    });

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
    const { VarianteID, CantidadPaquetes } = req.body;

    if (!VarianteID || !CantidadPaquetes) {
      return res.status(400).json({
        success: false,
        message: 'VarianteID y CantidadPaquetes son requeridos'
      });
    }

    const varianteId = parseInt(VarianteID, 10);

    if (Number.isNaN(varianteId)) {
      return res.status(400).json({
        success: false,
        message: 'VarianteID inválido'
      });
    }

    if (CantidadPaquetes <= 0) {
      return res.status(400).json({
        success: false,
        message: 'La cantidad de paquetes debe ser mayor a 0'
      });
    }

    const varianteResult = await db.query(
      `SELECT
         pv.varianteid,
         pv.productoid,
         pv.sku,
         pv.piezasporpaquete,
         pv.preciopaquete,
         pv.stock,
         p.nombreproducto
       FROM producto_variantes pv
       INNER JOIN productos p ON p.productoid = pv.productoid
       WHERE pv.varianteid = $1`,
      [varianteId]
    );

    if (varianteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Variante no encontrada'
      });
    }

    const variante = varianteResult.rows[0];
    const stockDisponible = variante.stock !== null ? parseInt(variante.stock, 10) : 0;

    if (stockDisponible < CantidadPaquetes) {
      return res.status(400).json({
        success: false,
        message: `Stock insuficiente. Disponible: ${stockDisponible} paquetes`
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

    // Verificar si la variante ya está en el carrito
    const itemExistente = await db.query(
      'SELECT ItemID, CantidadPaquetes FROM ItemsDelCarrito WHERE CarritoID = $1 AND VarianteID = $2',
      [carritoId, varianteId]
    );

    let itemResult;
    if (itemExistente.rows.length > 0) {
      // Actualizar cantidad
      const nuevaCantidad = itemExistente.rows[0].cantidadpaquetes + CantidadPaquetes;
      
      if (stockDisponible < nuevaCantidad) {
        return res.status(400).json({
          success: false,
          message: `Stock insuficiente. Ya tienes ${itemExistente.rows[0].cantidadpaquetes} en el carrito. Disponible: ${stockDisponible} paquetes`
        });
      }

      itemResult = await db.query(
        'UPDATE ItemsDelCarrito SET CantidadPaquetes = $1 WHERE ItemID = $2 RETURNING ItemID, VarianteID, CantidadPaquetes',
        [nuevaCantidad, itemExistente.rows[0].itemid]
      );
    } else {
      // Insertar nuevo item
      itemResult = await db.query(
        'INSERT INTO ItemsDelCarrito (CarritoID, VarianteID, CantidadPaquetes) VALUES ($1, $2, $3) RETURNING ItemID, VarianteID, CantidadPaquetes',
        [carritoId, varianteId, CantidadPaquetes]
      );
    }

    const item = itemResult.rows[0];
    const precioPaquete = variante.preciopaquete !== null ? parseFloat(variante.preciopaquete) : null;

    res.status(200).json({
      success: true,
      message: 'Variante agregada al carrito exitosamente',
      data: {
        item: {
          itemId: item.itemid,
          varianteId: item.varianteid,
          productoId: variante.productoid,
          nombreProducto: variante.nombreproducto,
          sku: variante.sku,
          cantidadPaquetes: item.cantidadpaquetes,
          precioPaquete,
          subtotal: precioPaquete !== null
            ? parseFloat((item.cantidadpaquetes * precioPaquete).toFixed(2))
            : null
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

/**
 * Actualizar cantidad de un producto en el carrito
 * PUT /api/carrito/:varianteId
 */
const actualizarCarrito = async (req, res) => {
  try {
    const clienteId = req.user.userId;
    const varianteId = parseInt(req.params.varianteId);
    const { CantidadPaquetes } = req.body;

    // Validar datos de entrada
    if (!CantidadPaquetes || CantidadPaquetes <= 0 || Number.isNaN(varianteId)) {
      return res.status(400).json({
        success: false,
        message: 'La cantidad debe ser mayor a 0 y VarianteID debe ser válido'
      });
    }

    const varianteResult = await db.query(
      `SELECT
         pv.varianteid,
         pv.productoid,
         pv.preciopaquete,
         pv.stock,
         pv.sku,
         p.nombreproducto
       FROM producto_variantes pv
       INNER JOIN productos p ON p.productoid = pv.productoid
       WHERE pv.varianteid = $1`,
      [varianteId]
    );

    if (varianteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Variante no encontrada'
      });
    }

    const variante = varianteResult.rows[0];

    const stockDisponible = variante.stock !== null ? parseInt(variante.stock, 10) : 0;

    if (stockDisponible < CantidadPaquetes) {
      return res.status(400).json({
        success: false,
        message: `Stock insuficiente. Disponible: ${stockDisponible} paquetes`
      });
    }

    // Obtener el carrito del cliente
    const carritoResult = await db.query(
      'SELECT CarritoID FROM CarritoDeCompra WHERE ClienteID = $1',
      [clienteId]
    );

    if (carritoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Carrito no encontrado'
      });
    }

    const carritoId = carritoResult.rows[0].carritoid;

    // Actualizar la cantidad del item
    const updateResult = await db.query(
      'UPDATE ItemsDelCarrito SET CantidadPaquetes = $1 WHERE CarritoID = $2 AND VarianteID = $3 RETURNING ItemID, VarianteID, CantidadPaquetes',
      [CantidadPaquetes, carritoId, varianteId]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Variante no encontrada en el carrito'
      });
    }

    // Actualizar última modificación del carrito
    await db.query(
      'UPDATE CarritoDeCompra SET UltimaModificacion = NOW() WHERE CarritoID = $1',
      [carritoId]
    );

    const item = updateResult.rows[0];

    res.status(200).json({
      success: true,
      message: 'Cantidad actualizada exitosamente',
      data: {
        item: {
          itemId: item.itemid,
          varianteId: item.varianteid,
          productoId: variante.productoid,
          nombreProducto: variante.nombreproducto,
          sku: variante.sku,
          cantidadPaquetes: item.cantidadpaquetes,
          precioPaquete: variante.preciopaquete !== null ? parseFloat(variante.preciopaquete) : null,
          subtotal: variante.preciopaquete !== null
            ? parseFloat((item.cantidadpaquetes * parseFloat(variante.preciopaquete)).toFixed(2))
            : null
        }
      }
    });

  } catch (error) {
    console.error('Error al actualizar carrito:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar cantidad',
      error: error.message
    });
  }
};

/**
 * Eliminar un producto del carrito
 * DELETE /api/carrito/:productoId
 */
const eliminarDelCarrito = async (req, res) => {
  try {
    const clienteId = req.user.userId;
    const varianteId = parseInt(req.params.varianteId);

    if (Number.isNaN(varianteId)) {
      return res.status(400).json({
        success: false,
        message: 'VarianteID inválido'
      });
    }

    // Obtener el carrito del cliente
    const carritoResult = await db.query(
      'SELECT CarritoID FROM CarritoDeCompra WHERE ClienteID = $1',
      [clienteId]
    );

    if (carritoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Carrito no encontrado'
      });
    }

    const carritoId = carritoResult.rows[0].carritoid;

    // Eliminar el item del carrito
    const deleteResult = await db.query(
      'DELETE FROM ItemsDelCarrito WHERE CarritoID = $1 AND VarianteID = $2 RETURNING ItemID',
      [carritoId, varianteId]
    );

    if (deleteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Variante no encontrada en el carrito'
      });
    }

    // Actualizar última modificación del carrito
    await db.query(
      'UPDATE CarritoDeCompra SET UltimaModificacion = NOW() WHERE CarritoID = $1',
      [carritoId]
    );

    res.status(200).json({
      success: true,
      message: 'Producto eliminado del carrito exitosamente'
    });

  } catch (error) {
    console.error('Error al eliminar del carrito:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar producto del carrito',
      error: error.message
    });
  }
};

module.exports = {
  obtenerCarrito,
  agregarAlCarrito,
  actualizarCarrito,
  eliminarDelCarrito
};
