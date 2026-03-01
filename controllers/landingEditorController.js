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
      message: 'Error al subir imagen'
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

/**
 * GET /api/admin/landing/smart-selector-data
 * Get categories and brands for smart selector dropdown
 */
exports.getSmartSelectorData = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;

    const categoriesResult = await db.query(`
      SELECT 
        categoriaid as id,
        nombre,
        nombre as display_name
      FROM categorias
      WHERE activo = true AND tenant_id = $1
      ORDER BY nombre
    `, [tenant_id]);

    const brandsResult = await db.query(`
      SELECT 
        proveedorid as id,
        nombreempresa as nombre,
        nombreempresa as display_name
      FROM proveedores
      WHERE tenant_id = $1
      ORDER BY nombreempresa
    `, [tenant_id]);

    return res.status(200).json({
      success: true,
      data: {
        categories: categoriesResult.rows,
        brands: brandsResult.rows
      }
    });
  } catch (error) {
    console.error('Error fetching smart selector data:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener datos para selector',
      error: error.message
    });
  }
};

/**
 * GET /api/admin/landing-config
 * Get all landing carousel items (categories and brands)
 */
exports.getLandingItems = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;

    const result = await db.query(`
      SELECT 
        config_id as id,
        section,
        name,
        image,
        href,
        description,
        orden
      FROM landing_page_config
      WHERE tenant_id = $1 
        AND section IN ('categories', 'brands')
      ORDER BY section, orden ASC, config_id ASC
    `, [tenant_id]);

    const categories = result.rows.filter(item => item.section === 'categories');
    const brands = result.rows.filter(item => item.section === 'brands');

    return res.status(200).json({
      success: true,
      data: {
        categories,
        brands
      }
    });
  } catch (error) {
    console.error('Error fetching landing items:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener items de landing',
      error: error.message
    });
  }
};

/**
 * POST /api/admin/landing-config
 * Create new carousel item (category or brand)
 * Body: { section, name, image, href, description }
 */
exports.createLandingItem = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;
    const { section, name, image, href, description } = req.body;

    if (!section || !name || !image || !href) {
      return res.status(400).json({
        success: false,
        message: 'Campos requeridos: section, name, image, href'
      });
    }

    if (!['categories', 'brands'].includes(section)) {
      return res.status(400).json({
        success: false,
        message: 'Section debe ser "categories" o "brands"'
      });
    }

    // Get max orden for the section
    const maxOrdenResult = await db.query(`
      SELECT COALESCE(MAX(orden), -1) as max_orden
      FROM landing_page_config
      WHERE tenant_id = $1 AND section = $2
    `, [tenant_id, section]);

    const newOrden = maxOrdenResult.rows[0].max_orden + 1;

    const result = await db.query(`
      INSERT INTO landing_page_config (
        section_key,
        content_type,
        tenant_id,
        section,
        name,
        image,
        href,
        description,
        orden
      ) VALUES (
        $1, 'json', $2, $3, $4, $5, $6, $7, $8
      )
      RETURNING config_id as id, section, name, image, href, description, orden
    `, [
      `${section}_item_${Date.now()}`,
      tenant_id,
      section,
      name,
      image,
      href,
      description || null,
      newOrden
    ]);

    return res.status(201).json({
      success: true,
      message: 'Item creado exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating landing item:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al crear item',
      error: error.message
    });
  }
};

/**
 * PUT /api/admin/landing-config/:id
 * Update carousel item
 * Body: { name, image, href, description }
 */
exports.updateLandingItem = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;
    const { id } = req.params;
    const { name, image, href, description } = req.body;

    if (!id || id === 'undefined') {
      return res.status(400).json({
        success: false,
        message: 'ID inválido o no proporcionado'
      });
    }

    if (!name || !image || !href) {
      return res.status(400).json({
        success: false,
        message: 'Campos requeridos: name, image, href'
      });
    }

    const result = await db.query(`
      UPDATE landing_page_config
      SET 
        name = $1,
        image = $2,
        href = $3,
        description = $4,
        updated_at = CURRENT_TIMESTAMP
      WHERE config_id = $5 AND tenant_id = $6
      RETURNING config_id as id, section, name, image, href, description, orden
    `, [name, image, href, description || null, id, tenant_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Item no encontrado'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Item actualizado exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating landing item:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al actualizar item',
      error: error.message
    });
  }
};

/**
 * DELETE /api/admin/landing-config/:id
 * Delete carousel item
 */
exports.deleteLandingItem = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;
    const { id } = req.params;

    if (!id || id === 'undefined') {
      return res.status(400).json({
        success: false,
        message: 'ID inválido o no proporcionado'
      });
    }

    const result = await db.query(`
      DELETE FROM landing_page_config
      WHERE config_id = $1 AND tenant_id = $2
      RETURNING section
    `, [id, tenant_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Item no encontrado'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Item eliminado exitosamente'
    });
  } catch (error) {
    console.error('Error deleting landing item:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al eliminar item',
      error: error.message
    });
  }
};

/**
 * POST /api/admin/landing-config/reorder
 * Reorder carousel items
 * Body: { section, items: [{ id, orden }] }
 */
exports.reorderLandingItems = async (req, res) => {
  const client = await db.getClient();
  
  try {
    const { tenant_id } = req.tenant;
    const { section, items } = req.body;

    if (!section || !Array.isArray(items)) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere section y array de items'
      });
    }

    await client.query('BEGIN');

    for (const item of items) {
      await client.query(`
        UPDATE landing_page_config
        SET orden = $1, updated_at = CURRENT_TIMESTAMP
        WHERE config_id = $2 AND tenant_id = $3 AND section = $4
      `, [item.orden, item.id, tenant_id, section]);
    }

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Orden actualizado exitosamente'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error reordering landing items:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al actualizar orden',
      error: error.message
    });
  } finally {
    client.release();
  }
};

/**
 * GET /api/public/landing-items
 * Public endpoint - Get carousel items for landing page (categories and brands)
 */
exports.getPublicLandingItems = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;

    const result = await db.query(`
      SELECT 
        config_id as id,
        section,
        name,
        image,
        href,
        description,
        orden
      FROM landing_page_config
      WHERE tenant_id = $1 
        AND section IN ('categories', 'brands')
      ORDER BY section, orden ASC, config_id ASC
    `, [tenant_id]);

    const categories = result.rows.filter(item => item.section === 'categories');
    const brands = result.rows.filter(item => item.section === 'brands');

    return res.status(200).json({
      success: true,
      data: {
        categories,
        brands
      }
    });
  } catch (error) {
    console.error('Error fetching public landing items:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener items de landing'
    });
  }
};
