const bcrypt = require("bcrypt");
const db = require("../db");
const { generateToken } = require("../utils/jwtHelper");
const crypto = require("crypto");
const { enviarEmail } = require("../services/emailService");
const {
  crearNotificacion,
} = require("../services/notificacionesService");
const {
  validateClienteRegistro,
  validateAgenteRegistro,
  validateLogin,
} = require("../utils/validator");
const { generateCodigoAgente } = require("../utils/agentCode");
const { registrarLog } = require("../services/loggerService");
const {
  solicitarCambio,
  aprobarSolicitudes,
} = require("../services/ChangeRequestService");
const auditService = require("../services/auditService");
const {
  checkEmailGlobalUniqueness,
  getContextualErrorMessage,
} = require("../utils/emailValidator");

/**
 * Registro de nuevo cliente
 * POST /api/registro/cliente
 */
const registroCliente = async (req, res) => {
  try {
    let { Nombre, Apellido, Email, Password, Telefono } = req.body;

    // Normalizar valores vacíos a null
    Email = Email && Email.trim() !== "" ? Email.trim() : null;
    Telefono = Telefono && Telefono.trim() !== "" ? Telefono.trim() : null;

    // Validar campos obligatorios
    const errors = [];
    if (!Nombre || Nombre.trim() === "") errors.push("El nombre es requerido");
    if (!Apellido || Apellido.trim() === "") errors.push("El apellido es requerido");
    if (!Password || Password.trim() === "") errors.push("La contraseña es requerida");
    if (Password && Password.length < 6) errors.push("La contraseña debe tener al menos 6 caracteres");

    // Validar que al menos uno de los dos (email o teléfono) esté presente
    if (!Email && !Telefono) {
      errors.push("Debes proporcionar al menos un medio de contacto (correo o teléfono)");
    }

    // Validar formato de email si se proporcionó
    if (Email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(Email)) {
        errors.push("El formato del correo electrónico es inválido");
      }
    }

    // Validar formato de teléfono si se proporcionó
    if (Telefono) {
      if (Telefono.length < 10 || !/^\d+$/.test(Telefono)) {
        errors.push("El teléfono debe contener al menos 10 dígitos numéricos");
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Error de validación",
        errors,
      });
    }

    // Obtener tenant_id del middleware
    const { tenant_id } = req.tenant;

    // Verificar unicidad del email dentro del tenant (solo si se proporcionó)
    if (Email) {
      const emailCheck = await db.query(
        "SELECT ClienteID FROM clientes WHERE Email = $1 AND tenant_id = $2",
        [Email, tenant_id]
      );

      if (emailCheck.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Este correo electrónico ya está registrado.",
        });
      }
    }

    // Verificar unicidad del teléfono dentro del tenant (solo si se proporcionó)
    if (Telefono) {
      const telefonoCheck = await db.query(
        "SELECT clienteid FROM clientes WHERE telefono = $1 AND tenant_id = $2",
        [Telefono, tenant_id]
      );

      if (telefonoCheck.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Este número de teléfono ya está registrado en el sistema.",
        });
      }
    }

    // Hashear la contraseña
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 10;
    const PasswordHash = await bcrypt.hash(Password, saltRounds);

    // Insertar nuevo cliente (con valores null si no se proporcionaron)
    const result = await db.query(
      `INSERT INTO clientes (nombre, apellido, email, passwordhash, telefono, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING clienteid, nombre, apellido, email, telefono, fechaderegistro`,
      [Nombre.trim(), Apellido.trim(), Email, PasswordHash, Telefono, tenant_id]
    );

    const nuevoCliente = result.rows[0];

    // Generar token JWT (defensive: ensure email is never undefined)
    const token = generateToken({
      userId: nuevoCliente.clienteid,
      rol: "cliente",
      email: nuevoCliente.email || null,
    });

    try {
      await crearNotificacion(
        nuevoCliente.clienteid,
        "general",
        "¡Bienvenido a RazoConnect!",
        "Gracias por unirte. Tu cuenta ha sido creada exitosamente."
      );
    } catch (notificacionError) {
      console.error(
        "No se pudo crear la notificación de bienvenida:",
        notificacionError
      );
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
          fechaDeRegistro: nuevoCliente.fechaderegistro,
        },
        token,
      },
    });
  } catch (error) {
    console.error("Error en registro de cliente:", error);
    res.status(500).json({
      success: false,
      message: "Error al registrar el cliente",
      error: error.message,
    });
  }
};

