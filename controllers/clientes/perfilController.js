const { pool } = require("../../db");
const bcrypt = require("bcryptjs");

async function actualizarPerfil(req, res) {
  console.log('\n🔍 [DEBUG] actualizarPerfil - INICIO');
  console.log('📋 [DEBUG] req.user:', JSON.stringify(req.user, null, 2));
  console.log('📋 [DEBUG] req.body:', JSON.stringify(req.body, null, 2));
  console.log('📋 [DEBUG] req.tenant:', JSON.stringify(req.tenant, null, 2));
  
  let client;
  
  try {
    const clienteId = req.user.userId;
    const { nombre, apellido, email, telefono } = req.body;

    console.log('✅ [DEBUG] Datos extraídos:');
    console.log('  - clienteId:', clienteId);
    console.log('  - nombre:', nombre);
    console.log('  - apellido:', apellido);
    console.log('  - email:', email);
    console.log('  - telefono:', telefono);

    if (!nombre || !apellido) {
      console.log('❌ [DEBUG] Validación fallida: nombre o apellido faltante');
      return res.status(400).json({
        success: false,
        message: "Nombre y apellido son obligatorios",
      });
    }

    console.log('🔌 [DEBUG] Conectando a la base de datos...');
    client = await pool.connect();
    console.log('✅ [DEBUG] Conexión a BD establecida');
    console.log('🔄 [DEBUG] Iniciando transacción...');
    await client.query("BEGIN");

    if (email) {
      console.log('📧 [DEBUG] Verificando email duplicado:', email);
      const emailCheck = await client.query(
        "SELECT clienteid FROM clientes WHERE email = $1 AND clienteid != $2 AND tenant_id = $3",
        [email, clienteId, req.tenant.tenant_id]
      );

      console.log('📧 [DEBUG] Resultados de verificación:', emailCheck.rows.length);
      if (emailCheck.rows.length > 0) {
        console.log('❌ [DEBUG] Email duplicado encontrado');
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

    console.log('💾 [DEBUG] Ejecutando UPDATE con parámetros:');
    console.log('  $1 (nombre):', nombre.trim());
    console.log('  $2 (apellido):', apellido.trim());
    console.log('  $3 (email):', email ? email.trim() : null);
    console.log('  $4 (telefono):', telefono ? telefono.trim() : null);
    console.log('  $5 (clienteId):', clienteId);
    console.log('  $6 (tenant_id):', req.tenant.tenant_id);

    const result = await client.query(updateQuery, [
      nombre.trim(),
      apellido.trim(),
      email ? email.trim() : null,
      telefono ? telefono.trim() : null,
      clienteId,
      req.tenant.tenant_id,
    ]);

    console.log('✅ [DEBUG] UPDATE ejecutado. Filas afectadas:', result.rowCount);
    console.log('📊 [DEBUG] Datos retornados:', JSON.stringify(result.rows, null, 2));

    if (result.rows.length === 0) {
      console.log('❌ [DEBUG] Cliente no encontrado en UPDATE');
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Cliente no encontrado",
      });
    }

    console.log('✅ [DEBUG] Haciendo COMMIT...');
    await client.query("COMMIT");

    const responseData = {
      success: true,
      message: "Perfil actualizado correctamente",
      data: {
        cliente: result.rows[0],
      },
    };

    console.log('📤 [DEBUG] Enviando respuesta exitosa:', JSON.stringify(responseData, null, 2));
    return res.status(200).json(responseData);
  } catch (error) {
    console.error('❌ [DEBUG] ERROR CRÍTICO en actualizarPerfil:', error);
    console.error('❌ [DEBUG] Error name:', error.name);
    console.error('❌ [DEBUG] Error message:', error.message);
    console.error('❌ [DEBUG] Error stack:', error.stack);
    console.error('❌ [DEBUG] Error code:', error.code);
    
    // Intentar hacer ROLLBACK si hay conexión
    if (client) {
      try {
        await client.query("ROLLBACK");
        console.log('🔄 [DEBUG] ROLLBACK ejecutado');
      } catch (rollbackError) {
        console.error('❌ [DEBUG] Error en ROLLBACK:', rollbackError);
      }
    }

    // Manejar errores específicos de PostgreSQL
    if (error.code === "23505") {
      console.log('❌ [DEBUG] Error de duplicado (23505)');
      return res.status(400).json({
        success: false,
        message: "El email ya está registrado por otro usuario",
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }

    // Error genérico - GARANTIZAR respuesta JSON válida
    console.log('❌ [DEBUG] Enviando error 500 con JSON válido');
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
        console.log('🔌 [DEBUG] Liberando conexión de BD');
        client.release();
        console.log('✅ [DEBUG] Conexión liberada exitosamente');
      } catch (releaseError) {
        console.error('❌ [DEBUG] Error al liberar conexión:', releaseError);
      }
    }
    console.log('✅ [DEBUG] actualizarPerfil - FIN\n');
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
