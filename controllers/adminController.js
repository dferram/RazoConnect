const db = require("../db");
const { enviarEmail } = require("../services/emailService");
const { checkStockBajo } = require("../utils/stockAlerts");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { generateCodigoAgente } = require("../utils/agentCode");

let agenteAdminColumnsCache = null;

const PEDIDO_ESTATUS_EMAIL_TEMPLATES = {
  Confirmado: {
    asunto: (pedidoId) => `¡Tu pedido #${pedidoId} ha sido confirmado!`,
    html: (nombre, pedidoId) => `
      <div style="font-family: Arial, sans-serif; color: #111827;">
        <h2 style="color:#16a34a;">¡Tu pedido está confirmado!</h2>
        <p>Hola ${nombre}, hemos confirmado tu pago y estamos preparando tu pedido.</p>
        <p>Pedido: <strong>#${pedidoId}</strong></p>
        <p style="margin-top: 1.5rem;">Equipo RazoConnect</p>
      </div>
    `,
  },
  Enviado: {
    asunto: (pedidoId) => `¡Tu pedido #${pedidoId} va en camino!`,
    html: (nombre, pedidoId) => `
      <div style="font-family: Arial, sans-serif; color: #111827;">
        <h2 style="color:#0ea5e9;">¡Tu pedido está en camino!</h2>
        <p>Hola ${nombre}, buenas noticias: tu pedido ha salido de nuestro almacén.</p>
        <p>Pedido: <strong>#${pedidoId}</strong></p>
        <p style="margin-top: 1.5rem;">Equipo RazoConnect</p>
      </div>
    `,
  },
  Cancelado: {
    asunto: (pedidoId) => `Actualización sobre tu pedido #${pedidoId}`,
    html: (nombre, pedidoId) => `
      <div style="font-family: Arial, sans-serif; color: #111827;">
        <h2 style="color:#dc2626;">Actualización de tu pedido</h2>
        <p>Hola ${nombre}, tu pedido ha sido cancelado. Si crees que es un error, contáctanos.</p>
        <p>Pedido: <strong>#${pedidoId}</strong></p>
        <p style="margin-top: 1.5rem;">Equipo RazoConnect</p>
      </div>
    `,
  },
};

