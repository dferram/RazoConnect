const db = require("../db");
const { isValidEmail } = require("../utils/validator");
const { registrarLog } = require("../services/loggerService");

const resolveAuthenticatedAgenteId = (user) => {
  const agenteIdRaw =
    user?.userId ?? user?.agenteId ?? user?.id ?? user?.adminId ?? null;

  const agenteId = Number.parseInt(agenteIdRaw, 10);

  if (!Number.isInteger(agenteId)) {
    return null;
  }

  return agenteId;
};

/**
 * Obtener clientes disponibles (sin agente asignado) para vincular
 * GET /api/agentes/clientes-disponibles
 */
const obtenerClientesDisponibles = async (req, res) => {
  try {
    const agenteId = resolveAuthenticatedAgenteId(req.user);

    if (!agenteId) {
      return res.status(403).json({
        success: false,
        message: "No se pudo determinar el agente autenticado",
      });
    }

    const result = await db.query(
      `SELECT clienteid, nombre, apellido, email
       FROM Clientes
       WHERE agenteid IS NULL
         AND activo = TRUE
       ORDER BY nombre ASC, apellido ASC`
    );

    const clientes = result.rows.map((row) => ({
      clienteId: row.clienteid,
      nombre: row.nombre,
      apellido: row.apellido,
      email: row.email,
    }));

    return res.status(200).json({
      success: true,
      message: "Clientes disponibles obtenidos exitosamente",
      data: {
        clientes,
        total: clientes.length,
      },
    });
  } catch (error) {
    console.error("Error al obtener clientes disponibles para agente:", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener los clientes disponibles",
      error: error.message,
    });
  }
};

/**
 * Vincular un cliente existente a la cartera del agente logueado
 * POST /api/agentes/vincular-cliente
 */
const vincularCliente = async (req, res) => {
  try {
    const agenteId = resolveAuthenticatedAgenteId(req.user);

    if (!agenteId) {
      return res.status(403).json({
        success: false,
        message: "No se pudo determinar el agente autenticado",
      });
    }
    const { emailCliente } = req.body;

    if (!emailCliente || typeof emailCliente !== "string") {
      return res.status(400).json({
        success: false,
        message: "El email del cliente es requerido",
      });
    }

    const emailNormalizado = emailCliente.trim().toLowerCase();

    if (!isValidEmail(emailNormalizado)) {
      return res.status(400).json({
        success: false,
        message: "El email del cliente no es válido",
      });
    }

    const clienteResult = await db.query(
      `SELECT clienteid, nombre, apellido, email, telefono, agenteid
       FROM Clientes
       WHERE LOWER(email) = $1`,
      [emailNormalizado]
    );

    if (clienteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No se encontró un cliente con ese correo",
      });
    }

    const cliente = clienteResult.rows[0];

    if (cliente.agenteid) {
      if (cliente.agenteid === agenteId) {
        return res.status(200).json({
          success: true,
          message: "Este cliente ya forma parte de tu cartera",
          data: {
            cliente: {
              clienteId: cliente.clienteid,
              nombre: cliente.nombre,
              apellido: cliente.apellido,
              email: cliente.email,
              telefono: cliente.telefono,
              agenteId: cliente.agenteid,
            },
          },
        });
      }

      return res.status(409).json({
        success: false,
        message: "El cliente ya está asignado a otro agente",
      });
    }

    const updateResult = await db.query(
      `UPDATE Clientes
       SET agenteid = $1
       WHERE clienteid = $2
       RETURNING clienteid, nombre, apellido, email, telefono, agenteid`,
      [agenteId, cliente.clienteid]
    );

    const clienteActualizado = updateResult.rows[0];

    return res.status(200).json({
      success: true,
      message: "Cliente agregado a tu cartera exitosamente",
      data: {
        cliente: {
          clienteId: clienteActualizado.clienteid,
          nombre: clienteActualizado.nombre,
          apellido: clienteActualizado.apellido,
          email: clienteActualizado.email,
          telefono: clienteActualizado.telefono,
          agenteId: clienteActualizado.agenteid,
        },
      },
    });
  } catch (error) {
    console.error("Error al vincular cliente a agente:", error);
    return res.status(500).json({
      success: false,
      message: "Error al vincular el cliente",
      error: error.message,
    });
  }
};

