/**
 * VARIANTES ADMIN CONTROLLER
 * 
 * Controlador especializado para CRUD de variantes de productos.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/variantesAdminController
 * @author RazoConnect Team
 * @date 2026-02-27
 */

const db = require('../db');
const { solicitarCambio, aprobarSolicitudes } = require('../services/ChangeRequestService');
const auditService = require('../services/auditService');
const { generarSkuUnico } = require('../utils/skuGenerator');

const normalizeUploadedFiles = (req) => {
  const files = [];

  if (Array.isArray(req.files)) {
    req.files.forEach((f) => files.push(f));
    return files;
  }

  if (req.files && typeof req.files === "object") {
    const a = Array.isArray(req.files.imagenes) ? req.files.imagenes : [];
    const b = Array.isArray(req.files.images) ? req.files.images : [];
    return [...a, ...b];
  }

  return files;
};

const safeUnlinkUploads = async (files) => {
  // Con Cloudinary, los archivos se gestionan en la nube
  // No es necesario eliminar archivos locales
  // Esta función se mantiene por compatibilidad pero no hace nada
  return;
};

const parseGaleriaPayload = (raw) => {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "object") return raw;
  const txt = String(raw).trim();
  if (!txt) return null;
  try {
    return JSON.parse(txt);
  } catch (e) {
    return null;
  }
};

const applyGaleriaVarianteAtomic = async ({
  client,
  varianteId,
  galeria,
  uploadedFiles,
  baseUrl,
}) => {
  const files = Array.isArray(uploadedFiles) ? uploadedFiles : [];
  const galeriaArr = Array.isArray(galeria) ? galeria : null;

  if (!galeriaArr) {
    return { portadaUrl: null, imagenes: [] };
  }

  const existingItems = galeriaArr
    .filter((it) => it && String(it.type || it.tipo).toLowerCase() === "existing")
    .map((it) => Number.parseInt(it.imagenId ?? it.imagenid, 10))
    .filter((n) => Number.isInteger(n) && n > 0);

  const newItems = galeriaArr
    .filter((it) => it && String(it.type || it.tipo).toLowerCase() === "new")
    .map((it) => {
      const uploadIndex = Number.parseInt(it.uploadIndex ?? it.uploadindex, 10);
      return Number.isInteger(uploadIndex) && uploadIndex >= 0 ? uploadIndex : null;
    })
    .filter((n) => n !== null);

  const existingDb = await client.query(
    `SELECT imagenid, url_imagen, textoalternativo, orden
     FROM producto_variante_imagenes
     WHERE varianteid = $1`,
    [varianteId]
  );
  const existingDbIds = (existingDb.rows || [])
    .map((r) => Number.parseInt(r.imagenid, 10))
    .filter((n) => Number.isInteger(n) && n > 0);

  const keepSet = new Set(existingItems);
  const toDelete = existingDbIds.filter((id) => !keepSet.has(id));

  if (toDelete.length) {
    await client.query(
      `DELETE FROM producto_variante_imagenes
       WHERE varianteid = $1
         AND imagenid = ANY($2::int[])`,
      [varianteId, toDelete]
    );
  }

  let orden = 0;

  for (const item of galeriaArr) {
    const type = String(item?.type || item?.tipo || "").toLowerCase();
    orden += 1;

    if (type === "existing") {
      const imagenId = Number.parseInt(item.imagenId ?? item.imagenid, 10);
      if (!Number.isInteger(imagenId) || imagenId <= 0) continue;
      await client.query(
        `UPDATE producto_variante_imagenes
         SET orden = $1
         WHERE varianteid = $2 AND imagenid = $3`,
        [orden, varianteId, imagenId]
      );
      continue;
    }

    if (type === "new") {
      // Soportar URLs de Cloudinary directas (nuevo sistema) o archivos subidos por multer (legacy)
      let rutaImagen = null;
      
      // Prioridad 1: URL de Cloudinary (nuevo sistema de upload directo)
      if (item.url && typeof item.url === 'string' && item.url.trim()) {
        rutaImagen = item.url.trim();
      } 
      // Prioridad 2: uploadIndex para archivos de multer (legacy)
      else {
        const uploadIndex = Number.parseInt(item.uploadIndex ?? item.uploadindex, 10);
        if (Number.isInteger(uploadIndex) && uploadIndex >= 0) {
          const file = files[uploadIndex];
          if (file && file.path) {
            rutaImagen = file.path;
          }
        }
      }
      
      if (!rutaImagen) continue;

      const alt =
        item.textoalternativo !== undefined
          ? (() => {
              if (item.textoalternativo === null) return null;
              const txt = String(item.textoalternativo).trim();
              return txt.length ? txt : null;
            })()
          : item.textoAlternativo !== undefined
            ? (() => {
                if (item.textoAlternativo === null) return null;
                const txt = String(item.textoAlternativo).trim();
                return txt.length ? txt : null;
              })()
            : null;
      await client.query(
        `INSERT INTO producto_variante_imagenes (url_imagen, textoalternativo, orden, varianteid)
         VALUES ($1, $2, $3, $4)`,
        [rutaImagen, alt, orden, varianteId]
      );
      continue;
    }
  }

  const portadaRes = await client.query(
    `SELECT url_imagen
     FROM producto_variante_imagenes
     WHERE varianteid = $1
     ORDER BY orden ASC NULLS LAST, imagenid ASC
     LIMIT 1`,
    [varianteId]
  );

  const portadaRuta = portadaRes.rows?.[0]?.url_imagen || null;

  const imagenesFinalRes = await client.query(
    `SELECT imagenid, url_imagen, textoalternativo, orden
     FROM producto_variante_imagenes
     WHERE varianteid = $1
     ORDER BY orden ASC NULLS LAST, imagenid ASC`,
    [varianteId]
  );

  const imagenes = (imagenesFinalRes.rows || []).map((row) => ({
    imagenId: row.imagenid,
    rutaImagen: row.url_imagen,
    urlCompleta: `${baseUrl}${row.url_imagen}`,
    textoAlternativo: row.textoalternativo || null,
    orden: row.orden,
  }));

  // ============================================
  // REPLICACIÓN AUTOMÁTICA A VARIANTES HERMANAS
  // ============================================
  if (imagenes.length > 0) {
    try {
      // Obtener productoid y color_nombre de la variante actual
      const varianteInfoResult = await client.query(
        `SELECT productoid, color_nombre 
         FROM producto_variantes 
         WHERE varianteid = $1`,
        [varianteId]
      );

      if (varianteInfoResult.rows.length > 0) {
        const { productoid, color_nombre } = varianteInfoResult.rows[0];

        // Buscar variantes hermanas (mismo producto + color) que NO tengan imágenes
        const variantesHermanasResult = await client.query(
          `SELECT pv.varianteid
           FROM producto_variantes pv
           WHERE pv.productoid = $1
             AND pv.varianteid != $2
             AND (pv.color_nombre = $3 OR (pv.color_nombre IS NULL AND $3 IS NULL))
             AND NOT EXISTS (
               SELECT 1 
               FROM producto_variante_imagenes pvi 
               WHERE pvi.varianteid = pv.varianteid
             )`,
          [productoid, varianteId, color_nombre]
        );

        const variantesHermanas = variantesHermanasResult.rows;

        if (variantesHermanas.length > 0) {
          for (const hermana of variantesHermanas) {
            for (const img of imagenesFinalRes.rows) {
              await client.query(
                `INSERT INTO producto_variante_imagenes (varianteid, url_imagen, textoalternativo, orden)
                 VALUES ($1, $2, $3, $4)`,
                [hermana.varianteid, img.url_imagen, img.textoalternativo, img.orden]
              );
            }
          }
        }
      }
    } catch (replicacionError) {
      // No fallar la operación principal si falla la replicación
      console.error(`[REPLICACION_IMG] Error durante replicación en applyGaleriaVarianteAtomic:`, replicacionError);
    }
  }

  return {
    portadaUrl: portadaRuta ? `${baseUrl}${portadaRuta}` : null,
    imagenes,
  };
};

