/**
 * TIPOS PRODUCTO CONTROLLER
 * 
 * Controlador especializado para gestión de tipos de producto.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/tiposProductoController
 * @author RazoConnect Team
 * @date 2026-02-27
 */

const db = require('../db');
const logger = require('../utils/logger');

/**
 * Obtener todos los tipos de producto
 * GET /api/admin/tipos-producto
 */
const getTiposProductoAdmin = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;
    const result = await db.query(
      `SELECT tp.tipoproductoid, tp.nombre, tp.descripcion
       FROM tipoproducto tp
       WHERE tp.activo = TRUE AND tp.tenant_id = $1
       ORDER BY tp.nombre ASC`,
      [tenant_id]
    );

    const tipos = (result.rows || []).map((row) => ({
      tipoProductoId: row.tipoproductoid,
      nombre: row.nombre,
      descripcion: row.descripcion,
    }));

    return res.status(200).json({
      success: true,
      message: "Tipos de producto obtenidos exitosamente",
      data: {
        tipos,
        total: tipos.length,
      },
    });
  } catch (error) {
    logger.error('Error al obtener tipos de producto (admin):', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "Error al obtener los tipos de producto",
      error: error.message,
    });
  }
};

/**
 * Crear un nuevo tipo de producto
 * POST /api/admin/tipos-producto
 */
const crearTipoProductoAdmin = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;
    const nombreRaw = req.body?.nombre ?? req.body?.Nombre ?? req.body?.tipoProducto;
    const descripcionRaw = req.body?.descripcion ?? req.body?.Descripcion ?? null;

    const nombre = String(nombreRaw || "").trim();
    const descripcion =
      descripcionRaw === undefined || descripcionRaw === null
        ? null
        : String(descripcionRaw).trim() || null;

    if (!nombre) {
      return res.status(400).json({
        success: false,
        message: "El nombre del tipo de producto es requerido",
      });
    }

    if (!isNaN(nombre) && !isNaN(parseFloat(nombre))) {
      return res.status(400).json({
        success: false,
        message: "El nombre del tipo de producto no puede ser un número. Usa un nombre descriptivo (ej: 'Caja Grande', 'Peluche').",
      });
    }

    const insertRes = await db.query(
      `INSERT INTO tipoproducto (nombre, descripcion, activo, tenant_id)
       VALUES ($1, $2, TRUE, $3)
       ON CONFLICT (nombre, tenant_id)
       DO UPDATE SET activo = TRUE,
                    descripcion = COALESCE(EXCLUDED.descripcion, tipoproducto.descripcion)
       RETURNING tipoproductoid, nombre, descripcion`,
      [nombre, descripcion, tenant_id]
    );

    const row = insertRes.rows?.[0];
    return res.status(201).json({
      success: true,
      message: "Tipo de producto creado correctamente",
      data: {
        tipoProductoId: row?.tipoproductoid,
        nombre: row?.nombre,
        descripcion: row?.descripcion ?? null,
      },
    });
  } catch (error) {
    logger.error('Error al crear tipo de producto (admin):', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "Error al crear el tipo de producto",
      error: error.message,
    });
  }
};

module.exports = {
  getTiposProductoAdmin,
  crearTipoProductoAdmin
};
