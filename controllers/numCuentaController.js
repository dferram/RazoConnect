const db = require("../db");
const logger = require('../utils/logger');
const { registrarLog } = require("../services/loggerService");

// ============================================
// CUENTAS BANCARIAS EMPRESA (Múltiples)
// ============================================

async function obtenerCuentasEmpresa(req, res) {
  try {
    const result = await db.query(
      `SELECT id, banco, numero_cuenta, clabe, titular, es_principal, ultima_actualizacion
       FROM datos_bancarios_empresa 
       ORDER BY es_principal DESC, id ASC`
    );

    res.json({
      success: true,
      cuentas: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    logger.error('Error al obtener cuentas de empresa:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({ 
      success: false,
      error: "Error al obtener cuentas bancarias" 
    });
  }
}

async function crearCuentaEmpresa(req, res) {
  const client = await db.pool.connect();
  try {
    const adminId = req.user.userId;
    const { banco, numero_cuenta, clabe, titular, es_principal } = req.body;

    if (!banco || !numero_cuenta || !clabe || !titular) {
      return res.status(400).json({
        success: false,
        error: "Todos los campos son obligatorios",
      });
    }

    await client.query("BEGIN");

    // Si se marca como principal, desactivar las demás
    if (es_principal) {
      await client.query(
        `UPDATE datos_bancarios_empresa SET es_principal = false`
      );
    }

    const result = await client.query(
      `INSERT INTO datos_bancarios_empresa 
       (banco, numero_cuenta, clabe, titular, es_principal, ultima_actualizacion)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id, banco, numero_cuenta, clabe, titular, es_principal, ultima_actualizacion`,
      [banco, numero_cuenta, clabe, titular, es_principal || false]
    );

    await registrarLog(
      req,
      "INSERT",
      "datos_bancarios_empresa",
      result.rows[0].id,
      result.rows[0]
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Cuenta bancaria agregada exitosamente",
      cuenta: result.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error('Error al crear cuenta de empresa:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({ 
      success: false,
      error: "Error al crear cuenta bancaria" 
    });
  } finally {
    client.release();
  }
}

async function activarCuentaEmpresa(req, res) {
  const client = await db.pool.connect();
  try {
    const adminId = req.user.userId;
    const { id } = req.params;

    await client.query("BEGIN");

    // Verificar que la cuenta existe
    const checkResult = await client.query(
      `SELECT id FROM datos_bancarios_empresa WHERE id = $1`,
      [id]
    );

    if (checkResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        error: "Cuenta no encontrada",
      });
    }

    // Desactivar todas las cuentas
    await client.query(
      `UPDATE datos_bancarios_empresa SET es_principal = false`
    );

    // Activar la cuenta seleccionada
    const result = await client.query(
      `UPDATE datos_bancarios_empresa 
       SET es_principal = true, ultima_actualizacion = NOW()
       WHERE id = $1
       RETURNING id, banco, numero_cuenta, clabe, titular, es_principal, ultima_actualizacion`,
      [id]
    );

    await registrarLog(
      req,
      "UPDATE",
      "datos_bancarios_empresa",
      id,
      { es_principal: true }
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Cuenta activada como principal",
      cuenta: result.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error('Error al activar cuenta de empresa:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({ 
      success: false,
      error: "Error al activar cuenta bancaria" 
    });
  } finally {
    client.release();
  }
}