/**
 * Crear una variante
 * POST /api/admin/variantes
 *
 * Nuevo flujo: no inserta directamente en Producto_Variantes.
 * Registra una solicitud de cambio (INSERT) en control_cambios para revisión.
 */
const crearVariante = async (req, res) => {
  const galeriaParsed = parseGaleriaPayload(req.body?.galeria);
  const uploadedFiles = normalizeUploadedFiles(req);
  const isAtomic = Array.isArray(galeriaParsed) || uploadedFiles.length > 0;

  if (isAtomic) {
    const rolUsuario = (req?.user?.rol || "").toString().trim().toLowerCase();
    const allowDirect = rolUsuario === "admin" || rolUsuario === "superadmin";
    if (!allowDirect) {
      await safeUnlinkUploads(uploadedFiles);
      return res.status(403).json({
        success: false,
        message: "No tienes permisos para guardar variantes con imágenes en una sola operación.",
      });
    }

    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");

      const {
        productoId,
        dimensiones,
        costoUnitario,
        precioUnitario,
        precioOfertaUnitario,
        stock,
        tipoProductoId,
        medidaId,
        color_nombre,
        activo,
      } = req.body || {};

      const parsedProductoId = Number.parseInt(productoId, 10);
      if (!parsedProductoId || Number.isNaN(parsedProductoId)) {
        throw Object.assign(new Error("productoId es obligatorio y debe ser numérico"), {
          status: 400,
        });
      }

      const dimensionesFinal = (() => {
        if (dimensiones === undefined) return null;
        if (dimensiones === null) return null;
        const txt = String(dimensiones).trim();
        return txt.length ? txt : null;
      })();

      if (!dimensionesFinal) {
        throw Object.assign(new Error("dimensiones es obligatorio para generar el SKU"), {
          status: 400,
        });
      }

      if (
        precioUnitario === undefined ||
        precioUnitario === null ||
        String(precioUnitario).trim() === ""
      ) {
        throw Object.assign(new Error("precioUnitario es obligatorio"), { status: 400 });
      }

      const precioUnitarioNum = Number.parseFloat(precioUnitario);
      if (!Number.isFinite(precioUnitarioNum) || precioUnitarioNum <= 0) {
        throw Object.assign(new Error("precioUnitario debe ser un número mayor a 0"), {
          status: 400,
        });
      }

      const stockNum =
        stock === undefined || stock === null || stock === ""
          ? 0
          : Number.parseInt(stock, 10);
      if (!Number.isInteger(stockNum) || stockNum < 0) {
        throw Object.assign(new Error("stock debe ser un entero mayor o igual a 0"), {
          status: 400,
        });
      }

      const costoUnitarioNumRaw =
        costoUnitario === undefined ||
        costoUnitario === null ||
        costoUnitario === ""
          ? 0
          : Number.parseFloat(costoUnitario);
      const costoUnitarioNum =
        Number.isFinite(costoUnitarioNumRaw) && costoUnitarioNumRaw >= 0
          ? costoUnitarioNumRaw
          : 0;

      let ofertaNum = null;
      if (
        precioOfertaUnitario !== undefined &&
        precioOfertaUnitario !== null &&
        String(precioOfertaUnitario).trim() !== ""
      ) {
        const parsedOferta = Number.parseFloat(precioOfertaUnitario);
        if (
          Number.isFinite(parsedOferta) &&
          parsedOferta > 0 &&
          parsedOferta < precioUnitarioNum
        ) {
          ofertaNum = parsedOferta;
        }
      }

      const activoFinal = activo !== undefined ? Boolean(activo) : true;

      const productoResult = await client.query(
        "SELECT productoid, sku_maestro FROM productos WHERE productoid = $1",
        [parsedProductoId]
      );
      if (!productoResult.rows.length) {
        throw Object.assign(new Error("Producto maestro no encontrado"), {
          status: 404,
        });
      }

      const skuMaestroBase = (productoResult.rows[0]?.sku_maestro || "")
        .toString()
        .trim();
      if (!skuMaestroBase) {
        throw Object.assign(
          new Error(
            "El producto no tiene SKU Maestro. Debe existir para generar el SKU de la variante."
          ),
          { status: 400 }
        );
      }

      const colorFinal = (() => {
        if (color_nombre === undefined || color_nombre === null) return null;
        const txt = String(color_nombre).trim();
        return txt.length ? txt : null;
      })();

      const skuMaestroSan = skuMaestroBase.toUpperCase().replace(/\s+/g, "");
      const skuTemporal = `${skuMaestroSan}-TEMP`;

      const insertRes = await client.query(
        `INSERT INTO producto_variantes
          (productoid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, preciounitario, precioofertaunitario, color_nombre, activo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING varianteid, productoid, sku, dimensiones, costounitario, preciounitario, precioofertaunitario, stock, tipoproductoid, medidaid, color_nombre, activo, piezasporpaquete`,
        [
          parsedProductoId,
          skuTemporal,
          dimensionesFinal,
          costoUnitarioNum,
          stockNum,
          tipoProductoId || null,
          medidaId || null,
          precioUnitarioNum,
          ofertaNum,
          colorFinal,
          activoFinal,
        ]
      );

      const row = insertRes.rows[0];
      const varianteId = row.varianteid;

      // Generar SKU final con el ID de la variante (formato: SKU_MAESTRO-00001)
      const varianteIdPadded = String(varianteId).padStart(5, '0');
      const skuFinal = `${skuMaestroSan}-${varianteIdPadded}`;

      // Actualizar el SKU con el ID real
      await client.query(
        'UPDATE producto_variantes SET sku = $1 WHERE varianteid = $2',
        [skuFinal, varianteId]
      );

      // Actualizar el row con el SKU final
      row.sku = skuFinal;
      const baseUrl = `${req.protocol}://${req.get("host")}`;

      const galeriaResult = await applyGaleriaVarianteAtomic({
        client,
        varianteId,
        galeria: galeriaParsed || [],
        uploadedFiles,
        baseUrl,
      });

      const usedUploadIndexes = new Set(
        (Array.isArray(galeriaParsed) ? galeriaParsed : [])
          .filter((it) => it && String(it.type || it.tipo).toLowerCase() === "new")
          .map((it) => Number.parseInt(it.uploadIndex ?? it.uploadindex, 10))
          .filter((n) => Number.isInteger(n) && n >= 0)
      );

      const unusedFiles = uploadedFiles.filter((_, idx) => !usedUploadIndexes.has(idx));
      await safeUnlinkUploads(unusedFiles);

      // Note: Image propagation by color is now handled automatically in applyGaleriaVarianteAtomic
      // for producto_variante_imagenes table

      await client.query("COMMIT");

      // ============================================
      // AUDITORÍA EXHAUSTIVA: CREACIÓN DE VARIANTE
      // ============================================
      try {
        await auditLogger.registrarCreacion({
          usuarioId: req.user?.id || req.user?.userId || null,
          nombreUsuario: req.user?.nombre || req.user?.email || 'Sistema',
          rol: req.user?.rol || req.user?.tipo || 'admin',
          entidad: 'Variante',
          entidadId: row.varianteid,
          datos: {
            productoid: row.productoid,
            sku: row.sku,
            dimensiones: row.dimensiones,
            costounitario: row.costounitario,
            preciounitario: row.preciounitario,
            precioofertaunitario: row.precioofertaunitario,
            stock: row.stock,
            tipoproductoid: row.tipoproductoid,
            medidaid: row.medidaid,
            color_nombre: row.color_nombre,
            activo: row.activo,
            piezasporpaquete: row.piezasporpaquete,
            cantidadImagenes: galeriaResult?.imagenes?.length || 0
          },
          ip: req.ip || req.connection?.remoteAddress || null,
          tenantId: req.tenant?.tenant_id || 1
        });
      } catch (auditError) {
        console.error('Error al registrar auditoría de creación de variante:', auditError);
      }

      return res.status(201).json({
        success: true,
        message: "Variante creada correctamente.",
        data: {
          variante: {
            varianteId: row.varianteid,
            productoId: row.productoid,
            sku: row.sku,
            dimensiones: row.dimensiones,
            colorNombre: row.color_nombre || null,
            urlImagenVariante: galeriaResult.portadaUrl || null,
            costoUnitario:
              row.costounitario !== null ? parseFloat(row.costounitario) : null,
            precioUnitario:
              row.preciounitario !== null ? parseFloat(row.preciounitario) : null,
            precioOfertaUnitario:
              row.precioofertaunitario !== null
                ? parseFloat(row.precioofertaunitario)
                : null,
            stock: row.stock !== null ? parseInt(row.stock, 10) : 0,
            activo: row.activo !== undefined ? row.activo : true,
            tipoproductoid: row.tipoproductoid,
            medidaid: row.medidaid,
            piezasporpaquete: row.piezasporpaquete,
          },
          galeria: galeriaResult,
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      await safeUnlinkUploads(uploadedFiles);
      const status = error && Number.isInteger(error.status) ? error.status : 500;
      return res.status(status).json({
        success: false,
        message: "Error en el servidor"
      });
    } finally {
      client.release();
    }
  }

  try {
    const {
      productoId,
      sku,
      dimensiones,
      costoUnitario,
      precioUnitario,
      precioOfertaUnitario,
      stock,
      tipoProductoId,
      medidaId,
      color_nombre,
      url_imagen_variante,
      activo,
    } = req.body || {};

    const rolUsuario = (req?.user?.rol || "").toString().trim().toLowerCase();
    const allowDirect = rolUsuario === "admin" || rolUsuario === "superadmin";

    const parsedProductoId = Number.parseInt(productoId, 10);
    if (!parsedProductoId || Number.isNaN(parsedProductoId)) {
      return res.status(400).json({
        success: false,
        message: "productoId es obligatorio y debe ser numérico",
      });
    }

    const dimensionesFinal =
      dimensiones === undefined
        ? null
        : (() => {
            if (dimensiones === null) return null;
            const txt = String(dimensiones).trim();
            return txt.length ? txt : null;
          })();

    if (!dimensionesFinal) {
      return res.status(400).json({
        success: false,
        message: "dimensiones es obligatorio para generar el SKU",
      });
    }

    if (
      precioUnitario === undefined ||
      precioUnitario === null ||
      String(precioUnitario).trim() === ""
    ) {
      return res.status(400).json({
        success: false,
        message: "precioUnitario es obligatorio",
      });
    }

    const precioUnitarioNum = Number.parseFloat(precioUnitario);
    if (!Number.isFinite(precioUnitarioNum) || precioUnitarioNum <= 0) {
      return res.status(400).json({
        success: false,
        message: "precioUnitario debe ser un número mayor a 0",
      });
    }

    const stockNum =
      stock === undefined || stock === null || stock === ""
        ? 0
        : Number.parseInt(stock, 10);
    if (!Number.isInteger(stockNum) || stockNum < 0) {
      return res.status(400).json({
        success: false,
        message: "stock debe ser un entero mayor o igual a 0",
      });
    }

    const costoUnitarioNumRaw =
      costoUnitario === undefined ||
      costoUnitario === null ||
      costoUnitario === ""
        ? 0
        : Number.parseFloat(costoUnitario);
    const costoUnitarioNum =
      Number.isFinite(costoUnitarioNumRaw) && costoUnitarioNumRaw >= 0
        ? costoUnitarioNumRaw
        : 0;

    let ofertaNum = null;
    if (
      precioOfertaUnitario !== undefined &&
      precioOfertaUnitario !== null &&
      String(precioOfertaUnitario).trim() !== ""
    ) {
      const parsedOferta = Number.parseFloat(precioOfertaUnitario);
      if (
        Number.isFinite(parsedOferta) &&
        parsedOferta > 0 &&
        parsedOferta < precioUnitarioNum
      ) {
        ofertaNum = parsedOferta;
      }
    }

    const activoFinal = activo !== undefined ? Boolean(activo) : true;

    // Verificar que el producto maestro exista, pero sin modificar tablas de negocio
    const productoResult = await db.query(
      "SELECT productoid, nombreproducto, sku_maestro FROM productos WHERE productoid = $1",
      [parsedProductoId]
    );

    if (productoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Producto maestro no encontrado",
      });
    }

    const productoRow = productoResult.rows[0];
    const skuMaestroBase = (productoRow?.sku_maestro || "").toString().trim();
    if (!skuMaestroBase) {
      return res.status(400).json({
        success: false,
        message:
          "El producto no tiene SKU Maestro. Debe existir para generar el SKU de la variante.",
      });
    }

    const colorFinal =
      color_nombre === undefined || color_nombre === null
        ? null
        : (() => {
            const txt = String(color_nombre).trim();
            return txt.length ? txt : null;
          })();

    const skuMaestroSan = skuMaestroBase.toUpperCase().replace(/\s+/g, "");
    const skuTemporal = `${skuMaestroSan}-TEMP`;

    // Usar nombres de columnas reales de Producto_Variantes (en minúsculas)
    const payloadNuevos = {
      productoid: parsedProductoId,
      sku: skuTemporal,
      dimensiones: dimensionesFinal,
      costounitario: costoUnitarioNum,
      preciounitario: precioUnitarioNum,
      precioofertaunitario: ofertaNum,
      stock: stockNum,
      tipoproductoid: tipoProductoId || null,
      medidaid: medidaId || null,
      color_nombre: colorFinal,
      activo: activoFinal,
    };

    if (allowDirect) {
      const insertRes = await db.query(
        `INSERT INTO producto_variantes
          (productoid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, preciounitario, precioofertaunitario, color_nombre, activo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING varianteid, productoid, sku, dimensiones, costounitario, preciounitario, precioofertaunitario, stock, tipoproductoid, medidaid, color_nombre, activo, piezasporpaquete`,
        [
          payloadNuevos.productoid,
          payloadNuevos.sku,
          payloadNuevos.dimensiones,
          payloadNuevos.costounitario,
          payloadNuevos.stock,
          payloadNuevos.tipoproductoid,
          payloadNuevos.medidaid,
          payloadNuevos.preciounitario,
          payloadNuevos.precioofertaunitario,
          payloadNuevos.color_nombre,
          payloadNuevos.activo,
        ]
      );

      const row = insertRes.rows[0];
      const varianteId = row.varianteid;

      // Generar SKU final con el ID de la variante (formato: SKU_MAESTRO-00001)
      const varianteIdPadded = String(varianteId).padStart(5, '0');
      const skuFinal = `${skuMaestroSan}-${varianteIdPadded}`;

      // Actualizar el SKU con el ID real
      await db.query(
        'UPDATE producto_variantes SET sku = $1 WHERE varianteid = $2',
        [skuFinal, varianteId]
      );

      // Actualizar el row con el SKU final
      row.sku = skuFinal;

      await auditService.registrarCambioPasivo(
        req,
        "producto_variantes",
        row.varianteid,
        "INSERT",
        null,
        row
      );

      return res.status(201).json({
        success: true,
        message: "Variante creada correctamente.",
        data: {
          variante: {
            varianteId: row.varianteid,
            productoId: row.productoid,
            sku: row.sku,
            dimensiones: row.dimensiones,
            colorNombre: row.color_nombre || null,
            urlImagenVariante: null,
            costoUnitario:
              row.costounitario !== null ? parseFloat(row.costounitario) : null,
            precioUnitario:
              row.preciounitario !== null ? parseFloat(row.preciounitario) : null,
            precioOfertaUnitario:
              row.precioofertaunitario !== null
                ? parseFloat(row.precioofertaunitario)
                : null,
            stock: row.stock ?? 0,
            activo: row.activo,
            piezasPorPaquete: row.piezasporpaquete,
            tipoProductoId: row.tipoproductoid ?? null,
            medidaId: row.medidaid ?? null,
          },
        },
      });
    }

    const resultado = await solicitarCambio(
      req,
      "producto_variantes",
      null,
      "INSERT",
      payloadNuevos,
      null
    );

    return res.status(201).json({
      success: true,
      message: resultado.mensaje,
      data: {
        solicitudId: resultado.solicitudId,
        estado: resultado.estado,
      },
    });
  } catch (error) {
    console.error("Error al crear variante (solicitud de cambio):", error);
    return res.status(500).json({
      success: false,
      message: "Error en el servidor"
    });
  }
};

