const db = require("../db");
const logger = require('../utils/logger');
const SmartStockService = require("../services/SmartStockService");

/**
 * =====================================================
 * FIFO RECALCULATION CONTROLLER
 * =====================================================
 * 
 * Este controlador proporciona endpoints para recalcular el estatus de
 * surtido de pedidos existentes usando la nueva lógica FIFO.
 * 
 * Esto corrige el problema donde múltiples pedidos reclamaban el mismo
 * stock físico sin considerar la antigüedad del pedido.
 */

/**
 * Recalcula el estatus de surtido de todos los pedidos pendientes
 * usando la lógica FIFO (First In, First Out)
 * 
 * POST /api/admin/fifo/recalcular
 * 
 * Este endpoint:
 * 1. Obtiene todos los pedidos activos (no cancelados ni entregados)
 * 2. Los ordena cronológicamente por fecha de creación
 * 3. Recalcula el estatus de cada detalle usando calculateAllocationStatus
 * 4. Actualiza los campos esbackorder, cantidadsurtida, cantidadbackorder
 * 5. Actualiza el estatus del pedido si es necesario
 */
const recalcularTodosPedidos = async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    if (!req.tenant || !req.tenant.tenant_id) {
      return res.status(500).json({
        success: false,
        message: "Error: tenant no disponible"
      });
    }
    
    const { tenant_id } = req.tenant;
    const adminId = req.user?.userId || null;
    
    
    await client.query("BEGIN");
    
    // PASO 1: Obtener todos los pedidos activos ordenados cronológicamente
    const pedidosQuery = `
      SELECT 
        p.pedidoid,
        p.fechapedido,
        p.estatus,
        p.clienteid
      FROM pedidos p
      WHERE p.tenant_id = $1
        AND p.estatus NOT IN ('Cancelado', 'Entregado')
      ORDER BY p.fechapedido ASC
    `;
    
    const { rows: pedidos } = await client.query(pedidosQuery, [tenant_id]);
    
    
    let pedidosActualizados = 0;
    let detallesActualizados = 0;
    let errores = [];
    
    // PASO 2: Procesar cada pedido cronológicamente
    for (const pedido of pedidos) {
      try {
        
        // Obtener detalles del pedido
        const detallesQuery = `
          SELECT 
            d.detalleid,
            d.varianteid,
            d.cantidadpaquetes,
            d.piezastotales,
            d.esbackorder,
            d.cantidadsurtida,
            d.cantidadbackorder,
            d.tamanoid,
            t.valor as piezas_por_paquete,
            pv.sku,
            p.nombreproducto
          FROM detallesdelpedido d
          INNER JOIN producto_variantes pv ON pv.varianteid = d.varianteid
          INNER JOIN productos p ON p.productoid = pv.productoid
          LEFT JOIN cat_tamanopaquetes t ON t.tamanoid = d.tamanoid
          WHERE d.pedidoid = $1
        `;
        
        const { rows: detalles } = await client.query(detallesQuery, [pedido.pedidoid]);
        
        let pedidoTieneBackorder = false;
        let pedidoCompletamenteSurtido = true;
        
        // PASO 3: Recalcular cada detalle usando FIFO
        for (const detalle of detalles) {
          const piezasPorPaquete = parseInt(detalle.piezas_por_paquete, 10) || 1;
          const cantidadRequerida = parseInt(detalle.cantidadpaquetes, 10);
          
          
          // Calcular allocation status con FIFO
          const fifoResult = await SmartStockService.calculateAllocationStatus({
            varianteId: detalle.varianteid,
            cantidadRequerida: cantidadRequerida,
            orderDate: pedido.fechapedido,
            adminId: adminId,
            tenantId: tenant_id,
            pedidoId: pedido.pedidoid,
            piezasPorPaquete: piezasPorPaquete
          });
          
          
          // Determinar nuevo estado
          const nuevoEsBackorder = fifoResult.cantidadSurtible === 0;
          const nuevaCantidadSurtida = fifoResult.cantidadSurtible;
          const nuevaCantidadBackorder = fifoResult.cantidadBackorder;
          
          // Actualizar si hay cambios
          if (
            detalle.esbackorder !== nuevoEsBackorder ||
            parseInt(detalle.cantidadsurtida, 10) !== nuevaCantidadSurtida ||
            parseInt(detalle.cantidadbackorder, 10) !== nuevaCantidadBackorder
          ) {
            await client.query(
              `UPDATE detallesdelpedido
               SET esbackorder = $1,
                   cantidadsurtida = $2,
                   cantidadbackorder = $3
               WHERE detalleid = $4`,
              [nuevoEsBackorder, nuevaCantidadSurtida, nuevaCantidadBackorder, detalle.detalleid]
            );
            
            detallesActualizados++;
          } else {
          }
          
          // Actualizar flags del pedido
          if (nuevaCantidadBackorder > 0) {
            pedidoTieneBackorder = true;
          }
          if (nuevaCantidadSurtida < cantidadRequerida) {
            pedidoCompletamenteSurtido = false;
          }
        }
        
        // PASO 4: Actualizar estatus del pedido si es necesario
        let nuevoEstatusPedido = pedido.estatus;
        
        if (pedidoCompletamenteSurtido && pedido.estatus === 'Pendiente') {
          nuevoEstatusPedido = 'Aprobado';
        } else if (pedidoTieneBackorder && !pedidoCompletamenteSurtido) {
          nuevoEstatusPedido = 'Parcialmente Surtido';
        }
        
        if (nuevoEstatusPedido !== pedido.estatus) {
          await client.query(
            `UPDATE pedidos
             SET estatus = $1,
                 completamente_surtido = $2
             WHERE pedidoid = $3`,
            [nuevoEstatusPedido, pedidoCompletamenteSurtido, pedido.pedidoid]
          );
          
          pedidosActualizados++;
        }
        
      } catch (error) {
        logger.error('❌ [FIFO] Error procesando pedido #${pedido.pedidoid}:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
        errores.push({
          pedidoId: pedido.pedidoid,
          error: error.message
        });
      }
    }
    
    await client.query("COMMIT");
    
    
    return res.status(200).json({
      success: true,
      message: "Recálculo FIFO completado exitosamente",
      data: {
        pedidosProcesados: pedidos.length,
        pedidosActualizados: pedidosActualizados,
        detallesActualizados: detallesActualizados,
        errores: errores
      }
    });
    
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error('❌ [FIFO RECALCULATION] Error fatal:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    
    return res.status(500).json({
      success: false,
      message: "Error al recalcular pedidos"
    });
    
  } finally {
    client.release();
  }
};

