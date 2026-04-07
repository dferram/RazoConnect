/**
 * EXPORTACIÓN INVENTARIO CONTROLLER
 * 
 * Controlador especializado para exportación de datos de inventario a PDF.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/exportacionInventarioController
 * @author RazoConnect Team
 * @date 2026-02-27
 */

const db = require('../db');
const logger = require('../utils/logger');
const SmartStockService = require('../services/SmartStockService');

/**
 * Exportar inventario a PDF
 * GET /api/admin/inventario/exportar-pdf
 * Retorna datos de variantes con stock > 0, respetando filtros aplicados
 */
const exportarInventarioPDF = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;
    const userId = req.user?.id;
    const userRoles = req.user?.roles || [req.user?.rol];
    const userRol = req.user?.rol?.toLowerCase();
    const isSuperAdmin = userRol === 'superadmin' || userRol === 'super-admin';

    const { categoria, proveedor, admin_id, search } = req.query;
    
    const whereClauses = [`p.tenant_id = $1`];
    const params = [tenant_id];
    let paramIndex = 2;

    if (search && search.trim()) {
      whereClauses.push(`(
        LOWER(p.NombreProducto) LIKE LOWER($${paramIndex}) OR
        LOWER(pv.sku) LIKE LOWER($${paramIndex})
      )`);
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    if (categoria && categoria !== 'todos' && categoria !== 'undefined') {
      const categoriaId = parseInt(categoria, 10);
      if (!isNaN(categoriaId)) {
        whereClauses.push(`p.CategoriaID = $${paramIndex}`);
        params.push(categoriaId);
        paramIndex++;
      }
    }

    if (proveedor && proveedor !== 'todos' && proveedor !== 'undefined') {
      const proveedorId = parseInt(proveedor, 10);
      if (!isNaN(proveedorId)) {
        whereClauses.push(`p.ProveedorID_Default = $${paramIndex}`);
        params.push(proveedorId);
        paramIndex++;
      }
    }

    // Filtro por administrador (solo para super admin)
    let adminFilterJoin = '';
    if (admin_id && admin_id !== 'todos' && admin_id !== 'undefined') {
      const adminIdInt = parseInt(admin_id, 10);
      if (!isNaN(adminIdInt)) {
        adminFilterJoin = `
          INNER JOIN stock_admin sa ON sa.variante_id = pv.VarianteID AND sa.tenant_id = $1
        `;
        whereClauses.push(`sa.admin_id = $${paramIndex}`);
        params.push(adminIdInt);
        paramIndex++;
      }
    }

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const query = `
      SELECT
        pv.VarianteID,
        pv.sku,
        p.nombreproducto AS producto,
        pv.dimensiones AS variante,
        COALESCE(m.nombremedida, pv.dimensiones, 'N/A') AS medida,
        COALESCE(pv.color_nombre, 'Sin color') AS color,
        COALESCE(c.nombre, 'Sin categoría') AS categoria,
        'N/A' AS ubicacion
      FROM producto_variantes pv
      INNER JOIN productos p ON p.productoid = pv.productoid
      LEFT JOIN medidas m ON m.medidaid = pv.medidaid
      LEFT JOIN categorias c ON c.categoriaid = p.categoriaid AND c.tenant_id = $1
      ${adminFilterJoin}
      ${whereClause}
      ORDER BY p.nombreproducto, pv.sku
    `;

    const result = await db.query(query, params);

    // Obtener información del administrador responsable del inventario
    let adminInfo = null;
    if (admin_id && admin_id !== 'todos' && admin_id !== 'undefined') {
      const adminIdInt = parseInt(admin_id, 10);
      if (!isNaN(adminIdInt)) {
        const adminResult = await db.query(
          `SELECT nombre, apellido, email FROM administradores WHERE adminid = $1 AND tenant_id = $2`,
          [adminIdInt, tenant_id]
        );
        if (adminResult.rows.length > 0) {
          adminInfo = {
            nombre: adminResult.rows[0].nombre,
            apellido: adminResult.rows[0].apellido || '',
            email: adminResult.rows[0].email
          };
        }
      }
    }

    // Obtener información del usuario que genera el reporte
    let generadoPor = null;
    if (userId) {
      const userResult = await db.query(
        `SELECT nombre, apellido, email FROM administradores WHERE adminid = $1 AND tenant_id = $2`,
        [userId, tenant_id]
      );
      if (userResult.rows.length > 0) {
        generadoPor = {
          nombre: userResult.rows[0].nombre,
          apellido: userResult.rows[0].apellido || '',
          email: userResult.rows[0].email
        };
      }
    }

    // ✅ SMART STOCK: Obtener stock real según rol del usuario
    const varianteIds = result.rows.map(row => row.varianteid);
    let stockMap = new Map();

    if (varianteIds.length > 0) {
      try {
        stockMap = await SmartStockService.getBulkStock({
          varianteIds,
          userId,
          userRole: userRoles,
          tenantId: tenant_id,
          estadoId: req.user?.estadoId || null
        });
      } catch (error) {
        logger.error('[exportarInventarioPDF] Error al obtener stock:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
      }
    }

    // Construir datos con stock real y filtrar solo con stock > 0
    const datosConStock = result.rows
      .map(row => ({
        sku: row.sku,
        producto: row.producto,
        variante: row.variante,
        medida: row.medida,
        color: row.color,
        categoria: row.categoria,
        stock: stockMap.get(row.varianteid) || 0,
        ubicacion: row.ubicacion
      }))
      .filter(item => item.stock > 0);

    res.json({
      success: true,
      data: datosConStock,
      total: datosConStock.length,
      adminInfo: adminInfo,
      generadoPor: generadoPor,
      filtrosAplicados: {
        categoria: categoria && categoria !== 'todos' && categoria !== 'undefined' ? categoria : null,
        proveedor: proveedor && proveedor !== 'todos' && proveedor !== 'undefined' ? proveedor : null,
        admin_id: admin_id && admin_id !== 'todos' && admin_id !== 'undefined' ? admin_id : null,
        search: search && search.trim() ? search.trim() : null
      }
    });
  } catch (error) {
    logger.error('Error al exportar inventario para PDF:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error al obtener datos del inventario"
    });
  }
};

module.exports = {
  exportarInventarioPDF
};
