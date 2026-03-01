/**
 * IMÁGENES PRODUCTO CONTROLLER
 * 
 * Controlador especializado para gestión de imágenes de productos y variantes.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/imagenesProductoController
 * @author RazoConnect Team
 * @date 2026-02-27
 */

const db = require('../db');
const cloudinary = require('cloudinary').v2;

/**
 * Helper: Extraer public_id de URL de Cloudinary
 */
const extraerPublicIdDeUrl = (url) => {
  if (!url || typeof url !== 'string') return null;
  
  const match = url.match(/\/v\d+\/(.+)\.\w+$/);
  if (match && match[1]) {
    return match[1];
  }
  
  const segments = url.split('/');
  const lastSegment = segments[segments.length - 1];
  const publicId = lastSegment.split('.')[0];
  
  return publicId || null;
};

/**
 * Helper: Eliminar imagen de Cloudinary
 */
const eliminarImagenCloudinary = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error(`Error al eliminar imagen de Cloudinary: ${publicId}`, error);
    throw error;
  }
};

/**
 * Subir imagen principal para un producto
 * POST /api/admin/productos/:id/imagen
 */
const subirImagenProducto = async (req, res) => {
  const { id } = req.params;
  
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No se proporcionó ningún archivo de imagen",
      });
    }

    const productoResult = await db.query(
      `SELECT productoid FROM productos WHERE productoid = $1`,
      [id]
    );

    if (productoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Producto no encontrado",
      });
    }

    const rutaImagen = req.file.path;

    const existingImageResult = await db.query(
      `SELECT imagenid FROM producto_imagenes 
       WHERE productoid = $1 AND orden = 1`,
      [id]
    );

    let imagenResult;
    
    if (existingImageResult.rows.length > 0) {
      imagenResult = await db.query(
        `UPDATE producto_imagenes 
         SET url_imagen = $2
         WHERE productoid = $1 AND orden = 1
         RETURNING imagenid, url_imagen`,
        [id, rutaImagen]
      );
    } else {
      const tenant_id = req.tenant?.tenant_id || 1;
      imagenResult = await db.query(
        `INSERT INTO producto_imagenes (productoid, url_imagen, orden, tenant_id)
         VALUES ($1, $2, 1, $3)
         RETURNING imagenid, url_imagen`,
        [id, rutaImagen, tenant_id]
      );
    }

    res.status(200).json({
      success: true,
      message: "Imagen subida exitosamente",
      data: {
        imagenId: imagenResult.rows[0].imagenid,
        rutaImagen: imagenResult.rows[0].url_imagen,
        urlCompleta: `${req.protocol}://${req.get("host")}${rutaImagen}`,
      },
    });
  } catch (error) {
    console.error(`❌ Error al subir imagen del producto ${id}:`, error.message);
    
    res.status(500).json({
      success: false,
      message: "Error al subir la imagen",
      error: error.message,
    });
  }
};

/**
 * Subir múltiples imágenes para un producto
 * POST /api/admin/productos/:id/imagenes
 */
