/**
 * DASHBOARD FINANZAS CONTROLLER
 * 
 * Controlador especializado para el dashboard del rol finanzas.
 * Proporciona totales consolidados con caché Redis para optimizar rendimiento.
 * 
 * @module controllers/dashboardFinanzasController
 * @author RazoConnect Team - Senior Engineer
 * @date 2026-03-09
 */

const db = require('../db');
const logger = require('../utils/logger');
const { getOrSetCache } = require('../config/redisClient');

/**
 * Obtiene totales consolidados para el dashboard de finanzas
 * Incluye: CXC, CXP, Comisiones
 * Usa caché Redis con TTL de 5 minutos
 * 
 * @route GET /api/admin/dashboard/finanzas-totales
 */
const getFinanzasTotales = async (req, res) => {
  try {
    const userId = req.user.id;
    const adminId = req.user?.adminId || req.user?.userId;
    const tenantId = req.tenant?.tenant_id || 1;

    // Authorization is already handled by authorizeRole middleware at route level
    // No need for redundant checks here

    // Clave de caché única por tenant (y admin si es admin específico)
    const cacheKey = `finanzas_totales:tenant_${tenantId}:admin_${adminId}`;

    // Intentar obtener desde caché o calcular
    const totales = await getOrSetCache(
      cacheKey,
      async () => {
        console.log('🔄 [FINANZAS] Calculando totales desde PostgreSQL...');

        // Query 1: Totales de CXC (Cuentas por Cobrar) - ⚠️ CRITICAL: Filter by admin_id
        const cxcQuery = `
          SELECT
            COALESCE(SUM(saldo_deudor), 0) as total_cxc,
            COUNT(DISTINCT cliente_id) as clientes_con_deuda,
            COALESCE(SUM(CASE
              WHEN EXISTS (
                SELECT 1 FROM pedidos p
                WHERE p.clienteid = cliente_creditos.cliente_id
                AND p.fecha_vencimiento < NOW()
                AND COALESCE(p.pagado, FALSE) = FALSE
              ) THEN saldo_deudor
              ELSE 0
            END), 0) as total_vencido
          FROM cliente_creditos
          WHERE saldo_deudor > 0
            AND tenant_id = $1
            AND admin_id = $2
        `;
        const cxcResult = await db.query(cxcQuery, [tenantId, adminId]);
        const cxcData = cxcResult.rows[0];

        // Query 2: Totales de CXP (Cuentas por Pagar)
        const cxpQuery = `
          SELECT 
            COALESCE(SUM(CASE 
              WHEN estatus IN ('PENDIENTE', 'PARCIAL') 
              THEN monto_total - COALESCE(monto_pagado, 0) 
              ELSE 0 
            END), 0) as total_cxp,
            COALESCE(SUM(CASE 
              WHEN estatus IN ('PENDIENTE', 'PARCIAL') 
              AND fecha_vencimiento < CURRENT_DATE 
              THEN monto_total - COALESCE(monto_pagado, 0) 
              ELSE 0 
            END), 0) as total_vencido,
            COUNT(CASE 
              WHEN estatus IN ('PENDIENTE', 'PARCIAL') 
              THEN 1 
            END) as cuentas_pendientes
          FROM cuentas_por_pagar
          WHERE tenant_id = $1
            AND estatus NOT IN ('CANCELADO')
        `;
        const cxpResult = await db.query(cxpQuery, [tenantId]);
        const cxpData = cxpResult.rows[0];

        // Query 3: Totales de Comisiones
        const comisionesQuery = `
          SELECT 
            COUNT(*) FILTER (WHERE Estatus = 'Pendiente') as total_pendientes,
            COUNT(*) FILTER (WHERE Estatus = 'Pagado') as total_pagadas,
            COALESCE(SUM(MontoComision) FILTER (WHERE Estatus = 'Pendiente'), 0) as monto_pendiente,
            COALESCE(SUM(MontoComision) FILTER (WHERE Estatus = 'Pagado'), 0) as monto_pagado,
            COALESCE(SUM(MontoComision), 0) as monto_total
          FROM Comisiones
        `;
        const comisionesResult = await db.query(comisionesQuery);
        const comisionesData = comisionesResult.rows[0];

        // Query 4: Totales de Pagos Pendientes de Validar
        const pagosPendientesQuery = `
          SELECT COUNT(*) as pagos_pendientes
          FROM pagos_clientes
          WHERE estatus = 'pendiente'
            AND tenant_id = $1
        `;
        const pagosPendientesResult = await db.query(pagosPendientesQuery, [tenantId]);
        const pagosPendientesData = pagosPendientesResult.rows[0];

        return {
          cxc: {
            total: parseFloat(cxcData.total_cxc || 0),
            vencido: parseFloat(cxcData.total_vencido || 0),
            clientes: parseInt(cxcData.clientes_con_deuda || 0)
          },
          cxp: {
            total: parseFloat(cxpData.total_cxp || 0),
            vencido: parseFloat(cxpData.total_vencido || 0),
            cuentas: parseInt(cxpData.cuentas_pendientes || 0)
          },
          comisiones: {
            totalPendientes: parseInt(comisionesData.total_pendientes || 0),
            totalPagadas: parseInt(comisionesData.total_pagadas || 0),
            montoPendiente: parseFloat(comisionesData.monto_pendiente || 0),
            montoPagado: parseFloat(comisionesData.monto_pagado || 0),
            montoTotal: parseFloat(comisionesData.monto_total || 0)
          },
          pagos: {
            pendientesValidacion: parseInt(pagosPendientesData.pagos_pendientes || 0)
          },
          metadata: {
            calculadoEn: new Date().toISOString(),
            tenantId: tenantId,
            cacheado: true
          }
        };
      },
      300 // TTL: 5 minutos (300 segundos)
    );

    console.log('✅ [FINANZAS] Totales obtenidos exitosamente');

    return res.json({
      success: true,
      data: totales
    });

  } catch (error) {
    logger.error('Error al obtener totales de finanzas:', {
      error: error.message,
      stack: error.stack,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    
    return res.status(500).json({
      success: false,
      message: 'Error al obtener totales financieros',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Invalida el caché de totales financieros
 * Útil cuando se registra un pago, se crea una factura, etc.
 * 
 * @route POST /api/admin/dashboard/finanzas-totales/invalidar-cache
 */
const invalidarCacheFinanzas = async (req, res) => {
  try {
    const tenantId = req.tenant?.tenant_id || 1;
    const cacheKey = `finanzas_totales:tenant_${tenantId}`;
    
    const redisClient = require('../config/redisClient');
    await redisClient.del(cacheKey);
    
    console.log(`✅ [FINANZAS] Caché invalidado: ${cacheKey}`);
    
    return res.json({
      success: true,
      message: 'Caché de totales financieros invalidado correctamente'
    });
  } catch (error) {
    logger.error('Error al invalidar caché de finanzas:', {
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
  getFinanzasTotales,
  invalidarCacheFinanzas
};
