/**
 * AJUSTES INVENTARIO CONTROLLER
 * 
 * Controlador especializado para ajustes manuales de inventario.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/ajustesInventarioController
 * @author RazoConnect Team
 * @date 2026-02-27
 */

const db = require('../db');
const inventoryService = require('../services/inventoryService');
const { checkStockBajo } = require('../utils/stockAlerts');

/**
 * Ajustar inventario manualmente
 * POST /api/admin/inventario/ajuste
 */
const ajustarInventario = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const rolesRaw = Array.isArray(req.user?.roles) ? req.user.roles : [req.user?.rol];
    const roles = rolesRaw
      .filter(Boolean)
      .map((r) => r.toString().trim().toLowerCase());
    const isSuperAdmin = roles.some((r) => ["superadmin", "super-admin", "super admin"].includes(r));

    if (!req.user || req.user.tipo !== "admin" || !isSuperAdmin) {
      return res.status(403).json({
        success: false,
        message: "Acceso denegado. Se requieren permisos de super-administrador",
      });
    }

    const {
      varianteId,
      // Nuevo contrato
      tipoMovimiento,
      cantidad,
      motivo,
      usuarioId,
      esExcepcion,
      // Retro-compat
      cantidadCambio,
    } = req.body;

    if (!varianteId) {
      return res.status(400).json({
        success: false,
        message: "varianteId es requerido",
      });
    }

    const tipoMov = (tipoMovimiento || "").toString().trim().toUpperCase();
    const motivoNormalizado = (motivo || "").toString().trim();

    // Permitir retro-compat: si viene cantidadCambio lo usamos, si no, usamos cantidad+tipoMovimiento
    let cantidadDelta = null;
    if (cantidadCambio !== undefined && cantidadCambio !== null) {
      const parsed = Number.parseInt(cantidadCambio, 10);
      cantidadDelta = Number.isFinite(parsed) ? parsed : null;
    } else {
      const parsedCantidad = Number.parseInt(cantidad, 10);
      if (!Number.isFinite(parsedCantidad)) {
        return res.status(400).json({
          success: false,
          message: "cantidad inválida",
        });
      }
      if (!["ENTRADA", "SALIDA"].includes(tipoMov)) {
        return res.status(400).json({
          success: false,
          message: "tipoMovimiento debe ser ENTRADA o SALIDA",
        });
      }

      const absCantidad = Math.abs(parsedCantidad);
      cantidadDelta = tipoMov === "SALIDA" ? -absCantidad : absCantidad;
    }

    if (cantidadDelta === null || !Number.isFinite(cantidadDelta)) {
      return res.status(400).json({
        success: false,
        message: "cantidad inválida",
      });
    }

    if (cantidadDelta === 0) {
      return res.status(400).json({
        success: false,
        message: "La cantidad de cambio no puede ser cero",
      });
    }

    // Para el contrato nuevo, motivo es requerido. En retro-compat, mantenemos el mismo requisito.
    if (!motivoNormalizado) {
      return res.status(400).json({
        success: false,
        message: "motivo es requerido",
      });
    }

    await client.query("BEGIN");

    const resolvedUsuarioId = Number.isInteger(Number.parseInt(usuarioId, 10))
      ? Number.parseInt(usuarioId, 10)
      : req.user.id;

    const { stockAnterior, stockNuevo } = await inventoryService.registrarMovimiento(
      client,
      {
        varianteId,
        cantidadDelta,
        motivo: motivoNormalizado,
        usuarioId: resolvedUsuarioId,
        esExcepcion,
      }
    );

    await client.query("COMMIT");

    checkStockBajo(varianteId).catch((err) => {
      console.error("Error verificando stock bajo tras ajuste:", err);
    });

    res.json({
      success: true,
      nuevoStock: stockNuevo,
      stockAnterior,
      message: "Inventario ajustado exitosamente",
      data: {
        varianteId,
        stockAnterior,
        cantidadCambio: cantidadDelta,
        stockNuevo,
        motivo: motivoNormalizado,
      },
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (e) {
      // ignore
    }
    console.error("Error al ajustar inventario:", error);

    const status = error && Number.isInteger(error.status) ? error.status : 500;
    res.status(status).json({
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
  ajustarInventario
};
