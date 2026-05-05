/**
 * CXC ADMIN CONTROLLER (Cuentas por Cobrar)
 * 
 * Controlador especializado para la gestión de cuentas por cobrar.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/cxcAdminController
 * @author RazoConnect Team
 * @date 2026-02-26
 */

const db = require('../db');
const logger = require('../utils/logger');

/**
 * Obtener resumen de cuentas por cobrar
 * @route GET /api/admin/cxc-summary
 *
 * SEPARACIÓN POR ADMIN:
 * - Admin: Ve SOLO su CxC (admin_id = su ID)
 * - Super Admin: Ve TODO (sin filtro)
 * - Staff: Ve CxC del admin asignado (admin_responsable_id)
 */
const getCxcSummary = async (req, res) => {
  try {
    const estadosHelper = require('../utils/estadosHelper');
    const { adminId, shouldFilter } = estadosHelper.getAdminIdFromContext(req.user);
    const tenantId = req.tenant?.tenant_id || 1;

    // ⚠️ CRÍTICO: Filtro admin_id obligatorio si no es super_admin
    const adminFilter = shouldFilter ? 'AND cred.admin_id = $2' : '';
    const params = shouldFilter ? [tenantId, adminId] : [tenantId];

    const result = await db.query(
      `SELECT
         c.clienteid,
         c.nombre,
         c.apellido,
         c.email,
         c.telefono,
         cred.credito_id,
         cred.limite_credito,
         cred.saldo_deudor,
         cred.dias_gracia,
         cred.estado_credito,
         cred.ultima_actualizacion,
         cred.admin_id,
         mov.fecha_movimiento AS ultima_fecha_movimiento,
         mov.descripcion AS ultima_descripcion,
         mov.tipo_movimiento AS ultima_tipo_movimiento,
         mov.saldo_despues_movimiento AS ultima_saldo_despues,
         COALESCE(vencido.tiene_vencido, false) AS esta_vencido
       FROM cliente_creditos cred
       INNER JOIN clientes c ON c.clienteid = cred.cliente_id
       LEFT JOIN LATERAL (
         SELECT
           fecha_movimiento,
           descripcion,
           tipo_movimiento,
           saldo_despues_movimiento
         FROM credito_movimientos
         WHERE credito_id = cred.credito_id
         ORDER BY fecha_movimiento DESC
         LIMIT 1
       ) mov ON TRUE
       LEFT JOIN LATERAL (
         SELECT TRUE AS tiene_vencido
         FROM pedidos p
         WHERE p.clienteid = c.clienteid
           AND COALESCE(p.pagado, FALSE) = FALSE
           AND p.fecha_vencimiento IS NOT NULL
           AND p.fecha_vencimiento < NOW()
         LIMIT 1
       ) vencido ON TRUE
       WHERE cred.saldo_deudor > 0
         AND cred.tenant_id = $1
         ${adminFilter}
       ORDER BY cred.saldo_deudor DESC`,
      params
    );

    const cartera = (result.rows || []).map((row) => {
      const saldo = Number.parseFloat(row.saldo_deudor ?? 0) || 0;
      const limite = Number.parseFloat(row.limite_credito ?? 0) || 0;
      const disponible = Math.max(limite - saldo, 0);
      const estado =
        row.esta_vencido === true || row.esta_vencido === "true" ? "VENCIDO" : "AL_DIA";

      return {
        creditoId: row.credito_id,
        clienteId: row.clienteid,
        clienteNombre: [row.nombre, row.apellido].filter(Boolean).join(" ").trim(),
        email: row.email,
        telefono: row.telefono || null,
        limiteCredito: limite,
        saldoDeudor: saldo,
        disponible,
        diasGracia: Number.parseInt(row.dias_gracia, 10) || 0,
        estadoCredito: row.estado_credito,
        estado,
        ultimaActualizacion: row.ultima_actualizacion,
        ultimoMovimiento: row.ultima_fecha_movimiento || null,
        ultimoMovimientoDescripcion: row.ultima_descripcion || null,
        ultimoMovimientoTipo: row.ultima_tipo_movimiento || null,
        ultimoSaldoDespues:
          Number.parseFloat(row.ultima_saldo_despues ?? saldo) ||
          saldo,
      };
    });

    const totalCobrar = cartera.reduce((acc, item) => acc + item.saldoDeudor, 0);
    const totalVencido = cartera
      .filter((item) => item.estado === "VENCIDO")
      .reduce((acc, item) => acc + item.saldoDeudor, 0);

    return res.json({
      success: true,
      data: {
        totalCobrar,
        totalVencido,
        conteoClientes: cartera.length,
        cartera,
      },
    });
  } catch (error) {
    logger.error('Error al obtener resumen CxC:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "Error al obtener el resumen de cuentas por cobrar",
    });
  }
};