/**
 * Registro de nuevo agente de ventas
 * POST /api/registro/agente
 */
const registroAgente = async (req, res) => {
  try {
    const { nombre, apellido, email, password } = req.body;

    // Validar datos de entrada
    const validation = validateAgenteRegistro({
      nombre,
      apellido,
      email,
      password,
    });
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: "Error de validación",
        errors: validation.errors,
      });
    }

    // Verificar unicidad global del email (no debe existir en ninguna tabla)
    const emailCheck = await checkEmailGlobalUniqueness(email, "agentesdeventas");

    if (emailCheck.exists) {
      const errorMessage = getContextualErrorMessage(
        emailCheck.table,
        "agentesdeventas"
      );
      return res.status(400).json({
        success: false,
        message: errorMessage,
      });
    }

    // Hashear la contraseña
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const codigoAgente = await generateCodigoAgente(db);

    // Insertar nuevo agente
    const result = await db.query(
      `INSERT INTO agentesdeventas (nombre, apellido, email, passwordhash, codigoagente, activo)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING agenteid, nombre, apellido, email, codigoagente, activo`,
      [nombre, apellido, email, passwordHash, codigoAgente]
    );

    const nuevoAgente = result.rows[0];

    // Generar token JWT
    const token = generateToken({
      userId: nuevoAgente.agenteid,
      rol: "agente",
      roles: ["agente"],
      email: nuevoAgente.email,
      codigoAgente: nuevoAgente.codigoagente,
    });

    res.status(201).json({
      success: true,
      message: "Agente registrado exitosamente",
      data: {
        agente: {
          agenteId: nuevoAgente.agenteid,
          nombre: nuevoAgente.nombre,
          apellido: nuevoAgente.apellido,
          email: nuevoAgente.email,
          codigoAgente: nuevoAgente.codigoagente,
          activo: nuevoAgente.activo,
        },
        token,
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

/**
 * Login de usuario (cliente o agente)
 * POST /api/login
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const identifier = email; // Email puede ser correo o teléfono

    // Validar datos de entrada
    const validation = validateLogin({ email: identifier, password });
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: "Error de validación",
        errors: validation.errors,
      });
    }

    // Obtener tenant_id del middleware
    const { tenant_id } = req.tenant;

    // Buscar en la tabla de Clientes (por email O teléfono Y tenant_id)
    const clienteResult = await db.query(
      "SELECT clienteid, nombre, apellido, email, passwordhash, telefono FROM clientes WHERE (email = $1 OR telefono = $1) AND tenant_id = $2",
      [identifier, tenant_id]
    );

    if (clienteResult.rows.length > 0) {
      const cliente = clienteResult.rows[0];

      // Verificar contraseña
      const passwordMatch = await bcrypt.compare(
        password,
        cliente.passwordhash
      );

      if (!passwordMatch) {
        return res.status(401).json({
          success: false,
          message: "Credenciales inválidas",
        });
      }

      // Generar token JWT (defensive: ensure email is never undefined)
      const token = generateToken({
        userId: cliente.clienteid,
        rol: "cliente",
        email: cliente.email || null,
      });

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
          token,
        },
      });
    }

    // Si no es cliente, buscar en la tabla de AgentesDeVentas (solo por email)
    const agenteResult = await db.query(
      "SELECT agenteid, nombre, apellido, email, passwordhash, codigoagente, activo FROM agentesdeventas WHERE email = $1 AND tenant_id = $2",
      [identifier, tenant_id]
    );

    if (agenteResult.rows.length > 0) {
      const agente = agenteResult.rows[0];

      // Verificar si el agente está activo
      if (!agente.activo) {
        return res.status(403).json({
          success: false,
          message: "La cuenta del agente está inactiva",
        });
      }

      // Verificar contraseña
      const passwordMatch = await bcrypt.compare(password, agente.passwordhash);

      if (!passwordMatch) {
        return res.status(401).json({
          success: false,
          message: "Credenciales inválidas",
        });
      }

      // Generar token JWT
      const token = generateToken({
        userId: agente.agenteid,
        rol: "agente",
        roles: ["agente"],
        email: agente.email,
        codigoAgente: agente.codigoagente,
      });

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
            codigoAgente: agente.codigoagente,
            activo: agente.activo,
          },
          token,
        },
      });
    }

    // Si no se encontró ni como cliente ni como agente
    res.status(401).json({
      success: false,
      message: "Credenciales inválidas",
    });
  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({
      success: false,
      message: "Error al iniciar sesión",
      error: error.message,
    });
  }
};

/**
 * Verificar token de cliente
 * GET /api/clientes/verify
 */
const verifyCliente = async (req, res) => {
  try {
    // El middleware authenticate ya verificó el token y agregó req.user
    const userId = req.user.userId;
    const userRol = req.user.rol;

    // Si es agente, buscar en la tabla de agentes
    if (userRol === "agente") {
      const agenteResult = await db.query(
        `SELECT agenteid, nombre, apellido, email, codigoagente, activo
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
            codigoAgente: agente.codigoagente,
            activo: agente.activo,
          },
        },
      });
    }

    // Si es cliente, buscar en la tabla de clientes (filtrado por tenant)
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
    console.error("Error verifying cliente:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * Renovar token de cliente
 * POST /api/clientes/refresh-token
 */
const refreshClienteToken = async (req, res) => {
  try {
    // El middleware authenticate ya verificó el token actual
    const clienteId = req.user.userId;
    const email = req.user.email;

    // Verificar que el cliente aún existe y está activo (filtrado por tenant)
    const { tenant_id } = req.tenant;
    const result = await db.query(
      `SELECT clienteid FROM clientes WHERE clienteid = $1 AND tenant_id = $2 AND activo = TRUE`,
      [clienteId, tenant_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Cliente no encontrado",
      });
    }

    // Generar un nuevo token con el mismo payload (defensive: ensure email is never undefined)
    const newToken = generateToken({
      userId: clienteId,
      rol: "cliente",
      email: email || null,
    });

    res.json({
      success: true,
      message: "Token renovado exitosamente",
      data: {
        token: newToken,
      },
    });
  } catch (error) {
    console.error("Error refreshing cliente token:", error);
    res.status(500).json({
      success: false,
      message: "Error al renovar token",
    });
  }
};

const forgotPassword = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: "El email o teléfono es requerido",
    });
  }

  try {
    // Obtener tenant_id del middleware
    const { tenant_id } = req.tenant;

    // Buscar por email o teléfono en clientes (filtrado por tenant)
    const clienteResult = await db.query(
      "SELECT clienteid, nombre, email, telefono FROM clientes WHERE (email = $1 OR telefono = $1) AND tenant_id = $2",
      [email, tenant_id]
    );

    // Buscar por email en agentes (agentes no tienen columna telefono)
    const agenteResult =
      clienteResult.rows.length === 0
        ? await db.query(
            "SELECT agenteid, nombre, email FROM agentesdeventas WHERE email = $1 AND tenant_id = $2",
            [email, tenant_id]
          )
        : { rows: [] };

    // Caso C: Usuario no encontrado
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

    // Caso B: Solo tiene teléfono (email es null) - solo aplica para clientes
    if (!usuario.email && clienteId) {
      return res.status(200).json({
        success: true,
        status: "phone_only",
        telefono: usuario.telefono || null,
        message: "Tu cuenta está registrada solo con teléfono. Contáctanos para recuperarla.",
      });
    }

    // Caso A: Tiene email - generar token y enviar correo
    const token = crypto.randomBytes(32).toString("hex");
    const expiration = new Date(Date.now() + 60 * 60 * 1000);

    await db.query(
      `INSERT INTO passwordresettokens (Token, ClienteID, AgenteID, ExpiraEn)
       VALUES ($1, $2, $3, $4)`,
      [token, clienteId, agenteId, expiration]
    );

    const resetLink = `${
      process.env.FRONTEND_BASE_URL || "http://localhost:3000"
    }/reset-password.html?token=${token}`;
    const nombre = usuario.nombre || "usuario";
    const asunto = "Instrucciones para restablecer tu contraseña";
    const cuerpoHtml = `
      <div style="font-family: Arial, sans-serif; color: #1f2937;">
        <h2 style="color:#0ea5e9;">Hola ${nombre}</h2>
        <p>Recibimos una solicitud para restablecer tu contraseña.</p>
        <p>Puedes continuar haciendo clic en el siguiente enlace:</p>
        <p><a href="${resetLink}" style="color:#f97316;">Restablecer contraseña</a></p>
        <p>El enlace expira en 1 hora. Si no solicitaste el cambio, ignora este correo.</p>
        <p style="margin-top: 1.5rem;">Equipo RazoConnect</p>
      </div>
    `;

    enviarEmail(usuario.email, asunto, cuerpoHtml).catch((err) => {
      console.error("Error enviando correo de reseteo:", err);
    });

    return res.status(200).json({
      success: true,
      status: "email_sent",
      message: "Hemos enviado las instrucciones a tu correo electrónico.",
    });
  } catch (error) {
    console.error("Error en forgot-password:", error);
    return res.status(500).json({
      success: false,
      message: "Error al iniciar proceso de recuperación",
    });
  }
};

/**
 * Registro de nuevo administrador (protegido por SUPER_ADMIN_KEY)
 * POST /api/auth/registro-admin
 */
const registroAdmin = async (req, res) => {
  try {
    const { Nombre, Apellido, Email, Password, Rol, adminKey } = req.body;

    // Validar clave maestra
    const superAdminKey = process.env.SUPER_ADMIN_KEY;
    if (!superAdminKey) {
      console.error("SUPER_ADMIN_KEY no está configurada en .env");
      return res.status(500).json({
        success: false,
        message: "Error de configuración del servidor",
      });
    }

    if (!adminKey || adminKey !== superAdminKey) {
      return res.status(403).json({
        success: false,
        message: "Clave de autorización inválida",
      });
    }

    // Validar campos requeridos
    const errors = [];
    if (!Nombre || !Nombre.trim()) errors.push("El nombre es requerido");
    if (!Apellido || !Apellido.trim()) errors.push("El apellido es requerido");
    if (!Email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(Email))
      errors.push("El email no es válido");
    if (!Password || Password.length < 6)
      errors.push("La contraseña debe tener al menos 6 caracteres");

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Error de validación",
        errors,
      });
    }

    // Verificar unicidad global del email (no debe existir en ninguna tabla)
    const emailCheck = await checkEmailGlobalUniqueness(Email, "administradores");

    if (emailCheck.exists) {
      const errorMessage = getContextualErrorMessage(
        emailCheck.table,
        "administradores"
      );
      return res.status(400).json({
        success: false,
        message: errorMessage,
      });
    }

    // Hashear la contraseña
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 10;
    const PasswordHash = await bcrypt.hash(Password, saltRounds);

    // Insertar nuevo administrador
    const rolFinal =
      Rol && ["admin", "superadmin"].includes(Rol) ? Rol : "admin";
    const result = await db.query(
      `INSERT INTO administradores (Nombre, Apellido, Email, PasswordHash, Rol, Activo)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING AdminID, Nombre, Apellido, Email, Rol`,
      [Nombre.trim(), Apellido.trim(), Email, PasswordHash, rolFinal]
    );

    const nuevoAdmin = result.rows[0];

    res.status(201).json({
      success: true,
      message: "Administrador registrado exitosamente",
      data: {
        admin: {
          adminId: nuevoAdmin.adminid,
          nombre: nuevoAdmin.nombre,
          apellido: nuevoAdmin.apellido,
          email: nuevoAdmin.email,
          rol: nuevoAdmin.rol,
        },
      },
    });

    // Registrar log de creación de administrador (vía registro-admin con SUPER_ADMIN_KEY)
    try {
      registrarLog(req, "CREAR", "Administrador", nuevoAdmin.adminid, {
        nombre: nuevoAdmin.nombre,
        apellido: nuevoAdmin.apellido,
        email: nuevoAdmin.email,
        rol: nuevoAdmin.rol,
        origen: "registro-admin",
      }).catch((err) => {
        console.error("Error guardando log de CREAR Administrador (registroAdmin):", err);
      });
    } catch (logError) {
      console.error(
        "Error interno al preparar log de CREAR Administrador (registroAdmin):",
        logError
      );
    }
  } catch (error) {
    console.error("Error en registro de administrador:", error);
    res.status(500).json({
      success: false,
      message: "Error al registrar el administrador",
      error: error.message,
    });
  }
};

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
        "UPDATE clientes SET PasswordHash = $1 WHERE ClienteID = $2",
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
    console.error("Error en reset-password:", error);
    return res.status(500).json({
      success: false,
      message: "Error al restablecer la contraseña",
    });
  }
};

/**
 * Creación de nuevo administrador (protegido por middleware authorizeSuperAdmin)
 * POST /api/admin/crear-admin
 * Solo accesible por super-administradores autenticados
 */
const crearAdmin = async (req, res) => {
  try {
    const { nombre, email, password, rol } = req.body;

    // Validar campos requeridos
    const errors = [];
    if (!nombre || !nombre.trim()) errors.push("El nombre es requerido");
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      errors.push("El email no es válido");
    if (!password || password.length < 6)
      errors.push("La contraseña debe tener al menos 6 caracteres");

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Error de validación",
        errors,
      });
    }

    // Verificar unicidad global del email (no debe existir en ninguna tabla)
    const emailCheck = await checkEmailGlobalUniqueness(email, "administradores");

    if (emailCheck.exists) {
      const errorMessage = getContextualErrorMessage(
        emailCheck.table,
        "administradores"
      );
      return res.status(400).json({
        success: false,
        message: errorMessage,
      });
    }

    // Hashear la contraseña
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 10;
    const PasswordHash = await bcrypt.hash(password, saltRounds);

    // Validar y asignar rol (solo 'admin' o 'superadmin' permitidos)
    const rolesValidos = ["admin", "superadmin", "super-admin"];
    let rolFinal = "admin"; // Por defecto

    if (rol && rolesValidos.includes(rol.toLowerCase())) {
      // Normalizar 'super-admin' a 'superadmin'
      rolFinal =
        rol.toLowerCase() === "super-admin" ? "superadmin" : rol.toLowerCase();
    }

    const rolUsuario = (req?.user?.rol || "").toString().trim().toLowerCase();
    const allowDirect = rolUsuario === "admin" || rolUsuario === "superadmin";

    if (allowDirect) {
      const insertRes = await db.query(
        `INSERT INTO administradores (Nombre, Apellido, Email, PasswordHash, Rol, Activo)
         VALUES ($1, $2, $3, $4, $5, TRUE)
         RETURNING AdminID, Nombre, Apellido, Email, Rol, Activo`,
        [nombre.trim(), "", email, PasswordHash, rolFinal]
      );

      const row = insertRes.rows[0];

      await auditService.registrarCambioPasivo(
        req,
        "admins",
        row.adminid,
        "INSERT",
        null,
        {
          adminid: row.adminid,
          nombre: row.nombre,
          apellido: row.apellido,
          email: row.email,
          rol: row.rol,
          activo: row.activo,
        }
      );

      return res.status(201).json({
        success: true,
        message: "Administrador creado correctamente.",
        data: {
          admin: {
            adminId: row.adminid,
            nombre: row.nombre,
            apellido: row.apellido,
            email: row.email,
            rol: row.rol,
          },
          solicitudId: null,
        },
      });
    }

    // Estrategia Pura: registrar solicitud de creación en control_cambios
    const datosNuevosAdmin = {
      Nombre: nombre.trim(),
      Apellido: "",
      Email: email,
      PasswordHash,
      Rol: rolFinal,
      Activo: true,
    };

    const resultado = await solicitarCambio(
      req,
      "admins",
      null,
      "INSERT",
      datosNuevosAdmin,
      null
    );

    const isSuperAdmin =
      req.user &&
      (req.user.rol === "superadmin" || req.user.tipo === "superadmin");

    if (isSuperAdmin) {
      try {
        await aprobarSolicitudes([resultado.solicitudId], req.user.id);

        const adminResult = await db.query(
          `SELECT AdminID, Nombre, Apellido, Email, Rol
           FROM administradores
           WHERE Email = $1`,
          [email]
        );

        const nuevoAdmin = adminResult.rows[0] || null;

        if (!nuevoAdmin) {
          throw new Error(
            "No se pudo recuperar el administrador después de la auto-aprobación"
          );
        }

        res.status(201).json({
          success: true,
          message: "Administrador creado correctamente (auto-aprobado)",
          data: {
            admin: {
              adminId: nuevoAdmin.adminid,
              nombre: nuevoAdmin.nombre,
              apellido: nuevoAdmin.apellido,
              email: nuevoAdmin.email,
              rol: nuevoAdmin.rol,
            },
            solicitudId: resultado.solicitudId,
          },
        });

        try {
          registrarLog(req, "CREAR", "Administrador", nuevoAdmin.adminid, {
            nombre: nuevoAdmin.nombre,
            apellido: nuevoAdmin.apellido,
            email: nuevoAdmin.email,
            rol: nuevoAdmin.rol,
            origen: "crear-admin",
            creadoPor: req.user?.email || null,
          }).catch((err) => {
            console.error(
              "Error guardando log de CREAR Administrador (crearAdmin):",
              err
            );
          });
        } catch (logError) {
          console.error(
            "Error interno al preparar log de CREAR Administrador (crearAdmin):",
            logError
          );
        }
      } catch (autoError) {
        console.error("Error en auto-aprobación de crearAdmin:", autoError);
        return res.status(500).json({
          success: false,
          message:
            "La solicitud de cambio se registró, pero ocurrió un error al aplicar la auto-aprobación.",
          error: autoError.message,
          data: {
            solicitudId: resultado.solicitudId,
          },
        });
      }
    } else {
      // En la práctica este endpoint está protegido por authorizeSuperAdmin,
      // pero dejamos esta rama por robustez.
      return res.status(201).json({
        success: true,
        message: resultado.mensaje,
        data: {
          solicitudId: resultado.solicitudId,
          estado: resultado.estado,
        },
      });
    }
  } catch (error) {
    console.error("Error al crear administrador:", error);
    res.status(500).json({
      success: false,
      message: "Error al crear el administrador",
      error: error.message,
    });
  }
};

/**
 * Obtener información del usuario actual
 * GET /api/auth/me
 * Endpoint unificado para obtener datos del perfil según el rol
 */
const getCurrentUser = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "No autenticado",
      });
    }

    const { userId, id, rol, tipo, roles } = req.user;
    let userData = {};

    // userId puede venir como 'userId' o 'id' dependiendo del tipo de login
    const efectiveUserId = userId || id;

    // Determinar el rol efectivo
    const userRole = tipo || rol || (Array.isArray(roles) ? roles[0] : null);

    switch (userRole) {
      case "admin":
        // Consultar tabla Administradores
        const adminQuery = `
          SELECT 
            AdminID,
            Nombre,
            Email,
            Rol
          FROM administradores
          WHERE AdminID = $1
        `;
        const adminResult = await db.query(adminQuery, [efectiveUserId]);

        if (adminResult.rows.length === 0) {
          return res.status(404).json({
            success: false,
            message: "Administrador no encontrado",
          });
        }

        const admin = adminResult.rows[0];
        userData = {
          nombre: admin.nombre,
          email: admin.email,
          // Normalizar etiqueta de rol para UI: siempre "Super Admin" o "Admin"
          rol: admin.rol === "superadmin" ? "Super Admin" : "Admin",
          iniciales: getIniciales(admin.nombre),
          tipo: "admin",
        };
        break;

      case "agente":
        // Consultar tabla AgentesDeVentas
        const agenteQuery = `
          SELECT 
            AgenteID,
            Nombre,
            Apellido,
            Email,
            CodigoAgente
          FROM agentesdeventas
          WHERE AgenteID = $1
        `;
        const agenteResult = await db.query(agenteQuery, [efectiveUserId]);

        if (agenteResult.rows.length === 0) {
          return res.status(404).json({
            success: false,
            message: "Agente no encontrado",
          });
        }

        const agente = agenteResult.rows[0];
        const nombreCompleto = `${agente.nombre} ${agente.apellido}`.trim();
        userData = {
          nombre: nombreCompleto,
          email: agente.email,
          rol: "Agente de Ventas",
          iniciales: getIniciales(nombreCompleto),
          tipo: "agente",
          codigoAgente: agente.codigoagente,
        };
        break;

      case "cliente":
        // Consultar tabla Clientes (filtrado por tenant)
        const { tenant_id } = req.tenant;
        const clienteQuery = `
          SELECT 
            ClienteID,
            Nombre,
            Apellido,
            Email,
            NombreEmpresa
          FROM clientes
          WHERE ClienteID = $1 AND tenant_id = $2
        `;
        const clienteResult = await db.query(clienteQuery, [efectiveUserId, tenant_id]);

        if (clienteResult.rows.length === 0) {
          return res.status(404).json({
            success: false,
            message: "Cliente no encontrado",
          });
        }

        const cliente = clienteResult.rows[0];
        const nombreCliente = `${cliente.nombre} ${cliente.apellido}`.trim();
        userData = {
          nombre: nombreCliente || cliente.nombreempresa,
          email: cliente.email,
          rol: cliente.nombreempresa ? "Cliente - " + cliente.nombreempresa : "Cliente",
          iniciales: getIniciales(nombreCliente || cliente.nombreempresa),
          tipo: "cliente",
          empresa: cliente.nombreempresa,
        };
        break;

      default:
        return res.status(400).json({
          success: false,
          message: "Rol de usuario no válido",
        });
    }

    res.json({
      success: true,
      data: userData,
    });
  } catch (error) {
    console.error("Error al obtener perfil del usuario:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener información del usuario",
      error: error.message,
    });
  }
};

/**
 * Genera iniciales a partir de un nombre completo
 * @param {string} nombre - Nombre completo
 * @returns {string} Iniciales (máximo 2 caracteres)
 */
function getIniciales(nombre) {
  if (!nombre) return "U";
  
  const palabras = nombre.trim().split(/\s+/);
  if (palabras.length === 1) {
    return palabras[0].substring(0, 2).toUpperCase();
  }
  
  return (palabras[0][0] + palabras[palabras.length - 1][0]).toUpperCase();
}

const googleCallback = async (req, res) => {
  try {
    if (!req.user) {
      return res.redirect("/login.html?error=google_auth_failed");
    }

    const { clienteId, nombre, apellido, email, avatarUrl } = req.user;

    if (!clienteId || !email) {
      return res.redirect("/login.html?error=google_auth_invalid_user");
    }

    const token = generateToken({
      userId: clienteId,
      rol: "cliente",
      email,
    });

    const userPayload = {
      nombre: nombre || "",
      apellido: apellido || "",
      email,
      rol: "cliente",
      avatarUrl: avatarUrl || null,
    };

    const safeToken = String(token).replace(/'/g, "\\'");
    const serializedUser = JSON.stringify(userPayload).replace(/</g, "\\u003c");

    const html = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <title>Autenticando...</title>
  </head>
  <body>
    <script>
      (function() {
        var payload = {
          type: 'GOOGLE_SUCCESS',
          token: '${safeToken}',
          user: ${serializedUser}
        };

        try {
          if (window.opener && !window.opener.closed) {
            var targetOrigin = window.location.origin || '*';
            window.opener.postMessage(payload, targetOrigin);
            window.close();
            return;
          }
        } catch (err) {
          console.error('Error enviando mensaje a la ventana padre:', err);
        }

        try {
          var params = new URLSearchParams();
          params.set('googleToken', payload.token);
          if (payload.user && payload.user.nombre) params.set('nombre', payload.user.nombre);
          if (payload.user && payload.user.apellido) params.set('apellido', payload.user.apellido);
          if (payload.user && payload.user.email) params.set('email', payload.user.email);
          if (payload.user && payload.user.avatarUrl) params.set('avatarUrl', payload.user.avatarUrl);
          params.set('provider', 'google');
          window.location.href = '/login.html?' + params.toString();
        } catch (e) {
          window.location.href = '/login.html?googleToken=' + encodeURIComponent(payload.token);
        }
      })();
    <\/script>
  </body>
</html>`;

    return res.status(200).send(html);
  } catch (error) {
    console.error("Error en callback de Google OAuth:", error);
    return res.redirect("/login.html?error=google_auth_internal");
  }
};

/**
 * Admin reset password for cliente
 * PUT /api/admin/clientes/:id/reset-password
 * Permite a un admin restablecer la contraseña de un cliente
 */
const adminResetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    // Validar que se proporcione la nueva contraseña
    if (!newPassword || newPassword.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'La nueva contraseña es requerida',
      });
    }

    // Validar longitud mínima
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'La contraseña debe tener al menos 6 caracteres',
      });
    }

    // Verificar que el cliente existe
    const clienteCheck = await db.query(
      'SELECT ClienteID, Nombre, Apellido FROM clientes WHERE ClienteID = $1',
      [id]
    );

    if (clienteCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cliente no encontrado',
      });
    }

    // Hashear la nueva contraseña
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Actualizar la contraseña en la base de datos
    await db.query(
      'UPDATE clientes SET PasswordHash = $1 WHERE ClienteID = $2',
      [hashedPassword, id]
    );

    // Registrar log de auditoría
    try {
      await registrarLog(
        req,
        'ACTUALIZAR',
        'Cliente',
        id,
        {
          accion: 'reset_password',
          adminId: req.user?.userId || req.user?.id,
          adminEmail: req.user?.email,
          clienteNombre: `${clienteCheck.rows[0].nombre} ${clienteCheck.rows[0].apellido}`,
        }
      );
    } catch (logError) {
      console.error('Error registrando log de reset password:', logError);
    }

    return res.status(200).json({
      success: true,
      message: 'Contraseña restablecida correctamente',
    });
  } catch (error) {
    console.error('Error en adminResetPassword:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al restablecer la contraseña',
      error: error.message,
    });
  }
};

module.exports = {
  registroCliente,
  registroAgente,
  registroAdmin,
  crearAdmin,
  login,
  verifyCliente,
  refreshClienteToken,
  forgotPassword,
  resetPassword,
  getCurrentUser,
  googleCallback,
  adminResetPassword,
};
