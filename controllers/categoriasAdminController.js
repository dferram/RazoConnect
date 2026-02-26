/**
 * CATEGORÍAS ADMIN CONTROLLER
 * 
 * Controlador especializado para la gestión de categorías de productos.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/categoriasAdminController
 * @author RazoConnect Team
 * @date 2026-02-26
 */

const db = require('../db');

/**
 * Obtener todas las categorías
 * @route GET /api/admin/categorias
 */
const getCategorias = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;
    
    const result = await db.query(
      `SELECT 
        c.categoriaid,
        c.nombre,
        c.descripcion,
        c.parentcategoriaid,
        c.activo,
        c.imagen_url,
        c.imagen_public_id,
        p.nombre AS parentnombre
      FROM categorias c
      LEFT JOIN categorias p ON c.parentcategoriaid = p.categoriaid
      WHERE c.tenant_id = $1
      ORDER BY c.nombre`,
      [tenant_id]
    );

    res.json({
      success: true,
      data: {
        categorias: result.rows.map((row) => ({
          categoriaId: row.categoriaid,
          nombre: row.nombre,
          descripcion: row.descripcion,
          parentCategoriaId: row.parentcategoriaid,
          parentNombre: row.parentnombre || null,
          activo: row.activo,
          imagenUrl: row.imagen_url || null,
          imagenPublicId: row.imagen_public_id || null,
        })),
      },
    });
  } catch (error) {
    console.error("Error al obtener categorías:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
      error: error.message
    });
  }
};

/**
 * Crear una nueva categoría
 * @route POST /api/admin/categorias
 */
const crearCategoria = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;
    const { nombre, descripcion, parentCategoriaId, activo } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({
        success: false,
        message: "El nombre de la categoría es requerido",
      });
    }

    const imagenUrl = req.file?.secure_url || req.file?.path || null;
    const imagenPublicId = req.file?.public_id || null;

    let parentCategoria = null;

    if (parentCategoriaId !== undefined && parentCategoriaId !== null) {
      const parentResult = await db.query(
        "SELECT CategoriaID FROM Categorias WHERE CategoriaID = $1 AND tenant_id = $2",
        [parentCategoriaId, tenant_id]
      );

      if (parentResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: "La categoría padre especificada no existe",
        });
      }

      parentCategoria = parentCategoriaId;
    }

    const nombreNormalizado = nombre.trim();

    const existente = await db.query(
      "SELECT CategoriaID FROM Categorias WHERE LOWER(Nombre) = LOWER($1) AND tenant_id = $2",
      [nombreNormalizado, tenant_id]
    );

    if (existente.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Ya existe una categoría con ese nombre",
      });
    }

    const prefijo = nombreNormalizado
      .substring(0, 3)
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z]/g, '');

    const result = await db.query(
      `INSERT INTO Categorias (Nombre, Descripcion, ParentCategoriaID, Activo, tenant_id, prefijo, imagen_url, imagen_public_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING CategoriaID, Nombre`,
      [
        nombreNormalizado,
        descripcion || null,
        parentCategoria,
        activo !== undefined ? activo : true,
        tenant_id,
        prefijo || 'CAT',
        imagenUrl,
        imagenPublicId
      ]
    );

    console.log(`✅ [CATEGORÍA] Creada: ${result.rows[0].nombre} (ID: ${result.rows[0].categoriaid})`);

    res.status(201).json({
      success: true,
      message: "Categoría creada exitosamente",
      data: {
        categoriaId: result.rows[0].categoriaid,
        nombre: result.rows[0].nombre,
      },
    });
  } catch (error) {
    console.error("Error al crear categoría:", error);
    res.status(500).json({
      success: false,
      message: "Error al crear la categoría",
      error: error.message,
    });
  }
};

/**
 * Actualizar una categoría existente
 * @route PUT /api/admin/categorias/:id
 */
