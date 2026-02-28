/**
 * BÚSQUEDA INVENTARIO CONTROLLER
 * 
 * Controlador especializado para búsqueda de productos en inventario.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/busquedaInventarioController
 * @author RazoConnect Team
 * @date 2026-02-27
 */

const db = require('../db');
const SmartStockService = require('../services/SmartStockService');

const buscarProductosAjuste = async (req, res) => {
  try {
    if (!req.tenant || !req.tenant.tenant_id) {
      return res.status(500).json({
        success: false,
        message: "Error: tenant no disponible"
      });
    }

    const { tenant_id } = req.tenant;
    const q = (req.query.q || "").toString().trim();

    if (!q || q.length < 2) {
      return res.json({
        success: true,
        data: []
      });
    }

    const searchPattern = `%${q}%`;

    const query = `
      SELECT 
        p.productoid,
        p.nombreproducto,
        pv.varianteid,
        pv.sku,
        pv.dimensiones,
        pv.color_nombre,
        pv.preciounitario,
        pv.precioofertaunitario,
        pv.piezasporpaquete,
        (SELECT pvi.url_imagen FROM producto_variante_imagenes pvi 
         WHERE pvi.varianteid = pv.varianteid AND pvi.tenant_id = $2 
         ORDER BY pvi.orden ASC LIMIT 1) as imagen_variante,
        (SELECT pi.url_imagen FROM producto_imagenes pi 
         WHERE pi.productoid = p.productoid AND pi.tenant_id = $2 
         ORDER BY pi.orden ASC LIMIT 1) as imagen_producto,
        COALESCE(
          (SELECT pvi.url_imagen FROM producto_variante_imagenes pvi 
           WHERE pvi.varianteid = pv.varianteid AND pvi.tenant_id = $2 
           ORDER BY pvi.orden ASC LIMIT 1),
          (SELECT pi.url_imagen FROM producto_imagenes pi 
           WHERE pi.productoid = p.productoid AND pi.tenant_id = $2 
           ORDER BY pi.orden ASC LIMIT 1)
        ) as imagen_url
      FROM productos p
      INNER JOIN producto_variantes pv ON pv.productoid = p.productoid
      WHERE p.tenant_id = $2
        AND pv.tenant_id = $2
        AND COALESCE(p.activo, TRUE) = TRUE
        AND COALESCE(pv.activo, TRUE) = TRUE
        AND (
          pv.sku ILIKE $1
          OR p.nombreproducto ILIKE $1
          OR COALESCE(pv.color_nombre, '') ILIKE $1
          OR COALESCE(pv.dimensiones, '') ILIKE $1
          OR CONCAT_WS(' ', p.nombreproducto, pv.dimensiones, pv.color_nombre) ILIKE $1
        )
      ORDER BY p.nombreproducto ASC, pv.varianteid ASC
      LIMIT 20
    `;

    const result = await db.query(query, [searchPattern, tenant_id]);
    

    const varianteIds = result.rows.map(row => row.varianteid);
    const productoIds = [...new Set(result.rows.map(row => row.productoid))];
    
    const stockMap = await SmartStockService.getBulkStock({
      varianteIds,
      userId: req.user.id || req.user.userId,
      userRole: req.user.roles || [req.user.rol],
      tenantId: tenant_id
    });

    const tamanosQuery = `
      SELECT 
        ptd.productoid,
        ptd.tamanoid,
        ctp.cantidad
      FROM producto_tamanosdisponibles ptd
      INNER JOIN cat_tamanopaquetes ctp ON ctp.tamanoid = ptd.tamanoid
      WHERE ptd.productoid = ANY($1::int[]) 
        AND ptd.tenant_id = $2
        AND ctp.tenant_id = $2
      ORDER BY ctp.cantidad ASC
    `;

    const tamanosResult = await db.query(tamanosQuery, [productoIds, tenant_id]);
    
    const tamanosPorProducto = new Map();
    tamanosResult.rows.forEach(row => {
      if (!tamanosPorProducto.has(row.productoid)) {
        tamanosPorProducto.set(row.productoid, []);
      }
      tamanosPorProducto.get(row.productoid).push({
        tamanoId: row.tamanoid,
        cantidad: row.cantidad,
        nombre: `Pack ${row.cantidad}`
      });
    });

    if (result.rows.length > 0) {
      result.rows.forEach(row => {
        const stock = stockMap.get(row.varianteid) || 0;
        const tamanos = tamanosPorProducto.get(row.productoid) || [];
      });
    }

    const productosMap = new Map();

    for (const row of result.rows) {
      const productId = row.productoid;
      
      if (!productosMap.has(productId)) {
        productosMap.set(productId, {
          productoId: productId,
          nombreProducto: row.nombreproducto,
          variantes: []
        });
      }

      const producto = productosMap.get(productId);
      const tamanosDisponibles = tamanosPorProducto.get(productId) || [];
      
      producto.variantes.push({
        varianteId: row.varianteid,
        sku: row.sku,
        dimensiones: row.dimensiones || 'N/A',
        colorNombre: row.color_nombre || '',
        stock: stockMap.get(row.varianteid) || 0,
        precioUnitario: parseFloat(row.preciounitario) || 0,
        precioOfertaUnitario: row.precioofertaunitario ? parseFloat(row.precioofertaunitario) : null,
        piezasPorPaquete: parseInt(row.piezasporpaquete, 10) || 1,
        imagenUrl: row.imagen_url || null,
        tamanos: tamanosDisponibles
      });
    }

    const productos = Array.from(productosMap.values());

    return res.json({
      success: true,
      data: productos
    });

  } catch (error) {
    console.error("Error en buscarProductosAjuste:", error);
    return res.status(500).json({
      success: false,
      message: "Error al buscar productos",
      error: error.message
    });
  }
};

