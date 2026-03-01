const bcrypt = require("bcryptjs");
const db = require("../../db");
const { generateAccessToken, generateRefreshToken } = require("../../utils/jwtHelper");
const { saveRefreshToken } = require("../../config/redisClient");
const { validateAgenteRegistro, cleanPhone } = require("../../utils/validator");
const { generateCodigoAgente } = require("../../utils/agentCode");

/**
 * Registro de nuevo agente de ventas
 * POST /api/registro/agente
 */
const registroAgente = async (req, res) => {
  try {
    let { nombre, apellido, email, telefono, password } = req.body;

    email = email && email.trim() !== "" ? email.trim() : null;
    telefono = telefono && telefono.trim() !== "" ? cleanPhone(telefono.trim()) : null;

    const validation = validateAgenteRegistro({
      nombre,
      apellido,
      email,
      telefono,
      password,
    });
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: "Error de validación",
        errors: validation.errors,
      });
    }

    const { tenant_id } = req.tenant;

    if (email) {
      const emailCheck = await db.query(
        "SELECT agenteid FROM agentesdeventas WHERE email = $1 AND tenant_id = $2",
        [email, tenant_id]
      );

      if (emailCheck.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Este correo electrónico ya está registrado.",
        });
      }
    }

    if (telefono) {
      const telefonoCheck = await db.query(
        "SELECT agenteid FROM agentesdeventas WHERE telefono = $1 AND tenant_id = $2",
        [telefono, tenant_id]
      );

      if (telefonoCheck.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Este número de teléfono ya está registrado en el sistema.",
        });
      }
    }

    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const codigoAgente = await generateCodigoAgente(db);

    const result = await db.query(
      `INSERT INTO agentesdeventas (nombre, apellido, email, telefono, passwordhash, codigoagente, activo, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7)
       RETURNING agenteid, nombre, apellido, email, telefono, codigoagente, activo`,
      [nombre, apellido, email, telefono, passwordHash, codigoAgente, tenant_id]
    );

    const nuevoAgente = result.rows[0];

    // Generar Access Token (1h) y Refresh Token (30d)
    const accessToken = generateAccessToken({
      id: nuevoAgente.agenteid,
      rol: "agente",
      email: nuevoAgente.email || null,
      tenant_id: tenant_id,
    });

    const refreshToken = generateRefreshToken({
      id: nuevoAgente.agenteid,
      rol: "agente",
      email: nuevoAgente.email || null,
      tenant_id: tenant_id,
    });

    // Guardar refresh token en Redis (30 días)
    await saveRefreshToken(nuevoAgente.agenteid, "agente", refreshToken, 30 * 24 * 60 * 60);

    res.status(201).json({
      success: true,
      message: "Agente registrado exitosamente",
      data: {
        agente: {
          agenteId: nuevoAgente.agenteid,
          nombre: nuevoAgente.nombre,
          apellido: nuevoAgente.apellido,
          email: nuevoAgente.email,
          telefono: nuevoAgente.telefono,
          codigoAgente: nuevoAgente.codigoagente,
          activo: nuevoAgente.activo,
        },
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    console.error("Error en registro de agente:", error);
    res.status(500).json({
      success: false,
      message: "Error al registrar el agente",
      error: error.message,
    });
  }
};

module.exports = {
  registroAgente,
};