/**
 * Registrar abono a cuenta por cobrar
 * @route POST /api/admin/cxc/abono
 */
const registrarAbonoCxC = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const clienteIdBody = Number.parseInt(
      req.body?.clienteId ?? req.body?.clienteid,
      10
    );
    const creditoIdBody = Number.parseInt(req.body?.creditoId, 10);
    const monto = Number.parseFloat(req.body?.monto);
    const metodoPagoRaw = (req.body?.metodoPago ?? req.body?.metodo_pago ?? "")
      .toString()
      .trim()
      .toLowerCase();
    const notas = (req.body?.notas ?? req.body?.nota ?? req.body?.concepto ?? "")
      .toString()
      .trim();
    const referencia = (req.body?.referencia ?? "").toString().trim();

    if ((!Number.isInteger(creditoIdBody) || creditoIdBody <= 0) && (!Number.isInteger(clienteIdBody) || clienteIdBody <= 0)) {
      return res.status(400).json({
        success: false,
        message: "Debe proporcionar creditoId o clienteId válido",
      });
    }

    const allowedMetodos = new Set(["efectivo", "transferencia"]);
    const metodoPago = allowedMetodos.has(metodoPagoRaw)
      ? metodoPagoRaw
      : "efectivo";

    const montoCentavos = Math.round(monto * 100);
    if (!Number.isInteger(montoCentavos) || montoCentavos <= 0) {
      return res.status(400).json({
        success: false,
        message: "Monto inválido",
      });
    }

    const montoNormalizado = Number.parseFloat((montoCentavos / 100).toFixed(2));

    await client.query("BEGIN");

    // ⚠️ SEPARACIÓN POR ADMIN: Get admin_id from user context
    const estadosHelper = require('../utils/estadosHelper');
    const { adminId, shouldFilter } = estadosHelper.getAdminIdFromContext(req.user);
    const tenantId = req.tenant?.tenant_id || 1;

    let creditoRow;
    if (Number.isInteger(creditoIdBody) && creditoIdBody > 0) {
      const adminFilter = shouldFilter ? 'AND admin_id = $2' : '';
      const params = shouldFilter ? [creditoIdBody, adminId, tenantId] : [creditoIdBody, tenantId];

      const creditoResult = await client.query(
        `SELECT credito_id, cliente_id, saldo_deudor, tenant_id, admin_id
         FROM cliente_creditos
         WHERE credito_id = $1
           AND tenant_id = ${shouldFilter ? '$3' : '$2'}
           ${adminFilter}`,
        params
      );
      if (creditoResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          message: "Crédito no encontrado o no tienes acceso",
        });
      }
      creditoRow = creditoResult.rows[0];
    } else {
      const adminFilter = shouldFilter ? 'AND admin_id = $2' : '';
      const params = shouldFilter ? [clienteIdBody, adminId, tenantId] : [clienteIdBody, tenantId];

      const creditoResult = await client.query(
        `SELECT credito_id, cliente_id, saldo_deudor, tenant_id, admin_id
         FROM cliente_creditos
         WHERE cliente_id = $1
           AND tenant_id = ${shouldFilter ? '$3' : '$2'}
           ${adminFilter}`,
        params
      );
      if (creditoResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          message: "Cliente no tiene crédito configurado o no tienes acceso",
        });
      }
      creditoRow = creditoResult.rows[0];
    }

    const saldoActual = Number.parseFloat(creditoRow.saldo_deudor ?? 0) || 0;

    if (montoNormalizado > saldoActual) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: `El abono ($${montoNormalizado.toFixed(2)}) excede el saldo deudor ($${saldoActual.toFixed(2)})`,
      });
    }

    const nuevoSaldo = Number.parseFloat((saldoActual - montoNormalizado).toFixed(2));

    await client.query(
      `UPDATE cliente_creditos
       SET saldo_deudor = $1, ultima_actualizacion = NOW()
       WHERE credito_id = $2
         AND admin_id = $3
         AND tenant_id = $4`,
      [nuevoSaldo, creditoRow.credito_id, adminId, tenantId]
    );

    const descripcion = notas || `Abono de $${montoNormalizado.toFixed(2)} - ${metodoPago}`;

    await client.query(
      `INSERT INTO credito_movimientos
       (credito_id, tipo_movimiento, monto, saldo_despues_movimiento, descripcion, metodo_pago, referencia, fecha_movimiento)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        creditoRow.credito_id,
        "ABONO",
        montoNormalizado,
        nuevoSaldo,
        descripcion,
        metodoPago,
        referencia || null,
      ]
    );

    await client.query("COMMIT");

    return res.json({
      success: true,
      message: "Abono registrado exitosamente",
      data: {
        creditoId: creditoRow.credito_id,
        clienteId: creditoRow.cliente_id,
        montoAbonado: montoNormalizado,
        saldoAnterior: saldoActual,
        nuevoSaldo,
        metodoPago,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error('Error al registrar abono CxC:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "Error al registrar el abono",
    });
  } finally {
    client.release();
  }
};

/**
 * Obtener configuración de número de factura siguiente
 * @route GET /api/admin/cxc/config-factura
 */
const obtenerConfigFactura = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;

    // Intentar obtener configuración existente
    let configResult = await db.query(
      `SELECT numero_factura_inicio, numero_factura_siguiente, ultima_actualizacion
       FROM tenant_cxc_config 
       WHERE tenant_id = $1`,
      [tenant_id]
    );

    if (configResult.rows.length === 0) {
      // Si no existe, retornar configuración por defecto
      return res.json({
        success: true,
        data: {
          numero_factura_inicio: null,
          numero_factura_siguiente: null,
          configurado: false,
          mensaje: 'Necesita configurar el número de factura inicial'
        }
      });
    }

    const config = configResult.rows[0];
    return res.json({
      success: true,
      data: {
        numero_factura_inicio: config.numero_factura_inicio,
        numero_factura_siguiente: config.numero_factura_siguiente,
        configurado: true
      }
    });

  } catch (error) {
    logger.error('Error al obtener configuración de factura:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "Error al obtener configuración de factura"
    });
  }
};

/**
 * Actualizar configuración de número de factura
 * @route POST /api/admin/cxc/config-factura
 */
const actualizarConfigFactura = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;
    const { numero_factura_inicio } = req.body;

    if (!numero_factura_inicio || Number.isNaN(parseInt(numero_factura_inicio))) {
      return res.status(400).json({
        success: false,
        message: "Debe proporcionar un número de factura válido"
      });
    }

    const numeroInicioInt = parseInt(numero_factura_inicio);
    
    if (numeroInicioInt < 1 || numeroInicioInt > 999999) {
      return res.status(400).json({
        success: false,
        message: "El número debe estar entre 1 y 999999"
      });
    }

    // Verificar si ya existe configuración
    let configResult = await db.query(
      `SELECT numero_factura_inicio FROM tenant_cxc_config WHERE tenant_id = $1`,
      [tenant_id]
    );

    if (configResult.rows.length > 0) {
      // Actualizar
      await db.query(
        `UPDATE tenant_cxc_config 
         SET numero_factura_inicio = $1, numero_factura_siguiente = $1, ultima_actualizacion = NOW()
         WHERE tenant_id = $2`,
        [numeroInicioInt, tenant_id]
      );
    } else {
      // Crear nueva configuración
      await db.query(
        `INSERT INTO tenant_cxc_config (tenant_id, numero_factura_inicio, numero_factura_siguiente)
         VALUES ($1, $2, $2)`,
        [tenant_id, numeroInicioInt]
      );
    }

    logger.info('Configuración de factura actualizada', {
      tenantId: tenant_id,
      numeroInicio: numeroInicioInt
    });

    return res.json({
      success: true,
      message: "Configuración actualizada correctamente",
      data: {
        numero_factura_inicio: numeroInicioInt,
        numero_factura_siguiente: numeroInicioInt
      }
    });

  } catch (error) {
    logger.error('Error al actualizar configuración de factura:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "Error al actualizar configuración de factura"
    });
  }
};

/**
 * Validar si número de factura ya existe
 * @route POST /api/admin/cxc/validar-factura
 */
const validarNumeroFactura = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;
    const { numero_factura } = req.body;

    if (!numero_factura) {
      return res.status(400).json({
        success: false,
        message: "Debe proporcionar un número de factura"
      });
    }

    // Validar que no exista este número de factura
    const estadosHelper = require('../utils/estadosHelper');
    const { adminId, shouldFilter } = estadosHelper.getAdminIdFromContext(req.user);
    const tenantId = req.tenant?.tenant_id || 1;

    const adminFilter = shouldFilter ? 'AND admin_id = $3' : '';
    const params = shouldFilter
      ? [numero_factura.toString().trim(), tenantId, adminId]
      : [numero_factura.toString().trim(), tenantId];

    const existResult = await db.query(
      `SELECT cxc_id FROM cuentas_por_cobrar
       WHERE numero_factura = $1
         AND tenant_id = $2
         ${adminFilter}`,
      params
    );

    if (existResult.rows.length > 0) {
      return res.json({
        success: false,
        existe: true,
        message: `El número de factura ${numero_factura} ya existe`,
        numero_actual: numero_factura
      });
    }

    return res.json({
      success: true,
      existe: false,
      message: "El número de factura está disponible"
    });

  } catch (error) {
    logger.error('Error al validar número de factura:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "Error al validar número de factura"
    });
  }
};

/**
 * Obtener movimientos de crédito de un cliente (estado de cuenta tipo banco)
 * Incluye: RESERVA al crear pedido, AJUSTE+CARGO por cada remisión confirmada, ABONO/PAGO
 * @route GET /api/admin/cxc/cliente/:clienteId/movimientos
 */
const getMovimientosCliente = async (req, res) => {
  try {
    const clienteId = parseInt(req.params.clienteId, 10);
    const tenantId = req.tenant?.tenant_id || 1;
    const { page = 1, limit = 50, pedido_id, tipo } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const estadosHelper = require('../utils/estadosHelper');
    const { adminId, shouldFilter } = estadosHelper.getAdminIdFromContext(req.user);

    if (!Number.isInteger(clienteId) || clienteId <= 0) {
      return res.status(400).json({ success: false, message: 'clienteId inválido' });
    }

    const adminFilter = shouldFilter ? 'AND cc.admin_id = $3' : '';
    const params = shouldFilter
      ? [clienteId, tenantId, adminId]
      : [clienteId, tenantId];
    let paramIdx = params.length + 1;

    const conditions = [];
    if (pedido_id) {
      conditions.push(`cm.pedido_id = $${paramIdx}`);
      params.push(parseInt(pedido_id, 10));
      paramIdx++;
    }
    if (tipo) {
      conditions.push(`cm.tipo_movimiento = $${paramIdx}`);
      params.push(tipo.toUpperCase());
      paramIdx++;
    }
    const extraWhere = conditions.length ? `AND ${conditions.join(' AND ')}` : '';

    const movQuery = `
      SELECT
        cm.movimiento_id,
        cm.tipo_movimiento,
        cm.monto,
        cm.saldo_despues_movimiento,
        cm.descripcion,
        cm.referencia_id,
        cm.remision_id,
        cm.pedido_id,
        cm.metodo_pago,
        cm.fecha_movimiento,
        r.folio            AS remision_folio,
        r.total_remision   AS remision_monto
      FROM credito_movimientos cm
      INNER JOIN cliente_creditos cc ON cc.credito_id = cm.credito_id
      LEFT JOIN remisiones r ON r.remision_id = cm.remision_id
      WHERE cc.cliente_id = $1
        AND cc.tenant_id = $2
        ${adminFilter}
        ${extraWhere}
      ORDER BY cm.fecha_movimiento DESC
      LIMIT ${parseInt(limit, 10)} OFFSET ${offset}
    `;

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM credito_movimientos cm
      INNER JOIN cliente_creditos cc ON cc.credito_id = cm.credito_id
      WHERE cc.cliente_id = $1
        AND cc.tenant_id = $2
        ${adminFilter}
        ${extraWhere}
    `;

    const [movResult, countResult] = await Promise.all([
      db.query(movQuery, params),
      db.query(countQuery, params)
    ]);

    return res.json({
      success: true,
      data: {
        movimientos: movResult.rows,
        total: parseInt(countResult.rows[0].total, 10),
        page: parseInt(page, 10),
        limit: parseInt(limit, 10)
      }
    });
  } catch (error) {
    logger.error('Error al obtener movimientos del cliente:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({ success: false, message: 'Error al obtener movimientos' });
  }
};