const getAgenteAdminColumnsInfo = async () => {
  if (agenteAdminColumnsCache) {
    return agenteAdminColumnsCache;
  }

  try {
    const columnsResult = await db.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'agentesdeventas'
         AND column_name IN ('esadmin', 'adminrol')`
    );

    const found = columnsResult.rows.map((row) => row.column_name);
    agenteAdminColumnsCache = {
      esAdmin: found.includes("esadmin"),
      adminRol: found.includes("adminrol"),
    };

    if (!agenteAdminColumnsCache.esAdmin || !agenteAdminColumnsCache.adminRol) {
      console.warn(
        "⚠️  Columnas opcionales para admin de agentes no detectadas en AgentesDeVentas.",
        agenteAdminColumnsCache
      );
    }
  } catch (error) {
    console.error("Error verificando columnas de agentes admin:", error);
    agenteAdminColumnsCache = {
      esAdmin: false,
      adminRol: false,
    };
  }

  return agenteAdminColumnsCache;
};

/**
 * Login de administrador
 * POST /api/admin/login
 */
const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validar campos requeridos
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email y contraseña son requeridos",
      });
    }

    // Buscar administrador por email
    const result = await db.query(
      "SELECT * FROM Administradores WHERE Email = $1 AND Activo = TRUE",
      [email]
    );

    let cuenta = null;

    if (result.rows.length > 0) {
      const admin = result.rows[0];
      cuenta = {
        id: admin.adminid,
        email: admin.email,
        nombre: admin.nombre,
        apellido: admin.apellido || "",
        rol: admin.rol,
        passwordHash: admin.passwordhash,
        adminSource: "admin",
        roles: Array.from(new Set(["admin", admin.rol].filter(Boolean))),
      };
    } else {
      const { esAdmin: hasEsAdminColumn, adminRol: hasAdminRolColumn } =
        await getAgenteAdminColumnsInfo();

      let agenteQueryText = `
        SELECT
          AgenteID,
          Nombre,
          Apellido,
          Email,
          PasswordHash,
          CodigoAgente,
          Activo
        FROM AgentesDeVentas
        WHERE Email = $1 AND Activo = TRUE
      `;

      if (hasEsAdminColumn && hasAdminRolColumn) {
        agenteQueryText = `
          SELECT
            AgenteID,
            Nombre,
            Apellido,
            Email,
            PasswordHash,
            CodigoAgente,
            Activo,
            EsAdmin,
            AdminRol
          FROM AgentesDeVentas
          WHERE Email = $1 AND Activo = TRUE
        `;
      } else if (hasEsAdminColumn) {
        agenteQueryText = `
          SELECT
            AgenteID,
            Nombre,
            Apellido,
            Email,
            PasswordHash,
            CodigoAgente,
            Activo,
            EsAdmin
          FROM AgentesDeVentas
          WHERE Email = $1 AND Activo = TRUE
        `;
      } else if (hasAdminRolColumn) {
        agenteQueryText = `
          SELECT
            AgenteID,
            Nombre,
            Apellido,
            Email,
            PasswordHash,
            CodigoAgente,
            Activo,
            AdminRol
          FROM AgentesDeVentas
          WHERE Email = $1 AND Activo = TRUE
        `;
      }

      const agenteResult = await db.query(agenteQueryText, [email]);

      if (agenteResult.rows.length > 0) {
        const agente = agenteResult.rows[0];
        const esAdmin = hasEsAdminColumn ? Boolean(agente.esadmin) : false;

        if (esAdmin) {
          const adminRol = hasAdminRolColumn
            ? agente.adminrol || "admin"
            : "admin";
          cuenta = {
            id: agente.agenteid,
            email: agente.email,
            nombre: agente.nombre,
            apellido: agente.apellido || "",
            rol: adminRol,
            passwordHash: agente.passwordhash,
            adminSource: "agent",
            codigoAgente: agente.codigoagente,
            roles: Array.from(new Set(["admin", adminRol, "agente"])),
          };
        }
      }
    }

    if (!cuenta) {
      return res.status(401).json({
        success: false,
        message: "Credenciales inválidas",
      });
    }

    // Verificar contraseña
    const isPasswordValid = await bcrypt.compare(password, cuenta.passwordHash);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Credenciales inválidas",
      });
    }

    const tokenPayload = {
      id: cuenta.id,
      email: cuenta.email,
      rol: cuenta.rol,
      tipo: "admin",
      roles: cuenta.roles,
      adminSource: cuenta.adminSource,
    };

    if (cuenta.adminSource === "agent") {
      tokenPayload.agenteId = cuenta.id;
      if (cuenta.codigoAgente) {
        tokenPayload.codigoAgente = cuenta.codigoAgente;
      }
    }

    // Generar token JWT
    const token = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET,
      { expiresIn: "8h" } // Token válido por 8 horas
    );

    const nombreCompleto =
      [cuenta.nombre, cuenta.apellido].filter(Boolean).join(" ").trim() ||
      cuenta.nombre;

    // Enviar respuesta
    res.json({
      success: true,
      message: "Login exitoso",
      data: {
        token,
        admin: {
          adminId: cuenta.id,
          nombre: nombreCompleto,
          email: cuenta.email,
          rol: cuenta.rol,
          origen: cuenta.adminSource,
        },
      },
    });
  } catch (error) {
    console.error("Error en login de admin:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * Obtener clientes asignados a un agente específico
 * GET /api/admin/agentes/:id/clientes
 */
const getAgenteClientes = async (req, res) => {
  try {
    const agenteId = parseInt(req.params.id, 10);

    if (Number.isNaN(agenteId)) {
      return res.status(400).json({
        success: false,
        message: "ID de agente inválido",
      });
    }

    const agenteResult = await db.query(
      `SELECT AgenteID FROM AgentesDeVentas WHERE AgenteID = $1`,
      [agenteId]
    );

    if (agenteResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Agente no encontrado",
      });
    }

    const clientesResult = await db.query(
      `SELECT
         c.ClienteID,
         c.Nombre,
         c.Apellido,
         c.Email,
         c.Telefono,
         c.FechaDeRegistro,
         stats.total_pedidos,
         stats.monto_total,
         stats.total_comisiones
       FROM Clientes c
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*) AS total_pedidos,
           COALESCE(SUM(p.MontoTotal), 0) AS monto_total,
           COALESCE(SUM(co.MontoComision), 0) AS total_comisiones
         FROM Pedidos p
         LEFT JOIN Comisiones co ON co.PedidoID = p.PedidoID
         WHERE p.ClienteID = c.ClienteID AND p.AgenteID = $1
       ) stats ON TRUE
       WHERE c.AgenteID = $1
       ORDER BY c.FechaDeRegistro DESC`,
      [agenteId]
    );

    const clientes = clientesResult.rows.map((row) => ({
      clienteId: row.clienteid,
      nombre: row.nombre,
      apellido: row.apellido,
      email: row.email,
      telefono: row.telefono,
      fechaRegistro: row.fechaderegistro,
      totalPedidos: Number.parseInt(row.total_pedidos ?? 0, 10),
      montoTotalCompras: Number.parseFloat(row.monto_total ?? 0),
      totalComisiones: Number.parseFloat(row.total_comisiones ?? 0),
    }));

    return res.json({
      success: true,
      data: {
        clientes,
        total: clientes.length,
      },
    });
  } catch (error) {
    console.error("Error al obtener clientes del agente:", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener la cartera del agente",
    });
  }
};

/**
 * Desvincular un cliente de su agente asignado
 * PUT /api/admin/clientes/:id/desvincular
 */
const desvincularClienteDeAgente = async (req, res) => {
  try {
    const clienteId = parseInt(req.params.id, 10);

    if (Number.isNaN(clienteId)) {
      return res.status(400).json({
        success: false,
        message: "ID de cliente inválido",
      });
    }

    const result = await db.query(
      `UPDATE Clientes
       SET AgenteID = NULL
       WHERE ClienteID = $1
       RETURNING ClienteID, Nombre, Apellido`,
      [clienteId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Cliente no encontrado",
      });
    }

    const cliente = result.rows[0];

    return res.json({
      success: true,
      message: "Cliente desvinculado del agente",
      data: {
        clienteId: cliente.clienteid,
        nombre: cliente.nombre,
        apellido: cliente.apellido,
      },
    });
  } catch (error) {
    console.error("Error al desvincular cliente:", error);
    return res.status(500).json({
      success: false,
      message: "Error al desvincular al cliente del agente",
    });
  }
};

/**
 * Actualizar costo de envío de un pedido
 * PUT /api/admin/pedidos/:id/costo-envio
 */
const updateCostoEnvio = async (req, res) => {
  try {
    const pedidoId = parseInt(req.params.id);
    const { costoEnvio } = req.body;

    if (Number.isNaN(pedidoId)) {
      return res.status(400).json({
        success: false,
        message: "ID de pedido inválido",
      });
    }

    if (costoEnvio === undefined || costoEnvio === null || costoEnvio === "") {
      return res.status(400).json({
        success: false,
        message: "El costo de envío es requerido",
      });
    }

    const costoEnvioValue = parseFloat(costoEnvio);

    if (Number.isNaN(costoEnvioValue) || costoEnvioValue < 0) {
      return res.status(400).json({
        success: false,
        message: "El costo de envío debe ser un número mayor o igual a 0",
      });
    }

    const result = await db.query(
      `UPDATE Pedidos
       SET CostoEnvio = $1
       WHERE PedidoID = $2
       RETURNING PedidoID, CostoEnvio`,
      [costoEnvioValue, pedidoId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pedido no encontrado",
      });
    }

    res.json({
      success: true,
      message: "Costo de envío actualizado",
      data: {
        pedidoId: result.rows[0].pedidoid,
        costoEnvio: parseFloat(result.rows[0].costoenvio),
      },
    });
  } catch (error) {
    console.error("Error al actualizar costo de envío:", error);
    res.status(500).json({
      success: false,
      message: "Error al actualizar el costo de envío",
    });
  }
};

/**
 * Obtener detalle de un cliente
 * GET /api/admin/clientes/:id
 */
const getClienteDetalle = async (req, res) => {
  try {
    const clienteId = parseInt(req.params.id, 10);

    if (!Number.isInteger(clienteId)) {
      return res.status(400).json({
        success: false,
        message: "ClienteID inválido",
      });
    }

    const clienteQuery = `
      SELECT 
        ClienteID,
        Nombre,
        Apellido,
        Email,
        Telefono,
        Activo,
        FechaDeRegistro
      FROM Clientes
      WHERE ClienteID = $1
    `;

    const clienteResult = await db.query(clienteQuery, [clienteId]);

    if (clienteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Cliente no encontrado",
      });
    }

    const cliente = clienteResult.rows[0];

    const pedidosQuery = `
      SELECT 
        PedidoID,
        FechaPedido,
        MontoTotal,
        Estatus,
        DireccionEnvioID,
        AgenteID
      FROM Pedidos
      WHERE ClienteID = $1
      ORDER BY FechaPedido DESC
    `;

    const pedidosResult = await db.query(pedidosQuery, [clienteId]);

    const direccionesQuery = `
      SELECT 
        cd.DireccionID,
        cd.Etiqueta,
        cd.Receptor,
        cd.Calle,
        cd.NumeroExt,
        cd.NumeroInt,
        cd.Colonia,
        cd.Ciudad,
        cd.EstadoID,
        e.Nombre AS EstadoNombre,
        e.Abreviatura AS EstadoAbreviatura,
        cd.CodigoPostal,
        cd.TelefonoContacto
      FROM Cliente_Direcciones cd
      LEFT JOIN Estados e ON cd.EstadoID = e.EstadoID
      WHERE cd.ClienteID = $1
      ORDER BY cd.DireccionID DESC
    `;

    const direccionesResult = await db.query(direccionesQuery, [clienteId]);

    res.json({
      success: true,
      data: {
        cliente: {
          clienteId: cliente.clienteid,
          nombre: cliente.nombre,
          apellido: cliente.apellido,
          email: cliente.email,
          telefono: cliente.telefono,
          activo: cliente.activo,
          fechaRegistro: cliente.fechaderegistro,
        },
        pedidos: pedidosResult.rows.map((pedido) => ({
          pedidoId: pedido.pedidoid,
          fechaPedido: pedido.fechapedido,
          montoTotal: pedido.montototal ? parseFloat(pedido.montototal) : 0,
          estatus: pedido.estatus,
          direccionEnvioId: pedido.direccionenvioid,
          agenteId: pedido.agenteid,
        })),
        direcciones: direccionesResult.rows.map((direccion) => ({
          direccionId: direccion.direccionid,
          etiqueta: direccion.etiqueta,
          receptor: direccion.receptor,
          calle: direccion.calle,
          numeroExt: direccion.numeroext,
          numeroInt: direccion.numeroint,
          colonia: direccion.colonia,
          ciudad: direccion.ciudad,
          estadoId:
            direccion.estadoid !== null
              ? parseInt(direccion.estadoid, 10)
              : null,
          estado: direccion.estadonombre || null,
          estadoNombre: direccion.estadonombre || null,
          estadoAbreviatura: direccion.estadoabreviatura || null,
          codigoPostal: direccion.codigopostal,
          telefonoContacto: direccion.telefonocontacto,
        })),
      },
    });
  } catch (error) {
    console.error("Error al obtener detalle del cliente:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * Actualizar estado activo de un cliente
 * PUT /api/admin/clientes/:id/estado
 */
const actualizarEstadoCliente = async (req, res) => {
  try {
    const clienteId = parseInt(req.params.id, 10);
    const { activo } = req.body;

    if (!Number.isInteger(clienteId)) {
      return res.status(400).json({
        success: false,
        message: "ClienteID inválido",
      });
    }

    if (typeof activo !== "boolean") {
      return res.status(400).json({
        success: false,
        message: 'El campo "activo" debe ser booleano',
      });
    }

    const result = await db.query(
      `UPDATE Clientes
       SET Activo = $1
       WHERE ClienteID = $2
       RETURNING ClienteID, Activo`,
      [activo, clienteId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Cliente no encontrado",
      });
    }

    res.json({
      success: true,
      message: "Estado del cliente actualizado correctamente",
      data: {
        clienteId: result.rows[0].clienteid,
        activo: result.rows[0].activo,
      },
    });
  } catch (error) {
    console.error("Error al actualizar estado del cliente:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * Obtener catálogo de medidas disponibles
 * GET /api/admin/medidas
 */
const getMedidas = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT MedidaID, Nombre, Abreviatura
       FROM Medidas
       ORDER BY Nombre`
    );

    res.json({
      success: true,
      data: {
        medidas: result.rows.map((row) => ({
          medidaId: row.medidaid,
          nombre: row.nombre,
          abreviatura: row.abreviatura,
        })),
      },
    });
  } catch (error) {
    console.error("Error al obtener medidas:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * Verificar token de admin
 * GET /api/admin/verify
 */
const verifyAdmin = async (req, res) => {
  try {
    // El middleware ya validó el token y agregó req.user
    const adminId = req.user.id;

    let adminInfo = null;

    if (req.user.adminSource === "agent") {
      const agentResult = await db.query(
        `SELECT 
          AgenteID,
          Nombre,
          Apellido,
          Email,
          CodigoAgente,
          AdminRol
        FROM AgentesDeVentas
        WHERE AgenteID = $1 AND Activo = TRUE`,
        [adminId]
      );

      if (agentResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Administrador no encontrado",
        });
      }

      const agente = agentResult.rows[0];
      const nombreCompleto =
        [agente.nombre, agente.apellido].filter(Boolean).join(" ").trim() ||
        agente.nombre;

      adminInfo = {
        adminId: agente.agenteid,
        nombre: nombreCompleto,
        email: agente.email,
        rol: agente.adminrol || req.user.rol,
        origen: "agent",
        codigoAgente: agente.codigoagente || req.user.codigoAgente || null,
      };
    } else {
      const result = await db.query(
        "SELECT AdminID, Nombre, Apellido, Email, Rol FROM Administradores WHERE AdminID = $1 AND Activo = TRUE",
        [adminId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Administrador no encontrado",
        });
      }

      const admin = result.rows[0];
      const nombreCompleto =
        [admin.nombre, admin.apellido].filter(Boolean).join(" ").trim() ||
        admin.nombre;

      adminInfo = {
        adminId: admin.adminid,
        nombre: nombreCompleto,
        email: admin.email,
        rol: admin.rol,
        origen: "admin",
      };
    }

    res.json({
      success: true,
      data: {
        admin: adminInfo,
      },
    });
  } catch (error) {
    console.error("Error al verificar admin:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * Obtener perfil del admin
 * GET /api/admin/profile
 */
const getAdminProfile = async (req, res) => {
  try {
    const adminId = req.user.id;

    let adminData = null;

    if (req.user.adminSource === "agent") {
      const agentResult = await db.query(
        `SELECT 
          AgenteID,
          Nombre,
          Apellido,
          Email,
          CodigoAgente,
          AdminRol,
          FechaCreacion
        FROM AgentesDeVentas
        WHERE AgenteID = $1 AND Activo = TRUE`,
        [adminId]
      );

      if (agentResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Administrador no encontrado",
        });
      }

      const agente = agentResult.rows[0];
      const nombreCompleto =
        [agente.nombre, agente.apellido].filter(Boolean).join(" ").trim() ||
        agente.nombre;

      adminData = {
        adminId: agente.agenteid,
        nombre: nombreCompleto,
        email: agente.email,
        rol: agente.adminrol || req.user.rol,
        fechaCreacion: agente.fechacreacion,
        origen: "agent",
        codigoAgente: agente.codigoagente || req.user.codigoAgente || null,
      };
    } else {
      const result = await db.query(
        `SELECT 
          AdminID, 
          Nombre, 
          Apellido,
          Email, 
          Rol, 
          FechaCreacion
        FROM Administradores 
        WHERE AdminID = $1 AND Activo = TRUE`,
        [adminId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Administrador no encontrado",
        });
      }

      const admin = result.rows[0];
      const nombreCompleto =
        [admin.nombre, admin.apellido].filter(Boolean).join(" ").trim() ||
        admin.nombre;

      adminData = {
        adminId: admin.adminid,
        nombre: nombreCompleto,
        email: admin.email,
        rol: admin.rol,
        fechaCreacion: admin.fechacreacion,
        origen: "admin",
      };
    }

    res.json({
      success: true,
      data: adminData,
    });
  } catch (error) {
    console.error("Error al obtener perfil de admin:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * Renovar token de admin
 * POST /api/admin/refresh-token
 */
const refreshAdminToken = async (req, res) => {
  try {
    // El middleware authenticate ya verificó el token actual
    const adminId = req.user.id;
    const email = req.user.email;
    const tipo = req.user.tipo;

    // Verificar que el admin aún existe
    const result = await db.query(
      `SELECT AdminID FROM Administradores WHERE AdminID = $1`,
      [adminId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Administrador no encontrado",
      });
    }

    // Generar un nuevo token con el mismo payload
    const { generateToken } = require("../utils/jwtHelper");
    const newToken = generateToken({
      userId: adminId,
      tipo: tipo,
      rol: req.user.rol,
      email: email,
    });

    console.log("🔄 Token de admin renovado:", { adminId, email });

    res.json({
      success: true,
      message: "Token renovado exitosamente",
      data: {
        token: newToken,
      },
    });
  } catch (error) {
    console.error("Error refreshing admin token:", error);
    res.status(500).json({
      success: false,
      message: "Error al renovar token",
    });
  }
};

/**
 * Obtener estadísticas del dashboard
 * GET /api/admin/dashboard-stats
 */
const getDashboardStats = async (req, res) => {
  try {
    // Pedidos pendientes
    const pedidosPendientes = await db.query(
      `SELECT COUNT(*) as total FROM Pedidos WHERE Estatus = 'Pendiente'`
    );

    // Total de comisiones pendientes
    const comisionesPendientes = await db.query(
      `SELECT COALESCE(SUM(MontoComision), 0) as total 
       FROM Comisiones 
       WHERE Estatus = 'Pendiente'`
    );

    // Variantes con stock bajo (<=5 paquetes)
    const productosStockBajo = await db.query(
      `SELECT COUNT(*) AS total
       FROM Producto_Variantes
       WHERE COALESCE(Stock, 0) <= 5`
    );

    // Total de pedidos (para estadística general)
    const totalPedidos = await db.query(
      `SELECT COUNT(*) as total FROM Pedidos`
    );

    // Ingresos totales
    const ingresosTotales = await db.query(
      `SELECT COALESCE(SUM(MontoTotal), 0) as total FROM Pedidos`
    );

    // Clientes totales (tabla Clientes no tiene columna Activo)
    const clientesActivos = await db.query(
      `SELECT COUNT(*) as total FROM Clientes`
    );

    // Agentes activos
    const agentesActivos = await db.query(
      `SELECT COUNT(*) as total FROM AgentesDeVentas WHERE Activo = TRUE`
    );

    res.json({
      success: true,
      data: {
        pedidosPendientes: parseInt(pedidosPendientes.rows[0].total),
        comisionesPendientes: parseFloat(comisionesPendientes.rows[0].total),
        productosStockBajo: parseInt(productosStockBajo.rows[0].total),
        totalPedidos: parseInt(totalPedidos.rows[0].total),
        ingresosTotales: parseFloat(ingresosTotales.rows[0].total),
        clientesActivos: parseInt(clientesActivos.rows[0].total),
        agentesActivos: parseInt(agentesActivos.rows[0].total),
      },
    });
  } catch (error) {
    console.error("Error al obtener estadísticas:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * Obtener todos los pedidos (para administración)
 * GET /api/admin/pedidos
 */
const getAllPedidos = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
        p.PedidoID,
        p.ClienteID,
        c.Nombre || ' ' || c.Apellido as ClienteNombre,
        c.Email as ClienteEmail,
        p.FechaPedido,
        p.MontoTotal,
        p.CostoEnvio,
        p.Estatus,
        p.DireccionEnvioID,
        CONCAT_WS(', ', d.Calle, d.Ciudad, e.Nombre) as DireccionCompleta,
        d.EstadoID,
        e.Nombre as EstadoNombre,
        p.AgenteID,
        CASE 
          WHEN a.AgenteID IS NOT NULL THEN a.Nombre || ' ' || a.Apellido 
          ELSE NULL 
        END as AgenteNombre,
        (SELECT COUNT(*) FROM DetallesDelPedido dp WHERE dp.PedidoID = p.PedidoID) as TotalItems
      FROM Pedidos p
      INNER JOIN Clientes c ON p.ClienteID = c.ClienteID
      LEFT JOIN Cliente_Direcciones d ON p.DireccionEnvioID = d.DireccionID
      LEFT JOIN Estados e ON d.EstadoID = e.EstadoID
      LEFT JOIN AgentesDeVentas a ON p.AgenteID = a.AgenteID
      ORDER BY p.FechaPedido DESC`
    );

    res.json({
      success: true,
      data: {
        pedidos: result.rows.map((row) => ({
          pedidoId: row.pedidoid,
          clienteId: row.clienteid,
          clienteNombre: row.clientenombre,
          clienteEmail: row.clienteemail,
          fechaPedido: row.fechapedido,
          montoTotal: parseFloat(row.montototal),
          costoEnvio:
            row.costoenvio !== null ? parseFloat(row.costoenvio) : null,
          estatus: row.estatus,
          direccionEnvioId: row.direccionenvioid,
          direccionCompleta: row.direccioncompleta,
          estadoId: row.estadoid !== null ? parseInt(row.estadoid, 10) : null,
          estadoNombre: row.estadonombre || null,
          agenteId: row.agenteid,
          agenteNombre: row.agentenombre,
          totalItems: parseInt(row.totalitems),
        })),
      },
    });
  } catch (error) {
    console.error("Error al obtener pedidos:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * Actualizar estatus de un pedido
 * PUT /api/admin/pedidos/:id
 */
const updatePedidoEstatus = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const pedidoId = parseInt(req.params.id);
    const { estatus } = req.body;

    // Validar estatus
    const estatusValidos = [
      "Pendiente",
      "Confirmado",
      "Enviado",
      "Entregado",
      "Cancelado",
    ];
    if (!estatusValidos.includes(estatus)) {
      return res.status(400).json({
        success: false,
        message: "Estatus inválido",
      });
    }

    await client.query("BEGIN");

    // Obtener datos del pedido
    const pedidoResult = await client.query(
      `SELECT 
         p.*, 
         c.Email AS email_cliente, 
         COALESCE(c.Nombre, '') AS nombre_cliente
       FROM Pedidos p
       INNER JOIN Clientes c ON c.ClienteID = p.ClienteID
       WHERE p.PedidoID = $1`,
      [pedidoId]
    );

    if (pedidoResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Pedido no encontrado",
      });
    }

    const pedido = pedidoResult.rows[0];
    const estatusAnterior = pedido.estatus;

    // Si el estatus cambia a 'Confirmado', reducir stock y crear log
    if (estatus === "Confirmado" && estatusAnterior !== "Confirmado") {
      // Obtener los detalles del pedido con sus variantes
      const detallesResult = await client.query(
        `SELECT 
          dp.DetalleID,
          dp.VarianteID,
          dp.CantidadPaquetes,
          pv.Stock,
          pv.ProductoID,
          pv.SKU,
          pr.NombreProducto
        FROM DetallesDelPedido dp
        INNER JOIN Producto_Variantes pv ON dp.VarianteID = pv.VarianteID
        INNER JOIN Productos pr ON pv.ProductoID = pr.ProductoID
        WHERE dp.PedidoID = $1`,
        [pedidoId]
      );

      // Reducir stock de cada variante y crear log
      for (const detalle of detallesResult.rows) {
        const stockActual = detalle.stock ?? 0;
        const cantidadRequerida = detalle.cantidadpaquetes;

        if (stockActual < cantidadRequerida) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            success: false,
            message: `Stock insuficiente para la variante ${
              detalle.sku || detalle.varianteid
            }. Stock actual: ${stockActual}, requerido: ${cantidadRequerida}`,
          });
        }

        const nuevoStock = stockActual - cantidadRequerida;

        await client.query(
          `UPDATE Producto_Variantes 
           SET Stock = $1 
           WHERE VarianteID = $2`,
          [nuevoStock, detalle.varianteid]
        );

        await client.query(
          `INSERT INTO Log_Inventario (VarianteID, CantidadCambiado, NuevoStock, Motivo, UsuarioID)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            detalle.varianteid,
            -cantidadRequerida,
            nuevoStock,
            `Pedido #${pedidoId} confirmado (${detalle.nombreproducto})`,
            req.user.id,
          ]
        );
      }
    }

    // Actualizar el estatus del pedido
    await client.query("UPDATE Pedidos SET Estatus = $1 WHERE PedidoID = $2", [
      estatus,
      pedidoId,
    ]);

    await client.query("COMMIT");

    const emailCliente = pedido.email_cliente;
    const nombreCliente =
      (pedido.nombre_cliente || "cliente").trim() || "cliente";
    const plantilla = PEDIDO_ESTATUS_EMAIL_TEMPLATES[estatus];

    if (plantilla && emailCliente) {
      try {
        const asunto = plantilla.asunto(pedidoId);
        const cuerpoHtml = plantilla.html(nombreCliente, pedidoId);
        await enviarEmail(emailCliente, asunto, cuerpoHtml);
      } catch (emailError) {
        console.error(
          `No se pudo enviar correo de notificación para el pedido #${pedidoId}:`,
          emailError
        );
      }
    }

    res.json({
      success: true,
      message: `Pedido actualizado a ${estatus}`,
      data: {
        pedidoId,
        estatusAnterior,
        estatusNuevo: estatus,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al actualizar pedido:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

/**
 * Crear un nuevo producto
 * POST /api/admin/productos
 */
const crearProducto = async (req, res) => {
  const {
    nombre,
    codigoModelo,
    descripcion,
    categoriaId,
    tamanos,
    tamanoIds,
    proveedorId: proveedorIdRaw,
    activo,
  } = req.body;

  if (!nombre) {
    return res.status(400).json({
      success: false,
      message: "El nombre del producto es obligatorio",
    });
  }

  const client = await db.pool.connect();
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    let proveedorId = null;
    if (proveedorIdRaw !== undefined && proveedorIdRaw !== null) {
      const parsed = Number.parseInt(proveedorIdRaw, 10);
      if (!Number.isNaN(parsed)) {
        proveedorId = parsed;
      }
    }

    if (proveedorId !== null) {
      const proveedorResult = await client.query(
        "SELECT ProveedorID FROM Proveedores WHERE ProveedorID = $1",
        [proveedorId]
      );

      if (proveedorResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "El proveedor predeterminado no existe",
        });
      }
    }

    // Gestión de visibilidad: activo por defecto TRUE, pero respeta el valor del body
    const activoFinal = activo !== undefined ? Boolean(activo) : true;

    const result = await client.query(
      `INSERT INTO Productos (NombreProducto, CodigoModelo, Descripcion, CategoriaID, ProveedorID_Default, Activo)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ProductoID, NombreProducto, CodigoModelo, Descripcion, CategoriaID, ProveedorID_Default AS ProveedorID, Activo`,
      [
        nombre,
        codigoModelo || null,
        descripcion || null,
        categoriaId || null,
        proveedorId,
        activoFinal,
      ]
    );

    const producto = result.rows[0];
    let tamanosAsociados = [];
    const tamanosRaw = Array.isArray(tamanos)
      ? tamanos
      : Array.isArray(tamanoIds)
      ? tamanoIds
      : [];

    if (tamanosRaw.length) {
      const sanitizedIds = [
        ...new Set(
          tamanosRaw
            .map((id) => Number.parseInt(id, 10))
            .filter((id) => Number.isInteger(id) && id > 0)
        ),
      ];

      if (sanitizedIds.length) {
        const tamanosValidosResult = await client.query(
          "SELECT TamanoID FROM Cat_TamanoPaquetes WHERE TamanoID = ANY($1::int[])",
          [sanitizedIds]
        );

        const tamanosValidos = tamanosValidosResult.rows.map((row) =>
          Number.parseInt(row.tamanoid, 10)
        );

        if (tamanosValidos.length !== sanitizedIds.length) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            success: false,
            message:
              "Uno o más tamaños seleccionados no existen en el catálogo",
          });
        }

        for (const tamanoId of tamanosValidos) {
          await client.query(
            `INSERT INTO Producto_TamanosDisponibles (ProductoID, TamanoID)
             VALUES ($1, $2)`,
            [producto.productoid, tamanoId]
          );
        }

        tamanosAsociados = tamanosValidos;
      }
    }

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      message: "Producto maestro creado exitosamente",
      data: {
        producto,
        tamanosDisponibles: tamanosAsociados,
      },
    });
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK");
    }
    console.error("Error al crear producto maestro:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

/**
 * Obtener catálogo de tamaños de paquetes
 * GET /api/admin/tamanos-paquetes
 */
const getTamanosPaquetes = async (_req, res) => {
  try {
    const result = await db.query(
      `SELECT *
       FROM Cat_TamanoPaquetes
       ORDER BY TamanoID ASC`
    );

    const valueCandidates = [
      "valor",
      "piezas",
      "piezasporpaquete",
      "cantidad",
      "numeropiezas",
      "tamano",
      "cantidadpiezas",
    ];

    const labelCandidates = ["etiqueta", "descripcion", "nombre", "label"];

    const tamanos = result.rows.map((row) => {
      const tamanoId = Number.parseInt(row.tamanoid, 10);

      let valor = null;
      for (const field of valueCandidates) {
        if (
          Object.prototype.hasOwnProperty.call(row, field) &&
          row[field] !== null &&
          row[field] !== undefined
        ) {
          const parsed = Number.parseInt(row[field], 10);
          if (!Number.isNaN(parsed)) {
            valor = parsed;
            break;
          }
        }
      }

      let etiqueta = null;
      for (const field of labelCandidates) {
        if (
          Object.prototype.hasOwnProperty.call(row, field) &&
          typeof row[field] === "string" &&
          row[field].trim()
        ) {
          etiqueta = row[field].trim();
          break;
        }
      }

      return {
        tamanoId,
        valor,
        etiqueta,
      };
    });

    tamanos.sort((a, b) => {
      if (Number.isFinite(a.valor) && Number.isFinite(b.valor)) {
        return a.valor - b.valor;
      }
      if (Number.isFinite(a.valor)) return -1;
      if (Number.isFinite(b.valor)) return 1;
      return a.tamanoId - b.tamanoId;
    });

    res.json({
      success: true,
      data: {
        tamanos,
        total: tamanos.length,
      },
    });
  } catch (error) {
    console.error("Error al obtener tamaños de paquetes:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener los tamaños de paquetes",
    });
  }
};

