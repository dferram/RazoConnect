/**
 * Landing Page Editor Controller
 * Manages dynamic content for inicio.html with draft/publish workflow
 */

const pool = require('../config/db');

/**
 * GET /api/admin/landing/config
 * Get all landing page configuration (draft values for admin)
 */
exports.getConfig = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        config_id,
        section_key,
        content_type,
        value_draft,
        value_published,
        metadata,
        updated_at
      FROM landing_page_config
      ORDER BY section_key
    `);

    return res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching landing config:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener configuración de landing',
      error: error.message
    });
  }
};

/**
 * POST /api/admin/landing/draft
 * Save draft values (auto-save from editor)
 * Body: { updates: [{ section_key, value }] }
 */
exports.saveDraft = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { updates } = req.body;

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere un array de actualizaciones'
      });
    }

    await client.query('BEGIN');

    for (const update of updates) {
      const { section_key, value } = update;

      if (!section_key) {
        continue;
      }

      await client.query(`
        UPDATE landing_page_config
        SET value_draft = $1, updated_at = CURRENT_TIMESTAMP
        WHERE section_key = $2
      `, [value, section_key]);
    }

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Borrador guardado exitosamente'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error saving draft:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al guardar borrador',
      error: error.message
    });
  } finally {
    client.release();
  }
};

/**
 * POST /api/admin/landing/publish
 * Publish all draft values to production
 */
exports.publishChanges = async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const result = await client.query(`
      UPDATE landing_page_config
      SET 
        value_published = COALESCE(value_draft, value_published),
        updated_at = CURRENT_TIMESTAMP
      WHERE value_draft IS NOT NULL
      RETURNING section_key
    `);

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Cambios publicados exitosamente',
      data: {
        sectionsPublished: result.rows.length,
        sections: result.rows.map(r => r.section_key)
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error publishing changes:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al publicar cambios',
      error: error.message
    });
  } finally {
    client.release();
  }
};

/**
 * POST /api/admin/landing/upload-image
 * Upload image to Cloudinary and return URL
 */
exports.uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No se proporcionó ninguna imagen'
      });
    }

    const cloudinary = require('../config/cloudinary');
    
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'razoconnect/landing',
      transformation: [
        { width: 1600, height: 900, crop: 'fill', quality: 'auto' }
      ]
    });

    return res.status(200).json({
      success: true,
      data: {
        url: result.secure_url,
        public_id: result.public_id
      }
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al subir imagen',
      error: error.message
    });
  }
};

/**
 * GET /api/landing-content
 * Public endpoint - returns published content (or draft if preview=true and admin)
 * Query params: ?preview=true
 */
exports.getPublicContent = async (req, res) => {
  try {
    const isPreview = req.query.preview === 'true';
    const isAdmin = req.user && (req.user.roles?.includes('admin') || req.user.roles?.includes('super_admin'));

    const usePreview = isPreview && isAdmin;

    const result = await pool.query(`
      SELECT 
        section_key,
        content_type,
        ${usePreview ? 'COALESCE(value_draft, value_published)' : 'value_published'} as value,
        metadata
      FROM landing_page_config
      WHERE ${usePreview ? 'TRUE' : 'value_published IS NOT NULL'}
      ORDER BY section_key
    `);

    const config = {};
    result.rows.forEach(row => {
      config[row.section_key] = {
        value: row.value,
        type: row.content_type,
        metadata: row.metadata
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        config,
        isPreview: usePreview
      }
    });
  } catch (error) {
    console.error('Error fetching public landing content:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener contenido de landing',
      error: error.message
    });
  }
};

/**
 * GET /api/admin/landing/categories
 * Get all categories for dropdown selection
 */
exports.getCategories = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        categoriaid as id,
        nombre,
        descripcion
      FROM categorias
      WHERE activo = true
      ORDER BY nombre
    `);

    return res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener categorías',
      error: error.message
    });
  }
};

/**
 * POST /api/admin/landing/reset
 * Reset all draft values (discard changes)
 */
exports.resetDraft = async (req, res) => {
  try {
    await pool.query(`
      UPDATE landing_page_config
      SET value_draft = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE value_draft IS NOT NULL
    `);

    return res.status(200).json({
      success: true,
      message: 'Borrador descartado exitosamente'
    });
  } catch (error) {
    console.error('Error resetting draft:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al descartar borrador',
      error: error.message
    });
  }
};
