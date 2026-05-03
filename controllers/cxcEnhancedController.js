const db = require('../db');
const logger = require('../utils/logger');
const estadosHelper = require('../utils/estadosHelper');

/**
 * Obtiene resumen de CxC con desglose de antigüedad (Aging Report)
 * Calcula: Saldo Total, Al Corriente, Vencido 1-30 días, Vencido +30 días
 */
async function getCxcSummaryWithAging(req, res) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const userAdminId = req.user?.adminId || req.user?.userId;
    const tenantId = req.tenant?.tenant_id || 1;

    const client = await db.pool.connect();

    try {
        // Contar total de clientes con deuda
        const { rows: [countResult] } = await client.query(`
            SELECT COUNT(DISTINCT cc.cliente_id) as total
            FROM cliente_creditos cc
            WHERE cc.saldo_deudor > 0
              AND cc.admin_id = $1
              AND cc.tenant_id = $2
        `, [userAdminId, tenantId]);

        const totalRecords = parseInt(countResult.total);
        const totalPages = Math.ceil(totalRecords / limit);

        // Consulta principal con desglose de antigüedad
        const { rows } = await client.query(`
            WITH pedidos_aging AS (
                SELECT
                    p.clienteid,
                    p.pedidoid,
                    p.montototal,
                    COALESCE(p.saldo_pendiente, p.montototal) as saldo_pedido,
                    p.fecha_vencimiento,
                    p.fechapedido,
                    p.estatus_deuda,
                    CASE
                        WHEN p.fecha_vencimiento IS NULL THEN 0
                        WHEN p.fecha_vencimiento::date > CURRENT_DATE THEN 0
                        ELSE CURRENT_DATE - p.fecha_vencimiento::date
                    END as dias_vencido
                FROM pedidos p
                WHERE p.es_credito = true
                  AND p.pagado = false
                  AND COALESCE(p.saldo_pendiente, p.montototal) > 0
                  AND p.estatus NOT IN ('Cancelado', 'Rechazado')
                  AND p.tenant_id = $3
            ),
            aging_buckets AS (
                SELECT
                    clienteid,
                    SUM(saldo_pedido) as saldo_total,
                    SUM(CASE WHEN dias_vencido = 0 THEN saldo_pedido ELSE 0 END) as al_corriente,
                    SUM(CASE WHEN dias_vencido >= 1 AND dias_vencido <= 30 THEN saldo_pedido ELSE 0 END) as vencido_1_30,
                    SUM(CASE WHEN dias_vencido > 30 THEN saldo_pedido ELSE 0 END) as vencido_mas_30,
                    MAX(dias_vencido) as max_dias_vencido
                FROM pedidos_aging
                GROUP BY clienteid
            )
            SELECT
                cc.credito_id as "creditoId",
                cc.cliente_id as "clienteId",
                c.nombre as "clienteNombre",
                c.apellido,
                c.email,
                cc.limite_credito as "limiteCredito",
                cc.saldo_deudor as "saldoDeudor",
                (cc.limite_credito - cc.saldo_deudor) as disponible,
                cc.estado_credito as estado,
                COALESCE(ab.al_corriente, 0) as "alCorriente",
                COALESCE(ab.vencido_1_30, 0) as "vencido1a30",
                COALESCE(ab.vencido_mas_30, 0) as "vencidoMas30",
                COALESCE(ab.max_dias_vencido, 0) as "maxDiasVencido",
                cc.dias_gracia as "diasCreditoPersonalizado",
                cc.ultima_actualizacion as "ultimoMovimiento",
                (
                    SELECT cm.descripcion
                    FROM credito_movimientos cm
                    WHERE cm.credito_id = cc.credito_id
                      AND cm.admin_id = $1
                    ORDER BY cm.fecha_movimiento DESC
                    LIMIT 1
                ) as "ultimoMovimientoDescripcion"
            FROM cliente_creditos cc
            INNER JOIN clientes c ON c.clienteid = cc.cliente_id
            LEFT JOIN aging_buckets ab ON ab.clienteid = cc.cliente_id
            WHERE cc.saldo_deudor > 0
              AND cc.admin_id = $1
              AND cc.tenant_id = $3
            ORDER BY
                CASE
                    WHEN cc.estado_credito = 'SUSPENDIDO' THEN 1
                    WHEN COALESCE(ab.vencido_mas_30, 0) > 0 THEN 2
                    WHEN COALESCE(ab.vencido_1_30, 0) > 0 THEN 3
                    ELSE 4
                END,
                cc.saldo_deudor DESC
            LIMIT $2 OFFSET $4
        `, [userAdminId, limit, tenantId, offset]);

        // Calcular KPIs globales
        const { rows: [kpis] } = await client.query(`
            WITH pedidos_aging AS (
                SELECT
                    p.clienteid,
                    COALESCE(p.saldo_pendiente, p.montototal) as saldo_pedido,
                    CASE
                        WHEN p.fecha_vencimiento IS NULL THEN 0
                        WHEN p.fecha_vencimiento::date > CURRENT_DATE THEN 0
                        ELSE CURRENT_DATE - p.fecha_vencimiento::date
                    END as dias_vencido
                FROM pedidos p
                WHERE p.es_credito = true
                  AND p.pagado = false
                  AND COALESCE(p.saldo_pendiente, p.montototal) > 0
                  AND p.estatus NOT IN ('Cancelado', 'Rechazado')
                  AND p.tenant_id = $2
            )
            SELECT
                COALESCE(SUM(cc.saldo_deudor), 0) as total_cobrar,
                COALESCE(SUM(CASE WHEN pa.dias_vencido > 0 THEN pa.saldo_pedido ELSE 0 END), 0) as total_vencido,
                COUNT(DISTINCT cc.cliente_id) as conteo_clientes
            FROM cliente_creditos cc
            LEFT JOIN pedidos_aging pa ON pa.clienteid = cc.cliente_id
            WHERE cc.saldo_deudor > 0
              AND cc.admin_id = $1
              AND cc.tenant_id = $2
        `, [userAdminId, tenantId]);

        return res.json({
            success: true,
            data: {
                cartera: rows,
                totalCobrar: parseFloat(kpis.total_cobrar) || 0,
                totalVencido: parseFloat(kpis.total_vencido) || 0,
                conteoClientes: parseInt(kpis.conteo_clientes) || 0,
                currentPage: page,
                totalPages,
                totalRecords
            }
        });

    } catch (error) {
        logger.error('Error obteniendo CxC con aging:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
        return res.status(500).json({
            success: false,
            message: 'Error al obtener el resumen de cuentas por cobrar'
        });
    } finally {
        client.release();
    }
}