/**
 * Actualizar un producto existente
 * PUT /api/admin/productos/:id
 */
const actualizarProducto = async (req, res) => {
  const productoId = Number.parseInt(req.params.id, 10);

  if (!Number.isInteger(productoId) || productoId <= 0) {
    return res.status(400).json({
      success: false,
      message: "ProductoID inválido",
    });
  }

  const {
    nombre,
    codigoModelo,
    descripcion,
    categoriaId,
    tamanos,
    tamanoIds,
    proveedorId: proveedorIdRaw,
    activo,
  } = req.body;

  const client = await db.pool.connect();
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    const productoResult = await client.query(
      `SELECT ProductoID, NombreProducto, CodigoModelo, Descripcion, CategoriaID, ProveedorID_Default AS ProveedorID, Activo
       FROM Productos
       WHERE ProductoID = $1`,
      [productoId]
    );

    if (productoResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Producto maestro no encontrado",
      });
    }

    const productoActual = productoResult.rows[0];

    const nombreFinal =
      nombre !== undefined
        ? typeof nombre === "string"
          ? nombre.trim()
          : ""
        : productoActual.nombreproducto;

    if (!nombreFinal) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "El nombre del producto es obligatorio",
      });
    }

    const descripcionFinal =
      descripcion !== undefined
        ? typeof descripcion === "string" && descripcion.trim()
          ? descripcion.trim()
          : null
        : productoActual.descripcion;

    const codigoModeloFinal =
      codigoModelo !== undefined
        ? typeof codigoModelo === "string" && codigoModelo.trim()
          ? codigoModelo.trim()
          : null
        : productoActual.codigomodelo;

    const categoriaFinal =
      categoriaId !== undefined
        ? categoriaId || null
        : productoActual.categoriaid;

    let proveedorId = productoActual.proveedorid;
    if (proveedorIdRaw !== undefined) {
      if (
        proveedorIdRaw === null ||
        proveedorIdRaw === "" ||
        proveedorIdRaw === 0
      ) {
        proveedorId = null;
      } else {
        const parsedProveedor = Number.parseInt(proveedorIdRaw, 10);
        if (Number.isNaN(parsedProveedor) || parsedProveedor <= 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            success: false,
            message: "Proveedor predeterminado inválido",
          });
        }

        const proveedorExiste = await client.query(
          "SELECT ProveedorID FROM Proveedores WHERE ProveedorID = $1",
          [parsedProveedor]
        );

        if (proveedorExiste.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            success: false,
            message: "El proveedor predeterminado especificado no existe",
          });
        }

        proveedorId = parsedProveedor;
      }
    }

    // Gestión de visibilidad: mantener el valor actual si no se especifica
    const activoFinal = activo !== undefined ? Boolean(activo) : productoActual.activo;

    const productoActualizado = await client.query(
      `UPDATE Productos
       SET NombreProducto = $1,
           CodigoModelo = $2,
           Descripcion = $3,
           CategoriaID = $4,
           ProveedorID_Default = $5,
           Activo = $6
       WHERE ProductoID = $7
       RETURNING ProductoID, NombreProducto, CodigoModelo, Descripcion, CategoriaID, ProveedorID_Default AS ProveedorID, Activo`,
      [
        nombreFinal,
        codigoModeloFinal,
        descripcionFinal,
        categoriaFinal,
        proveedorId,
        activoFinal,
        productoId,
      ]
    );

    const tamanosRaw = Array.isArray(tamanos)
      ? tamanos
      : Array.isArray(tamanoIds)
      ? tamanoIds
      : [];

    await client.query(
      "DELETE FROM Producto_TamanosDisponibles WHERE ProductoID = $1",
      [productoId]
    );

    let tamanosAsociados = [];

    if (tamanosRaw.length) {
      const sanitizedIds = [
        ...new Set(
          tamanosRaw
            .map((id) => Number.parseInt(id, 10))
            .filter((id) => Number.isInteger(id) && id > 0)
        ),
      ];

      if (sanitizedIds.length) {
        const tamanosValidosResult = await client.query(
          "SELECT TamanoID FROM Cat_TamanoPaquetes WHERE TamanoID = ANY($1::int[])",
          [sanitizedIds]
        );

        const tamanosValidos = tamanosValidosResult.rows.map((row) =>
          Number.parseInt(row.tamanoid, 10)
        );

        if (tamanosValidos.length !== sanitizedIds.length) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            success: false,
            message:
              "Uno o más tamaños seleccionados no existen en el catálogo",
          });
        }

        for (const tamanoId of tamanosValidos) {
          await client.query(
            `INSERT INTO Producto_TamanosDisponibles (ProductoID, TamanoID)
             VALUES ($1, $2)`,
            [productoId, tamanoId]
          );
        }

        tamanosAsociados = tamanosValidos;
      }
    }

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Producto maestro actualizado correctamente",
      data: {
        producto: updateResult.rows[0],
        tamanosDisponibles: tamanosAsociados,
      },
    });
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK");
    }
    console.error("Error al actualizar producto maestro:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

/**
 * Crear una nueva variante para un producto maestro
 * POST /api/admin/variantes
 */
const crearVariante = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const {
      productoId,
      sku,
      dimensiones,
      costoUnitario,
      precioUnitario,
      precioOfertaUnitario,
      stock,
      tipoProductoId,
      medidaId,
    } = req.body;

    if (!productoId || !sku || precioUnitario === undefined) {
      return res.status(400).json({
        success: false,
        message: "productoId, sku y precioUnitario son obligatorios",
      });
    }

    await client.query("BEGIN");

    const productoResult = await client.query(
      "SELECT ProductoID FROM Productos WHERE ProductoID = $1",
      [productoId]
    );

    if (productoResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Producto maestro no encontrado",
      });
    }

    const stockInicial = Number.isFinite(stock) ? stock : 0;
    const costoUnitarioNormalized =
      costoUnitario !== undefined ? costoUnitario : null;
    const precioUnitarioNormalized = Number.isFinite(precioUnitario)
      ? precioUnitario
      : null;

    if (precioUnitarioNormalized === null || precioUnitarioNormalized <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "El precio unitario debe ser un número mayor a 0",
      });
    }

    const precioOfertaUnitarioNormalized =
      precioOfertaUnitario !== undefined &&
      precioOfertaUnitario !== null &&
      precioOfertaUnitario > 0
        ? precioOfertaUnitario
        : null;

    const varianteResult = await client.query(
      `INSERT INTO Producto_Variantes (
        ProductoID, SKU, Dimensiones, CostoUnitario,
        PrecioUnitario, PrecioOfertaUnitario, Stock, TipoProductoID, MedidaID
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING VarianteID, ProductoID, SKU, Dimensiones,
                CostoUnitario, PrecioUnitario, PrecioOfertaUnitario, Stock, TipoProductoID, MedidaID`,
      [
        productoId,
        sku,
        dimensiones || null,
        costoUnitarioNormalized,
        precioUnitarioNormalized,
        precioOfertaUnitarioNormalized,
        stockInicial,
        tipoProductoId || null,
        medidaId || null,
      ]
    );

    const variante = varianteResult.rows[0];

    if (stockInicial && stockInicial !== 0) {
      await client.query(
        `INSERT INTO Log_Inventario (VarianteID, CantidadCambiado, NuevoStock, Motivo, UsuarioID)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          variante.varianteid,
          stockInicial,
          stockInicial,
          "Stock inicial de variante (piezas)",
          req.user.id,
        ]
      );
    }

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      message: "Variante creada exitosamente",
      data: {
        variante,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al crear variante:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

/**
 * Ajustar inventario manualmente
 * POST /api/admin/inventario/ajuste
 */
const ajustarInventario = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const { varianteId, cantidadCambio, motivo } = req.body;

    if (!varianteId || cantidadCambio === undefined || !motivo) {
      return res.status(400).json({
        success: false,
        message: "varianteId, cantidadCambio y motivo son requeridos",
      });
    }

    if (cantidadCambio === 0) {
      return res.status(400).json({
        success: false,
        message: "La cantidad de cambio no puede ser cero",
      });
    }

    await client.query("BEGIN");

    const varianteResult = await client.query(
      `SELECT VarianteID, ProductoID, SKU, Stock
       FROM Producto_Variantes
       WHERE VarianteID = $1`,
      [varianteId]
    );

    if (varianteResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Variante no encontrada",
      });
    }

    const variante = varianteResult.rows[0];
    const stockActual = variante.stock || 0;
    const nuevoStock = stockActual + cantidadCambio;

    if (nuevoStock < 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: `Stock insuficiente. Stock actual: ${stockActual}, cambio solicitado: ${cantidadCambio}`,
      });
    }

    await client.query(
      "UPDATE Producto_Variantes SET Stock = $1 WHERE VarianteID = $2",
      [nuevoStock, varianteId]
    );

    await client.query(
      `INSERT INTO Log_Inventario (VarianteID, CantidadCambiado, NuevoStock, Motivo, UsuarioID)
       VALUES ($1, $2, $3, $4, $5)`,
      [variante.varianteid, cantidadCambio, nuevoStock, motivo, req.user.id]
    );

    await client.query("COMMIT");

    checkStockBajo(variante.varianteid).catch((err) => {
      console.error("Error verificando stock bajo tras ajuste:", err);
    });

    res.json({
      success: true,
      message: "Inventario ajustado exitosamente",
      data: {
        varianteId: variante.varianteid,
        sku: variante.sku,
        stockAnterior: stockActual,
        cantidadCambio,
        stockNuevo: nuevoStock,
        motivo,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al ajustar inventario:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

/**
 * Obtener resumen de inventario por producto maestro
 * GET /api/admin/inventario
 */
const getInventarioResumen = async (req, res) => {
  try {
    const query = `
      SELECT
        p.ProductoID,
        p.NombreProducto,
        c.Nombre AS NombreCategoria,
        COUNT(v.VarianteID) AS TotalVariantes
      FROM Productos p
      LEFT JOIN Categorias c ON c.CategoriaID = p.CategoriaID
      LEFT JOIN Producto_Variantes v ON v.ProductoID = p.ProductoID
      GROUP BY p.ProductoID, p.NombreProducto, c.Nombre
      ORDER BY p.NombreProducto ASC
    `;

    const result = await db.query(query);

    const productos = result.rows.map((row) => ({
      productoId: row.productoid,
      nombreProducto: row.nombreproducto,
      nombreCategoria: row.nombrecategoria || "Sin categoría",
      totalVariantes:
        row.totalvariantes !== null ? parseInt(row.totalvariantes, 10) : 0,
    }));

    res.json({
      success: true,
      data: {
        productos,
        total: productos.length,
      },
    });
  } catch (error) {
    console.error("Error al obtener inventario resumido:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * Obtener detalle de un producto maestro con sus variantes
 * GET /api/admin/productos/:id
 */
const getProductoDetalle = async (req, res) => {
  try {
    const productoId = parseInt(req.params.id, 10);

    if (Number.isNaN(productoId)) {
      return res.status(400).json({
        success: false,
        message: "ProductoID inválido",
      });
    }

    const productoResult = await db.query(
      `SELECT
         p.productoid,
         p.nombreproducto,
         p.codigomodelo,
         p.descripcion,
         p.activo,
         p.categoriaid,
         c.nombre AS categorianombre,
         c.descripcion AS categoriadescripcion
       FROM productos p
       LEFT JOIN categorias c ON c.categoriaid = p.categoriaid
       WHERE p.productoid = $1`,
      [productoId]
    );

    if (productoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Producto no encontrado",
      });
    }

    const producto = productoResult.rows[0];

    const variantesResult = await db.query(
      `SELECT
         pv.varianteid,
         pv.productoid,
         pv.sku,
         pv.dimensiones,
         pv.costounitario,
         pv.preciounitario,
         pv.stock,
         pv.tipoproductoid,
         pv.medidaid,
         pv.activo
       FROM producto_variantes pv
       WHERE pv.productoid = $1
       ORDER BY pv.varianteid ASC`,
      [productoId]
    );

    const tamanosQuery = `
      SELECT ptd.tamanoid, ct.*
      FROM producto_tamanosdisponibles ptd
      INNER JOIN cat_tamanopaquetes ct ON ct.tamanoid = ptd.tamanoid
      WHERE ptd.productoid = $1
    `;

    const tamanosResult = await db.query(tamanosQuery, [productoId]);

    const valueCandidates = [
      "valor",
      "cantidad",
      "piezas",
      "piezasporpaquete",
      "numeropiezas",
      "tamano",
      "cantidadpiezas",
    ];

    const labelCandidates = ["etiqueta", "descripcion", "nombre", "label"];

    const tamanosDisponibles = tamanosResult.rows
      .map((row) => {
        const tamanoId = Number.parseInt(row.tamanoid, 10);

        let valor = null;
        for (const key of valueCandidates) {
          if (Object.prototype.hasOwnProperty.call(row, key)) {
            const parsed = Number.parseInt(row[key], 10);
            if (!Number.isNaN(parsed) && parsed > 0) {
              valor = parsed;
              break;
            }
          }
        }

        let etiqueta = null;
        for (const key of labelCandidates) {
          if (
            Object.prototype.hasOwnProperty.call(row, key) &&
            typeof row[key] === "string" &&
            row[key].trim()
          ) {
            etiqueta = row[key].trim();
            break;
          }
        }

        return {
          tamanoId,
          valor,
          etiqueta,
        };
      })
      .sort((a, b) => {
        if (Number.isFinite(a.valor) && Number.isFinite(b.valor)) {
          return a.valor - b.valor;
        }
        if (Number.isFinite(a.valor)) return -1;
        if (Number.isFinite(b.valor)) return 1;
        return a.tamanoId - b.tamanoId;
      });

    const tamanoReferencia = tamanosDisponibles.find(
      (tam) => Number.isFinite(tam.valor) && tam.valor > 0
    );

    const buildEtiqueta = (tamano) => {
      if (!tamano) return null;
      if (tamano.etiqueta) return tamano.etiqueta;
      if (tamano.valor === 1) return "Pieza individual";
      if (Number.isFinite(tamano.valor) && tamano.valor > 1)
        return `Pack de ${tamano.valor}`;
      return `Presentación ${tamano.tamanoId}`;
    };

    const variantes = variantesResult.rows.map((row) => {
      const precioUnitario =
        row.preciounitario !== null ? parseFloat(row.preciounitario) : null;
      const costoUnitario =
        row.costounitario !== null ? parseFloat(row.costounitario) : null;
      const stock = row.stock !== null ? parseInt(row.stock, 10) : 0;

      const precioPaquete =
        precioUnitario !== null && tamanoReferencia?.valor
          ? parseFloat((precioUnitario * tamanoReferencia.valor).toFixed(2))
          : null;

      return {
        varianteId: row.varianteid,
        productoId: row.productoid,
        sku: row.sku || null,
        dimensiones: row.dimensiones || null,
        costoUnitario,
        precioUnitario,
        precioPaquete,
        presentacionEtiqueta: buildEtiqueta(tamanoReferencia),
        tamanoValorReferencia: tamanoReferencia?.valor || null,
        stock,
        tipoProductoId:
          row.tipoproductoid !== null ? parseInt(row.tipoproductoid, 10) : null,
        medidaId: row.medidaid !== null ? parseInt(row.medidaid, 10) : null,
        activo: row.activo !== undefined ? row.activo : true,
      };
    });

    const productoDetalle = {
      productoId: producto.productoid,
      nombreProducto: producto.nombreproducto,
      codigoModelo: producto.codigomodelo || null,
      descripcion: producto.descripcion,
      activo: producto.activo,
      categoria: producto.categoriaid
        ? {
            categoriaId: producto.categoriaid,
            nombre: producto.categorianombre,
            descripcion: producto.categoriadescripcion,
          }
        : null,
      totalVariantes: variantes.length,
      variantesConStock: variantes.filter(
        (v) => typeof v.stock === "number" && v.stock > 0
      ).length,
    };

    return res.json({
      success: true,
      message: "Producto obtenido exitosamente",
      data: {
        producto: productoDetalle,
        variantes,
        tamanosDisponibles,
      },
    });
  } catch (error) {
    console.error("Error al obtener detalle de producto:", error);
    return res.status(500).json({
      success: false,
      message: "Error en el servidor",
      error: error.message,
    });
  }
};

/**
 * Obtener todos los productos (para gestión)
 * GET /api/admin/productos
 */
const getAllProductos = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
        p.productoid,
        p.nombreproducto,
        p.descripcion,
        p.categoriaid,
        p.activo,
        COALESCE(SUM(v.stock), 0) AS stock_total,
        COUNT(v.varianteid) AS variantes_count,
        MIN(v.preciounitario) FILTER (WHERE v.preciounitario IS NOT NULL) AS precio_desde,
        JSONB_BUILD_OBJECT(
          'varianteId', v_top.varianteid,
          'sku', v_top.sku,
          'precioUnitario', v_top.preciounitario,
          'stock', v_top.stock,
          'dimensiones', v_top.dimensiones,
          'medidaId', v_top.medidaid
        ) AS variante_destacada,
        JSONB_AGG(
          JSONB_BUILD_OBJECT(
            'varianteId', v.varianteid,
            'sku', v.sku,
            'precioUnitario', v.preciounitario,
            'stock', v.stock,
            'dimensiones', v.dimensiones,
            'medidaId', v.medidaid
          )
        ) FILTER (WHERE v.varianteid IS NOT NULL) AS variantes
      FROM productos p
      LEFT JOIN producto_variantes v ON v.productoid = p.productoid
      LEFT JOIN LATERAL (
        SELECT v2.*
        FROM producto_variantes v2
        WHERE v2.productoid = p.productoid
        ORDER BY v2.stock DESC NULLS LAST, v2.varianteid ASC
        LIMIT 1
      ) v_top ON true
      GROUP BY p.productoid, p.nombreproducto, p.descripcion, p.categoriaid, v_top.varianteid, v_top.sku, v_top.preciounitario, v_top.stock, v_top.dimensiones, v_top.medidaid
      ORDER BY p.productoid DESC`
    );

    const categorias = await db.query(
      "SELECT categoriaid, nombre FROM categorias"
    );
    const categoriasMap = {};
    categorias.rows.forEach((cat) => {
      categoriasMap[cat.categoriaid] = cat.nombre;
    });

    res.json({
      success: true,
      data: {
        productos: result.rows.map((row) => {
          const varianteDestacada =
            row.variante_destacada && row.variante_destacada.varianteId
              ? {
                  varianteId: row.variante_destacada.varianteId,
                  sku: row.variante_destacada.sku,
                  precioUnitario: row.variante_destacada.precioUnitario
                    ? parseFloat(row.variante_destacada.precioUnitario)
                    : null,
                  stock: row.variante_destacada.stock ?? 0,
                  dimensiones: row.variante_destacada.dimensiones || null,
                  medidaId: row.variante_destacada.medidaId || null,
                }
              : null;

          const variantes = Array.isArray(row.variantes)
            ? row.variantes.map((variant) => ({
                varianteId: variant.varianteId,
                sku: variant.sku,
                precioUnitario: variant.precioUnitario
                  ? parseFloat(variant.precioUnitario)
                  : null,
                stock: variant.stock ?? 0,
                dimensiones: variant.dimensiones || null,
                medidaId: variant.medidaId || null,
              }))
            : [];

          return {
            productoid: row.productoid,
            nombreproducto: row.nombreproducto,
            descripcion: row.descripcion,
            activo: row.activo,
            stockTotal: parseInt(row.stock_total, 10) || 0,
            variantesCount: parseInt(row.variantes_count, 10) || 0,
            precioDesde: row.precio_desde ? parseFloat(row.precio_desde) : null,
            categoriaNombre: categoriasMap[row.categoriaid] || "Sin categoría",
            varianteDestacada,
            variantes,
          };
        }),
      },
    });
  } catch (error) {
    console.error("Error al obtener productos:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * Obtener categorías disponibles
 * GET /api/admin/categorias
 */
const getCategorias = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
        c.CategoriaID,
        c.Nombre,
        c.Descripcion,
        c.ParentCategoriaID,
        c.Activo,
        p.Nombre AS ParentNombre
      FROM Categorias c
      LEFT JOIN Categorias p ON c.ParentCategoriaID = p.CategoriaID
      ORDER BY c.Nombre`
    );

    res.json({
      success: true,
      data: {
        categorias: result.rows.map((row) => ({
          categoriaId: row.categoriaid,
          nombre: row.nombre,
          descripcion: row.descripcion,
          parentCategoriaId: row.parentcategoriaid,
          parentNombre: row.parentnombre || null,
          activo: row.activo,
        })),
      },
    });
  } catch (error) {
    console.error("Error al obtener categorías:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * Crear una nueva categoría
 * POST /api/admin/categorias
 */
const crearCategoria = async (req, res) => {
  try {
    const { nombre, descripcion, parentCategoriaId, activo } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({
        success: false,
        message: "El nombre de la categoría es requerido",
      });
    }

    let parentCategoria = null;

    if (parentCategoriaId !== undefined && parentCategoriaId !== null) {
      const parentResult = await db.query(
        "SELECT CategoriaID FROM Categorias WHERE CategoriaID = $1",
        [parentCategoriaId]
      );

      if (parentResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: "La categoría padre especificada no existe",
        });
      }

      parentCategoria = parentCategoriaId;
    }

    const nombreNormalizado = nombre.trim();

    const existente = await db.query(
      "SELECT CategoriaID FROM Categorias WHERE LOWER(Nombre) = LOWER($1)",
      [nombreNormalizado]
    );

    if (existente.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Ya existe una categoría con ese nombre",
      });
    }

    // Gestión de visibilidad: activo por defecto TRUE
    const activoFinal = activo !== undefined ? Boolean(activo) : true;

    const insertResult = await db.query(
      `INSERT INTO Categorias (Nombre, Descripcion, ParentCategoriaID, Activo)
       VALUES ($1, $2, $3, $4)
       RETURNING CategoriaID, Nombre, Descripcion, ParentCategoriaID, Activo`,
      [nombreNormalizado, descripcion?.trim() || null, parentCategoria, activoFinal]
    );

    const categoria = insertResult.rows[0];

    res.status(201).json({
      success: true,
      message: "Categoría creada exitosamente",
      data: {
        categoria: {
          categoriaId: categoria.categoriaid,
          nombre: categoria.nombre,
          descripcion: categoria.descripcion,
          parentCategoriaId: categoria.parentcategoriaid,
          activo: categoria.activo,
        },
      },
    });
  } catch (error) {
    console.error("Error al crear categoría:", error);
    res.status(500).json({
      success: false,
      message: "Error al crear la categoría",
    });
  }
};

/**
 * Actualizar una categoría existente
 * PUT /api/admin/categorias/:id
 */
const actualizarCategoria = async (req, res) => {
  try {
    const categoriaId = parseInt(req.params.id, 10);
    const { nombre, descripcion, parentCategoriaId, activo } = req.body;

    if (Number.isNaN(categoriaId)) {
      return res.status(400).json({
        success: false,
        message: "ID de categoría inválido",
      });
    }

    if (parentCategoriaId && Number(parentCategoriaId) === categoriaId) {
      return res.status(400).json({
        success: false,
        message: "Una categoría no puede ser su propia categoría padre",
      });
    }

    const categoriaResult = await db.query(
      "SELECT CategoriaID, Activo FROM Categorias WHERE CategoriaID = $1",
      [categoriaId]
    );

    if (categoriaResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Categoría no encontrada",
      });
    }

    const categoriaActual = categoriaResult.rows[0];

    let parentCategoria = null;

    if (parentCategoriaId !== undefined && parentCategoriaId !== null) {
      const parentResult = await db.query(
        "SELECT CategoriaID FROM Categorias WHERE CategoriaID = $1",
        [parentCategoriaId]
      );

      if (parentResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: "La categoría padre especificada no existe",
        });
      }

      parentCategoria = parentCategoriaId;
    }

    const nombreNormalizado = nombre?.trim();

    if (nombreNormalizado) {
      const existeNombre = await db.query(
        "SELECT CategoriaID FROM Categorias WHERE LOWER(Nombre) = LOWER($1) AND CategoriaID <> $2",
        [nombreNormalizado, categoriaId]
      );

      if (existeNombre.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: "Ya existe otra categoría con ese nombre",
        });
      }
    }

    // Gestión de visibilidad: mantener el valor actual si no se especifica
    const activoFinal = activo !== undefined ? Boolean(activo) : categoriaActual.activo;

    const updateResult = await db.query(
      `UPDATE Categorias
       SET Nombre = COALESCE($1, Nombre),
           Descripcion = $2,
           ParentCategoriaID = $3,
           Activo = $4
       WHERE CategoriaID = $5
       RETURNING CategoriaID, Nombre, Descripcion, ParentCategoriaID, Activo`,
      [
        nombreNormalizado || null,
        descripcion?.trim() || null,
        parentCategoria,
        activoFinal,
        categoriaId,
      ]
    );

    const categoriaActualizada = updateResult.rows[0];

    res.json({
      success: true,
      message: "Categoría actualizada correctamente",
      data: {
        categoria: {
          categoriaId: categoriaActualizada.categoriaid,
          nombre: categoriaActualizada.nombre,
          descripcion: categoriaActualizada.descripcion,
          parentCategoriaId: categoriaActualizada.parentcategoriaid,
          activo: categoriaActualizada.activo,
        },
      },
    });
  } catch (error) {
    console.error("Error al actualizar categoría:", error);
    res.status(500).json({
      success: false,
      message: "Error al actualizar la categoría",
    });
  }
};

/**
 * Eliminar una categoría
 * DELETE /api/admin/categorias/:id
 */
const eliminarCategoria = async (req, res) => {
  try {
    const categoriaId = parseInt(req.params.id, 10);

    if (Number.isNaN(categoriaId)) {
      return res.status(400).json({
        success: false,
        message: "ID de categoría inválido",
      });
    }

    const categoriaResult = await db.query(
      "SELECT CategoriaID FROM Categorias WHERE CategoriaID = $1",
      [categoriaId]
    );

    if (categoriaResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Categoría no encontrada",
      });
    }

    // Verificar si la categoría tiene subcategorías
    const subcategoriasResult = await db.query(
      "SELECT COUNT(*) AS total FROM Categorias WHERE ParentCategoriaID = $1",
      [categoriaId]
    );

    if (parseInt(subcategoriasResult.rows[0].total, 10) > 0) {
      return res.status(400).json({
        success: false,
        message:
          "No se puede eliminar la categoría porque tiene subcategorías asociadas",
      });
    }

    // Verificar si hay productos asociados a la categoría
    const productosAsociados = await db.query(
      "SELECT COUNT(*) AS total FROM Productos WHERE CategoriaID = $1",
      [categoriaId]
    );

    if (parseInt(productosAsociados.rows[0].total, 10) > 0) {
      return res.status(400).json({
        success: false,
        message:
          "No se puede eliminar la categoría porque existen productos asociados",
      });
    }

    // Verificar si hay variantes usando productos de esta categoría
    const productosEnUso = await db.query(
      `SELECT COUNT(*) AS total
       FROM Producto_Variantes pv
       INNER JOIN Productos p ON pv.ProductoID = p.ProductoID
       WHERE p.CategoriaID = $1`,
      [categoriaId]
    );

    if (parseInt(productosEnUso.rows[0].total, 10) > 0) {
      return res.status(400).json({
        success: false,
        message:
          "No se puede eliminar la categoría porque existen productos asociados",
      });
    }

    await db.query("DELETE FROM Categorias WHERE CategoriaID = $1", [
      categoriaId,
    ]);

    res.json({
      success: true,
      message: "Categoría eliminada correctamente",
    });
  } catch (error) {
    console.error("Error al eliminar categoría:", error);
    res.status(500).json({
      success: false,
      message: "Error al eliminar la categoría",
    });
  }
};

/**
 * Crear un nuevo agente
 * POST /api/admin/agentes
 */
const crearAgente = async (req, res) => {
  try {
    const { nombre, apellido, email, password, telefono } = req.body;

    // Validaciones
    if (!nombre || !apellido || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Todos los campos obligatorios deben ser proporcionados",
      });
    }

    // Verificar si el email ya existe
    const emailCheck = await db.query(
      "SELECT AgenteID FROM AgentesDeVentas WHERE Email = $1",
      [email]
    );

    if (emailCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: "El email ya está registrado",
      });
    }

    const nuevoCodigoAgente = await generateCodigoAgente(db);

    // Hash de la contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insertar el agente
    const result = await db.query(
      `INSERT INTO AgentesDeVentas 
        (Nombre, Apellido, Email, PasswordHash, CodigoAgente, Activo)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING AgenteID, Nombre, Apellido, Email, CodigoAgente`,
      [nombre, apellido, email, hashedPassword, nuevoCodigoAgente]
    );

    const agente = result.rows[0];

    res.status(201).json({
      success: true,
      message: "Agente creado exitosamente",
      data: {
        agenteId: agente.agenteid,
        nombre: agente.nombre,
        apellido: agente.apellido,
        email: agente.email,
        codigoAgente: agente.codigoagente,
      },
    });
  } catch (error) {
    console.error("Error al crear agente:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
      error: error.message,
    });
  }
};

/**
 * Obtener todos los agentes
 * GET /api/admin/agentes
 */
const getAllAgentes = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
        a.AgenteID,
        a.Nombre,
        a.Apellido,
        a.Email,
        a.CodigoAgente,
        a.Activo,
        COUNT(DISTINCT p.PedidoID) as TotalVentas,
        COALESCE(SUM(p.MontoTotal), 0) as MontoTotalVentas,
        COALESCE(SUM(c.MontoComision), 0) as ComisionesTotales
      FROM AgentesDeVentas a
      LEFT JOIN Pedidos p ON a.AgenteID = p.AgenteID
      LEFT JOIN Comisiones c ON a.AgenteID = c.AgenteID
      GROUP BY a.AgenteID
      ORDER BY a.AgenteID DESC`
    );

    res.json({
      success: true,
      data: {
        agentes: result.rows.map((row) => ({
          agenteId: row.agenteid,
          nombre: row.nombre,
          apellido: row.apellido,
          email: row.email,
          codigoAgente: row.codigoagente,
          telefono: row.telefono,
          activo: row.activo,
          fechaCreacion: row.fechacreacion,
          totalVentas: parseInt(row.totalventas),
          montoTotalVentas: parseFloat(row.montototalventas),
          comisionesTotales: parseFloat(row.comisionestotales),
        })),
      },
    });
  } catch (error) {
    console.error("Error al obtener agentes:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * Obtener detalles de un agente específico
 * GET /api/admin/agentes/:id
 */
const getAgenteDetalle = async (req, res) => {
  try {
    const agenteId = parseInt(req.params.id);

    // Obtener información del agente
    const agenteResult = await db.query(
      `SELECT 
        AgenteID, Nombre, Apellido, Email, CodigoAgente, Activo
      FROM AgentesDeVentas
      WHERE AgenteID = $1`,
      [agenteId]
    );

    if (agenteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Agente no encontrado",
      });
    }

    const agente = agenteResult.rows[0];

    // Obtener ventas del agente
    const ventasResult = await db.query(
      `SELECT 
        p.PedidoID,
        p.FechaPedido,
        p.MontoTotal,
        p.Estatus,
        c.Nombre || ' ' || c.Apellido as ClienteNombre
      FROM Pedidos p
      INNER JOIN Clientes c ON p.ClienteID = c.ClienteID
      WHERE p.AgenteID = $1
      ORDER BY p.FechaPedido DESC`,
      [agenteId]
    );

    // Obtener comisiones del agente
    const comisionesResult = await db.query(
      `SELECT 
        ComisionID,
        PedidoID,
        MontoComision,
        Estatus
      FROM Comisiones
      WHERE AgenteID = $1
      ORDER BY ComisionID DESC`,
      [agenteId]
    );

    res.json({
      success: true,
      data: {
        agente: {
          agenteId: agente.agenteid,
          nombre: agente.nombre,
          apellido: agente.apellido,
          email: agente.email,
          codigoAgente: agente.codigoagente,
          activo: agente.activo,
        },
        ventas: ventasResult.rows.map((row) => ({
          pedidoId: row.pedidoid,
          fechaPedido: row.fechapedido,
          montoTotal: parseFloat(row.montototal),
          estatus: row.estatus,
          clienteNombre: row.clientenombre,
        })),
        comisiones: comisionesResult.rows.map((row) => ({
          comisionId: row.comisionid,
          pedidoId: row.pedidoid,
          montoComision: parseFloat(row.montocomision),
          estatus: row.estatus,
        })),
      },
    });
  } catch (error) {
    console.error("Error al obtener detalle de agente:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * Desactivar un agente (soft delete)
 * PUT /api/admin/agentes/:id/desactivar
 */
const desactivarAgente = async (req, res) => {
  try {
    const agenteId = parseInt(req.params.id);

    const result = await db.query(
      `UPDATE AgentesDeVentas 
       SET Activo = FALSE 
       WHERE AgenteID = $1
       RETURNING AgenteID, Nombre, Apellido`,
      [agenteId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Agente no encontrado",
      });
    }

    const agente = result.rows[0];

    res.json({
      success: true,
      message: `Agente ${agente.nombre} ${agente.apellido} desactivado exitosamente`,
      data: {
        agenteId: agente.agenteid,
      },
    });
  } catch (error) {
    console.error("Error al desactivar agente:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * Obtener todas las comisiones
 * GET /api/admin/comisiones
 */
const getAllComisiones = async (req, res) => {
  try {
    const { estatus } = req.query;

    let query = `
      SELECT 
        c.ComisionID,
        c.PedidoID,
        c.AgenteID,
        a.Nombre || ' ' || a.Apellido as AgenteNombre,
        a.CodigoAgente,
        c.MontoComision,
        c.Estatus,
        c.FechaCalculo,
        NULL::timestamp AS FechaPago,
        p.MontoTotal as MontoVenta
      FROM Comisiones c
      INNER JOIN AgentesDeVentas a ON c.AgenteID = a.AgenteID
      INNER JOIN Pedidos p ON c.PedidoID = p.PedidoID
    `;

    const params = [];
    if (estatus) {
      query += " WHERE c.Estatus = $1";
      params.push(estatus);
    }

    query += " ORDER BY c.FechaCalculo DESC";

    const result = await db.query(query, params);

    res.json({
      success: true,
      data: {
        comisiones: result.rows.map((row) => ({
          comisionId: row.comisionid,
          pedidoId: row.pedidoid,
          agenteId: row.agenteid,
          agenteNombre: row.agentenombre,
          codigoAgente: row.codigoagente,
          montoComision: parseFloat(row.montocomision),
          estatus: row.estatus,
          fechaCalculo: row.fechacalculo,
          fechaGeneracion: row.fechacalculo,
          fechaPago: row.fechapago,
          montoVenta: parseFloat(row.montoventa),
        })),
      },
    });
  } catch (error) {
    console.error("Error al obtener comisiones:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * Pagar una comisión
 * PUT /api/admin/comisiones/:id/pagar
 */
const pagarComision = async (req, res) => {
  try {
    const comisionId = parseInt(req.params.id);

    // Verificar que la comisión existe y está pendiente
    const checkResult = await db.query(
      "SELECT * FROM Comisiones WHERE ComisionID = $1",
      [comisionId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Comisión no encontrada",
      });
    }

    const comision = checkResult.rows[0];

    if (comision.estatus === "Pagada") {
      return res.status(400).json({
        success: false,
        message: "Esta comisión ya ha sido pagada",
      });
    }

    // Actualizar el estatus a Pagada
    const result = await db.query(
      `UPDATE Comisiones 
       SET Estatus = 'Pagada'
       WHERE ComisionID = $1
       RETURNING *`,
      [comisionId]
    );

    const comisionActualizada = result.rows[0];

    res.json({
      success: true,
      message: "Comisión marcada como pagada",
      data: {
        comisionId: comisionActualizada.comisionid,
        montoComision: parseFloat(comisionActualizada.montocomision),
        estatus: comisionActualizada.estatus,
      },
    });
  } catch (error) {
    console.error("Error al pagar comisión:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * Obtener todos los clientes
 * GET /api/admin/clientes
 */
const getAllClientes = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
        c.ClienteID,
        c.Nombre,
        c.Apellido,
        c.Email,
        c.Telefono,
        c.Activo,
        c.FechaDeRegistro,
        COUNT(DISTINCT p.PedidoID) AS TotalPedidos,
        COALESCE(SUM(p.MontoTotal), 0) AS MontoTotalCompras
      FROM Clientes c
      LEFT JOIN Pedidos p ON c.ClienteID = p.ClienteID
      GROUP BY c.ClienteID
      ORDER BY c.FechaDeRegistro DESC`
    );

    res.json({
      success: true,
      data: {
        clientes: result.rows.map((row) => ({
          clienteId: row.clienteid,
          nombre: row.nombre,
          apellido: row.apellido,
          email: row.email,
          telefono: row.telefono,
          activo: row.activo,
          fechaRegistro: row.fechaderegistro,
          totalPedidos: parseInt(row.totalpedidos),
          montoTotalCompras: parseFloat(row.montototalcompras),
        })),
      },
    });
  } catch (error) {
    console.error("Error al obtener clientes:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * Obtener detalle de un pedido
 * GET /api/admin/pedidos/:id/detalle
 */
const getPedidoDetalle = async (req, res) => {
  try {
    const pedidoId = parseInt(req.params.id);

    // Obtener información del pedido
    const pedidoResult = await db.query(
      `SELECT 
        p.*,
        c.Nombre as ClienteNombre,
        c.Apellido as ClienteApellido,
        c.Email as ClienteEmail,
        c.Telefono as ClienteTelefono,
        a.Nombre as AgenteNombre,
        a.Apellido as AgenteApellido,
        a.CodigoAgente,
        d.Calle,
        d.NumeroExt,
        d.NumeroInt,
        d.Colonia,
        d.Ciudad,
        d.EstadoID,
        e.Nombre as EstadoNombre,
        e.Abreviatura as EstadoAbreviatura,
        d.CodigoPostal,
        d.TelefonoContacto as Referencias
      FROM Pedidos p
      INNER JOIN Clientes c ON p.ClienteID = c.ClienteID
      LEFT JOIN AgentesDeVentas a ON p.AgenteID = a.AgenteID
      LEFT JOIN Cliente_Direcciones d ON p.DireccionEnvioID = d.DireccionID
      LEFT JOIN Estados e ON d.EstadoID = e.EstadoID
      WHERE p.PedidoID = $1`,
      [pedidoId]
    );

    if (pedidoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pedido no encontrado",
      });
    }

    const pedido = pedidoResult.rows[0];

    // Obtener detalles de productos del pedido
    const detallesResult = await db.query(
      `SELECT 
        dp.DetalleID,
        dp.PedidoID,
        dp.VarianteID,
        dp.TamanoID,
        dp.CantidadPaquetes,
        dp.PrecioPorPaquete,
        dp.PiezasTotales,
        dp.PrecioUnitario,
        COALESCE(
          dp.PrecioUnitario, 
          ROUND(dp.PrecioPorPaquete / NULLIF((dp.PiezasTotales / NULLIF(dp.CantidadPaquetes, 0)), 0), 2)
        ) as PrecioUnitarioCalculado,
        pv.SKU,
        pv.Dimensiones,
        pv.ProductoID,
        pr.NombreProducto,
        row_to_json(ct) as tamano_info
      FROM DetallesDelPedido dp
      INNER JOIN Producto_Variantes pv ON dp.VarianteID = pv.VarianteID
      INNER JOIN Productos pr ON pv.ProductoID = pr.ProductoID
      LEFT JOIN Cat_TamanoPaquetes ct ON dp.TamanoID = ct.TamanoID
      WHERE dp.PedidoID = $1`,
      [pedidoId]
    );

    res.json({
      success: true,
      data: {
        pedido: {
          pedidoId: pedido.pedidoid,
          fechaPedido: pedido.fechapedido,
          estatus: pedido.estatus,
          montoTotal: parseFloat(pedido.montototal),
          costoEnvio:
            pedido.costoenvio !== null ? parseFloat(pedido.costoenvio) : null,
          cliente: {
            nombre: `${pedido.clientenombre} ${pedido.clienteapellido}`,
            email: pedido.clienteemail,
            telefono: pedido.clientetelefono,
          },
          agente: pedido.agentenombre
            ? {
                nombre: `${pedido.agentenombre} ${pedido.agenteapellido}`,
                codigo: pedido.codigoagente,
              }
            : null,
          direccion: {
            calle: pedido.calle,
            numeroExterior: pedido.numeroext,
            numeroInterior: pedido.numeroint,
            colonia: pedido.colonia,
            ciudad: pedido.ciudad,
            estadoId:
              pedido.estadoid !== null ? parseInt(pedido.estadoid, 10) : null,
            estado: pedido.estadonombre || null,
            estadoNombre: pedido.estadonombre || null,
            estadoAbreviatura: pedido.estadoabreviatura || null,
            codigoPostal: pedido.codigopostal,
            referencias: pedido.referencias,
          },
        },
        productos: detallesResult.rows.map((row) => {
          // Extraer piezasPorPaquete del tamano_info JSON
          const tamanoInfo = row.tamano_info || {};
          const piezasPorPaquete =
            tamanoInfo.valor ||
            tamanoInfo.cantidad ||
            tamanoInfo.piezas ||
            tamanoInfo.piezasporpaquete ||
            tamanoInfo.numeropiezas ||
            null;

          return {
            detalleId: row.detalleid,
            productoId: row.productoid,
            varianteId: row.varianteid,
            nombre: row.nombreproducto,
            sku: row.sku,
            cantidadPaquetes: parseInt(row.cantidadpaquetes, 10),
            piezasPorPaquete,
            precioPorPaquete: row.precioporpaquete
              ? parseFloat(row.precioporpaquete)
              : 0,
            precioUnitario: row.preciounitariocalculado
              ? parseFloat(row.preciounitariocalculado)
              : 0,
            piezasTotales: parseInt(row.piezastotales, 10),
            dimensiones: row.dimensiones || null,
            subtotal: row.precioporpaquete
              ? parseFloat((row.cantidadpaquetes || 0) * row.precioporpaquete)
              : 0,
          };
        }),
      },
    });
  } catch (error) {
    console.error("Error al obtener detalle del pedido:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * ============================================
 * GESTIÓN DE PROVEEDORES
 * ============================================
 */

/**
 * Obtener todos los proveedores
 * GET /api/admin/proveedores
 */
const getAllProveedores = async (req, res) => {
  try {
    const query = `
      SELECT 
        ProveedorID,
        NombreEmpresa,
        ContactoNombre,
        Email,
        Telefono,
        RazonSocial,
        RFC,
        RegimenFiscal,
        Calle,
        Colonia,
        CodigoPostal,
        Ciudad,
        Estado,
        NombreRepresentanteVentas,
        CelularVentas,
        EmailVentas,
        NombreContactoCobranza,
        TelefonoCobranza,
        EmailCobranza,
        Banco,
        NumeroCuenta,
        CLABE,
        ReferenciaPago,
        DiasCredito,
        LimiteCredito,
        DescuentoFinanciero,
        MinimoCompra,
        AceptaDevoluciones
      FROM Proveedores
      ORDER BY NombreEmpresa ASC
    `;

    const result = await db.query(query);

    res.json({
      success: true,
      message: "Proveedores obtenidos exitosamente",
      data: {
        proveedores: result.rows,
        total: result.rows.length,
      },
    });
  } catch (error) {
    console.error("Error al obtener proveedores:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener proveedores",
    });
  }
};

/**
 * Crear un nuevo proveedor
 * POST /api/admin/proveedores
 */
const crearProveedor = async (req, res) => {
  try {
    const {
      nombreEmpresa,
      contactoNombre,
      email,
      telefono,
      razonSocial,
      rfc,
      regimenFiscal,
      calle,
      colonia,
      cp,
      ciudad,
      estado,
      nombreRepresentanteVentas,
      celularVentas,
      emailVentas,
      nombreContactoCobranza,
      telefonoCobranza,
      emailCobranza,
      banco,
      numeroCuenta,
      clabe,
      referenciaPago,
      diasCredito,
      limiteCredito,
      descuentoFinanciero,
      minimoCompra,
      aceptaDevoluciones,
    } = req.body;

    // Helper function to convert empty strings to NULL
    const toNullIfEmpty = (value) => {
      if (value === null || value === undefined) return null;
      if (typeof value === "string" && value.trim() === "") return null;
      return typeof value === "string" ? value.trim() : value;
    };

    // Validaciones
    if (!nombreEmpresa || nombreEmpresa.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "El nombre de la empresa es requerido",
      });
    }

    // Validar email principal si se proporciona
    if (email && email.trim() !== "") {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          message: "El email no tiene un formato válido",
        });
      }
    }

    // Validar email de ventas si se proporciona
    if (emailVentas && emailVentas.trim() !== "") {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailVentas)) {
        return res.status(400).json({
          success: false,
          message: "El email de ventas no tiene un formato válido",
        });
      }
    }

    // Validar email de cobranza si se proporciona
    if (emailCobranza && emailCobranza.trim() !== "") {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailCobranza)) {
        return res.status(400).json({
          success: false,
          message: "El email de cobranza no tiene un formato válido",
        });
      }
    }

    const query = `
      INSERT INTO Proveedores (
        NombreEmpresa, ContactoNombre, Email, Telefono,
        RazonSocial, RFC, RegimenFiscal, Calle, Colonia, CodigoPostal, Ciudad, Estado,
        NombreRepresentanteVentas, CelularVentas, EmailVentas,
        NombreContactoCobranza, TelefonoCobranza, EmailCobranza,
        Banco, NumeroCuenta, CLABE, ReferenciaPago,
        DiasCredito, LimiteCredito, DescuentoFinanciero, MinimoCompra, AceptaDevoluciones
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
      RETURNING *
    `;

    const values = [
      nombreEmpresa.trim(),
      toNullIfEmpty(contactoNombre),
      toNullIfEmpty(email),
      toNullIfEmpty(telefono),
      toNullIfEmpty(razonSocial),
      toNullIfEmpty(rfc),
      toNullIfEmpty(regimenFiscal),
      toNullIfEmpty(calle),
      toNullIfEmpty(colonia),
      toNullIfEmpty(cp),
      toNullIfEmpty(ciudad),
      toNullIfEmpty(estado),
      toNullIfEmpty(nombreRepresentanteVentas),
      toNullIfEmpty(celularVentas),
      toNullIfEmpty(emailVentas),
      toNullIfEmpty(nombreContactoCobranza),
      toNullIfEmpty(telefonoCobranza),
      toNullIfEmpty(emailCobranza),
      toNullIfEmpty(banco),
      toNullIfEmpty(numeroCuenta),
      toNullIfEmpty(clabe),
      toNullIfEmpty(referenciaPago),
      diasCredito ? parseInt(diasCredito) : null,
      limiteCredito ? parseFloat(limiteCredito) : null,
      toNullIfEmpty(descuentoFinanciero),
      minimoCompra ? parseFloat(minimoCompra) : null,
      aceptaDevoluciones !== undefined ? Boolean(aceptaDevoluciones) : null,
    ];

    const result = await db.query(query, values);
    const nuevoProveedor = result.rows[0];

    console.log("✅ Proveedor creado:", nuevoProveedor);

    res.status(201).json({
      success: true,
      message: "Proveedor creado exitosamente",
      data: {
        proveedor: nuevoProveedor,
      },
    });
  } catch (error) {
    console.error("Error al crear proveedor:", error);
    res.status(500).json({
      success: false,
      message: "Error al crear el proveedor",
    });
  }
};

/**
 * Actualizar un proveedor existente
 * PUT /api/admin/proveedores/:id
 */
const actualizarProveedor = async (req, res) => {
  try {
    const proveedorId = parseInt(req.params.id);
    const {
      nombreEmpresa,
      contactoNombre,
      email,
      telefono,
      razonSocial,
      rfc,
      regimenFiscal,
      calle,
      colonia,
      cp,
      ciudad,
      estado,
      nombreRepresentanteVentas,
      celularVentas,
      emailVentas,
      nombreContactoCobranza,
      telefonoCobranza,
      emailCobranza,
      banco,
      numeroCuenta,
      clabe,
      referenciaPago,
      diasCredito,
      limiteCredito,
      descuentoFinanciero,
      minimoCompra,
      aceptaDevoluciones,
    } = req.body;

    // Helper function to convert empty strings to NULL
    const toNullIfEmpty = (value) => {
      if (value === null || value === undefined) return null;
      if (typeof value === "string" && value.trim() === "") return null;
      return typeof value === "string" ? value.trim() : value;
    };

    // Validaciones
    if (!nombreEmpresa || nombreEmpresa.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "El nombre de la empresa es requerido",
      });
    }

    // Validar email principal si se proporciona
    if (email && email.trim() !== "") {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          message: "El email no tiene un formato válido",
        });
      }
    }

    // Validar email de ventas si se proporciona
    if (emailVentas && emailVentas.trim() !== "") {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailVentas)) {
        return res.status(400).json({
          success: false,
          message: "El email de ventas no tiene un formato válido",
        });
      }
    }

    // Validar email de cobranza si se proporciona
    if (emailCobranza && emailCobranza.trim() !== "") {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailCobranza)) {
        return res.status(400).json({
          success: false,
          message: "El email de cobranza no tiene un formato válido",
        });
      }
    }

    // Verificar que el proveedor existe
    const checkQuery =
      "SELECT ProveedorID FROM Proveedores WHERE ProveedorID = $1";
    const checkResult = await db.query(checkQuery, [proveedorId]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Proveedor no encontrado",
      });
    }

    const query = `
      UPDATE Proveedores
      SET 
        NombreEmpresa = $1,
        ContactoNombre = $2,
        Email = $3,
        Telefono = $4,
        RazonSocial = $5,
        RFC = $6,
        RegimenFiscal = $7,
        Calle = $8,
        Colonia = $9,
        CodigoPostal = $10,
        Ciudad = $11,
        Estado = $12,
        NombreRepresentanteVentas = $13,
        CelularVentas = $14,
        EmailVentas = $15,
        NombreContactoCobranza = $16,
        TelefonoCobranza = $17,
        EmailCobranza = $18,
        Banco = $19,
        NumeroCuenta = $20,
        CLABE = $21,
        ReferenciaPago = $22,
        DiasCredito = $23,
        LimiteCredito = $24,
        DescuentoFinanciero = $25,
        MinimoCompra = $26,
        AceptaDevoluciones = $27
      WHERE ProveedorID = $28
      RETURNING *
    `;

    const values = [
      nombreEmpresa.trim(),
      toNullIfEmpty(contactoNombre),
      toNullIfEmpty(email),
      toNullIfEmpty(telefono),
      toNullIfEmpty(razonSocial),
      toNullIfEmpty(rfc),
      toNullIfEmpty(regimenFiscal),
      toNullIfEmpty(calle),
      toNullIfEmpty(colonia),
      toNullIfEmpty(cp),
      toNullIfEmpty(ciudad),
      toNullIfEmpty(estado),
      toNullIfEmpty(nombreRepresentanteVentas),
      toNullIfEmpty(celularVentas),
      toNullIfEmpty(emailVentas),
      toNullIfEmpty(nombreContactoCobranza),
      toNullIfEmpty(telefonoCobranza),
      toNullIfEmpty(emailCobranza),
      toNullIfEmpty(banco),
      toNullIfEmpty(numeroCuenta),
      toNullIfEmpty(clabe),
      toNullIfEmpty(referenciaPago),
      diasCredito ? parseInt(diasCredito) : null,
      limiteCredito ? parseFloat(limiteCredito) : null,
      toNullIfEmpty(descuentoFinanciero),
      minimoCompra ? parseFloat(minimoCompra) : null,
      aceptaDevoluciones !== undefined ? Boolean(aceptaDevoluciones) : null,
      proveedorId,
    ];

    const result = await db.query(query, values);
    const proveedorActualizado = result.rows[0];

    console.log("✅ Proveedor actualizado:", proveedorActualizado);

    res.json({
      success: true,
      message: "Proveedor actualizado exitosamente",
      data: {
        proveedor: proveedorActualizado,
      },
    });
  } catch (error) {
    console.error("Error al actualizar proveedor:", error);
    res.status(500).json({
      success: false,
      message: "Error al actualizar el proveedor",
    });
  }
};

/**
 * ============================================
 * GESTIÓN DE ÓRDENES DE COMPRA
 * ============================================
 */

/**
 * Obtener todas las órdenes de compra (con filtro por estatus)
 * GET /api/admin/ordenes-compra
 */
const getAllOrdenesCompra = async (req, res) => {
  try {
    const { estatus } = req.query;

    // DEBUG: Ver todas las órdenes primero
    const debugQuery = await db.query(`
      SELECT OrdenCompraID, OrigenOC, Estatus 
      FROM OrdenesDeCompra 
      ORDER BY FechaCreacion DESC 
      LIMIT 10
    `);
    console.log("🔍 DEBUG - Todas las órdenes recientes:", debugQuery.rows);

    let query = `
      SELECT 
        oc.OrdenCompraID,
        oc.ProveedorID,
        oc.FechaCreacion,
        oc.FechaEntregaEsperada,
        oc.Estatus,
        oc.OrigenOC,
        p.NombreEmpresa as ProveedorNombre,
        COUNT(doc.DetalleOC_ID) as TotalProductos
      FROM OrdenesDeCompra oc
      INNER JOIN Proveedores p ON oc.ProveedorID = p.ProveedorID
      LEFT JOIN DetallesOrdenCompra doc ON oc.OrdenCompraID = doc.OrdenCompraID
      WHERE oc.OrigenOC = 'backorder'
    `;

    const values = [];

    // Filtrar por estatus si se proporciona (además del filtro de backorder)
    if (estatus) {
      if (estatus === "Pendiente,Parcial") {
        query += ` AND oc.Estatus IN ('Pendiente', 'Parcial')`;
      } else {
        query += ` AND oc.Estatus = $1`;
        values.push(estatus);
      }
    }

    query += `
      GROUP BY oc.OrdenCompraID, oc.ProveedorID, oc.FechaCreacion, 
               oc.FechaEntregaEsperada, oc.Estatus, oc.OrigenOC, p.NombreEmpresa
      ORDER BY oc.FechaCreacion DESC
    `;

    const result = await db.query(query, values);

    console.log(
      "🔍 DEBUG - Órdenes de backorder encontradas:",
      result.rows.length
    );
    console.log("🔍 DEBUG - Filtro estatus:", estatus);

    res.json({
      success: true,
      message: "Órdenes de compra de backorder obtenidas exitosamente",
      data: {
        ordenes: result.rows.map((row) => ({
          ordenCompraId: row.ordencompraid,
          proveedorId: row.proveedorid,
          proveedorNombre: row.proveedornombre,
          fechaCreacion: row.fechacreacion,
          fechaEntregaEsperada: row.fechaentregaesperada,
          estatus: row.estatus,
          origenOC: row.origenoc,
          totalProductos: parseInt(row.totalproductos),
        })),
        total: result.rows.length,
      },
    });
  } catch (error) {
    console.error("Error al obtener órdenes de compra:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener órdenes de compra",
    });
  }
};

/**
 * Obtener detalles de una orden de compra específica
 * GET /api/admin/ordenes-compra/:id/detalles
 */
const getDetallesOrdenCompra = async (req, res) => {
  try {
    const ordenCompraId = parseInt(req.params.id);

    // Obtener información de la orden
    const ordenQuery = `
      SELECT 
        oc.ordencompraid,
        oc.proveedorid,
        oc.fechacreacion,
        oc.fechaentregaesperada,
        oc.estatus,
        p.nombreempresa as proveedornombre,
        p.contactonombre as proveedorcontacto
      FROM ordenesdecompra oc
      INNER JOIN proveedores p ON oc.proveedorid = p.proveedorid
      WHERE oc.ordencompraid = $1
    `;

    const ordenResult = await db.query(ordenQuery, [ordenCompraId]);

    if (ordenResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Orden de compra no encontrada",
      });
    }

    const orden = ordenResult.rows[0];

    // Obtener detalles de productos
    const detallesQuery = `
      SELECT 
        doc.detalleoc_id,
        doc.ordencompraid,
        doc.varianteid,
        doc.cantidadsolicitada,
        doc.cantidadrecibida,
        pv.productoid,
        pv.sku,
        pv.dimensiones,
        pv.medidaid,
        COALESCE(pv.stock, 0) AS stockvariante,
        pr.nombreproducto
      FROM detallesordencompra doc
      INNER JOIN producto_variantes pv ON doc.varianteid = pv.varianteid
      INNER JOIN productos pr ON pv.productoid = pr.productoid
      WHERE doc.ordencompraid = $1
      ORDER BY pr.nombreproducto ASC
    `;

    const detallesResult = await db.query(detallesQuery, [ordenCompraId]);

    res.json({
      success: true,
      message: "Detalles obtenidos exitosamente",
      data: {
        orden: {
          ordenCompraId: orden.ordencompraid,
          proveedorId: orden.proveedorid,
          proveedorNombre: orden.proveedornombre,
          proveedorContacto: orden.proveedorcontacto,
          fechaCreacion: orden.fechacreacion,
          fechaEntregaEsperada: orden.fechaentregaesperada,
          estatus: orden.estatus,
        },
        detalles: detallesResult.rows.map((row) => ({
          detalleId: row.detalleoc_id,
          ordenCompraId: row.ordencompraid,
          varianteId: row.varianteid,
          productoId: row.productoid,
          nombreProducto: row.nombreproducto,
          sku: row.sku,
          dimensiones: row.dimensiones,
          medidaId: row.medidaid,
          cantidadSolicitada: row.cantidadsolicitada,
          cantidadRecibida: row.cantidadrecibida,
          cantidadPendiente: row.cantidadsolicitada - row.cantidadrecibida,
          stockVariante: row.stockvariante,
        })),
      },
    });
  } catch (error) {
    console.error("Error al obtener detalles de orden de compra:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener detalles de la orden de compra",
    });
  }
};

/**
 * Recibir inventario de una orden de compra
 * POST /api/admin/ordenes-compra/recibir
 */
const recibirInventario = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const { ordenCompraId, productos, adminId } = req.body;

    // Validaciones
    if (!ordenCompraId) {
      return res.status(400).json({
        success: false,
        message: "El ID de la orden de compra es requerido",
      });
    }

    if (!productos || !Array.isArray(productos) || productos.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Debe incluir al menos un producto para recibir",
      });
    }

    // Validar cada producto
    for (const producto of productos) {
      if (!producto.detalleId || producto.cantidadRecibidaAhora === undefined) {
        return res.status(400).json({
          success: false,
          message: "Cada producto debe tener detalleId y cantidadRecibidaAhora",
        });
      }

      if (producto.cantidadRecibidaAhora < 0) {
        return res.status(400).json({
          success: false,
          message: "La cantidad recibida no puede ser negativa",
        });
      }
    }

    // Iniciar transacción
    await client.query("BEGIN");

    // Verificar que la orden existe
    const ordenCheck = await client.query(
      "SELECT OrdenCompraID, Estatus FROM OrdenesDeCompra WHERE OrdenCompraID = $1",
      [ordenCompraId]
    );

    if (ordenCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Orden de compra no encontrada",
      });
    }

    const productosActualizados = [];

    // Procesar cada producto
    for (const producto of productos) {
      const cantidadRecibida = parseInt(producto.cantidadRecibidaAhora, 10);

      if (cantidadRecibida === 0) {
        continue; // Saltar si no se recibió nada
      }

      // 1. Obtener información del detalle actual
      const detalleQuery = `
        SELECT 
          doc.DetalleOC_ID,
          doc.VarianteID,
          doc.CantidadSolicitada,
          doc.CantidadRecibida,
          pv.ProductoID,
          pv.SKU,
          pv.Dimensiones,
          pv.MedidaID,
          pv.Stock AS StockVariante,
          pr.NombreProducto
        FROM DetallesOrdenCompra doc
        INNER JOIN Producto_Variantes pv ON doc.VarianteID = pv.VarianteID
        INNER JOIN Productos pr ON pv.ProductoID = pr.ProductoID
        WHERE doc.DetalleOC_ID = $1 AND doc.OrdenCompraID = $2
      `;

      const detalleResult = await client.query(detalleQuery, [
        producto.detalleId,
        ordenCompraId,
      ]);

      if (detalleResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          message: `Detalle ${producto.detalleId} no encontrado en esta orden`,
        });
      }

      const detalle = detalleResult.rows[0];
      const nuevaCantidadRecibida = detalle.cantidadrecibida + cantidadRecibida;

      // Validar que no se exceda la cantidad solicitada
      if (nuevaCantidadRecibida > detalle.cantidadsolicitada) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: `No puede recibir más de lo solicitado para ${detalle.nombreproducto}. Solicitado: ${detalle.cantidadsolicitada}, Ya recibido: ${detalle.cantidadrecibida}`,
        });
      }

      // 2. Actualizar CantidadRecibida en DetallesOrdenCompra
      await client.query(
        `UPDATE DetallesOrdenCompra 
         SET CantidadRecibida = CantidadRecibida + $1 
         WHERE DetalleOC_ID = $2`,
        [cantidadRecibida, producto.detalleId]
      );

      // 3. Actualizar Stock en la variante seleccionada
      const nuevoStockVariante =
        (detalle.stockvariante || 0) + cantidadRecibida;
      await client.query(
        `UPDATE Producto_Variantes 
         SET Stock = COALESCE(Stock, 0) + $1 
         WHERE VarianteID = $2`,
        [cantidadRecibida, detalle.varianteid]
      );

      // 4. Registrar movimiento en Log_Inventario
      await client.query(
        `INSERT INTO Log_Inventario 
         (VarianteID, CantidadCambiado, NuevoStock, Motivo, UsuarioID) 
         VALUES ($1, $2, $3, $4, $5)`,
        [
          detalle.varianteid,
          cantidadRecibida,
          nuevoStockVariante,
          `Recepción de OC #${ordenCompraId}`,
          adminId || null,
        ]
      );

      productosActualizados.push({
        productoId: detalle.productoid,
        varianteId: detalle.varianteid,
        nombreProducto: detalle.nombreproducto,
        sku: detalle.sku,
        medidaId: detalle.medidaid,
        dimensiones: detalle.dimensiones,
        cantidadRecibidaAhora: cantidadRecibida,
        cantidadRecibidaTotal: nuevaCantidadRecibida,
        cantidadSolicitada: detalle.cantidadsolicitada,
        stockVariante: nuevoStockVariante,
      });
    }

    // 5. Actualizar el Estatus de la OrdenDeCompra
    // Obtener suma total de solicitado vs recibido
    const estatusQuery = `
      SELECT 
        SUM(CantidadSolicitada) as TotalSolicitado,
        SUM(CantidadRecibida) as TotalRecibido
      FROM DetallesOrdenCompra
      WHERE OrdenCompraID = $1
    `;

    const estatusResult = await client.query(estatusQuery, [ordenCompraId]);
    const { totalsolicitado, totalrecibido } = estatusResult.rows[0];

    let nuevoEstatus;
    if (parseInt(totalrecibido) >= parseInt(totalsolicitado)) {
      nuevoEstatus = "Completada";
    } else if (parseInt(totalrecibido) > 0) {
      nuevoEstatus = "Parcial";
    } else {
      nuevoEstatus = "Pendiente";
    }

    await client.query(
      "UPDATE OrdenesDeCompra SET Estatus = $1 WHERE OrdenCompraID = $2",
      [nuevoEstatus, ordenCompraId]
    );

    // Commit de la transacción
    await client.query("COMMIT");

    console.log("✅ Inventario recibido:", {
      ordenCompraId,
      productosActualizados: productosActualizados.length,
      nuevoEstatus,
    });

    res.json({
      success: true,
      message: "Inventario recibido exitosamente",
      data: {
        ordenCompraId,
        nuevoEstatus,
        productosActualizados,
        totalSolicitado: parseInt(totalsolicitado),
        totalRecibido: parseInt(totalrecibido),
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al recibir inventario:", error);
    res.status(500).json({
      success: false,
      message: "Error al recibir el inventario",
    });
  } finally {
    client.release();
  }
};

/**
 * Crear una nueva orden de compra
 * POST /api/admin/ordenes-compra
 */
const crearOrdenCompra = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const { proveedorId, fechaEntregaEsperada, productos } = req.body;

    // Validaciones
    if (!proveedorId) {
      return res.status(400).json({
        success: false,
        message: "El proveedor es requerido",
      });
    }

    if (!fechaEntregaEsperada) {
      return res.status(400).json({
        success: false,
        message: "La fecha de entrega esperada es requerida",
      });
    }

    if (!productos || !Array.isArray(productos) || productos.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Debe incluir al menos un producto",
      });
    }

    // Validar cada producto
    for (const producto of productos) {
      if (!producto.varianteId || !producto.cantidadSolicitada) {
        return res.status(400).json({
          success: false,
          message: "Cada producto debe tener varianteId y cantidadSolicitada",
        });
      }

      if (producto.cantidadSolicitada <= 0) {
        return res.status(400).json({
          success: false,
          message: "La cantidad solicitada debe ser mayor a 0",
        });
      }
    }

    // Verificar que el proveedor existe
    const proveedorCheck = await client.query(
      "SELECT ProveedorID FROM Proveedores WHERE ProveedorID = $1",
      [proveedorId]
    );

    if (proveedorCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Proveedor no encontrado",
      });
    }

    // Iniciar transacción
    await client.query("BEGIN");

    // 1. Crear la orden de compra
    const ordenQuery = `
      INSERT INTO OrdenesDeCompra (ProveedorID, FechaEntregaEsperada, Estatus)
      VALUES ($1, $2, 'Pendiente')
      RETURNING OrdenCompraID, ProveedorID, FechaCreacion, FechaEntregaEsperada, Estatus
    `;

    const ordenResult = await client.query(ordenQuery, [
      proveedorId,
      fechaEntregaEsperada,
    ]);

    const ordenCompra = ordenResult.rows[0];
    const ordenCompraId = ordenCompra.ordencompraid;

    // 2. Insertar los detalles de la orden (productos)
    const detallesInsertados = [];

    for (const producto of productos) {
      // Verificar que la variante existe
      const varianteResult = await client.query(
        `SELECT pv.VarianteID, pv.ProductoID, pv.SKU, pv.Dimensiones, pv.MedidaID, pr.NombreProducto
         FROM Producto_Variantes pv
         INNER JOIN Productos pr ON pv.ProductoID = pr.ProductoID
         WHERE pv.VarianteID = $1`,
        [producto.varianteId]
      );

      if (varianteResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          message: `Variante con ID ${producto.varianteId} no encontrada`,
        });
      }

      const variante = varianteResult.rows[0];

      if (producto.productoId && producto.productoId !== variante.productoid) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "La variante seleccionada no pertenece al producto indicado",
        });
      }

      const detalleQuery = `
        INSERT INTO DetallesOrdenCompra (OrdenCompraID, VarianteID, CantidadSolicitada, CantidadRecibida)
        VALUES ($1, $2, $3, 0)
        RETURNING DetalleOC_ID, VarianteID, CantidadSolicitada, CantidadRecibida
      `;

      const detalleResult = await client.query(detalleQuery, [
        ordenCompraId,
        variante.varianteid,
        producto.cantidadSolicitada,
      ]);

      detallesInsertados.push({
        detalleId: detalleResult.rows[0].detalleoc_id,
        varianteId: detalleResult.rows[0].varianteid,
        productoId: variante.productoid,
        nombreProducto: variante.nombreproducto,
        sku: variante.sku,
        medidaId: variante.medidaid,
        dimensiones: variante.dimensiones,
        cantidadSolicitada: detalleResult.rows[0].cantidadsolicitada,
        cantidadRecibida: detalleResult.rows[0].cantidadrecibida,
      });
    }

    // Commit de la transacción
    await client.query("COMMIT");

    console.log("✅ Orden de compra creada:", {
      ordenCompraId,
      proveedorId,
      totalProductos: detallesInsertados.length,
    });

    res.status(201).json({
      success: true,
      message: "Orden de compra creada exitosamente",
      data: {
        ordenCompra: {
          ordenCompraId: ordenCompraId,
          proveedorId: ordenCompra.proveedorid,
          fechaCreacion: ordenCompra.fechacreacion,
          fechaEntregaEsperada: ordenCompra.fechaentregaesperada,
          estatus: ordenCompra.estatus,
        },
        detalles: detallesInsertados,
      },
    });
  } catch (error) {
    // Rollback en caso de error
    await client.query("ROLLBACK");
    console.error("Error al crear orden de compra:", error);
    res.status(500).json({
      success: false,
      message: "Error al crear la orden de compra",
    });
  } finally {
    client.release();
  }
};