/**
 * Estado de cuenta resumido de un cliente: reserva pendiente + cargos confirmados + saldo
 * @route GET /api/admin/cxc/cliente/:clienteId/estado-cuenta
 */
const getEstadoCuentaCliente = async (req, res) => {
  try {
    const clienteId = parseInt(req.params.clienteId, 10);
    const tenantId = req.tenant?.tenant_id || 1;

    const estadosHelper = require('../utils/estadosHelper');
    const { adminId, shouldFilter } = estadosHelper.getAdminIdFromContext(req.user);

    if (!Number.isInteger(clienteId) || clienteId <= 0) {
      return res.status(400).json({ success: false, message: 'clienteId inválido' });
    }

    const adminFilter = shouldFilter ? 'AND cc.admin_id = $3' : '';
    const params = shouldFilter ? [clienteId, tenantId, adminId] : [clienteId, tenantId];

    const result = await db.query(
      `SELECT
         cc.credito_id,
         cc.limite_credito,
         cc.saldo_deudor                                                     AS saldo_total,
         COALESCE(cargos.total_cargos, 0)                                    AS cargo_confirmado,
         cc.saldo_deudor - COALESCE(cargos.total_cargos, 0)                  AS reserva_pendiente,
         (cc.limite_credito - cc.saldo_deudor)                               AS credito_disponible,
         COALESCE(cargos.cantidad_remisiones, 0)                             AS remisiones_facturadas,
         cc.estado_credito,
         cc.ultima_actualizacion,
         cxc.cargos_pendientes_pago
       FROM cliente_creditos cc
       LEFT JOIN (
         SELECT credito_id,
                SUM(monto)             AS total_cargos,
                COUNT(*)               AS cantidad_remisiones
         FROM credito_movimientos
         WHERE tipo_movimiento = 'CARGO'
         GROUP BY credito_id
       ) cargos ON cargos.credito_id = cc.credito_id
       LEFT JOIN (
         SELECT cliente_id,
                SUM(monto) AS cargos_pendientes_pago
         FROM cuentas_por_cobrar
         WHERE pagado = false AND tipo_movimiento = 'CARGO'
         GROUP BY cliente_id
       ) cxc ON cxc.cliente_id = cc.cliente_id
       WHERE cc.cliente_id = $1
         AND cc.tenant_id = $2
         ${adminFilter}`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Cliente sin crédito configurado' });
    }

    const row = result.rows[0];
    return res.json({
      success: true,
      data: {
        creditoId: row.credito_id,
        limiteCredito: parseFloat(row.limite_credito || 0),
        saldoTotal: parseFloat(row.saldo_total || 0),
        cargoConfirmado: parseFloat(row.cargo_confirmado || 0),
        reservaPendiente: parseFloat(row.reserva_pendiente || 0),
        creditoDisponible: parseFloat(row.credito_disponible || 0),
        remisionesFacturadas: parseInt(row.remisiones_facturadas || 0, 10),
        cargosPendientesPago: parseFloat(row.cargos_pendientes_pago || 0),
        estadoCredito: row.estado_credito,
        ultimaActualizacion: row.ultima_actualizacion
      }
    });
  } catch (error) {
    logger.error('Error al obtener estado de cuenta:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({ success: false, message: 'Error al obtener estado de cuenta' });
  }
};

module.exports = {
  getCxcSummary,
  registrarAbonoCxC,
  obtenerConfigFactura,
  actualizarConfigFactura,
  validarNumeroFactura,
  getMovimientosCliente,
  getEstadoCuentaCliente
};
