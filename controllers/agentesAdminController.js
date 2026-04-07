/**
 * AGENTES ADMIN CONTROLLER
 * 
 * Controlador especializado para la gestión de agentes de ventas.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/agentesAdminController
 * @author RazoConnect Team
 * @date 2026-02-26
 */

const db = require('../db');
const logger = require('../utils/logger');
const bcrypt = require('bcryptjs');

/**
 * Obtener todos los agentes
 * @route GET /api/admin/agentes
 */
const getAllAgentes = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;

    const result = await db.query(
      `SELECT
        a.agenteid,
        a.nombre,
        a.apellido,
        a.email,
        a.telefono,
        a.codigoagente,
        a.porcentaje_comision,
        a.activo,
        COUNT(DISTINCT c.clienteid) as total_clientes,
        COALESCE(SUM(p.montototal), 0) as ventas_totales
      FROM agentesdeventas a
      LEFT JOIN clientes c ON c.agenteid = a.agenteid AND c.tenant_id = $1
      LEFT JOIN pedidos p ON p.agenteid = a.agenteid AND p.tenant_id = $1
      WHERE a.tenant_id = $1
      GROUP BY a.agenteid
      ORDER BY a.agenteid DESC`,
      [tenant_id]
    );

    res.json({
      success: true,
      data: {
        agentes: result.rows.map(row => ({
          agenteId: row.agenteid,
          nombre: row.nombre,
          apellido: row.apellido,
          email: row.email,
          telefono: row.telefono,
          codigoAgente: row.codigoagente,
          porcentajeComision: parseFloat(row.porcentaje_comision || 0),
          activo: row.activo,
          totalClientes: parseInt(row.total_clientes || 0),
          ventasTotales: parseFloat(row.ventas_totales || 0)
        }))
      }
    });
  } catch (error) {
    logger.error('Error al obtener agentes:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error en el servidor"
    });
  }
};

/**
 * Obtener detalle de un agente
 * @route GET /api/admin/agentes/:id
 */
const getAgenteDetalle = async (req, res) => {
  try {
    const agenteId = parseInt(req.params.id);
    const { tenant_id } = req.tenant;

    if (!Number.isInteger(agenteId) || agenteId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de agente inválido"
      });
    }

    const result = await db.query(
      `SELECT
        a.*,
        COUNT(DISTINCT c.clienteid) as total_clientes,
        COALESCE(SUM(p.montototal), 0) as ventas_totales,
        COUNT(DISTINCT p.pedidoid) as total_pedidos
      FROM agentesdeventas a
      LEFT JOIN clientes c ON c.agenteid = a.agenteid AND c.tenant_id = $2
      LEFT JOIN pedidos p ON p.agenteid = a.agenteid AND p.tenant_id = $2
      WHERE a.agenteid = $1 AND a.tenant_id = $2
      GROUP BY a.agenteid`,
      [agenteId, tenant_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Agente no encontrado"
      });
    }

    const agente = result.rows[0];

    res.json({
      success: true,
      data: {
        agenteId: agente.agenteid,
        nombre: agente.nombre,
        apellido: agente.apellido,
        email: agente.email,
        telefono: agente.telefono,
        codigoAgente: agente.codigoagente,
        porcentajeComision: parseFloat(agente.porcentaje_comision || 0),
        activo: agente.activo,
        totalClientes: parseInt(agente.total_clientes || 0),
        ventasTotales: parseFloat(agente.ventas_totales || 0),
        totalPedidos: parseInt(agente.total_pedidos || 0)
      }
    });
  } catch (error) {
    logger.error('Error al obtener detalle del agente:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error en el servidor"
    });
  }
};

/**
 * Obtener clientes asignados a un agente
 * @route GET /api/admin/agentes/:id/clientes
 */
const getAgenteClientes = async (req, res) => {
  try {
    const agenteId = parseInt(req.params.id, 10);
    const { tenant_id } = req.tenant;

    if (!Number.isInteger(agenteId) || agenteId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de agente inválido"
      });
    }

    const result = await db.query(
      `SELECT 
        c.clienteid,
        c.nombre,
        c.apellido,
        c.email,
        c.telefono,
        c.activo,
        COUNT(DISTINCT p.pedidoid) as total_pedidos,
        COALESCE(SUM(p.montototal), 0) as monto_total
      FROM clientes c
      LEFT JOIN pedidos p ON p.clienteid = c.clienteid
      WHERE c.agenteid = $1 AND c.tenant_id = $2
      GROUP BY c.clienteid
      ORDER BY c.nombre, c.apellido`,
      [agenteId, tenant_id]
    );

    res.json({
      success: true,
      data: {
        clientes: result.rows.map(row => ({
          clienteId: row.clienteid,
          nombre: row.nombre,
          apellido: row.apellido,
          email: row.email,
          telefono: row.telefono,
          activo: row.activo,
          totalPedidos: parseInt(row.total_pedidos || 0),
          montoTotal: parseFloat(row.monto_total || 0)
        }))
      }
    });
  } catch (error) {
    logger.error('Error al obtener clientes del agente:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error en el servidor"
    });
  }
};

