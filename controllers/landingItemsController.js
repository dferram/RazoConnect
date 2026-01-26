/**
 * Landing Items Controller
 * Manages categories and brands (proveedores) images and links for landing page carousels
 */

const db = require('../db');

/**
 * PUT /api/admin/categorias/:id/landing
 * Update category landing page image and link
 */
exports.updateCategoryLanding = async (req, res) => {
  const client = await db.getClient();
  
  try {
    const { id } = req.params;
    const { imagen_landing, link_landing } = req.body;
    const { tenant_id } = req.tenant;

    await client.query('BEGIN');

    // Verify category exists and belongs to tenant
    const categoryCheck = await client.query(
      'SELECT categoriaid FROM categorias WHERE categoriaid = $1 AND tenant_id = $2',
      [id, tenant_id]
    );

    if (categoryCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Categoría no encontrada'
      });
    }

    // Update category with landing page data
    await client.query(
      `UPDATE categorias 
       SET imagen_landing = $1, 
           link_landing = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE categoriaid = $3 AND tenant_id = $4`,
      [imagen_landing, link_landing, id, tenant_id]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Imagen y enlace de categoría actualizados correctamente',
      data: {
        categoriaId: id,
        imagen_landing,
        link_landing
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating category landing:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al actualizar categoría',
      error: error.message
    });
  } finally {
    client.release();
  }
};

/**
 * PUT /api/admin/proveedores/:id/landing
 * Update proveedor (brand) landing page image and link
 */
exports.updateProveedorLanding = async (req, res) => {
  const client = await db.getClient();
  
  try {
    const { id } = req.params;
    const { imagen_landing, link_landing } = req.body;
    const { tenant_id } = req.tenant;

    await client.query('BEGIN');

    // Verify proveedor exists and belongs to tenant
    const proveedorCheck = await client.query(
      'SELECT proveedorid FROM proveedores WHERE proveedorid = $1 AND tenant_id = $2',
      [id, tenant_id]
    );

    if (proveedorCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Proveedor no encontrado'
      });
    }

    // Update proveedor with landing page data
    await client.query(
      `UPDATE proveedores 
       SET imagen_landing = $1, 
           link_landing = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE proveedorid = $3 AND tenant_id = $4`,
      [imagen_landing, link_landing, id, tenant_id]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Imagen y enlace de proveedor actualizados correctamente',
      data: {
        proveedorId: id,
        imagen_landing,
        link_landing
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating proveedor landing:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al actualizar proveedor',
      error: error.message
    });
  } finally {
    client.release();
  }
};

/**
 * GET /api/public/landing-items
 * Public endpoint to get categories and brands with landing page data
 */
exports.getPublicLandingItems = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;

    // Get categories with landing data
    const categoriesResult = await db.query(
      `SELECT 
        categoriaid as id,
        nombre as name,
        imagen_landing as image,
        link_landing as href,
        COALESCE(link_landing, '/catalogo.html?categoria=' || categoriaid) as href
       FROM categorias
       WHERE activo = true 
         AND tenant_id = $1
         AND imagen_landing IS NOT NULL
       ORDER BY nombre`,
      [tenant_id]
    );

    // Get proveedores with landing data
    const proveedoresResult = await db.query(
      `SELECT 
        proveedorid as id,
        nombre as name,
        imagen_landing as image,
        link_landing as href,
        COALESCE(link_landing, '/proveedor-tienda.html?id=' || proveedorid) as href
       FROM proveedores
       WHERE activo = true 
         AND tenant_id = $1
         AND imagen_landing IS NOT NULL
       ORDER BY nombre`,
      [tenant_id]
    );

    return res.status(200).json({
      success: true,
      data: {
        categories: categoriesResult.rows,
        brands: proveedoresResult.rows
      }
    });

  } catch (error) {
    console.error('Error fetching public landing items:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener items de landing',
      error: error.message
    });
  }
};
