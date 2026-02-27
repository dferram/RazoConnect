/**
 * REPORTES DE VENTAS CONTROLLER
 * 
 * Controlador especializado para reportes y análisis de ventas.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/reportesVentasController
 * @author RazoConnect Team
 * @date 2026-02-27
 */

const db = require('../db');

/**
 * ✅ NUEVO: Ver ventas del admin desde pedido_surtido_detalle
 * GET /api/admin/mis-ventas
 */
const getMisVentas = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;
    const adminId = req.user.id;
    const { fechaInicio, fechaFin, limit = 50 } = req.query;

    let query = `
      SELECT 
        psd.surtido_id,
        psd.pedido_id,
        psd.created_at as fecha_venta,
        p.fechapedido,
        c.nombre || ' ' || c.apellido as cliente_nombre,
        pv.sku,
        prod.nombreproducto,
        psd.cantidad as piezas_vendidas,
        d.precioporpaquete,
        (d.precioporpaquete * d.cantidadpaquetes) as subtotal_item
      FROM pedido_surtido_detalle psd
      INNER JOIN pedidos p ON p.pedidoid = psd.pedido_id
      INNER JOIN clientes c ON c.clienteid = p.clienteid
      INNER JOIN detallesdelpedido d ON d.detalleid = psd.detalle_id
      INNER JOIN producto_variantes pv ON pv.varianteid = psd.variante_id
      INNER JOIN productos prod ON prod.productoid = pv.productoid
      WHERE psd.admin_id = $1 AND psd.tenant_id = $2
    `;

    const params = [adminId, tenant_id];
    let paramIndex = 3;

    if (fechaInicio) {
      query += ` AND psd.created_at >= $${paramIndex}::timestamp`;
      params.push(fechaInicio);
      paramIndex++;
    }

    if (fechaFin) {
      query += ` AND psd.created_at <= $${paramIndex}::timestamp`;
      params.push(fechaFin);
      paramIndex++;
    }

    query += ` ORDER BY psd.created_at DESC LIMIT $${paramIndex}`;
    params.push(parseInt(limit, 10) || 50);

    const result = await db.query(query, params);

    const totalPiezas = result.rows.reduce((sum, row) => sum + parseInt(row.piezas_vendidas || 0, 10), 0);
    const totalMonto = result.rows.reduce((sum, row) => sum + parseFloat(row.subtotal_item || 0), 0);

    res.json({
      success: true,
      data: {
        ventas: result.rows,
        resumen: {
          total_ventas: result.rows.length,
          total_piezas: totalPiezas,
          monto_total: parseFloat(totalMonto.toFixed(2))
        }
      }
    });
  } catch (error) {
    console.error('Error en getMisVentas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener ventas',
      error: error.message
    });
  }
};

/**
 * ✅ NUEVO: Ver breakdown de allocation por pedido (Super Admin)
 * GET /api/admin/pedidos/:pedidoId/allocation
 */
const getPedidoAllocation = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;
    const pedidoId = parseInt(req.params.pedidoId, 10);

    if (!pedidoId) {
      return res.status(400).json({
        success: false,
        message: 'pedidoId inválido'
      });
    }

    const query = `
      SELECT 
        psd.surtido_id,
        psd.admin_id,
        COALESCE(a.nombre || ' ' || a.apellido, 'Admin ID ' || psd.admin_id) as admin_nombre,
        pv.sku,
        prod.nombreproducto,
        psd.cantidad as piezas_surtidas,
        d.precioporpaquete,
        psd.created_at
      FROM pedido_surtido_detalle psd
      INNER JOIN detallesdelpedido d ON d.detalleid = psd.detalle_id
      INNER JOIN producto_variantes pv ON pv.varianteid = psd.variante_id
      INNER JOIN productos prod ON prod.productoid = pv.productoid
      LEFT JOIN administradores a ON a.adminid = psd.admin_id
      WHERE psd.pedido_id = $1 AND psd.tenant_id = $2
      ORDER BY psd.surtido_id
    `;

    const result = await db.query(query, [pedidoId, tenant_id]);

    const porAdmin = {};
    result.rows.forEach(row => {
      const adminId = row.admin_id;
      if (!porAdmin[adminId]) {
        porAdmin[adminId] = {
          admin_id: adminId,
          admin_nombre: row.admin_nombre,
          piezas_totales: 0,
          items: []
        };
      }
      porAdmin[adminId].piezas_totales += parseInt(row.piezas_surtidas || 0, 10);
      porAdmin[adminId].items.push({
        sku: row.sku,
        producto: row.nombreproducto,
        piezas: row.piezas_surtidas
      });
    });

    res.json({
      success: true,
      data: {
        pedido_id: pedidoId,
        allocation: Object.values(porAdmin),
        total_admins: Object.keys(porAdmin).length,
        detalles: result.rows
      }
    });
  } catch (error) {
    console.error('Error en getPedidoAllocation:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener allocation del pedido',
      error: error.message
    });
  }
};

/**
 * ✅ NUEVO: Reporte de ventas por administrador (Super Admin)
 * GET /api/admin/reportes/ventas-por-admin
 */
const getReporteVentasPorAdmin = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;
    const { fechaInicio, fechaFin } = req.query;

    let query = `
      SELECT 
        psd.admin_id,
        COALESCE(a.nombre || ' ' || a.apellido, 'Admin ID ' || psd.admin_id) as admin_nombre,
        COUNT(DISTINCT psd.pedido_id) as total_pedidos,
        SUM(psd.cantidad) as piezas_vendidas,
        SUM(d.precioporpaquete * d.cantidadpaquetes) as monto_total_ventas
      FROM pedido_surtido_detalle psd
      INNER JOIN pedidos p ON p.pedidoid = psd.pedido_id
      INNER JOIN detallesdelpedido d ON d.detalleid = psd.detalle_id
      LEFT JOIN administradores a ON a.adminid = psd.admin_id
      WHERE psd.tenant_id = $1
    `;

    const params = [tenant_id];
    let paramIndex = 2;

    if (fechaInicio) {
      query += ` AND psd.created_at >= $${paramIndex}::timestamp`;
      params.push(fechaInicio);
      paramIndex++;
    }

    if (fechaFin) {
      query += ` AND psd.created_at <= $${paramIndex}::timestamp`;
      params.push(fechaFin);
      paramIndex++;
    }

    query += `
      GROUP BY psd.admin_id, admin_nombre
      ORDER BY monto_total_ventas DESC
    `;

    const result = await db.query(query, params);

    const totales = {
      total_pedidos: result.rows.reduce((sum, row) => sum + parseInt(row.total_pedidos || 0, 10), 0),
      total_piezas: result.rows.reduce((sum, row) => sum + parseInt(row.piezas_vendidas || 0, 10), 0),
      monto_total: result.rows.reduce((sum, row) => sum + parseFloat(row.monto_total_ventas || 0), 0)
    };

    res.json({
      success: true,
      data: {
        por_admin: result.rows,
        totales: {
          ...totales,
          monto_total: parseFloat(totales.monto_total.toFixed(2))
        },
        total_admins: result.rows.length
      }
    });
  } catch (error) {
    console.error('Error en getReporteVentasPorAdmin:', error);
    res.status(500).json({
      success: false,
      message: 'Error al generar reporte',
      error: error.message
    });
  }
};

module.exports = {
  getMisVentas,
  getPedidoAllocation,
  getReporteVentasPorAdmin
};
