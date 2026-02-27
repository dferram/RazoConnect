/**
 * MOVIMIENTOS DE INVENTARIO CONTROLLER
 * 
 * Controlador especializado para consulta de movimientos e historial de inventario.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/movimientosInventarioController
 * @author RazoConnect Team
 * @date 2026-02-27
 */

const db = require('../db');

/**
 * Obtener movimientos de inventario con filtros
 * GET /api/admin/movimientos
 * Query params: varianteId, search, tipo (ENTRADA|SALIDA), fechaInicio, fechaFin
 */
const getMovimientosInventario = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;
    const where = [`mi.tenant_id = $1`];
    const values = [tenant_id];

    const varianteIdRaw = req.query.varianteId;
    if (varianteIdRaw !== undefined && varianteIdRaw !== null && varianteIdRaw !== "") {
      const varianteId = Number.parseInt(varianteIdRaw, 10);
      if (!Number.isInteger(varianteId) || varianteId <= 0) {
        return res.status(400).json({
          success: false,
          message: "varianteId inválido",
        });
      }
      values.push(varianteId);
      where.push(`mi.variante_id = $${values.length}`);
    }

    const tipoRaw = (req.query.tipo || "").toString().trim().toUpperCase();
    if (tipoRaw && ['ENTRADA', 'SALIDA', 'AJUSTE', 'MERMA', 'ADICION'].includes(tipoRaw)) {
      values.push(tipoRaw);
      where.push(`mi.tipo = $${values.length}`);
    } else if (tipoRaw) {
      return res.status(400).json({
        success: false,
        message: "tipo inválido (usa ENTRADA, SALIDA, AJUSTE, MERMA o ADICION)",
      });
    }

    const searchRaw = (req.query.search || "").toString().trim();
    const fechaInicioRaw = (req.query.fechaInicio || "").toString().trim();
    if (fechaInicioRaw) {
      values.push(fechaInicioRaw);
      where.push(`mi.fecha_movimiento >= $${values.length}::timestamp`);
    }

    const fechaFinRaw = (req.query.fechaFin || "").toString().trim();
    if (fechaFinRaw) {
      values.push(fechaFinRaw);
      where.push(`mi.fecha_movimiento <= $${values.length}::timestamp`);
    }

    const limitRaw = Number.parseInt(req.query.limit, 10);
    const limit = Number.isInteger(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), 100)
      : 50;
    values.push(limit);
    const limitParam = `$${values.length}`;

    const whereSql = `WHERE ${where.join(" AND ")}`;

    const r = await db.query(
      `SELECT
         mi.movimiento_id,
         mi.fecha_movimiento,
         mi.variante_id,
         mi.admin_id,
         mi.tipo,
         mi.cantidad,
         mi.stock_previo,
         mi.stock_posterior,
         mi.motivo,
         mi.observaciones,
         pv.sku,
         pv.dimensiones,
         p.productoid,
         p.nombreproducto,
         COALESCE(a.nombre, 'Sistema') AS usuario
       FROM movimientos_inventario mi
       INNER JOIN producto_variantes pv ON pv.varianteid = mi.variante_id
       INNER JOIN productos p ON p.productoid = pv.productoid
       LEFT JOIN administradores a ON a.adminid = mi.admin_id
       ${whereSql}
       ORDER BY mi.fecha_movimiento DESC
       LIMIT ${limitParam}`,
      values
    );
    
    const rows = r.rows || [];

    const movimientos = (rows || []).map((r) => {
      const cantidad = Number.parseInt(r.cantidad, 10) || 0;
      const tipo = (r.tipo || '').toString().toUpperCase();
      
      // Mapear tipos antiguos a nuevos para compatibilidad
      let tipoMovimiento = tipo;
      if (tipo === 'MERMA' || tipo === 'ADICION') {
        tipoMovimiento = tipo === 'MERMA' ? 'SALIDA' : 'ENTRADA';
      }
      
      return {
        movimientoId: r.movimiento_id,
        fecha: r.fecha_movimiento,
        varianteId: r.variante_id,
        productoId: r.productoid,
        productoNombre: r.nombreproducto,
        sku: r.sku,
        dimensiones: r.dimensiones,
        tipoMovimiento,
        tipoOriginal: tipo,
        cantidad: Math.abs(cantidad),
        stockPrevio: Number.parseInt(r.stock_previo, 10) || 0,
        stockPosterior: Number.parseInt(r.stock_posterior, 10) || 0,
        motivo: r.motivo || "",
        observaciones: r.observaciones || null,
        adminId: r.admin_id ?? null,
        usuario: r.usuario || 'Sistema',
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        movimientos,
        total: movimientos.length,
      },
    });
  } catch (error) {
    console.error("Error al obtener movimientos de inventario:", error);
    return res.status(500).json({
      success: false,
      message: "Error en el servidor",
      error: error.message,
    });
  }
};

/**
 * Historial (Kardex) de movimientos por variante
 * GET /api/admin/inventario/:varianteId/historial
 */
const getHistorialInventarioVariante = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;
    const varianteId = Number.parseInt(req.params.varianteId, 10);
    if (!Number.isInteger(varianteId) || varianteId <= 0) {
      return res.status(400).json({
        success: false,
        message: "varianteId inválido",
      });
    }

    const limitRaw = Number.parseInt(req.query.limit, 10);
    const limit = Number.isInteger(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), 50)
      : 50;

    const { rows } = await db.query(
      `SELECT
         li.fecha,
         li.cantidadcambiado,
         ABS(li.cantidadcambiado) AS cantidad,
         li.motivo,
         li.nuevostock,
         li.usuarioid,
         COALESCE(
           NULLIF(TRIM(a.nombre), ''),
           NULLIF(TRIM(av.nombre || ' ' || av.apellido), ''),
           NULL
         ) AS usuario
       FROM log_inventario li
       INNER JOIN producto_variantes pv ON pv.varianteid = li.varianteid
       INNER JOIN productos p ON p.productoid = pv.productoid
       LEFT JOIN administradores a ON a.adminid = li.usuarioid
       LEFT JOIN agentesdeventas av ON av.agenteid = li.usuarioid
       WHERE li.varianteid = $1 AND p.tenant_id = $2
       ORDER BY li.fecha DESC
       LIMIT $3`,
      [varianteId, tenant_id, limit]
    );

    const movimientos = (rows || []).map((r) => {
      const cantidadCambiado = Number.parseInt(r.cantidadcambiado, 10) || 0;
      const tipoMovimiento = cantidadCambiado >= 0 ? "ENTRADA" : "SALIDA";
      return {
        fecha: r.fecha,
        tipoMovimiento,
        cantidad: Number.parseInt(r.cantidad, 10) || 0,
        motivo: r.motivo || "",
        nuevoStock: Number.parseInt(r.nuevostock, 10) || 0,
        usuarioId: r.usuarioid ?? null,
        usuario: r.usuario || null,
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        varianteId,
        movimientos,
        total: movimientos.length,
      },
    });
  } catch (error) {
    console.error("Error al obtener historial de inventario:", error);
    return res.status(500).json({
      success: false,
      message: "Error en el servidor",
      error: error.message,
    });
  }
};

module.exports = {
  getMovimientosInventario,
  getHistorialInventarioVariante
};