/**
 * Subir imagen para un producto
 * POST /api/admin/productos/:id/imagen
 * Middleware: upload.single('imagen')
 * 
 * NOTA: producto_imagenes.productoid es FK a productos.productoid
 */
const subirImagenProducto = async (req, res) => {
  const { id } = req.params;
  
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No se proporcionó ningún archivo de imagen",
      });
    }

    // Validar que el producto maestro exista
    const productoResult = await db.query(
      `SELECT productoid FROM productos WHERE productoid = $1`,
      [id]
    );

    if (productoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Producto no encontrado",
      });
    }

    // Generar la ruta relativa de la imagen
    const rutaImagen = `/uploads/${req.file.filename}`;

    // Verificar si ya existe una imagen principal (orden = 1)
    const existingImageResult = await db.query(
      `SELECT imagenid FROM producto_imagenes 
       WHERE productoid = $1 AND orden = 1`,
      [id]
    );

    let imagenResult;
    
    if (existingImageResult.rows.length > 0) {
      // Actualizar imagen principal existente
      imagenResult = await db.query(
        `UPDATE producto_imagenes 
         SET url_imagen = $2
         WHERE productoid = $1 AND orden = 1
         RETURNING imagenid, url_imagen`,
        [id, rutaImagen]
      );
    } else {
      // Insertar nueva imagen principal
      imagenResult = await db.query(
        `INSERT INTO producto_imagenes (productoid, url_imagen, orden)
         VALUES ($1, $2, 1)
         RETURNING imagenid, url_imagen`,
        [id, rutaImagen]
      );
    }

    console.log(`✅ Imagen guardada: producto ${id} -> ${rutaImagen}`);

    res.status(200).json({
      success: true,
      message: "Imagen subida exitosamente",
      data: {
        imagenId: imagenResult.rows[0].imagenid,
        rutaImagen: imagenResult.rows[0].url_imagen,
        urlCompleta: `${req.protocol}://${req.get("host")}${rutaImagen}`,
      },
    });
  } catch (error) {
    console.error(`❌ Error al subir imagen del producto ${id}:`, error.message);
    
    res.status(500).json({
      success: false,
      message: "Error al subir la imagen",
      error: error.message,
    });
  }
};

