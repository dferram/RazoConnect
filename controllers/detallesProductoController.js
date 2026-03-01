/**
 * DETALLES PRODUCTO CONTROLLER
 * 
 * Controlador especializado para obtener detalles completos de productos.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/detallesProductoController
 * @author RazoConnect Team
 * @date 2026-02-27
 */

const db = require('../db');
const logger = require('../utils/logger');

/**
 * Obtener detalle de un producto maestro con sus variantes
 * GET /api/admin/productos/:id
 */
const getProductoDetalle = async (req, res) => {
  try {
    const productoId = parseInt(req.params.id, 10);

    if (Number.isNaN(productoId)) {
      return res.status(400).json({
        success: false,
        message: "ProductoID inválido",
      });
    }

    const productoResult = await db.query(
      `SELECT
         p.productoid,
         p.nombreproducto,
         p.sku_maestro,
         p.descripcion,
         p.proveedorid_default,
         p.activo,
         p.categoriaid,
         p.reglaid,
         pre.tipoproductoid,
         c.nombre AS categorianombre,
         c.descripcion AS categoriadescripcion
       FROM productos p
       LEFT JOIN categorias c ON c.categoriaid = p.categoriaid
       LEFT JOIN proveedor_reglas_empaque pre ON pre.reglaid = p.reglaid
       LEFT JOIN tipoproducto tp ON tp.tipoproductoid = pre.tipoproductoid
       WHERE p.productoid = $1`,
      [productoId]
    );

    if (productoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Producto no encontrado",
      });
    }

    const producto = productoResult.rows[0];

    const imagenesResult = await db.query(
      `SELECT
         pi.imagenid,
         pi.url_imagen,
         pi.textoalternativo,
         pi.orden
       FROM producto_imagenes pi
       WHERE pi.productoid = $1
       ORDER BY pi.orden ASC NULLS LAST, pi.imagenid ASC`,
      [productoId]
    );

    const imagenesProducto = imagenesResult.rows.map((row) => ({
      imagenId: row.imagenid,
      url: row.url_imagen,
      textoAlternativo: row.textoalternativo || null,
      orden: row.orden !== null && row.orden !== undefined ? parseInt(row.orden, 10) : null,
    }));

    const variantesResult = await db.query(
      `SELECT
         pv.varianteid,
         pv.productoid,
         pv.sku,
         pv.dimensiones,
         pv.costounitario,
         pv.preciounitario,
         pv.piezasporpaquete,
         pv.stock,
         pv.tipoproductoid,
         pv.medidaid,
         pv.color_nombre,
         pv.activo
       FROM producto_variantes pv
       WHERE pv.productoid = $1
       ORDER BY pv.varianteid ASC`,
      [productoId]
    );

    // Fetch variant images separately
    const variantImagenesResult = await db.query(
      `SELECT 
         pvi.varianteid,
         pvi.url_imagen,
         pvi.textoalternativo,
         pvi.orden
       FROM producto_variante_imagenes pvi
       WHERE pvi.varianteid = ANY(
         SELECT varianteid FROM producto_variantes WHERE productoid = $1
       )
       ORDER BY pvi.varianteid, pvi.orden`,
      [productoId]
    );

    // Group images by varianteid
    const variantImagenesMap = {};
    variantImagenesResult.rows.forEach(img => {
      if (!variantImagenesMap[img.varianteid]) {
        variantImagenesMap[img.varianteid] = [];
      }
      variantImagenesMap[img.varianteid].push({
        url: img.url_imagen,
        textoAlternativo: img.textoalternativo,
        orden: img.orden
      });
    });

    const tamanosQuery = `
      SELECT ptd.tamanoid, ct.*
      FROM producto_tamanosdisponibles ptd
      INNER JOIN cat_tamanopaquetes ct ON ct.tamanoid = ptd.tamanoid
      WHERE ptd.productoid = $1
    `;

    const tamanosResult = await db.query(tamanosQuery, [productoId]);

    const valueCandidates = [
      "valor",
      "cantidad",
      "piezas",
      "piezasporpaquete",
      "numeropiezas",
      "tamano",
      "cantidadpiezas",
    ];

    const labelCandidates = ["etiqueta", "descripcion", "nombre", "label"];

    const tamanosDisponibles = tamanosResult.rows
      .map((row) => {
        const tamanoId = Number.parseInt(row.tamanoid, 10);

        let valor = null;
        for (const key of valueCandidates) {
          if (Object.prototype.hasOwnProperty.call(row, key)) {
            const parsed = Number.parseInt(row[key], 10);
            if (!Number.isNaN(parsed) && parsed > 0) {
              valor = parsed;
              break;
            }
          }
        }

        let etiqueta = null;
        for (const key of labelCandidates) {
          if (
            Object.prototype.hasOwnProperty.call(row, key) &&
            typeof row[key] === "string" &&
            row[key].trim()
          ) {
            etiqueta = row[key].trim();
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

    const tamanoReferencia = tamanosDisponibles.find(
      (tam) => Number.isFinite(tam.valor) && tam.valor > 0
    );

    const buildEtiqueta = (tamano) => {
      if (!tamano) return null;
      if (tamano.etiqueta) return tamano.etiqueta;
      if (tamano.valor === 1) return "Pieza individual";
      if (Number.isFinite(tamano.valor) && tamano.valor > 1)
        return `Pack de ${tamano.valor}`;
      return `Presentación ${tamano.tamanoId}`;
    };

    // Variantes reales en BD
    const variantes = variantesResult.rows.map((row) => {
      const precioUnitario =
        row.preciounitario !== null ? parseFloat(row.preciounitario) : null;
      const costoUnitario =
        row.costounitario !== null ? parseFloat(row.costounitario) : null;
      const stock = row.stock !== null ? parseInt(row.stock, 10) : 0;

      const piezasPorPaquete =
        row.piezasporpaquete !== null && row.piezasporpaquete !== undefined
          ? parseInt(row.piezasporpaquete, 10)
          : null;

      const precioPaquete =
        precioUnitario !== null && tamanoReferencia?.valor
          ? parseFloat((precioUnitario * tamanoReferencia.valor).toFixed(2))
          : null;

      // Get images for this variant
      const variantImages = variantImagenesMap[row.varianteid] || [];
      const primaryImage = variantImages.length > 0 ? variantImages[0].url : null;

      return {
        varianteId: row.varianteid,
        productoId: row.productoid,
        sku: row.sku || null,
        dimensiones: row.dimensiones || null,
        colorNombre: row.color_nombre || null,
        urlImagenVariante: primaryImage,
        imagenes: variantImages,
        costoUnitario,
        precioUnitario,
        precioPaquete,
        presentacionEtiqueta: buildEtiqueta(tamanoReferencia),
        tamanoValorReferencia: tamanoReferencia?.valor || null,
        stock,
        piezasPorPaquete:
          Number.isInteger(piezasPorPaquete) && piezasPorPaquete > 0
            ? piezasPorPaquete
            : 1,
        tipoEmpaque: null,
        tipoProductoId:
          row.tipoproductoid !== null ? parseInt(row.tipoproductoid, 10) : null,
        medidaId: row.medidaid !== null ? parseInt(row.medidaid, 10) : null,
        activo: row.activo !== undefined ? row.activo : true,
      };
    });

    // Variantes pendientes de aprobación desde control_cambios
    const cambiosPendientesResult = await db.query(
      `SELECT id, datos_nuevos
       FROM control_cambios
       WHERE entidad = 'producto_variantes'
         AND tipo_cambio = 'INSERT'
         AND estado = 'PENDIENTE'`
    );

    const variantesPendientes = cambiosPendientesResult.rows
      .map((rowCambio) => {
        let datos = rowCambio.datos_nuevos;
        if (!datos || typeof datos !== "object") {
          try {
            datos = JSON.parse(rowCambio.datos_nuevos);
          } catch (e) {
            return null;
          }
        }

        const pendienteProductoIdRaw =
          datos.productoid ?? datos.ProductoID ?? datos.productoId;
        const pendienteProductoId = Number.parseInt(pendienteProductoIdRaw, 10);

        if (
          !Number.isInteger(pendienteProductoId) ||
          pendienteProductoId !== productoId
        ) {
          return null;
        }

        const precioUnitario =
          datos.preciounitario !== undefined && datos.preciounitario !== null
            ? Number.parseFloat(datos.preciounitario)
            : null;
        const costoUnitario =
          datos.costounitario !== undefined && datos.costounitario !== null
            ? Number.parseFloat(datos.costounitario)
            : null;
        const stock =
          datos.stock !== undefined && datos.stock !== null
            ? Number.parseInt(datos.stock, 10)
            : 0;

        const precioPaquete =
          precioUnitario !== null && tamanoReferencia?.valor
            ? Number.parseFloat(
                (precioUnitario * tamanoReferencia.valor).toFixed(2)
              )
            : null;

        const tipoProductoId =
          datos.tipoproductoid !== undefined && datos.tipoproductoid !== null
            ? Number.parseInt(datos.tipoproductoid, 10)
            : null;
        const medidaId =
          datos.medidaid !== undefined && datos.medidaid !== null
            ? Number.parseInt(datos.medidaid, 10)
            : null;

        const activo =
          datos.activo !== undefined && datos.activo !== null
            ? Boolean(datos.activo)
            : true;

        return {
          varianteId: null,
          productoId: pendienteProductoId,
          sku: datos.sku || null,
          dimensiones: datos.dimensiones || null,
          costoUnitario,
          precioUnitario,
          precioPaquete,
          presentacionEtiqueta: buildEtiqueta(tamanoReferencia),
          tamanoValorReferencia: tamanoReferencia?.valor || null,
          stock,
          tipoProductoId,
          medidaId,
          activo,
          isPending: true,
          controlCambioId: rowCambio.id,
        };
      })
      .filter(Boolean);

    const variantesCombinadas = [...variantes, ...variantesPendientes];

    const productoDetalle = {
      productoId: producto.productoid,
      nombreProducto: producto.nombreproducto,
      sku_maestro: producto.sku_maestro || null,
      descripcion: producto.descripcion,
      proveedorid_default:
        producto.proveedorid_default !== null &&
        producto.proveedorid_default !== undefined
          ? Number.parseInt(producto.proveedorid_default, 10)
          : null,
      activo: producto.activo,
      TipoProductoID:
        producto.tipoproductoid !== null && producto.tipoproductoid !== undefined
          ? Number.parseInt(producto.tipoproductoid, 10)
          : null,
      imagenes: imagenesProducto,
      categoria: producto.categoriaid
        ? {
            categoriaId: producto.categoriaid,
            nombre: producto.categorianombre,
            descripcion: producto.categoriadescripcion,
          }
        : null,
      totalVariantes: variantesCombinadas.length,
      variantesConStock: variantesCombinadas.filter(
        (v) => typeof v.stock === "number" && v.stock > 0
      ).length,
    };

    return res.json({
      success: true,
      message: "Producto obtenido exitosamente",
      data: {
        producto: productoDetalle,
        variantes: variantesCombinadas,
        tamanosDisponibles,
      },
    });
  } catch (error) {
    logger.error('Error al obtener detalle de producto:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "Error en el servidor"
    });
  }
};

module.exports = {
  getProductoDetalle
};
