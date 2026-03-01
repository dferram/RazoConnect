const bcrypt = require("bcryptjs");
const logger = require('../../utils/logger');
const db = require("../../db");
const { registrarLog } = require("../../services/loggerService");
const { solicitarCambio, aprobarSolicitudes } = require("../../services/ChangeRequestService");
const auditService = require("../../services/auditService");
const { checkEmailGlobalUniqueness, getContextualErrorMessage } = require("../../utils/emailValidator");

/**
 * Registro de nuevo administrador (protegido por SUPER_ADMIN_KEY)
 * POST /api/auth/registro-admin
 */
const registroAdmin = async (req, res) => {
  try {
    const { Nombre, Apellido, Email, Password, Rol, adminKey } = req.body;

    const superAdminKey = process.env.SUPER_ADMIN_KEY;
    if (!superAdminKey) {
      logger.error('SUPER_ADMIN_KEY no está configurada en .env', {
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
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

    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 10;
    const PasswordHash = await bcrypt.hash(Password, saltRounds);

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

    try {
      registrarLog(req, "CREAR", "Administrador", nuevoAdmin.adminid, {
        nombre: nuevoAdmin.nombre,
        apellido: nuevoAdmin.apellido,
        email: nuevoAdmin.email,
        rol: nuevoAdmin.rol,
        origen: "registro-admin",
      }).catch((err) => {
        logger.error('Error guardando log de CREAR Administrador (registroAdmin):', {
      error: err.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
      });
    } catch (logError) {
      logger.error('Error interno al preparar log de CREAR Administrador (registroAdmin):', {
      error: logError.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    }
  } catch (error) {
    logger.error('Error en registro de administrador:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error al registrar el administrador"
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

    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 10;
    const PasswordHash = await bcrypt.hash(password, saltRounds);

    const rolesValidos = ["admin", "superadmin", "super-admin"];
    let rolFinal = "admin";

    if (rol && rolesValidos.includes(rol.toLowerCase())) {
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
            logger.error('Error guardando log de CREAR Administrador (crearAdmin):', {
      error: err.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
          });
        } catch (logError) {
          logger.error('Error interno al preparar log de CREAR Administrador (crearAdmin):', {
      error: logError.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
        }
      } catch (autoError) {
        logger.error('Error en auto-aprobación de crearAdmin:', {
      error: autoError.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
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
    logger.error('Error al crear administrador:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error al crear el administrador"
    });
  }
};

/**
 * Admin resetea contraseña de cliente
 * PUT /api/admin/clientes/:id/reset-password
 * Permite a un admin restablecer la contraseña de un cliente
 */
const adminResetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'La nueva contraseña es requerida',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'La contraseña debe tener al menos 6 caracteres',
      });
    }

    const { tenant_id } = req.tenant;

    const clienteCheck = await db.query(
      'SELECT ClienteID, Nombre, Apellido, tenant_id FROM clientes WHERE ClienteID = $1 AND tenant_id = $2',
      [id, tenant_id]
    );

    if (clienteCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cliente no encontrado',
      });
    }

    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    await db.query(
      'UPDATE clientes SET PasswordHash = $1 WHERE ClienteID = $2 AND tenant_id = $3',
      [hashedPassword, id, tenant_id]
    );

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
      logger.error('Error registrando log de reset password:', {
      error: logError.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    }

    return res.status(200).json({
      success: true,
      message: 'Contraseña restablecida correctamente',
    });
  } catch (error) {
    logger.error('Error en adminResetPassword:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: 'Error al restablecer la contraseña'
    });
  }
};

module.exports = {
  registroAdmin,
  crearAdmin,
  adminResetPassword,
};
