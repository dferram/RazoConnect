const db = require("../db");

const TAMANO_VALUE_KEYS = [
  "valor",
  "cantidad",
  "piezas",
  "piezasporpaquete",
  "numeropiezas",
  "tamano",
  "cantidadpiezas",
];

function calcularSplitBackorder({
  cantidadSolicitada,
  stockPiezas,
  piezasPorPaquete,
  multiploBackorder,
}) {
  const cantidad = Number.isInteger(cantidadSolicitada) ? cantidadSolicitada : 0;
  const stock = Number.isInteger(stockPiezas) ? stockPiezas : 0;
  const piezas = Number.isInteger(piezasPorPaquete) ? piezasPorPaquete : 0;
  const multiplo = Number.isInteger(multiploBackorder) ? multiploBackorder : 1;
  const regla = multiplo > 1 ? "PAQUETE" : "UNITARIO";

  if (cantidad <= 0 || piezas <= 0) {
    return {
      cantidadSurtida: 0,
      cantidadPendiente: 0,
      cantidadBackorderAjustada: 0,
      cantidadTotalCobrar: 0,
      ajusteAplicado: false,
      reglaBackorder: regla,
    };
  }

  const paquetesSurtibles = Math.floor(Math.max(stock, 0) / piezas);
  const cantidadSurtida = Math.max(Math.min(cantidad, paquetesSurtibles), 0);
  const cantidadPendiente = Math.max(cantidad - cantidadSurtida, 0);

  let cantidadBackorderAjustada = cantidadPendiente;
  if (cantidadPendiente > 0 && multiplo > 1) {
    const piezasPendientes = cantidadPendiente * piezas;
    const piezasBackorderAjustadas = Math.ceil(piezasPendientes / multiplo) * multiplo;
    cantidadBackorderAjustada = Math.ceil(piezasBackorderAjustadas / piezas);
  }

  const cantidadTotalCobrar = cantidad;
  const ajusteAplicado = cantidadBackorderAjustada !== cantidadPendiente;

  return {
    cantidadSurtida,
    cantidadPendiente,
    cantidadBackorderAjustada,
    cantidadTotalCobrar,
    ajusteAplicado,
    reglaBackorder: regla,
  };
}

