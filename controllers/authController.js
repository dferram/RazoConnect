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

/**
 * Registro de nuevo cliente
 * POST /api/registro/cliente
 */
const registroCliente = async (req, res) => {
  try {
    const { Nombre, Apellido, Email, Password, Telefono } = req.body;

    // Validar datos de entrada
    const validation = validateClienteRegistro({
      Nombre,
      Apellido,
      Email,
      Password,
    });
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: "Error de validación",
        errors: validation.errors,
      });
    }

    // Verificar si el email ya existe
    const emailExists = await db.query(
      "SELECT Email FROM clientes WHERE Email = $1",
      [Email]
    );

    if (emailExists.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: "El email ya está registrado",
      });
    }

    // Hashear la contraseña
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 10;
    const PasswordHash = await bcrypt.hash(Password, saltRounds);

    // Insertar nuevo cliente
    const result = await db.query(
      `INSERT INTO clientes (Nombre, Apellido, Email, PasswordHash, Telefono)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ClienteID, Nombre, Apellido, Email, Telefono, FechaDeRegistro`,
      [Nombre, Apellido, Email, PasswordHash, Telefono || null]
    );

    const nuevoCliente = result.rows[0];

    // Generar token JWT
    const token = generateToken({
      userId: nuevoCliente.clienteid,
      rol: "cliente",
      email: nuevoCliente.email,
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
    const { Nombre, Apellido, Email, Password } = req.body;

    // Validar datos de entrada
    const validation = validateAgenteRegistro({
      Nombre,
      Apellido,
      Email,
      Password,
    });
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: "Error de validación",
        errors: validation.errors,
      });
    }

    // Verificar si el email ya existe
    const emailExists = await db.query(
      "SELECT Email FROM agentesdeventas WHERE Email = $1",
      [Email]
    );

    if (emailExists.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: "El email ya está registrado",
      });
    }

    // Hashear la contraseña
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 10;
    const PasswordHash = await bcrypt.hash(Password, saltRounds);

    const CodigoAgente = await generateCodigoAgente(db);

    // Insertar nuevo agente
    const result = await db.query(
      `INSERT INTO agentesdeventas (Nombre, Apellido, Email, PasswordHash, CodigoAgente, Activo)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING AgenteID, Nombre, Apellido, Email, CodigoAgente, Activo`,
      [Nombre, Apellido, Email, PasswordHash, CodigoAgente]
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
    const { Email, Password } = req.body;

    // Validar datos de entrada
    const validation = validateLogin({ Email, Password });
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: "Error de validación",
        errors: validation.errors,
      });
    }

    // Buscar en la tabla de Clientes
    const clienteResult = await db.query(
      "SELECT ClienteID, Nombre, Apellido, Email, PasswordHash, Telefono FROM clientes WHERE Email = $1",
      [Email]
    );

    if (clienteResult.rows.length > 0) {
      const cliente = clienteResult.rows[0];

      // Verificar contraseña
      const passwordMatch = await bcrypt.compare(
        Password,
        cliente.passwordhash
      );

      if (!passwordMatch) {
        return res.status(401).json({
          success: false,
          message: "Credenciales inválidas",
        });
      }

      // Generar token JWT
      const token = generateToken({
        userId: cliente.clienteid,
        rol: "cliente",
        email: cliente.email,
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

    // Si no es cliente, buscar en la tabla de AgentesDeVentas
    const agenteResult = await db.query(
      "SELECT AgenteID, Nombre, Apellido, Email, PasswordHash, CodigoAgente, Activo FROM agentesdeventas WHERE Email = $1",
      [Email]
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
      const passwordMatch = await bcrypt.compare(Password, agente.passwordhash);

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
    console.log("🔍 req.user completo:", req.user);
    const userId = req.user.userId;
    const userRol = req.user.rol;
    console.log("🔍 userId extraído:", userId, "rol:", userRol);

    // Si es agente, buscar en la tabla de agentes
    if (userRol === "agente") {
      const agenteResult = await db.query(
        `SELECT AgenteID, Nombre, Apellido, Email, CodigoAgente, Activo
         FROM agentesdeventas
         WHERE AgenteID = $1 AND Activo = TRUE`,
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

    // Si es cliente, buscar en la tabla de clientes
    const result = await db.query(
      `SELECT ClienteID, Nombre, Apellido, Email, Telefono, FechaDeRegistro
       FROM clientes
       WHERE ClienteID = $1`,
      [userId]
    );
    console.log("🔍 Resultado query:", result.rows);

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

    // Verificar que el cliente aún existe y está activo
    const result = await db.query(
      `SELECT ClienteID FROM clientes WHERE ClienteID = $1`,
      [clienteId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Cliente no encontrado",
      });
    }

    // Generar un nuevo token con el mismo payload
    const newToken = generateToken({
      userId: clienteId,
      rol: "cliente",
      email: email,
    });

    console.log("🔄 Token de cliente renovado:", { clienteId, email });

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
      message: "El email es requerido",
    });
  }

  const genericResponse = {
    success: true,
    message:
      "Si el email está registrado, recibirás instrucciones para restablecer tu contraseña.",
  };

  try {
    const clienteResult = await db.query(
      "SELECT ClienteID, Nombre FROM clientes WHERE Email = $1",
      [email]
    );

    const agenteResult =
      clienteResult.rows.length === 0
        ? await db.query(
            "SELECT AgenteID, Nombre FROM agentesdeventas WHERE Email = $1",
            [email]
          )
        : { rows: [] };

    if (clienteResult.rows.length === 0 && agenteResult.rows.length === 0) {
      return res.status(200).json(genericResponse);
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiration = new Date(Date.now() + 60 * 60 * 1000);

    const clienteId = clienteResult.rows[0]?.clienteid || null;
    const agenteId = agenteResult.rows[0]?.agenteid || null;

    await db.query(
      `INSERT INTO passwordresettokens (Token, ClienteID, AgenteID, ExpiraEn)
       VALUES ($1, $2, $3, $4)`,
      [token, clienteId, agenteId, expiration]
    );

    const resetLink = `${
      process.env.FRONTEND_BASE_URL || "https://tusitio.com"
    }/reset-password.html?token=${token}`;
    const nombre =
      clienteResult.rows[0]?.nombre ||
      agenteResult.rows[0]?.nombre ||
      "cliente";
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

    enviarEmail(email, asunto, cuerpoHtml).catch((err) => {
      console.error("Error enviando correo de reseteo:", err);
    });

    return res.status(200).json(genericResponse);
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

    // Verificar si el email ya existe
    const emailExists = await db.query(
      "SELECT Email FROM administradores WHERE Email = $1",
      [Email]
    );

    if (emailExists.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: "El email ya está registrado como administrador",
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

    // Verificar si el email ya existe
    const emailExists = await db.query(
      "SELECT Email FROM administradores WHERE Email = $1",
      [email]
    );

    if (emailExists.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: "El email ya está registrado como administrador",
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

        // Log de auditoría
        console.log(
          `✅ Super-admin ${req.user.email} creó nuevo admin: ${nuevoAdmin.email} con rol: ${nuevoAdmin.rol} (auto-aprobado)`
        );

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
          rol: admin.rol === "superadmin" ? "Super Administrador" : "Administrador",
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
        // Consultar tabla Clientes
        const clienteQuery = `
          SELECT 
            ClienteID,
            Nombre,
            Apellido,
            Email,
            NombreEmpresa
          FROM clientes
          WHERE ClienteID = $1
        `;
        const clienteResult = await db.query(clienteQuery, [efectiveUserId]);

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

    const frontendBase =
      process.env.FRONTEND_BASE_URL ||
      `http://localhost:${process.env.PORT || 3000}`;

    let redirectUrl;

    try {
      const url = new URL("/login.html", frontendBase);
      url.searchParams.set("googleToken", token);
      if (nombre) url.searchParams.set("nombre", nombre);
      if (apellido) url.searchParams.set("apellido", apellido);
      if (email) url.searchParams.set("email", email);
      if (avatarUrl) url.searchParams.set("avatarUrl", avatarUrl);
      url.searchParams.set("provider", "google");
      redirectUrl = url.toString();
    } catch (e) {
      redirectUrl = "/login.html?googleToken=" + encodeURIComponent(token);
    }

    return res.redirect(redirectUrl);
  } catch (error) {
    console.error("Error en callback de Google OAuth:", error);
    return res.redirect("/login.html?error=google_auth_internal");
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
};
