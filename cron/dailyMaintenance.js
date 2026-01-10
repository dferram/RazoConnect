const cron = require("node-cron");
const db = require("../db");
const { mantenimientoDiarioDeudas } = require('./debtExpirationService');

const DAILY_SCHEDULE = "0 8 * * *"; // Todos los días a las 8:00 AM

const formatCurrency = (amount) => Number.parseFloat(amount || 0).toFixed(2);

const sendDueSoonNotifications = async () => {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    const pedidosResult = await client.query(
      `
        SELECT
          pedidoid,
          clienteid,
          montototal
        FROM public.pedidos
        WHERE es_credito = true
          AND pagado = false
          AND DATE(fecha_vencimiento) = DATE(CURRENT_DATE + INTERVAL '3 days')
      `
    );

    if (pedidosResult.rows.length === 0) {
      await client.query("COMMIT");
      return;
    }

    const insertValues = [];
    const insertParams = [];
    let paramIndex = 1;

    for (const pedido of pedidosResult.rows) {
      if (!pedido.clienteid) continue;

      const metadata = JSON.stringify({
        pedidoid: pedido.pedidoid,
        monto: Number.parseFloat(pedido.montototal || 0),
      });

      insertValues.push(
        `(DEFAULT, $${paramIndex++}, 'sistema', $${paramIndex++}, $${paramIndex++}, DEFAULT, DEFAULT, $${paramIndex++}, DEFAULT, 'alta', NULL, NULL)`
      );
      insertParams.push(
        pedido.clienteid,
        "Recordatorio de Pago",
        `Tu pago del pedido #${pedido.pedidoid} vence en 3 días`,
        metadata
      );
    }

    if (insertValues.length) {
      await client.query(
        `
          INSERT INTO public.notificaciones (
            notificacionid,
            clienteid,
            tipo,
            titulo,
            mensaje,
            leida,
            fechacreacion,
            metadata,
            url,
            prioridad,
            administrador_id,
            agente_id
          )
          VALUES ${insertValues.join(", ")}
        `,
        insertParams
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await db.pool.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const notifyAdminSuspensions = async (total) => {
  await db.query(
    `
      INSERT INTO public.notificaciones (
        notificacionid,
        clienteid,
        tipo,
        titulo,
        mensaje,
        leida,
        fechacreacion,
        metadata,
        url,
        prioridad,
        administrador_id,
        agente_id
      ) VALUES (
        DEFAULT,
        NULL,
        'sistema',
        'Reporte Diario',
        $1,
        DEFAULT,
        DEFAULT,
        '{"evento":"suspension_credito"}',
        NULL,
        'normal',
        2,
        NULL
      )
    `,
    [`Reporte Diario: Se han suspendido ${total} cuentas por falta de pago.`]
  );
};

const suspendDelinquentClients = async () => {
  const { rows } = await db.query(
    "SELECT public.suspender_clientes_morosos() AS total_suspendidos"
  );
  const total = Number.parseInt(rows[0]?.total_suspendidos || 0, 10);

  if (total > 0) {
    console.info(
      `[Mantenimiento] Se suspendieron ${total} cuentas por morosidad.`
    );
    await notifyAdminSuspensions(total);
  }
};

const runDailyMaintenance = async () => {
  try {
    console.info("[CRON] Ejecutando mantenimiento diario de crédito...");
    
    await mantenimientoDiarioDeudas();
    
    await sendDueSoonNotifications();
    await suspendDelinquentClients();
    
    console.info("[CRON] Mantenimiento diario completado.");
  } catch (error) {
    console.error("[CRON] Error durante mantenimiento diario:", error);
  }
};

const scheduleDailyMaintenance = () => {
  cron.schedule(DAILY_SCHEDULE, runDailyMaintenance, {
    timezone: "America/Mexico_City",
  });
  console.info(
    `[CRON] Mantenimiento diario programado (${DAILY_SCHEDULE}) - Hora local MX`
  );
};

module.exports = {
  runDailyMaintenance,
  scheduleDailyMaintenance,
};
