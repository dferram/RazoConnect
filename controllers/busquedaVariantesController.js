/**
 * BÚSQUEDA VARIANTES CONTROLLER
 * 
 * Controlador especializado para búsqueda y autocompletado de variantes.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/busquedaVariantesController
 * @author RazoConnect Team
 * @date 2026-02-27
 */

const db = require('../db');
const logger = require('../utils/logger');

/**
 * Búsqueda de variantes con autocompletado para movimientos
 * GET /api/admin/variantes/search
 * Query params: q (search query), categoria_id, proveedor_id, medida_id, color
 */
const searchVariantesMovimientos = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;
    const searchQuery = (req.query.q || '').toString().trim();
    
    if (!searchQuery || searchQuery.length < 2) {
      return res.json({
        success: true,
        data: { variantes: [] }
      });
    }

    const where = ['pv.tenant_id = $1'];
    const values = [tenant_id];
    
    // Búsqueda por texto (SKU o nombre de producto)
    values.push(`%${searchQuery}%`);
    where.push(`(pv.sku ILIKE $${values.length} OR p.nombreproducto ILIKE $${values.length})`);
    
    // Filtro por categoría
    const categoriaId = req.query.categoria_id;
    if (categoriaId && categoriaId !== 'todos') {
      values.push(parseInt(categoriaId, 10));
      where.push(`p.categoriaid = $${values.length}`);
    }
    
    // Filtro por proveedor
    const proveedorId = req.query.proveedor_id;
    if (proveedorId && proveedorId !== 'todos') {
      values.push(parseInt(proveedorId, 10));
      where.push(`pre.proveedorid = $${values.length}`);
    }
    
    // Filtro por medida
    const medidaId = req.query.medida_id;
    if (medidaId && medidaId !== 'todos') {
      values.push(parseInt(medidaId, 10));
      where.push(`pv.medidaid = $${values.length}`);
    }
    
    // Filtro por color
    const color = req.query.color;
    if (color && color !== 'todos') {
      values.push(`%${color}%`);
      where.push(`pv.color_nombre ILIKE $${values.length}`);
    }

    const whereSql = where.join(' AND ');

    const result = await db.query(
      `SELECT 
         pv.varianteid,
         pv.sku,
         pv.dimensiones,
         pv.color_nombre,
         pv.color_hex,
         p.productoid,
         p.nombreproducto,
         p.imagenurl,
         c.nombre AS categoria_nombre,
         pr.nombreempresa AS proveedor_nombre,
         m.nombremedida AS medida_nombre
       FROM producto_variantes pv
       INNER JOIN productos p ON p.productoid = pv.productoid
       LEFT JOIN categorias c ON c.categoriaid = p.categoriaid
       LEFT JOIN proveedor_reglas_empaque pre ON pre.reglaid = p.reglaid
       LEFT JOIN proveedores pr ON pr.proveedorid = pre.proveedorid
       LEFT JOIN medidas m ON m.medidaid = pv.medidaid
       WHERE ${whereSql}
       ORDER BY p.nombreproducto ASC, pv.sku ASC
       LIMIT 10`,
      values
    );

    const variantes = result.rows.map(row => ({
      varianteId: row.varianteid,
      sku: row.sku,
      dimensiones: row.dimensiones,
      colorNombre: row.color_nombre,
      colorHex: row.color_hex,
      productoId: row.productoid,
      nombreProducto: row.nombreproducto,
      imagenUrl: row.imagenurl,
      categoriaNombre: row.categoria_nombre,
      proveedorNombre: row.proveedor_nombre,
      medidaNombre: row.medida_nombre
    }));

    return res.json({
      success: true,
      data: { variantes }
    });

  } catch (error) {
    logger.error('Error en búsqueda de variantes:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: 'Error al buscar variantes',
      error: error.message
    });
  }
};

module.exports = {
  searchVariantesMovimientos
};
