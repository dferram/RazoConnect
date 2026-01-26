const pool = require('../db');

async function getLandingConfig(req, res) {
  const { tenant_id } = req.tenant;

  try {
    const result = await pool.query(
      `SELECT config_id as id, section, name, image, href, description, orden, created_at, updated_at
       FROM landing_page_config 
       WHERE tenant_id = $1 AND section IN ('categories', 'brands')
       ORDER BY section, orden ASC`,
      [tenant_id]
    );

    const config = {
      categories: result.rows.filter(row => row.section === 'categories'),
      brands: result.rows.filter(row => row.section === 'brands')
    };

    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('Error obteniendo configuración de landing:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener la configuración de la landing'
    });
  }
}

async function createLandingItem(req, res) {
  const { tenant_id } = req.tenant;
  const { section, name, image, href, description, orden } = req.body;

  if (!section || !name || !image || !href) {
    return res.status(400).json({
      success: false,
      message: 'Faltan campos requeridos: section, name, image, href'
    });
  }

  if (!['categories', 'brands'].includes(section)) {
    return res.status(400).json({
      success: false,
      message: 'Section debe ser "categories" o "brands"'
    });
  }

  try {
    const maxOrdenResult = await pool.query(
      `SELECT COALESCE(MAX(orden), 0) as max_orden 
       FROM landing_page_config 
       WHERE tenant_id = $1 AND section = $2`,
      [tenant_id, section]
    );

    const newOrden = orden !== undefined ? orden : maxOrdenResult.rows[0].max_orden + 1;

    const result = await pool.query(
      `INSERT INTO landing_page_config (tenant_id, section, name, image, href, description, orden, section_key, content_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING config_id as id, section, name, image, href, description, orden, created_at, updated_at`,
      [tenant_id, section, name, image, href, description || null, newOrden, `${section}_${Date.now()}`, 'json']
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Item creado exitosamente'
    });
  } catch (error) {
    console.error('Error creando item de landing:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear el item'
    });
  }
}

async function updateLandingItem(req, res) {
  const { tenant_id } = req.tenant;
  const { id } = req.params;
  const { name, image, href, description, orden } = req.body;

  try {
    const checkResult = await pool.query(
      `SELECT * FROM landing_page_config WHERE config_id = $1 AND tenant_id = $2`,
      [id, tenant_id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Item no encontrado'
      });
    }

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (image !== undefined) {
      updates.push(`image = $${paramCount++}`);
      values.push(image);
    }
    if (href !== undefined) {
      updates.push(`href = $${paramCount++}`);
      values.push(href);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(description);
    }
    if (orden !== undefined) {
      updates.push(`orden = $${paramCount++}`);
      values.push(orden);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No hay campos para actualizar'
      });
    }

    values.push(id, tenant_id);

    const result = await pool.query(
      `UPDATE landing_page_config 
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE config_id = $${paramCount++} AND tenant_id = $${paramCount}
       RETURNING config_id as id, section, name, image, href, description, orden, created_at, updated_at`,
      values
    );

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Item actualizado exitosamente'
    });
  } catch (error) {
    console.error('Error actualizando item de landing:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar el item'
    });
  }
}

async function deleteLandingItem(req, res) {
  const { tenant_id } = req.tenant;
  const { id } = req.params;

  try {
    const result = await pool.query(
      `DELETE FROM landing_page_config 
       WHERE config_id = $1 AND tenant_id = $2
       RETURNING *`,
      [id, tenant_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Item no encontrado'
      });
    }

    res.json({
      success: true,
      message: 'Item eliminado exitosamente'
    });
  } catch (error) {
    console.error('Error eliminando item de landing:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar el item'
    });
  }
}

async function reorderLandingItems(req, res) {
  const { tenant_id } = req.tenant;
  const { section, items } = req.body;

  if (!section || !items || !Array.isArray(items)) {
    return res.status(400).json({
      success: false,
      message: 'Se requiere section y un array de items con id y orden'
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const item of items) {
      if (!item.id || item.orden === undefined) {
        throw new Error('Cada item debe tener id y orden');
      }

      await client.query(
        `UPDATE landing_page_config 
         SET orden = $1, updated_at = NOW()
         WHERE config_id = $2 AND tenant_id = $3 AND section = $4`,
        [item.orden, item.id, tenant_id, section]
      );
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Orden actualizado exitosamente'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error reordenando items de landing:', error);
    res.status(500).json({
      success: false,
      message: 'Error al reordenar los items'
    });
  } finally {
    client.release();
  }
}

module.exports = {
  getLandingConfig,
  createLandingItem,
  updateLandingItem,
  deleteLandingItem,
  reorderLandingItems
};
