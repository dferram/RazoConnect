const db = require("../../db");
const logger = require('../../utils/logger');

const normalizeClienteId = (req) => {
  const raw =
    req.user?.userId ?? req.user?.id ?? req.user?.clienteId ?? req.user?.clienteid;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) ? parsed : null;
};

const isCliente = (req) =>
  (req.user?.rol || "").toString().trim().toLowerCase() === "cliente";

const fetchCreditoActivo = async (clienteId, tenantId = null) => {
  const estadosHelper = require('../../utils/estadosHelper');

  // Get admin_id for this client based on their estado (deterministic mapping)
  const adminIdForClient = await estadosHelper.getAdminByClienteEstado(clienteId, tenantId || 1);

  const query = `
    SELECT credito_id, limite_credito, saldo_deudor, estado_credito, dias_gracia, fecha_creacion, ultima_actualizacion
    FROM cliente_creditos
    WHERE cliente_id = $1
      AND estado_credito = 'ACTIVO'
      AND admin_id = $2
      ${tenantId ? 'AND tenant_id = $3' : ''}
    LIMIT 1
  `;

  const params = tenantId ? [clienteId, adminIdForClient, tenantId] : [clienteId, adminIdForClient];
  const { rows } = await db.query(query, params);
  return rows.length ? rows[0] : null;
};

const checkAuthCredit = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "No autenticado",
      });
    }

    if (!isCliente(req)) {
      return res.status(403).json({
        success: false,
        message: "Acceso denegado",
      });
    }

    const clienteId = normalizeClienteId(req);
    if (!clienteId) {
      return res.status(400).json({
        success: false,
        message: "Identificador de cliente inválido",
      });
    }

    const tenant_id = req.tenant?.tenant_id || 1;
    const creditoActivo = await fetchCreditoActivo(clienteId, tenant_id);
    const creditSummary = créditoResumen(creditoActivo);

    // Calcular cargo confirmado y reserva pendiente
    if (creditSummary && creditoActivo) {
      const balanceRow = await db.query(
        `SELECT
           COALESCE(SUM(CASE WHEN tipo_movimiento = 'CARGO' THEN monto ELSE 0 END), 0) AS cargo_confirmado,
           COALESCE(SUM(CASE WHEN tipo_movimiento = 'ABONO' OR tipo_movimiento = 'PAGO' THEN monto ELSE 0 END), 0) AS total_abonos
         FROM credito_movimientos
         WHERE credito_id = $1`,
        [creditoActivo.credito_id]
      );
      const row = balanceRow.rows[0] || {};
      creditSummary.cargoConfirmado  = parseFloat(row.cargo_confirmado  || 0);
      creditSummary.reservaPendiente = Math.max(
        parseFloat(creditoActivo.saldo_deudor || 0) - creditSummary.cargoConfirmado, 0
      );
    }

    // Verificar si tiene una solicitud pendiente
    const checkPendiente = `
      SELECT solicitud_id, monto_solicitado, fecha_solicitud, estado
      FROM solicitudes_credito 
      WHERE cliente_id = $1 
        AND estado = 'PENDIENTE'
        AND tenant_id = $2
      ORDER BY fecha_solicitud DESC
      LIMIT 1
    `;
    const { rows: pendientes } = await db.query(checkPendiente, [clienteId, tenant_id]);
    const hasPendingRequest = pendientes.length > 0;
    const pendingRequest = pendientes.length > 0 ? pendientes[0] : null;

    return res.json({
      success: true,
      hasCredit: Boolean(creditSummary),
      creditSummary,
      hasPendingRequest,
      pendingRequest,
    });
  } catch (error) {
    logger.error('Error verificando crédito del cliente:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "No fue posible verificar el estado de tu crédito",
    });
  }
};