/**
 * Actualizar una variante
 * PUT /api/admin/variantes/:id
 *
 * Soporta dos usos:
 * - Toggle rápido de visibilidad (solo 'activo').
 * - Edición de datos económicos: SKU, dimensiones, costo, precio, oferta.
 */
const actualizarVariante = async (req, res) => {
  const galeriaParsed = parseGaleriaPayload(req.body?.galeria);
  const uploadedFiles = normalizeUploadedFiles(req);
  const isAtomic = Array.isArray(galeriaParsed) || uploadedFiles.length > 0;

  if (isAtomic) {
    const varianteId = parseInt(req.params.id, 10);
    if (!varianteId || Number.isNaN(varianteId)) {
      await safeUnlinkUploads(uploadedFiles);
      return res.status(400).json({
        success: false,
        message: "ID de variante inválido",
      });
    }

    const rolUsuario = (req?.user?.rol || "").toString().trim().toLowerCase();
    const allowDirect = rolUsuario === "admin" || rolUsuario === "superadmin";
    if (!allowDirect) {
      await safeUnlinkUploads(uploadedFiles);
      return res.status(403).json({
        success: false,
        message: "No tienes permisos para guardar variantes con imágenes en una sola operación.",
      });
    }

    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");

      const {
        activo,
        dimensiones,
        costoUnitario,
        precioUnitario,
        precioOfertaUnitario,
        color_nombre,
      } = req.body || {};

      const result = await client.query(
        `SELECT v.VarianteID, v.SKU, v.Dimensiones, v.CostoUnitario, v.PrecioUnitario, v.PrecioOfertaUnitario, v.Stock, v.Activo,
                v.color_nombre, v.MedidaID, v.ProductoID,
                m.nombremedida as medida_nombre
         FROM Producto_Variantes v
         LEFT JOIN medidas m ON m.medidaid = v.medidaid
         WHERE v.VarianteID = $1`,
        [varianteId]
      );
      if (!result.rows.length) {
        throw Object.assign(new Error("Variante no encontrada"), { status: 404 });
      }

      const actual = result.rows[0];

      const parseNullableNumero = (raw) => {
        if (raw === undefined) return { usarActual: true, valor: null };
        if (raw === null || raw === "") {
          return { usarActual: false, valor: null };
        }
        const num = Number.parseFloat(raw);
        if (Number.isNaN(num)) {
          return { usarActual: false, valor: null };
        }
        return { usarActual: false, valor: num };
      };

      const normalizarTextoNullable = (raw) => {
        if (raw === undefined) return { usarActual: true, valor: null };
        if (raw === null) return { usarActual: false, valor: null };
        const txt = String(raw).trim();
        return { usarActual: false, valor: txt.length ? txt : null };
      };

      const dimensionesActual = actual.dimensiones;
      const costoActual =
        actual.costounitario !== null && actual.costounitario !== undefined
          ? Number.parseFloat(actual.costounitario)
          : null;
      const precioActual =
        actual.preciounitario !== null && actual.preciounitario !== undefined
          ? Number.parseFloat(actual.preciounitario)
          : null;
      const ofertaActual =
        actual.precioofertaunitario !== null && actual.precioofertaunitario !== undefined
          ? Number.parseFloat(actual.precioofertaunitario)
          : null;

      const nuevasDimensiones =
        dimensiones !== undefined
          ? (() => {
              if (dimensiones === null) return null;
              const texto = String(dimensiones).trim();
              return texto.length ? texto : null;
            })()
          : dimensionesActual;

      const costoParse = parseNullableNumero(costoUnitario);
      const nuevoCosto = costoParse.usarActual ? costoActual : costoParse.valor;

      const precioParse = parseNullableNumero(precioUnitario);
      const nuevoPrecio = precioParse.usarActual ? precioActual : precioParse.valor;

      if (nuevoPrecio === null || !(nuevoPrecio > 0)) {
        throw Object.assign(
          new Error(
            "El precio unitario debe ser un número mayor a 0 al editar la variante"
          ),
          { status: 400 }
        );
      }

      const ofertaParse = parseNullableNumero(precioOfertaUnitario);
      let nuevaOferta = ofertaParse.usarActual ? ofertaActual : ofertaParse.valor;
      if (nuevaOferta !== null && !(nuevaOferta > 0 && nuevaOferta < nuevoPrecio)) {
        nuevaOferta = null;
      }

      const colorParsed = normalizarTextoNullable(color_nombre);
      const colorFinal = colorParsed.usarActual
        ? actual.color_nombre ?? actual.color_nombre
        : colorParsed.valor;

      const activoFinal = activo !== undefined ? Boolean(activo) : Boolean(actual.activo);

      // ============================================
      // DETECCIÓN DE CAMBIOS Y AUDITORÍA
      // ============================================
      const cambiosDetectados = [];
      
      // Comparar dimensiones
      if (nuevasDimensiones !== dimensionesActual) {
        cambiosDetectados.push({
          campo: 'Dimensiones',
          valorAnterior: dimensionesActual || 'N/A',
          valorNuevo: nuevasDimensiones || 'N/A'
        });
      }
      
      // Comparar costo unitario
      if (nuevoCosto !== costoActual) {
        cambiosDetectados.push({
          campo: 'Costo Unitario',
          valorAnterior: costoActual !== null ? `$${costoActual.toFixed(2)}` : 'N/A',
          valorNuevo: nuevoCosto !== null ? `$${nuevoCosto.toFixed(2)}` : 'N/A'
        });
      }
      
      // Comparar precio unitario
      if (nuevoPrecio !== precioActual) {
        cambiosDetectados.push({
          campo: 'Precio Unitario',
          valorAnterior: precioActual !== null ? `$${precioActual.toFixed(2)}` : 'N/A',
          valorNuevo: nuevoPrecio !== null ? `$${nuevoPrecio.toFixed(2)}` : 'N/A'
        });
      }
      
      // Comparar precio oferta
      if (nuevaOferta !== ofertaActual) {
        cambiosDetectados.push({
          campo: 'Precio Oferta',
          valorAnterior: ofertaActual !== null ? `$${ofertaActual.toFixed(2)}` : 'Sin oferta',
          valorNuevo: nuevaOferta !== null ? `$${nuevaOferta.toFixed(2)}` : 'Sin oferta'
        });
      }
      
      // Comparar color
      const colorActual = actual.color_nombre || null;
      if (colorFinal !== colorActual) {
        cambiosDetectados.push({
          campo: 'Color',
          valorAnterior: colorActual || 'Sin color',
          valorNuevo: colorFinal || 'Sin color'
        });
      }
      
      // Comparar estado activo
      const activoActualBool = Boolean(actual.activo);
      if (activoFinal !== activoActualBool) {
        cambiosDetectados.push({
          campo: 'Estado',
          valorAnterior: activoActualBool ? 'Activo' : 'Inactivo',
          valorNuevo: activoFinal ? 'Activo' : 'Inactivo'
        });
      }

      const updateRes = await client.query(
        `UPDATE producto_variantes
         SET dimensiones = $1,
             costounitario = $2,
             preciounitario = $3,
             precioofertaunitario = $4,
             color_nombre = $5,
             activo = $6
         WHERE varianteid = $7
         RETURNING varianteid, productoid, sku, dimensiones, costounitario, preciounitario, precioofertaunitario, stock, activo, tipoproductoid, medidaid, color_nombre, piezasporpaquete`,
        [
          nuevasDimensiones,
          nuevoCosto,
          nuevoPrecio,
          nuevaOferta,
          colorFinal,
          activoFinal,
          varianteId,
        ]
      );

      if (!updateRes.rows.length) {
        throw Object.assign(new Error("Variante no encontrada"), { status: 404 });
      }

      const row = updateRes.rows[0];
      const baseUrl = `${req.protocol}://${req.get("host")}`;

      const galeriaResult = await applyGaleriaVarianteAtomic({
        client,
        varianteId,
        galeria: galeriaParsed || [],
        uploadedFiles,
        baseUrl,
      });

      const usedUploadIndexes = new Set(
        (Array.isArray(galeriaParsed) ? galeriaParsed : [])
          .filter((it) => it && String(it.type || it.tipo).toLowerCase() === "new")
          .map((it) => Number.parseInt(it.uploadIndex ?? it.uploadindex, 10))
          .filter((n) => Number.isInteger(n) && n >= 0)
      );
      const unusedFiles = uploadedFiles.filter((_, idx) => !usedUploadIndexes.has(idx));
      await safeUnlinkUploads(unusedFiles);

      // Note: Image propagation by color is now handled automatically in applyGaleriaVarianteAtomic
      // for producto_variante_imagenes table

      await client.query("COMMIT");

      // ============================================
      // AUDITORÍA EXHAUSTIVA: ACTUALIZACIÓN CON DIFF
      // ============================================
      try {
        await auditLogger.registrarActualizacion({
          usuarioId: req.user?.id || req.user?.userId || null,
          nombreUsuario: req.user?.nombre || req.user?.email || 'Sistema',
          rol: req.user?.rol || req.user?.tipo || 'admin',
          entidad: 'Variante',
          entidadId: varianteId,
          datosAnteriores: {
            sku: actual.sku,
            dimensiones: dimensionesActual,
            costounitario: costoActual,
            preciounitario: precioActual,
            precioofertaunitario: ofertaActual,
            color_nombre: actual.color_nombre,
            activo: actual.activo
          },
          datosNuevos: {
            sku: row.sku,
            dimensiones: row.dimensiones,
            costounitario: row.costounitario !== null ? parseFloat(row.costounitario) : null,
            preciounitario: row.preciounitario !== null ? parseFloat(row.preciounitario) : null,
            precioofertaunitario: row.precioofertaunitario !== null ? parseFloat(row.precioofertaunitario) : null,
            color_nombre: row.color_nombre,
            activo: row.activo
          },
          ip: req.ip || req.connection?.remoteAddress || null,
          tenantId: req.tenant?.tenant_id || 1
        });
      } catch (auditError) {
        console.error('Error al registrar auditoría de actualización de variante:', auditError);
      }

      return res.json({
        success: true,
        message: "Variante actualizada correctamente.",
        data: {
          variante: {
            varianteId: row.varianteid,
            productoId: row.productoid,
            sku: row.sku,
            dimensiones: row.dimensiones,
            colorNombre: row.color_nombre || null,
            urlImagenVariante: galeriaResult.portadaUrl || null,
            costoUnitario:
              row.costounitario !== null ? parseFloat(row.costounitario) : null,
            precioUnitario:
              row.preciounitario !== null ? parseFloat(row.preciounitario) : null,
            precioOfertaUnitario:
              row.precioofertaunitario !== null
                ? parseFloat(row.precioofertaunitario)
                : null,
            stock: row.stock !== null ? parseInt(row.stock, 10) : 0,
            activo: row.activo !== undefined ? row.activo : true,
            tipoproductoid: row.tipoproductoid,
            medidaid: row.medidaid,
            piezasporpaquete: row.piezasporpaquete,
          },
          galeria: galeriaResult,
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      await safeUnlinkUploads(uploadedFiles);
      const status = error && Number.isInteger(error.status) ? error.status : 500;
      return res.status(status).json({
        success: false,
        message: "Error en el servidor"
      });
    } finally {
      client.release();
    }
  }

  try {
    const varianteId = parseInt(req.params.id, 10);

    if (!varianteId || isNaN(varianteId)) {
      return res.status(400).json({
        success: false,
        message: "ID de variante inválido",
      });
    }

    const {
      activo,
      dimensiones,
      costoUnitario,
      precioUnitario,
      precioOfertaUnitario,
      color_nombre,
    } = req.body || {};

    const result = await db.query(
      `SELECT v.VarianteID, v.SKU, v.Dimensiones, v.CostoUnitario, v.PrecioUnitario, v.PrecioOfertaUnitario, v.Stock, v.Activo,
              v.color_nombre, v.MedidaID, v.ProductoID,
              m.nombremedida as medida_nombre
       FROM Producto_Variantes v
       LEFT JOIN medidas m ON m.medidaid = v.medidaid
       WHERE v.VarianteID = $1`,
      [varianteId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Variante no encontrada",
      });
    }

    const actual = result.rows[0];

    const rolUsuario = (req?.user?.rol || "").toString().trim().toLowerCase();
    const allowDirect = rolUsuario === "admin" || rolUsuario === "superadmin";

    const normalizarBoolean = (value, fallback) => {
      if (value === undefined) return fallback;
      if (typeof value === "boolean") return value;
      if (typeof value === "number") return value === 1;
      if (typeof value === "string") {
        const norm = value.trim().toLowerCase();
        if (norm === "true" || norm === "1") return true;
        if (norm === "false" || norm === "0") return false;
      }
      return fallback;
    };

    const parseNullableNumero = (raw) => {
      if (raw === undefined) return { usarActual: true, valor: null };
      if (raw === null || raw === "") {
        return { usarActual: false, valor: null };
      }
      const num = Number.parseFloat(raw);
      if (Number.isNaN(num)) {
        return { usarActual: false, valor: null };
      }
      return { usarActual: false, valor: num };
    };

    const skuActual = actual.sku;
    const dimensionesActual = actual.dimensiones;
    const costoActual =
      actual.costounitario !== null && actual.costounitario !== undefined
        ? Number.parseFloat(actual.costounitario)
        : null;
    const precioActual =
      actual.preciounitario !== null && actual.preciounitario !== undefined
        ? Number.parseFloat(actual.preciounitario)
        : null;
    const ofertaActual =
      actual.precioofertaunitario !== null &&
      actual.precioofertaunitario !== undefined
        ? Number.parseFloat(actual.precioofertaunitario)
        : null;
    const activoActual = Boolean(actual.activo);

    const nuevasDimensiones =
      dimensiones !== undefined
        ? (() => {
            if (dimensiones === null) return null;
            const texto = String(dimensiones).trim();
            return texto.length ? texto : null;
          })()
        : dimensionesActual;

    const costoParse = parseNullableNumero(costoUnitario);
    const nuevoCosto = costoParse.usarActual ? costoActual : costoParse.valor;

    const precioParse = parseNullableNumero(precioUnitario);
    const nuevoPrecio = precioParse.usarActual ? precioActual : precioParse.valor;

    if (nuevoPrecio === null || !(nuevoPrecio > 0)) {
      return res.status(400).json({
        success: false,
        message:
          "El precio unitario debe ser un número mayor a 0 al editar la variante",
      });
    }

    const ofertaParse = parseNullableNumero(precioOfertaUnitario);
    let nuevaOferta = ofertaParse.usarActual ? ofertaActual : ofertaParse.valor;

    if (nuevaOferta !== null && !(nuevaOferta > 0 && nuevaOferta < nuevoPrecio)) {
      nuevaOferta = null;
    }

    const nuevoActivo = normalizarBoolean(activo, activoActual);

    const normalizarTextoNullable = (raw) => {
      if (raw === undefined) return { usarActual: true, valor: null };
      if (raw === null) return { usarActual: false, valor: null };
      const txt = String(raw).trim();
      return { usarActual: false, valor: txt.length ? txt : null };
    };

    // Usar nombres de columnas reales de Producto_Variantes (en minúsculas)
    const payloadNuevos = {
      dimensiones: nuevasDimensiones,
      costounitario: nuevoCosto,
      preciounitario: nuevoPrecio,
      precioofertaunitario: nuevaOferta,
      activo: nuevoActivo,
    };

    const colorParsed = normalizarTextoNullable(color_nombre);
    if (!colorParsed.usarActual) {
      payloadNuevos.color_nombre = colorParsed.valor;
    }

    if (allowDirect) {
      const colorFinal = Object.prototype.hasOwnProperty.call(payloadNuevos, "color_nombre")
        ? payloadNuevos.color_nombre
        : actual.color_nombre ?? actual.color_nombre;

      // ============================================
      // DETECCIÓN DE CAMBIOS Y AUDITORÍA (Non-Atomic Path)
      // ============================================
      const cambiosDetectados = [];
      
      // Comparar dimensiones
      if (payloadNuevos.dimensiones !== dimensionesActual) {
        cambiosDetectados.push({
          campo: 'Dimensiones',
          valorAnterior: dimensionesActual || 'N/A',
          valorNuevo: payloadNuevos.dimensiones || 'N/A'
        });
      }
      
      // Comparar costo unitario
      if (payloadNuevos.costounitario !== costoActual) {
        cambiosDetectados.push({
          campo: 'Costo Unitario',
          valorAnterior: costoActual !== null ? `$${costoActual.toFixed(2)}` : 'N/A',
          valorNuevo: payloadNuevos.costounitario !== null ? `$${payloadNuevos.costounitario.toFixed(2)}` : 'N/A'
        });
      }
      
      // Comparar precio unitario
      if (payloadNuevos.preciounitario !== precioActual) {
        cambiosDetectados.push({
          campo: 'Precio Unitario',
          valorAnterior: precioActual !== null ? `$${precioActual.toFixed(2)}` : 'N/A',
          valorNuevo: payloadNuevos.preciounitario !== null ? `$${payloadNuevos.preciounitario.toFixed(2)}` : 'N/A'
        });
      }
      
      // Comparar precio oferta
      if (payloadNuevos.precioofertaunitario !== ofertaActual) {
        cambiosDetectados.push({
          campo: 'Precio Oferta',
          valorAnterior: ofertaActual !== null ? `$${ofertaActual.toFixed(2)}` : 'Sin oferta',
          valorNuevo: payloadNuevos.precioofertaunitario !== null ? `$${payloadNuevos.precioofertaunitario.toFixed(2)}` : 'Sin oferta'
        });
      }
      
      // Comparar color
      const colorActual = actual.color_nombre || null;
      if (colorFinal !== colorActual) {
        cambiosDetectados.push({
          campo: 'Color',
          valorAnterior: colorActual || 'Sin color',
          valorNuevo: colorFinal || 'Sin color'
        });
      }
      
      // Comparar estado activo
      if (payloadNuevos.activo !== activoActual) {
        cambiosDetectados.push({
          campo: 'Estado',
          valorAnterior: activoActual ? 'Activo' : 'Inactivo',
          valorNuevo: payloadNuevos.activo ? 'Activo' : 'Inactivo'
        });
      }

      const updateRes = await db.query(
        `UPDATE producto_variantes
         SET dimensiones = $1,
             costounitario = $2,
             preciounitario = $3,
             precioofertaunitario = $4,
             color_nombre = $5,
             activo = $6
         WHERE varianteid = $7
         RETURNING varianteid, productoid, sku, dimensiones, costounitario, preciounitario, precioofertaunitario, stock, activo, tipoproductoid, medidaid, color_nombre, piezasporpaquete`,
        [
          payloadNuevos.dimensiones,
          payloadNuevos.costounitario,
          payloadNuevos.preciounitario,
          payloadNuevos.precioofertaunitario,
          colorFinal,
          payloadNuevos.activo,
          varianteId,
        ]
      );
      
      // ============================================
      // REGISTRAR CAMBIOS EN BITÁCORA
      // ============================================
      if (cambiosDetectados.length > 0) {
        const usuarioId = req.user?.id || req.user?.userId;
        const productoId = actual.productoid;
        
        for (const cambio of cambiosDetectados) {
          try {
            const tenant_id = req.tenant?.tenant_id || 1;
            await db.query(
              `INSERT INTO control_cambios (
                entidad,
                entidad_id,
                tipo_cambio,
                datos_anteriores,
                datos_nuevos,
                usuario_solicitante_id,
                estado,
                fecha_resolucion,
                usuario_resolutor_id,
                tenant_id
              )
              VALUES ($1, $2, $3, $4, $5, $6, 'APROBADO', NOW(), $6, $7)`,
              [
                'producto_variantes',
                varianteId,
                'UPDATE',
                JSON.stringify({
                  productoId: productoId,
                  varianteId: varianteId,
                  sku: actual.sku,
                  campo: cambio.campo,
                  valorAnterior: cambio.valorAnterior,
                  medidaNombre: actual.medida_nombre || null
                }),
                JSON.stringify({
                  productoId: productoId,
                  varianteId: varianteId,
                  sku: actual.sku,
                  campo: cambio.campo,
                  valorNuevo: cambio.valorNuevo,
                  descripcion: `Producto [${productoId}] - Variante [SKU: ${actual.sku}]: Cambio en ${cambio.campo} de '${cambio.valorAnterior}' a '${cambio.valorNuevo}'`
                }),
                usuarioId
              ]
            );
          } catch (logError) {
            console.error('Error al registrar cambio en bitácora:', logError);
            // No bloquear la actualización si falla el log
          }
        }
      }

      if (!updateRes.rows.length) {
        return res.status(404).json({
          success: false,
          message: "Variante no encontrada",
        });
      }

      const row = updateRes.rows[0];

      // Note: Image propagation by color is now handled automatically in subirImagenesVarianteMultiple
      // for producto_variante_imagenes table

      await auditService.registrarCambioPasivo(
        req,
        "producto_variantes",
        varianteId,
        "UPDATE",
        actual,
        row
      );

      return res.json({
        success: true,
        message: "Variante actualizada correctamente.",
        data: {
          variante: {
            varianteId: row.varianteid,
            productoId: row.productoid,
            sku: row.sku,
            dimensiones: row.dimensiones,
            colorNombre: row.color_nombre || null,
            costoUnitario:
              row.costounitario !== null ? parseFloat(row.costounitario) : null,
            precioUnitario:
              row.preciounitario !== null ? parseFloat(row.preciounitario) : null,
            precioOfertaUnitario:
              row.precioofertaunitario !== null
                ? parseFloat(row.precioofertaunitario)
                : null,
            stock: row.stock ?? 0,
            activo: row.activo,
            piezasPorPaquete: row.piezasporpaquete,
            tipoProductoId: row.tipoproductoid ?? null,
            medidaId: row.medidaid ?? null,
          },
        },
      });
    }

    const resultado = await solicitarCambio(
      req,
      "producto_variantes",
      varianteId,
      "UPDATE",
      payloadNuevos,
      actual
    );

    res.json({
      success: true,
      message: resultado.mensaje,
      data: {
        varianteId,
        solicitudId: resultado.solicitudId,
        estado: resultado.estado,
      },
    });
  } catch (error) {
    console.error('[generarSolicitudActualizacionVariante] Error:', error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor"
    });
  }
};