const buscarProductosCompra = async (req, res) => {
  try {
    
    // Validación defensiva: verificar que req.tenant existe
    if (!req.tenant || !req.tenant.tenant_id) {
      console.error("ERROR CRÍTICO: req.tenant no está definido o no tiene tenant_id");
      return res.status(500).json({
        success: false,
        message: "Error de configuración del servidor: tenant no detectado"
      });
    }
    
    const { tenant_id } = req.tenant;
    
    const qRaw = (req.query.q || "").toString().trim();
    const allRaw = (req.query.all || "").toString().trim().toLowerCase();
    const all = allRaw === "1" || allRaw === "true";

    const filtrarProveedorRaw = (req.query.filtrarProveedor || "")
      .toString()
      .trim()
      .toLowerCase();
    const filtrarProveedor =
      filtrarProveedorRaw === "1" || filtrarProveedorRaw === "true";

    const proveedorId = Number.parseInt(req.query.proveedorId, 10);
    const categoriaId = Number.parseInt(req.query.categoriaId, 10);
    const medidaId = Number.parseInt(req.query.medidaId, 10);
    const medidaRaw = (req.query.medida || "").toString().trim();

    const hasProveedor = Number.isInteger(proveedorId) && proveedorId > 0;
    const hasProveedorFiltro = filtrarProveedor && hasProveedor;
    const hasCategoria = Number.isInteger(categoriaId) && categoriaId > 0;
    const hasMedidaId = Number.isInteger(medidaId) && medidaId > 0;
    const hasMedidaStr = !!medidaRaw;

    const hasQ = !!qRaw && qRaw.length >= 2;

    if (
      !all &&
      !hasQ &&
      !hasProveedorFiltro &&
      !hasCategoria &&
      !hasMedidaId &&
      !hasMedidaStr
    ) {
      return res.json({
        success: true,
        data: {
          resultados: [],
        },
      });
    }

    const q = hasQ ? `%${qRaw}%` : null;

    const reglasProveedorId = hasProveedor ? proveedorId : null;
    const whereParts = [
      "COALESCE(pv.activo, TRUE) = TRUE",
      "COALESCE(p.activo, TRUE) = TRUE",
      "p.tenant_id = $2",
      "pv.tenant_id = $2",
    ];
    const params = [reglasProveedorId, tenant_id];
    let i = 3;

    if (q) {
      whereParts.push(
        "(pv.sku ILIKE $" +
          i +
          " OR p.nombreproducto ILIKE $" +
          i +
          " OR COALESCE(pv.color_nombre, '') ILIKE $" +
          i +
          ")"
      );
      params.push(q);
      i += 1;
    }

    if (hasProveedorFiltro) {
      whereParts.push("p.proveedorid_default = $1::INTEGER");
    }

    if (hasCategoria) {
      whereParts.push("p.categoriaid = $" + i);
      params.push(categoriaId);
      i += 1;
    }

    if (hasMedidaId) {
      whereParts.push("pv.medidaid = $" + i);
      params.push(medidaId);
      i += 1;
    } else if (hasMedidaStr) {
      whereParts.push("TRIM(COALESCE(pv.dimensiones, '')) = $" + i);
      params.push(medidaRaw);
      i += 1;
    }

    const limit = all ? 5000 : 50;


    const sqlQuery = `SELECT
         pv.varianteid,
         pv.sku,
         pv.productoid,
         p.nombreproducto,
         p.sku_maestro,
         p.proveedorid_default,
         p.categoriaid,
         COALESCE(regla.cantidadempaque, 1) AS regla_empaque,
         COALESCE(regla.cantidadempaque, 1) AS cantidad_empaque,
         pv.dimensiones,
         COALESCE(m.nombremedida, pv.dimensiones) AS nombremedida,
         pv.color_nombre,
         pv.costounitario,
         pv.stock,
         pv.piezasporpaquete,
         img_producto.url_imagen AS url_imagen_producto,
         img_variante.url_imagen AS url_imagen_variante
       FROM producto_variantes pv
       INNER JOIN productos p ON p.productoid = pv.productoid AND pv.tenant_id = p.tenant_id
       LEFT JOIN medidas m ON m.medidaid = pv.medidaid
       LEFT JOIN LATERAL (
         SELECT pre.cantidadempaque
         FROM proveedor_reglas_empaque pre
         WHERE pre.reglaid = p.reglaid AND p.reglaid IS NOT NULL
           AND ($1::INTEGER IS NULL OR pre.proveedorid = $1::INTEGER)
         LIMIT 1
       ) regla ON true
       LEFT JOIN LATERAL (
         SELECT pi.url_imagen
         FROM producto_imagenes pi
         WHERE pi.productoid = p.productoid
           AND pi.tenant_id = $2
         ORDER BY pi.orden ASC NULLS LAST, pi.imagenid ASC
         LIMIT 1
       ) img_producto ON true
       LEFT JOIN LATERAL (
         SELECT pvi.url_imagen
         FROM producto_variante_imagenes pvi
         WHERE pvi.varianteid = pv.varianteid
           AND pvi.tenant_id = $2
         ORDER BY pvi.orden ASC NULLS LAST, pvi.imagenid ASC
         LIMIT 1
       ) img_variante ON true
       WHERE ${whereParts.join(" AND ")}
       ORDER BY p.nombreproducto ASC, pv.varianteid ASC
       LIMIT ${limit}`;


    const result = await db.query(sqlQuery, params);
    

    const resultados = (result.rows || []).map((row) => {
      const nombreProducto = (row.nombreproducto || "").toString().trim();
      const medidaLabel =
        (row.dimensiones && row.dimensiones.toString().trim()) ||
        (row.nombremedida && row.nombremedida.toString().trim()) ||
        "";
      const color = (row.color_nombre || "").toString().trim();
      const partes = [nombreProducto];
      if (medidaLabel) partes.push(medidaLabel);
      if (color) partes.push(color);

      return {
        varianteid: row.varianteid,
        sku: row.sku,
        productoid: row.productoid ?? null,
        proveedorid: row.proveedorid_default ?? null,
        categoriaid: row.categoriaid ?? null,
        nombreproducto: row.nombreproducto ?? null,
        sku_maestro: row.sku_maestro ?? null,
        regla_empaque: Number.isInteger(row.regla_empaque)
          ? row.regla_empaque
          : Number.parseInt(row.regla_empaque, 10) || 1,
        cantidad_empaque: Number.isInteger(row.cantidad_empaque)
          ? row.cantidad_empaque
          : Number.parseInt(row.cantidad_empaque, 10) || 1,
        nombre_completo: partes.join(" "),
        medidas: medidaLabel || null,
        color: color || null,
        costounitario: row.costounitario ? Number.parseFloat(row.costounitario) : 0,
        url_imagen_variante: row.url_imagen_variante || null,
        url_imagen_producto: row.url_imagen_producto || null,
        stock: row.stock ?? 0,
        piezasporpaquete: row.piezasporpaquete ?? 1,
      };
    });

    return res.json({
      success: true,
      data: {
        resultados,
      },
    });
  } catch (error) {
    console.error("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.error("❌ ERROR CRÍTICO en buscarProductosCompra");
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.error("Timestamp:", new Date().toISOString());
    console.error("Tenant ID:", req.tenant?.tenant_id || "NO DETECTADO");
    console.error("Query params:", JSON.stringify(req.query, null, 2));
    console.error("\n--- Error de PostgreSQL ---");
    console.error("Message:", error.message);
    console.error("Code:", error.code);
    console.error("Detail:", error.detail);
    console.error("Hint:", error.hint);
    console.error("Position:", error.position);
    console.error("Where:", error.where);
    console.error("Schema:", error.schema);
    console.error("Table:", error.table);
    console.error("Column:", error.column);
    console.error("DataType:", error.dataType);
    console.error("Constraint:", error.constraint);
    console.error("\n--- Stack Trace ---");
    console.error(error.stack);
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    
    return res.status(500).json({
      success: false,
      message: "Error al buscar productos",
      error: error.message,
      code: error.code,
      detail: error.detail,
      hint: error.hint
    });
  }
};

module.exports = {
  buscarProductosAjuste,
  buscarProductosCompra
};