const créditoResumen = (creditoActivo) => {
  if (!creditoActivo) return null;
  const limite =
    Number.parseFloat(creditoActivo.limite_credito ?? 0) || 0;
  const saldo =
    Number.parseFloat(creditoActivo.saldo_deudor ?? 0) || 0;
  const disponible = Math.max(limite - saldo, 0);
  const diasGracia = Number.parseInt(creditoActivo.dias_gracia, 10);
  return {
    creditoId: creditoActivo.credito_id,
    limiteCredito: limite,
    saldoDeudor: saldo,
    creditoDisponible: disponible,
    estado: creditoActivo.estado_credito,
    diasGracia: Number.isNaN(diasGracia) ? 0 : diasGracia,
    fechaCreacion: creditoActivo.fecha_creacion,
    ultimaActualizacion: creditoActivo.ultima_actualizacion,
  };
};

const obtenerPerfilCredito = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "No autenticado",
      });
    }

    if (!isCliente(req)) {
      return res.status(403).json({
        success: false,
        message: "Acceso denegado",
      });
    }

    const clienteId = normalizeClienteId(req);
    if (!clienteId) {
      return res.status(400).json({
        success: false,
        message: "Identificador de cliente inválido",
      });
    }

    const tenant_id = req.tenant?.tenant_id || 1;
    const creditoActivo = await fetchCreditoActivo(clienteId, tenant_id);
    const creditSummary = créditoResumen(creditoActivo);
    
    // Obtener pagos pendientes de validación
    const pagosPendientesQuery = `
      SELECT COALESCE(SUM(monto), 0) as total_pendiente
      FROM pagos_clientes
      WHERE cliente_id = $1
        AND estatus = 'PENDIENTE'
        AND tenant_id = $2
    `;
    const { rows: pagosPendientes } = await db.query(pagosPendientesQuery, [clienteId, tenant_id]);
    const saldoEnRevision = Number.parseFloat(pagosPendientes[0]?.total_pendiente || 0);
    
    const data = creditSummary
      ? {
          limite_credito: creditSummary.limiteCredito,
          saldo_deudor: creditSummary.saldoDeudor,
          estado_credito: creditSummary.estado,
          saldo_disponible: creditSummary.creditoDisponible,
          dias_gracia: creditSummary.diasGracia,
          saldo_en_revision: saldoEnRevision,
          saldo_estimado: Math.max(creditSummary.saldoDeudor - saldoEnRevision, 0),
        }
      : {
          limite_credito: 0,
          saldo_deudor: 0,
          estado_credito: null,
          saldo_disponible: 0,
          dias_gracia: 0,
          saldo_en_revision: saldoEnRevision,
          saldo_estimado: 0,
        };

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    logger.error('Error obteniendo perfil de crédito:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "No fue posible obtener tu perfil de crédito",
    });
  }
};