async function obtenerMultiploBackorderDesdeReglaEmpaque({
  proveedorId,
  tipoProductoId,
}) {
  const proveedor = Number.parseInt(proveedorId, 10);
  const tipo = Number.parseInt(tipoProductoId, 10);
  if (!Number.isInteger(proveedor) || proveedor <= 0) return 1;
  if (!Number.isInteger(tipo) || tipo <= 0) return 1;

  try {
    const { rows } = await db.query(
      `SELECT cantidadempaque
       FROM proveedor_reglas_empaque
       WHERE proveedorid = $1 AND tipoproductoid = $2
       LIMIT 1`,
      [proveedor, tipo]
    );
    const raw = rows[0]?.cantidadempaque;
    const parsed = Number.parseInt(raw, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
  } catch (dbError) {
    if (dbError && dbError.code === "42703") {
      const { rows } = await db.query(
        `SELECT piezasporpaquete AS cantidadempaque
         FROM proveedor_reglas_empaque
         WHERE proveedorid = $1 AND tipoproductoid = $2
         LIMIT 1`,
        [proveedor, tipo]
      );
      const raw = rows[0]?.cantidadempaque;
      const parsed = Number.parseInt(raw, 10);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
    }
    throw dbError;
  }
}

function obtenerPiezasDesdeTamanoInfo(tamanoInfo) {
  if (!tamanoInfo || typeof tamanoInfo !== "object") {
    return null;
  }

  for (const key of TAMANO_VALUE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(tamanoInfo, key)) {
      const parsed = parseInt(tamanoInfo[key], 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }

    const capitalized = key.charAt(0).toUpperCase() + key.slice(1);
    if (Object.prototype.hasOwnProperty.call(tamanoInfo, capitalized)) {
      const parsed = parseInt(tamanoInfo[capitalized], 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }

  return null;
}

async function calcularPiezasTotalesEnCarritoParaVariante(carritoId, varianteId) {
  const result = await db.query(
    `SELECT
       COALESCE(ic.cantidadpaquetes, ic.cantidad) AS cantidad_paquetes,
       row_to_json(t) AS tamano_info
     FROM itemsdelcarrito ic
     LEFT JOIN cat_tamanopaquetes t ON t.tamanoid = ic.tamanoid
     WHERE ic.carritoid = $1 AND ic.varianteid = $2`,
    [carritoId, varianteId]
  );

  let totalPiezas = 0;

  for (const row of result.rows) {
    const piezasPorPaquete = obtenerPiezasDesdeTamanoInfo(row.tamano_info) || 0;
    const cantidadPaquetes =
      row.cantidad_paquetes !== null && row.cantidad_paquetes !== undefined
        ? parseInt(row.cantidad_paquetes, 10)
        : 0;

    if (
      !Number.isNaN(cantidadPaquetes) &&
      cantidadPaquetes > 0 &&
      piezasPorPaquete > 0
    ) {
      totalPiezas += cantidadPaquetes * piezasPorPaquete;
    }
  }

  return totalPiezas;
}

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
      "SELECT carritoid FROM carritodecompra WHERE clienteid = $1",
      [clienteId]
    );

    // Si no existe carrito, crear uno nuevo
    if (carritoResult.rows.length === 0) {
      const nuevoCarrito = await db.query(
        "INSERT INTO carritodecompra (clienteid) VALUES ($1) RETURNING carritoid",
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
        COALESCE(ic.cantidadpaquetes, ic.cantidad) AS cantidad_paquetes,
        ic.tamanoid,
        pv.sku,
        pv.dimensiones,
        pv.preciounitario,
        pv.precioofertaunitario,
        pv.stock,
        pre.tipoproductoid,
        p.productoid,
        p.nombreproducto,
        p.descripcion,
        p.proveedorid_default,
        p.categoriaid,
        c.nombre AS categorianombre,
        c.descripcion AS categoriadescripcion,
        row_to_json(t) AS tamano_info,
        imagen.url_imagen,
        imagen.textoalternativo
      FROM itemsdelcarrito ic
      INNER JOIN producto_variantes pv ON pv.varianteid = ic.varianteid
      INNER JOIN productos p ON p.productoid = pv.productoid
      LEFT JOIN proveedor_reglas_empaque pre ON pre.reglaid = p.reglaid
      LEFT JOIN categorias c ON p.categoriaid = c.categoriaid
      LEFT JOIN cat_tamanopaquetes t ON t.tamanoid = ic.tamanoid
      LEFT JOIN LATERAL (
        SELECT
          pi.url_imagen,
          pi.textoalternativo
        FROM producto_imagenes pi
        WHERE pi.productoid = pv.productoid
        ORDER BY pi.orden ASC NULLS LAST, pi.imagenid ASC
        LIMIT 1
      ) imagen ON TRUE
      WHERE ic.carritoid = $1
      ORDER BY ic.itemid DESC
    `;

    const itemsResult = await db.query(itemsQuery, [carritoId]);

    const productosEnCarrito = [
      ...new Set(itemsResult.rows.map((row) => row.productoid).filter(Boolean)),
    ];

    let masterVariantsMap = new Map();
    if (productosEnCarrito.length) {
      const masterVariantsResult = await db.query(
        `SELECT ProductoID, VarianteID, COALESCE(Stock, 0) AS Stock
         FROM Producto_Variantes
         WHERE ProductoID = ANY($1::int[])
           AND PiezasPorPaquete = 1`,
        [productosEnCarrito]
      );

      masterVariantsMap = new Map(
        masterVariantsResult.rows.map((row) => [
          row.productoid,
          {
            varianteId: row.varianteid,
            stock: Math.max(parseInt(row.stock, 10), 0),
          },
        ])
      );
    }

    const valueCandidates = [
      "cantidad",
      "valor",
      "piezas",
      "piezasporpaquete",
      "numeropiezas",
      "tamano",
      "cantidadpiezas",
    ];
    const labelCandidates = ["etiqueta", "descripcion", "nombre", "label"];

    const items = await Promise.all(itemsResult.rows.map(async (item) => {
      // LÓGICA DE PRECIOS CON OFERTA: Si existe precio de oferta, úsalo. Si no, usa precio normal.
      const precioBase =
        item.preciounitario !== null ? parseFloat(item.preciounitario) : null;
      const precioOferta =
        item.precioofertaunitario !== null
          ? parseFloat(item.precioofertaunitario)
          : null;
      const precioUnitario = precioOferta || precioBase;
      const tieneOferta = precioOferta !== null && precioOferta > 0;

      const tamanoInfo = item.tamano_info || {};

      let tamanoCantidad = null;
      for (const key of valueCandidates) {
        if (Object.prototype.hasOwnProperty.call(tamanoInfo, key)) {
          const parsed = parseInt(tamanoInfo[key], 10);
          if (!Number.isNaN(parsed) && parsed > 0) {
            tamanoCantidad = parsed;
            break;
          }
        }

        const capitalized = key.charAt(0).toUpperCase() + key.slice(1);
        if (Object.prototype.hasOwnProperty.call(tamanoInfo, capitalized)) {
          const parsed = parseInt(tamanoInfo[capitalized], 10);
          if (!Number.isNaN(parsed) && parsed > 0) {
            tamanoCantidad = parsed;
            break;
          }
        }
      }

      let tamanoEtiqueta = null;
      for (const key of labelCandidates) {
        if (
          Object.prototype.hasOwnProperty.call(tamanoInfo, key) &&
          tamanoInfo[key]
        ) {
          tamanoEtiqueta = String(tamanoInfo[key]).trim();
          if (tamanoEtiqueta) break;
        }

        const capitalized = key.charAt(0).toUpperCase() + key.slice(1);
        if (
          Object.prototype.hasOwnProperty.call(tamanoInfo, capitalized) &&
          tamanoInfo[capitalized]
        ) {
          tamanoEtiqueta = String(tamanoInfo[capitalized]).trim();
          if (tamanoEtiqueta) break;
        }
      }

      const cantidad =
        item.cantidad_paquetes !== null
          ? parseInt(item.cantidad_paquetes, 10)
          : item.cantidad !== null
          ? parseInt(item.cantidad, 10)
          : 0;
      const masterInfo = masterVariantsMap.get(item.productoid);
      const stockPiezas = masterInfo ? masterInfo.stock : 0;
      const piezasPorPaquete = tamanoCantidad;

      const multiploBackorder = await obtenerMultiploBackorderDesdeReglaEmpaque({
        proveedorId: item.proveedorid_default,
        tipoProductoId: item.tipoproductoid,
      });

      const split = calcularSplitBackorder({
        cantidadSolicitada: cantidad,
        stockPiezas,
        piezasPorPaquete,
        multiploBackorder,
      });

      const precioPaquete =
        precioUnitario !== null && tamanoCantidad
          ? parseFloat((precioUnitario * tamanoCantidad).toFixed(2))
          : null;
      const precioPorPieza = precioUnitario !== null ? precioUnitario : null;
      const subtotalCalculado =
        precioUnitario !== null && tamanoCantidad
          ? parseFloat((precioUnitario * tamanoCantidad * cantidad).toFixed(2))
          : null;

      const subtotalCobrar =
        precioUnitario !== null && tamanoCantidad
          ? parseFloat(
              (
                precioUnitario *
                tamanoCantidad *
                split.cantidadTotalCobrar
              ).toFixed(2)
            )
          : null;

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
        cantidadPaquetesSolicitada: cantidad,
        cantidadPaquetesSurtida: split.cantidadSurtida,
        cantidadPaquetesBackorder: split.cantidadBackorderAjustada,
        cantidadPaquetesBackorderAjustada: split.cantidadBackorderAjustada,
        cantidadPaquetesCobrar: split.cantidadTotalCobrar,
        reglaBackorder: split.reglaBackorder,
        ajusteAplicado: split.ajusteAplicado,
        tamanoId: item.tamanoid,
        piezasPorPaquete,
        tamanoCantidad,
        tamanoEtiqueta,
        precioPaquete,
        precioPorPieza,
        precioUnitario,
        precioBase,
        precioOferta,
        tieneOferta,
        stock: stockPiezas,
        stockPiezas,
        dimensiones: item.dimensiones,
        subtotal: subtotalCobrar,
        subtotalSolicitado: subtotalCalculado,
        imagenPrincipal: item.url_imagen
          ? {
              url: item.url_imagen,
              alt: item.textoalternativo,
            }
          : null,
      };
    }));

    const montoTotal = items.reduce((total, item) => {
      const subtotal =
        item.subtotal !== null && !Number.isNaN(item.subtotal)
          ? item.subtotal
          : 0;
      return total + subtotal;
    }, 0);

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
         p.proveedorid_default,
         pre.tipoproductoid,
         row_to_json(t) AS tamano_info
       FROM producto_variantes pv
       INNER JOIN productos p ON p.productoid = pv.productoid
       LEFT JOIN proveedor_reglas_empaque pre ON pre.reglaid = p.reglaid
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

    const valueCandidates = [
      "valor",
      "cantidad",
      "piezas",
      "piezasporpaquete",
      "numeropiezas",
      "tamano",
      "cantidadpiezas",
    ];

    let piezasPorTamano = null;
    const tamanoInfo = variante.tamano_info || {};
    for (const key of valueCandidates) {
      if (Object.prototype.hasOwnProperty.call(tamanoInfo, key)) {
        const parsed = parseInt(tamanoInfo[key], 10);
        if (!Number.isNaN(parsed) && parsed > 0) {
          piezasPorTamano = parsed;
          break;
        }
      }

      const capitalized = key.charAt(0).toUpperCase() + key.slice(1);
      if (Object.prototype.hasOwnProperty.call(tamanoInfo, capitalized)) {
        const parsed = parseInt(tamanoInfo[capitalized], 10);
        if (!Number.isNaN(parsed) && parsed > 0) {
          piezasPorTamano = parsed;
          break;
        }
      }
    }

    if (!piezasPorTamano || piezasPorTamano <= 0) {
      return res.status(400).json({
        success: false,
        message: "El tamaño seleccionado no tiene valor válido",
      });
    }

    const masterResult = await db.query(
      `SELECT VarianteID, COALESCE(Stock, 0) AS Stock
       FROM Producto_Variantes
       WHERE ProductoID = $1
         AND PiezasPorPaquete = 1
       LIMIT 1`,
      [variante.productoid]
    );
    const stockFisico =
      masterResult.rows.length > 0
        ? Math.max(parseInt(masterResult.rows[0].stock, 10), 0)
        : 0;

    const multiploBackorder = await obtenerMultiploBackorderDesdeReglaEmpaque({
      proveedorId: variante.proveedorid_default,
      tipoProductoId: variante.tipoproductoid,
    });

    // Obtener o crear el carrito del cliente
    let carritoResult = await db.query(
      "SELECT carritoid FROM carritodecompra WHERE clienteid = $1",
      [clienteId]
    );

    let carritoId;
    if (carritoResult.rows.length === 0) {
      // Crear nuevo carrito
      const nuevoCarrito = await db.query(
        "INSERT INTO carritodecompra (clienteid, ultimamodificacion) VALUES ($1, NOW()) RETURNING carritoid",
        [clienteId]
      );
      carritoId = nuevoCarrito.rows[0].carritoid;
    } else {
      carritoId = carritoResult.rows[0].carritoid;
      // Actualizar última modificación
      await db.query(
        "UPDATE carritodecompra SET ultimamodificacion = NOW() WHERE carritoid = $1",
        [carritoId]
      );
    }

    // Verificar si la variante ya está en el carrito
    const itemExistente = await db.query(
      "SELECT itemid, COALESCE(cantidadpaquetes, cantidad) AS cantidad_paquetes, tamanoid FROM itemsdelcarrito WHERE carritoid = $1 AND varianteid = $2 AND tamanoid = $3",
      [carritoId, varianteId, tamanoId]
    );

    let itemResult;
    if (itemExistente.rows.length > 0) {
      // Actualizar cantidad
      const cantidadActual = itemExistente.rows[0].cantidad_paquetes
        ? parseInt(itemExistente.rows[0].cantidad_paquetes, 10)
        : 0;
      const nuevaCantidad = cantidadActual + cantidadEntera;

      itemResult = await db.query(
        "UPDATE itemsdelcarrito SET cantidadpaquetes = $1, cantidad = $1 WHERE itemid = $2 RETURNING itemid, varianteid, cantidadpaquetes, cantidad, tamanoid",
        [nuevaCantidad, itemExistente.rows[0].itemid]
      );
    } else {
      // Insertar nuevo item
      itemResult = await db.query(
        "INSERT INTO itemsdelcarrito (carritoid, varianteid, tamanoid, cantidadpaquetes, cantidad) VALUES ($1, $2, $3, $4, $4) RETURNING itemid, varianteid, tamanoid, cantidadpaquetes, cantidad",
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

    const cantidadFinal =
      item.cantidad_paquetes !== null && item.cantidad_paquetes !== undefined
        ? parseInt(item.cantidad_paquetes, 10)
        : item.cantidad !== null && item.cantidad !== undefined
        ? parseInt(item.cantidad, 10)
        : cantidadEntera;

    const split = calcularSplitBackorder({
      cantidadSolicitada: cantidadFinal,
      stockPiezas: stockFisico,
      piezasPorPaquete: piezasPorTamano,
      multiploBackorder,
    });

    res.status(200).json({
      success: true,
      message: "Producto agregado al carrito exitosamente",
      data: {
        item: {
          itemId: item.itemid,
          varianteId: item.varianteid,
          productoId: variante.productoid,
          nombreProducto: variante.nombreproducto,
          sku: variante.sku,
          tamanoId: item.tamanoid,
          cantidad: item.cantidad_paquetes || item.cantidad,
          piezasPorTamano,
          precioUnitario,
          subtotal,
        },
        split: {
          cantidadSolicitada: cantidadFinal,
          cantidadSurtida: split.cantidadSurtida,
          cantidadBackorder: split.cantidadBackorderAjustada,
          cantidadTotalCobrar: split.cantidadTotalCobrar,
          reglaBackorder: split.reglaBackorder,
          ajusteAplicado: split.ajusteAplicado,
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
    const { CantidadPaquetes, TamanoID } = req.body;

    // Validar datos de entrada
    const cantidadPaquetesEntera = parseInt(CantidadPaquetes, 10);
    const tamanoId = TamanoID !== undefined ? parseInt(TamanoID, 10) : NaN;

    if (
      Number.isNaN(varianteId) ||
      !Number.isInteger(cantidadPaquetesEntera) ||
      cantidadPaquetesEntera <= 0 ||
      Number.isNaN(tamanoId)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "La cantidad debe ser un entero mayor a 0 y VarianteID/TamanoID deben ser válidos",
      });
    }

    const varianteResult = await db.query(
      `SELECT
         pv.varianteid,
         pv.productoid,
         pv.preciounitario,
         pv.precioofertaunitario,
         pv.stock,
         pv.sku,
         p.nombreproducto,
         p.proveedorid_default,
         pre.tipoproductoid
       FROM producto_variantes pv
       INNER JOIN productos p ON p.productoid = pv.productoid
       LEFT JOIN proveedor_reglas_empaque pre ON pre.reglaid = p.reglaid
       WHERE pv.varianteid = $1
       LIMIT 1`,
      [varianteId]
    );

    if (varianteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Variante no encontrada",
      });
    }

    const variante = varianteResult.rows[0];

    const masterResult = await db.query(
      `SELECT VarianteID, COALESCE(Stock, 0) AS Stock
       FROM Producto_Variantes
       WHERE ProductoID = $1
         AND PiezasPorPaquete = 1
       LIMIT 1`,
      [variante.productoid]
    );
    const stockFisico =
      masterResult.rows.length > 0
        ? Math.max(parseInt(masterResult.rows[0].stock, 10), 0)
        : 0;

    // Obtener el carrito del cliente
    const carritoResult = await db.query(
      "SELECT carritoid FROM carritodecompra WHERE clienteid = $1",
      [clienteId]
    );

    if (carritoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Carrito no encontrado",
      });
    }

    const carritoId = carritoResult.rows[0].carritoid;

    // Obtener el item actual (para conocer tamano y cantidad actual)
    const itemActualResult = await db.query(
      `SELECT
         ic.itemid,
         COALESCE(ic.cantidadpaquetes, ic.cantidad) AS cantidad_paquetes,
         ic.tamanoid,
         row_to_json(t) AS tamano_info
       FROM itemsdelcarrito ic
       LEFT JOIN cat_tamanopaquetes t ON t.tamanoid = ic.tamanoid
       WHERE ic.carritoid = $1 AND ic.varianteid = $2 AND ic.tamanoid = $3`,
      [carritoId, varianteId, tamanoId]
    );

    if (itemActualResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Variante no encontrada en el carrito para la presentación seleccionada",
      });
    }
    const itemActual = itemActualResult.rows[0];

    const piezasPorPaqueteActual =
      obtenerPiezasDesdeTamanoInfo(itemActual.tamano_info) || 0;

    if (piezasPorPaqueteActual <= 0) {
      return res.status(400).json({
        success: false,
        message: "El tamaño seleccionado no tiene valor válido",
      });
    }

    // Calcular precio unitario efectivo (oferta o normal)
    const precioBase =
      variante.preciounitario !== null && variante.preciounitario !== undefined
        ? parseFloat(variante.preciounitario)
        : null;
    const precioOferta =
      variante.precioofertaunitario !== null &&
      variante.precioofertaunitario !== undefined
        ? parseFloat(variante.precioofertaunitario)
        : null;
    const precioUnitario = precioOferta || precioBase;

    // Actualizar la cantidad del item específico
    const updateResult = await db.query(
      "UPDATE itemsdelcarrito SET cantidadpaquetes = $1, cantidad = $1 WHERE itemid = $2 RETURNING itemid, varianteid, cantidadpaquetes",
      [cantidadPaquetesEntera, itemActual.itemid]
    );

    // Actualizar última modificación del carrito
    await db.query(
      "UPDATE carritodecompra SET ultimamodificacion = NOW() WHERE carritoid = $1",
      [carritoId]
    );

    const item = updateResult.rows[0];

    const precioPaquete =
      precioUnitario !== null && piezasPorPaqueteActual
        ? parseFloat((precioUnitario * piezasPorPaqueteActual).toFixed(2))
        : null;

    const subtotal =
      precioPaquete !== null
        ? parseFloat(
            (item.cantidadpaquetes * precioPaquete).toFixed(2)
          )
        : null;

    const multiploBackorder = await obtenerMultiploBackorderDesdeReglaEmpaque({
      proveedorId: variante.proveedorid_default,
      tipoProductoId: variante.tipoproductoid,
    });

    const split = calcularSplitBackorder({
      cantidadSolicitada: cantidadPaquetesEntera,
      stockPiezas: stockFisico,
      piezasPorPaquete: piezasPorPaqueteActual,
      multiploBackorder,
    });

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
          precioPaquete,
          subtotal,
        },
        split: {
          cantidadSolicitada: cantidadPaquetesEntera,
          cantidadSurtida: split.cantidadSurtida,
          cantidadBackorder: split.cantidadBackorderAjustada,
          cantidadTotalCobrar: split.cantidadTotalCobrar,
          reglaBackorder: split.reglaBackorder,
          ajusteAplicado: split.ajusteAplicado,
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
 * Cambiar la variante (medida física) de una línea del carrito
 * PUT /api/carrito/item/:itemId/cambiar-variante
 */
const cambiarVarianteItemCarrito = async (req, res) => {
  try {
    const clienteId = req.user.userId;
    const itemId = parseInt(req.params.itemId, 10);
    const { NuevaVarianteID, TamanoID } = req.body || {};

    const nuevaVarianteId =
      NuevaVarianteID !== undefined && NuevaVarianteID !== null
        ? parseInt(NuevaVarianteID, 10)
        : NaN;
    const tamanoIdBody =
      TamanoID !== undefined && TamanoID !== null
        ? parseInt(TamanoID, 10)
        : NaN;

    if (Number.isNaN(itemId) || Number.isNaN(nuevaVarianteId)) {
      return res.status(400).json({
        success: false,
        message: "ItemID y NuevaVarianteID deben ser válidos",
      });
    }

    // Obtener el carrito del cliente
    const carritoResult = await db.query(
      "SELECT carritoid FROM carritodecompra WHERE clienteid = $1",
      [clienteId]
    );

    if (carritoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Carrito no encontrado",
      });
    }

    const carritoId = carritoResult.rows[0].carritoid;

    // Obtener la línea actual del carrito y el producto asociado
    const itemResult = await db.query(
      `SELECT
         ic.itemid,
         COALESCE(ic.cantidadpaquetes, ic.cantidad) AS cantidad_paquetes,
         ic.tamanoid,
         ic.varianteid AS variante_actual_id,
         pv.productoid
       FROM itemsdelcarrito ic
       INNER JOIN producto_variantes pv ON pv.varianteid = ic.varianteid
       WHERE ic.carritoid = $1 AND ic.itemid = $2
       LIMIT 1`,
      [carritoId, itemId]
    );

    if (itemResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Item no encontrado en el carrito",
      });
    }

    const itemActual = itemResult.rows[0];
    const cantidadPaquetes =
      itemActual.cantidad_paquetes !== null &&
      itemActual.cantidad_paquetes !== undefined
        ? parseInt(itemActual.cantidad_paquetes, 10)
        : 0;

    if (!Number.isInteger(cantidadPaquetes) || cantidadPaquetes <= 0) {
      return res.status(400).json({
        success: false,
        message: "La cantidad actual del item no es válida",
      });
    }

    const tamanoIdActual =
      itemActual.tamanoid !== null && itemActual.tamanoid !== undefined
        ? parseInt(itemActual.tamanoid, 10)
        : NaN;

    let tamanoIdFinal = tamanoIdActual;
    if (!Number.isNaN(tamanoIdBody)) {
      tamanoIdFinal = tamanoIdBody;
    }

    if (Number.isNaN(tamanoIdFinal) || tamanoIdFinal <= 0) {
      return res.status(400).json({
        success: false,
        message: "TamanoID inválido para cambio de variante",
      });
    }

    const productId = itemActual.productoid;

    // Obtener información de la nueva variante y validar que pertenezca al mismo producto y tamaño permitido
    const varianteResult = await db.query(
      `SELECT
         pv.varianteid,
         pv.productoid,
         pv.sku,
         pv.stock,
         pv.preciounitario,
         pv.precioofertaunitario,
         pre.tipoproductoid,
         p.nombreproducto,
         p.proveedorid_default,
         row_to_json(t) AS tamano_info
       FROM producto_variantes pv
       INNER JOIN productos p ON p.productoid = pv.productoid
       INNER JOIN producto_tamanosdisponibles ptd ON ptd.productoid = p.productoid AND ptd.tamanoid = $3
       INNER JOIN cat_tamanopaquetes t ON t.tamanoid = ptd.tamanoid
       WHERE pv.varianteid = $1 AND pv.productoid = $2
       LIMIT 1`,
      [nuevaVarianteId, productId, tamanoIdFinal]
    );

    if (varianteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Variante o tamaño no válido para este producto",
      });
    }

    const variante = varianteResult.rows[0];

    const piezasPorTamano =
      obtenerPiezasDesdeTamanoInfo(variante.tamano_info) || 0;

    if (!piezasPorTamano || piezasPorTamano <= 0) {
      return res.status(400).json({
        success: false,
        message: "El tamaño seleccionado no tiene valor válido",
      });
    }

    const masterResult = await db.query(
      `SELECT VarianteID, COALESCE(Stock, 0) AS Stock
       FROM Producto_Variantes
       WHERE ProductoID = $1
         AND PiezasPorPaquete = 1
       LIMIT 1`,
      [variante.productoid]
    );
    const stockFisico =
      masterResult.rows.length > 0
        ? Math.max(parseInt(masterResult.rows[0].stock, 10), 0)
        : 0;

    // Calcular precio unitario efectivo (oferta o normal)
    const precioBase =
      variante.preciounitario !== null &&
      variante.preciounitario !== undefined
        ? parseFloat(variante.preciounitario)
        : null;
    const precioOferta =
      variante.precioofertaunitario !== null &&
      variante.precioofertaunitario !== undefined
        ? parseFloat(variante.precioofertaunitario)
        : null;
    const precioUnitario = precioOferta || precioBase;

    // Actualizar la línea del carrito con la nueva variante y tamaño
    const updateResult = await db.query(
      `UPDATE itemsdelcarrito
       SET varianteid = $1,
           tamanoid = $2
       WHERE itemid = $3 AND carritoid = $4
       RETURNING itemid, varianteid, tamanoid, COALESCE(cantidadpaquetes, cantidad) AS cantidad_paquetes`,
      [nuevaVarianteId, tamanoIdFinal, itemId, carritoId]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No se pudo actualizar el item del carrito",
      });
    }

    // Actualizar última modificación del carrito
    await db.query(
      "UPDATE carritodecompra SET ultimamodificacion = NOW() WHERE carritoid = $1",
      [carritoId]
    );

    const itemActualizado = updateResult.rows[0];

    const precioPaquete =
      precioUnitario !== null && piezasPorTamano
        ? parseFloat((precioUnitario * piezasPorTamano).toFixed(2))
        : null;

    const subtotal =
      precioPaquete !== null &&
      itemActualizado.cantidad_paquetes !== null &&
      itemActualizado.cantidad_paquetes !== undefined
        ? parseFloat(
            (
              parseInt(itemActualizado.cantidad_paquetes, 10) *
              precioPaquete
            ).toFixed(2)
          )
        : null;

    res.status(200).json({
      success: true,
      message: "Variante actualizada exitosamente",
      data: {
        item: {
          itemId: itemActualizado.itemid,
          varianteId: itemActualizado.varianteid,
          productoId: variante.productoid,
          nombreProducto: variante.nombreproducto,
          sku: variante.sku,
          tamanoId: itemActualizado.tamanoid,
          cantidadPaquetes:
            itemActualizado.cantidad_paquetes !== null &&
            itemActualizado.cantidad_paquetes !== undefined
              ? parseInt(itemActualizado.cantidad_paquetes, 10)
              : null,
          piezasPorTamano,
          precioUnitario,
          precioPaquete,
          subtotal,
        },
        split: {
          cantidadSolicitada: cantidadFinal,
          cantidadSurtida: split.cantidadSurtida,
          cantidadBackorder: split.cantidadBackorderAjustada,
          cantidadTotalCobrar: split.cantidadTotalCobrar,
          reglaBackorder: split.reglaBackorder,
          ajusteAplicado: split.ajusteAplicado,
        },
      },
    });
  } catch (error) {
    console.error("Error al cambiar variante del carrito:", error);
    res.status(500).json({
      success: false,
      message: "Error al cambiar la variante del producto en el carrito",
      error: error.message,
    });
  }
};

/**
 * Eliminar una línea específica del carrito
 * DELETE /api/carrito/:itemId
 */
const eliminarDelCarrito = async (req, res) => {
  try {
    const clienteId = req.user.userId;
    const itemId = parseInt(req.params.itemId, 10);

    if (Number.isNaN(itemId)) {
      return res.status(400).json({
        success: false,
        message: "ItemID inválido",
      });
    }

    // Obtener el carrito del cliente
    const carritoResult = await db.query(
      "SELECT carritoid FROM carritodecompra WHERE clienteid = $1",
      [clienteId]
    );

    if (carritoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Carrito no encontrado",
      });
    }

    const carritoId = carritoResult.rows[0].carritoid;

    // Eliminar solo el item específico del carrito
    const deleteResult = await db.query(
      "DELETE FROM itemsdelcarrito WHERE carritoid = $1 AND itemid = $2 RETURNING itemid",
      [carritoId, itemId]
    );

    if (deleteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Item no encontrado en el carrito",
      });
    }

    // Actualizar última modificación del carrito
    await db.query(
      "UPDATE carritodecompra SET ultimamodificacion = NOW() WHERE carritoid = $1",
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
  cambiarVarianteItemCarrito,
  eliminarDelCarrito,
};
