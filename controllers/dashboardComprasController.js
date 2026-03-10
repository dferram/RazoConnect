/**
 * DASHBOARD COMPRAS CONTROLLER
 * 
 * Controlador especializado para el dashboard del rol compras.
 * Proporciona estadísticas de órdenes de compra, recepciones y proveedores.
 * 
 * @module controllers/dashboardComprasController
 * @author RazoConnect Team - Senior Engineer
 * @date 2026-03-09
 */

const db = require('../db');
const logger = require('../utils/logger');
const { getOrSetCache } = require('../config/redisClient');

/**
 * Obtiene totales consolidados para el dashboard de compras
 * Incluye: Órdenes de compra, recepciones, proveedores
 * Usa caché Redis con TTL de 5 minutos
 * 
 * @route GET /api/admin/dashboard/compras-totales
 */
const getComprasTotales = async (req, res) => {
  try {
    const userId = req.user.id;
    const tenantId = req.tenant?.tenant_id || 1;

    // Authorization is already handled by authorizeRole middleware at route level
    // No need for redundant checks here

    // Clave de caché única por tenant
    const cacheKey = `compras_totales:tenant_${tenantId}`;
    
    // Intentar obtener desde caché o calcular
    const totales = await getOrSetCache(
      cacheKey,
      async () => {
        console.log('🔄 [COMPRAS] Calculando totales desde PostgreSQL...');
        
        // Query 1: Totales de Órdenes de Compra
        const ordenesQuery = `
          SELECT 
            COUNT(*) FILTER (WHERE estatus = 'Pendiente') as ordenes_pendientes,
            COUNT(*) FILTER (WHERE estatus = 'En Tránsito') as ordenes_transito,
            COUNT(*) FILTER (WHERE estatus = 'Recibido') as ordenes_recibidas,
            COUNT(*) FILTER (WHERE estatus = 'Cancelado') as ordenes_canceladas,
            COALESCE(SUM(CASE 
              WHEN estatus IN ('Pendiente', 'En Tránsito') 
              THEN (
                SELECT COALESCE(SUM(doc.cantidadsolicitada * doc.costounitario), 0)
                FROM detallesordencompra doc
                WHERE doc.ordencompraid = ordenesdecompra.ordencompraid
              )
              ELSE 0 
            END), 0) as valor_ordenes_activas,
            COALESCE(SUM(CASE 
              WHEN estatus = 'Recibido' 
              AND fechacreacion >= CURRENT_DATE - INTERVAL '30 days'
              THEN (
                SELECT COALESCE(SUM(doc.cantidadsolicitada * doc.costounitario), 0)
                FROM detallesordencompra doc
                WHERE doc.ordencompraid = ordenesdecompra.ordencompraid
              )
              ELSE 0 
            END), 0) as valor_recibido_mes
          FROM ordenesdecompra
          WHERE tenant_id = $1
        `;
        const ordenesResult = await db.query(ordenesQuery, [tenantId]);
        const ordenesData = ordenesResult.rows[0];

        // Query 2: Estadísticas de Recepciones (calculadas desde órdenes recibidas)
        const recepcionesData = {
          total_recepciones_mes: parseInt(ordenesData.ordenes_recibidas || 0),
          total_paquetes_recibidos: 0,
          total_piezas_recibidas: 0,
          usuarios_recibiendo: 0
        };

        // Query 3: Estadísticas de Proveedores
        const proveedoresQuery = `
          SELECT 
            COUNT(*) as total_proveedores,
            COUNT(*) as proveedores_activos,
            COUNT(DISTINCT oc.proveedorid) as proveedores_con_ordenes_activas
          FROM proveedores p
          LEFT JOIN ordenesdecompra oc ON p.proveedorid = oc.proveedorid 
            AND oc.estatus IN ('Pendiente', 'En Tránsito')
            AND oc.tenant_id = $1
          WHERE p.tenant_id = $1
        `;
        const proveedoresResult = await db.query(proveedoresQuery, [tenantId]);
        const proveedoresData = proveedoresResult.rows[0];

        // Query 4: Órdenes próximas a vencer (entrega esperada en los próximos 7 días)
        const ordenesProximasQuery = `
          SELECT 
            COUNT(*) as ordenes_proximas_entrega,
            json_agg(
              json_build_object(
                'ordenCompraId', ordencompraid,
                'proveedorNombre', (SELECT nombreempresa FROM proveedores WHERE proveedorid = ordenesdecompra.proveedorid),
                'fechaEntrega', fechaentregaesperada,
                'diasRestantes', (fechaentregaesperada - CURRENT_DATE)
              )
              ORDER BY fechaentregaesperada ASC
            ) FILTER (WHERE estatus IN ('Pendiente', 'En Tránsito')) as ordenes_detalle
          FROM ordenesdecompra
          WHERE estatus IN ('Pendiente', 'En Tránsito')
            AND fechaentregaesperada BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
            AND tenant_id = $1
        `;
        const ordenesProximasResult = await db.query(ordenesProximasQuery, [tenantId]);
        const ordenesProximasData = ordenesProximasResult.rows[0];

        // Query 5: Top 5 proveedores por volumen de compra (últimos 3 meses)
        const topProveedoresQuery = `
          SELECT 
            p.proveedorid,
            p.nombreempresa,
            COUNT(DISTINCT oc.ordencompraid) as total_ordenes,
            COALESCE(SUM(
              (SELECT SUM(doc.cantidadsolicitada * doc.costounitario)
               FROM detallesordencompra doc
               WHERE doc.ordencompraid = oc.ordencompraid)
            ), 0) as valor_total
          FROM proveedores p
          INNER JOIN ordenesdecompra oc ON p.proveedorid = oc.proveedorid
          WHERE oc.fechacreacion >= CURRENT_DATE - INTERVAL '3 months'
            AND oc.tenant_id = $1
            AND p.tenant_id = $1
          GROUP BY p.proveedorid, p.nombreempresa
          ORDER BY valor_total DESC
          LIMIT 5
        `;
        const topProveedoresResult = await db.query(topProveedoresQuery, [tenantId]);

        return {
          ordenes: {
            pendientes: parseInt(ordenesData.ordenes_pendientes || 0),
            enTransito: parseInt(ordenesData.ordenes_transito || 0),
            recibidas: parseInt(ordenesData.ordenes_recibidas || 0),
            canceladas: parseInt(ordenesData.ordenes_canceladas || 0),
            valorActivas: parseFloat(ordenesData.valor_ordenes_activas || 0),
            valorRecibidoMes: parseFloat(ordenesData.valor_recibido_mes || 0)
          },
          recepciones: {
            totalRecepcionesMes: parseInt(recepcionesData.total_recepciones_mes || 0),
            totalPaquetesRecibidos: parseInt(recepcionesData.total_paquetes_recibidos || 0),
            totalPiezasRecibidas: parseInt(recepcionesData.total_piezas_recibidas || 0),
            usuariosRecibiendo: parseInt(recepcionesData.usuarios_recibiendo || 0)
          },
          proveedores: {
            total: parseInt(proveedoresData.total_proveedores || 0),
            activos: parseInt(proveedoresData.proveedores_activos || 0),
            conOrdenesActivas: parseInt(proveedoresData.proveedores_con_ordenes_activas || 0)
          },
          ordenesProximas: {
            total: parseInt(ordenesProximasData.ordenes_proximas_entrega || 0),
            detalle: ordenesProximasData.ordenes_detalle || []
          },
          topProveedores: topProveedoresResult.rows.map(row => ({
            proveedorId: row.proveedorid,
            nombre: row.nombreempresa,
            totalOrdenes: parseInt(row.total_ordenes),
            valorTotal: parseFloat(row.valor_total)
          })),
          metadata: {
            calculadoEn: new Date().toISOString(),
            tenantId: tenantId,
            cacheado: true
          }
        };
      },
      300 // TTL: 5 minutos (300 segundos)
    );

    console.log('✅ [COMPRAS] Totales obtenidos exitosamente');

    return res.json({
      success: true,
      data: totales
    });

  } catch (error) {
    logger.error('Error al obtener totales de compras:', {
      error: error.message,
      stack: error.stack,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    
    return res.status(500).json({
      success: false,
      message: 'Error al obtener totales de compras',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Invalida el caché de totales de compras
 * Útil cuando se crea/actualiza una orden, se recibe inventario, etc.
 * 
 * @route POST /api/admin/dashboard/compras-totales/invalidar-cache
 */
const invalidarCacheCompras = async (req, res) => {
  try {
    const tenantId = req.tenant?.tenant_id || 1;
    const cacheKey = `compras_totales:tenant_${tenantId}`;
    
    const redisClient = require('../config/redisClient');
    await redisClient.del(cacheKey);
    
    console.log(`✅ [COMPRAS] Caché invalidado: ${cacheKey}`);
    
    return res.json({
      success: true,
      message: 'Caché de totales de compras invalidado correctamente'
    });
  } catch (error) {
    logger.error('Error al invalidar caché de compras:', {
      error: error.message,
      requestId: req.requestId
    });
    
    return res.status(500).json({
      success: false,
      message: 'Error al invalidar caché'
    });
  }
};

module.exports = {
  getComprasTotales,
  invalidarCacheCompras
};
