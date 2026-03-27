/**
 * COMISIONES ADMIN CONTROLLER
 * 
 * Controlador especializado para la gestión de comisiones de agentes.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/comisionesAdminController
 * @author RazoConnect Team
 * @date 2026-02-26
 */

const db = require('../db');
const logger = require('../utils/logger');
const auditService = require('../services/auditService');
const { solicitarCambio } = require('../services/ChangeRequestService');

/**
 * Obtener todas las comisiones
 * GET /api/admin/comisiones
 */
const getAllComisiones = async (req, res) => {
  try {
    const { estatus } = req.query;

    let query = `
      SELECT 
        c.ComisionID,
        c.PedidoID,
        c.AgenteID,
        a.Nombre || ' ' || a.Apellido as AgenteNombre,
        a.CodigoAgente,
        c.MontoComision,
        c.Estatus,
        c.FechaCalculo,
        NULL::timestamp AS FechaPago,
        p.MontoTotal as MontoVenta
      FROM Comisiones c
      INNER JOIN AgentesDeVentas a ON c.AgenteID = a.AgenteID
      INNER JOIN Pedidos p ON c.PedidoID = p.PedidoID
    `;

    const params = [];
    if (estatus) {
      query += " WHERE c.Estatus = $1";
      params.push(estatus);
    }

    query += " ORDER BY c.FechaCalculo DESC";

    const result = await db.query(query, params);

    // Calcular totales
    const totalesQuery = `
      SELECT 
        COUNT(*) FILTER (WHERE Estatus = 'Pendiente') as total_pendientes,
        COUNT(*) FILTER (WHERE Estatus = 'Pagado') as total_pagadas,
        COALESCE(SUM(MontoComision) FILTER (WHERE Estatus = 'Pendiente'), 0) as monto_pendiente,
        COALESCE(SUM(MontoComision) FILTER (WHERE Estatus = 'Pagado'), 0) as monto_pagado,
        COALESCE(SUM(MontoComision), 0) as monto_total
      FROM Comisiones
    `;
    const totalesResult = await db.query(totalesQuery);
    const totales = totalesResult.rows[0];

    res.json({
      success: true,
      data: {
        comisiones: result.rows.map((row) => ({
          comisionId: row.comisionid,
          pedidoId: row.pedidoid,
          agenteId: row.agenteid,
          agenteNombre: row.agentenombre,
          codigoAgente: row.codigoagente,
          montoComision: parseFloat(row.montocomision),
          estatus: row.estatus,
          fechaCalculo: row.fechacalculo,
          fechaGeneracion: row.fechacalculo,
          fechaPago: row.fechapago,
          montoVenta: parseFloat(row.montoventa),
        })),
        totales: {
          totalPendientes: parseInt(totales.total_pendientes),
          totalPagadas: parseInt(totales.total_pagadas),
          montoPendiente: parseFloat(totales.monto_pendiente),
          montoPagado: parseFloat(totales.monto_pagado),
          montoTotal: parseFloat(totales.monto_total)
        }
      },
    });
  } catch (error) {
    logger.error('Error al obtener comisiones:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * Pagar una comisión
 * PUT /api/admin/comisiones/:id/pagar
 */
const pagarComision = async (req, res) => {
  try {
    const comisionId = parseInt(req.params.id);

    // Verificar que la comisión existe y está pendiente
    const checkResult = await db.query(
      "SELECT comisionid, estatus, tenant_id FROM Comisiones WHERE ComisionID = $1 AND tenant_id = $2",
      [comisionId, req.tenant?.tenant_id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Comisión no encontrada",
      });
    }

    const comision = checkResult.rows[0];

    if (comision.estatus === "Pagada") {
      return res.status(400).json({
        success: false,
        message: "Esta comisión ya ha sido pagada",
      });
    }

    const datosNuevos = {
      Estatus: "Pagada",
    };

    const rol = (req?.user?.rol || "").toString().trim().toLowerCase();
    const allowDirect = rol === "admin" || rol === "superadmin";

    if (allowDirect) {
      const updateRes = await db.query(
        "UPDATE comisiones SET estatus = $1 WHERE comisionid = $2 RETURNING comisionid, pedidoid, agenteid, montocomision, fechacalculo, estatus",
        ["Pagada", comisionId]
      );

      if (!updateRes.rows.length) {
        return res.status(404).json({
          success: false,
          message: "Comisión no encontrada",
        });
      }

      const row = updateRes.rows[0];

      await auditService.registrarCambioPasivo(
        req,
        "comisiones",
        comisionId,
        "UPDATE",
        comision,
        {
          comisionid: row.comisionid,
          estatus: row.estatus,
        }
      );

      return res.json({
        success: true,
        message: "Comisión pagada correctamente.",
        data: {
          comisionId: row.comisionid,
          estatus: row.estatus,
        },
      });
    }

    const resultado = await solicitarCambio(
      req,
      "comisiones",
      comisionId,
      "UPDATE",
      datosNuevos,
      comision
    );

    res.json({
      success: true,
      message: "Solicitud de cambio en comisión registrada.",
      data: {
        comisionId,
        solicitudId: resultado.solicitudId,
        estado: resultado.estado,
      },
    });
  } catch (error) {
    logger.error('Error al pagar comisión:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

module.exports = {
  getAllComisiones,
  pagarComision
};