// ⚠️ FUNCIÓN ELIMINADA - Migrada a imagenesProductoController.js
// eliminarImagenProducto

/**
 * Subir evidencia de entrega (remisión firmada)
 * POST /api/admin/pedidos/:id/evidencia
 */
const subirEvidenciaEntrega = async (req, res) => {
  try {
    const pedidoId = Number.parseInt(req.params.id, 10);

    if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de pedido inválido",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No se proporcionó ningún archivo de evidencia",
      });
    }

    const urlEvidencia = req.file.path;

    const pedidoResult = await db.query(
      "SELECT pedidoid, estatus, clienteid FROM pedidos WHERE pedidoid = $1 AND tenant_id = $2",
      [pedidoId, tenant_id]
    );

    if (pedidoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pedido no encontrado",
      });
    }

    const updateResult = await db.query(
      `UPDATE pedidos 
       SET url_evidencia_entrega = $1, 
           fecha_entrega_real = NOW(), 
           estatus = 'Entregado'
       WHERE pedidoid = $2
       RETURNING pedidoid, url_evidencia_entrega, fecha_entrega_real, estatus`,
      [urlEvidencia, pedidoId]
    );

    const pedido = updateResult.rows[0];
    const clienteId = pedidoResult.rows[0].clienteid;

    if (clienteId) {
      try {
        await crearNotificacionServicio(
          clienteId,
          'pedido',
          `Pedido #${pedidoId} Entregado`,
          `Tu pedido ha sido entregado exitosamente. La evidencia de entrega ha sido registrada.`,
          `/pedido-detalle.html?id=${pedidoId}`,
          'normal'
        );
      } catch (notifError) {
        console.warn("No se pudo crear notificación de entrega:", notifError);
      }
    }

    await auditService.registrarCambioPasivo(
      req,
      "pedidos",
      pedidoId,
      "UPDATE",
      { estatus: pedidoResult.rows[0].estatus },
      { estatus: "Entregado", url_evidencia_entrega: urlEvidencia }
    );

    // 🚀 FIFO HOOK: Recalcular pedidos posteriores que ahora podrían tener stock disponible
    try {
      const FIFOAllocationService = require('../services/FIFOAllocationService');
      const { tenant_id } = req.tenant;
      
      const recalcResult = await FIFOAllocationService.onPedidoEntregado({
        pedidoId: pedidoId,
        tenantId: tenant_id,
        client: db
      });
    } catch (fifoError) {
      console.error('[Evidencia Entrega] Error en recálculo FIFO (no crítico):', fifoError);
      // No interrumpir la operación si falla el recálculo
    }

    res.json({
      success: true,
      message: "Evidencia de entrega subida exitosamente",
      data: {
        pedidoId: pedido.pedidoid,
        urlEvidencia: pedido.url_evidencia_entrega,
        fechaEntregaReal: pedido.fecha_entrega_real,
        estatus: pedido.estatus,
      },
    });
  } catch (error) {
    console.error("Error al subir evidencia de entrega:", error);
    res.status(500).json({
      success: false,
      message: "Error al subir evidencia de entrega"
    });
  }
};



module.exports = {
  crearVariante,
  actualizarVariante
};