const subirImagenesProductoMultiple = async (req, res) => {
  const { id } = req.params;

  try {
    const archivos = (() => {
      if (Array.isArray(req.files)) {
        return req.files;
      }

      if (req.files && typeof req.files === "object") {
        const fromImagenes = Array.isArray(req.files.imagenes)
          ? req.files.imagenes
          : [];
        const fromImages = Array.isArray(req.files.images) ? req.files.images : [];
        return [...fromImagenes, ...fromImages];
      }

      return [];
    })();

    if (archivos.length > 12) {
      return res.status(400).json({
        success: false,
        message: "El límite máximo es de 12 imágenes por producto",
      });
    }

    if (!archivos.length) {
      return res.status(400).json({
        success: false,
        message: "No se proporcionaron archivos de imagen",
      });
    }

    const productoResult = await db.query(
      `SELECT productoid FROM productos WHERE productoid = $1`,
      [id]
    );

    if (productoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Producto no encontrado",
      });
    }

    const ordenResult = await db.query(
      `SELECT COALESCE(MAX(orden), 0) AS max_orden
       FROM producto_imagenes
       WHERE productoid = $1`,
      [id]
    );

    let nextOrden = Number.parseInt(ordenResult.rows[0]?.max_orden, 10);
    if (!Number.isFinite(nextOrden) || nextOrden < 0) {
      nextOrden = 0;
    }

    const imagenesGuardadas = [];

    for (const file of archivos) {
      if (!file || !file.path) continue;

      const rutaImagen = file.path;
      nextOrden += 1;

      const tenant_id = req.tenant?.tenant_id || 1;
      const insertResult = await db.query(
        `INSERT INTO producto_imagenes (productoid, url_imagen, textoalternativo, orden, tenant_id)
         VALUES ($1, $2, NULL, $3, $4)
         RETURNING imagenid, url_imagen, textoalternativo, orden`,
        [id, rutaImagen, nextOrden, tenant_id]
      );

      imagenesGuardadas.push(insertResult.rows[0]);
    }

    if (!imagenesGuardadas.length) {
      return res.status(400).json({
        success: false,
        message: "No se pudieron guardar las imágenes proporcionadas",
      });
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;

    res.status(200).json({
      success: true,
      message: "Imágenes subidas exitosamente",
      data: {
        imagenes: imagenesGuardadas.map((img) => ({
          imagenId: img.imagenid,
          rutaImagen: img.url_imagen,
          urlCompleta: `${baseUrl}${img.url_imagen}`,
          textoAlternativo: img.textoalternativo || null,
          orden: img.orden,
        })),
      },
    });
  } catch (error) {
    console.error(
      `❌ Error al subir imágenes múltiples del producto ${id}:`,
      error.message
    );

    res.status(500).json({
      success: false,
      message: "Error al subir las imágenes",
      error: error.message,
    });
  }
};

/**
 * Eliminar imagen de producto
 * DELETE /api/admin/imagenes/:id
 */
const eliminarImagenProducto = async (req, res) => {
  const { id } = req.params;
  const imagenId = Number.parseInt(id, 10);

  if (!Number.isInteger(imagenId) || imagenId <= 0) {
    return res.status(400).json({
      success: false,
      message: "ID de imagen inválido",
    });
  }

  try {
    const imagenResult = await db.query(
      `SELECT imagenid, productoid, url_imagen
       FROM producto_imagenes
       WHERE imagenid = $1`,
      [imagenId]
    );

    if (!imagenResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Imagen no encontrada",
      });
    }

    const imagen = imagenResult.rows[0];
    const urlImagen = imagen.url_imagen;

    const publicId = extraerPublicIdDeUrl(urlImagen);

    if (publicId) {
      try {
        await eliminarImagenCloudinary(publicId);
      } catch (cloudinaryError) {
        console.warn(`⚠️ No se pudo eliminar de Cloudinary: ${publicId}`, cloudinaryError);
      }
    } else {
      console.warn(`⚠️ No se pudo extraer public_id de URL: ${urlImagen}`);
    }

    await db.query(
      `DELETE FROM producto_imagenes WHERE imagenid = $1`,
      [imagenId]
    );

    res.json({
      success: true,
      message: "Imagen eliminada correctamente",
      data: {
        imagenId,
        productoId: imagen.productoid,
      },
    });
  } catch (error) {
    console.error(`❌ Error al eliminar imagen ${imagenId}:`, error);
    res.status(500).json({
      success: false,
      message: "Error al eliminar la imagen",
      error: error.message,
    });
  }
};

/**
 * Obtener imágenes de una variante
 * GET /api/admin/variantes/:id/imagenes
 */
