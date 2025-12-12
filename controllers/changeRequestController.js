const db = require("../db");
const { aprobarSolicitudes } = require("../services/ChangeRequestService");
const { crearNotificacion } = require("../services/notificacionesService");
const { enviarEmail } = require("../services/emailService");
const { getOrderConfirmationEmail } = require("../utils/emailTemplates");

// Whitelist de entidades administrables y su tabla/PK real
const ENTITY_MAP = {
  productos: { table: "Productos", pk: "ProductoID" },
  producto_variantes: { table: "Producto_Variantes", pk: "VarianteID" },
  categorias: { table: "Categorias", pk: "CategoriaID" },
  proveedores: { table: "Proveedores", pk: "ProveedorID" },
  clientes: { table: "Clientes", pk: "ClienteID" },
  agentes: { table: "AgentesDeVentas", pk: "AgenteID" },
  admins: { table: "Administradores", pk: "AdminID" },
  pedidos: { table: "Pedidos", pk: "PedidoID" },
  comisiones: { table: "Comisiones", pk: "ComisionID" },
};

function getAdminIdFromRequest(req) {
  if (!req || !req.user) return null;
  if (req.user.tipo === "admin") {
    return req.user.id || req.user.userId || null;
  }
  return null;
}

function ensureJsonObject(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch (e) {
    return {};
  }
}

async function inferSolicitanteTipoYId(usuarioSolicitanteId) {
  const id = Number.parseInt(usuarioSolicitanteId, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return { tipo: null, id: null };
  }

  const adminRes = await db.query(
    "SELECT AdminID FROM Administradores WHERE AdminID = $1 LIMIT 1",
    [id]
  );
  if (adminRes.rows && adminRes.rows.length > 0) {
    return { tipo: "admin", id };
  }

  const agenteRes = await db.query(
    "SELECT AgenteID FROM AgentesDeVentas WHERE AgenteID = $1 LIMIT 1",
    [id]
  );
  if (agenteRes.rows && agenteRes.rows.length > 0) {
    return { tipo: "agente", id };
  }

  return { tipo: null, id };
}

async function notificarSolicitudAprobada(solicitudRow) {
  const entidad = (solicitudRow?.entidad || "").toString().trim();
  const usuarioSolicitanteId = solicitudRow?.usuario_solicitante_id;
  if (!usuarioSolicitanteId) return;

  const { tipo, id } = await inferSolicitanteTipoYId(usuarioSolicitanteId);
  if (!tipo || !id) return;

  const titulo = "Solicitud Aprobada";
  const mensaje = `Tu cambio en ${entidad} fue aprobado.`;

  if (tipo === "admin") {
    await db.query(
      `INSERT INTO notificaciones (clienteid, administrador_id, agente_id, tipo, titulo, mensaje)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [null, id, null, "sistema", titulo, mensaje]
    );
    return;
  }

  if (tipo === "agente") {
    await db.query(
      `INSERT INTO notificaciones (clienteid, administrador_id, agente_id, tipo, titulo, mensaje)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [null, null, id, "sistema", titulo, mensaje]
    );
  }
}