const enviarSolicitudCredito = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "No autenticado",
      });
    }

    if (!isCliente(req)) {
      return res.status(403).json({
        success: false,
        message: "Acceso denegado",
      });
    }

    const clienteId = normalizeClienteId(req);
    if (!clienteId) {
      return res.status(400).json({
        success: false,
        message: "Identificador de cliente inválido",
      });
    }

    // Obtener tenant_id del middleware o del usuario autenticado como fallback
    const tenant_id = req.tenant?.tenant_id || req.user?.tenant_id || 1;
    
    // Validar que no tenga una solicitud pendiente
    const checkPendiente = `
      SELECT solicitud_id 
      FROM solicitudes_credito 
      WHERE cliente_id = $1 
        AND estado = 'PENDIENTE'
        AND tenant_id = $2
      LIMIT 1
    `;
    const { rows: pendientes } = await db.query(checkPendiente, [clienteId, tenant_id]);
    if (pendientes.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Ya tienes una solicitud de crédito en proceso de revisión",
      });
    }

    // Validar que no tenga un crédito activo
    const creditoActivo = await fetchCreditoActivo(clienteId, tenant_id);
    if (creditoActivo) {
      return res.status(400).json({
        success: false,
        message: "Ya cuentas con una línea de crédito activa",
      });
    }

    const { montoSolicitado, motivoCredito, ingresosMensuales, plazoPreferido } = req.body;
    if (!montoSolicitado || montoSolicitado <= 0 || !motivoCredito?.trim()) {
      return res.status(400).json({
        success: false,
        message: "El monto solicitado y motivo son requeridos",
      });
    }
    
    if (!tenant_id) {
      logger.error('No se pudo determinar tenant_id', {
        hasTenant: !!req.tenant,
        hasUser: !!req.user,
        userTenantId: req.user?.tenant_id,
        requestId: req.requestId
      });
      return res.status(500).json({
        success: false,
        message: "Error de configuración del sistema",
      });
    }

    // Intentar insertar con todos los campos (si existen en la BD)
    // Si falla, intentar con solo los campos básicos
    let query = `
      INSERT INTO solicitudes_credito 
        (cliente_id, monto_solicitado, motivo_uso, ingresos_mensuales, plazo_preferido, tenant_id)
      VALUES 
        ($1, $2, $3, $4, $5, $6)
      RETURNING solicitud_id
    `;

    let values = [
      clienteId, 
      montoSolicitado, 
      motivoCredito.trim(),
      ingresosMensuales || null,
      plazoPreferido || null,
      tenant_id
    ];

    let rows;
    try {
      const result = await db.query(query, values);
      rows = result.rows;
    } catch (error) {
      // Si falla (probablemente porque las columnas no existen), usar query básico
      logger.warn('Columnas ingresos_mensuales/plazo_preferido no existen, usando query básico', {
        error: error.message
      });
      query = `
        INSERT INTO solicitudes_credito 
          (cliente_id, monto_solicitado, motivo_uso, tenant_id)
        VALUES 
          ($1, $2, $3, $4)
        RETURNING solicitud_id
      `;
      values = [clienteId, montoSolicitado, motivoCredito.trim(), tenant_id];
      const result = await db.query(query, values);
      rows = result.rows;
    }

    return res.json({
      success: true,
      message: "Solicitud enviada correctamente",
      data: {
        solicitudId: rows[0].solicitud_id,
      },
    });
  } catch (error) {
    logger.error('Error al enviar solicitud de crédito:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "No fue posible enviar la solicitud",
    });
  }
};

const obtenerMovimientosCredito = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "No autenticado",
      });
    }

    if (!isCliente(req)) {
      return res.status(403).json({
        success: false,
        message: "Acceso denegado",
      });
    }

    const clienteId = normalizeClienteId(req);
    if (!clienteId) {
      return res.status(400).json({
        success: false,
        message: "Identificador de cliente inválido",
      });
    }

    // Obtener parámetros de paginación
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;

    // Verificar que el cliente tenga crédito activo
    const tenant_id = req.tenant?.tenant_id || 1;
    const creditoActivo = await fetchCreditoActivo(clienteId, tenant_id);
    if (!creditoActivo) {
      return res.json({
        success: true,
        data: {
          movimientos: [],
          pagination: {
            page: 1,
            limit: 10,
            total: 0,
            totalPages: 0,
          },
        },
      });
    }

    const creditoId = creditoActivo.credito_id;

    // Obtener el total de movimientos
    const countResult = await db.query(
      `SELECT COUNT(*) as total
       FROM credito_movimientos
       WHERE credito_id = $1 AND tenant_id = $2`,
      [creditoId, tenant_id]
    );
    const totalMovimientos = parseInt(countResult.rows[0]?.total || 0, 10);
    const totalPages = Math.ceil(totalMovimientos / limit);

    // Obtener los movimientos paginados con estado de pago
    const movimientosResult = await db.query(
      `SELECT 
        cm.movimiento_id,
        cm.tipo_movimiento,
        cm.monto,
        cm.saldo_despues_movimiento,
        cm.referencia_id,
        cm.descripcion,
        cm.fecha_movimiento,
        cm.remision_id,
        cm.pedido_id,
        r.folio              AS remision_folio,
        r.total_remision     AS remision_monto,
        pc.pago_id,
        pc.estatus as pago_estatus
       FROM credito_movimientos cm
       LEFT JOIN remisiones r ON r.remision_id = cm.remision_id
       LEFT JOIN pagos_clientes pc ON 
         pc.movimientos_aplicados::jsonb ? cm.movimiento_id::text
         AND pc.cliente_id = $5
         AND pc.tenant_id = $6
       WHERE cm.credito_id = $1
         AND cm.tenant_id = $2
       ORDER BY cm.fecha_movimiento DESC
       LIMIT $3 OFFSET $4`,
      [creditoId, tenant_id, limit, offset, clienteId, tenant_id]
    );

    const movimientos = movimientosResult.rows.map((mov) => ({
      movimientoId: mov.movimiento_id,
      tipo: mov.tipo_movimiento,
      monto: parseFloat(mov.monto),
      saldoDespues: parseFloat(mov.saldo_despues_movimiento || 0),
      referenciaId: mov.referencia_id,
      descripcion: mov.descripcion,
      fecha: mov.fecha_movimiento,
      remisionId: mov.remision_id,
      pedidoId: mov.pedido_id,
      remisionFolio: mov.remision_folio,
      remisionMonto: mov.remision_monto ? parseFloat(mov.remision_monto) : null,
      pagoId: mov.pago_id,
      pagoEstatus: mov.pago_estatus,
    }));

    return res.json({
      success: true,
      data: {
        movimientos,
        pagination: {
          page,
          limit,
          total: totalMovimientos,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      },
    });
  } catch (error) {
    logger.error('Error obteniendo movimientos de crédito:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "No fue posible obtener los movimientos de crédito",
    });
  }
};

