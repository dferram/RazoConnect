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
      WHERE COALESCE(p.Activo, TRUE) = TRUE
      ORDER BY prov.NombreEmpresa ASC
    `;

    const result = await db.query(query);

    let proveedores = result.rows.map((row) => ({
      proveedorId: row.proveedorid,
      nombre: row.nombreempresa,
    }));

    if (!proveedores.length) {
      const fallbackResult = await db.query(
        `SELECT proveedorid, nombreempresa
         FROM proveedores
         ORDER BY nombreempresa ASC`
      );

      proveedores = fallbackResult.rows.map((row) => ({
        proveedorId: row.proveedorid,
        nombre: row.nombreempresa,
      }));
    }

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

const obtenerTiposProducto = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT DISTINCT tp.nombre
       FROM tipoproducto tp
       WHERE tp.activo = TRUE
         AND tp.nombre IS NOT NULL
         AND TRIM(tp.nombre) <> ''
       ORDER BY tp.nombre ASC`
    );

    const tipos = result.rows
      .map((row) => (row.nombre !== null ? String(row.nombre).trim() : ""))
      .filter((nombre) => nombre.length);

    return res.status(200).json({
      success: true,
      message: "Tipos de producto obtenidos exitosamente",
      data: {
        tipos,
        total: tipos.length,
      },
    });
  } catch (error) {
    console.error("Error al obtener tipos de producto:", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener los tipos de producto",
      error: error.message,
    });
  }
};

/**
 * Obtener tipos de producto disponibles para exploración pública
 * GET /api/public/tipos-producto
 */