/**
 * Confirmar orden de backorder
 * POST /api/admin/ordenes-compra/:id/confirmar
 */
const confirmarOrdenBackorder = async (req, res) => {
  try {
    const ordenCompraId = parseInt(req.params.id);

    // Verificar que la orden existe y está pendiente
    const ordenResult = await db.query(
      `SELECT oc.*, p.nombreempresa
       FROM ordenesdecompra oc
       INNER JOIN proveedores p ON oc.proveedorid = p.proveedorid
       WHERE oc.ordencompraid = $1`,
      [ordenCompraId]
    );

    if (ordenResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Orden de compra no encontrada",
      });
    }

    const orden = ordenResult.rows[0];

    // Actualizar estatus a confirmado
    await db.query(
      `UPDATE ordenesdecompra 
       SET estatus = 'Confirmada'
       WHERE ordencompraid = $1`,
      [ordenCompraId]
    );

    // Obtener clientes afectados por productos en backorder
    const clientesQuery = await db.query(
      `SELECT DISTINCT p.clienteid
       FROM pedidos p
       INNER JOIN detallespedido dp ON p.pedidoid = dp.pedidoid
       INNER JOIN detallesordencompra doc ON dp.varianteid = doc.varianteid
       WHERE doc.ordencompraid = $1
       AND p.estatus = 'Backorder'`,
      [ordenCompraId]
    );

    // Notificar a cada cliente
    const notificacionesController = require('./notificacionesController');
    for (const cliente of clientesQuery.rows) {
      await notificacionesController.crearNotificacion(cliente.clienteid, {
        tipo: 'backorder',
        titulo: '✅ Orden de Backorder Confirmada',
        mensaje: `Tu orden de backorder #${ordenCompraId} ha sido confirmada y está siendo procesada.`,
        url: '/dashboard.html?tab=pedidos',
        prioridad: 'normal',
        metadata: { ordenCompraId },
      });
    }

    res.json({
      success: true,
      message: "Orden de backorder confirmada exitosamente",
      data: {
        ordenCompraId,
        clientesNotificados: clientesQuery.rows.length,
      },
    });
  } catch (error) {
    console.error("Error al confirmar orden de backorder:", error);
    res.status(500).json({
      success: false,
      message: "Error al confirmar orden de backorder",
      error: error.message,
    });
  }
};