/**
 * Obtener los clientes vinculados al agente logueado
 * GET /api/agentes/mis-clientes
 */
const obtenerClientesDelAgente = async (req, res) => {
  try {
    const agenteId = resolveAuthenticatedAgenteId(req.user);

    if (!agenteId) {
      return res.status(403).json({
        success: false,
        message: "No se pudo determinar el agente autenticado",
      });
    }

    const searchTermRaw =
      typeof req.query.search === "string" ? req.query.search.trim() : "";
    const params = [agenteId];
    let query = `SELECT clienteid, nombre, apellido, email, telefono, fechaderegistro
                 FROM Clientes
                 WHERE agenteid = $1`;

    if (searchTermRaw) {
      params.push(`%${searchTermRaw.toLowerCase()}%`);
      const idx = params.length;
      query += ` AND (LOWER(nombre) LIKE $${idx}
                      OR LOWER(apellido) LIKE $${idx}
                      OR LOWER(email) LIKE $${idx})`;
    }

    query += ` ORDER BY fechaderegistro DESC`;

    const clientesResult = await db.query(query, params);

    const clientes = clientesResult.rows.map((row) => ({
      clienteId: row.clienteid,
      nombre: row.nombre,
      apellido: row.apellido,
      email: row.email,
      telefono: row.telefono,
      fechaRegistro: row.fechaderegistro,
    }));

    return res.status(200).json({
      success: true,
      message: "Clientes obtenidos exitosamente",
      data: {
        clientes,
        total: clientes.length,
      },
    });
  } catch (error) {
    console.error("Error al obtener clientes del agente:", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener los clientes del agente",
      error: error.message,
    });
  }
};

const obtenerDashboardStats = async (req, res) => {
  try {
    const agenteId = resolveAuthenticatedAgenteId(req.user);

    if (!agenteId) {
      return res.status(403).json({
        success: false,
        message: "No se pudo determinar el agente autenticado",
      });
    }

    const ventasMesQuery = await db.query(
      `SELECT COALESCE(SUM(p.montototal), 0) AS total
       FROM Pedidos p
       INNER JOIN Clientes c ON c.clienteid = p.clienteid
       WHERE c.agenteid = $1
         AND DATE_TRUNC('month', p.fechapedido) = DATE_TRUNC('month', CURRENT_DATE)`,
      [agenteId]
    );

    const comisionesQuery = await db.query(
      `SELECT COALESCE(SUM(montocomision), 0) AS total
       FROM Comisiones
       WHERE agenteid = $1
         AND estatus IN ('Pendiente', 'Pagada')`,
      [agenteId]
    );

    const clientesActivosQuery = await db.query(
      `SELECT COUNT(*) AS total
       FROM Clientes
       WHERE agenteid = $1
         AND COALESCE(activo, TRUE) = TRUE`,
      [agenteId]
    );

    const pedidosRecientesQuery = await db.query(
      `SELECT p.pedidoid
            ,LPAD(p.pedidoid::text, 6, '0') AS numeropedido
            ,p.fechapedido
            ,p.montototal
            ,p.estatus
            ,c.nombre AS clienteNombre
            ,c.apellido AS clienteApellido
       FROM Pedidos p
       INNER JOIN Clientes c ON c.clienteid = p.clienteid
       WHERE c.agenteid = $1
       ORDER BY p.fechapedido DESC
       LIMIT 5`,
      [agenteId]
    );

    res.json({
      success: true,
      data: {
        ventasDelMes: parseFloat(ventasMesQuery.rows[0].total) || 0,
        comisionesAcumuladas: parseFloat(comisionesQuery.rows[0].total) || 0,
        clientesActivos: parseInt(clientesActivosQuery.rows[0].total, 10) || 0,
        ultimosPedidos: pedidosRecientesQuery.rows.map((row) => ({
          pedidoId: row.pedidoid,
          numeroPedido: row.numeropedido,
          fechaPedido: row.fechapedido,
          montoTotal: row.montototal,
          estatus: row.estatus,
          clienteNombre: row.clientenombre,
          clienteApellido: row.clienteapellido,
        })),
      },
    });
  } catch (error) {
    console.error(
      "Error al obtener estadísticas de dashboard del agente:",
      error
    );
    res.status(500).json({
      success: false,
      message: "Error al obtener estadísticas",
      error: error.message,
    });
  }
};