/**
 * Crear un nuevo agente
 * @route POST /api/admin/agentes
 */
const crearAgente = async (req, res) => {
  try {
    const { nombre, apellido, email, password, telefono, porcentaje_comision } = req.body;
    const { tenant_id } = req.tenant;

    const emailCheck = await db.query(
      "SELECT agenteid FROM agentesdeventas WHERE email = $1 AND tenant_id = $2",
      [email, tenant_id]
    );

    if (emailCheck.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Ya existe un agente con ese email"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const codigoAgente = `AG-${Date.now().toString().slice(-6)}`;

    const result = await db.query(
      `INSERT INTO agentesdeventas 
       (nombre, apellido, email, password, telefono, codigoagente, porcentaje_comision, activo, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8)
       RETURNING agenteid, nombre, apellido, email, codigoagente`,
      [
        nombre,
        apellido,
        email,
        hashedPassword,
        telefono || null,
        codigoAgente,
        porcentaje_comision || 0,
        tenant_id
      ]
    );

    res.status(201).json({
      success: true,
      message: "Agente creado exitosamente",
      data: {
        agenteId: result.rows[0].agenteid,
        nombre: result.rows[0].nombre,
        apellido: result.rows[0].apellido,
        email: result.rows[0].email,
        codigoAgente: result.rows[0].codigoagente
      }
    });
  } catch (error) {
    logger.error('Error al crear agente:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error al crear el agente"
    });
  }
};

/**
 * Actualizar un agente
 * @route PUT /api/admin/agentes/:id
 */
const actualizarAgente = async (req, res) => {
  try {
    const agenteId = parseInt(req.params.id);
    const { nombre, apellido, email, telefono, porcentaje_comision } = req.body;
    const { tenant_id } = req.tenant;

    if (!Number.isInteger(agenteId) || agenteId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de agente inválido"
      });
    }

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (nombre !== undefined) {
      updates.push(`nombre = $${paramIndex++}`);
      values.push(nombre);
    }

    if (apellido !== undefined) {
      updates.push(`apellido = $${paramIndex++}`);
      values.push(apellido);
    }

    if (email !== undefined) {
      updates.push(`email = $${paramIndex++}`);
      values.push(email);
    }

    if (telefono !== undefined) {
      updates.push(`telefono = $${paramIndex++}`);
      values.push(telefono);
    }

    if (porcentaje_comision !== undefined) {
      updates.push(`porcentaje_comision = $${paramIndex++}`);
      values.push(porcentaje_comision);
    }

    if (updates.length === 0) {
      return res.json({
        success: true,
        message: "No hay cambios para actualizar"
      });
    }

    values.push(agenteId);
    values.push(tenant_id);

    const result = await db.query(
      `UPDATE agentesdeventas
       SET ${updates.join(", ")}
       WHERE agenteid = $${paramIndex++} AND tenant_id = $${paramIndex++}
       RETURNING agenteid, nombre, apellido, email`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Agente no encontrado"
      });
    }

    res.json({
      success: true,
      message: "Agente actualizado exitosamente",
      data: {
        agenteId: result.rows[0].agenteid,
        nombre: result.rows[0].nombre,
        apellido: result.rows[0].apellido,
        email: result.rows[0].email
      }
    });
  } catch (error) {
    logger.error('Error al actualizar agente:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error al actualizar el agente"
    });
  }
};

/**
 * Desactivar un agente
 * @route PUT /api/admin/agentes/:id/desactivar
 */
const desactivarAgente = async (req, res) => {
  try {
    const agenteId = parseInt(req.params.id);
    const { tenant_id } = req.tenant;

    if (!Number.isInteger(agenteId) || agenteId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de agente inválido"
      });
    }

    const result = await db.query(
      `UPDATE agentesdeventas
       SET activo = FALSE
       WHERE agenteid = $1 AND tenant_id = $2
       RETURNING agenteid, nombre, apellido`,
      [agenteId, tenant_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Agente no encontrado"
      });
    }

    res.json({
      success: true,
      message: "Agente desactivado exitosamente"
    });
  } catch (error) {
    logger.error('Error al desactivar agente:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error al desactivar el agente"
    });
  }
};

module.exports = {
  getAllAgentes,
  getAgenteDetalle,
  getAgenteClientes,
  crearAgente,
  actualizarAgente,
  desactivarAgente
};
