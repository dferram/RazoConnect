/**
 * SOLICITUDES PROVEEDOR CONTROLLER
 * 
 * Controlador especializado para gestión de solicitudes pendientes de proveedores.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/solicitudesProveedorController
 * @author RazoConnect Team
 * @date 2026-02-27
 */

const db = require('../db');
const logger = require('../utils/logger');

/**
 * Obtener solicitudes pendientes de un proveedor
 * GET /api/admin/proveedores/:id/solicitudes-pendientes
 */
const getSolicitudesPendientesProveedor = async (req, res) => {
  try {
    const proveedorId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(proveedorId) || proveedorId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ProveedorID inválido",
      });
    }

    const proveedorResult = await db.query(
      `SELECT proveedorid
       FROM proveedores
       WHERE proveedorid = $1`,
      [proveedorId]
    );
    if (!proveedorResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Proveedor no encontrado",
      });
    }

    const { rows } = await db.query(
      `SELECT
         id,
         entidad,
         entidad_id,
         tipo_cambio,
         datos_nuevos,
         fecha_solicitud
       FROM control_cambios
       WHERE estado = 'PENDIENTE'
         AND LOWER(entidad) = 'proveedor_reglas_empaque'
         AND COALESCE(
           (datos_nuevos::jsonb)->>'proveedorId',
           (datos_nuevos::jsonb)->>'proveedorid'
         ) = $1
       ORDER BY fecha_solicitud DESC`,
      [String(proveedorId)]
    );

    const solicitudes = (rows || []).map((r) => ({
      id: r.id,
      entidad: r.entidad,
      entidadId: r.entidad_id ?? null,
      tipoCambio: r.tipo_cambio,
      datosNuevos: r.datos_nuevos,
      fechaSolicitud: r.fecha_solicitud,
    }));

    return res.status(200).json({
      success: true,
      message: "Solicitudes pendientes obtenidas exitosamente",
      data: {
        solicitudes,
      },
    });
  } catch (error) {
    logger.error('Error al obtener solicitudes pendientes del proveedor:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "Error al obtener solicitudes pendientes",
      error: error.message,
    });
  }
};

module.exports = {
  getSolicitudesPendientesProveedor
};
