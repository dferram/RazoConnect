const db = require("../../db");
const logger = require('../../utils/logger');
const { generateToken } = require("../../utils/jwtHelper");

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

    const { userId, id, rol } = req.user;
    let userData = {};

    const efectiveUserId = userId || id;
    const userRole = rol; // Usar directamente el rol normalizado del middleware

    switch (userRole) {
      case "super_admin":
      case "admin":
        const { tenant_id: admin_tenant_id } = req.tenant;
        const adminQuery = `
          SELECT
            AdminID,
            Nombre,
            Email,
            Rol
          FROM administradores
          WHERE AdminID = $1 AND tenant_id = $2
        `;
        const adminResult = await db.query(adminQuery, [efectiveUserId, admin_tenant_id]);

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
          rol: admin.rol === "superadmin" ? "Super Admin" : "Admin",
          iniciales: getIniciales(admin.nombre),
          tipo: "admin",
        };
        break;

      case "agente":
        const { tenant_id: agente_tenant_id } = req.tenant;
        const agenteQuery = `
          SELECT
            AgenteID,
            Nombre,
            Apellido,
            Email,
            CodigoAgente
          FROM agentesdeventas
          WHERE AgenteID = $1 AND tenant_id = $2
        `;
        const agenteResult = await db.query(agenteQuery, [efectiveUserId, agente_tenant_id]);

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
        const { tenant_id } = req.tenant;
        const clienteQuery = `
          SELECT
            c.ClienteID,
            c.Nombre,
            c.Apellido,
            c.Email,
            c.AgenteID,
            c.estado_id,
            e.nombre as estado_nombre
          FROM clientes c
          LEFT JOIN estados e ON c.estado_id = e.estadoid
          WHERE c.ClienteID = $1 AND c.tenant_id = $2
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
          nombre: nombreCliente,
          email: cliente.email,
          rol: "Cliente",
          iniciales: getIniciales(nombreCliente),
          tipo: "cliente",
          empresa: null,
          agenteid: cliente.agenteid,
          estadoId: cliente.estado_id,
          estadoNombre: cliente.estado_nombre,
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
    logger.error('Error al obtener perfil del usuario:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error al obtener información del usuario"
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

/**
 * Callback de Google OAuth
 * GET /auth/google/callback
 */
const googleCallback = async (req, res) => {
  try {
    if (!req.user) {
      return res.redirect("/login.html?error=google_auth_failed");
    }

    const { clienteId, nombre, apellido, email, avatarUrl, tenant_id } = req.user;

    if (!clienteId || !email) {
      return res.redirect("/login.html?error=google_auth_invalid_user");
    }

    if (!tenant_id) {
      return res.redirect("/login.html?error=google_auth_no_tenant");
    }

    const token = generateToken({
      userId: clienteId,
      rol: "cliente",
      email,
      tenant_id: tenant_id,
    }, '365d');

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
          logger.error('Error enviando mensaje a la ventana padre:', {
      error: err.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
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
    logger.error('Error en callback de Google OAuth:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.redirect("/login.html?error=google_auth_internal");
  }
};

module.exports = {
  getCurrentUser,
  googleCallback,
};