const getImagenesVariante = async (req, res) => {
  const { id } = req.params;
  const varianteId = Number.parseInt(id, 10);

  if (!Number.isInteger(varianteId) || varianteId <= 0) {
    return res.status(400).json({
      success: false,
      message: "ID de variante inválido",
    });
  }

  try {
    const varianteResult = await db.query(
      "SELECT varianteid FROM producto_variantes WHERE varianteid = $1",
      [varianteId]
    );

    if (!varianteResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Variante no encontrada",
      });
    }

    const imagenesResult = await db.query(
      `SELECT imagenid, url_imagen, textoalternativo, orden
       FROM producto_variante_imagenes
       WHERE varianteid = $1
       ORDER BY orden ASC NULLS LAST, imagenid ASC`,
      [varianteId]
    );

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const imagenes = (imagenesResult.rows || []).map((row) => ({
      imagenId: row.imagenid,
      rutaImagen: row.url_imagen,
      urlCompleta: `${baseUrl}${row.url_imagen}`,
      textoAlternativo: row.textoalternativo || null,
      orden: row.orden,
    }));

    const portadaUrl = imagenes.length > 0 ? imagenes[0].rutaImagen : null;

    return res.json({
      success: true,
      data: {
        varianteId,
        portadaUrl,
        imagenes,
      },
    });
  } catch (error) {
    console.error("❌ Error al obtener imágenes de la variante:", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener imágenes de la variante",
      error: error.message,
    });
  }
};

/**
 * Subir múltiples imágenes para una variante
 * POST /api/admin/variantes/:id/imagenes
 */
const subirImagenesVarianteMultiple = async (req, res) => {
  const { id } = req.params;
  const varianteId = Number.parseInt(id, 10);

  if (!Number.isInteger(varianteId) || varianteId <= 0) {
    return res.status(400).json({
      success: false,
      message: "ID de variante inválido",
    });
  }

  try {
    const archivos = (() => {
      if (Array.isArray(req.files)) {
        return req.files;
      }

      if (req.files && typeof req.files === "object") {
        const fromImagenes = Array.isArray(req.files.imagenes)
          ? req.files.imagenes
          : [];
        const fromImages = Array.isArray(req.files.images) ? req.files.images : [];
        return [...fromImagenes, ...fromImages];
      }

      return [];
    })();

    if (archivos.length > 12) {
      return res.status(400).json({
        success: false,
        message: "El límite máximo es de 12 imágenes por variante",
      });
    }

    if (!archivos.length) {
      return res.status(400).json({
        success: false,
        message: "No se proporcionaron archivos de imagen",
      });
    }

    const varianteResult = await db.query(
      "SELECT varianteid FROM producto_variantes WHERE varianteid = $1",
      [varianteId]
    );

    if (!varianteResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Variante no encontrada",
      });
    }

    const ordenResult = await db.query(
      `SELECT COALESCE(MAX(orden), 0) AS max_orden
       FROM producto_variante_imagenes
       WHERE varianteid = $1`,
      [varianteId]
    );

    let nextOrden = Number.parseInt(ordenResult.rows[0]?.max_orden, 10);
    if (!Number.isFinite(nextOrden) || nextOrden < 0) {
      nextOrden = 0;
    }

    const imagenesGuardadas = [];

    for (const file of archivos) {
      if (!file || !file.path) continue;

      const rutaImagen = file.path;
      nextOrden += 1;

      const insertResult = await db.query(
        `INSERT INTO producto_variante_imagenes (varianteid, url_imagen, textoalternativo, orden)
         VALUES ($1, $2, NULL, $3)
         RETURNING imagenid, url_imagen, textoalternativo, orden`,
        [varianteId, rutaImagen, nextOrden]
      );

      imagenesGuardadas.push(insertResult.rows[0]);
    }

    if (!imagenesGuardadas.length) {
      return res.status(400).json({
        success: false,
        message: "No se pudieron guardar las imágenes proporcionadas",
      });
    }

    // Replicación automática a variantes hermanas
    try {
      const varianteInfoResult = await db.query(
        `SELECT productoid, color_nombre 
         FROM producto_variantes 
         WHERE varianteid = $1`,
        [varianteId]
      );

      if (varianteInfoResult.rows.length > 0) {
        const { productoid, color_nombre } = varianteInfoResult.rows[0];

        const variantesHermanasResult = await db.query(
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
            for (const img of imagenesGuardadas) {
              await db.query(
                `INSERT INTO producto_variante_imagenes (varianteid, url_imagen, textoalternativo, orden)
                 VALUES ($1, $2, $3, $4)`,
                [hermana.varianteid, img.url_imagen, img.textoalternativo, img.orden]
              );
            }
          }
        }
      }
    } catch (replicacionError) {
      console.error(`[REPLICACION_IMG] Error durante replicación (operación principal exitosa):`, replicacionError);
    }

    const portadaResult = await db.query(
      `SELECT url_imagen
       FROM producto_variante_imagenes
       WHERE varianteid = $1
       ORDER BY orden ASC NULLS LAST, imagenid ASC
       LIMIT 1`,
      [varianteId]
    );

    const portadaUrl = portadaResult.rows[0]?.url_imagen || null;

    const baseUrl = `${req.protocol}://${req.get("host")}`;

    return res.status(200).json({
      success: true,
      message: "Imágenes subidas exitosamente",
      data: {
        varianteId,
        portadaUrl,
        imagenes: imagenesGuardadas.map((img) => ({
          imagenId: img.imagenid,
          rutaImagen: img.url_imagen,
          urlCompleta: `${baseUrl}${img.url_imagen}`,
          textoAlternativo: img.textoalternativo || null,
          orden: img.orden,
        })),
      },
    });
  } catch (error) {
    console.error("❌ Error al subir imágenes múltiples de la variante:", error);

    return res.status(500).json({
      success: false,
      message: "Error al subir las imágenes",
      error: error.message,
    });
  }
};