async function aprobarCambios(req, res) {
  const { ids } = req.body || {};

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Debes proporcionar un arreglo de IDs de cambios a aprobar",
    });
  }

  const adminId = getAdminIdFromRequest(req);
  if (!adminId) {
    return res.status(401).json({
      success: false,
      message: "Usuario resolutor no identificado",
    });
  }

  try {
    const resultado = await aprobarSolicitudes(ids, adminId);

    try {
      const appliedIds = Array.isArray(resultado?.applied)
        ? resultado.applied
            .map((row) => Number.parseInt(row?.id ?? row?.cambioId, 10))
            .filter((n) => Number.isInteger(n) && n > 0)
        : [];

      for (const cambioId of appliedIds) {
        const cambioResult = await db.query(
          `SELECT entidad, tipo_cambio, entidad_id, datos_nuevos, usuario_solicitante_id
           FROM control_cambios
           WHERE id = $1`,
          [cambioId]
        );

        if (!cambioResult.rows.length) continue;

        const solicitud = cambioResult.rows[0];
        try {
          await notificarSolicitudAprobada(solicitud);
        } catch (staffNotifyError) {
          console.error(
            "Error creando notificación interna de aprobación:",
            staffNotifyError
          );
        }

        const entidad = (solicitud.entidad || "").toString().toLowerCase();
        const tipoCambio = (solicitud.tipo_cambio || "")
          .toString()
          .toUpperCase();

        if (entidad !== "pedidos" || tipoCambio !== "UPDATE") {
          continue;
        }

        const pedidoId = Number.parseInt(solicitud.entidad_id, 10);
        if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
          continue;
        }

        const nuevos = ensureJsonObject(solicitud.datos_nuevos);
        const nuevoEstatus = (nuevos.estatus || "").toString().trim();
        if (!nuevoEstatus) {
          continue;
        }

        const pedidoInfoResult = await db.query(
          `SELECT ClienteID
           FROM Pedidos
           WHERE PedidoID = $1`,
          [pedidoId]
        );

        const clienteIdRaw = pedidoInfoResult.rows[0]?.clienteid;
        const clienteId = Number.parseInt(clienteIdRaw, 10);
        if (!Number.isInteger(clienteId) || clienteId <= 0) {
          continue;
        }

        const clienteInfoResult = await db.query(
          `SELECT Nombre, Apellido, Email
           FROM Clientes
           WHERE ClienteID = $1`,
          [clienteId]
        );

        const clienteInfo = clienteInfoResult.rows[0] || {};
        const emailCliente = (clienteInfo.email || "").toString().trim();
        const nombreCliente = [
          (clienteInfo.nombre || "").toString().trim(),
          (clienteInfo.apellido || "").toString().trim(),
        ]
          .filter(Boolean)
          .join(" ")
          .trim();

        await crearNotificacion(
          clienteId,
          "pedido",
          `¡Tu pedido #${pedidoId} ha sido ${nuevoEstatus}!`,
          "El estatus de tu pedido ha cambiado. Revisa los detalles en tu cuenta.",
          {
            link: `/mis-pedidos.html?id=${pedidoId}`,
            pedidoId,
            estatus: nuevoEstatus,
          }
        );

        if (emailCliente) {
          const asunto = `¡Tu pedido #${pedidoId} ha sido ${nuevoEstatus}!`;
          const cuerpoHtml = getOrderConfirmationEmail(
            nombreCliente || "cliente",
            pedidoId,
            nuevoEstatus
          );
          await enviarEmail(emailCliente, asunto, cuerpoHtml);
        }
      }
    } catch (notifyError) {
      console.error("Error creando notificaciones tras aprobar cambios:", notifyError);
    }

    return res.json({
      success: true,
      message: "Cambios aplicados correctamente",
      data: {
        aplicados: resultado.applied,
        omitidos: resultado.skipped,
      },
    });
  } catch (error) {
    console.error("Error al aprobar cambios:", error);
    return res.status(500).json({
      success: false,
      message: "Error al aprobar cambios",
      error: error.message,
    });
  }
}