async function eliminarCuentaEmpresa(req, res) {
  const client = await db.pool.connect();
  try {
    const adminId = req.user.userId;
    const { id } = req.params;

    await client.query("BEGIN");

    // Verificar que la cuenta existe y obtener su estado
    const checkResult = await client.query(
      `SELECT id, es_principal FROM datos_bancarios_empresa WHERE id = $1`,
      [id]
    );

    if (checkResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        error: "Cuenta no encontrada",
      });
    }

    // No permitir eliminar si es la única cuenta
    const countResult = await client.query(
      `SELECT COUNT(*) as total FROM datos_bancarios_empresa`
    );

    if (parseInt(countResult.rows[0].total) <= 1) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: "No puedes eliminar la única cuenta bancaria",
      });
    }

    const esPrincipal = checkResult.rows[0].es_principal;

    // Eliminar la cuenta
    await client.query(
      `DELETE FROM datos_bancarios_empresa WHERE id = $1`,
      [id]
    );

    // Si era la principal, activar otra
    if (esPrincipal) {
      await client.query(
        `UPDATE datos_bancarios_empresa 
         SET es_principal = true 
         WHERE id = (SELECT MIN(id) FROM datos_bancarios_empresa)`
      );
    }

    await registrarLog(
      req,
      "DELETE",
      "datos_bancarios_empresa",
      id,
      null
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Cuenta eliminada exitosamente",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error('Error al eliminar cuenta de empresa:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({ 
      success: false,
      error: "Error al eliminar cuenta bancaria" 
    });
  } finally {
    client.release();
  }
}

// ============================================
// CUENTAS BANCARIAS ADMIN (Individual)
// ============================================

async function obtenerCuentaAdmin(req, res) {
  try {
    const adminId = req.user.userId;
    
    const result = await db.query(
      `SELECT banco, numero_cuenta, clabe, titular 
       FROM administradores 
       WHERE adminid = $1`,
      [adminId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Administrador no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error al obtener cuenta de admin:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({ success: false, message: "Error al obtener información de cuenta" });
  }
}

async function actualizarCuentaAdmin(req, res) {
  const client = await db.pool.connect();
  try {
    const adminId = req.user.userId;
    const { banco, numero_cuenta, clabe, titular } = req.body;

    await client.query("BEGIN");

    const result = await client.query(
      `UPDATE administradores 
       SET banco = $1, numero_cuenta = $2, clabe = $3, titular = $4
       WHERE adminid = $5
       RETURNING banco, numero_cuenta, clabe, titular`,
      [banco, numero_cuenta, clabe, titular, adminId]
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Administrador no encontrado" });
    }

    await registrarLog(
      req,
      "UPDATE",
      "administradores",
      adminId,
      { banco, numero_cuenta, clabe, titular }
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Información bancaria actualizada exitosamente",
      cuenta: result.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error('Error al actualizar cuenta de admin:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({ success: false, message: "Error al actualizar información bancaria" });
  } finally {
    client.release();
  }
}

async function obtenerCuentaAgente(req, res) {
  try {
    const agenteId = req.user.userId;
    
    const result = await db.query(
      `SELECT banco, numero_cuenta, clabe, titular 
       FROM agentesdeventas 
       WHERE agenteid = $1`,
      [agenteId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Agente no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error al obtener cuenta de agente:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({ success: false, message: "Error al obtener información de cuenta" });
  }
}

async function actualizarCuentaAgente(req, res) {
  const client = await db.pool.connect();
  try {
    const agenteId = req.user.userId;
    const { banco, numero_cuenta, clabe, titular } = req.body;

    await client.query("BEGIN");

    const result = await client.query(
      `UPDATE agentesdeventas 
       SET banco = $1, numero_cuenta = $2, clabe = $3, titular = $4
       WHERE agenteid = $5
       RETURNING banco, numero_cuenta, clabe, titular`,
      [banco, numero_cuenta, clabe, titular, agenteId]
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Agente no encontrado" });
    }

    await registrarLog(
      req,
      "UPDATE",
      "agentesdeventas",
      agenteId,
      { banco, numero_cuenta, clabe, titular }
    );

    await client.query("COMMIT");

    res.json({
      message: "Información bancaria actualizada exitosamente",
      cuenta: result.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error('Error al actualizar cuenta de agente:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({ success: false, message: "Error al actualizar información bancaria" });
  } finally {
    client.release();
  }
}

module.exports = {
  // Cuentas empresa (múltiples)
  obtenerCuentasEmpresa,
  crearCuentaEmpresa,
  activarCuentaEmpresa,
  eliminarCuentaEmpresa,
  // Cuentas admin individual
  obtenerCuentaAdmin,
  actualizarCuentaAdmin,
  // Cuentas agente
  obtenerCuentaAgente,
  actualizarCuentaAgente,
};
