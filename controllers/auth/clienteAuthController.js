const bcrypt = require("bcryptjs");
const logger = require('../../utils/logger');
const db = require("../../db");
const { generateAccessToken, generateRefreshToken } = require("../../utils/jwtHelper");
const { saveRefreshToken } = require("../../config/redisClient");
const crypto = require("crypto");
const { sendTemplatedEmail } = require("../../services/emailService");
const { crearNotificacion } = require("../../services/notificacionesService");
const { validateLogin } = require("../../utils/validator");

/**
 * Registro de nuevo cliente
 * POST /api/registro/cliente
 */
const registroCliente = async (req, res) => {
  try {
    let { nombre, apellido, email, password, telefono, numero_cliente, estado_id } = req.body;

    const { tenant_id } = req.tenant;

    if (!email && !telefono) {
      return res.status(400).json({
        success: false,
        message: "Debes proporcionar al menos un correo electrónico o número de teléfono.",
      });
    }

    if (!estado_id) {
      return res.status(400).json({
        success: false,
        message: "Debes seleccionar un estado.",
      });
    }

    // Validar que el estado existe
    const estadoCheck = await db.query(
      "SELECT estadoid FROM estados WHERE estadoid = $1 AND activo = TRUE",
      [estado_id]
    );

    if (estadoCheck.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Estado inválido.",
      });
    }

    if (numero_cliente && numero_cliente.trim() !== "") {
      const numeroClienteCheck = await db.query(
        "SELECT clienteid FROM clientes WHERE numero_cliente = $1 AND tenant_id = $2",
        [numero_cliente.trim(), tenant_id]
      );

      if (numeroClienteCheck.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: "El número de cliente ya está en uso.",
        });
      }
    }

    if (email) {
      const emailCheck = await db.query(
        "SELECT clienteid FROM clientes WHERE email = $1 AND tenant_id = $2",
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
        "SELECT clienteid FROM clientes WHERE telefono = $1 AND tenant_id = $2",
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
    const PasswordHash = await bcrypt.hash(password, saltRounds);

    let numeroClienteFinal = null;
    
    if (numero_cliente && numero_cliente.trim() !== "") {
      numeroClienteFinal = numero_cliente.trim();
    }

    const emailFinal = email && email.trim() !== "" ? email.trim() : null;
    const telefonoFinal = telefono && telefono.trim() !== "" ? telefono.trim() : null;

    const result = await db.query(
      `INSERT INTO clientes (nombre, apellido, email, passwordhash, telefono, tenant_id, numero_cliente, estado_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING clienteid, nombre, apellido, email, telefono, fechaderegistro, numero_cliente, estado_id`,
      [nombre.trim(), apellido.trim(), emailFinal, PasswordHash, telefonoFinal, tenant_id, numeroClienteFinal, estado_id]
    );

    const nuevoCliente = result.rows[0];

    if (!numeroClienteFinal) {
      const numeroClienteGenerado = `RZ-WEB-${nuevoCliente.clienteid}`;
      
      try {
        await db.query(
          "UPDATE clientes SET numero_cliente = $1 WHERE clienteid = $2 AND tenant_id = $3",
          [numeroClienteGenerado, nuevoCliente.clienteid, tenant_id]
        );
        nuevoCliente.numero_cliente = numeroClienteGenerado;
      } catch (updateError) {
        logger.error('Error al generar numero_cliente automático:', {
      error: updateError.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
      }
    }

    // Generar Access Token (1h) y Refresh Token (30d)
    const accessToken = generateAccessToken({
      id: nuevoCliente.clienteid,
      rol: "cliente",
      email: nuevoCliente.email || null,
      tenant_id: tenant_id,
    });

    const refreshToken = generateRefreshToken({
      id: nuevoCliente.clienteid,
      rol: "cliente",
      email: nuevoCliente.email || null,
      tenant_id: tenant_id,
    });

    // Guardar refresh token en Redis (30 días)
    await saveRefreshToken(nuevoCliente.clienteid, "cliente", refreshToken, 30 * 24 * 60 * 60);

    try {
      await crearNotificacion(
        nuevoCliente.clienteid,
        "general",
        "¡Bienvenido a RazoConnect!",
        "Gracias por unirte. Tu cuenta ha sido creada exitosamente."
      );
    } catch (notificacionError) {
      logger.error('No se pudo crear la notificación de bienvenida:', {
      error: notificacionError.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    }

    if (email) {
      try {
        const frontendUrl = process.env.FRONTEND_BASE_URL || "https://razo.com.mx";
        await sendTemplatedEmail(email, "¡Bienvenido a RazoConnect!", {
          title: "¡Bienvenido a RazoConnect!",
          name: `${nombre} ${apellido}`,
          message: `Nos alegra que te hayas unido a nuestra comunidad. Tu cuenta ha sido creada exitosamente y ya puedes comenzar a explorar nuestro catálogo de productos.`,
          buttonText: "Explorar Catálogo",
          buttonUrl: `${frontendUrl}/catalogo.html`,
          additionalInfo: "Si tienes alguna pregunta o necesitas ayuda, nuestro equipo de soporte está disponible para asistirte."
        });
      } catch (emailError) {
        logger.error('Error enviando correo de bienvenida:', {
      error: emailError.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
      }
    }

    res.status(201).json({
      success: true,
      message: "Cliente registrado exitosamente",
      data: {
        cliente: {
          clienteId: nuevoCliente.clienteid,
          nombre: nuevoCliente.nombre,
          apellido: nuevoCliente.apellido,
          email: nuevoCliente.email,
          telefono: nuevoCliente.telefono,
          numeroCliente: nuevoCliente.numero_cliente,
          fechaDeRegistro: nuevoCliente.fechaderegistro,
        },
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    logger.error('Error en registro de cliente:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    
    if (error.code === '23505' && error.constraint && error.constraint.includes('numero_cliente')) {
      return res.status(400).json({
        success: false,
        message: "El número de cliente ya está en uso.",
      });
    }
    
    res.status(500).json({
      success: false,
      message: "Error al registrar el cliente"
    });
  }
};

/**
 * Login de usuario (cliente o agente)
 * POST /api/login
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const identifier = email;

    const validation = validateLogin({ Email: identifier, Password: password });
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: "Error de validación",
        errors: validation.errors,
      });
    }

    const { tenant_id } = req.tenant;

    const clienteResult = await db.query(
      "SELECT clienteid, nombre, apellido, email, passwordhash, telefono FROM clientes WHERE (email = $1 OR telefono = $1) AND tenant_id = $2",
      [identifier, tenant_id]
    );

    if (clienteResult.rows.length > 0) {
      const cliente = clienteResult.rows[0];

      const passwordMatch = await bcrypt.compare(password, cliente.passwordhash);

      if (!passwordMatch) {
        return res.status(401).json({
          success: false,
          message: "Credenciales inválidas",
        });
      }

      // Generar Access Token (1h) y Refresh Token (30d)
      const accessToken = generateAccessToken({
        id: cliente.clienteid,
        rol: "cliente",
        email: cliente.email || null,
        tenant_id: tenant_id,
      });

      const refreshToken = generateRefreshToken({
        id: cliente.clienteid,
        rol: "cliente",
        email: cliente.email || null,
        tenant_id: tenant_id,
      });

      // Guardar refresh token en Redis (30 días)
      await saveRefreshToken(cliente.clienteid, "cliente", refreshToken, 30 * 24 * 60 * 60);

      return res.status(200).json({
        success: true,
        message: "Login exitoso",
        data: {
          rol: "cliente",
          usuario: {
            clienteId: cliente.clienteid,
            nombre: cliente.nombre,
            apellido: cliente.apellido,
            email: cliente.email,
            telefono: cliente.telefono,
          },
          accessToken,
          refreshToken,
        },
      });
    }

    const agenteResult = await db.query(
      "SELECT agenteid, nombre, apellido, email, telefono, passwordhash, codigoagente, activo FROM agentesdeventas WHERE (email = $1 OR telefono = $1) AND tenant_id = $2",
      [identifier, tenant_id]
    );

    if (agenteResult.rows.length > 0) {
      const agente = agenteResult.rows[0];

      if (!agente.activo) {
        return res.status(403).json({
          success: false,
          message: "La cuenta del agente está inactiva",
        });
      }

      const passwordMatch = await bcrypt.compare(password, agente.passwordhash);

      if (!passwordMatch) {
        return res.status(401).json({
          success: false,
          message: "Credenciales inválidas",
        });
      }

      // Generar Access Token (1h) y Refresh Token (30d)
      const accessToken = generateAccessToken({
        id: agente.agenteid,
        rol: "agente",
        email: agente.email || null,
        tenant_id: tenant_id,
      });

      const refreshToken = generateRefreshToken({
        id: agente.agenteid,
        rol: "agente",
        email: agente.email || null,
        tenant_id: tenant_id,
      });

      // Guardar refresh token en Redis (30 días)
      await saveRefreshToken(agente.agenteid, "agente", refreshToken, 30 * 24 * 60 * 60);

      return res.status(200).json({
        success: true,
        message: "Login exitoso",
        data: {
          rol: "agente",
          usuario: {
            agenteId: agente.agenteid,
            nombre: agente.nombre,
            apellido: agente.apellido,
            email: agente.email,
            telefono: agente.telefono,
            codigoAgente: agente.codigoagente,
            activo: agente.activo,
          },
          accessToken,
          refreshToken,
        },
      });
    }

    res.status(401).json({
      success: false,
      message: "Credenciales inválidas",
    });
  } catch (error) {
    logger.error('Error en login:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error al iniciar sesión"
    });
  }
};

/**
 * Verificar token de cliente
 * GET /api/clientes/verify
 */
const verifyCliente = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRol = req.user.rol;

    if (userRol === "agente") {
      const agenteResult = await db.query(
        `SELECT agenteid, nombre, apellido, email, telefono, codigoagente, activo
         FROM agentesdeventas
         WHERE agenteid = $1 AND activo = TRUE`,
        [userId]
      );

      if (agenteResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Agente no encontrado o inactivo",
        });
      }

      const agente = agenteResult.rows[0];

      return res.json({
        success: true,
        data: {
          rol: "agente",
          agente: {
            agenteId: agente.agenteid,
            nombre: agente.nombre,
            apellido: agente.apellido,
            email: agente.email,
            telefono: agente.telefono,
            codigoAgente: agente.codigoagente,
            activo: agente.activo,
          },
        },
      });
    }

    const { tenant_id } = req.tenant;
    const result = await db.query(
      `SELECT clienteid, nombre, apellido, email, telefono, fechaderegistro
       FROM clientes
       WHERE clienteid = $1 AND tenant_id = $2 AND activo = TRUE`,
      [userId, tenant_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Cliente no encontrado o inactivo",
      });
    }

    const cliente = result.rows[0];

    res.json({
      success: true,
      data: {
        rol: "cliente",
        cliente: {
          clienteId: cliente.clienteid,
          nombre: cliente.nombre,
          apellido: cliente.apellido,
          email: cliente.email,
          telefono: cliente.telefono,
          fechaDeRegistro: cliente.fechaderegistro,
        },
      },
    });
  } catch (error) {
    logger.error('Error verifying cliente:', {
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
 * Solicitar recuperación de contraseña
 * POST /api/forgot-password
 */
const forgotPassword = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: "El email o teléfono es requerido",
    });
  }

  try {
    const { tenant_id } = req.tenant;

    const clienteResult = await db.query(
      "SELECT clienteid, nombre, email, telefono FROM clientes WHERE (email = $1 OR telefono = $1) AND tenant_id = $2",
      [email, tenant_id]
    );

    const agenteResult =
      clienteResult.rows.length === 0
        ? await db.query(
            "SELECT agenteid, nombre, email, telefono FROM agentesdeventas WHERE (email = $1 OR telefono = $1) AND tenant_id = $2",
            [email, tenant_id]
          )
        : { rows: [] };

    if (clienteResult.rows.length === 0 && agenteResult.rows.length === 0) {
      return res.status(200).json({
        success: true,
        status: "user_not_found",
        message: "El correo o teléfono ingresado no está registrado.",
      });
    }

    const usuario = clienteResult.rows[0] || agenteResult.rows[0];
    const clienteId = clienteResult.rows[0]?.clienteid || null;
    const agenteId = agenteResult.rows[0]?.agenteid || null;

    if (!usuario.email && clienteId) {
      return res.status(200).json({
        success: true,
        status: "phone_only",
        telefono: usuario.telefono || null,
        message: "Tu cuenta está registrada solo con teléfono. Contáctanos para recuperarla.",
      });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiration = new Date(Date.now() + 60 * 60 * 1000);

    await db.query(
      `INSERT INTO passwordresettokens (Token, ClienteID, AgenteID, ExpiraEn, tenant_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [token, clienteId, agenteId, expiration, tenant_id]
    );

    const frontendUrl = process.env.FRONTEND_BASE_URL || "https://razo.com.mx";
    const resetLink = `${frontendUrl}/reset-password.html?token=${token}`;
    const nombre = usuario.nombre || "usuario";
    const asunto = "Instrucciones para restablecer tu contraseña";

    sendTemplatedEmail(usuario.email, asunto, {
      title: "Recuperación de Contraseña",
      name: nombre,
      message: `Recibimos una solicitud para restablecer tu contraseña. Si fuiste tú quien la solicitó, haz clic en el botón de abajo para continuar.`,
      buttonText: "Restablecer Contraseña",
      buttonUrl: resetLink,
      additionalInfo: `<strong>⏰ Este enlace expira en 1 hora.</strong><br><br>Si no solicitaste este cambio, puedes ignorar este correo de forma segura. Tu contraseña no será modificada.`
    }).catch((err) => {
      logger.error('Error enviando correo de reseteo:', {
      error: err.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    });

    return res.status(200).json({
      success: true,
      status: "email_sent",
      message: "Hemos enviado las instrucciones a tu correo electrónico.",
    });
  } catch (error) {
    logger.error('Error en forgot-password:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "Error al iniciar proceso de recuperación",
    });
  }
};

/**
 * Restablecer contraseña con token
 * POST /api/reset-password
 */
const resetPassword = async (req, res) => {
  const { token, nuevaPassword } = req.body;

  if (!token || !nuevaPassword) {
    return res.status(400).json({
      success: false,
      message: "Token y nuevaPassword son requeridos",
    });
  }

  try {
    const tokenResult = await db.query(
      `SELECT TokenID, ClienteID, AgenteID, ExpiraEn
       FROM passwordresettokens
       WHERE Token = $1`,
      [token]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Token inválido o expirado",
      });
    }

    const tokenRow = tokenResult.rows[0];
    if (new Date(tokenRow.expiraen) <= new Date()) {
      await db.query("DELETE FROM passwordresettokens WHERE TokenID = $1", [
        tokenRow.tokenid,
      ]);
      return res.status(400).json({
        success: false,
        message: "Token inválido o expirado",
      });
    }

    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS, 10) || 10;
    const hashedPassword = await bcrypt.hash(nuevaPassword, saltRounds);

    if (tokenRow.clienteid) {
      await db.query(
        "UPDATE clientes SET passwordhash = $1 WHERE clienteid = $2",
        [hashedPassword, tokenRow.clienteid]
      );
    } else if (tokenRow.agenteid) {
      await db.query(
        "UPDATE agentesdeventas SET PasswordHash = $1 WHERE AgenteID = $2",
        [hashedPassword, tokenRow.agenteid]
      );
    }

    await db.query("DELETE FROM passwordresettokens WHERE TokenID = $1", [
      tokenRow.tokenid,
    ]);

    return res.status(200).json({
      success: true,
      message: "Contraseña actualizada correctamente",
    });
  } catch (error) {
    logger.error('Error en reset-password:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "Error al restablecer la contraseña",
    });
  }
};

module.exports = {
  registroCliente,
  login,
  verifyCliente,
  forgotPassword,
  resetPassword,
};
