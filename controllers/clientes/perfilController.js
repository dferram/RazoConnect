const { pool } = require("../../db");
const logger = require('../../utils/logger');
const bcrypt = require("bcryptjs");

async function actualizarPerfil(req, res) {
  
  let client;
  
  try {
    const clienteId = req.user.userId;
    const { nombre, apellido, email, telefono } = req.body;


    if (!nombre || !apellido) {
      return res.status(400).json({
        success: false,
        message: "Nombre y apellido son obligatorios",
      });
    }

    client = await pool.connect();
    await client.query("BEGIN");

    if (email) {
      const emailCheck = await client.query(
        "SELECT clienteid FROM clientes WHERE email = $1 AND clienteid != $2 AND tenant_id = $3",
        [email, clienteId, req.tenant.tenant_id]
      );

      if (emailCheck.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "El email ya está registrado por otro usuario",
        });
      }
    }

    const updateQuery = `
      UPDATE clientes 
      SET nombre = $1, 
          apellido = $2, 
          email = $3, 
          telefono = $4
      WHERE clienteid = $5 AND tenant_id = $6
      RETURNING clienteid, nombre, apellido, email, telefono, fechaderegistro
    `;


    const result = await client.query(updateQuery, [
      nombre.trim(),
      apellido.trim(),
      email ? email.trim() : null,
      telefono ? telefono.trim() : null,
      clienteId,
      req.tenant.tenant_id,
    ]);


    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Cliente no encontrado",
      });
    }

    await client.query("COMMIT");

    const responseData = {
      success: true,
      message: "Perfil actualizado correctamente",
      data: {
        cliente: result.rows[0],
      },
    };

    return res.status(200).json(responseData);
  } catch (error) {
    logger.error('❌ [DEBUG] ERROR CRÍTICO en actualizarPerfil:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    console.error('❌ [DEBUG] Error name:', error.name);
    console.error('❌ [DEBUG] Error message:', error.message);
    console.error('❌ [DEBUG] Error stack:', error.stack);
    console.error('❌ [DEBUG] Error code:', error.code);
    
    // Intentar hacer ROLLBACK si hay conexión
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        logger.error('❌ [DEBUG] Error en ROLLBACK:', {
      error: rollbackError.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
      }
    }

    // Manejar errores específicos de PostgreSQL
    if (error.code === "23505") {
      return res.status(400).json({
        success: false,
        message: "El email ya está registrado por otro usuario",
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }

    // Error genérico - GARANTIZAR respuesta JSON válida
    return res.status(500).json({
      success: false,
      message: "Error al actualizar el perfil",
      error: error.message || 'Error desconocido',
      code: error.code || 'UNKNOWN_ERROR',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  } finally {
    // Liberar conexión de BD de forma segura
    if (client) {
      try {
        client.release();
      } catch (releaseError) {
        logger.error('❌ [DEBUG] Error al liberar conexión:', {
      error: releaseError.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
      }
    }
  }
}

async function cambiarPassword(req, res) {
  const clienteId = req.user.userId;
  const { passwordActual, passwordNueva } = req.body;

  if (!passwordActual || !passwordNueva) {
    return res.status(400).json({
      success: false,
      message: "Debe proporcionar la contraseña actual y la nueva contraseña",
    });
  }

  if (passwordNueva.length < 6) {
    return res.status(400).json({
      success: false,
      message: "La nueva contraseña debe tener al menos 6 caracteres",
    });
  }

  const client = await pool.connect();
  try {
    const clienteQuery = await client.query(
      "SELECT clienteid, passwordhash FROM clientes WHERE clienteid = $1 AND tenant_id = $2",
      [clienteId, req.tenant.tenant_id]
    );

    if (clienteQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Cliente no encontrado",
      });
    }

    const cliente = clienteQuery.rows[0];

    if (!cliente.passwordhash) {
      return res.status(400).json({
        success: false,
        message: "Esta cuenta no tiene contraseña configurada (cuenta de Google)",
      });
    }

    const passwordValida = await bcrypt.compare(
      passwordActual,
      cliente.passwordhash
    );

    if (!passwordValida) {
      return res.status(400).json({
        success: false,
        message: "La contraseña actual es incorrecta",
      });
    }

    const nuevoHash = await bcrypt.hash(passwordNueva, 10);

    await client.query(
      "UPDATE clientes SET passwordhash = $1 WHERE clienteid = $2 AND tenant_id = $3",
      [nuevoHash, clienteId, req.tenant.tenant_id]
    );

    return res.status(200).json({
      success: true,
      message: "Contraseña actualizada correctamente",
    });
  } catch (error) {
    logger.error('Error cambiando contraseña:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "Error al cambiar la contraseña",
    });
  } finally {
    client.release();
  }
}

module.exports = {
  actualizarPerfil,
  cambiarPassword,
};
