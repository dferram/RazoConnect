const db = require("../db");

const TIPOS_CAMBIO = ["INSERT", "UPDATE", "DELETE"];

// Mapeos de campos lógicos -> columnas reales para entidades específicas
// Útil para compatibilidad hacia atrás cuando se guardaron claves como "Estatus".
const FIELD_MAPPINGS = {
  pedidos: {
    Estatus: "estatus",
  },
  comisiones: {
    Estatus: "estatus",
    FechaPago: "fechapago",
  },
};

// Lista blanca de entidades administrables. El valor "table" se usa solo como metadato;
// la lógica de aprobación real se implementará en un endpoint dedicado.
const ENTIDADES_PERMITIDAS = {
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

  // En tokens de admin ya se está usando "id" y "roles" (ver adminController.loginAdmin)
  if (req.user.tipo === "admin") {
    return req.user.id || req.user.userId || null;
  }

  const rol = (req.user.rol || "").toString().toLowerCase();
  const roles = Array.isArray(req.user.roles)
    ? req.user.roles.map((r) => String(r).toLowerCase())
    : [];

  if (rol === "agente" || roles.includes("agente")) {
    return req.user.userId || req.user.id || null;
  }

  return null;
}

/**
 * Registra una solicitud de cambio en la tabla control_cambios.
 * NO ejecuta cambios reales sobre las tablas de negocio.
 *
 * @param {object} req - Request de Express (se usa para obtener usuario_solicitante_id)
 * @param {string} entidad - Nombre lógico de la entidad (ej. 'productos', 'producto_variantes')
 * @param {number|null} entidadId - ID del registro afectado (si aplica)
 * @param {('INSERT'|'UPDATE'|'DELETE')} tipoCambio
 * @param {object} datosNuevos - Objeto con los valores propuestos
 * @param {object|null} datosAnteriores - Snapshot previo (opcional)
 */
