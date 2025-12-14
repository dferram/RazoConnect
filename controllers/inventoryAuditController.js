const db = require("../db");
const inventoryService = require("../services/inventoryService");

function createControllerError(message, status = 500, code = "INVENTORY_AUDIT_ERROR") {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function parsePositiveInt(value) {
  const n = Number.parseInt(value, 10);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

/**
 * POST /crear-sesion
 * Body: { nombre }
 */
const crearSesion = async (req, res) => {
  try {
    const nombre = (req.body?.nombre || "").toString().trim();
    if (!nombre) {
      return res.status(400).json({
        success: false,
        message: "nombre es requerido",
      });
    }

    const usuarioCreadorId = req.user?.id ?? null;

    const result = await db.query(
      `INSERT INTO toma_inventario_sesiones (nombre, estatus, usuario_creador_id)
       VALUES ($1, 'ABIERTA', $2)
       RETURNING sesionid, nombre, estatus, usuario_creador_id`,
      [nombre, usuarioCreadorId]
    );

    const sesionId = result.rows[0].sesionid;

    try {
      const agentes = await db.query(
        "SELECT agenteid FROM agentesdeventas WHERE activo = true"
      );

      const titulo = "Auditoría de Inventario Requerida";
      const mensaje = `Se requiere tu participación en la toma de inventario: ${nombre}.`;
      const url = `/admin-toma-inventario.html?sesionId=${sesionId}`;

      for (const row of agentes.rows || []) {
        const agenteId = Number.parseInt(row.agenteid, 10);
        if (!Number.isInteger(agenteId) || agenteId <= 0) continue;

        await db.query(
          `INSERT INTO notificaciones
            (clienteid, administrador_id, agente_id, tipo, titulo, mensaje, url, prioridad, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            null,
            null,
            agenteId,
            "sistema",
            titulo,
            mensaje,
            url,
            "alta",
            null,
          ]
        );
      }
    } catch (notifyError) {
      // No bloquear creación de sesión si falla la notificación.
      console.error("Error al notificar a agentes sobre auditoría:", notifyError);
    }

    return res.json({
      success: true,
      message: "Sesión creada",
      data: {
        sesion: {
          sesionId,
          nombre: result.rows[0].nombre,
          estatus: result.rows[0].estatus,
          usuarioCreadorId: result.rows[0].usuario_creador_id,
        },
      },
    });
  } catch (error) {
    console.error("Error en crearSesion:", error);
    return res.status(500).json({
      success: false,
      message: "Error al crear sesión",
      error: error.message,
    });
  }
};

/**
 * GET /variante-por-sku?sku=...
 */
const getVariantePorSku = async (req, res) => {
  try {
    const skuRaw = (req.query?.sku || "").toString().trim();
    const sku = skuRaw.toUpperCase();
    if (!sku) {
      return res.status(400).json({
        success: false,
        message: "sku es requerido",
      });
    }

    const result = await db.query(
      `SELECT pv.varianteid, pv.sku, pr.nombreproducto
       FROM producto_variantes pv
       INNER JOIN productos pr ON pr.productoid = pv.productoid
       WHERE pv.sku = $1
       LIMIT 1`,
      [sku]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: "SKU no encontrado",
      });
    }

    return res.json({
      success: true,
      data: {
        variante: {
          varianteId: result.rows[0].varianteid,
          sku: result.rows[0].sku,
          nombreProducto: result.rows[0].nombreproducto,
        },
      },
    });
  } catch (error) {
    console.error("Error en getVariantePorSku:", error);
    return res.status(500).json({
      success: false,
      message: "Error al buscar SKU",
      error: error.message,
    });
  }
};

/**
 * POST /registrar-conteo
 * Body: { sesionId, varianteId, cantidad, usuarioId }
 */
const registrarConteo = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const sesionId = parsePositiveInt(req.body?.sesionId);
    const varianteId = parsePositiveInt(req.body?.varianteId);
    const cantidad = Number.parseInt(req.body?.cantidad, 10);

    if (!sesionId) {
      return res.status(400).json({ success: false, message: "sesionId inválido" });
    }
    if (!varianteId) {
      return res
        .status(400)
        .json({ success: false, message: "varianteId inválido" });
    }
    if (!Number.isInteger(cantidad) || cantidad < 0) {
      return res
        .status(400)
        .json({ success: false, message: "cantidad inválida" });
    }

    const usuarioIdBody = req.body?.usuarioId;
    const usuarioIdReq = req.user?.id;
    const usuarioId = Number.isInteger(Number.parseInt(usuarioIdReq, 10))
      ? Number.parseInt(usuarioIdReq, 10)
      : null;

    if (!usuarioId) {
      return res.status(401).json({
        success: false,
        message: "Usuario no autenticado",
      });
    }

    if (
      usuarioIdBody !== undefined &&
      usuarioIdBody !== null &&
      usuarioIdBody !== "" &&
      Number.parseInt(usuarioIdBody, 10) !== usuarioId
    ) {
      return res.status(403).json({
        success: false,
        message: "usuarioId no coincide con el usuario autenticado",
      });
    }

    await client.query("BEGIN");

    const sesionLock = await client.query(
      `SELECT sesionid, nombre, estatus
       FROM toma_inventario_sesiones
       WHERE sesionid = $1
       FOR UPDATE`,
      [sesionId]
    );

    if (!sesionLock.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Sesión no encontrada",
      });
    }

    if (sesionLock.rows[0].estatus !== "ABIERTA") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: `La sesión está en estatus '${sesionLock.rows[0].estatus}'`,
      });
    }

    const existing = await client.query(
      `SELECT conteoid, sesionid, varianteid, conteo_a, usuario_a_id, conteo_b, usuario_b_id, cantidad_final, estatus_fila
       FROM toma_inventario_conteos
       WHERE sesionid = $1 AND varianteid = $2
       FOR UPDATE`,
      [sesionId, varianteId]
    );

    let row;

    if (!existing.rows.length) {
      const inserted = await client.query(
        `INSERT INTO toma_inventario_conteos (sesionid, varianteid, conteo_a, usuario_a_id, estatus_fila)
         VALUES ($1, $2, $3, $4, 'PENDIENTE_B')
         RETURNING conteoid, sesionid, varianteid, conteo_a, usuario_a_id, conteo_b, usuario_b_id, cantidad_final, estatus_fila`,
        [sesionId, varianteId, cantidad, usuarioId]
      );

      row = inserted.rows[0];
    } else {
      row = existing.rows[0];

      const conteoBExiste = row.conteo_b !== null && row.conteo_b !== undefined;

      if (conteoBExiste) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          success: false,
          message: "Esta variante ya tiene conteo B registrado",
        });
      }

      const usuarioAId =
        row.usuario_a_id !== null && row.usuario_a_id !== undefined
          ? Number.parseInt(row.usuario_a_id, 10)
          : null;

      if (usuarioAId && usuarioAId === usuarioId) {
        await client.query("ROLLBACK");
        return res.status(403).json({
          success: false,
          message: "Mismo usuario no puede contar dos veces",
        });
      }

      const conteoA = Number.parseInt(row.conteo_a, 10);
      const igual = Number.isInteger(conteoA) && conteoA === cantidad;

      const updated = await client.query(
        `UPDATE toma_inventario_conteos
         SET conteo_b = $1,
             usuario_b_id = $2,
             estatus_fila = $3,
             cantidad_final = $4
         WHERE conteoid = $5
         RETURNING conteoid, sesionid, varianteid, conteo_a, usuario_a_id, conteo_b, usuario_b_id, cantidad_final, estatus_fila`,
        [
          cantidad,
          usuarioId,
          igual ? "VALIDADO" : "CONFLICTO",
          igual ? cantidad : null,
          row.conteoid,
        ]
      );

      row = updated.rows[0];
    }

    await client.query("COMMIT");

    // Respuesta ciega: ocultar el conteo del otro equipo
    const usuarioAId =
      row.usuario_a_id !== null && row.usuario_a_id !== undefined
        ? Number.parseInt(row.usuario_a_id, 10)
        : null;
    const usuarioBId =
      row.usuario_b_id !== null && row.usuario_b_id !== undefined
        ? Number.parseInt(row.usuario_b_id, 10)
        : null;

    const isA = usuarioAId === usuarioId;
    const isB = usuarioBId === usuarioId;

    return res.json({
      success: true,
      message: "Conteo registrado",
      data: {
        conteo: {
          conteoId: row.conteoid,
          sesionId: row.sesionid,
          varianteId: row.varianteid,
          estatusFila: row.estatus_fila,
          // Sólo devolvemos el conteo que acabas de registrar
          conteoA: isA ? row.conteo_a : null,
          conteoB: isB ? row.conteo_b : null,
          // cantidad_final solo existe en VALIDADO y no revela diferencia
          cantidadFinal: row.cantidad_final,
        },
      },
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (e) {
      // ignore
    }

    console.error("Error en registrarConteo:", error);
    const status = error && Number.isInteger(error.status) ? error.status : 500;
    return res.status(status).json({
      success: false,
      message: error.message || "Error al registrar conteo",
      error: error.message,
      code: error.code,
    });
  } finally {
    client.release();
  }
};

/**
 * GET /dashboard/:sesionId
 */
const getDashboardSesion = async (req, res) => {
  try {
    const sesionId = parsePositiveInt(req.params.sesionId);
    if (!sesionId) {
      return res.status(400).json({
        success: false,
        message: "sesionId inválido",
      });
    }

    const sesionResult = await db.query(
      `SELECT sesionid, nombre, estatus, usuario_creador_id
       FROM toma_inventario_sesiones
       WHERE sesionid = $1`,
      [sesionId]
    );

    if (!sesionResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Sesión no encontrada",
      });
    }

    const filasResult = await db.query(
      `SELECT
         c.conteoid,
         c.sesionid,
         c.varianteid,
         pv.sku,
         pr.nombreproducto,
         c.conteo_a,
         c.usuario_a_id,
         c.conteo_b,
         c.usuario_b_id,
         c.cantidad_final,
         c.estatus_fila
       FROM toma_inventario_conteos c
       INNER JOIN producto_variantes pv ON pv.varianteid = c.varianteid
       INNER JOIN productos pr ON pr.productoid = pv.productoid
       WHERE c.sesionid = $1
       ORDER BY pr.nombreproducto ASC`,
      [sesionId]
    );

    const filas = filasResult.rows.map((r) => ({
      conteoId: r.conteoid,
      sesionId: r.sesionid,
      varianteId: r.varianteid,
      sku: r.sku,
      nombreProducto: r.nombreproducto,
      conteoA: r.conteo_a,
      usuarioAId: r.usuario_a_id,
      conteoB: r.conteo_b,
      usuarioBId: r.usuario_b_id,
      cantidadFinal: r.cantidad_final,
      estatusFila: r.estatus_fila,
    }));

    const stats = {
      total: filas.length,
      validados: filas.filter((f) => f.estatusFila === "VALIDADO").length,
      conflictos: filas.filter((f) => f.estatusFila === "CONFLICTO").length,
      pendientes: filas.filter(
        (f) => f.estatusFila === "PENDIENTE_A" || f.estatusFila === "PENDIENTE_B"
      ).length,
    };

    return res.json({
      success: true,
      data: {
        sesion: {
          sesionId: sesionResult.rows[0].sesionid,
          nombre: sesionResult.rows[0].nombre,
          estatus: sesionResult.rows[0].estatus,
          usuarioCreadorId: sesionResult.rows[0].usuario_creador_id,
        },
        stats,
        filas,
      },
    });
  } catch (error) {
    console.error("Error en getDashboardSesion:", error);
    return res.status(500).json({
      success: false,
      message: "Error al cargar dashboard",
      error: error.message,
    });
  }
};

/**
 * POST /aplicar/:sesionId
 */
const aplicarSesion = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const sesionId = parsePositiveInt(req.params.sesionId);
    if (!sesionId) {
      return res.status(400).json({
        success: false,
        message: "sesionId inválido",
      });
    }

    await client.query("BEGIN");

    const sesionLock = await client.query(
      `SELECT sesionid, estatus
       FROM toma_inventario_sesiones
       WHERE sesionid = $1
       FOR UPDATE`,
      [sesionId]
    );

    if (!sesionLock.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Sesión no encontrada",
      });
    }

    if (sesionLock.rows[0].estatus !== "ABIERTA") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: `La sesión está en estatus '${sesionLock.rows[0].estatus}'`,
      });
    }

    const conflictos = await client.query(
      `SELECT COUNT(*)::int AS total
       FROM toma_inventario_conteos
       WHERE sesionid = $1
         AND estatus_fila = 'CONFLICTO'`,
      [sesionId]
    );

    const totalConflictos = Number.parseInt(conflictos.rows?.[0]?.total, 10) || 0;
    if (totalConflictos > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: "No se puede aplicar: existen filas en CONFLICTO",
        data: {
          conflictos: totalConflictos,
        },
      });
    }

    const rows = await client.query(
      `SELECT conteoid, varianteid, cantidad_final
       FROM toma_inventario_conteos
       WHERE sesionid = $1
         AND estatus_fila = 'VALIDADO'
       FOR UPDATE`,
      [sesionId]
    );

    const aplicadas = [];
    let movimientosGenerados = 0;

    for (const r of rows.rows) {
      const varianteId = Number.parseInt(r.varianteid, 10);
      const cantidadFinal = Number.parseInt(r.cantidad_final, 10);

      if (!Number.isInteger(varianteId) || varianteId <= 0) continue;
      if (!Number.isInteger(cantidadFinal) || cantidadFinal < 0) continue;

      // Para ajustar a cantidad_final necesitamos el stock actual (bloqueado)
      const stockQ = await client.query(
        "SELECT stock FROM producto_variantes WHERE varianteid = $1 FOR UPDATE",
        [varianteId]
      );

      if (!stockQ.rows.length) {
        continue;
      }

      const stockActual = Number.parseInt(stockQ.rows[0].stock, 10) || 0;
      const delta = cantidadFinal - stockActual;

      if (delta !== 0) {
        await inventoryService.registrarMovimiento(client, {
          varianteId,
          cantidadDelta: delta,
          motivo: `Auditoría Inventario - Sesión #${sesionId}`,
          usuarioId: req.user?.id,
          esExcepcion: false,
        });
        movimientosGenerados += 1;
      }

      aplicadas.push({
        conteoId: r.conteoid,
        varianteId,
        stockAnterior: stockActual,
        cantidadFinal,
        delta,
      });
    }

    await client.query(
      "UPDATE toma_inventario_sesiones SET estatus = 'APLICADA' WHERE sesionid = $1",
      [sesionId]
    );

    await client.query("COMMIT");

    return res.json({
      success: true,
      message: "Auditoría aplicada al inventario",
      data: {
        sesionId,
        filasProcesadas: aplicadas.length,
        movimientosGenerados,
        aplicadas,
        estatusSesion: "APLICADA",
      },
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (e) {
      // ignore
    }

    console.error("Error en aplicarSesion:", error);
    const status = error && Number.isInteger(error.status) ? error.status : 500;
    return res.status(status).json({
      success: false,
      message: error.message || "Error al aplicar auditoría",
      error: error.message,
      code: error.code,
    });
  } finally {
    client.release();
  }
};

module.exports = {
  crearSesion,
  registrarConteo,
  getDashboardSesion,
  aplicarSesion,
  getVariantePorSku,
};