const obtenerPedidosDelAgente = async (req, res) => {
  try {
    const agenteId = resolveAuthenticatedAgenteId(req.user);

    if (!agenteId) {
      return res.status(403).json({
        success: false,
        message: "No se pudo determinar el agente autenticado",
      });
    }

    const estatusRaw =
      typeof req.query.estatus === "string" ? req.query.estatus.trim() : "";
    const params = [agenteId];
    let query = `SELECT p.pedidoid
                      ,LPAD(p.pedidoid::text, 6, '0') AS numeropedido
                      ,p.fechapedido
                      ,p.montototal
                      ,p.estatus
                      ,c.nombre AS clienteNombre
                      ,c.apellido AS clienteApellido
                FROM Pedidos p
                INNER JOIN Clientes c ON c.clienteid = p.clienteid
                WHERE c.agenteid = $1`;

    if (estatusRaw) {
      const statusList = estatusRaw
        .split(",")
        .map((status) => status.trim().toLowerCase())
        .filter(Boolean);

      if (statusList.length) {
        const placeholders = statusList
          .map((_, index) => `$${params.length + index + 1}`)
          .join(", ");
        params.push(...statusList);
        query += ` AND LOWER(p.estatus) IN (${placeholders})`;
      }
    }

    query += ` ORDER BY p.fechapedido DESC, p.pedidoid DESC`;

    const pedidosResult = await db.query(query, params);

    const pedidos = pedidosResult.rows.map((row) => ({
      pedidoId: row.pedidoid,
      numeroPedido: row.numeropedido,
      fechaPedido: row.fechapedido,
      montoTotal: row.montototal,
      estatus: row.estatus,
      clienteNombre: row.clientenombre,
      clienteApellido: row.clienteapellido,
    }));

    res.json({
      success: true,
      data: {
        pedidos,
        total: pedidos.length,
      },
    });
  } catch (error) {
    console.error("Error al obtener pedidos del agente:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener los pedidos",
      error: error.message,
    });
  }
};

/**
 * Obtener detalle de un pedido específico del agente
 * GET /api/agente/pedidos/:id
 */