const registrarPagoCliente = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "No autenticado",
      });
    }

    if (!isCliente(req)) {
      return res.status(403).json({
        success: false,
        message: "Acceso denegado",
      });
    }

    const clienteId = normalizeClienteId(req);
    if (!clienteId) {
      return res.status(400).json({
        success: false,
        message: "Identificador de cliente inválido",
      });
    }

    const { monto, tipoPago, movimientosIds, referenciaBancaria, transaccionId } = req.body;

    if (!monto || monto <= 0) {
      return res.status(400).json({
        success: false,
        message: "El monto del pago es requerido y debe ser mayor a cero",
      });
    }

    if (!tipoPago || !["TRANSFERENCIA", "MERCADOPAGO", "EFECTIVO", "CHEQUE", "OTRO"].includes(tipoPago)) {
      return res.status(400).json({
        success: false,
        message: "Tipo de pago inválido",
      });
    }

    const tenant_id = req.tenant?.tenant_id || 1;
    const estadosHelper = require('../../utils/estadosHelper');

    const creditoActivo = await fetchCreditoActivo(clienteId, tenant_id);
    const creditoId = creditoActivo?.credito_id || null;

    // Obtener admin_id basado en el estado del cliente
    const adminId = await estadosHelper.getAdminByClienteEstado(clienteId, tenant_id);

    const comprobanteUrl = req.body.comprobanteUrl || null;
    const movimientosAplicados = Array.isArray(movimientosIds) ? movimientosIds : [];

    const insertQuery = `
      INSERT INTO pagos_clientes
        (cliente_id, credito_id, monto, tipo_pago, estatus, comprobante_url,
         referencia_bancaria, transaccion_id, movimientos_aplicados, tenant_id, admin_id)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING pago_id, fecha_pago
    `;

    const values = [
      clienteId,
      creditoId,
      monto,
      tipoPago,
      tipoPago === "MERCADOPAGO" ? "APROBADO" : "PENDIENTE",
      comprobanteUrl,
      referenciaBancaria || null,
      transaccionId || null,
      JSON.stringify(movimientosAplicados),
      tenant_id,
      adminId || 1,
    ];

    const { rows } = await db.query(insertQuery, values);

    return res.json({
      success: true,
      message: tipoPago === "MERCADOPAGO" 
        ? "Pago procesado exitosamente" 
        : "Pago registrado. Será validado en las próximas 24 horas",
      data: {
        pagoId: rows[0].pago_id,
        fechaPago: rows[0].fecha_pago,
        estatus: tipoPago === "MERCADOPAGO" ? "APROBADO" : "PENDIENTE",
      },
    });
  } catch (error) {
    logger.error('Error registrando pago de cliente:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "No fue posible registrar el pago",
    });
  }
};

