/**
 * DESVINCULAR CLIENTE CONTROLLER
 * 
 * Controlador especializado para desvincular clientes de agentes.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/desvincularClienteController
 * @author RazoConnect Team
 * @date 2026-02-27
 */

const db = require('../db');
const logger = require('../utils/logger');
const auditService = require('../services/auditService');

/**
 * Desvincular un cliente de su agente asignado
 * PUT /api/admin/clientes/:id/desvincular
 */
const desvincularClienteDeAgente = async (req, res) => {
  try {
    const clienteId = parseInt(req.params.id, 10);

    if (Number.isNaN(clienteId)) {
      return res.status(400).json({
        success: false,
        message: "ID de cliente inválido",
      });
    }

    // CRITICAL: Filter by tenant_id for multi-tenant isolation
    const { tenant_id } = req.tenant;

    const snapshotResult = await db.query(
      "SELECT * FROM Clientes WHERE ClienteID = $1 AND tenant_id = $2",
      [clienteId, tenant_id]
    );

    if (snapshotResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Cliente no encontrado",
      });
    }

    const datosAnteriores = snapshotResult.rows[0];
    const datosNuevos = { ...datosAnteriores, agenteid: null };

    const rolUsuario = (req?.user?.rol || "").toString().trim().toLowerCase();
    const allowDirect = rolUsuario === "admin" || rolUsuario === "superadmin";

    if (allowDirect) {
      const updateRes = await db.query(
        "UPDATE clientes SET agenteid = $1 WHERE clienteid = $2 AND tenant_id = $3 RETURNING clienteid, nombre, apellido, email, telefono, activo, agenteid",
        [null, clienteId, tenant_id]
      );

      if (!updateRes.rows.length) {
        return res.status(404).json({
          success: false,
          message: "Cliente no encontrado",
        });
      }

      const row = updateRes.rows[0];

      await auditService.registrarCambioPasivo(
        req,
        "clientes",
        clienteId,
        "UPDATE",
        datosAnteriores,
        {
          clienteid: row.clienteid,
          nombre: row.nombre,
          apellido: row.apellido,
          email: row.email,
          telefono: row.telefono,
          activo: row.activo,
          agenteid: row.agenteid,
        }
      );

      return res.json({
        success: true,
        message: "Cliente desvinculado correctamente.",
        data: {
          clienteId: row.clienteid,
          agenteId: row.agenteid,
        },
      });
    }

    // Si no tiene permisos directos, requiere aprobación
    // Nota: solicitarCambio es una función del sistema de control de cambios
    // que debe estar disponible en el contexto global o importada
    const solicitarCambio = require('../utils/controlCambios').solicitarCambio;
    
    const resultado = await solicitarCambio(
      req,
      "clientes",
      clienteId,
      "UPDATE",
      datosNuevos,
      datosAnteriores
    );

    return res.json({
      success: true,
      message: resultado.mensaje,
      data: {
        clienteId,
        solicitudId: resultado.solicitudId,
        estado: resultado.estado,
      },
    });
  } catch (error) {
    logger.error('Error al desvincular cliente:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "Error al desvincular al cliente del agente",
    });
  }
};

module.exports = {
  desvincularClienteDeAgente
};
