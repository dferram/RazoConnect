// @ts-nocheck
/**
 * ESTADOS MANTENIMIENTO CONTROLLER - DESACTIVADO TEMPORALMENTE
 * 
 * Responsabilidad: Endpoints de mantenimiento para corregir estados inconsistentes
 * - Validar y corregir inconsistencias
 * - Recalcular estados de pedidos
 * - Sincronizar estados de productos
 * 
 * NOTA: Este controlador está desactivado mientras se prueba el flujo manual de estados
 * 
 * @module controllers/mantenimiento/estadosMantenimientoController
 * @author RazoConnect Team
 * @date 2026-05-15
 */

const db = require('../../db');
const logger = require('../../utils/logger');
const EstadosPedidoService = require('../../services/EstadosPedidoService');

// ============================================================================
// TODOS LOS ENDPOINTS ESTÁN DESACTIVADOS TEMPORALMENTE
// ============================================================================
// Los endpoints están desactivados porque usan funciones de actualización automática
// que están comentadas en EstadosPedidoService
// 
// Para reactivarlos, descomentar las funciones en EstadosPedidoService.js
// ============================================================================

// Exportar funciones stub que retornan 503
module.exports = {
  sincronizarPedido: (req, res) => {
    res.status(503).json({
      success: false,
      message: 'Endpoint temporalmente desactivado - Actualización automática de estados deshabilitada'
    });
  },
  validarPedido: (req, res) => {
    res.status(503).json({
      success: false,
      message: 'Endpoint temporalmente desactivado - Actualización automática de estados deshabilitada'
    });
  },
  recalcularMasivo: (req, res) => {
    res.status(503).json({
      success: false,
      message: 'Endpoint temporalmente desactivado - Actualización automática de estados deshabilitada'
    });
  },
  diagnosticoPedido: (req, res) => {
    res.status(503).json({
      success: false,
      message: 'Endpoint temporalmente desactivado - Actualización automática de estados deshabilitada'
    });
  }
};

/*
// ============================================================================
// CÓDIGO ORIGINAL COMENTADO
// ============================================================================

exports.sincronizarPedido = async (req, res) => {
  const client = await db.connect();

  try {
    const { tenant_id, userRole } = req;
    const { id: pedidoId } = req.params;

    // Solo admin, gerente o inventarios
    if (!['admin', 'gerente', 'inventarios'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ejecutar esta operación'
      });
    }

    await client.query('BEGIN');

    // Obtener admin del pedido
    const pedidoQuery = `
      SELECT pedidoid, admin_asignado_id, estatus
      FROM pedidos
      WHERE pedidoid = $1 AND tenant_id = $2
    `;

    const pedidoResult = await client.query(pedidoQuery, [pedidoId, tenant_id]);

    if (pedidoResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Pedido no encontrado'
      });
    }

    const pedido = pedidoResult.rows[0];

    // Sincronizar estados
    const resultado = await EstadosPedidoService.sincronizarEstadosPedido(
      client,
      pedidoId,
      pedido.admin_asignado_id,
      tenant_id
    );

    await client.query('COMMIT');

    logger.info('✅ [MANTENIMIENTO] Pedido sincronizado', {
      pedidoId,
      estadoAnterior: pedido.estatus,
      estadoNuevo: resultado.estadoPedido,
      productosActualizados: resultado.productosActualizados,
      userId: req.userId,
      tenantId: tenant_id
    });

    res.json({
      success: true,
      message: 'Estados sincronizados correctamente',
      data: {
        ...resultado,
        estadoAnterior: pedido.estatus,
        cambio: pedido.estatus !== resultado.estadoPedido
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error al sincronizar pedido:', {
      error: error.message,
      stack: error.stack,
      pedidoId: req.params.id,
      tenantId: req.tenant_id
    });
    res.status(500).json({
      success: false,
      message: 'Error al sincronizar estados del pedido',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    client.release();
  }
};

/**
 * POST /api/mantenimiento/estados/validar-pedido/:id
 * Valida y corrige inconsistencias en un pedido
 */
