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
 */
const getCxcSummary = async (req, res) => {
  try {
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
       ORDER BY cred.saldo_deudor DESC`
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

    let creditoRow;
    if (Number.isInteger(creditoIdBody) && creditoIdBody > 0) {
      const creditoResult = await client.query(
        "SELECT * FROM cliente_creditos WHERE credito_id = $1",
        [creditoIdBody]
      );
      if (creditoResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          message: "Crédito no encontrado",
        });
      }
      creditoRow = creditoResult.rows[0];
    } else {
      const creditoResult = await client.query(
        "SELECT * FROM cliente_creditos WHERE cliente_id = $1",
        [clienteIdBody]
      );
      if (creditoResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          message: "Cliente no tiene crédito configurado",
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
       WHERE credito_id = $2`,
      [nuevoSaldo, creditoRow.credito_id]
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

module.exports = {
  getCxcSummary,
  registrarAbonoCxC
};
