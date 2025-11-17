const db = require("../db");

const validateAgregarAlCarritoInput = ({ VarianteID, Cantidad, TamanoID }) => {
  if (
    VarianteID === undefined ||
    Cantidad === undefined ||
    TamanoID === undefined
  ) {
    return {
      error: "VarianteID, Cantidad y TamanoID son requeridos",
    };
  }

  const varianteId = Number.parseInt(VarianteID, 10);
  const cantidad = Number(Cantidad);
  const tamanoId = Number.parseInt(TamanoID, 10);

  if (Number.isNaN(varianteId)) {
    return {
      error: "VarianteID inválido",
    };
  }

  if (Number.isNaN(tamanoId)) {
    return {
      error: "TamanoID inválido",
    };
  }

  if (!Number.isInteger(cantidad) || cantidad <= 0) {
    return {
      error: "La cantidad debe ser un número entero mayor a 0",
    };
  }

  return {
    data: {
      varianteId,
      cantidad: cantidad,
      tamanoId,
    },
  };
};

/**
 * Obtener el carrito del cliente logueado
 * GET /api/carrito
 */
const obtenerCarrito = async (req, res) => {
  try {
    const clienteId = req.user.userId;

    // Obtener o crear el carrito del cliente
    let carritoResult = await db.query(
      "SELECT CarritoID FROM CarritoDeCompra WHERE ClienteID = $1",
      [clienteId]
    );

    // Si no existe carrito, crear uno nuevo
    if (carritoResult.rows.length === 0) {
      const nuevoCarrito = await db.query(
        "INSERT INTO CarritoDeCompra (ClienteID) VALUES ($1) RETURNING CarritoID",
        [clienteId]
      );
      carritoResult = nuevoCarrito;
    }

    const carritoId = carritoResult.rows[0].carritoid;

    // Obtener los items del carrito con información de productos y tamaño seleccionado
    const itemsQuery = `
      SELECT
        ic.itemid,
        ic.varianteid,
        ic.cantidad,
        ic.tamanoid,
        pv.sku,
        pv.dimensiones,
        pv.preciounitario,
        pv.stock,
        p.productoid,
        p.nombreproducto,
        p.descripcion,
        p.categoriaid,
        c.nombre AS categorianombre,
        c.descripcion AS categoriadescripcion,
        t.cantidad AS tamano_valor,
        imagen.url_imagen,
        imagen.textoalternativo,
        (ic.cantidad * t.cantidad * pv.preciounitario) AS subtotal
      FROM itemsdelcarrito ic
      INNER JOIN producto_variantes pv ON pv.varianteid = ic.varianteid
      INNER JOIN productos p ON p.productoid = pv.productoid
      LEFT JOIN categorias c ON p.categoriaid = c.categoriaid
      LEFT JOIN cat_tamanopaquetes t ON t.tamanoid = ic.tamanoid
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

    const items = itemsResult.rows.map((item) => {
      const precioUnitario =
        item.preciounitario !== null ? parseFloat(item.preciounitario) : null;
      const tamanoValor =
        item.tamano_valor !== null ? parseInt(item.tamano_valor, 10) : null;
      const cantidad = item.cantidad !== null ? parseInt(item.cantidad, 10) : 0;
      const subtotal =
        item.subtotal !== null ? parseFloat(item.subtotal) : null;
      const stock = item.stock !== null ? parseInt(item.stock, 10) : null;

      // Compatibilidad con frontend actual: exponemos campos "por paquete" calculados
      const piezasPorPaquete = tamanoValor;
      const precioPaquete =
        precioUnitario !== null && tamanoValor
          ? parseFloat((precioUnitario * tamanoValor).toFixed(2))
          : null;
      const precioPorPieza = precioUnitario !== null ? precioUnitario : null;

      return {
        itemId: item.itemid,
        varianteId: item.varianteid,
        producto: {
          productoId: item.productoid,
          nombreProducto: item.nombreproducto,
          descripcion: item.descripcion,
          categoria: item.categoriaid
            ? {
                categoriaId: item.categoriaid,
                nombre: item.categorianombre,
                descripcion: item.categoriadescripcion,
              }
            : null,
        },
        sku: item.sku,
        cantidadPaquetes: cantidad,
        tamanoId: item.tamanoid,
        piezasPorPaquete,
        precioPaquete,
        precioPorPieza,
        precioUnitario,
        stock,
        dimensiones: item.dimensiones,
        subtotal,
        imagenPrincipal: item.url_imagen
          ? {
              url: item.url_imagen,
              alt: item.textoalternativo,
            }
          : null,
      };
    });

    res.status(200).json({
      success: true,
      message: "Carrito obtenido exitosamente",
      data: {
        carritoId,
        items,
        totalItems: items.length,
        montoTotal: parseFloat(montoTotal.toFixed(2)),
      },
    });
  } catch (error) {
    console.error("Error al obtener carrito:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener el carrito",
      error: error.message,
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
    const { VarianteID, Cantidad, TamanoID } = req.body;
    const validationResult = validateAgregarAlCarritoInput({
      VarianteID,
      Cantidad,
      TamanoID,
    });

    if (validationResult.error) {
      return res.status(400).json({
        success: false,
        message: validationResult.error,
      });
    }

    const { varianteId, cantidad, tamanoId } = validationResult.data;

    const cantidadEntera = parseInt(cantidad, 10);

    const varianteResult = await db.query(
      `SELECT
         pv.varianteid,
         pv.productoid,
         pv.sku,
         pv.stock,
         pv.preciounitario,
         p.nombreproducto,
         t.valor AS tamano_valor
       FROM producto_variantes pv
       INNER JOIN productos p ON p.productoid = pv.productoid
       INNER JOIN producto_tamanosdisponibles ptd ON ptd.productoid = p.productoid AND ptd.tamanoid = $2
       INNER JOIN cat_tamanopaquetes t ON t.tamanoid = ptd.tamanoid
       WHERE pv.varianteid = $1`,
      [varianteId, tamanoId]
    );

    if (varianteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Variante o tamaño no encontrado",
      });
    }

    const variante = varianteResult.rows[0];
    const stockDisponible =
      variante.stock !== null ? parseInt(variante.stock, 10) : 0;

    const piezasPorTamano = variante.tamano_valor;

    if (!piezasPorTamano || piezasPorTamano <= 0) {
      return res.status(400).json({
        success: false,
        message: "El tamaño seleccionado no tiene valor válido",
      });
    }

    const totalPiezasSolicitadas = cantidadEntera * piezasPorTamano;

    if (stockDisponible < totalPiezasSolicitadas) {
      return res.status(400).json({
        success: false,
        message: `Stock insuficiente. Disponible: ${stockDisponible} piezas`,
      });
    }

    // Obtener o crear el carrito del cliente
    let carritoResult = await db.query(
      "SELECT CarritoID FROM CarritoDeCompra WHERE ClienteID = $1",
      [clienteId]
    );

    let carritoId;
    if (carritoResult.rows.length === 0) {
      // Crear nuevo carrito
      const nuevoCarrito = await db.query(
        "INSERT INTO CarritoDeCompra (ClienteID, UltimaModificacion) VALUES ($1, NOW()) RETURNING CarritoID",
        [clienteId]
      );
      carritoId = nuevoCarrito.rows[0].carritoid;
    } else {
      carritoId = carritoResult.rows[0].carritoid;
      // Actualizar última modificación
      await db.query(
        "UPDATE CarritoDeCompra SET UltimaModificacion = NOW() WHERE CarritoID = $1",
        [carritoId]
      );
    }

    // Verificar si la variante ya está en el carrito
    const itemExistente = await db.query(
      "SELECT ItemID, Cantidad, TamanoID FROM ItemsDelCarrito WHERE CarritoID = $1 AND VarianteID = $2 AND TamanoID = $3",
      [carritoId, varianteId, tamanoId]
    );

    let itemResult;
    if (itemExistente.rows.length > 0) {
      // Actualizar cantidad
      const nuevaCantidad = itemExistente.rows[0].cantidad + cantidadEntera;

      const totalPiezas = nuevaCantidad * piezasPorTamano;

      if (stockDisponible < totalPiezas) {
        return res.status(400).json({
          success: false,
          message: `Stock insuficiente. Disponible: ${stockDisponible} piezas`,
        });
      }

      itemResult = await db.query(
        "UPDATE ItemsDelCarrito SET Cantidad = $1 WHERE ItemID = $2 RETURNING ItemID, VarianteID, Cantidad, TamanoID",
        [nuevaCantidad, itemExistente.rows[0].itemid]
      );
    } else {
      // Insertar nuevo item
      itemResult = await db.query(
        "INSERT INTO ItemsDelCarrito (CarritoID, VarianteID, TamanoID, Cantidad) VALUES ($1, $2, $3, $4) RETURNING ItemID, VarianteID, TamanoID, Cantidad",
        [carritoId, varianteId, tamanoId, cantidadEntera]
      );
    }

    const item = itemResult.rows[0];
    const precioUnitario =
      variante.preciounitario !== null
        ? parseFloat(variante.preciounitario)
        : null;
    const subtotal =
      precioUnitario !== null
        ? parseFloat(
            (item.cantidad * piezasPorTamano * precioUnitario).toFixed(2)
          )
        : null;

    res.status(200).json({
      success: true,
      message: "Variante agregada al carrito exitosamente",
      data: {
        item: {
          itemId: item.itemid,
          varianteId: item.varianteid,
          productoId: variante.productoid,
          nombreProducto: variante.nombreproducto,
          sku: variante.sku,
          tamanoId: item.tamanoid,
          cantidad: item.cantidad,
          piezasPorTamano,
          precioUnitario,
          subtotal,
        },
      },
    });
  } catch (error) {
    console.error("Error al agregar al carrito:", error);
    res.status(500).json({
      success: false,
      message: "Error al agregar producto al carrito",
      error: error.message,
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
    if (
      !CantidadPaquetes ||
      CantidadPaquetes <= 0 ||
      Number.isNaN(varianteId)
    ) {
      return res.status(400).json({
        success: false,
        message: "La cantidad debe ser mayor a 0 y VarianteID debe ser válido",
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
        message: "Variante no encontrada",
      });
    }

    const variante = varianteResult.rows[0];

    const stockDisponible =
      variante.stock !== null ? parseInt(variante.stock, 10) : 0;

    if (stockDisponible < CantidadPaquetes) {
      return res.status(400).json({
        success: false,
        message: `Stock insuficiente. Disponible: ${stockDisponible} paquetes`,
      });
    }

    // Obtener el carrito del cliente
    const carritoResult = await db.query(
      "SELECT CarritoID FROM CarritoDeCompra WHERE ClienteID = $1",
      [clienteId]
    );

    if (carritoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Carrito no encontrado",
      });
    }

    const carritoId = carritoResult.rows[0].carritoid;

    // Actualizar la cantidad del item
    const updateResult = await db.query(
      "UPDATE ItemsDelCarrito SET CantidadPaquetes = $1 WHERE CarritoID = $2 AND VarianteID = $3 RETURNING ItemID, VarianteID, CantidadPaquetes",
      [CantidadPaquetes, carritoId, varianteId]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Variante no encontrada en el carrito",
      });
    }

    // Actualizar última modificación del carrito
    await db.query(
      "UPDATE CarritoDeCompra SET UltimaModificacion = NOW() WHERE CarritoID = $1",
      [carritoId]
    );

    const item = updateResult.rows[0];

    res.status(200).json({
      success: true,
      message: "Cantidad actualizada exitosamente",
      data: {
        item: {
          itemId: item.itemid,
          varianteId: item.varianteid,
          productoId: variante.productoid,
          nombreProducto: variante.nombreproducto,
          sku: variante.sku,
          cantidadPaquetes: item.cantidadpaquetes,
          precioPaquete:
            variante.preciopaquete !== null
              ? parseFloat(variante.preciopaquete)
              : null,
          subtotal:
            variante.preciopaquete !== null
              ? parseFloat(
                  (
                    item.cantidadpaquetes * parseFloat(variante.preciopaquete)
                  ).toFixed(2)
                )
              : null,
        },
      },
    });
  } catch (error) {
    console.error("Error al actualizar carrito:", error);
    res.status(500).json({
      success: false,
      message: "Error al actualizar cantidad",
      error: error.message,
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
        message: "VarianteID inválido",
      });
    }

    // Obtener el carrito del cliente
    const carritoResult = await db.query(
      "SELECT CarritoID FROM CarritoDeCompra WHERE ClienteID = $1",
      [clienteId]
    );

    if (carritoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Carrito no encontrado",
      });
    }

    const carritoId = carritoResult.rows[0].carritoid;

    // Eliminar el item del carrito
    const deleteResult = await db.query(
      "DELETE FROM ItemsDelCarrito WHERE CarritoID = $1 AND VarianteID = $2 RETURNING ItemID",
      [carritoId, varianteId]
    );

    if (deleteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Variante no encontrada en el carrito",
      });
    }

    // Actualizar última modificación del carrito
    await db.query(
      "UPDATE CarritoDeCompra SET UltimaModificacion = NOW() WHERE CarritoID = $1",
      [carritoId]
    );

    res.status(200).json({
      success: true,
      message: "Producto eliminado del carrito exitosamente",
    });
  } catch (error) {
    console.error("Error al eliminar del carrito:", error);
    res.status(500).json({
      success: false,
      message: "Error al eliminar producto del carrito",
      error: error.message,
    });
  }
};

module.exports = {
  obtenerCarrito,
  agregarAlCarrito,
  actualizarCarrito,
  eliminarDelCarrito,
};