const obtenerPedidoDetalleAgente = async (req, res) => {
  try {
    const agenteId = resolveAuthenticatedAgenteId(req.user);

    if (!agenteId) {
      return res.status(403).json({
        success: false,
        message: "No se pudo determinar el agente autenticado",
      });
    }

    const pedidoId = parseInt(req.params.id, 10);

    if (!pedidoId || Number.isNaN(pedidoId)) {
      return res.status(400).json({
        success: false,
        message: "ID de pedido inválido",
      });
    }

    // Verificar que el pedido pertenece a un cliente del agente
    const pedidoResult = await db.query(
      `SELECT 
        p.pedidoid,
        LPAD(p.pedidoid::text, 6, '0') AS numeropedido,
        p.fechapedido,
        p.montototal,
        p.estatus,
        c.clienteid,
        c.nombre AS clientenombre,
        c.apellido AS clienteapellido,
        c.email AS clienteemail,
        c.telefono AS clientetelefono,
        d.receptor,
        d.calle,
        d.numeroext AS numeroexterior,
        d.numeroint AS numerointerior,
        d.colonia,
        d.ciudad,
        d.codigopostal,
        d.telefonocontacto,
        e.nombre AS estadonombre
      FROM Pedidos p
      INNER JOIN Clientes c ON c.clienteid = p.clienteid
      LEFT JOIN Cliente_Direcciones d ON p.direccionenvioid = d.direccionid
      LEFT JOIN Estados e ON d.estadoid = e.estadoid
      WHERE p.pedidoid = $1 AND c.agenteid = $2`,
      [pedidoId, agenteId]
    );

    if (pedidoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pedido no encontrado o no pertenece a tus clientes",
      });
    }

    const pedido = pedidoResult.rows[0];

    // Obtener detalles del pedido
    const detallesResult = await db.query(
      `SELECT 
        dp.detalleid,
        dp.cantidadpaquetes,
        dp.precioporpaquete,
        dp.piezastotales,
        dp.preciounitario,
        pv.sku,
        pv.dimensiones,
        pr.nombreproducto,
        row_to_json(ct) AS tamano_info,
        (SELECT pi.url_imagen 
         FROM producto_imagenes pi 
         WHERE pi.productoid = pv.productoid 
         ORDER BY pi.orden ASC NULLS LAST 
         LIMIT 1) AS imagenurl
      FROM detallesdelpedido dp
      INNER JOIN producto_variantes pv ON dp.varianteid = pv.varianteid
      INNER JOIN productos pr ON pv.productoid = pr.productoid
      LEFT JOIN cat_tamanopaquetes ct ON dp.tamanoid = ct.tamanoid
      WHERE dp.pedidoid = $1
      ORDER BY dp.detalleid ASC`,
      [pedidoId]
    );

    const items = detallesResult.rows.map((row) => {
      const precioUnitario = row.preciounitario
        ? parseFloat(row.preciounitario)
        : null;
      const precioPorPaquete = row.precioporpaquete
        ? parseFloat(row.precioporpaquete)
        : null;
      const cantidad = row.cantidadpaquetes
        ? parseInt(row.cantidadpaquetes, 10)
        : 0;
      const subtotal =
        precioPorPaquete && cantidad ? precioPorPaquete * cantidad : 0;

      // Extraer valor y etiqueta del tamano_info JSON
      const tamanoInfo = row.tamano_info || {};
      const tamanoValor =
        tamanoInfo.valor ||
        tamanoInfo.cantidad ||
        tamanoInfo.piezas ||
        tamanoInfo.piezasporpaquete ||
        tamanoInfo.numeropiezas ||
        null;
      const tamanoEtiqueta =
        tamanoInfo.etiqueta ||
        tamanoInfo.descripcion ||
        tamanoInfo.nombre ||
        tamanoInfo.label ||
        null;

      return {
        detalleId: row.detalleid,
        nombreProducto: row.nombreproducto,
        sku: row.sku,
        dimensiones: row.dimensiones,
        cantidad,
        piezasTotales: row.piezastotales ? parseInt(row.piezastotales, 10) : 0,
        precioUnitario,
        precioPorPaquete,
        subtotal,
        tamano: tamanoEtiqueta || (tamanoValor ? `${tamanoValor} pzas` : null),
        imagenUrl: row.imagenurl,
      };
    });

    res.json({
      success: true,
      data: {
        pedido: {
          pedidoId: pedido.pedidoid,
          numeroPedido: pedido.numeropedido,
          fechaPedido: pedido.fechapedido,
          montoTotal: parseFloat(pedido.montototal),
          estatus: pedido.estatus,
        },
        cliente: {
          clienteId: pedido.clienteid,
          nombre: pedido.clientenombre,
          apellido: pedido.clienteapellido,
          email: pedido.clienteemail,
          telefono: pedido.clientetelefono,
        },
        direccion: {
          receptor: pedido.receptor,
          calle: pedido.calle,
          numeroExterior: pedido.numeroexterior,
          numeroInterior: pedido.numerointerior,
          colonia: pedido.colonia,
          ciudad: pedido.ciudad,
          codigoPostal: pedido.codigopostal,
          estado: pedido.estadonombre,
          telefonoContacto: pedido.telefonocontacto,
        },
        items,
        totalItems: items.length,
      },
    });
  } catch (error) {
    console.error("Error al obtener detalle del pedido del agente:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener el detalle del pedido",
      error: error.message,
    });
  }
};

