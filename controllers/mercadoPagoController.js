const mercadopago = require("mercadopago");
const logger = require('../utils/logger');
const db = require("../db");

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

// Solo configurar Mercado Pago si el token está disponible
// Esto permite que el módulo se cargue en tests sin el token
if (MP_ACCESS_TOKEN) {
  mercadopago.configure({
    access_token: MP_ACCESS_TOKEN,
  });
}

const parseCurrency = (value) => {
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return Number.parseFloat(parsed.toFixed(2));
};

const buildErrorResponse = (res, statusCode, message, details = null) =>
  res.status(statusCode).json({
    success: false,
    message,
    details,
  });

const procesarPagoTarjeta = async (req, res) => {
  // Validar que Mercado Pago esté configurado
  if (!MP_ACCESS_TOKEN) {
    return buildErrorResponse(
      res, 
      503, 
      "Mercado Pago no está configurado. Contacte al administrador."
    );
  }

  const {
    token,
    monto,
    transaction_amount,
    description = "Pago RazoConnect",
    installments = 1,
    payment_method_id = "visa",
    payer = {},
    cliente_id: clienteIdBody,
    credito_id: creditoIdBody,
    metadata = {},
  } = req.body || {};

  const clienteIdMeta = metadata?.cliente_id ?? clienteIdBody ?? req.user?.userId;
  const creditoIdMeta = metadata?.credito_id ?? creditoIdBody ?? null;

  if (!token) {
    return buildErrorResponse(res, 400, "token es requerido");
  }

  const amount =
    parseCurrency(transaction_amount ?? monto) ??
    parseCurrency(req.body?.amount) ??
    null;
  if (amount === null || amount <= 0) {
    return buildErrorResponse(res, 400, "transaction_amount inválido");
  }

  const payerEmail =
    payer?.email ||
    req.body?.emailCliente ||
    req.user?.email ||
    "cliente@razoconnect.com";

  const paymentPayload = {
    token,
    transaction_amount: amount,
    description,
    installments: Number.isInteger(installments)
      ? installments
      : parseInt(installments, 10) || 1,
    payment_method_id,
    payer: {
      email: payerEmail,
    },
    metadata: {
      cliente_id: clienteIdMeta || null,
      credito_id: creditoIdMeta || null,
      tipo_operacion: metadata?.tipo_operacion || "ABONO_A_CUENTA",
    },
  };

  const client = await db.pool.connect();
  let transactionStarted = false;

  try {
    const pago = await mercadopago.payment.create(paymentPayload);
    const paymentData = pago?.body || pago;

    if (!paymentData || !paymentData.status) {
      throw new Error("Respuesta de Mercado Pago inválida.");
    }

    const paymentStatus = paymentData.status;
    const paymentId = paymentData.id;

    if (paymentStatus !== "approved") {
      return buildErrorResponse(res, 400, "El pago no fue aprobado", {
        status: paymentStatus,
        status_detail: paymentData.status_detail,
        payment_id: paymentId,
      });
    }

    await client.query("BEGIN");
    transactionStarted = true;

    // ⚠️ CRITICAL: Obtener admin_id del cliente para validar acceso
    const estadosHelper = require('../../utils/estadosHelper');
    const adminClienteId = await estadosHelper.getAdminByClienteEstado(clienteIdMeta, tenant_id);
    const adminIdValidate = adminClienteId || 1;

    const clienteCreditoResult = await client.query(
      `
        SELECT credito_id, saldo_deudor
        FROM cliente_creditos
        WHERE cliente_id = $1
          AND admin_id = $2
          AND tenant_id = $3
        ORDER BY credito_id DESC
        LIMIT 1
      `,
      [clienteIdMeta, adminIdValidate, tenant_id]
    );

    if (!clienteCreditoResult.rows.length) {
      throw new Error(
        "No se encontró una línea de crédito activa para este cliente."
      );
    }

    const creditoRow = clienteCreditoResult.rows[0];
    const creditoId = creditoIdMeta || creditoRow.credito_id;
    const saldoActual = parseCurrency(creditoRow.saldo_deudor);
    const nuevoSaldo = parseCurrency(Math.max((saldoActual || 0) - amount, 0));

    await client.query(
      `
        UPDATE cliente_creditos
        SET saldo_deudor = $1, ultima_actualizacion = NOW()
        WHERE credito_id = $2
          AND admin_id = $3
          AND tenant_id = $4
      `,
      [nuevoSaldo, creditoId, adminIdValidate, tenant_id]
    );

    await client.query(
      `
        INSERT INTO credito_movimientos (
          credito_id,
          tipo_movimiento,
          monto,
          referencia_id,
          descripcion,
          saldo_despues_movimiento
        )
        VALUES ($1, 'ABONO', $2, $3, $4, $5)
      `,
      [
        creditoId,
        amount,
        `MP-${paymentId}`,
        `Pago con tarjeta aprobado (${paymentData.payment_method_id})`,
        nuevoSaldo,
      ]
    );

    await client.query("COMMIT");
    transactionStarted = false;

    return res.json({
      success: true,
      message: "Pago procesado correctamente",
      data: {
        paymentId,
        status: paymentStatus,
        montoPagado: amount,
        nuevoSaldo,
      },
    });
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK");
    }

    logger.error('Error procesando pago Mercado Pago:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });

    const mpError = error?.cause?.[0] || error?.response?.data?.cause?.[0];
    const mpMessage =
      mpError?.description ||
      error?.response?.data?.message ||
      error?.message ||
      "No se pudo procesar el pago en Mercado Pago.";

    return buildErrorResponse(
      res,
      error?.status || error?.statusCode || 500,
      mpMessage,
      {
        mercadopago: mpError || null,
      }
    );
  } finally {
    client.release();
  }
};

module.exports = {
  procesarPagoTarjeta,
};
