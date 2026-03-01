/**
 * RECEPCIÓN MANUAL CONTROLLER
 * 
 * Controlador especializado para recepción manual de mercancía.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/recepcionManualController
 * @author RazoConnect Team
 * @date 2026-02-27
 */

const db = require('../db');
const logger = require('../utils/logger');
const inventoryService = require('../services/inventoryService');

/**
 * Recepcionar mercancía manualmente
 * POST /api/admin/recepcion
 * Body: { varianteId, cantidadBultos, proveedorId (opcional), esExcepcion, comentarios }
 */
const recepcionarMercancia = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const { varianteId, cantidadBultos, proveedorId, esExcepcion, comentarios } =
      req.body;

    const parsedVarianteId = Number.parseInt(varianteId, 10);
    if (!Number.isInteger(parsedVarianteId) || parsedVarianteId <= 0) {
      return res.status(400).json({
        success: false,
        message: "varianteId inválido",
      });
    }

    const parsedBultos = Number.parseInt(cantidadBultos, 10);
    if (!Number.isInteger(parsedBultos) || parsedBultos <= 0) {
      return res.status(400).json({
        success: false,
        message: "cantidadBultos inválida",
      });
    }

    const comentariosTrim = (comentarios || "").toString().trim();
    const flagExcepcion = Boolean(esExcepcion);
    if (flagExcepcion && !comentariosTrim) {
      return res.status(400).json({
        success: false,
        message: "Si marcas excepción, debes indicar el detalle del problema",
      });
    }

    await client.query("BEGIN");

    // 1) Resolver proveedor + tipoProducto (y traer SKU)
    const varianteInfo = await client.query(
      `SELECT
         pv.varianteid,
         pv.sku,
         pv.productoid,
         COALESCE(pv.tipoproductoid, p.tipoproductoid) AS tipoproductoid,
         p.proveedorid_default
       FROM producto_variantes pv
       INNER JOIN productos p ON p.productoid = pv.productoid
       WHERE pv.varianteid = $1`,
      [parsedVarianteId]
    );

    if (!varianteInfo.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Variante no encontrada",
      });
    }

    const row = varianteInfo.rows[0];

    const tipoProductoId =
      row.tipoproductoid !== null && row.tipoproductoid !== undefined
        ? Number.parseInt(row.tipoproductoid, 10)
        : null;

    const proveedorIdResolvedRaw =
      proveedorId !== undefined && proveedorId !== null && proveedorId !== ""
        ? proveedorId
        : row.proveedorid_default;
    const proveedorIdResolved =
      proveedorIdResolvedRaw !== null && proveedorIdResolvedRaw !== undefined
        ? Number.parseInt(proveedorIdResolvedRaw, 10)
        : null;

    // 2) Buscar regla de empaque por proveedor + tipoProducto
    let piezasPorPaquete = 1;
    let tipoEmpaque = "bultos";

    if (
      Number.isInteger(proveedorIdResolved) &&
      proveedorIdResolved > 0 &&
      Number.isInteger(tipoProductoId) &&
      tipoProductoId > 0
    ) {
      try {
        const regla = await client.query(
          `SELECT cantidadempaque
           FROM proveedor_reglas_empaque
           WHERE proveedorid = $1
             AND tipoproductoid = $2
           LIMIT 1`,
          [proveedorIdResolved, tipoProductoId]
        );

        if (regla.rows.length) {
          const factor = Number.parseInt(regla.rows[0].cantidadempaque, 10);
          if (Number.isInteger(factor) && factor > 0) {
            piezasPorPaquete = factor;
          }
        }
      } catch (dbError) {
        // Compatibilidad: si la columna se llama piezasporpaquete (o falta la tabla), no debe romper la recepción.
        if (dbError && dbError.code === "42703") {
          try {
            const regla = await client.query(
              `SELECT piezasporpaquete AS cantidadempaque
               FROM proveedor_reglas_empaque
               WHERE proveedorid = $1
                 AND tipoproductoid = $2
               LIMIT 1`,
              [proveedorIdResolved, tipoProductoId]
            );

            if (regla.rows.length) {
              const factor = Number.parseInt(regla.rows[0].cantidadempaque, 10);
              if (Number.isInteger(factor) && factor > 0) {
                piezasPorPaquete = factor;
              }
            }
          } catch (e) {
            // ignore
          }
        }
      }

      // 3) (Opcional) Fallback a catálogo si no hay regla
      if (!Number.isInteger(piezasPorPaquete) || piezasPorPaquete <= 0) {
        piezasPorPaquete = 1;
      }

      if (piezasPorPaquete === 1) {
        try {
          const cat = await client.query(
            `SELECT cantidadempaque
             FROM proveedor_reglas_empaque
             WHERE tipoproductoid = $1
             ORDER BY cantidadempaque DESC
             LIMIT 1`,
            [tipoProductoId]
          );

          if (cat.rows.length) {
            const factor = Number.parseInt(cat.rows[0].cantidadempaque, 10);
            if (Number.isInteger(factor) && factor > 0) {
              piezasPorPaquete = factor;
            }
          }
        } catch (e) {
          // ignore
        }
      }

      // Determinar etiqueta de empaque (mejor esfuerzo)
      try {
        const tipoEmpaqueResult = await client.query(
          `SELECT nombre
           FROM tipoproducto
           WHERE tipoproductoid = $1
           LIMIT 1`,
          [tipoProductoId]
        );
        if (tipoEmpaqueResult.rows.length) {
          const label = (tipoEmpaqueResult.rows[0].nombre || "").toString().trim();
          if (label) tipoEmpaque = label;
        }
      } catch (e) {
        // ignore
      }
    }

    const totalUnidades = parsedBultos * piezasPorPaquete;
    if (!Number.isInteger(totalUnidades) || totalUnidades <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Total de unidades inválido",
      });
    }

    const desglose = `Se recibieron ${parsedBultos} ${tipoEmpaque} de ${piezasPorPaquete} pzas (Total: ${totalUnidades})`;
    const motivo = `Recepción Compra - ${desglose}${comentariosTrim ? ` - ${comentariosTrim}` : ""}`;

    const { stockAnterior, stockNuevo } = await inventoryService.registrarMovimiento(
      client,
      {
        varianteId: parsedVarianteId,
        cantidadDelta: totalUnidades,
        motivo,
        usuarioId: req.user.id,
        esExcepcion: flagExcepcion,
        tenantId: req.tenant?.tenant_id || 1,
        userRole: req.user?.roles || [req.user?.rol || 'admin']
      }
    );

    await client.query("COMMIT");

    return res.json({
      success: true,
      message: desglose,
      stockAnterior,
      nuevoStock: stockNuevo,
      data: {
        varianteId: parsedVarianteId,
        sku: row.sku,
        piezasPorPaquete,
        cantidadBultos: parsedBultos,
        totalUnidades,
        proveedorId: Number.isInteger(proveedorIdResolved) ? proveedorIdResolved : null,
        tipoProductoId: Number.isInteger(tipoProductoId) ? tipoProductoId : null,
        tipoEmpaque,
        esExcepcion: flagExcepcion,
      },
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (e) {
      // ignore
    }
    logger.error('Error en recepcionarMercancia:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    const status = error && Number.isInteger(error.status) ? error.status : 500;
    return res.status(status).json({
      success: false,
      message: error.message || "Error en el servidor",
      error: error.message,
      code: error.code,
    });
  } finally {
    client.release();
  }
};

module.exports = {
  recepcionarMercancia
};
