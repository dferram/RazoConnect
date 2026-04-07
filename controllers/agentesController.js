const db = require("../db");
const logger = require('../utils/logger');
const { isValidEmail } = require("../utils/validator");
const { registrarLog } = require("../services/loggerService");
const { solicitarCambio } = require("../services/ChangeRequestService");

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
    const { tenant_id } = req.tenant;
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
         AND tenant_id = $1
       ORDER BY nombre ASC, apellido ASC`,
      [tenant_id]
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
    logger.error('Error al obtener clientes disponibles para agente:', {
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "Error al obtener los clientes disponibles"
    });
  }
};

const solicitarConfirmacionPedidoAgente = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;
    if (!req.user || req.user.rol !== "agente") {
      return res.status(403).json({
        success: false,
        message: "Acceso no autorizado",
      });
    }

    const agenteId = resolveAuthenticatedAgenteId(req.user);

    if (!agenteId) {
      return res.status(403).json({
        success: false,
        message: "No se pudo determinar el agente autenticado",
      });
    }

    const pedidoId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de pedido inválido",
      });
    }

    const pedidoResult = await db.query(
      `SELECT p.pedidoid, p.estatus
       FROM Pedidos p
       INNER JOIN Clientes c ON c.ClienteID = p.ClienteID
       WHERE p.PedidoID = $1 AND c.AgenteID = $2
         AND p.tenant_id = $3 AND c.tenant_id = $3`,
      [pedidoId, agenteId, tenant_id]
    );

    if (pedidoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pedido no encontrado o no pertenece a tus clientes",
      });
    }

    const estatusActual = pedidoResult.rows[0].estatus || "";

    const resultado = await solicitarCambio(
      req,
      "pedidos",
      pedidoId,
      "UPDATE",
      { estatus: "Confirmado" },
      { estatus: estatusActual || "Pendiente" }
    );

    return res.status(200).json({
      success: true,
      message: "Solicitud de confirmación enviada al administrador.",
      data: {
        pedidoId,
        solicitudId: resultado.solicitudId,
        estadoSolicitud: resultado.estado,
      },
    });
  } catch (error) {
    if (error && error.code === "PENDING_CHANGE_EXISTS") {
      return res.status(409).json({
        success: false,
        message:
          "Ya existe una solicitud pendiente para este registro. Revisa la bitácora.",
      });
    }
    logger.error('Error al registrar solicitud de confirmación de pedido por agente:', {
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "Error al registrar la solicitud de confirmación"
    });
  }
};

/**
 * Vincular un cliente existente a la cartera del agente logueado
 * POST /api/agentes/vincular-cliente
 */
const vincularCliente = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;
    const agenteId = resolveAuthenticatedAgenteId(req.user);

    if (!agenteId) {
      return res.status(403).json({
        success: false,
        message: "No se pudo determinar el agente autenticado",
      });
    }
    const { clienteId } = req.body;

    if (!clienteId) {
      return res.status(400).json({
        success: false,
        message: "El ID del cliente es requerido",
      });
    }

    const clienteIdParsed = parseInt(clienteId, 10);

    if (!Number.isInteger(clienteIdParsed) || clienteIdParsed <= 0) {
      return res.status(400).json({
        success: false,
        message: "El ID del cliente no es válido",
      });
    }

    const clienteResult = await db.query(
      `SELECT clienteid, nombre, apellido, email, telefono, agenteid
       FROM Clientes
       WHERE clienteid = $1 AND tenant_id = $2`,
      [clienteIdParsed, tenant_id]
    );

    if (clienteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No se encontró el cliente",
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
       WHERE clienteid = $2 AND tenant_id = $3
       RETURNING clienteid, nombre, apellido, email, telefono, agenteid`,
      [agenteId, cliente.clienteid, tenant_id]
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
    logger.error('Error al vincular cliente a agente:', {
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "Error al vincular el cliente"
    });
  }
};

/**
 * Obtener los clientes vinculados al agente logueado
 * GET /api/agentes/mis-clientes
 */
const obtenerClientesDelAgente = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;
    const agenteId = resolveAuthenticatedAgenteId(req.user);

    if (!agenteId) {
      return res.status(403).json({
        success: false,
        message: "No se pudo determinar el agente autenticado",
      });
    }

    const searchTermRaw =
      typeof req.query.search === "string" ? req.query.search.trim() : "";
    const params = [agenteId, tenant_id];
    let query = `SELECT clienteid, nombre, apellido, email, telefono, fechaderegistro
                 FROM Clientes
                 WHERE agenteid = $1 AND tenant_id = $2`;

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
    logger.error('Error al obtener clientes del agente:', {
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "Error al obtener los clientes del agente"
    });
  }
};