const actualizarEstatusPedidoAgente = async (req, res) => {
  try {
    const agenteId = resolveAuthenticatedAgenteId(req.user);

    if (!agenteId) {
      return res.status(403).json({
        success: false,
        message: "No se pudo determinar el agente autenticado",
      });
    }

    const pedidoId = parseInt(req.params.id, 10);

    if (!pedidoId || Number.isNaN(pedidoId)) {
      return res.status(400).json({
        success: false,
        message: "ID de pedido inválido",
      });
    }

    const bodyEstatus = req.body && req.body.estatus;
    const nuevoEstatus =
      typeof bodyEstatus === "string" ? bodyEstatus.trim() : "";

    const destinosPermitidos = ["Confirmado", "Cancelado"];

    if (!destinosPermitidos.includes(nuevoEstatus)) {
      return res.status(400).json({
        success: false,
        message: "Estatus destino no permitido",
      });
    }

    const pedidoResult = await db.query(
      `SELECT p.pedidoid, p.estatus
       FROM Pedidos p
       INNER JOIN Clientes c ON c.ClienteID = p.ClienteID
       WHERE p.PedidoID = $1 AND c.AgenteID = $2`,
      [pedidoId, agenteId]
    );

    if (pedidoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pedido no encontrado o no pertenece a tus clientes",
      });
    }

    const estatusActual = pedidoResult.rows[0].estatus || "";
    const estatusActualLower = estatusActual.toString().toLowerCase();

    if (estatusActualLower !== "pendiente") {
      return res.status(400).json({
        success: false,
        message: "Solo puedes cambiar pedidos en estatus Pendiente",
      });
    }

    if (estatusActual === nuevoEstatus) {
      return res.status(200).json({
        success: true,
        message: "El estatus ya se encuentra establecido",
        data: {
          pedidoId,
          estatusAnterior: estatusActual,
          estatusNuevo: nuevoEstatus,
        },
      });
    }

    const updateResult = await db.query(
      `UPDATE Pedidos
       SET Estatus = $1
       WHERE PedidoID = $2
       RETURNING PedidoID, Estatus`,
      [nuevoEstatus, pedidoId]
    );

    const pedidoActualizado = updateResult.rows[0];

    try {
      await registrarLog(req, "EDITAR", "Pedido", pedidoId, {
        descripcion: `Agente cambió estatus de ${estatusActual} a ${nuevoEstatus}`,
        anterior: { estatus: estatusActual },
        nuevo: { estatus: nuevoEstatus },
      });
    } catch (logError) {
      console.error(
        "Error al registrar log de cambio de estatus de pedido por agente:",
        logError
      );
    }

    return res.status(200).json({
      success: true,
      message: `Estatus actualizado a ${nuevoEstatus}`,
      data: {
        pedidoId: pedidoActualizado.pedidoid,
        estatusAnterior: estatusActual,
        estatusNuevo: pedidoActualizado.estatus,
      },
    });
  } catch (error) {
    console.error("Error al actualizar estatus del pedido por agente:", error);
    return res.status(500).json({
      success: false,
      message: "Error al actualizar el estatus del pedido",
      error: error.message,
    });
  }
};

const obtenerComisionesDelAgente = async (req, res) => {
  try {
    const agenteId = resolveAuthenticatedAgenteId(req.user);

    if (!agenteId) {
      return res.status(403).json({
        success: false,
        message: "No se pudo determinar el agente autenticado",
      });
    }

    const comisionesResult = await db.query(
      `SELECT c.comisionid
            ,c.pedidoid
            ,c.montocomision
            ,c.estatus
            ,c.fechacalculo
            ,NULL::timestamp AS fechapago
       FROM Comisiones c
       WHERE c.agenteid = $1
       ORDER BY c.fechacalculo DESC, c.comisionid DESC`,
      [agenteId]
    );

    const comisiones = comisionesResult.rows.map((row) => ({
      comisionId: row.comisionid,
      pedidoId: row.pedidoid,
      monto: row.montocomision,
      estatus: row.estatus,
      fecha: row.fechapago || row.fechacalculo,
      fechaCalculo: row.fechacalculo,
      fechaPago: row.fechapago,
    }));

    res.json({
      success: true,
      data: {
        comisiones,
        total: comisiones.length,
      },
    });
  } catch (error) {
    console.error("Error al obtener comisiones del agente:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener las comisiones",
      error: error.message,
    });
  }
};

module.exports = {
  vincularCliente,
  obtenerClientesDelAgente,
  obtenerClientesDisponibles,
  obtenerDashboardStats,
  obtenerPedidosDelAgente,
  obtenerPedidoDetalleAgente,
  obtenerComisionesDelAgente,
  resolveAuthenticatedAgenteId,
  actualizarEstatusPedidoAgente,
};