async function obtenerMovimientosPendientes(req, res) {
  try {
    const clienteId = normalizeClienteId(req);
    if (!clienteId) {
      return res.status(401).json({
        success: false,
        message: "Cliente no autenticado",
      });
    }

    if (!isCliente(req)) {
      return res.status(403).json({
        success: false,
        message: "Acceso denegado. Solo clientes pueden consultar sus movimientos pendientes.",
      });
    }

    const tenant_id = req.tenant?.tenant_id || 1;
    
    // Obtener crédito activo
    const creditoActivo = await fetchCreditoActivo(clienteId, tenant_id);
    if (!creditoActivo) {
      return res.json({
        success: true,
        data: [],
      });
    }

    // Consulta directa a tabla pedidos (fuente de verdad)
    // Ya no calculamos saldos desde credito_movimientos porque los pagos FIFO actualizan pedidos directamente
    const query = `
      SELECT 
        'PED-' || pedidoid AS referencia_id,
        fechapedido AS fecha,
        'Compra realizada (Pedido #' || pedidoid || ')' AS concepto,
        COALESCE(saldo_pendiente, montototal) AS saldo_pendiente,
        montototal AS monto_original
      FROM pedidos
      WHERE 
        clienteid = $1 
        AND es_credito = true 
        AND pagado = false 
        AND COALESCE(saldo_pendiente, montototal) > 0.01
        AND tenant_id = $2
      ORDER BY fechapedido ASC
    `;

    const result = await db.query(query, [clienteId, tenant_id]);

    const movimientosPendientes = result.rows.map((row) => ({
      referenciaId: row.referencia_id,
      concepto: row.concepto || `Cargo ${row.referencia_id}`,
      fecha: row.fecha,
      saldoPendiente: parseFloat(row.saldo_pendiente || 0),
      montoOriginal: parseFloat(row.monto_original || 0),
    }));

    return res.json({
      success: true,
      data: movimientosPendientes,
    });
  } catch (error) {
    logger.error('Error obteniendo movimientos pendientes:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "No fue posible obtener los movimientos pendientes",
    });
  }
}