/**
 * Actualizar orden de imágenes de una variante
 * PUT /api/admin/variantes/:id/orden-imagenes
 */
const actualizarOrdenImagenesVariante = async (req, res) => {
  const { id } = req.params;
  const varianteId = Number.parseInt(id, 10);

  if (!Number.isInteger(varianteId) || varianteId <= 0) {
    return res.status(400).json({
      success: false,
      message: "ID de variante inválido",
    });
  }

  const { ordenImagenes } = req.body || {};
  if (!Array.isArray(ordenImagenes)) {
    return res.status(400).json({
      success: false,
      message: "ordenImagenes debe ser un arreglo",
    });
  }

  const client = await db.pool.connect();
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    const varianteResult = await client.query(
      "SELECT varianteid FROM producto_variantes WHERE varianteid = $1",
      [varianteId]
    );

    if (!varianteResult.rows.length) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(404).json({
        success: false,
        message: "Variante no encontrada",
      });
    }

    const existingImgs = await client.query(
      `SELECT url_imagen
       FROM producto_variante_imagenes
       WHERE varianteid = $1`,
      [varianteId]
    );

    const existingUrls = new Set(
      (existingImgs.rows || [])
        .map((r) => (r.url_imagen || "").toString().trim())
        .filter(Boolean)
    );

    const desired = ordenImagenes
      .map((u) => (u || "").toString().trim())
      .filter(Boolean);

    const filteredDesired = desired.filter((u) => existingUrls.has(u));
    const missing = Array.from(existingUrls).filter(
      (u) => !filteredDesired.includes(u)
    );
    const finalOrder = [...filteredDesired, ...missing];

    let orden = 0;
    for (const url of finalOrder) {
      orden += 1;
      await client.query(
        `UPDATE producto_variante_imagenes
         SET orden = $1
         WHERE varianteid = $2 AND url_imagen = $3`,
        [orden, varianteId, url]
      );
    }

    const portadaUrl = finalOrder.length ? finalOrder[0] : null;

    await client.query("COMMIT");
    transactionStarted = false;

    return res.json({
      success: true,
      message: "Orden de imágenes actualizado correctamente",
      data: {
        varianteId,
        portadaUrl,
      },
    });
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK");
    }

    console.error("❌ Error al actualizar orden de imágenes de variante:", error);
    return res.status(500).json({
      success: false,
      message: "Error al actualizar el orden de imágenes",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

module.exports = {
  subirImagenProducto,
  subirImagenesProductoMultiple,
  eliminarImagenProducto,
  getImagenesVariante,
  subirImagenesVarianteMultiple,
  actualizarOrdenImagenesVariante
};
