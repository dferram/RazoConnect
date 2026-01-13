const pool = require("../../db");
const bcrypt = require("bcrypt");

async function actualizarPerfil(req, res) {
  const clienteId = req.user.clienteId;
  const { nombre, apellido, email, telefono } = req.body;

  if (!nombre || !apellido) {
    return res.status(400).json({
      success: false,
      message: "Nombre y apellido son obligatorios",
    });
  }

  const client = await pool.connect();
  try {
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

    return res.status(200).json({
      success: true,
      message: "Perfil actualizado correctamente",
      data: {
        cliente: result.rows[0],
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error actualizando perfil:", error);

    if (error.code === "23505") {
      return res.status(400).json({
        success: false,
        message: "El email ya está registrado por otro usuario",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Error al actualizar el perfil",
    });
  } finally {
    client.release();
  }
}

async function cambiarPassword(req, res) {
  const clienteId = req.user.clienteId;
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
    console.error("Error cambiando contraseña:", error);
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
