const db = require("../db");

/**
 * Obtener proveedores con productos activos
 * GET /api/public/proveedores
 */
const obtenerProveedoresPublicos = async (req, res) => {
  try {
    const query = `
      SELECT DISTINCT
        prov.ProveedorID,
        prov.NombreEmpresa
      FROM Proveedores prov
      INNER JOIN Productos p ON p.ProveedorID_Default = prov.ProveedorID
      WHERE p.Activo = TRUE
      ORDER BY prov.NombreEmpresa ASC
    `;

    const result = await db.query(query);

    const proveedores = result.rows.map((row) => ({
      proveedorId: row.proveedorid,
      nombre: row.nombreempresa,
    }));

    res.status(200).json({
      success: true,
      message: "Proveedores obtenidos exitosamente",
      data: {
        proveedores,
        total: proveedores.length,
      },
    });
  } catch (error) {
    console.error("Error al obtener proveedores públicos:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener los proveedores",
      error: error.message,
    });
  }
};

/**
 * Obtener todos los productos con imagen principal
 * GET /api/productos
 */
const obtenerProductos = async (req, res) => {
  try {
    const {
      search,
      precioMin,
      precioMax,
      dimension,
      stock,
      proveedorID,
      categoria,
      oferta,
      sort,
      limit,
    } = req.query;

    const filtros = [];
    const valores = [];

    if (search) {
      valores.push(`%${search}%`);
      const indiceSearch = valores.length;
      filtros.push(`(
        p.nombreproducto ILIKE $${indiceSearch}
        OR EXISTS (
          SELECT 1
          FROM producto_variantes pv
          WHERE pv.productoid = p.productoid
            AND pv.sku ILIKE $${indiceSearch}
        )
      )`);
    }

    if (precioMin && precioMax) {
      valores.push(precioMin);
      const indiceMin = valores.length;
      valores.push(precioMax);
      const indiceMax = valores.length;
      filtros.push(`EXISTS (
        SELECT 1
        FROM producto_variantes pv
        WHERE pv.productoid = p.productoid
          AND pv.preciounitario BETWEEN $${indiceMin} AND $${indiceMax}
      )`);
    } else if (precioMin) {
      valores.push(precioMin);
      const indiceMin = valores.length;
      filtros.push(`EXISTS (
        SELECT 1
        FROM producto_variantes pv
        WHERE pv.productoid = p.productoid
          AND pv.preciounitario >= $${indiceMin}
      )`);
    } else if (precioMax) {
      valores.push(precioMax);
      const indiceMax = valores.length;
      filtros.push(`EXISTS (
        SELECT 1
        FROM producto_variantes pv
        WHERE pv.productoid = p.productoid
          AND pv.preciounitario <= $${indiceMax}
      )`);
    }

    if (dimension) {
      valores.push(`%${dimension}%`);
      const indiceDimension = valores.length;
      filtros.push(`EXISTS (
        SELECT 1
        FROM producto_variantes pv
        WHERE pv.productoid = p.productoid
          AND pv.dimensiones ILIKE $${indiceDimension}
      )`);
    }

    if (stock === "true") {
      filtros.push(`EXISTS (
        SELECT 1
        FROM producto_variantes pv
        WHERE pv.productoid = p.productoid
          AND pv.stock > 0
      )`);
    }

    if (proveedorID) {
      valores.push(parseInt(proveedorID, 10));
      const indiceProveedor = valores.length;
      filtros.push(`p.proveedorid_default = $${indiceProveedor}`);
    }

    // Filtro por categoría
    if (categoria) {
      valores.push(parseInt(categoria, 10));
      const indiceCategoria = valores.length;
      filtros.push(`p.categoriaid = $${indiceCategoria}`);
    }

    // Filtro por productos en oferta (con precio de oferta)
    if (oferta === "true") {
      filtros.push(`EXISTS (
        SELECT 1
        FROM producto_variantes pv
        WHERE pv.productoid = p.productoid
          AND pv.preciooferta IS NOT NULL
          AND pv.preciooferta < pv.preciounitario
      )`);
    }

    const whereClause =
      filtros.length > 0 ? `WHERE ${filtros.join(" AND ")}` : "";

    const query = `
      SELECT
        p.productoid,
        p.nombreproducto,
        p.descripcion,
        p.activo,
        p.categoriaid,
        c.nombre AS categorianombre,
        c.descripcion AS categoriadescripcion,
        variante_min.varianteid AS varianteid_precio_min,
        variante_min.sku AS sku_precio_min,
        variante_min.dimensiones AS dimensiones_precio_min,
        variante_min.stock AS stock_precio_min,
        variante_min.preciounitario AS precio_desde,
        variante_min.preciooferta AS preciooferta,
        imagen.url_imagen,
        imagen.textoalternativo,
        stats.total_variantes,
        stats.variantes_con_stock
      FROM productos p
      LEFT JOIN categorias c ON p.categoriaid = c.categoriaid
      LEFT JOIN LATERAL (
        SELECT
          pv.varianteid,
          pv.sku,
          pv.dimensiones,
          pv.stock,
          pv.preciounitario,
          pv.preciooferta
        FROM producto_variantes pv
        WHERE pv.productoid = p.productoid
        ORDER BY 
          COALESCE(pv.preciooferta, pv.preciounitario) ASC NULLS LAST, 
          pv.varianteid ASC
        LIMIT 1
      ) variante_min ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          pi.url_imagen,
          pi.textoalternativo
        FROM producto_variantes pv
        JOIN producto_imagenes pi ON pi.varianteid = pv.varianteid
        WHERE pv.productoid = p.productoid
        ORDER BY pv.preciounitario ASC NULLS LAST, pi.orden ASC NULLS LAST, pi.imagenid ASC
        LIMIT 1
      ) imagen ON TRUE
      LEFT JOIN (
        SELECT
          pv.productoid,
          COUNT(*) AS total_variantes,
          SUM(CASE WHEN pv.stock > 0 THEN 1 ELSE 0 END) AS variantes_con_stock
        FROM producto_variantes pv
        GROUP BY pv.productoid
      ) stats ON stats.productoid = p.productoid
      ${whereClause}
      ORDER BY ${sort === "newest" ? "p.productoid DESC" : "p.productoid DESC"}
      ${limit ? `LIMIT ${parseInt(limit, 10)}` : ""}
    `;

    const result = await db.query(query, valores);

    const productRows = result.rows;
    const productoIds = productRows.map((row) => row.productoid);

    const variantPriceMap = new Map();
    if (productoIds.length) {
      const variantesQuery = await db.query(
        `SELECT productoid, preciounitario
         FROM producto_variantes
         WHERE productoid = ANY($1::int[])
           AND preciounitario IS NOT NULL`,
        [productoIds]
      );

      variantesQuery.rows.forEach((row) => {
        const productId = row.productoid;
        const precioUnitario = parseFloat(row.preciounitario);
        if (!Number.isNaN(precioUnitario)) {
          if (!variantPriceMap.has(productId)) {
            variantPriceMap.set(productId, []);
          }
          variantPriceMap.get(productId).push(precioUnitario);
        }
      });
    }

    const valueCandidates = [
      "valor",
      "cantidad",
      "piezas",
      "piezasporpaquete",
      "numeropiezas",
      "tamano",
      "cantidadpiezas",
    ];

    const tamanosMap = new Map();
    if (productoIds.length) {
      const tamanosQuery = await db.query(
        `SELECT ptd.productoid, ptd.tamanoid, row_to_json(ct) AS tamano_info
         FROM producto_tamanosdisponibles ptd
         INNER JOIN cat_tamanopaquetes ct ON ct.tamanoid = ptd.tamanoid
         WHERE ptd.productoid = ANY($1::int[])`,
        [productoIds]
      );

      tamanosQuery.rows.forEach((row) => {
        const productId = row.productoid;
        const tamanoInfo = row.tamano_info || {};

        let valor = null;
        for (const key of valueCandidates) {
          if (Object.prototype.hasOwnProperty.call(tamanoInfo, key)) {
            const parsed = parseInt(tamanoInfo[key], 10);
            if (!Number.isNaN(parsed) && parsed > 0) {
              valor = parsed;
              break;
            }
          }

          const capitalized = key.charAt(0).toUpperCase() + key.slice(1);
          if (Object.prototype.hasOwnProperty.call(tamanoInfo, capitalized)) {
            const parsed = parseInt(tamanoInfo[capitalized], 10);
            if (!Number.isNaN(parsed) && parsed > 0) {
              valor = parsed;
              break;
            }
          }
        }

        if (valor !== null) {
          if (!tamanosMap.has(productId)) {
            tamanosMap.set(productId, []);
          }
          tamanosMap.get(productId).push(valor);
        }
      });
    }

    const productos = productRows.map((row) => {
      const totalVariantes =
        row.total_variantes !== null ? parseInt(row.total_variantes, 10) : 0;
      const variantesConStock =
        row.variantes_con_stock !== null
          ? parseInt(row.variantes_con_stock, 10)
          : 0;

      const precioOferta =
        row.preciooferta !== null && row.preciooferta !== undefined
          ? parseFloat(row.preciooferta)
          : null;

      const varianteDestacada = row.varianteid_precio_min
        ? {
            varianteId: row.varianteid_precio_min,
            sku: row.sku_precio_min,
            dimensiones: row.dimensiones_precio_min || null,
            stock:
              row.stock_precio_min !== null
                ? parseInt(row.stock_precio_min, 10)
                : null,
            precioUnitario:
              row.precio_desde !== null ? parseFloat(row.precio_desde) : null,
            precioOferta: precioOferta,
          }
        : null;

      const productId = row.productoid;
      const variantPrices = variantPriceMap.get(productId) || [];
      const tamanoValores = tamanosMap.get(productId) || [];

      const preciosPaquete = [];
      if (variantPrices.length) {
        if (tamanoValores.length) {
          variantPrices.forEach((precioUnitario) => {
            tamanoValores.forEach((tamanoValor) => {
              if (Number.isFinite(precioUnitario) && tamanoValor > 0) {
                preciosPaquete.push(precioUnitario * tamanoValor);
              }
            });
          });
        } else {
          preciosPaquete.push(...variantPrices);
        }
      }

      const precioPaqueteMin =
        preciosPaquete.length > 0
          ? Math.min(
              ...preciosPaquete.map((precio) =>
                Number.isFinite(precio) ? parseFloat(precio.toFixed(2)) : precio
              )
            )
          : null;
      const precioPaqueteMax =
        preciosPaquete.length > 0
          ? Math.max(
              ...preciosPaquete.map((precio) =>
                Number.isFinite(precio) ? parseFloat(precio.toFixed(2)) : precio
              )
            )
          : null;

      return {
        productoId: productId,
        nombreProducto: row.nombreproducto,
        descripcion: row.descripcion,
        categoria: row.categoriaid
          ? {
              categoriaId: row.categoriaid,
              nombre: row.categorianombre,
              descripcion: row.categoriadescripcion,
            }
          : null,
        precioDesde:
          row.precio_desde !== null ? parseFloat(row.precio_desde) : null,
        precioOferta: precioOferta,
        tieneOferta:
          precioOferta !== null &&
          precioOferta < parseFloat(row.precio_desde || 0),
        precioPaqueteMin,
        precioPaqueteMax,
        imagenUrl: row.url_imagen || null,
        imagenAlt: row.textoalternativo || null,
        totalVariantes,
        variantesConStock,
        varianteDestacada,
      };
    });

    res.status(200).json({
      success: true,
      message: "Productos obtenidos exitosamente",
      data: {
        productos,
        total: productos.length,
      },
    });
  } catch (error) {
    console.error("Error al obtener productos:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener los productos",
      error: error.message,
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
      `SELECT DISTINCT TRIM(dimensiones) AS dimension
       FROM producto_variantes
       WHERE dimensiones IS NOT NULL AND dimensiones <> ''
       ORDER BY dimension ASC`
    );

    const dimensiones = result.rows.map((row) => row.dimension);

    res.status(200).json({
      success: true,
      message: "Dimensiones obtenidas exitosamente",
      data: {
        dimensiones,
        total: dimensiones.length,
      },
    });
  } catch (error) {
    console.error("Error al obtener dimensiones:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener las dimensiones",
      error: error.message,
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

    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "ID de producto inválido",
      });
    }

    const productoResult = await db.query(
      `SELECT
         p.productoid,
         p.nombreproducto,
         p.descripcion,
         p.activo,
         p.categoriaid,
         c.nombre AS categorianombre,
         c.descripcion AS categoriadescripcion
       FROM productos p
       LEFT JOIN categorias c ON p.categoriaid = c.categoriaid
       WHERE p.productoid = $1`,
      [id]
    );

    if (productoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Producto no encontrado",
      });
    }

    const producto = productoResult.rows[0];

    const variantesResult = await db.query(
      `SELECT
         pv.varianteid,
         pv.productoid,
         pv.sku,
         pv.dimensiones,
         pv.costounitario,
         pv.preciounitario,
         pv.stock,
         pv.tipoproductoid,
         pv.medidaid,
         COALESCE(
           json_agg(
             json_build_object(
               'imagenId', pi.imagenid,
               'url', pi.url_imagen,
               'alt', pi.textoalternativo,
               'orden', pi.orden
             ) ORDER BY pi.orden ASC NULLS LAST, pi.imagenid ASC
           ) FILTER (WHERE pi.imagenid IS NOT NULL),
           '[]'::json
         ) AS imagenes
       FROM producto_variantes pv
       LEFT JOIN producto_imagenes pi ON pi.varianteid = pv.varianteid
       WHERE pv.productoid = $1
       GROUP BY pv.varianteid
       ORDER BY pv.varianteid ASC`,
      [id]
    );

    const variantes = variantesResult.rows.map((row) => {
      const precioUnitario =
        row.preciounitario !== null ? parseFloat(row.preciounitario) : null;
      const costoUnitario =
        row.costounitario !== null ? parseFloat(row.costounitario) : null;
      const stock = row.stock !== null ? parseInt(row.stock, 10) : null;

      const imagenes = Array.isArray(row.imagenes)
        ? row.imagenes.map((img) => ({
            imagenId: img.imagenId,
            url: img.url,
            alt: img.alt,
            orden:
              img.orden !== null && img.orden !== undefined
                ? parseInt(img.orden, 10)
                : null,
          }))
        : [];

      return {
        varianteId: row.varianteid,
        productoId: row.productoid,
        productoId: row.productoid,
        sku: row.sku,
        dimensiones: row.dimensiones,
        costoUnitario,
        precioUnitario,
        stock,
        tipoProductoId:
          row.tipoproductoid !== null ? parseInt(row.tipoproductoid, 10) : null,
        medidaId: row.medidaid !== null ? parseInt(row.medidaid, 10) : null,
        imagenes,
      };
    });

    const tamanosQuery = `
      SELECT ptd.tamanoid, ct.*
      FROM producto_tamanosdisponibles ptd
      INNER JOIN cat_tamanopaquetes ct ON ct.tamanoid = ptd.tamanoid
      WHERE ptd.productoid = $1
    `;

    const tamanosResult = await db.query(tamanosQuery, [id]);

    const valueCandidates = [
      "valor",
      "piezas",
      "piezasporpaquete",
      "cantidad",
      "numeropiezas",
      "tamano",
      "cantidadpiezas",
    ];

    const labelCandidates = ["etiqueta", "descripcion", "nombre", "label"];

    const tamanosDisponibles = tamanosResult.rows
      .map((row) => {
        const tamanoId = Number.parseInt(row.tamanoid, 10);

        let valor = null;
        for (const field of valueCandidates) {
          if (
            Object.prototype.hasOwnProperty.call(row, field) &&
            row[field] !== null &&
            row[field] !== undefined
          ) {
            const parsed = Number.parseInt(row[field], 10);
            if (!Number.isNaN(parsed)) {
              valor = parsed;
              break;
            }
          }
        }

        let etiqueta = null;
        for (const field of labelCandidates) {
          if (
            Object.prototype.hasOwnProperty.call(row, field) &&
            typeof row[field] === "string" &&
            row[field].trim()
          ) {
            etiqueta = row[field].trim();
            break;
          }
        }

        return {
          tamanoId,
          valor,
          etiqueta,
        };
      })
      .sort((a, b) => {
        if (Number.isFinite(a.valor) && Number.isFinite(b.valor)) {
          return a.valor - b.valor;
        }
        if (Number.isFinite(a.valor)) return -1;
        if (Number.isFinite(b.valor)) return 1;
        return a.tamanoId - b.tamanoId;
      });

    const totalVariantes = variantes.length;
    const variantesConStock = variantes.filter(
      (v) => typeof v.stock === "number" && v.stock > 0
    ).length;
    const precios = variantes
      .map((v) => v.precioUnitario)
      .filter((precio) => typeof precio === "number" && !Number.isNaN(precio));
    const precioDesde = precios.length ? Math.min(...precios) : null;
    const precioHasta = precios.length ? Math.max(...precios) : null;

    const productoDetalle = {
      productoId: producto.productoid,
      nombreProducto: producto.nombreproducto,
      descripcion: producto.descripcion,
      activo: producto.activo,
      categoria: producto.categoriaid
        ? {
            categoriaId: producto.categoriaid,
            nombre: producto.categorianombre,
            descripcion: producto.categoriadescripcion,
          }
        : null,
      totalVariantes,
      variantesConStock,
      precioDesde,
      precioHasta,
    };

    res.status(200).json({
      success: true,
      message: "Producto obtenido exitosamente",
      data: {
        producto: productoDetalle,
        variantes,
        tamanosDisponibles,
      },
    });
  } catch (error) {
    console.error("Error al obtener producto:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener el producto",
      error: error.message,
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
    const categorias = result.rows.map((row) => ({
      categoriaId: row.categoriaid,
      nombre: row.nombre,
      descripcion: row.descripcion,
    }));

    res.status(200).json({
      success: true,
      message: "Categorías obtenidas exitosamente",
      data: {
        categorias,
        total: categorias.length,
      },
    });
  } catch (error) {
    console.error("Error al obtener categorías:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener las categorías",
      error: error.message,
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
    const agentes = result.rows.map((row) => ({
      agenteId: row.agenteid,
      codigoAgente: row.codigoagente,
      nombre: row.nombre,
      apellido: row.apellido,
    }));

    res.status(200).json({
      success: true,
      message: "Agentes obtenidos exitosamente",
      data: {
        agentes,
        total: agentes.length,
      },
    });
  } catch (error) {
    console.error("Error al obtener agentes públicos:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener la lista de agentes",
      error: error.message,
    });
  }
};

module.exports = {
  obtenerProductos,
  obtenerProductoPorId,
  obtenerCategorias,
  obtenerAgentesPublicos,
  obtenerDimensiones,
  obtenerProveedoresPublicos,
};