const obtenerDashboardStats = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;
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
         AND p.tenant_id = $2
         AND c.tenant_id = $2
         AND DATE_TRUNC('month', p.fechapedido) = DATE_TRUNC('month', CURRENT_DATE)`,
      [agenteId, tenant_id]
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
    logger.error('Error al obtener estadísticas de dashboard del agente:', {
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error al obtener estadísticas"
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
    logger.error('Error al obtener pedidos del agente:', {
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error al obtener los pedidos"
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
    const tenant_id = req.tenant?.tenant_id || 1;

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
      WHERE p.pedidoid = $1 AND c.agenteid = $2 AND p.tenant_id = $3`,
      [pedidoId, agenteId, tenant_id]
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
      `SELECT DISTINCT ON (dp.detalleid)
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
      LEFT JOIN cat_tamanopaquetes ct ON dp.tamanoid = ct.tamanoid AND ct.tenant_id = dp.tenant_id
      INNER JOIN pedidos p ON dp.pedidoid = p.pedidoid
      WHERE dp.pedidoid = $1
      AND p.tenant_id = $2
      ORDER BY dp.detalleid ASC`,
      [pedidoId, tenant_id]
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
    logger.error('Error al obtener detalle del pedido del agente:', {
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error al obtener el detalle del pedido"
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
      logger.error('Error al registrar log de cambio de estatus de pedido por agente:', {
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
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
    logger.error('Error al actualizar estatus del pedido por agente:', {
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "Error al actualizar el estatus del pedido"
    });
  }
};

const solicitarCambioEstatusPedidoAgente = async (req, res) => {
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

    const bodyStatus = req.body && req.body.nuevoEstatus;
    const nuevoEstatusRaw =
      typeof bodyStatus === "string" ? bodyStatus.trim() : "";

    const destinosPermitidos = ["Confirmado", "Cancelado"];

    if (!destinosPermitidos.includes(nuevoEstatusRaw)) {
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
    const nuevoEstatusLower = nuevoEstatusRaw.toString().toLowerCase();

    if (estatusActual === nuevoEstatusRaw) {
      return res.status(200).json({
        success: true,
        message: "El estatus ya se encuentra establecido",
        data: {
          pedidoId,
          estatusAnterior: estatusActual,
          estatusNuevo: nuevoEstatusRaw,
        },
      });
    }

    const estadosBloqueados = ["enviado", "entregado", "pagado", "cancelado"];
    if (estadosBloqueados.includes(estatusActualLower)) {
      return res.status(400).json({
        success: false,
        message:
          "No puedes solicitar cambios para pedidos en estatus Enviado, Entregado, Pagado o Cancelado",
      });
    }

    const transicionValida =
      (estatusActualLower === "pendiente" &&
        (nuevoEstatusLower === "confirmado" ||
          nuevoEstatusLower === "cancelado")) ||
      ((estatusActualLower === "confirmado" ||
        estatusActualLower === "validado") &&
        nuevoEstatusLower === "cancelado");

    if (!transicionValida) {
      return res.status(400).json({
        success: false,
        message: "La transición de estatus solicitada no está permitida",
      });
    }

    const datosNuevos = { estatus: nuevoEstatusRaw };
    const datosAnteriores = { estatus: estatusActual };

    const resultado = await solicitarCambio(
      req,
      "pedidos",
      pedidoId,
      "UPDATE",
      datosNuevos,
      datosAnteriores
    );

    return res.status(200).json({
      success: true,
      message:
        resultado.mensaje ||
        "Solicitud registrada. El administrador revisará el cambio.",
      data: {
        pedidoId,
        estatusAnterior: estatusActual,
        estatusNuevo: nuevoEstatusRaw,
        solicitudId: resultado.solicitudId,
        estadoSolicitud: resultado.estado,
      },
    });
  } catch (error) {
    if (error && error.code === "PENDING_CHANGE_EXISTS") {
      return res.status(409).json({
        success: false,
        message:
          "Ya existe una solicitud pendiente para este registro. Revisa la bitácora.",
      });
    }
    logger.error('Error al registrar solicitud de cambio de estatus de pedido por agente:', {
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "Error al registrar la solicitud de cambio de estatus"
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
    logger.error('Error al obtener comisiones del agente:', {
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error al obtener las comisiones"
    });
  }
};

/**
 * Obtener Cuentas por Cobrar (CxC) del agente logueado
 * GET /api/agente/cxc
 */
const getCxCAgente = async (req, res) => {
  try {
    const agenteId = resolveAuthenticatedAgenteId(req.user);

    if (!agenteId) {
      return res.status(403).json({
        success: false,
        message: "No se pudo determinar el agente autenticado",
      });
    }

    const cxcQuery = `
      SELECT 
        c.clienteid,
        c.nombre,
        c.apellido,
        c.telefono,
        COALESCE(SUM(p.saldo_pendiente), 0) AS deuda_total,
        COUNT(p.pedidoid) FILTER (WHERE p.saldo_pendiente > 0 AND p.estatus != 'Cancelado') AS pedidos_pendientes
      FROM clientes c
      LEFT JOIN pedidos p ON c.clienteid = p.clienteid
      WHERE c.agenteid = $1
        AND c.activo = TRUE
      GROUP BY c.clienteid, c.nombre, c.apellido, c.telefono
      HAVING COALESCE(SUM(p.saldo_pendiente), 0) > 0
      ORDER BY deuda_total DESC
    `;

    const cxcResult = await db.query(cxcQuery, [agenteId]);

    const totalCartera = cxcResult.rows.reduce(
      (sum, row) => sum + parseFloat(row.deuda_total || 0),
      0
    );

    const clientes = cxcResult.rows.map((row) => ({
      clienteId: row.clienteid,
      nombre: row.nombre,
      apellido: row.apellido,
      telefono: row.telefono,
      deudaTotal: parseFloat(row.deuda_total || 0),
      pedidosPendientes: parseInt(row.pedidos_pendientes || 0, 10),
    }));

    return res.status(200).json({
      success: true,
      message: "Cuentas por cobrar obtenidas exitosamente",
      data: {
        resumen: {
          total_cartera: totalCartera,
        },
        clientes,
        total: clientes.length,
      },
    });
  } catch (error) {
    logger.error('Error al obtener CxC del agente:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "Error al obtener las cuentas por cobrar"
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
  getCxCAgente,
  resolveAuthenticatedAgenteId,
  actualizarEstatusPedidoAgente,
  solicitarCambioEstatusPedidoAgente,
  solicitarConfirmacionPedidoAgente,
};
