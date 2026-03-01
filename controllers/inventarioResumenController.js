/**
 * INVENTARIO RESUMEN CONTROLLER
 * 
 * Controlador especializado para resúmenes y detalles de inventario.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/inventarioResumenController
 * @author RazoConnect Team
 * @date 2026-02-27
 */

const db = require('../db');
const logger = require('../utils/logger');
const SmartStockService = require('../services/SmartStockService');

/**
 * Obtener resumen de inventario por producto maestro
 * GET /api/admin/inventario
 */
const getInventarioResumen = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;
    const userId = req.user?.id;
    const userRoles = req.user?.roles || [req.user?.rol];
    const userRol = req.user?.rol?.toLowerCase();
    const isSuperAdmin = userRol === 'superadmin' || userRol === 'super-admin' || userRol === 'super_admin';

    const { stock, categoria, proveedor, admin_id, search, tipo_ingreso, fecha_desde, fecha_hasta } = req.query;

    const whereClauses = [`p.tenant_id = $1`];
    const params = [tenant_id];
    let paramIndex = 2;

    if (search && search.trim()) {
      whereClauses.push(`(
        LOWER(p.NombreProducto) LIKE LOWER($${paramIndex}) OR
        CAST(p.ProductoID AS TEXT) LIKE $${paramIndex}
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
        // JOIN con stock_admin para filtrar por admin
        adminFilterJoin = `
          INNER JOIN stock_admin sa ON sa.variante_id = v.VarianteID AND sa.tenant_id = $1
        `;
        whereClauses.push(`sa.admin_id = $${paramIndex}`);
        params.push(adminIdInt);
        paramIndex++;
      }
    }

    // Filtros de tipo de ingreso y fecha
    let inventarioFilterJoin = '';
    if ((tipo_ingreso && tipo_ingreso !== 'todos') || fecha_desde || fecha_hasta) {
      inventarioFilterJoin = `
        INNER JOIN inventarios_admin ia ON ia.variante_id = v.VarianteID AND ia.tenant_id = $1
      `;
      
      if (tipo_ingreso && tipo_ingreso !== 'todos') {
        whereClauses.push(`ia.tipo_ingreso = $${paramIndex}`);
        params.push(tipo_ingreso);
        paramIndex++;
      }
      
      if (fecha_desde) {
        whereClauses.push(`ia.fecha_registro >= $${paramIndex}`);
        params.push(fecha_desde);
        paramIndex++;
      }
      
      if (fecha_hasta) {
        whereClauses.push(`ia.fecha_registro <= $${paramIndex}::date + INTERVAL '1 day'`);
        params.push(fecha_hasta);
        paramIndex++;
      }
    }

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // ✅ SMART STOCK: Obtener productos con sus variantes (sin filtrar por stock aún)
    const query = `
      SELECT
        p.ProductoID,
        p.NombreProducto,
        p.Activo,
        c.Nombre AS NombreCategoria,
        ARRAY_AGG(DISTINCT v.VarianteID) FILTER (WHERE v.VarianteID IS NOT NULL) AS VarianteIDs,
        COUNT(DISTINCT v.VarianteID) AS TotalVariantes
      FROM Productos p
      LEFT JOIN Categorias c ON c.CategoriaID = p.CategoriaID AND c.tenant_id = $1
      LEFT JOIN Producto_Variantes v ON v.ProductoID = p.ProductoID
      ${adminFilterJoin}
      ${inventarioFilterJoin}
      ${whereClause}
      GROUP BY p.ProductoID, p.NombreProducto, p.Activo, c.Nombre
      ORDER BY p.NombreProducto ASC
    `;

    const result = await db.query(query, params);

    // ✅ OPTIMIZACIÓN: Recolectar TODOS los variant IDs de una vez
    const allVarianteIds = [];
    result.rows.forEach(row => {
      const varianteIds = row.varianteids || [];
      allVarianteIds.push(...varianteIds);
    });

    // ✅ SMART STOCK: Una sola llamada bulk para TODAS las variantes
    let globalStockMap = new Map();
    if (allVarianteIds.length > 0) {
      try {
        globalStockMap = await SmartStockService.getBulkStock({
          varianteIds: allVarianteIds,
          userId,
          userRole: userRoles,
          tenantId: tenant_id
        });
      } catch (error) {
        logger.error('[getInventarioResumen] Error al obtener stock bulk:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
      }
    }

    // ✅ Construir productos con stock desde el mapa global
    const productosConStock = result.rows.map(row => {
      const varianteIds = row.varianteids || [];
      
      // Calcular stock total del producto desde el mapa global
      const stockTotal = varianteIds.reduce((sum, varianteId) => {
        return sum + (globalStockMap.get(varianteId) || 0);
      }, 0);

      return {
        productoId: row.productoid,
        nombreProducto: row.nombreproducto,
        activo: row.activo !== undefined ? row.activo : true,
        nombreCategoria: row.nombrecategoria || "Sin categoría",
        totalVariantes: parseInt(row.totalvariantes, 10) || 0,
        stockTotal
      };
    });

    // ✅ Aplicar filtro de stock después de calcular con SmartStockService
    let productosFiltrados = productosConStock;
    if (stock === 'con') {
      productosFiltrados = productosConStock.filter(p => p.stockTotal > 0);
    } else if (stock === 'sin') {
      productosFiltrados = productosConStock.filter(p => p.stockTotal === 0);
    }

    res.json({
      success: true,
      data: {
        productos: productosFiltrados,
        total: productosFiltrados.length,
        isSuperAdmin
      },
    });
  } catch (error) {
    logger.error('Error al obtener inventario resumido:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * Obtener detalle completo de producto para modal de inventario
 * GET /api/admin/inventario/producto-detalle/:id
 * Incluye: proveedor, variantes con stock por admin, totales
 */
const getProductoDetalleInventario = async (req, res) => {
  try {
    const productoId = parseInt(req.params.id, 10);
    const userId = req.user?.id;
    const userRoles = req.user?.roles || [req.user?.rol];
    const { tenant_id } = req.tenant;

    if (Number.isNaN(productoId)) {
      return res.status(400).json({
        success: false,
        message: "ProductoID inválido",
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Usuario no autenticado",
      });
    }

    // ✅ SMART STOCK: Consulta sin stock directo (se obtiene después con SmartStockService)
    const productoQuery = `
      SELECT
        p.productoid,
        p.nombreproducto,
        p.sku_maestro,
        p.descripcion,
        p.proveedorid_default,
        p.activo,
        p.categoriaid,
        prov.nombreempresa AS proveedor_nombre,
        c.nombre AS categoria_nombre,
        (
          SELECT JSON_AGG(
            JSON_BUILD_OBJECT(
              'imagenId', pi.imagenid,
              'url', pi.url_imagen,
              'textoAlternativo', pi.textoalternativo,
              'orden', pi.orden
            ) ORDER BY pi.orden ASC NULLS LAST, pi.imagenid ASC
          )
          FROM producto_imagenes pi
          WHERE pi.productoid = p.productoid
        ) AS imagenes,
        (
          SELECT JSON_AGG(
            JSON_BUILD_OBJECT(
              'varianteId', pv.varianteid,
              'sku', pv.sku,
              'dimensiones', pv.dimensiones,
              'colorNombre', pv.color_nombre,
              'precioUnitario', pv.preciounitario,
              'activo', pv.activo
            )
          )
          FROM producto_variantes pv
          WHERE pv.productoid = p.productoid
        ) AS lista_variantes,
        (
          SELECT COUNT(*)
          FROM producto_variantes pv
          WHERE pv.productoid = p.productoid
        ) AS total_variantes
      FROM productos p
      LEFT JOIN proveedores prov ON prov.proveedorid = p.proveedorid_default
      LEFT JOIN categorias c ON c.categoriaid = p.categoriaid
      WHERE p.productoid = $1
    `;

    const result = await db.query(productoQuery, [productoId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Producto no encontrado",
      });
    }

    const row = result.rows[0];
    const variantes = row.lista_variantes || [];
    const imagenes = row.imagenes || [];

    // ✅ SMART STOCK: Obtener stock dinámico para todas las variantes
    const varianteIds = variantes.map(v => v.varianteId || v.varianteid).filter(Boolean);
    let stockMap = new Map();
    
    if (varianteIds.length > 0) {
      try {
        stockMap = await SmartStockService.getBulkStock({
          varianteIds,
          userId,
          userRole: userRoles,
          tenantId: tenant_id
        });
      } catch (error) {
        logger.error('[getProductoDetalleInventario] Error al obtener stock dinámico:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
      }
    }

    // Calcular total de stock
    const totalStock = varianteIds.reduce((sum, varianteId) => {
      return sum + (stockMap.get(varianteId) || 0);
    }, 0);

    const productoDetalle = {
      productoId: row.productoid,
      nombreProducto: row.nombreproducto,
      skuMaestro: row.sku_maestro || "Sin SKU",
      descripcion: row.descripcion || "Sin descripción",
      proveedor: row.proveedor_nombre || "Sin asignar",
      categoria: row.categoria_nombre || "Sin categoría",
      activo: row.activo,
      totalVariantes: parseInt(row.total_variantes, 10) || 0,
      totalStock,
      imagenes: imagenes.map(img => ({
        imagenId: img.imagenid,
        url: img.url,
        textoAlternativo: img.textoalternativo || null,
        orden: img.orden !== null && img.orden !== undefined ? parseInt(img.orden, 10) : null
      })),
      variantes: variantes.map(v => {
        const varianteId = v.varianteId || v.varianteid;
        const precioRaw = v.precioUnitario || v.preciounitario;
        const precio = precioRaw !== null && precioRaw !== undefined 
          ? parseFloat(precioRaw) 
          : 0;
        
        const medida = v.dimensiones || null;
        const color = v.colorNombre || v.colornombre || null;
        
        // ✅ SMART STOCK: Usar stock dinámico del mapa
        const stockDinamico = stockMap.get(varianteId) || 0;
        
        return {
          varianteId,
          sku: v.sku || "Sin SKU",
          medida: medida,
          color: color,
          caracteristica: color || medida || "Sin especificar",
          precio: precio,
          stock: stockDinamico,
          activo: v.activo !== false
        };
      })
    };

    return res.json({
      success: true,
      message: "Detalle de producto obtenido exitosamente",
      data: productoDetalle,
    });
  } catch (error) {
    logger.error('[getProductoDetalleInventario] Error:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "Error en el servidor"
    });
  }
};

module.exports = {
  getInventarioResumen,
  getProductoDetalleInventario
};