async function solicitarCambio(
  req,
  entidad,
  entidadId,
  tipoCambio,
  datosNuevos,
  datosAnteriores = null
) {
  if (!TIPOS_CAMBIO.includes(tipoCambio)) {
    throw new Error("Tipo de cambio no permitido");
  }

  const config = ENTIDADES_PERMITIDAS[entidad];
  if (!config) {
    throw new Error(`Entidad no permitida para control de cambios: ${entidad}`);
  }

  const usuarioId = getAdminIdFromRequest(req);
  if (!usuarioId) {
    throw new Error("Usuario solicitante no identificado como admin");
  }

  const insertSql = `
    INSERT INTO control_cambios (
      entidad,
      entidad_id,
      tipo_cambio,
      datos_anteriores,
      datos_nuevos,
      usuario_solicitante_id
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, estado, fecha_solicitud
  `;

  const values = [
    entidad,
    entidadId || null,
    tipoCambio,
    datosAnteriores ? JSON.stringify(datosAnteriores) : null,
    JSON.stringify(datosNuevos || {}),
    usuarioId,
  ];

  const { rows } = await db.query(insertSql, values);
  const solicitud = rows[0];

  return {
    success: true,
    solicitudId: solicitud.id,
    mensaje: `Solicitud de cambio #${solicitud.id} creada. Pendiente de aprobación.`,
    estado: solicitud.estado,
    fecha_solicitud: solicitud.fecha_solicitud,
  };
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

/**
 * Aplica físicamente en la BD un conjunto de solicitudes de cambio ya registradas
 * en control_cambios.
 *
 * Se usa tanto desde el endpoint HTTP de aprobación como para auto-aprobación
 * cuando el usuario es superadmin.
 *
 * @param {Array<number|string>} ids - IDs de registros en control_cambios
 * @param {number} adminId - ID del administrador resolutor
 * @returns {Promise<{applied: Array, skipped: Array}>}
 */
async function aprobarSolicitudes(ids, adminId) {
  if (!adminId) {
    throw new Error("Usuario resolutor no identificado");
  }

  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error(
      "Debes proporcionar un arreglo de IDs de cambios a aprobar"
    );
  }

  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const applied = [];
    const skipped = [];

    for (const rawId of ids) {
      const cambioId = Number.parseInt(rawId, 10);
      if (!Number.isInteger(cambioId)) {
        skipped.push({ id: rawId, reason: "ID inválido" });
        continue;
      }

      const { rows } = await client.query(
        `SELECT * FROM control_cambios
         WHERE id = $1 AND estado = 'PENDIENTE'
         FOR UPDATE`,
        [cambioId]
      );

      if (rows.length === 0) {
        skipped.push({ id: cambioId, reason: "No encontrado o no pendiente" });
        continue;
      }

      const cambio = rows[0];
      const entidadKey = String(cambio.entidad || "").toLowerCase();
      const entityConfig = ENTIDADES_PERMITIDAS[entidadKey];

      if (!entityConfig) {
        throw new Error(
          `Entidad no soportada o no permitida: ${cambio.entidad}`
        );
      }

      const { table, pk } = entityConfig;
      const tipoCambio = cambio.tipo_cambio;
      const entidadId = cambio.entidad_id;
      const nuevos = ensureJsonObject(cambio.datos_nuevos);
      const fieldMap = FIELD_MAPPINGS[entidadKey] || {};

      if (tipoCambio === "INSERT") {
        const columns = Object.keys(nuevos || {});
        if (!columns.length) {
          throw new Error(
            `Cambio #${cambioId} de tipo INSERT no tiene datos_nuevos`
          );
        }

        const colNames = columns.map((c) => `"${c}"`).join(", ");
        const placeholders = columns.map((_, idx) => `$${idx + 1}`);
        const values = columns.map((c) => nuevos[c]);

        const insertSql = `INSERT INTO ${table} (${colNames}) VALUES (${placeholders.join(
          ", "
        )}) RETURNING ${pk}`;
        const insertResult = await client.query(insertSql, values);
        const inserted = insertResult.rows[0];
        const newPkValue = inserted[pk.toLowerCase()] ?? inserted[pk];

        await client.query(
          `UPDATE control_cambios
           SET estado = 'APROBADO',
               entidad_id = COALESCE(entidad_id, $1),
               fecha_resolucion = NOW(),
               usuario_resolutor_id = $2
           WHERE id = $3`,
          [newPkValue || null, adminId, cambioId]
        );

        applied.push({
          id: cambioId,
          cambioId,
          entidad: cambio.entidad,
          tipo: tipoCambio,
          entidadId: newPkValue || entidadId || null,
        });
      } else if (tipoCambio === "UPDATE") {
        if (!entidadId) {
          throw new Error(
            `Cambio #${cambioId} de tipo UPDATE no tiene entidad_id definido`
          );
        }

        const rawColumns = Object.keys(nuevos || {});
        if (!rawColumns.length) {
          skipped.push({ id: cambioId, reason: "Sin campos para actualizar" });
          continue;
        }

        const columns = [];
        const values = [];

        for (const rawCol of rawColumns) {
          const mappedCol = fieldMap[rawCol] || rawCol;
          columns.push(mappedCol);
          values.push(nuevos[rawCol]);
        }

        const setClauses = columns
          .map((c, idx) => `"${c}" = $${idx + 1}`)
          .join(", ");

        values.push(entidadId);

        const updateSql = `UPDATE ${table} SET ${setClauses} WHERE ${pk} = $${
          columns.length + 1
        }`;

        await client.query(updateSql, values);

        await client.query(
          `UPDATE control_cambios
           SET estado = 'APROBADO',
               fecha_resolucion = NOW(),
               usuario_resolutor_id = $1
           WHERE id = $2`,
          [adminId, cambioId]
        );

        applied.push({
          id: cambioId,
          cambioId,
          entidad: cambio.entidad,
          tipo: tipoCambio,
          entidadId,
        });
      } else if (tipoCambio === "DELETE") {
        if (!entidadId) {
          throw new Error(
            `Cambio #${cambioId} de tipo DELETE no tiene entidad_id definido`
          );
        }

        const deleteSql = `DELETE FROM ${table} WHERE ${pk} = $1`;
        await client.query(deleteSql, [entidadId]);

        await client.query(
          `UPDATE control_cambios
           SET estado = 'APROBADO',
               fecha_resolucion = NOW(),
               usuario_resolutor_id = $1
           WHERE id = $2`,
          [adminId, cambioId]
        );

        applied.push({
          id: cambioId,
          cambioId,
          entidad: cambio.entidad,
          tipo: tipoCambio,
          entidadId,
        });
      } else {
        throw new Error(`Tipo de cambio no soportado: ${tipoCambio}`);
      }
    }

    await client.query("COMMIT");

    return {
      applied,
      skipped,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  solicitarCambio,
  aprobarSolicitudes,
  ENTIDADES_PERMITIDAS,
};