/**
 * Cancelar orden de backorder
 * POST /api/admin/ordenes-compra/:id/cancelar
 */
const cancelarOrdenBackorder = async (req, res) => {
  try {
    const ordenCompraId = parseInt(req.params.id);
    const { motivo } = req.body;

    if (!motivo || motivo.trim() === '') {
      return res.status(400).json({
        success: false,
        message: "El motivo de cancelación es requerido",
      });
    }

    // Verificar que la orden existe
    const ordenResult = await db.query(
      `SELECT * FROM ordenesdecompra WHERE ordencompraid = $1`,
      [ordenCompraId]
    );

    if (ordenResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Orden de compra no encontrada",
      });
    }

    // Actualizar estatus a cancelado
    await db.query(
      `UPDATE ordenesdecompra 
       SET estatus = 'Cancelada'
       WHERE ordencompraid = $1`,
      [ordenCompraId]
    );

    // Obtener clientes afectados
    const clientesQuery = await db.query(
      `SELECT DISTINCT p.clienteid
       FROM pedidos p
       INNER JOIN detallespedido dp ON p.pedidoid = dp.pedidoid
       INNER JOIN detallesordencompra doc ON dp.varianteid = doc.varianteid
       WHERE doc.ordencompraid = $1
       AND p.estatus = 'Backorder'`,
      [ordenCompraId]
    );

    // Notificar a cada cliente
    const notificacionesController = require('./notificacionesController');
    for (const cliente of clientesQuery.rows) {
      await notificacionesController.notificarBackorderCancelado(
        ordenCompraId,
        cliente.clienteid,
        motivo
      );
    }

    res.json({
      success: true,
      message: "Orden de backorder cancelada y clientes notificados",
      data: {
        ordenCompraId,
        clientesNotificados: clientesQuery.rows.length,
        motivo,
      },
    });
  } catch (error) {
    console.error("Error al cancelar orden de backorder:", error);
    res.status(500).json({
      success: false,
      message: "Error al cancelar orden de backorder",
      error: error.message,
    });
  }
};