const obtenerEstadoCuentaMensual = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "No autenticado",
      });
    }

    if (!isCliente(req)) {
      return res.status(403).json({
        success: false,
        message: "Acceso denegado",
      });
    }

    const clienteId = normalizeClienteId(req);
    if (!clienteId) {
      return res.status(400).json({
        success: false,
        message: "Identificador de cliente inválido",
      });
    }

    const { mes, anio } = req.params;
    const mesNum = parseInt(mes, 10);
    const anioNum = parseInt(anio, 10);

    if (!mesNum || mesNum < 1 || mesNum > 12 || !anioNum || anioNum < 2000) {
      return res.status(400).json({
        success: false,
        message: "Mes o año inválido",
      });
    }

    const tenant_id = req.tenant?.tenant_id || 1;

    // Verificar que el cliente tenga crédito activo
    const creditoActivo = await fetchCreditoActivo(clienteId, tenant_id);
    if (!creditoActivo) {
      return res.status(404).json({
        success: false,
        message: "No tienes una línea de crédito activa",
      });
    }

    const creditoId = creditoActivo.credito_id;

    // Calcular fechas del periodo
    const fechaInicio = new Date(anioNum, mesNum - 1, 1);
    const fechaFin = new Date(anioNum, mesNum, 0, 23, 59, 59);

    // Obtener saldo inicial (acumulado de meses anteriores)
    const saldoInicialQuery = `
      SELECT COALESCE(
        (SELECT saldo_despues_movimiento 
         FROM credito_movimientos 
         WHERE credito_id = $1 
           AND tenant_id = $2
           AND fecha_movimiento < $3
         ORDER BY fecha_movimiento DESC, movimiento_id DESC
         LIMIT 1
        ), 0
      ) as saldo_inicial
    `;
    const saldoInicialResult = await db.query(saldoInicialQuery, [
      creditoId,
      tenant_id,
      fechaInicio,
    ]);
    const saldoInicial = parseFloat(saldoInicialResult.rows[0]?.saldo_inicial || 0);

    // Obtener movimientos del mes
    const movimientosQuery = `
      SELECT 
        cm.movimiento_id,
        cm.tipo_movimiento,
        cm.monto,
        cm.saldo_despues_movimiento,
        cm.referencia_id,
        cm.descripcion,
        cm.fecha_movimiento
      FROM credito_movimientos cm
      WHERE cm.credito_id = $1
        AND cm.tenant_id = $2
        AND cm.fecha_movimiento >= $3
        AND cm.fecha_movimiento <= $4
      ORDER BY cm.fecha_movimiento ASC, cm.movimiento_id ASC
    `;

    const movimientosResult = await db.query(movimientosQuery, [
      creditoId,
      tenant_id,
      fechaInicio,
      fechaFin,
    ]);

    const movimientos = movimientosResult.rows.map((mov) => ({
      movimientoId: mov.movimiento_id,
      tipo: mov.tipo_movimiento,
      monto: parseFloat(mov.monto),
      saldoDespues: parseFloat(mov.saldo_despues_movimiento || 0),
      referenciaId: mov.referencia_id,
      descripcion: mov.descripcion,
      fecha: mov.fecha_movimiento,
    }));

    // Calcular saldo final del mes
    const saldoFinal = movimientos.length > 0 
      ? movimientos[movimientos.length - 1].saldoDespues 
      : saldoInicial;

    // Obtener información del cliente
    const adminIdForInfo = await require('../../utils/estadosHelper').getAdminByClienteEstado(clienteId, tenant_id);

    const clienteQuery = `
      SELECT
        c.nombre,
        c.email,
        c.telefono,
        cc.limite_credito
      FROM clientes c
      LEFT JOIN cliente_creditos cc ON c.clienteid = cc.cliente_id
        AND cc.admin_id = $3
        AND cc.tenant_id = $2
        AND cc.estado_credito = 'ACTIVO'
      WHERE c.clienteid = $1 AND c.tenant_id = $2
    `;
    const clienteResult = await db.query(clienteQuery, [clienteId, tenant_id, adminIdForInfo]);
    const clienteInfo = clienteResult.rows[0] || {};

    return res.json({
      success: true,
      data: {
        periodo: {
          mes: mesNum,
          anio: anioNum,
          fechaInicio,
          fechaFin,
        },
        cliente: {
          nombre: clienteInfo.nombre,
          email: clienteInfo.email,
          telefono: clienteInfo.telefono,
          limiteCredito: parseFloat(clienteInfo.limite_credito || 0),
        },
        saldoInicial,
        saldoFinal,
        movimientos,
      },
    });
  } catch (error) {
    logger.error('Error obteniendo estado de cuenta mensual:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "No fue posible obtener el estado de cuenta",
    });
  }
};

const obtenerMesesDisponibles = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "No autenticado" });
    }
    if (!isCliente(req)) {
      return res.status(403).json({ success: false, message: "Acceso denegado" });
    }
    const clienteId = normalizeClienteId(req);
    if (!clienteId) {
      return res.status(400).json({ success: false, message: "Identificador de cliente inválido" });
    }

    const tenant_id = req.tenant?.tenant_id || 1;
    const creditoActivo = await fetchCreditoActivo(clienteId, tenant_id);
    if (!creditoActivo) {
      return res.json({ success: true, meses: [] });
    }

    const result = await db.query(
      `SELECT DISTINCT
         EXTRACT(MONTH FROM fecha_movimiento)::int AS mes,
         EXTRACT(YEAR  FROM fecha_movimiento)::int AS anio
       FROM credito_movimientos
       WHERE credito_id = $1 AND tenant_id = $2
       ORDER BY anio DESC, mes DESC
       LIMIT 24`,
      [creditoActivo.credito_id, tenant_id]
    );

    return res.json({ success: true, meses: result.rows });
  } catch (error) {
    logger.error('Error obteniendo meses disponibles:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({ success: false, message: "Error al obtener meses disponibles" });
  }
};

module.exports = {
  checkAuthCredit,
  obtenerPerfilCredito,
  obtenerMovimientosCredito,
  registrarPagoCliente,
  obtenerMovimientosPendientes,
  enviarSolicitudCredito,
  obtenerEstadoCuentaMensual,
  obtenerMesesDisponibles,
};
