/**
 * REGLAS DE EMPAQUE CONTROLLER
 * 
 * Controlador especializado para gestión de reglas de empaque de proveedores.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/reglasEmpaqueController
 * @author RazoConnect Team
 * @date 2026-02-27
 */

const db = require('../db');
const logger = require('../utils/logger');

/**
 * Función auxiliar para notificar a super admins
 */
async function notifySuperAdmins(client, payload) {
  try {
    const superAdminsResult = await client.query(
      `SELECT adminid
       FROM administradores
       WHERE rol = 'superadmin' AND activo = true`
    );

    const superAdminIds = superAdminsResult.rows.map(row => row.adminid);

    if (superAdminIds.length === 0) {
      return;
    }

    const { tipo, prioridad, titulo, mensaje, url, metadata } = payload;

    for (const adminId of superAdminIds) {
      await client.query(
        `INSERT INTO notificaciones (
           admin_id,
           tipo,
           prioridad,
           titulo,
           mensaje,
           url,
           metadata,
           leida,
           fecha_creacion
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, false, NOW())`,
        [
          adminId,
          tipo || 'sistema',
          prioridad || 'media',
          titulo,
          mensaje,
          url || null,
          metadata ? JSON.stringify(metadata) : null
        ]
      );
    }
  } catch (error) {
    logger.error('Error al notificar super admins:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
  }
}

/**
 * Obtener reglas de empaque de un proveedor
 * GET /api/admin/proveedores/:id/reglas-empaque
 */
const getReglasEmpaqueProveedor = async (req, res) => {
  try {
    const proveedorId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(proveedorId) || proveedorId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ProveedorID inválido",
      });
    }

    const proveedorResult = await db.query(
      `SELECT proveedorid
       FROM proveedores
       WHERE proveedorid = $1`,
      [proveedorId]
    );

    if (!proveedorResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Proveedor no encontrado",
      });
    }

    let reglasResult;
    try {
      reglasResult = await db.query(
        `SELECT pre.reglaid, pre.tipoproductoid, pre.cantidadempaque, tp.nombre as nombre_tipo
         FROM proveedor_reglas_empaque pre
         JOIN tipoproducto tp ON pre.tipoproductoid = tp.tipoproductoid
         WHERE pre.proveedorid = $1`,
        [proveedorId]
      );
    } catch (dbError) {
      if (dbError && dbError.code === "42703") {
        reglasResult = await db.query(
          `SELECT pre.reglaid, pre.tipoproductoid, pre.piezasporpaquete AS cantidadempaque, tp.nombre as nombre_tipo
           FROM proveedor_reglas_empaque pre
           JOIN tipoproducto tp ON pre.tipoproductoid = tp.tipoproductoid
           WHERE pre.proveedorid = $1`,
          [proveedorId]
        );
      } else {
        throw dbError;
      }
    }

    const reglas = (reglasResult?.rows || []).map(row => ({
      reglaid: row.reglaid,
      tipoproductoid: row.tipoproductoid,
      cantidadempaque: parseInt(row.cantidadempaque, 10),
      nombre_tipo: row.nombre_tipo,
      nombre_regla: `${row.nombre_tipo} (${row.cantidadempaque} piezas)`
    })).filter(regla => 
      regla.tipoproductoid !== null && 
      regla.cantidadempaque !== null && 
      Number.isInteger(regla.cantidadempaque) && 
      regla.cantidadempaque > 0
    );

    return res.status(200).json({
      success: true,
      message: "Reglas de empaque obtenidas exitosamente",
      data: {
        reglas,
      },
    });
  } catch (error) {
    logger.error('Error al obtener reglas de empaque del proveedor:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "Error al obtener reglas de empaque",
      error: error.message,
    });
  }
};

/**
 * Obtener reglas de empaque múltiples de un proveedor
 * GET /api/admin/proveedores/:id/reglas-empaque-multiples
 */
const getReglasEmpaqueProveedorMultiples = async (req, res) => {
  try {
    const proveedorId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(proveedorId) || proveedorId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ProveedorID inválido",
      });
    }

    const proveedorResult = await db.query(
      `SELECT proveedorid
       FROM proveedores
       WHERE proveedorid = $1`,
      [proveedorId]
    );

    if (!proveedorResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Proveedor no encontrado",
      });
    }

    const reglasResult = await db.query(
      `SELECT reglaid, tipoproductoid, cantidadempaque, descripcion
       FROM proveedor_reglas_empaque
       WHERE proveedorid = $1
       ORDER BY tipoproductoid ASC, cantidadempaque ASC, reglaid ASC`,
      [proveedorId]
    );

    const reglas = (reglasResult.rows || []).map((row) => ({
      reglaid: Number.parseInt(row.reglaid, 10) || null,
      tipoproductoid: Number.parseInt(row.tipoproductoid, 10) || null,
      cantidadempaque: Number.parseInt(row.cantidadempaque, 10) || 1,
      nombre_regla: (row.descripcion || "").toString().trim(),
    }));

    return res.status(200).json({
      success: true,
      message: "Reglas de empaque obtenidas exitosamente",
      data: {
        reglas,
      },
    });
  } catch (error) {
    logger.error('Error al obtener reglas de empaque múltiples:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "Error al obtener reglas de empaque",
      error: error.message,
    });
  }
};