/**
 * Actualizar visibilidad de una variante
 * PUT /api/admin/variantes/:id
 */
const actualizarVariante = async (req, res) => {
  try {
    const varianteId = parseInt(req.params.id, 10);
    const { activo } = req.body;

    if (!varianteId || isNaN(varianteId)) {
      return res.status(400).json({
        success: false,
        message: "ID de variante inválido",
      });
    }

    if (activo === undefined) {
      return res.status(400).json({
        success: false,
        message: "El campo 'activo' es requerido",
      });
    }

    // Verificar que la variante existe
    const checkVariante = await db.query(
      `SELECT VarianteID FROM Producto_Variantes WHERE VarianteID = $1`,
      [varianteId]
    );

    if (checkVariante.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Variante no encontrada",
      });
    }

    // Actualizar solo el campo activo
    console.log(`🔄 Actualizando variante ${varianteId} a activo=${activo}`);
    
    const updateResult = await db.query(
      `UPDATE Producto_Variantes SET Activo = $1 WHERE VarianteID = $2 RETURNING *`,
      [activo, varianteId]
    );

    console.log(`✅ Variante actualizada:`, updateResult.rows[0]);

    res.json({
      success: true,
      message: `Variante ${activo ? 'activada' : 'desactivada'} exitosamente`,
      data: {
        varianteId,
        activo,
        updated: updateResult.rows[0],
      },
    });
  } catch (error) {
    console.error("❌ Error al actualizar variante:", error);
    console.error("Error completo:", error.message, error.stack);
    res.status(500).json({
      success: false,
      message: "Error en el servidor: " + error.message,
      error: error.message,
    });
  }
};

module.exports = {
  loginAdmin,
  verifyAdmin,
  getAdminProfile,
  refreshAdminToken,
  getDashboardStats,
  getAllPedidos,
  updateCostoEnvio,
  updatePedidoEstatus,
  getPedidoDetalle,
  ajustarInventario,
  getInventarioResumen,
  getProductoDetalle,
  getAllProductos,
  crearProducto,
  actualizarProducto,
  getTamanosPaquetes,
  getCategorias,
  crearCategoria,
  actualizarCategoria,
  eliminarCategoria,
  getMedidas,
  crearVariante,
  actualizarVariante,
  crearAgente,
  getAllAgentes,
  getAgenteDetalle,
  getAgenteClientes,
  desactivarAgente,
  getAllComisiones,
  pagarComision,
  getAllClientes,
  getClienteDetalle,
  actualizarEstadoCliente,
  desvincularClienteDeAgente,
  getAllProveedores,
  crearProveedor,
  actualizarProveedor,
  getAllOrdenesCompra,
  getDetallesOrdenCompra,
  crearOrdenCompra,
  recibirInventario,
  subirImagenProducto,
  confirmarOrdenBackorder,
  cancelarOrdenBackorder,
};
