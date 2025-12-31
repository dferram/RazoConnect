/**
 * Helper para procesar imágenes por color
 * Agrupa variantes por color y evita duplicar subidas a Cloudinary
 */

/**
 * Procesa las imágenes de colores desde el request
 * @param {Object} files - Objeto de archivos de multer
 * @param {Array} variantes - Array de variantes con información de color
 * @returns {Map} - Map de color_nombre -> archivo de imagen
 */
function procesarImagenesColor(files, variantes) {
  const imagenesColorMap = new Map();

  if (!files || !files.imagenesColor || !Array.isArray(files.imagenesColor)) {
    return imagenesColorMap;
  }

  // Si las variantes incluyen información de color, mapear archivos a colores
  if (Array.isArray(variantes) && variantes.length > 0) {
    // Agrupar variantes por color
    const coloresUnicos = new Set();
    variantes.forEach((v) => {
      const colorNombre = v?.color_nombre || v?.colorNombre || v?.color;
      if (colorNombre && typeof colorNombre === "string") {
        coloresUnicos.add(colorNombre.trim().toUpperCase());
      }
    });

    // Mapear archivos a colores (asumiendo que vienen en el mismo orden)
    const coloresArray = Array.from(coloresUnicos);
    files.imagenesColor.forEach((file, index) => {
      if (index < coloresArray.length) {
        imagenesColorMap.set(coloresArray[index], file);
      }
    });
  }

  return imagenesColorMap;
}

/**
 * Guarda las imágenes por color en la base de datos
 * @param {Object} client - Cliente de base de datos
 * @param {Number} productoId - ID del producto
 * @param {Map} imagenesColorMap - Map de color_nombre -> archivo
 * @returns {Promise<Array>} - Array de registros insertados
 */
async function guardarImagenesColor(client, productoId, imagenesColorMap) {
  const registrosInsertados = [];

  for (const [colorNombre, file] of imagenesColorMap.entries()) {
    try {
      const urlCloudinary = file.path; // Cloudinary URL
      const publicId = file.filename; // Cloudinary public_id

      const result = await client.query(
        `INSERT INTO producto_imagenes_color (productoid, color_nombre, url_imagen_cloudinary, public_id_cloudinary)
         VALUES ($1, $2, $3, $4)
         RETURNING imagencolorid, productoid, color_nombre, url_imagen_cloudinary`,
        [productoId, colorNombre, urlCloudinary, publicId]
      );

      registrosInsertados.push(result.rows[0]);
    } catch (error) {
      console.error(
        `Error guardando imagen para color ${colorNombre}:`,
        error
      );
      throw error;
    }
  }

  return registrosInsertados;
}

/**
 * Obtiene las imágenes por color de un producto
 * @param {Object} client - Cliente de base de datos
 * @param {Number} productoId - ID del producto
 * @returns {Promise<Array>} - Array de imágenes por color
 */
async function obtenerImagenesColor(client, productoId) {
  const result = await client.query(
    `SELECT imagencolorid, productoid, color_nombre, url_imagen_cloudinary, fechacreacion
     FROM producto_imagenes_color
     WHERE productoid = $1
     ORDER BY color_nombre ASC, fechacreacion ASC`,
    [productoId]
  );

  return result.rows.map((row) => ({
    imagenColorId: row.imagencolorid,
    productoId: row.productoid,
    colorNombre: row.color_nombre,
    urlImagen: row.url_imagen_cloudinary,
    fechaCreacion: row.fechacreacion,
  }));
}

/**
 * Elimina las imágenes por color de un producto
 * @param {Object} client - Cliente de base de datos
 * @param {Number} productoId - ID del producto
 * @param {Array} colores - Array de nombres de colores a eliminar (opcional, si no se pasa elimina todos)
 * @returns {Promise<Number>} - Número de registros eliminados
 */
async function eliminarImagenesColor(client, productoId, colores = null) {
  let query = `DELETE FROM producto_imagenes_color WHERE productoid = $1`;
  const params = [productoId];

  if (Array.isArray(colores) && colores.length > 0) {
    query += ` AND color_nombre = ANY($2::text[])`;
    params.push(colores);
  }

  const result = await client.query(query, params);
  return result.rowCount;
}

module.exports = {
  procesarImagenesColor,
  guardarImagenesColor,
  obtenerImagenesColor,
  eliminarImagenesColor,
};