exports.validarPedido = async (req, res) => {
  const client = await db.connect();

  try {
    const { tenant_id, userRole } = req;
    const { id: pedidoId } = req.params;
    const { corregir = true } = req.body;

    // Solo admin o gerente
    if (!['admin', 'gerente'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ejecutar esta operación'
      });
    }

    await client.query('BEGIN');

    // Validar y corregir
    const resultado = await EstadosPedidoService.validarYCorregirInconsistencias(
      client,
      pedidoId,
      tenant_id
    );

    if (corregir && resultado.corregido) {
      // Si se corrigieron inconsistencias, sincronizar estados
      const pedidoQuery = `
        SELECT admin_asignado_id FROM pedidos
        WHERE pedidoid = $1 AND tenant_id = $2
      `;
      const pedidoResult = await client.query(pedidoQuery, [pedidoId, tenant_id]);

      if (pedidoResult.rows.length > 0) {
        await EstadosPedidoService.sincronizarEstadosPedido(
          client,
          pedidoId,
          pedidoResult.rows[0].admin_asignado_id,
          tenant_id
        );
      }
    }

    await client.query('COMMIT');

    logger.info('✅ [MANTENIMIENTO] Pedido validado', {
      pedidoId,
      inconsistencias: resultado.inconsistenciasEncontradas,
      corregido: resultado.corregido,
      userId: req.userId,
      tenantId: tenant_id
    });

    res.json({
      success: true,
      message: resultado.corregido 
        ? 'Inconsistencias encontradas y corregidas'
        : 'No se encontraron inconsistencias',
      data: resultado
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error al validar pedido:', {
      error: error.message,
      stack: error.stack,
      pedidoId: req.params.id,
      tenantId: req.tenant_id
    });
    res.status(500).json({
      success: false,
      message: 'Error al validar el pedido',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    client.release();
  }
};

/**
 * POST /api/mantenimiento/estados/recalcular-masivo
 * Recalcula estados de todos los pedidos activos
 */
exports.recalcularMasivo = async (req, res) => {
  const client = await db.connect();

  try {
    const { tenant_id, userRole } = req;
    const { limit = 100 } = req.body;

    // Solo admin o gerente
    if (!['admin', 'gerente'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ejecutar esta operación'
      });
    }

    logger.info('🔄 [MANTENIMIENTO] Iniciando recálculo masivo', {
      limit,
      userId: req.userId,
      tenantId: tenant_id
    });

    // No usar transacción para operación masiva (demasiado larga)
    const resultado = await EstadosPedidoService.recalcularEstadosPedidosActivos(
      client,
      tenant_id,
      limit
    );

    logger.info('✅ [MANTENIMIENTO] Recálculo masivo completado', {
      ...resultado,
      userId: req.userId,
      tenantId: tenant_id
    });

    res.json({
      success: true,
      message: `Recálculo completado: ${resultado.procesados} pedidos procesados, ${resultado.cambios} cambios aplicados`,
      data: resultado
    });

  } catch (error) {
    logger.error('Error en recálculo masivo:', {
      error: error.message,
      stack: error.stack,
      tenantId: req.tenant_id
    });
    res.status(500).json({
      success: false,
      message: 'Error en recálculo masivo',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    client.release();
  }
};

/**
 * GET /api/mantenimiento/estados/diagnostico-pedido/:id
 * Obtiene diagnóstico detallado del estado de un pedido
 */
exports.diagnosticoPedido = async (req, res) => {
  try {
    const { tenant_id } = req;
    const { id: pedidoId } = req.params;

    // Obtener información completa del pedido
    const query = `
      SELECT 
        p.pedidoid,
        p.estatus as estado_pedido,
        p.admin_asignado_id,
        p.fechapedido,
        p.es_credito,
        a.nombre as admin_nombre,
        c.nombre as cliente_nombre,
        c.apellido as cliente_apellido,
        COUNT(dp.detalleid) as total_productos,
        SUM(CASE WHEN LOWER(COALESCE(dp.estado_producto, '')) = 'con stock' THEN 1 ELSE 0 END) as con_stock,
        SUM(CASE WHEN LOWER(COALESCE(dp.estado_producto, '')) = 'bajo pedido' THEN 1 ELSE 0 END) as bajo_pedido,
        SUM(CASE WHEN LOWER(COALESCE(dp.estado_producto, '')) = 'surtido' THEN 1 ELSE 0 END) as surtido,
        SUM(CASE WHEN LOWER(COALESCE(dp.estado_producto, '')) = 'facturado' THEN 1 ELSE 0 END) as facturado,
        SUM(CASE WHEN dp.cantidadsurtida > 0 THEN 1 ELSE 0 END) as con_cantidad_surtida,
        SUM(CASE WHEN dp.cantidadsurtida > 0 AND LOWER(COALESCE(dp.estado_producto, '')) NOT IN ('surtido', 'facturado') THEN 1 ELSE 0 END) as inconsistentes
      FROM pedidos p
      INNER JOIN clientes c ON p.clienteid = c.clienteid AND c.tenant_id = p.tenant_id
      LEFT JOIN administradores a ON p.admin_asignado_id = a.adminid AND a.tenant_id = p.tenant_id
      LEFT JOIN detallesdelpedido dp ON p.pedidoid = dp.pedidoid AND dp.tenant_id = p.tenant_id
      WHERE p.pedidoid = $1 AND p.tenant_id = $2
      GROUP BY p.pedidoid, p.estatus, p.admin_asignado_id, p.fechapedido, p.es_credito,
               a.nombre, c.nombre, c.apellido
    `;

    const result = await db.query(query, [pedidoId, tenant_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Pedido no encontrado'
      });
    }

    const diagnostico = result.rows[0];

    // Obtener detalles de productos
    const productosQuery = `
      SELECT 
        dp.detalleid,
        dp.varianteid,
        dp.piezastotales,
        dp.cantidadsurtida,
        dp.estado_producto,
        dp.esbackorder,
        pv.sku,
        pr.nombreproducto,
        COALESCE(SUM(sa.cantidad), 0) as stock_disponible
      FROM detallesdelpedido dp
      INNER JOIN producto_variantes pv ON dp.varianteid = pv.varianteid AND pv.tenant_id = $2
      INNER JOIN productos pr ON pv.productoid = pr.productoid AND pr.tenant_id = $2
      LEFT JOIN stock_admin sa ON sa.variante_id = dp.varianteid 
        AND sa.admin_id = $3 
        AND sa.tenant_id = $2
      WHERE dp.pedidoid = $1 AND dp.tenant_id = $2
      GROUP BY dp.detalleid, dp.varianteid, dp.piezastotales, dp.cantidadsurtida, 
               dp.estado_producto, dp.esbackorder, pv.sku, pr.nombreproducto
      ORDER BY dp.detalleid
    `;

    const productosResult = await db.query(productosQuery, [
      pedidoId, 
      tenant_id, 
      diagnostico.admin_asignado_id
    ]);

    // Analizar inconsistencias
    const inconsistencias = [];
    const productos = productosResult.rows.map(p => {
      const inconsistente = p.cantidadsurtida > 0 && 
        !['surtido', 'facturado'].includes((p.estado_producto || '').toLowerCase());

      if (inconsistente) {
        inconsistencias.push({
          detalleid: p.detalleid,
          sku: p.sku,
          producto: p.nombreproducto,
          problema: 'Tiene cantidadsurtida pero estado no es Surtido/Facturado',
          cantidadsurtida: p.cantidadsurtida,
          estado_producto: p.estado_producto
        });
      }

      const stockSuficiente = parseInt(p.stock_disponible || 0) >= parseInt(p.piezastotales || 0);
      const estadoEsperado = stockSuficiente ? 'Con stock' : 'Bajo pedido';
      const estadoActual = (p.estado_producto || '').toLowerCase();

      return {
        ...p,
        stock_disponible: parseInt(p.stock_disponible || 0),
        inconsistente,
        estado_esperado: ['surtido', 'facturado'].includes(estadoActual) ? p.estado_producto : estadoEsperado,
        estado_correcto: ['surtido', 'facturado'].includes(estadoActual) || 
                        estadoActual === estadoEsperado.toLowerCase()
      };
    });

    const resumen = {
      pedido: {
        id: diagnostico.pedidoid,
        estado: diagnostico.estado_pedido,
        admin: diagnostico.admin_nombre,
        cliente: `${diagnostico.cliente_nombre} ${diagnostico.cliente_apellido}`,
        fecha: diagnostico.fechapedido
      },
      estadisticas: {
        total_productos: parseInt(diagnostico.total_productos || 0),
        con_stock: parseInt(diagnostico.con_stock || 0),
        bajo_pedido: parseInt(diagnostico.bajo_pedido || 0),
        surtido: parseInt(diagnostico.surtido || 0),
        facturado: parseInt(diagnostico.facturado || 0),
        con_cantidad_surtida: parseInt(diagnostico.con_cantidad_surtida || 0),
        inconsistentes: parseInt(diagnostico.inconsistentes || 0)
      },
      tiene_inconsistencias: inconsistencias.length > 0,
      inconsistencias,
      productos
    };

    logger.info('📊 [DIAGNÓSTICO] Pedido analizado', {
      pedidoId,
      inconsistencias: inconsistencias.length,
      tenantId: tenant_id
    });

    res.json({
      success: true,
      data: resumen
    });

  } catch (error) {
    logger.error('Error en diagnóstico de pedido:', {
      error: error.message,
      pedidoId: req.params.id,
      tenantId: req.tenant_id
    });
    res.status(500).json({
      success: false,
      message: 'Error al obtener diagnóstico',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// FIN DEL CÓDIGO ORIGINAL COMENTADO
