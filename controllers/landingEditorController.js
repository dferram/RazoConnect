/**
 * Landing Page Editor Controller
 * Manages dynamic content for inicio.html with draft/publish workflow
 */

const db = require('../db');

/**
 * GET /api/admin/landing/config
 * Get all landing page configuration (draft values for admin)
 * Query params: ?page=inicio|index
 */
exports.getConfig = async (req, res) => {
  try {
    const page = req.query.page || 'inicio';
    
    const result = await db.query(`
      SELECT 
        config_id,
        section_key,
        content_type,
        value_draft,
        value_published,
        metadata,
        updated_at
      FROM landing_page_config
      WHERE section_key LIKE $1
      ORDER BY section_key
    `, [`${page}_%`]);

    return res.status(200).json({
      success: true,
      data: result.rows,
      page: page
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
  const client = await db.getClient();
  
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
  const client = await db.getClient();
  
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

    const result = await db.query(`
      SELECT 
        section_key,
        content_type,
        ${usePreview ? 'COALESCE(value_draft, value_published)' : 'value_published'} as value,
        metadata
      FROM landing_page_config
      WHERE ${usePreview ? 'TRUE' : 'value_published IS NOT NULL'}
      ORDER BY section_key
    `);

    // Transformar datos planos a estructura agrupada por slide
    const slides = {};
    
    result.rows.forEach(row => {
      const key = row.section_key;
      
      // Parsear section_key: "inicio_hero_slide_1_title" -> slide: 1, field: title
      const match = key.match(/hero_slide_(\d+)_(.+)/);
      
      if (match) {
        const slideNum = match[1];
        const field = match[2];
        const slideKey = `hero_slide_${slideNum}`;
        
        if (!slides[slideKey]) {
          slides[slideKey] = {};
        }
        
        // Manejar campos especiales
        if (field === 'cta_type' || field === 'cta_value' || field === 'cta_text' || field === 'cta_link') {
          if (!slides[slideKey].cta) {
            slides[slideKey].cta = {};
          }
          
          // Compatibilidad con formato viejo (cta_link) y nuevo (cta_type/cta_value)
          if (field === 'cta_link') {
            // Formato viejo: cta_link contiene la URL directa
            slides[slideKey].cta.type = 'static';
            slides[slideKey].cta.value = row.value;
          } else if (field === 'cta_text') {
            slides[slideKey].cta.text = row.value;
          } else {
            // Formato nuevo: cta_type y cta_value separados
            const ctaField = field.replace('cta_', '');
            slides[slideKey].cta[ctaField] = row.value;
          }
        } else if (field.startsWith('extra_buttons')) {
          // Manejar botones extra (si están en JSON)
          try {
            slides[slideKey].extra_buttons = JSON.parse(row.value);
          } catch (e) {
            slides[slideKey].extra_buttons = [];
          }
        } else {
          // Campos normales: title, eyebrow, description, image
          slides[slideKey][field] = row.value;
        }
      }
    });

    return res.status(200).json({
      success: true,
      data: slides
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
    const result = await db.query(`
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
    await db.query(`
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
