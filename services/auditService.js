const db = require("../db");

async function getSolicitanteInfo(usuarioId) {
  const id = Number.parseInt(usuarioId, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return { nombre: null, email: null };
  }

  const adminRes = await db.query(
    "SELECT nombre, email FROM administradores WHERE adminid = $1 LIMIT 1",
    [id]
  );
  if (adminRes.rows && adminRes.rows.length) {
    return {
      nombre: adminRes.rows[0].nombre || null,
      email: adminRes.rows[0].email || null,
    };
  }

  const agenteRes = await db.query(
    "SELECT nombre, email FROM agentesdeventas WHERE agenteid = $1 LIMIT 1",
    [id]
  );
  if (agenteRes.rows && agenteRes.rows.length) {
    return {
      nombre: agenteRes.rows[0].nombre || null,
      email: agenteRes.rows[0].email || null,
    };
  }

  return { nombre: null, email: null };
}

async function notifySuperAdmins({ titulo, mensaje, url = null, metadata = null }) {
  const res = await db.query(
    `SELECT adminid, nombre
     FROM administradores
     WHERE activo = TRUE
       AND LOWER(rol) IN ('superadmin', 'super-admin', 'super admin')`,
    []
  );

  const superAdmins = res.rows || [];
  if (!superAdmins.length) return;

  const metaJson = metadata ? JSON.stringify(metadata) : "{}";

  for (const a of superAdmins) {
    const adminId = Number.parseInt(a.adminid, 10);
    if (!Number.isInteger(adminId) || adminId <= 0) continue;

    await db.query(
      `INSERT INTO notificaciones
        (clienteid, administrador_id, agente_id, tipo, titulo, mensaje, url, prioridad, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [null, adminId, null, "producto", titulo, mensaje, url, "alta", metaJson]
    );
  }
}

async function registrarCambio(
  entidad,
  idEntidad,
  accion,
  datosAnteriores,
  datosNuevos,
  usuarioId
) {
  const entidadStr = (entidad || "").toString().trim();
  if (!entidadStr) {
    throw new Error("entidad requerida");
  }

  const tipoCambio = (accion || "").toString().trim().toUpperCase();
  if (!typeIsValid(tipoCambio)) {
    throw new Error("accion/tipo_cambio inválido");
  }

  const solicitanteId = Number.parseInt(usuarioId, 10);
  if (!Number.isInteger(solicitanteId) || solicitanteId <= 0) {
    throw new Error("usuarioId inválido");
  }

  const entidadIdParsed =
    idEntidad !== undefined && idEntidad !== null
      ? Number.parseInt(idEntidad, 10)
      : null;

  const insertRes = await db.query(
    `INSERT INTO control_cambios (
      entidad,
      entidad_id,
      tipo_cambio,
      datos_anteriores,
      datos_nuevos,
      usuario_solicitante_id,
      estado,
      fecha_resolucion,
      usuario_resolutor_id
    )
    VALUES ($1, $2, $3, $4, $5, $6, 'APROBADO', NOW(), $6)
    RETURNING id`,
    [
      entidadStr,
      Number.isInteger(entidadIdParsed) ? entidadIdParsed : idEntidad || null,
      tipoCambio,
      datosAnteriores ? JSON.stringify(datosAnteriores) : null,
      JSON.stringify(datosNuevos || {}),
      solicitanteId,
    ]
  );

  const cambioId = insertRes.rows?.[0]?.id ?? null;

  // Notificación a superadmins (silenciosa; si falla no rompe)
  try {
    const solicitante = await getSolicitanteInfo(solicitanteId);
    const nombreUsuario = solicitante.nombre || `Usuario #${solicitanteId}`;

    const nombreEntidad = entidadStr;
    const nombreProducto =
      (datosNuevos &&
        (datosNuevos.NombreProducto ||
          datosNuevos.nombreproducto ||
          datosNuevos.nombre)) ||
      null;

    const titulo = "Cambio aplicado (Auditoría Pasiva)";
    const mensaje = `${nombreUsuario} modificó ${nombreEntidad}${
      nombreProducto ? `: ${String(nombreProducto).trim()}` : ""
    }.`;

    await notifySuperAdmins({
      titulo,
      mensaje,
      url: "/admin-bitacora.html",
      metadata: {
        entidad: entidadStr,
        entidad_id: Number.isInteger(entidadIdParsed) ? entidadIdParsed : null,
        tipo_cambio: tipoCambio,
        cambio_id: cambioId,
      },
    });
  } catch (e) {
    // silencioso
  }

  return {
    success: true,
    cambioId,
  };
}

function typeIsValid(t) {
  return t === "INSERT" || t === "UPDATE" || t === "DELETE";
}

module.exports = {
  registrarCambio,
};
