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
    const tenant_id = req.tenant?.tenant_id || req.user?.tenantId || 1;
    
    if (!tenant_id) {
      console.warn('⚠️ Missing TenantID context in crearSesion');
    }

    const result = await db.query(
      `INSERT INTO toma_inventario_sesiones (nombre, estatus, usuario_creador_id, tenant_id)
       VALUES ($1, 'ABIERTA', $2, $3)
       RETURNING sesionid, nombre, estatus, usuario_creador_id`,
      [nombre, usuarioCreadorId, tenant_id]
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
 * GET /sesiones?estatus=ABIERTA
 */
const listarSesiones = async (req, res) => {
  try {
    const estatusRaw = (req.query?.estatus || "ABIERTA").toString().trim();
    const estatus = estatusRaw || "ABIERTA";

    const tenant_id = req.tenant?.tenant_id || req.user?.tenantId || 1;
    
    const result = await db.query(
      `SELECT sesionid, nombre, estatus, usuario_creador_id
       FROM toma_inventario_sesiones
       WHERE ($1::text IS NULL OR estatus = $1::estatus_sesion_enum)
         AND tenant_id = $2
       ORDER BY sesionid DESC
       LIMIT 50`,
      [estatus, tenant_id]
    );

    return res.json({
      success: true,
      data: {
        sesiones: (result.rows || []).map((r) => ({
          sesionId: r.sesionid,
          nombre: r.nombre,
          estatus: r.estatus,
          usuarioCreadorId: r.usuario_creador_id,
        })),
      },
    });
  } catch (error) {
    console.error("Error en listarSesiones:", error);
    return res.status(500).json({
      success: false,
      message: "Error al listar sesiones",
      error: error.message,
    });
  }
};

const buscarProductos = async (req, res) => {
  try {
    const qRaw = (req.query?.q || "").toString().trim();
    if (!qRaw) {
      return res.json({
        success: true,
        data: {
          resultados: [],
        },
      });
    }

    const q = `%${qRaw}%`;

    const tenant_id = req.tenant?.tenant_id || req.user?.tenantId || 1;
    
    const result = await db.query(
      `SELECT
         pv.varianteid,
         pv.sku,
         pv.dimensiones,
         pr.nombreproducto,
         pi.url_imagen AS imagen
       FROM producto_variantes pv
       INNER JOIN productos pr ON pr.productoid = pv.productoid
       LEFT JOIN producto_imagenes pi ON pi.productoid = pr.productoid AND pi.orden = 1
       WHERE (pv.sku ILIKE $1
          OR pr.nombreproducto ILIKE $1
          OR COALESCE(pv.dimensiones, '') ILIKE $1)
         AND pr.tenant_id = $2
       ORDER BY pr.nombreproducto ASC
       LIMIT 20`,
      [q, tenant_id]
    );

    return res.json({
      success: true,
      data: {
        resultados: (result.rows || []).map((r) => ({
          varianteId: r.varianteid,
          sku: r.sku,
          nombreProducto: r.nombreproducto,
          nombreVariante: r.dimensiones || null,
          imagen: r.imagen || null,
        })),
      },
    });
  } catch (error) {
    console.error("Error en buscarProductos:", error);
    return res.status(500).json({
      success: false,
      message: "Error al buscar productos",
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

    const tenant_id = req.tenant?.tenant_id || req.user?.tenantId || 1;
    
    const result = await db.query(
      `SELECT pv.varianteid, pv.sku, pr.nombreproducto
       FROM producto_variantes pv
       INNER JOIN productos pr ON pr.productoid = pv.productoid
       WHERE pv.sku = $1 AND pr.tenant_id = $2
       LIMIT 1`,
      [sku, tenant_id]
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

    // CRÍTICO: Determinar el tipo de usuario (admin o agente)
    // Esto previene falsos positivos cuando adminid y agenteid coinciden numéricamente
    const userRoles = req.user?.roles || [];
    const isAdmin = userRoles.includes('admin') || userRoles.includes('superadmin') || userRoles.includes('super-admin');
    const isAgente = userRoles.includes('agente');
    
    // Crear identificador único: "admin:5" o "agente:5"
    const tipoUsuario = isAdmin ? 'admin' : (isAgente ? 'agente' : 'unknown');
    const usuarioIdentificador = `${tipoUsuario}:${usuarioId}`;
    
    console.log(`🔐 [AUTH] Usuario identificado: ${usuarioIdentificador} (ID: ${usuarioId}, Roles: ${userRoles.join(', ')})`);

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

    const tenant_id = req.tenant?.tenant_id || req.user?.tenantId || 1;
    
    await client.query("BEGIN");

    const sesionLock = await client.query(
      `SELECT sesionid, nombre, estatus, tenant_id
       FROM toma_inventario_sesiones
       WHERE sesionid = $1 AND tenant_id = $2
       FOR UPDATE`,
      [sesionId, tenant_id]
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
      `SELECT conteoid, sesionid, varianteid, conteo_a, usuario_a_id, usuario_a_tipo, conteo_b, usuario_b_id, usuario_b_tipo, cantidad_final, estatus_fila
       FROM toma_inventario_conteos
       WHERE sesionid = $1 AND varianteid = $2
       FOR UPDATE`,
      [sesionId, varianteId]
    );

    let row;

    // CRÍTICO: Validar que la variante pertenece al mismo tenant de la sesión
    const varianteCheck = await client.query(
      `SELECT pv.varianteid FROM producto_variantes pv
       INNER JOIN productos pr ON pr.productoid = pv.productoid
       WHERE pv.varianteid = $1 AND pr.tenant_id = $2`,
      [varianteId, sesionLock.rows[0].tenant_id]
    );
    
    if (!varianteCheck.rows.length) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        success: false,
        message: "No puedes contar productos de otro tenant",
      });
    }
    
    // LÓGICA MEJORADA: Permitir que múltiples agentes trabajen en la misma sesión
    // - Si NO existe registro: Crear Conteo A
    // - Si existe Conteo A pero NO Conteo B: Permitir que OTRO usuario registre Conteo B
    // - Si ya existe Conteo B: Rechazar (producto ya validado)
    
    if (!existing.rows.length) {
      // CASO 1: Primer conteo de este producto en esta sesión (CONTEO A)
      console.log(`📝 [CONTEO A] ${usuarioIdentificador} registra primer conteo de variante ${varianteId} en sesión ${sesionId}`);
      
      const inserted = await client.query(
        `INSERT INTO toma_inventario_conteos (sesionid, varianteid, conteo_a, usuario_a_id, usuario_a_tipo, estatus_fila, tenant_id)
         VALUES ($1, $2, $3, $4, $5, 'PENDIENTE_B', $6)
         RETURNING conteoid, sesionid, varianteid, conteo_a, usuario_a_id, usuario_a_tipo, conteo_b, usuario_b_id, usuario_b_tipo, cantidad_final, estatus_fila`,
        [sesionId, varianteId, cantidad, usuarioId, tipoUsuario, sesionLock.rows[0].tenant_id]
      );

      row = inserted.rows[0];
    } else {
      // CASO 2: Ya existe un Conteo A, intentando registrar Conteo B
      row = existing.rows[0];

      const conteoBExiste = row.conteo_b !== null && row.conteo_b !== undefined;

      if (conteoBExiste) {
        // Producto ya tiene ambos conteos (A y B)
        await client.query("ROLLBACK");
        console.warn(`⚠️ [CONTEO DUPLICADO] Variante ${varianteId} en sesión ${sesionId} ya tiene Conteo A y Conteo B completos`);
        return res.status(409).json({
          success: false,
          message: "Esta variante ya fue contada dos veces y está validada. No se pueden registrar más conteos.",
        });
      }

      const usuarioAId =
        row.usuario_a_id !== null && row.usuario_a_id !== undefined
          ? Number.parseInt(row.usuario_a_id, 10)
          : null;
      
      const usuarioATipo = row.usuario_a_tipo || 'unknown';
      const usuarioAIdentificador = `${usuarioATipo}:${usuarioAId}`;

      // VALIDACIÓN CRÍTICA CORREGIDA: Comparar ID Y TIPO de usuario
      // Esto previene falsos positivos cuando adminid=5 y agenteid=5 (diferentes usuarios)
      const mismaTipoUsuario = usuarioATipo === tipoUsuario;
      const mismoId = usuarioAId === usuarioId;
      const esElMismoUsuario = mismaTipoUsuario && mismoId;

      if (esElMismoUsuario) {
        await client.query("ROLLBACK");
        console.warn(`❌ [CONTEO CIEGO VIOLADO] ${usuarioIdentificador} intentó hacer Conteo B de variante ${varianteId} en sesión ${sesionId}, pero ya hizo el Conteo A`);
        return res.status(403).json({
          success: false,
          message: "No puedes hacer el segundo conteo de un producto que ya contaste. Debe hacerlo otro agente para garantizar la validación ciega.",
          debug: {
            sesionId,
            varianteId,
            usuarioActual: usuarioIdentificador,
            usuarioConteoA: usuarioAIdentificador,
            conteoAExistente: row.conteo_a
          }
        });
      }

      // CASO 2B: Usuario diferente registra Conteo B (validación ciega)
      console.log(`✅ [CONTEO B] ${usuarioIdentificador} registra segundo conteo de variante ${varianteId} en sesión ${sesionId} (Conteo A fue hecho por ${usuarioAIdentificador})`);
      
      const conteoA = Number.parseInt(row.conteo_a, 10);
      const igual = Number.isInteger(conteoA) && conteoA === cantidad;

      const updated = await client.query(
        `UPDATE toma_inventario_conteos
         SET conteo_b = $1,
             usuario_b_id = $2,
             usuario_b_tipo = $3,
             estatus_fila = $4,
             cantidad_final = $5
         WHERE conteoid = $6
         RETURNING conteoid, sesionid, varianteid, conteo_a, usuario_a_id, usuario_a_tipo, conteo_b, usuario_b_id, usuario_b_tipo, cantidad_final, estatus_fila`,
        [
          cantidad,
          usuarioId,
          tipoUsuario,
          igual ? "VALIDADO" : "CONFLICTO",
          igual ? cantidad : null,
          row.conteoid,
        ]
      );

      row = updated.rows[0];
      
      if (igual) {
        console.log(`🎯 [VALIDADO] Conteo A (${conteoA}) y Conteo B (${cantidad}) coinciden para variante ${varianteId}`);
      } else {
        console.log(`⚠️ [CONFLICTO] Conteo A (${conteoA}) y Conteo B (${cantidad}) NO coinciden para variante ${varianteId}`);
      }
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

    const tenant_id = req.tenant?.tenant_id || req.user?.tenantId || 1;
    const userId = req.user?.id || req.user?.userId;
    const userRoles = req.user?.roles || [];
    
    // MISIÓN 4: Validación de seguridad por rol
    const isSuperAdmin = userRoles.includes('superadmin') || userRoles.includes('super-admin');
    const isAdmin = userRoles.includes('admin');
    const isAgent = userRoles.includes('agente');
    
    const sesionResult = await db.query(
      `SELECT 
        si.sesionid, 
        si.nombre, 
        si.estatus, 
        si.usuario_creador_id,
        si.agente_asignado_id
       FROM toma_inventario_sesiones si
       WHERE si.sesionid = $1 AND si.tenant_id = $2`,
      [sesionId, tenant_id]
    );

    if (!sesionResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Sesión no encontrada",
      });
    }

    const sesion = sesionResult.rows[0];

    // MISIÓN 4: Validación 403 - Agentes solo pueden ver sus sesiones asignadas
    if (isAgent && !isAdmin && !isSuperAdmin) {
      if (sesion.agente_asignado_id !== userId) {
        console.warn(`⚠️ [ACCESO DENEGADO] Agente ${userId} intentó acceder a sesión ${sesionId} asignada a agente ${sesion.agente_asignado_id}`);
        return res.status(403).json({
          success: false,
          message: 'No tienes permiso para acceder a esta sesión de inventario. Solo puedes ver sesiones asignadas a ti.'
        });
      }
    }
    
    // Admins regulares solo pueden ver sesiones que crearon
    if (isAdmin && !isSuperAdmin) {
      if (sesion.usuario_creador_id !== userId) {
        console.warn(`⚠️ [ACCESO DENEGADO] Admin ${userId} intentó acceder a sesión ${sesionId} creada por admin ${sesion.usuario_creador_id}`);
        return res.status(403).json({
          success: false,
          message: 'No tienes permiso para acceder a esta sesión de inventario. Solo puedes ver sesiones que tú creaste.'
        });
      }
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

    const rol = (req.user?.rol || "").toString().trim().toLowerCase();
    const isSuperAdminForBlindCount = rol === "superadmin";

    if (!isSuperAdminForBlindCount) {
      for (const fila of filas) {
        if (
          fila.estatusFila === "CONFLICTO" ||
          fila.estatusFila === "PENDIENTE_A" ||
          fila.estatusFila === "PENDIENTE_B"
        ) {
          fila.conteoA = null;
          fila.conteoB = null;
        }
      }
    }

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

    const tenant_id = req.tenant?.tenant_id || req.user?.tenantId || 1;
    
    await client.query("BEGIN");

    const sesionLock = await client.query(
      `SELECT sesionid, estatus
       FROM toma_inventario_sesiones
       WHERE sesionid = $1 AND tenant_id = $2
       FOR UPDATE`,
      [sesionId, tenant_id]
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

    // VALIDACIÓN CRÍTICA: Verificar que no haya ítems ya aplicados (prevenir doble aplicación)
    const yaAplicadosCheck = await client.query(
      `SELECT COUNT(*)::int AS total
       FROM toma_inventario_conteos
       WHERE sesionid = $1
         AND estatus_aplicacion = 'APLICADO'`,
      [sesionId]
    );

    const totalYaAplicados = Number.parseInt(yaAplicadosCheck.rows?.[0]?.total, 10) || 0;
    if (totalYaAplicados > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: `INTEGRIDAD VIOLADA: Esta sesión ya tiene ${totalYaAplicados} ítem(s) aplicado(s). No se puede aplicar nuevamente.`,
        data: {
          sesionId,
          itemsYaAplicados: totalYaAplicados,
          estatusSesion: sesionLock.rows[0].estatus,
        },
      });
    }

    // Contar validados para verificar que hay al menos uno
    const validadosCount = await client.query(
      `SELECT COUNT(*)::int AS total
       FROM toma_inventario_conteos
       WHERE sesionid = $1
         AND estatus_fila = 'VALIDADO'`,
      [sesionId]
    );

    const totalValidados = Number.parseInt(validadosCount.rows?.[0]?.total, 10) || 0;
    if (totalValidados === 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: "No se puede aplicar: no hay productos validados",
        data: {
          validados: 0,
        },
      });
    }

    // Obtener todos los ítems de la sesión para estadísticas
    const allRows = await client.query(
      `SELECT conteoid, varianteid, cantidad_final, estatus_fila
       FROM toma_inventario_conteos
       WHERE sesionid = $1
       FOR UPDATE`,
      [sesionId]
    );

    const aplicadas = [];
    const noAplicadas = [];
    let movimientosGenerados = 0;

    for (const r of allRows.rows) {
      const varianteId = Number.parseInt(r.varianteid, 10);
      const cantidadFinal = Number.parseInt(r.cantidad_final, 10);
      const estatusFila = r.estatus_fila;

      if (!Number.isInteger(varianteId) || varianteId <= 0) continue;

      // Solo aplicar si está VALIDADO
      if (estatusFila === 'VALIDADO') {
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
          estatus: 'APLICADO',
        });

        // Marcar el ítem como APLICADO (si la columna existe)
        try {
          await client.query(
            `UPDATE toma_inventario_conteos 
             SET estatus_aplicacion = 'APLICADO'
             WHERE conteoid = $1`,
            [r.conteoid]
          );
        } catch (colErr) {
          // Columna no existe aún, ignorar (migración pendiente)
        }
      } else {
        // CONFLICTO o PENDIENTE: no aplicar, solo registrar
        noAplicadas.push({
          conteoId: r.conteoid,
          varianteId,
          estatus: estatusFila,
        });

        // Marcar el ítem como NO_APLICADO (si la columna existe)
        try {
          await client.query(
            `UPDATE toma_inventario_conteos 
             SET estatus_aplicacion = 'NO_APLICADO'
             WHERE conteoid = $1`,
            [r.conteoid]
          );
        } catch (colErr) {
          // Columna no existe aún, ignorar (migración pendiente)
        }
      }
    }

    // CRÍTICO: Cerrar la sesión ANTES del COMMIT para garantizar atomicidad
    // Si el UPDATE falla, el COMMIT no se ejecutará y se hará ROLLBACK
    let estatusFinal = noAplicadas.length > 0 ? 'APLICADA_PARCIAL' : 'APLICADA';
    try {
      await client.query(
        `UPDATE toma_inventario_sesiones 
         SET estatus = $1, 
             fechacierre = NOW()
         WHERE sesionid = $2`,
        [estatusFinal, sesionId]
      );
    } catch (enumErr) {
      // APLICADA_PARCIAL no existe en el enum, usar APLICADA
      estatusFinal = 'APLICADA';
      await client.query(
        `UPDATE toma_inventario_sesiones 
         SET estatus = $1, 
             fechacierre = NOW()
         WHERE sesionid = $2`,
        [estatusFinal, sesionId]
      );
    }

    // COMMIT: Solo se ejecuta si todo lo anterior fue exitoso
    await client.query("COMMIT");
    
    console.log(`✅ [Auditoría] Sesión #${sesionId} aplicada exitosamente. Estatus: ${estatusFinal}. Movimientos: ${movimientosGenerados}`);

    const message = noAplicadas.length > 0
      ? `Auditoría aplicada parcialmente: ${aplicadas.length} producto(s) actualizado(s), ${noAplicadas.length} ítem(s) no aplicado(s) registrados`
      : "Auditoría aplicada completamente al inventario";

    return res.json({
      success: true,
      message,
      data: {
        sesionId,
        filasProcesadas: aplicadas.length,
        filasNoAplicadas: noAplicadas.length,
        movimientosGenerados,
        aplicadas,
        noAplicadas,
        estatusSesion: estatusFinal,
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

/**
 * GET /diagnostico-sesiones
 * Detecta sesiones huérfanas (ABIERTA pero con ítems aplicados)
 */
const diagnosticoSesiones = async (req, res) => {
  try {
    const tenant_id = req.tenant?.tenant_id || req.user?.tenantId || 1;
    
    // Buscar sesiones ABIERTA con ítems APLICADOS (inconsistencia crítica)
    const sesionesHuerfanas = await db.query(
      `SELECT 
         s.sesionid,
         s.nombre,
         s.estatus AS estatus_sesion,
         s.fechainicio,
         s.fechacierre,
         COUNT(c.conteoid) AS total_items,
         COUNT(CASE WHEN c.estatus_aplicacion = 'APLICADO' THEN 1 END) AS items_aplicados,
         COUNT(CASE WHEN c.estatus_fila = 'VALIDADO' THEN 1 END) AS items_validados
       FROM toma_inventario_sesiones s
       LEFT JOIN toma_inventario_conteos c ON c.sesionid = s.sesionid
       WHERE s.tenant_id = $1
         AND s.estatus = 'ABIERTA'
       GROUP BY s.sesionid, s.nombre, s.estatus, s.fechainicio, s.fechacierre
       HAVING COUNT(CASE WHEN c.estatus_aplicacion = 'APLICADO' THEN 1 END) > 0
       ORDER BY s.sesionid DESC`,
      [tenant_id]
    );

    // Buscar todas las sesiones ABIERTA (para contexto)
    const sesionesAbiertas = await db.query(
      `SELECT 
         s.sesionid,
         s.nombre,
         s.estatus,
         s.fechainicio,
         COUNT(c.conteoid) AS total_items,
         COUNT(CASE WHEN c.estatus_fila = 'VALIDADO' THEN 1 END) AS items_validados,
         COUNT(CASE WHEN c.estatus_fila = 'CONFLICTO' THEN 1 END) AS items_conflicto,
         COUNT(CASE WHEN c.estatus_fila IN ('PENDIENTE_A', 'PENDIENTE_B') THEN 1 END) AS items_pendientes
       FROM toma_inventario_sesiones s
       LEFT JOIN toma_inventario_conteos c ON c.sesionid = s.sesionid
       WHERE s.tenant_id = $1
         AND s.estatus = 'ABIERTA'
       GROUP BY s.sesionid, s.nombre, s.estatus, s.fechainicio
       ORDER BY s.sesionid DESC`,
      [tenant_id]
    );

    const hayProblemas = sesionesHuerfanas.rows.length > 0;

    return res.json({
      success: true,
      integridad: hayProblemas ? 'VIOLADA' : 'OK',
      data: {
        sesionesHuerfanas: sesionesHuerfanas.rows.map(r => ({
          sesionId: r.sesionid,
          nombre: r.nombre,
          estatusSesion: r.estatus_sesion,
          fechaInicio: r.fechainicio,
          fechaCierre: r.fechacierre,
          totalItems: parseInt(r.total_items),
          itemsAplicados: parseInt(r.items_aplicados),
          itemsValidados: parseInt(r.items_validados),
          problema: `Sesión ABIERTA con ${r.items_aplicados} ítem(s) ya aplicado(s) al inventario`,
        })),
        sesionesAbiertas: sesionesAbiertas.rows.map(r => ({
          sesionId: r.sesionid,
          nombre: r.nombre,
          estatus: r.estatus,
          fechaInicio: r.fechainicio,
          totalItems: parseInt(r.total_items),
          itemsValidados: parseInt(r.items_validados),
          itemsConflicto: parseInt(r.items_conflicto),
          itemsPendientes: parseInt(r.items_pendientes),
        })),
      },
      mensaje: hayProblemas
        ? `⚠️ ALERTA: ${sesionesHuerfanas.rows.length} sesión(es) huérfana(s) detectada(s). El stock ya fue modificado pero la sesión no se cerró.`
        : '✅ No se detectaron inconsistencias. Todas las sesiones ABIERTA tienen integridad correcta.',
    });
  } catch (error) {
    console.error("Error en diagnosticoSesiones:", error);
    return res.status(500).json({
      success: false,
      message: "Error al ejecutar diagnóstico",
      error: error.message,
    });
  }
};

module.exports = {
  crearSesion,
  registrarConteo,
  getDashboardSesion,
  aplicarSesion,
  getVariantePorSku,
  buscarProductos,
  listarSesiones,
  diagnosticoSesiones,
};