async function rechazarCambios(req, res) {
  const { ids } = req.body || {};

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Debes proporcionar un arreglo de IDs de cambios a rechazar",
    });
  }

  const adminId = getAdminIdFromRequest(req);
  if (!adminId) {
    return res.status(401).json({
      success: false,
      message: "Usuario resolutor no identificado",
    });
  }

  const validIds = ids
    .map((raw) => Number.parseInt(raw, 10))
    .filter((n) => Number.isInteger(n));

  if (!validIds.length) {
    return res.status(400).json({
      success: false,
      message: "No hay IDs válidos para rechazar",
    });
  }

  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    let rechazados = 0;

    for (const cambioId of validIds) {
      const { rows } = await client.query(
        `SELECT * FROM control_cambios
         WHERE id = $1 AND estado = 'PENDIENTE'
         FOR UPDATE`,
        [cambioId]
      );

      if (rows.length === 0) {
        continue;
      }

      const cambio = rows[0];
      const entidad = cambio.entidad;
      const entidadId = cambio.entidad_id;
      const tipoCambio = cambio.tipo_cambio;

      const entityConfig = ENTITY_MAP[entidad];

      if (tipoCambio === "INSERT" && entidadId && entityConfig) {
        const entidadLower = entidad.toLowerCase();
        const { table, pk } = entityConfig;

        if (entidadLower === "productos") {
          try {
            // Limpieza profunda manual de dependencias conocidas
            await client.query(
              "DELETE FROM Producto_Variantes WHERE ProductoID = $1",
              [entidadId]
            );

            await client.query(
              "DELETE FROM Producto_TamanosDisponibles WHERE ProductoID = $1",
              [entidadId]
            );

            await client.query(
              "DELETE FROM producto_imagenes WHERE productoid = $1",
              [entidadId]
            );

            const deleteResult = await client.query(
              "DELETE FROM Productos WHERE ProductoID = $1",
              [entidadId]
            );

            if (deleteResult.rowCount === 0) {
              throw new Error(
                `No se encontró el producto ID ${entidadId} para eliminar al rechazar el cambio #${cambioId}.`
              );
            }
          } catch (err) {
            if (err.code === "23503") {
              throw new Error(
                `No se puede rechazar el cambio #${cambioId} para el producto ID ${entidadId} porque tiene datos vinculados que no se pueden eliminar automáticamente.`
              );
            }
            throw err;
          }
        } else if (entidadLower === "agentes") {
          // Verificar dependencias críticas antes de borrar el agente
          const [clientesDep, pedidosDep, comisionesDep] = await Promise.all([
            client.query(
              "SELECT COUNT(*)::int AS count FROM Clientes WHERE AgenteID = $1",
              [entidadId]
            ),
            client.query(
              "SELECT COUNT(*)::int AS count FROM Pedidos WHERE AgenteID = $1",
              [entidadId]
            ),
            client.query(
              "SELECT COUNT(*)::int AS count FROM Comisiones WHERE AgenteID = $1",
              [entidadId]
            ),
          ]);

          const clientesCount = Number(clientesDep.rows[0]?.count || 0);
          const pedidosCount = Number(pedidosDep.rows[0]?.count || 0);
          const comisionesCount = Number(comisionesDep.rows[0]?.count || 0);

          if (clientesCount > 0 || pedidosCount > 0 || comisionesCount > 0) {
            throw new Error(
              `No se puede rechazar el cambio #${cambioId} para el agente ID ${entidadId} porque tiene clientes, pedidos o comisiones asociadas.`
            );
          }

          const deleteResult = await client.query(
            "DELETE FROM AgentesDeVentas WHERE AgenteID = $1",
            [entidadId]
          );

          if (deleteResult.rowCount === 0) {
            throw new Error(
              `No se encontró el agente ID ${entidadId} para eliminar al rechazar el cambio #${cambioId}.`
            );
          }
        } else {
          // Intento genérico de borrado físico para otras entidades INSERT
          try {
            const deleteResult = await client.query(
              `DELETE FROM ${table} WHERE ${pk} = $1`,
              [entidadId]
            );

            if (deleteResult.rowCount === 0) {
              throw new Error(
                `No se encontró ${entidad} ID ${entidadId} para eliminar al rechazar el cambio #${cambioId}.`
              );
            }
          } catch (err) {
            if (err.code === "23503") {
              throw new Error(
                `No se puede rechazar el cambio #${cambioId} para ${entidad} ID ${entidadId} porque tiene datos vinculados que no se pueden eliminar automáticamente.`
              );
            }
            throw err;
          }
        }
      }

      const { rowCount } = await client.query(
        `UPDATE control_cambios
         SET estado = 'RECHAZADO',
             fecha_resolucion = NOW(),
             usuario_resolutor_id = $1
         WHERE id = $2
           AND estado = 'PENDIENTE'`,
        [adminId, cambioId]
      );

      rechazados += rowCount;
    }

    await client.query("COMMIT");

    return res.json({
      success: true,
      message: `Se rechazaron ${rechazados} cambio(s)`,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al rechazar cambios:", error);
    return res.status(500).json({
      success: false,
      message: "Error al rechazar cambios",
      error: error.message,
    });
  } finally {
    client.release();
  }
}

async function obtenerPendientes(req, res) {
  const adminId = getAdminIdFromRequest(req);

  if (!adminId) {
    return res.status(401).json({
      success: false,
      message: "Usuario no autenticado como admin",
    });
  }

  try {
    const { rows } = await db.query(
      `SELECT
         cc.id,
         cc.entidad,
         cc.entidad_id,
         cc.tipo_cambio,
         cc.datos_anteriores,
         cc.datos_nuevos,
         cc.usuario_solicitante_id,
         cc.estado,
         cc.fecha_solicitud,
         COALESCE(a.Nombre, ag.Nombre) AS solicitante_nombre,
         COALESCE(a.Email, ag.Email) AS solicitante_email
       FROM control_cambios cc
       LEFT JOIN Administradores a
         ON a.AdminID = cc.usuario_solicitante_id
       LEFT JOIN AgentesDeVentas ag
         ON ag.AgenteID = cc.usuario_solicitante_id
       WHERE cc.estado = 'PENDIENTE'
       ORDER BY cc.fecha_solicitud ASC`
    );

    const cambios = rows.map((row) => ({
      id: row.id,
      entidad: row.entidad,
      entidadId: row.entidad_id,
      tipoCambio: row.tipo_cambio,
      datosAnteriores: row.datos_anteriores,
      datosNuevos: row.datos_nuevos,
      usuarioSolicitanteId: row.usuario_solicitante_id,
      solicitanteNombre: row.solicitante_nombre || null,
      solicitanteEmail: row.solicitante_email || null,
      estado: row.estado,
      fechaSolicitud: row.fecha_solicitud,
    }));

    return res.json({
      success: true,
      data: {
        cambios,
        total: cambios.length,
      },
    });
  } catch (error) {
    console.error("Error al obtener cambios pendientes:", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener cambios pendientes",
      error: error.message,
    });
  }
}

module.exports = {
  aprobarCambios,
  rechazarCambios,
  obtenerPendientes,
  ENTITY_MAP,
};