/**
 * Recalcula el estatus de un pedido específico
 * 
 * POST /api/admin/fifo/recalcular/:pedidoId
 */
const recalcularPedidoEspecifico = async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    if (!req.tenant || !req.tenant.tenant_id) {
      return res.status(500).json({
        success: false,
        message: "Error: tenant no disponible"
      });
    }
    
    const { tenant_id } = req.tenant;
    const adminId = req.user?.userId || null;
    const pedidoId = parseInt(req.params.pedidoId, 10);
    
    if (!pedidoId || pedidoId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de pedido inválido"
      });
    }
    
    
    await client.query("BEGIN");
    
    // Obtener información del pedido
    const { rows: pedidoRows } = await client.query(
      `SELECT pedidoid, fechapedido, estatus
       FROM pedidos
       WHERE pedidoid = $1 AND tenant_id = $2`,
      [pedidoId, tenant_id]
    );
    
    if (pedidoRows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Pedido no encontrado"
      });
    }
    
    const pedido = pedidoRows[0];
    
    // Obtener detalles
    const { rows: detalles } = await client.query(
      `SELECT 
        d.detalleid,
        d.varianteid,
        d.cantidadpaquetes,
        d.esbackorder,
        d.cantidadsurtida,
        d.cantidadbackorder,
        d.tamanoid,
        t.valor as piezas_por_paquete,
        pv.sku,
        p.nombreproducto
      FROM detallesdelpedido d
      INNER JOIN producto_variantes pv ON pv.varianteid = d.varianteid
      INNER JOIN productos p ON p.productoid = pv.productoid
      LEFT JOIN cat_tamanopaquetes t ON t.tamanoid = d.tamanoid
      WHERE d.pedidoid = $1`,
      [pedidoId]
    );
    
    let detallesActualizados = 0;
    const cambios = [];
    
    for (const detalle of detalles) {
      const piezasPorPaquete = parseInt(detalle.piezas_por_paquete, 10) || 1;
      const cantidadRequerida = parseInt(detalle.cantidadpaquetes, 10);
      
      const fifoResult = await SmartStockService.calculateAllocationStatus({
        varianteId: detalle.varianteid,
        cantidadRequerida: cantidadRequerida,
        orderDate: pedido.fechapedido,
        adminId: adminId,
        tenantId: tenant_id,
        pedidoId: pedidoId,
        piezasPorPaquete: piezasPorPaquete
      });
      
      const nuevoEsBackorder = fifoResult.cantidadSurtible === 0;
      const nuevaCantidadSurtida = fifoResult.cantidadSurtible;
      const nuevaCantidadBackorder = fifoResult.cantidadBackorder;
      
      if (
        detalle.esbackorder !== nuevoEsBackorder ||
        parseInt(detalle.cantidadsurtida, 10) !== nuevaCantidadSurtida ||
        parseInt(detalle.cantidadbackorder, 10) !== nuevaCantidadBackorder
      ) {
        await client.query(
          `UPDATE detallesdelpedido
           SET esbackorder = $1,
               cantidadsurtida = $2,
               cantidadbackorder = $3
           WHERE detalleid = $4`,
          [nuevoEsBackorder, nuevaCantidadSurtida, nuevaCantidadBackorder, detalle.detalleid]
        );
        
        detallesActualizados++;
        cambios.push({
          producto: detalle.nombreproducto,
          sku: detalle.sku,
          anterior: {
            esBackorder: detalle.esbackorder,
            surtido: parseInt(detalle.cantidadsurtida, 10),
            backorder: parseInt(detalle.cantidadbackorder, 10)
          },
          nuevo: {
            esBackorder: nuevoEsBackorder,
            surtido: nuevaCantidadSurtida,
            backorder: nuevaCantidadBackorder
          }
        });
      }
    }
    
    await client.query("COMMIT");
    
    return res.status(200).json({
      success: true,
      message: `Pedido #${pedidoId} recalculado exitosamente`,
      data: {
        pedidoId: pedidoId,
        detallesActualizados: detallesActualizados,
        cambios: cambios
      }
    });
    
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error('❌ [FIFO] Error recalculando pedido:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    
    return res.status(500).json({
      success: false,
      message: "Error al recalcular pedido"
    });
    
  } finally {
    client.release();
  }
};