const actualizarCategoria = async (req, res) => {
  try {
    const categoriaId = parseInt(req.params.id, 10);
    const { nombre, descripcion, parentCategoriaId, activo } = req.body;
    const { tenant_id } = req.tenant;

    if (!Number.isInteger(categoriaId) || categoriaId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de categoría inválido",
      });
    }

    const categoriaExiste = await db.query(
      "SELECT CategoriaID FROM Categorias WHERE CategoriaID = $1 AND tenant_id = $2",
      [categoriaId, tenant_id]
    );

    if (categoriaExiste.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Categoría no encontrada",
      });
    }

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (nombre !== undefined && nombre.trim()) {
      updates.push(`Nombre = $${paramIndex++}`);
      values.push(nombre.trim());
    }

    if (descripcion !== undefined) {
      updates.push(`Descripcion = $${paramIndex++}`);
      values.push(descripcion);
    }

    if (parentCategoriaId !== undefined) {
      updates.push(`ParentCategoriaID = $${paramIndex++}`);
      values.push(parentCategoriaId);
    }

    if (activo !== undefined) {
      updates.push(`Activo = $${paramIndex++}`);
      values.push(activo);
    }

    const imagenUrl = req.file?.secure_url || req.file?.path;
    const imagenPublicId = req.file?.public_id;

    if (imagenUrl) {
      updates.push(`imagen_url = $${paramIndex++}`);
      values.push(imagenUrl);
    }

    if (imagenPublicId) {
      updates.push(`imagen_public_id = $${paramIndex++}`);
      values.push(imagenPublicId);
    }

    if (updates.length === 0) {
      return res.json({
        success: true,
        message: "No hay cambios para actualizar",
      });
    }

    values.push(categoriaId);
    values.push(tenant_id);

    const updateQuery = `
      UPDATE Categorias
      SET ${updates.join(", ")}
      WHERE CategoriaID = $${paramIndex++} AND tenant_id = $${paramIndex++}
      RETURNING CategoriaID, Nombre
    `;

    const result = await db.query(updateQuery, values);

    console.log(`✅ [CATEGORÍA] Actualizada: ${result.rows[0].nombre} (ID: ${categoriaId})`);

    res.json({
      success: true,
      message: "Categoría actualizada exitosamente",
      data: {
        categoriaId: result.rows[0].categoriaid,
        nombre: result.rows[0].nombre,
      },
    });
  } catch (error) {
    console.error("Error al actualizar categoría:", error);
    res.status(500).json({
      success: false,
      message: "Error al actualizar la categoría",
      error: error.message,
    });
  }
};

/**
 * Eliminar una categoría
 * @route DELETE /api/admin/categorias/:id
 */
const eliminarCategoria = async (req, res) => {
  try {
    const categoriaId = parseInt(req.params.id, 10);
    const { tenant_id } = req.tenant;

    if (!Number.isInteger(categoriaId) || categoriaId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de categoría inválido",
      });
    }

    const productosAsociados = await db.query(
      "SELECT COUNT(*) as count FROM Productos WHERE CategoriaID = $1 AND tenant_id = $2",
      [categoriaId, tenant_id]
    );

    if (parseInt(productosAsociados.rows[0].count) > 0) {
      return res.status(400).json({
        success: false,
        message: "No se puede eliminar la categoría porque tiene productos asociados",
      });
    }

    const result = await db.query(
      "DELETE FROM Categorias WHERE CategoriaID = $1 AND tenant_id = $2 RETURNING Nombre",
      [categoriaId, tenant_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Categoría no encontrada",
      });
    }

    console.log(`✅ [CATEGORÍA] Eliminada: ${result.rows[0].nombre} (ID: ${categoriaId})`);

    res.json({
      success: true,
      message: "Categoría eliminada exitosamente",
    });
  } catch (error) {
    console.error("Error al eliminar categoría:", error);
    res.status(500).json({
      success: false,
      message: "Error al eliminar la categoría",
      error: error.message,
    });
  }
};

module.exports = {
  getCategorias,
  crearCategoria,
  actualizarCategoria,
  eliminarCategoria
};