const obtenerTiposProductoPublicos = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT tp.tipoproductoid, tp.nombre, tp.descripcion
       FROM tipoproducto tp
       WHERE tp.activo = TRUE
       ORDER BY tp.nombre ASC`
    );

    const tipos = result.rows.map((row) => ({
      tipoProductoId: row.tipoproductoid,
      nombre: row.nombre,
      descripcion: row.descripcion,
    }));

    return res.status(200).json({
      success: true,
      message: "Tipos de producto obtenidos exitosamente",
      data: {
        tipos,
        total: tipos.length,
      },
    });
  } catch (error) {
    console.error("Error al obtener tipos de producto públicos:", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener los tipos de producto",
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
      tipo,
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
      const proveedorIDParsed = parseInt(proveedorID, 10);
      if (!isNaN(proveedorIDParsed)) {
        valores.push(proveedorIDParsed);
        const indiceProveedor = valores.length;
        filtros.push(`p.proveedorid_default = $${indiceProveedor}`);
      }
    }

    // Filtro por categoría
    if (categoria) {
      const categoriaParsed = parseInt(categoria, 10);
      if (!isNaN(categoriaParsed)) {
        valores.push(categoriaParsed);
        const indiceCategoria = valores.length;
        filtros.push(`p.categoriaid = $${indiceCategoria}`);
      }
    }

    const filtroTipoRaw = tipo && String(tipo).trim() ? String(tipo).trim() : null;
    const filtroTipoUpper = filtroTipoRaw ? filtroTipoRaw.toUpperCase() : null;
    const esFiltroRegla = filtroTipoUpper
      ? ["DOCENA", "PAQUETE", "UNITARIO"].includes(filtroTipoUpper)
      : false;

    const buildFiltros = (colCantidadEmpaque) => {
      const filtrosLocal = [...filtros];
      const valoresLocal = [...valores];

      // Filtro por tipo de producto (Caja, Peluche, etc.)
      if (filtroTipoRaw) {
        if (esFiltroRegla) {
          const regla = filtroTipoUpper === "DOCENA" ? "PAQUETE" : filtroTipoUpper;
          if (regla === "PAQUETE") {
            filtrosLocal.push(
              `EXISTS (
                SELECT 1
                FROM proveedor_reglas_empaque pre_f
                WHERE pre_f.reglaid = p.reglaid
                  AND COALESCE(pre_f.${colCantidadEmpaque}, 1) > 1
              )`
            );
          } else {
            filtrosLocal.push(
              `NOT EXISTS (
                SELECT 1
                FROM proveedor_reglas_empaque pre_f
                WHERE pre_f.reglaid = p.reglaid
                  AND COALESCE(pre_f.${colCantidadEmpaque}, 1) > 1
              )`
            );
          }
        } else {
          valoresLocal.push(filtroTipoRaw);
          const indiceTipo = valoresLocal.length;
          filtrosLocal.push(`EXISTS (
            SELECT 1
            FROM proveedor_reglas_empaque pre_tipo
            INNER JOIN tipoproducto tp ON tp.tipoproductoid = pre_tipo.tipoproductoid
            WHERE pre_tipo.reglaid = p.reglaid
              AND tp.activo = TRUE
              AND tp.nombre = $${indiceTipo}
          )`);
        }
      }

      return { filtrosLocal, valoresLocal };
    };

    // Filtro por productos en oferta (con precio de oferta)
    if (oferta === "true") {
      filtros.push(`EXISTS (
        SELECT 1
        FROM producto_variantes pv
        WHERE pv.productoid = p.productoid
          AND pv.precioofertaunitario IS NOT NULL
          AND pv.precioofertaunitario < pv.preciounitario
      )`);
    }

    // FILTRO CRÍTICO: Solo productos y categorías activas (visibilidad para clientes)
    filtros.push(`p.activo = TRUE`);
    filtros.push(`(c.activo = TRUE OR c.activo IS NULL)`);

    const buildWhereClause = (filtrosFinal) =>
      filtrosFinal.length ? `WHERE ${filtrosFinal.join(" AND ")}` : "";

    const varianteOrderBy =
      oferta === "true"
        ? `
          CASE
            WHEN pv.precioofertaunitario IS NOT NULL
             AND pv.precioofertaunitario < pv.preciounitario
            THEN 0
            ELSE 1
          END,
          COALESCE(pv.precioofertaunitario, pv.preciounitario) ASC NULLS LAST,
          pv.varianteid ASC
        `
        : `
          COALESCE(pv.precioofertaunitario, pv.preciounitario) ASC NULLS LAST,
          pv.varianteid ASC
        `;

    const buildQuery = (colCantidadEmpaque, whereClauseFinal) => `
      SELECT
        p.productoid,
        p.nombreproducto,
        p.sku_maestro,
        p.descripcion,
        p.activo,
        p.categoriaid,
        c.nombre AS categorianombre,
        c.descripcion AS categoriadescripcion,
        pre.tipoproductoid AS tipo_productoid,
        tipo_info.nombre AS tipo_producto,
        COALESCE(regla_empaque.${colCantidadEmpaque}, 1) AS multiplo_empaque,
        variante_min.varianteid AS varianteid_precio_min,
        variante_min.sku AS sku_precio_min,
        variante_min.dimensiones AS dimensiones_precio_min,
        variante_min.stock AS stock_precio_min,
        variante_min.preciounitario AS precio_desde,
        variante_min.precioofertaunitario AS preciooferta,
        imagen.url_imagen,
        imagen.textoalternativo,
        stats.total_variantes,
        stats.variantes_con_stock
      FROM productos p
      LEFT JOIN categorias c ON p.categoriaid = c.categoriaid
      LEFT JOIN proveedor_reglas_empaque pre ON pre.reglaid = p.reglaid
      LEFT JOIN tipoproducto tipo_info ON tipo_info.tipoproductoid = pre.tipoproductoid
      LEFT JOIN LATERAL (
        SELECT pre2.${colCantidadEmpaque}
        FROM proveedor_reglas_empaque pre2
        WHERE pre2.reglaid = p.reglaid
        LIMIT 1
      ) regla_empaque ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          pv.varianteid,
          pv.sku,
          pv.dimensiones,
          pv.stock,
          pv.preciounitario,
          pv.precioofertaunitario
        FROM producto_variantes pv
        WHERE pv.productoid = p.productoid
        ORDER BY ${varianteOrderBy}
        LIMIT 1
      ) variante_min ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          pi.url_imagen,
          pi.textoalternativo
        FROM producto_imagenes pi
        WHERE pi.productoid = p.productoid
        ORDER BY pi.orden ASC NULLS LAST, pi.imagenid ASC
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
      ${whereClauseFinal}
      ORDER BY ${sort === "newest" ? "p.productoid DESC" : "p.productoid DESC"}
      ${limit ? `LIMIT ${parseInt(limit, 10)}` : ""}
    `;

    let result;
    try {
      const { filtrosLocal, valoresLocal } = buildFiltros("cantidadempaque");
      const whereClauseFinal = buildWhereClause(filtrosLocal);
      result = await db.query(buildQuery("cantidadempaque", whereClauseFinal), valoresLocal);
    } catch (dbError) {
      if (dbError && dbError.code === "42703") {
        const { filtrosLocal, valoresLocal } = buildFiltros("piezasporpaquete");
        const whereClauseFinal = buildWhereClause(filtrosLocal);
        result = await db.query(buildQuery("piezasporpaquete", whereClauseFinal), valoresLocal);
      } else {
        throw dbError;
      }
    }

    const productRows = result.rows;
    const productoIds = productRows.map((row) => row.productoid);

    const piezasPorVarianteMap = new Map();
    const stockMaestroMap = new Map();

    if (productoIds.length) {
      const variantesStockResult = await db.query(
        `SELECT productoid, varianteid, stock, piezasporpaquete
         FROM producto_variantes
         WHERE productoid = ANY($1::int[])`,
        [productoIds]
      );

      variantesStockResult.rows.forEach((row) => {
        const productId = row.productoid;
        const piezasPorPaquete =
          row.piezasporpaquete !== null
            ? parseInt(row.piezasporpaquete, 10)
            : null;
        const stockFisico =
          row.stock !== null ? Math.max(parseInt(row.stock, 10), 0) : 0;

        piezasPorVarianteMap.set(row.varianteid, {
          piezasPorPaquete,
          stockFisico,
        });

        if (piezasPorPaquete === 1) {
          stockMaestroMap.set(productId, stockFisico);
        }
      });
    }

    const variantPriceMap = new Map();
    const minSellingPriceMap = new Map();
    const maxSellingPriceMap = new Map();
    const hasActiveOfferMap = new Map();

    if (productoIds.length) {
      const variantesQuery = await db.query(
        `SELECT productoid, preciounitario, precioofertaunitario, activo
         FROM producto_variantes
         WHERE productoid = ANY($1::int[])
           AND preciounitario IS NOT NULL`,
        [productoIds]
      );

      variantesQuery.rows.forEach((row) => {
        const productId = row.productoid;
        const precioUnitario = parseFloat(row.preciounitario);
        const precioOferta =
          row.precioofertaunitario !== null &&
          row.precioofertaunitario !== undefined
            ? parseFloat(row.precioofertaunitario)
            : null;

        const estaActiva = row.activo === null || row.activo === undefined
          ? true
          : Boolean(row.activo);

        if (!estaActiva || Number.isNaN(precioUnitario)) {
          return;
        }

        if (!variantPriceMap.has(productId)) {
          variantPriceMap.set(productId, []);
        }
        variantPriceMap.get(productId).push(precioUnitario);

        const tieneOfertaValida =
          precioOferta !== null &&
          !Number.isNaN(precioOferta) &&
          precioOferta > 0 &&
          precioOferta < precioUnitario;

        const precioVigente = tieneOfertaValida ? precioOferta : precioUnitario;
        if (!Number.isFinite(precioVigente)) {
          return;
        }

        const minActual = minSellingPriceMap.get(productId);
        const maxActual = maxSellingPriceMap.get(productId);

        minSellingPriceMap.set(
          productId,
          minActual === undefined ? precioVigente : Math.min(minActual, precioVigente)
        );
        maxSellingPriceMap.set(
          productId,
          maxActual === undefined ? precioVigente : Math.max(maxActual, precioVigente)
        );

        if (tieneOfertaValida) {
          hasActiveOfferMap.set(productId, true);
        } else if (!hasActiveOfferMap.has(productId)) {
          hasActiveOfferMap.set(productId, false);
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

      let varianteDestacada = null;
      if (row.varianteid_precio_min) {
        const piezasInfo =
          piezasPorVarianteMap.get(row.varianteid_precio_min) || null;
        const piezasPorPaquete =
          piezasInfo?.piezasPorPaquete !== undefined
            ? piezasInfo.piezasPorPaquete
            : null;

        let stockVariante =
          piezasInfo?.stockFisico ??
          (row.stock_precio_min !== null
            ? Math.max(parseInt(row.stock_precio_min, 10), 0)
            : null);

        if (
          piezasPorPaquete &&
          piezasPorPaquete > 1 &&
          stockMaestroMap.has(productId)
        ) {
          stockVariante = Math.floor(
            stockMaestroMap.get(productId) / piezasPorPaquete
          );
        }

        varianteDestacada = {
          varianteId: row.varianteid_precio_min,
          sku: row.sku_precio_min,
          dimensiones: row.dimensiones_precio_min || null,
          stock: stockVariante,
          piezasPorPaquete,
          precioUnitario:
            row.precio_desde !== null ? parseFloat(row.precio_desde) : null,
          precioOferta: precioOferta,
        };
      }

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

      const minSellingPrice = minSellingPriceMap.has(productId)
        ? minSellingPriceMap.get(productId)
        : null;
      const maxSellingPrice = maxSellingPriceMap.has(productId)
        ? maxSellingPriceMap.get(productId)
        : null;
      const hasActiveOffer = Boolean(hasActiveOfferMap.get(productId));

      return {
        productoId: productId,
        nombreProducto: row.nombreproducto,
        sku_maestro: row.sku_maestro || null,
        descripcion: row.descripcion,
        tipoProductoId:
          row.tipo_productoid !== null && row.tipo_productoid !== undefined
            ? Number.parseInt(row.tipo_productoid, 10)
            : null,
        tipoProducto:
          row.tipo_producto !== null && row.tipo_producto !== undefined
            ? String(row.tipo_producto)
            : null,
        reglaBackorder:
          Number.parseInt(row.multiplo_empaque, 10) > 1 ? "PAQUETE" : "UNITARIO",
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
        minSellingPrice,
        maxSellingPrice,
        hasActiveOffer,
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
         p.sku_maestro,
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
         pv.precioofertaunitario,
         pv.stock,
         pv.piezasporpaquete,
         pv.tipoproductoid,
         pv.medidaid,
         pv.color_nombre,
         COALESCE(
           (
             SELECT json_agg(
               json_build_object(
                 'imagenId', pvi.imagenid,
                 'url', pvi.url_imagen,
                 'alt', pvi.textoalternativo,
                 'orden', pvi.orden
               ) ORDER BY pvi.orden ASC NULLS LAST, pvi.imagenid ASC
             )
             FROM producto_variante_imagenes pvi
             WHERE pvi.varianteid = pv.varianteid
           ),
           (
             SELECT json_agg(
               json_build_object(
                 'imagenId', pi2.imagenid,
                 'url', pi2.url_imagen,
                 'alt', pi2.textoalternativo,
                 'orden', pi2.orden
               ) ORDER BY pi2.orden ASC NULLS LAST, pi2.imagenid ASC
             )
             FROM producto_imagenes pi2
             WHERE pi2.productoid = pv.productoid
           ),
           '[]'::json
         ) AS imagenes
       FROM producto_variantes pv
       WHERE pv.productoid = $1
       ORDER BY pv.varianteid ASC`,
      [id]
    );

    const variantesRaw = variantesResult.rows;

    const varianteMaestra = variantesRaw.find((row) => {
      if (row.piezasporpaquete === null || row.piezasporpaquete === undefined) {
        return false;
      }
      const piezas = parseInt(row.piezasporpaquete, 10);
      return !Number.isNaN(piezas) && piezas === 1;
    });

    const stockMaestro =
      varianteMaestra && varianteMaestra.stock !== null
        ? Math.max(parseInt(varianteMaestra.stock, 10), 0)
        : null;

    const variantes = variantesRaw.map((row) => {
      const precioUnitario =
        row.preciounitario !== null ? parseFloat(row.preciounitario) : null;
      const precioOfertaUnitario =
        row.precioofertaunitario !== null ? parseFloat(row.precioofertaunitario) : null;
      const costoUnitario =
        row.costounitario !== null ? parseFloat(row.costounitario) : null;
      const piezasPorPaquete =
        row.piezasporpaquete !== null
          ? parseInt(row.piezasporpaquete, 10)
          : null;
      let stockCalculado =
        row.stock !== null ? Math.max(parseInt(row.stock, 10), 0) : null;
      if (
        piezasPorPaquete &&
        piezasPorPaquete > 1 &&
        typeof stockMaestro === "number"
      ) {
        stockCalculado = Math.floor(stockMaestro / piezasPorPaquete);
      }

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
        sku: row.sku,
        dimensiones: row.dimensiones,
        colorNombre: row.color_nombre,
        costoUnitario,
        precioUnitario,
        precioOfertaUnitario,
        stock: stockCalculado,
        piezasPorPaquete,
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

    // Obtener imágenes por color
    const imagenesColorResult = await db.query(
      `SELECT imagencolorid, color_nombre, url_imagen_cloudinary, fechacreacion
       FROM producto_imagenes_color
       WHERE productoid = $1
       ORDER BY color_nombre ASC, fechacreacion ASC`,
      [id]
    );

    const imagenesColor = imagenesColorResult.rows.map((row) => ({
      imagenColorId: row.imagencolorid,
      colorNombre: row.color_nombre,
      urlImagen: row.url_imagen_cloudinary,
      fechaCreacion: row.fechacreacion,
    }));

    const productoDetalle = {
      productoId: producto.productoid,
      nombreProducto: producto.nombreproducto,
      sku_maestro: producto.sku_maestro || null,
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
        imagenesColor,
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
        descripcion,
        activo
      FROM categorias
      WHERE activo = TRUE
      ORDER BY nombre ASC
    `;

    const result = await db.query(query);

    // Formatear la respuesta
    const categorias = result.rows.map((row) => ({
      categoriaId: row.categoriaid,
      nombre: row.nombre,
      descripcion: row.descripcion,
      activo: row.activo,
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
  obtenerProveedoresPublicos,
  obtenerTiposProductoPublicos,
  obtenerTiposProducto,
  obtenerProductos,
  obtenerDimensiones,
  obtenerProductoPorId,
  obtenerCategorias,
  obtenerAgentesPublicos,
};