/**
 * Obtiene un reporte de conflictos de allocation
 * Muestra pedidos donde múltiples órdenes reclaman el mismo stock
 * 
 * GET /api/admin/fifo/conflictos
 */
const obtenerConflictosAllocation = async (req, res) => {
  try {
    if (!req.tenant || !req.tenant.tenant_id) {
      return res.status(500).json({
        success: false,
        message: "Error: tenant no disponible"
      });
    }
    
    const { tenant_id } = req.tenant;
    
    // Consulta para detectar conflictos
    const conflictosQuery = `
      WITH pedidos_activos AS (
        SELECT 
          p.pedidoid,
          p.fechapedido,
          d.varianteid,
          d.cantidadpaquetes,
          d.piezastotales,
          d.esbackorder,
          pv.sku,
          pr.nombreproducto
        FROM pedidos p
        INNER JOIN detallesdelpedido d ON d.pedidoid = p.pedidoid
        INNER JOIN producto_variantes pv ON pv.varianteid = d.varianteid
        INNER JOIN productos pr ON pr.productoid = pv.productoid
        WHERE p.tenant_id = $1
          AND p.estatus NOT IN ('Cancelado', 'Entregado')
          AND d.esbackorder = false
      ),
      stock_actual AS (
        SELECT
          variante_id,
          SUM(cantidad) as stock_total
        FROM stock_admin
        WHERE tenant_id = $1
        GROUP BY variante_id
      )
      SELECT 
        pa.varianteid,
        pa.sku,
        pa.nombreproducto,
        COALESCE(sa.stock_total, 0) as stock_disponible,
        SUM(pa.piezastotales) as piezas_comprometidas,
        COUNT(DISTINCT pa.pedidoid) as num_pedidos,
        ARRAY_AGG(pa.pedidoid ORDER BY pa.fechapedido) as pedidos_ids,
        ARRAY_AGG(pa.fechapedido ORDER BY pa.fechapedido) as fechas_pedidos
      FROM pedidos_activos pa
      LEFT JOIN stock_actual sa ON sa.variante_id = pa.varianteid
      GROUP BY pa.varianteid, pa.sku, pa.nombreproducto, sa.stock_total
      HAVING SUM(pa.piezastotales) > COALESCE(sa.stock_total, 0)
      ORDER BY (SUM(pa.piezastotales) - COALESCE(sa.stock_total, 0)) DESC
    `;
    
    const { rows: conflictos } = await db.query(conflictosQuery, [tenant_id]);
    
    return res.status(200).json({
      success: true,
      message: `Encontrados ${conflictos.length} conflictos de allocation`,
      data: {
        conflictos: conflictos.map(c => ({
          varianteId: c.varianteid,
          sku: c.sku,
          producto: c.nombreproducto,
          stockDisponible: parseInt(c.stock_disponible, 10),
          piezasComprometidas: parseInt(c.piezas_comprometidas, 10),
          deficit: parseInt(c.piezas_comprometidas, 10) - parseInt(c.stock_disponible, 10),
          numPedidos: parseInt(c.num_pedidos, 10),
          pedidosIds: c.pedidos_ids,
          fechasPedidos: c.fechas_pedidos
        }))
      }
    });
    
  } catch (error) {
    logger.error('❌ [FIFO] Error obteniendo conflictos:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    
    return res.status(500).json({
      success: false,
      message: "Error al obtener conflictos"
    });
  }
};

module.exports = {
  recalcularTodosPedidos,
  recalcularPedidoEspecifico,
  obtenerConflictosAllocation
};