/**
 * Guardar reglas de empaque múltiples
 * POST /api/admin/proveedores/:id/reglas-empaque-multiples
 */
const saveReglasEmpaqueMultiples = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const proveedorIdRaw = req.body?.proveedorId ?? req.body?.proveedorid ?? req.body?.ProveedorID;
    const proveedorId = Number.parseInt(proveedorIdRaw, 10);

    if (!Number.isInteger(proveedorId) || proveedorId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ProveedorID inválido",
      });
    }

    const reglasInput = Array.isArray(req.body?.reglas) ? req.body.reglas : [];
    if (!reglasInput.length) {
      return res.status(400).json({
        success: false,
        message: "Debes enviar al menos una regla",
      });
    }

    const adminId = req?.user?.id ?? req?.user?.userId ?? null;
    const adminIdParsed = Number.parseInt(adminId, 10);
    if (!Number.isInteger(adminIdParsed) || adminIdParsed <= 0) {
      return res.status(401).json({
        success: false,
        message: "Usuario solicitante no identificado como admin",
      });
    }

    const reglasNormalized = [];
    const tipoNombresSet = new Set();
    const dupeGuard = new Set();

    for (const raw of reglasInput) {
      const reglaidParsed = Number.parseInt(raw?.reglaid, 10);
      const tipoNombre = (raw?.tipo_nombre ?? raw?.tipoNombre ?? "")
        .toString()
        .trim();
      const cantidadempaque = Number.parseInt(
        raw?.cantidadempaque ?? raw?.cantidadEmpaque ?? raw?.piezasPorPaquete,
        10
      );
      const nombreRegla = (raw?.nombre_regla ?? raw?.nombreRegla ?? raw?.descripcion ?? "")
        .toString()
        .trim();

      const reglaid = Number.isInteger(reglaidParsed) && reglaidParsed > 0 ? reglaidParsed : null;

      if (!tipoNombre) {
        return res.status(400).json({
          success: false,
          message: "Hay reglas sin tipo de producto especificado",
        });
      }

      if (!isNaN(tipoNombre) && !isNaN(parseFloat(tipoNombre))) {
        return res.status(400).json({
          success: false,
          message: `El nombre del tipo de producto no puede ser un número. Usa un nombre descriptivo (ej: 'Caja Grande', 'Peluche'). Valor recibido: "${tipoNombre}"`,
        });
      }

      if (!Number.isInteger(cantidadempaque) || cantidadempaque <= 0) {
        return res.status(400).json({
          success: false,
          message: "Hay reglas con cantidadempaque inválida",
        });
      }

      if (!nombreRegla) {
        return res.status(400).json({
          success: false,
          message: "Hay reglas sin nombre_regla",
        });
      }

      const nombreTrim = nombreRegla.length > 100 ? nombreRegla.slice(0, 100) : nombreRegla;
      const tipoNombreTrim = tipoNombre.length > 50 ? tipoNombre.slice(0, 50) : tipoNombre;
      const key = `${tipoNombreTrim.toLowerCase()}|${cantidadempaque}|${nombreTrim.toLowerCase()}`;
      if (dupeGuard.has(key)) {
        return res.status(400).json({
          success: false,
          message: "No se permiten reglas duplicadas (tipo, piezas y nombre)",
        });
      }
      dupeGuard.add(key);
      tipoNombresSet.add(tipoNombreTrim);

      reglasNormalized.push({
        reglaid,
        tipo_nombre: tipoNombreTrim,
        cantidadempaque,
        nombre_regla: nombreTrim,
      });
    }

    await client.query("BEGIN");

    const proveedorResult = await client.query(
      `SELECT proveedorid
       FROM proveedores
       WHERE proveedorid = $1
       FOR UPDATE`,
      [proveedorId]
    );

    if (!proveedorResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Proveedor no encontrado",
      });
    }

    const tipoNombres = Array.from(tipoNombresSet);
    const tiposExistentes = await client.query(
      `SELECT tipoproductoid, nombre
       FROM tipoproducto
       WHERE LOWER(nombre) = ANY($1::text[])`,
      [tipoNombres.map(n => n.toLowerCase())]
    );

    const tipoNombreToIdMap = new Map();
    for (const row of tiposExistentes.rows || []) {
      const id = Number.parseInt(row.tipoproductoid, 10);
      const nombre = (row.nombre || "").toString().trim();
      if (Number.isInteger(id) && id > 0 && nombre) {
        tipoNombreToIdMap.set(nombre.toLowerCase(), id);
      }
    }

    for (const tipoNombre of tipoNombres) {
      const nombreLower = tipoNombre.toLowerCase();
      if (!tipoNombreToIdMap.has(nombreLower)) {
        const insertTipo = await client.query(
          `INSERT INTO tipoproducto (nombre)
           VALUES ($1)
           RETURNING tipoproductoid`,
          [tipoNombre]
        );
        const newId = Number.parseInt(insertTipo.rows?.[0]?.tipoproductoid, 10);
        if (Number.isInteger(newId) && newId > 0) {
          tipoNombreToIdMap.set(nombreLower, newId);
        } else {
          await client.query("ROLLBACK");
          return res.status(500).json({
            success: false,
            message: `No se pudo crear el tipo de producto: ${tipoNombre}`,
          });
        }
      }
    }

    for (const r of reglasNormalized) {
      const tipoId = tipoNombreToIdMap.get(r.tipo_nombre.toLowerCase());
      if (!tipoId) {
        await client.query("ROLLBACK");
        return res.status(500).json({
          success: false,
          message: `No se pudo mapear el tipo de producto: ${r.tipo_nombre}`,
        });
      }
      r.tipoproductoid = tipoId;
    }

    const existentesRes = await client.query(
      `SELECT reglaid
       FROM proveedor_reglas_empaque
       WHERE proveedorid = $1
       FOR UPDATE`,
      [proveedorId]
    );

    const existentesSet = new Set(
      (existentesRes.rows || [])
        .map((r) => Number.parseInt(r.reglaid, 10))
        .filter((id) => Number.isInteger(id) && id > 0)
    );

    const keepIds = [];

    for (const r of reglasNormalized) {
      if (!r.tipoproductoid) {
        await client.query("ROLLBACK");
        return res.status(500).json({
          success: false,
          message: "Error interno: tipoproductoid no asignado",
        });
      }

      if (r.reglaid) {
        if (!existentesSet.has(r.reglaid)) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            success: false,
            message: "Hay reglas con reglaid inválido para este proveedor",
          });
        }

        const upd = await client.query(
          `UPDATE proveedor_reglas_empaque
           SET tipoproductoid = $3,
               cantidadempaque = $4,
               descripcion = $5
           WHERE proveedorid = $1 AND reglaid = $2`,
          [proveedorId, r.reglaid, r.tipoproductoid, r.cantidadempaque, r.nombre_regla]
        );

        if (!upd.rowCount) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            success: false,
            message: "No se pudo actualizar una regla (no encontrada)",
          });
        }

        keepIds.push(r.reglaid);
        continue;
      }

      const ins = await client.query(
        `INSERT INTO proveedor_reglas_empaque (proveedorid, tipoproductoid, cantidadempaque, descripcion)
         VALUES ($1, $2, $3, $4)
         RETURNING reglaid`,
        [proveedorId, r.tipoproductoid, r.cantidadempaque, r.nombre_regla]
      );

      const newId = Number.parseInt(ins.rows?.[0]?.reglaid ?? 0, 10);
      if (Number.isInteger(newId) && newId > 0) {
        keepIds.push(newId);
      }
    }

    if (keepIds.length) {
      await client.query(
        `DELETE FROM proveedor_reglas_empaque
         WHERE proveedorid = $1
           AND reglaid <> ALL($2::int[])`,
        [proveedorId, keepIds]
      );
    } else {
      await client.query(`DELETE FROM proveedor_reglas_empaque WHERE proveedorid = $1`, [proveedorId]);
    }

    await client.query("COMMIT");

    const reglasResult = await db.query(
      `SELECT reglaid, tipoproductoid, cantidadempaque, descripcion
       FROM proveedor_reglas_empaque
       WHERE proveedorid = $1
       ORDER BY tipoproductoid ASC, cantidadempaque ASC, reglaid ASC`,
      [proveedorId]
    );

    const reglas = (reglasResult.rows || []).map((row) => ({
      reglaid: Number.parseInt(row.reglaid, 10) || null,
      tipoproductoid: Number.parseInt(row.tipoproductoid, 10) || null,
      cantidadempaque: Number.parseInt(row.cantidadempaque, 10) || 1,
      nombre_regla: (row.descripcion || "").toString().trim(),
    }));

    return res.status(200).json({
      success: true,
      message: "Reglas guardadas correctamente",
      data: {
        reglas,
      },
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (e) {
      // ignore
    }
    logger.error('Error al guardar reglas de empaque múltiples:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "Error al guardar reglas de empaque",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

/**
 * Guardar una regla de empaque individual
 * POST /api/admin/proveedores/:id/reglas-empaque
 */
const saveReglaEmpaque = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const proveedorIdRaw =
      req.params.id ?? req.body.proveedorId ?? req.body.proveedorid ?? req.body.ProveedorID;
    const proveedorId = Number.parseInt(proveedorIdRaw, 10);
    if (!Number.isInteger(proveedorId) || proveedorId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ProveedorID inválido",
      });
    }

    const tipoProductoIdRaw =
      req.body.tipoproductoid ?? req.body.TipoProductoID ?? req.body.tipoProductoId;
    const tipoProductoNombreRaw =
      req.body.tipoProductoNombre ?? req.body.tipoProducto ?? req.body.TipoProducto;

    const tipoProductoIdParsed = Number.parseInt(tipoProductoIdRaw, 10);
    let tipoProductoId =
      Number.isInteger(tipoProductoIdParsed) && tipoProductoIdParsed > 0
        ? tipoProductoIdParsed
        : null;

    const tipoProductoNombre = (() => {
      if (tipoProductoNombreRaw === undefined || tipoProductoNombreRaw === null) {
        return null;
      }
      const txt = String(tipoProductoNombreRaw).trim();
      return txt.length ? txt : null;
    })();

    if (!tipoProductoId && !tipoProductoNombre) {
      return res.status(400).json({
        success: false,
        message: "TipoProductoID inválido",
      });
    }

    const cantidadEmpaque = Number.parseInt(
      req.body.cantidadempaque ?? req.body.cantidadEmpaque ?? req.body.piezasPorPaquete,
      10
    );
    if (!Number.isInteger(cantidadEmpaque) || cantidadEmpaque <= 0) {
      return res.status(400).json({
        success: false,
        message: "cantidadEmpaque inválida",
      });
    }

    await client.query("BEGIN");

    const proveedorResult = await client.query(
      `SELECT proveedorid, nombreempresa
       FROM proveedores
       WHERE proveedorid = $1`,
      [proveedorId]
    );
    if (!proveedorResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Proveedor no encontrado",
      });
    }

    const proveedorNombre = proveedorResult.rows[0]?.nombreempresa || "Proveedor";

    if (!tipoProductoId && tipoProductoNombre) {
      const creado = await client.query(
        `INSERT INTO tipoproducto (nombre, descripcion, activo)
         VALUES ($1, NULL, TRUE)
         ON CONFLICT (nombre)
         DO UPDATE SET activo = TRUE
         RETURNING tipoproductoid`,
        [tipoProductoNombre]
      );
      const nuevoId = Number.parseInt(creado.rows[0]?.tipoproductoid, 10);
      if (!Number.isInteger(nuevoId) || nuevoId <= 0) {
        return res.status(500).json({
          success: false,
          message: "No se pudo crear el tipo de producto",
        });
      }
      tipoProductoId = nuevoId;
    }

    const tipoResult = await client.query(
      `SELECT tipoproductoid, nombre
       FROM tipoproducto
       WHERE tipoproductoid = $1`,
      [tipoProductoId]
    );
    if (!tipoResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Tipo de producto no encontrado",
      });
    }

    const tipoProductoNombreFinal = tipoResult.rows[0]?.nombre || "Tipo";

    let reglaExistenteResult;
    try {
      reglaExistenteResult = await client.query(
        `SELECT reglaid, cantidadempaque
         FROM proveedor_reglas_empaque
         WHERE proveedorid = $1
           AND tipoproductoid = $2
         LIMIT 1
         FOR UPDATE`,
        [proveedorId, tipoProductoId]
      );
    } catch (dbError) {
      if (dbError && dbError.code === "42703") {
        reglaExistenteResult = await client.query(
          `SELECT reglaid, piezasporpaquete AS cantidadempaque
           FROM proveedor_reglas_empaque
           WHERE proveedorid = $1
             AND tipoproductoid = $2
           LIMIT 1
           FOR UPDATE`,
          [proveedorId, tipoProductoId]
        );
      } else {
        throw dbError;
      }
    }

    const reglaExistente = reglaExistenteResult.rows[0] || null;
    const tipoCambio = reglaExistente ? "UPDATE" : "INSERT";

    const datosAnteriores = reglaExistente
      ? {
          proveedorid: proveedorId,
          tipoproductoid: tipoProductoId,
          cantidadempaque: Number.parseInt(reglaExistente.cantidadempaque, 10) || 1,
        }
      : null;

    const datosNuevos = {
      proveedorid: proveedorId,
      tipoproductoid: tipoProductoId,
      cantidadempaque: cantidadEmpaque,
    };

    let reglaid;
    if (reglaExistente) {
      reglaid = reglaExistente.reglaid;
      try {
        await client.query(
          `UPDATE proveedor_reglas_empaque
           SET cantidadempaque = $3
           WHERE reglaid = $1 AND proveedorid = $2`,
          [reglaid, proveedorId, cantidadEmpaque]
        );
      } catch (dbError) {
        if (dbError && dbError.code === "42703") {
          await client.query(
            `UPDATE proveedor_reglas_empaque
             SET piezasporpaquete = $3
             WHERE reglaid = $1 AND proveedorid = $2`,
            [reglaid, proveedorId, cantidadEmpaque]
          );
        } else {
          throw dbError;
        }
      }
    } else {
      let insertResult;
      try {
        insertResult = await client.query(
          `INSERT INTO proveedor_reglas_empaque (proveedorid, tipoproductoid, cantidadempaque)
           VALUES ($1, $2, $3)
           RETURNING reglaid`,
          [proveedorId, tipoProductoId, cantidadEmpaque]
        );
      } catch (dbError) {
        if (dbError && dbError.code === "42703") {
          insertResult = await client.query(
            `INSERT INTO proveedor_reglas_empaque (proveedorid, tipoproductoid, piezasporpaquete)
             VALUES ($1, $2, $3)
             RETURNING reglaid`,
            [proveedorId, tipoProductoId, cantidadEmpaque]
          );
        } else {
          throw dbError;
        }
      }
      reglaid = insertResult.rows[0]?.reglaid ?? null;
    }

    const adminId = req?.user?.id ?? req?.user?.userId ?? null;
    const adminIdParsed = Number.parseInt(adminId, 10);
    if (!Number.isInteger(adminIdParsed) || adminIdParsed <= 0) {
      throw new Error("Usuario solicitante no identificado como admin");
    }

    const adminNombreResult = await client.query(
      `SELECT nombre
       FROM administradores
       WHERE adminid = $1`,
      [adminIdParsed]
    );
    const adminNombre = adminNombreResult.rows[0]?.nombre || "Usuario";

    const tenant_id = req.tenant?.tenant_id || 1;
    const cambioRes = await client.query(
      `INSERT INTO control_cambios (
         entidad,
         entidad_id,
         tipo_cambio,
         datos_anteriores,
         datos_nuevos,
         usuario_solicitante_id,
         estado,
         fecha_resolucion,
         usuario_resolutor_id,
         tenant_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'APROBADO', NOW(), $6, $7)
       RETURNING id`,
      [
        "proveedor_reglas_empaque",
        reglaid,
        tipoCambio,
        datosAnteriores ? JSON.stringify(datosAnteriores) : null,
        JSON.stringify(datosNuevos),
        adminIdParsed,
        tenant_id
      ]
    );

    await notifySuperAdmins(client, {
      tipo: "sistema",
      prioridad: "media",
      titulo: "Aviso: Regla de Empaque Modificada",
      mensaje: `El usuario ${adminNombre} modificó la regla de empaque para ${proveedorNombre} - ${tipoProductoNombreFinal}: ${cantidadEmpaque} piezas`,
      url: `/admin-proveedor-detalle.html?id=${proveedorId}`,
      metadata: {
        proveedorId,
        proveedorNombre,
        tipoProductoId,
        tipoProductoNombre: tipoProductoNombreFinal,
        cantidadEmpaque,
        tipoCambio,
        controlCambioId: cambioRes.rows[0]?.id ?? null,
      },
    });

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Regla de empaque aplicada exitosamente",
      data: {
        reglaid,
        tipoCambio,
        cantidadEmpaque,
        controlCambioId: cambioRes.rows[0]?.id ?? null,
      },
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (e) {
      // silencioso
    }
    logger.error('Error al guardar regla de empaque:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "Error al guardar regla de empaque",
      error: error.message,
    });
  }
  finally {
    client.release();
  }
};

module.exports = {
  getReglasEmpaqueProveedor,
  getReglasEmpaqueProveedorMultiples,
  saveReglasEmpaqueMultiples,
  saveReglaEmpaque
};