/**
 * Obtiene el estado de cuenta detallado de un cliente (Drill-down)
 * Incluye: Pedidos pendientes + Últimos 5 abonos
 */
async function getEstadoCuentaCliente(req, res) {
    const { clienteId } = req.params;
    const userAdminId = req.user?.adminId || req.user?.userId;
    const tenantId = req.tenant?.tenant_id || 1;

    if (!clienteId) {
        return res.status(400).json({
            success: false,
            message: 'ID de cliente requerido'
        });
    }

    const client = await db.pool.connect();

    try {
        // Información del cliente y crédito
        const { rows: [clienteInfo] } = await client.query(`
            SELECT
                c.clienteid,
                c.nombre,
                c.apellido,
                c.email,
                c.telefono,
                cc.credito_id,
                cc.limite_credito,
                cc.saldo_deudor,
                cc.estado_credito,
                cc.dias_gracia as dias_credito_personalizado,
                cc.ultima_actualizacion as ultimo_movimiento
            FROM clientes c
            INNER JOIN cliente_creditos cc ON cc.cliente_id = c.clienteid
            WHERE c.clienteid = $1
              AND cc.admin_id = $2
              AND cc.tenant_id = $3
        `, [clienteId, userAdminId, tenantId]);

        if (!clienteInfo) {
            return res.status(404).json({
                success: false,
                message: 'Cliente no encontrado o sin acceso'
            });
        }

        // Pedidos pendientes con desglose de antigüedad
        const { rows: pedidos } = await client.query(`
            SELECT
                p.pedidoid,
                p.fechapedido,
                p.montototal,
                COALESCE(p.saldo_pendiente, p.montototal) as saldo_pendiente,
                p.fecha_vencimiento,
                p.estatus,
                p.estatus_deuda,
                CASE
                    WHEN p.fecha_vencimiento IS NULL THEN 0
                    WHEN p.fecha_vencimiento::date > CURRENT_DATE THEN 0
                    ELSE CURRENT_DATE - p.fecha_vencimiento::date
                END as dias_vencido,
                CASE
                    WHEN p.fecha_vencimiento IS NULL THEN 'Sin vencimiento'
                    WHEN p.fecha_vencimiento::date > CURRENT_DATE THEN 'Al corriente'
                    WHEN CURRENT_DATE - p.fecha_vencimiento::date <= 30 THEN 'Vencido 1-30 días'
                    ELSE 'Vencido +30 días'
                END as categoria_aging
            FROM pedidos p
            WHERE p.clienteid = $1
              AND p.es_credito = true
              AND p.pagado = false
              AND COALESCE(p.saldo_pendiente, p.montototal) > 0
              AND p.estatus NOT IN ('Cancelado', 'Rechazado')
              AND p.tenant_id = $2
            ORDER BY p.fecha_vencimiento ASC NULLS LAST, p.fechapedido ASC
        `, [clienteId, tenantId]);

        // Cargos confirmados (CARGO con remision_id) para calcular reserva pendiente
        const { rows: [balanceRow] } = await client.query(`
            SELECT
                COALESCE(SUM(CASE WHEN tipo_movimiento = 'CARGO' AND remision_id IS NOT NULL THEN monto ELSE 0 END), 0) AS cargo_confirmado,
                COUNT(DISTINCT CASE WHEN tipo_movimiento = 'CARGO' AND remision_id IS NOT NULL THEN remision_id END)     AS remisiones_facturadas
            FROM credito_movimientos
            WHERE credito_id = $1
        `, [clienteInfo.credito_id]);

        const saldoTotal     = parseFloat(clienteInfo.saldo_deudor || 0);
        const cargoConf      = parseFloat(balanceRow.cargo_confirmado || 0);
        const reservaPend    = Math.max(saldoTotal - cargoConf, 0);

        // Últimos movimientos (CARGO por remision + ABONO/PAGO)
        const { rows: movimientos } = await client.query(`
            SELECT
                cm.movimiento_id,
                cm.tipo_movimiento,
                cm.monto,
                cm.referencia_id,
                cm.descripcion,
                cm.fecha_movimiento,
                cm.saldo_despues_movimiento,
                cm.remision_id,
                cm.pedido_id,
                r.folio             AS remision_folio,
                r.total_remision    AS remision_monto,
                COALESCE(a.nombre, 'Sistema') AS registrado_por
            FROM credito_movimientos cm
            LEFT JOIN administradores a ON a.adminid = cm.admin_id
            LEFT JOIN remisiones r ON r.remision_id = cm.remision_id
            WHERE cm.credito_id = $1
              AND cm.tipo_movimiento IN ('CARGO', 'ABONO', 'PAGO', 'RESERVA')
            ORDER BY cm.fecha_movimiento DESC
            LIMIT 20
        `, [clienteInfo.credito_id]);

        return res.json({
            success: true,
            data: {
                cliente: clienteInfo,
                balance: {
                    saldoTotal,
                    cargoConfirmado: cargoConf,
                    reservaPendiente: reservaPend,
                    creditoDisponible: Math.max(parseFloat(clienteInfo.limite_credito || 0) - saldoTotal, 0),
                    remisionesFacturadas: parseInt(balanceRow.remisiones_facturadas || 0, 10)
                },
                pedidos,
                movimientos
            }
        });

    } catch (error) {
        logger.error('Error obteniendo estado de cuenta:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
        return res.status(500).json({
            success: false,
            message: 'Error al obtener el estado de cuenta'
        });
    } finally {
        client.release();
    }
}

/**
 * Registra un pago manual con transacción atómica
 * Pasos: 1) INSERT pagos_clientes, 2) UPDATE cliente_creditos,
 *        3) INSERT credito_movimientos, 4) INSERT log_movimientos
 */
async function registrarPagoManual(req, res) {
    const { creditoId, monto, metodoPago, referencia, notas } = req.body;
    const adminId = req.user?.admin_responsable_id ?? req.user?.adminid;
    const adminNombre = req.user?.nombre || 'Admin';
    const adminRol = req.user?.rol || 'admin';
    const tenantId = req.tenant?.tenant_id || 1;

    // Validaciones
    if (!creditoId || !monto || !metodoPago) {
        return res.status(400).json({
            success: false,
            message: 'Faltan campos requeridos: creditoId, monto, metodoPago'
        });
    }

    const montoNumerico = parseFloat(monto);
    if (isNaN(montoNumerico) || montoNumerico <= 0) {
        return res.status(400).json({
            success: false,
            message: 'El monto debe ser un número positivo'
        });
    }

    const metodosValidos = ['EFECTIVO', 'TRANSFERENCIA', 'CHEQUE', 'TARJETA'];
    if (!metodosValidos.includes(metodoPago.toUpperCase())) {
        return res.status(400).json({
            success: false,
            message: `Método de pago inválido. Opciones: ${metodosValidos.join(', ')}`
        });
    }

    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        // Obtener información del crédito - CON VALIDACIÓN DE ADMIN
        const { rows: [credito] } = await client.query(`
            SELECT
                cc.credito_id,
                cc.cliente_id,
                cc.saldo_deudor,
                cc.limite_credito,
                c.nombre,
                c.apellido,
                c.email
            FROM cliente_creditos cc
            INNER JOIN clientes c ON c.clienteid = cc.cliente_id
            WHERE cc.credito_id = $1
              AND cc.admin_id = $2
              AND cc.tenant_id = $3
        `, [creditoId, adminId, tenantId]);

        if (!credito) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                message: 'Crédito no encontrado o no tiene permiso para modificarlo'
            });
        }

        if (montoNumerico > credito.saldo_deudor) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                message: `El monto ($${montoNumerico.toFixed(2)}) excede el saldo deudor ($${credito.saldo_deudor})`
            });
        }

        // PASO 1: INSERT en pagos_clientes (estatus='APROBADO', validado_por=admin_actual)
        const { rows: [pagoCreado] } = await client.query(`
            INSERT INTO pagos_clientes (
                cliente_id,
                monto,
                tipo_pago,
                referencia_bancaria,
                estatus,
                fecha_pago,
                validado_por,
                fecha_validacion,
                notas,
                admin_id,
                tenant_id
            ) VALUES ($1, $2, $3, $4, 'APROBADO', CURRENT_TIMESTAMP, $5, CURRENT_TIMESTAMP, $6, $7, $8)
            RETURNING pago_id
        `, [
            credito.cliente_id,
            montoNumerico,
            metodoPago.toUpperCase(),
            referencia || `MANUAL-${Date.now()}`,
            adminId,
            notas || 'Pago manual registrado por administrador',
            adminId,
            tenantId
        ]);

        const pagoId = pagoCreado.pago_id;

        // PASO 2: UPDATE en cliente_creditos CON VALIDACIÓN DE ADMIN
        const nuevoSaldo = Math.max(0, parseFloat(credito.saldo_deudor) - montoNumerico);

        await client.query(`
            UPDATE cliente_creditos
            SET saldo_deudor = $1,
                ultima_actualizacion = CURRENT_TIMESTAMP
            WHERE credito_id = $2
              AND admin_id = $3
              AND tenant_id = $4
        `, [nuevoSaldo, creditoId, adminId, tenantId]);

        // PASO 3: INSERT en credito_movimientos (Tipo: 'ABONO', para el historial)
        await client.query(`
            INSERT INTO credito_movimientos (
                credito_id,
                tipo_movimiento,
                monto,
                referencia_id,
                descripcion,
                saldo_despues_movimiento,
                registrado_por,
                admin_id
            ) VALUES ($1, 'ABONO', $2, $3, $4, $5, $6, $6)
        `, [
            creditoId,
            montoNumerico,
            `PAGO-${pagoId}`,
            `Pago manual ${metodoPago} (Ref: ${referencia || 'N/A'}) - Registrado por ${adminNombre}`,
            nuevoSaldo,
            adminId
        ]);

        // PASO 4: INSERT en log_movimientos (BITÁCORA DE SEGURIDAD)
        await client.query(`
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
            ) VALUES ($1, $2, $3, 'CREAR', 'PAGO_MANUAL', $4, $5, $6, $7)
        `, [
            adminId,
            adminNombre,
            adminRol,
            pagoId,
            JSON.stringify({
                tipo: 'Pago Manual Admin',
                cliente: `${credito.nombre} ${credito.apellido}`,
                clienteId: credito.cliente_id,
                monto: montoNumerico,
                metodoPago: metodoPago.toUpperCase(),
                referencia: referencia || 'N/A',
                saldoAnterior: credito.saldo_deudor,
                saldoNuevo: nuevoSaldo,
                creditoId: creditoId
            }),
            req.ip || req.connection?.remoteAddress || 'unknown',
            tenantId
        ]);

        // ========== LÓGICA FIFO: DISTRIBUCIÓN DE PAGO A PEDIDOS INDIVIDUALES ==========
        const { rows: pedidosConDeuda } = await client.query(`
            SELECT
                pedidoid,
                COALESCE(saldo_pendiente, montototal) as saldo_pendiente,
                montototal
            FROM pedidos
            WHERE clienteid = $1
              AND es_credito = true
              AND pagado = false
              AND COALESCE(saldo_pendiente, montototal) > 0
              AND tenant_id = $2
            ORDER BY fechapedido ASC
        `, [credito.cliente_id, tenantId]);

        let remanente = montoNumerico;

        for (const pedido of pedidosConDeuda) {
            if (remanente <= 0) break;

            const saldoPendiente = parseFloat(pedido.saldo_pendiente);
            const montoAplicar = Math.min(remanente, saldoPendiente);
            const nuevoSaldoPedido = Math.max(0, saldoPendiente - montoAplicar);
            const pedidoLiquidado = nuevoSaldoPedido < 0.01;

            await client.query(`
                UPDATE pedidos
                SET saldo_pendiente = $1,
                    pagado = $2
                WHERE pedidoid = $3
                  AND tenant_id = $4
            `, [nuevoSaldoPedido, pedidoLiquidado, pedido.pedidoid, tenantId]);

            remanente -= montoAplicar;
        }

        await client.query('COMMIT');

        return res.json({
            success: true,
            message: 'Pago registrado exitosamente',
            data: {
                pagoId,
                creditoId,
                montoAplicado: montoNumerico,
                saldoAnterior: credito.saldo_deudor,
                saldoNuevo: nuevoSaldo,
                cliente: `${credito.nombre} ${credito.apellido}`
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Error registrando pago manual:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
        return res.status(500).json({
            success: false,
            message: 'Error al registrar el pago'
        });
    } finally {
        client.release();
    }
}

module.exports = {
    getCxcSummaryWithAging,
    getEstadoCuentaCliente,
    registrarPagoManual
};
