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

async function notifySuperAdmins({
  titulo,
  mensaje,
  url = null,
  metadata = null,
  tipo = "producto",
}) {
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
      [null, adminId, null, tipo, titulo, mensaje, url, "alta", metaJson]
    );
  }
}

async function registrarCambioPasivo(
  req,
  entidad,
  idEntidad,
  accion,
  datosAnteriores,
  datosNuevos
) {
  const entidadStr = (entidad || "").toString().trim();
  if (!entidadStr) {
    throw new Error("entidad requerida");
  }

  const entidadKey = entidadStr.toLowerCase();

  const tipoCambio = (accion || "").toString().trim().toUpperCase();
  if (!typeIsValid(tipoCambio)) {
    throw new Error("accion/tipo_cambio inválido");
  }

  const solicitanteId = Number.parseInt(req?.user?.id ?? req?.user?.userId, 10);
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

  try {
    const solicitante = await getSolicitanteInfo(solicitanteId);
    const nombreUsuario = solicitante.nombre || `Usuario #${solicitanteId}`;

    const idMsg = Number.isInteger(entidadIdParsed) ? entidadIdParsed : String(idEntidad);
    const actionLabel =
      tipoCambio === "INSERT" ? "creó" : tipoCambio === "DELETE" ? "eliminó" : "actualizó";

    let titulo = "Auditoría Pasiva - Cambio aplicado";
    let mensaje = `El usuario ${nombreUsuario} ${actionLabel} ${entidadKey} #${idMsg}.`;
    let url = "/admin-bitacora.html";
    let tipo = "producto";

    if (entidadKey === "pedidos") {
      titulo = "Auditoría Pasiva - Pedido actualizado";
      mensaje = `El usuario ${nombreUsuario} actualizó el pedido #${idMsg}.`;
      url = "/admin-pedidos.html";
      tipo = "pedido";
    } else if (entidadKey === "categorias") {
      titulo = "Auditoría Pasiva - Categoría actualizada";
      mensaje = `El usuario ${nombreUsuario} ${actionLabel} la categoría #${idMsg}.`;
      url = "/admin-categorias.html";
      tipo = "categoria";
    } else if (entidadKey === "clientes") {
      titulo = "Auditoría Pasiva - Cliente actualizado";
      mensaje = `El usuario ${nombreUsuario} ${actionLabel} el cliente #${idMsg}.`;
      url = "/admin-clientes.html";
      tipo = "cliente";
    } else if (entidadKey === "agentes") {
      titulo = "Auditoría Pasiva - Agente actualizado";
      mensaje = `El usuario ${nombreUsuario} ${actionLabel} el agente #${idMsg}.`;
      url = "/admin-agentes.html";
      tipo = "agente";
    } else if (entidadKey === "admins") {
      titulo = "Auditoría Pasiva - Administrador actualizado";
      mensaje = `El usuario ${nombreUsuario} ${actionLabel} el administrador #${idMsg}.`;
      url = "/admin-nuevo-admin.html";
      tipo = "admin";
    } else if (entidadKey === "comisiones") {
      titulo = "Auditoría Pasiva - Comisión actualizada";
      mensaje = `El usuario ${nombreUsuario} ${actionLabel} la comisión #${idMsg}.`;
      url = "/admin-comisiones.html";
      tipo = "comision";
    }

    await notifySuperAdmins({
      titulo,
      mensaje,
      url,
      tipo,
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

/**
 * ============================================
 * AUDIT WRAPPER - PATRÓN INTERCEPTOR
 * ============================================
 * Higher-Order Function que intercepta operaciones CRUD
 * y registra automáticamente cambios en log_movimientos
 */

/**
 * Mapeo de entidades a sus queries de obtención de estado
 */
const ENTITY_QUERIES = {
  clientes: {
    table: 'clientes',
    idColumn: 'clienteid',
    query: 'SELECT * FROM clientes WHERE clienteid = $1'
  },
  pedidos: {
    table: 'pedidos',
    idColumn: 'pedidoid',
    query: 'SELECT * FROM pedidos WHERE pedidoid = $1'
  },
  proveedores: {
    table: 'proveedores',
    idColumn: 'proveedorid',
    query: 'SELECT * FROM proveedores WHERE proveedorid = $1'
  },
  producto_variantes: {
    table: 'producto_variantes',
    idColumn: 'varianteid',
    query: 'SELECT * FROM producto_variantes WHERE varianteid = $1'
  },
  productos: {
    table: 'productos',
    idColumn: 'productoid',
    query: 'SELECT * FROM productos WHERE productoid = $1'
  },
  categorias: {
    table: 'categorias',
    idColumn: 'categoriaid',
    query: 'SELECT * FROM categorias WHERE categoriaid = $1'
  },
  agentesdeventas: {
    table: 'agentesdeventas',
    idColumn: 'agenteid',
    query: 'SELECT * FROM agentesdeventas WHERE agenteid = $1'
  },
  administradores: {
    table: 'administradores',
    idColumn: 'adminid',
    query: 'SELECT * FROM administradores WHERE adminid = $1'
  },
  ordenescompra: {
    table: 'ordenescompra',
    idColumn: 'ordencompraid',
    query: 'SELECT * FROM ordenescompra WHERE ordencompraid = $1'
  }
};

/**
 * Genera un diff detallado comparando dos objetos
 * Solo retorna los campos que cambiaron
 */
function generarDiff(datosAnteriores, datosNuevos) {
  const cambios = {};
  
  if (!datosAnteriores || !datosNuevos) {
    return cambios;
  }

  const todasLasClaves = new Set([
    ...Object.keys(datosAnteriores),
    ...Object.keys(datosNuevos)
  ]);

  for (const clave of todasLasClaves) {
    const valorAnterior = datosAnteriores[clave];
    const valorNuevo = datosNuevos[clave];

    // Comparación profunda
    if (JSON.stringify(valorAnterior) !== JSON.stringify(valorNuevo)) {
      cambios[clave] = {
        antes: valorAnterior !== undefined ? valorAnterior : null,
        ahora: valorNuevo !== undefined ? valorNuevo : null
      };
    }
  }

  return cambios;
}

/**
 * Obtiene el estado actual de un registro desde la base de datos
 */
async function obtenerEstadoActual(entidad, idRegistro, client = null) {
  const entityConfig = ENTITY_QUERIES[entidad.toLowerCase()];
  
  if (!entityConfig) {
    throw new Error(`Entidad "${entidad}" no configurada en ENTITY_QUERIES`);
  }

  const dbClient = client || db;
  const result = await dbClient.query(entityConfig.query, [idRegistro]);
  
  return result.rows[0] || null;
}

/**
 * FUNCIÓN PRINCIPAL: wrapWithAudit
 * 
 * Higher-Order Function que envuelve operaciones CRUD con auditoría automática
 * 
 * @param {Object} params - Parámetros de auditoría
 * @param {number} params.usuarioId - ID del usuario que realiza la operación
 * @param {string} params.nombreUsuario - Nombre del usuario
 * @param {string} params.rol - Rol del usuario
 * @param {string} params.entidad - Nombre de la entidad (tabla)
 * @param {Function} params.operacion - Función asíncrona que ejecuta el cambio real
 * @param {number} params.idRegistro - ID del registro a modificar/eliminar (null para INSERT)
 * @param {string} params.tipoAccion - 'INSERT', 'UPDATE', 'DELETE'
 * @param {string} params.ip - IP del usuario
 * @param {number} params.tenantId - ID del tenant
 * @param {Object} params.client - Cliente de base de datos (para transacciones)
 * @param {Object} params.datosNuevosManual - Datos nuevos manuales (opcional, para INSERT)
 * 
 * @returns {Promise<Object>} Resultado de la operación + metadata de auditoría
 */
async function wrapWithAudit({
  usuarioId,
  nombreUsuario,
  rol,
  entidad,
  operacion,
  idRegistro = null,
  tipoAccion,
  ip = null,
  tenantId = 1,
  client = null,
  datosNuevosManual = null
}) {
  // Validaciones
  if (!entidad || typeof entidad !== 'string') {
    throw new Error('Parámetro "entidad" es requerido y debe ser string');
  }

  if (typeof operacion !== 'function') {
    throw new Error('Parámetro "operacion" debe ser una función');
  }

  const tipoAccionUpper = String(tipoAccion).toUpperCase();
  if (!['INSERT', 'UPDATE', 'DELETE'].includes(tipoAccionUpper)) {
    throw new Error('tipoAccion debe ser INSERT, UPDATE o DELETE');
  }

  const entidadNormalizada = entidad.toLowerCase();
  let datosAnteriores = null;
  let datosNuevos = null;
  let resultado = null;

  try {
    // ============================================
    // PASO A: PRE-EJECUCIÓN (Obtener estado anterior)
    // ============================================
    if ((tipoAccionUpper === 'UPDATE' || tipoAccionUpper === 'DELETE') && idRegistro) {
      try {
        datosAnteriores = await obtenerEstadoActual(entidadNormalizada, idRegistro, client);
      } catch (error) {
        console.warn(`No se pudo obtener estado anterior de ${entidad} #${idRegistro}:`, error.message);
        // Continuar sin datos anteriores
      }
    }

    // ============================================
    // PASO B: EJECUCIÓN (Ejecutar la operación real)
    // ============================================
    resultado = await operacion();

    // ============================================
    // PASO C: POST-EJECUCIÓN (Obtener estado nuevo)
    // ============================================
    if (tipoAccionUpper === 'UPDATE' && idRegistro) {
      try {
        datosNuevos = await obtenerEstadoActual(entidadNormalizada, idRegistro, client);
      } catch (error) {
        console.warn(`No se pudo obtener estado nuevo de ${entidad} #${idRegistro}:`, error.message);
        datosNuevos = datosNuevosManual || resultado;
      }
    } else if (tipoAccionUpper === 'INSERT') {
      // Para INSERT, usar datos manuales o resultado
      datosNuevos = datosNuevosManual || resultado;
    } else if (tipoAccionUpper === 'DELETE') {
      // Para DELETE, datosNuevos es null (registro eliminado)
      datosNuevos = null;
    }

    // ============================================
    // PASO D: DIFFING Y LOGGING
    // ============================================
    let detallesJson = {};

    if (tipoAccionUpper === 'UPDATE') {
      const cambios = generarDiff(datosAnteriores, datosNuevos);
      const camposModificados = Object.keys(cambios);
      
      detallesJson = {
        tipo: 'actualizacion',
        cambios: cambios,
        resumen: camposModificados.length > 0 
          ? `${camposModificados.length} campo(s) modificado(s): ${camposModificados.join(', ')}`
          : 'Sin cambios detectados'
      };
    } else if (tipoAccionUpper === 'DELETE') {
      detallesJson = {
        tipo: 'eliminacion',
        snapshot: datosAnteriores,
        mensaje: 'Registro eliminado - snapshot completo guardado'
      };
    } else if (tipoAccionUpper === 'INSERT') {
      detallesJson = {
        tipo: 'creacion',
        datos: datosNuevos
      };
    }

    // Insertar en log_movimientos
    const accionLog = tipoAccionUpper === 'INSERT' ? 'CREAR' 
                    : tipoAccionUpper === 'UPDATE' ? 'EDITAR'
                    : 'ELIMINAR';

    const logQuery = `
      INSERT INTO log_movimientos (
        usuarioid,
        nombreusuario,
        rol,
        accion,
        entidad,
        entidadid,
        detalles,
        ip,
        tenant_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING logid
    `;

    const logValues = [
      usuarioId || null,
      nombreUsuario || 'Sistema',
      rol || 'sistema',
      accionLog,
      entidad,
      idRegistro || null,
      JSON.stringify(detallesJson),
      ip || null,
      tenantId || 1
    ];

    const dbClient = client || db;
    const logResult = await dbClient.query(logQuery, logValues);
    const logId = logResult.rows[0]?.logid;

    // Retornar resultado + metadata de auditoría
    return {
      resultado,
      auditoria: {
        logId,
        entidad,
        idRegistro,
        tipoAccion: tipoAccionUpper,
        cambiosDetectados: tipoAccionUpper === 'UPDATE' ? Object.keys(generarDiff(datosAnteriores, datosNuevos)).length : null
      }
    };

  } catch (error) {
    // Si la operación falla, registrar el intento fallido
    console.error(`Error en wrapWithAudit para ${entidad}:`, error);
    
    try {
      const dbClient = client || db;
      await dbClient.query(
        `INSERT INTO log_movimientos (
          usuarioid, nombreusuario, rol, accion, entidad, entidadid, 
          detalles, ip, tenant_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          usuarioId || null,
          nombreUsuario || 'Sistema',
          rol || 'sistema',
          'OTRO',
          entidad,
          idRegistro || null,
          JSON.stringify({
            tipo: 'error',
            mensaje: error.message,
            accionIntentada: tipoAccion
          }),
          ip || null,
          tenantId || 1
        ]
      );
    } catch (logError) {
      console.error('Error al registrar fallo en auditoría:', logError);
    }

    throw error;
  }
}

/**
 * Versión simplificada de wrapWithAudit para usar con req object
 */
async function wrapWithAuditFromReq(req, entidad, operacion, idRegistro, tipoAccion, client = null, datosNuevosManual = null) {
  return wrapWithAudit({
    usuarioId: req.user?.id || req.user?.userId || null,
    nombreUsuario: req.user?.nombre || req.user?.email || 'Sistema',
    rol: req.user?.rol || req.user?.tipo || 'sistema',
    entidad,
    operacion,
    idRegistro,
    tipoAccion,
    ip: req.ip || req.connection?.remoteAddress || null,
    tenantId: req.tenant?.tenant_id || 1,
    client,
    datosNuevosManual
  });
}

module.exports = {
  registrarCambio,
  registrarCambioPasivo,
  wrapWithAudit,
  wrapWithAuditFromReq,
  generarDiff,
  obtenerEstadoActual
};
