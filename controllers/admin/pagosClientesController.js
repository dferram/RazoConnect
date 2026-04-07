const db = require('../../db');
const logger = require('../../utils/logger');

/**
 * CONTROLADOR: Pagos de Clientes (tabla pagos_clientes)
 * 
 * Propósito: Gestionar pagos generales que los clientes hacen para liquidar su saldo deudor.
 * Estos pagos NO están asociados a un pedido específico, sino que son abonos al crédito general.
 * 
 * Diferencia con pagosController.js:
 * - pagosController.js → Valida transferencias de PEDIDOS específicos (tabla: pedidos)
 * - pagosClientesController.js → Valida pagos generales de CLIENTES (tabla: pagos_clientes)
 */

/**
 * Obtiene la lista de pagos de clientes pendientes de validación
 * @route GET /api/admin/pagos-clientes/pendientes
 */
async function obtenerPagosPendientes(req, res) {
    try {
        const tenant_id = req.tenant?.tenant_id || 1;
        const adminId = req.user?.adminId || req.user?.userId;

        const { rows } = await db.query(`
            SELECT
                pc.pago_id,
                pc.cliente_id,
                pc.monto,
                pc.tipo_pago,
                pc.comprobante_url,
                pc.referencia_bancaria,
                pc.transaccion_id,
                pc.fecha_pago,
                pc.movimientos_aplicados,
                c.nombre,
                c.apellido,
                c.email,
                cc.credito_id,
                cc.saldo_deudor
            FROM pagos_clientes pc
            INNER JOIN clientes c ON c.clienteid = pc.cliente_id AND c.tenant_id = $1
            LEFT JOIN cliente_creditos cc ON cc.cliente_id = pc.cliente_id
              AND cc.estado_credito = 'ACTIVO'
              AND cc.tenant_id = $1
              AND cc.admin_id = $2
            WHERE pc.estatus = 'PENDIENTE'
              AND pc.tenant_id = $1
              AND pc.admin_id = $2
            ORDER BY pc.fecha_pago DESC
        `, [tenant_id, adminId]);

        return res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        logger.error('Error obteniendo pagos de clientes pendientes:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
        return res.status(500).json({
            success: false,
            message: 'Error al obtener pagos pendientes'
        });
    }
}

/**
 * Gestiona (aprueba o rechaza) un pago de cliente
 * @route POST /api/admin/pagos-clientes/:id/gestionar
 */
async function gestionarPago(req, res) {
    const { id } = req.params;
    const { accion, motivo } = req.body;
    const adminId = req.user?.adminId || req.user?.userId;

    if (!accion || !['aprobar', 'rechazar'].includes(accion)) {
        return res.status(400).json({
            success: false,
            message: 'Acción inválida. Debe ser "aprobar" o "rechazar"'
        });
    }

    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        const { rows: [pago] } = await client.query(
            'SELECT pago_id, cliente_id, credito_id, monto, tipo_pago, estatus, comprobante_url, referencia_bancaria, transaccion_id, movimientos_aplicados, tenant_id FROM pagos_clientes WHERE pago_id = $1 AND tenant_id = $2',
            [id, req.tenant?.tenant_id]
        );

        if (!pago) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                message: 'Pago no encontrado'
            });
        }

        if (pago.estatus !== 'PENDIENTE') {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                message: `Este pago ya fue ${pago.estatus.toLowerCase()}`
            });
        }

        if (accion === 'aprobar') {
            // ⚠️ CRITICAL: Obtener admin_id del cliente para validar pertenencia
            const estadosHelper = require('../../../utils/estadosHelper');
            const adminClienteId = await estadosHelper.getAdminByClienteEstado(pago.cliente_id, req.tenant?.tenant_id);
            const adminIdValidate = adminClienteId || 1;

            const { rows: [credito] } = await client.query(
                'SELECT credito_id, saldo_deudor FROM cliente_creditos WHERE cliente_id = $1 AND admin_id = $2 AND estado_credito = \'ACTIVO\' AND tenant_id = $3',
                [pago.cliente_id, adminIdValidate, req.tenant?.tenant_id]
            );

            if (!credito) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    success: false,
                    message: 'El cliente no tiene un crédito activo'
                });
            }

            const nuevoSaldo = Math.max(0, parseFloat(credito.saldo_deudor) - parseFloat(pago.monto));

            await client.query(
                'UPDATE cliente_creditos SET saldo_deudor = $1, ultima_actualizacion = CURRENT_TIMESTAMP WHERE credito_id = $2 AND admin_id = $3 AND tenant_id = $4',
                [nuevoSaldo, credito.credito_id, adminIdValidate, req.tenant?.tenant_id]
            );

            // ========== ALGORITMO DE CONCILIACIÓN: HERENCIA DE REFERENCIA ========== 
            // Obtener los IDs de los movimientos (cargos) que el cliente quiso pagar
            let movimientosAplicados = [];
            try {
                movimientosAplicados = JSON.parse(pago.movimientos_aplicados || '[]');
            } catch (e) {
                console.warn(`[PAGO-${pago.pago_id}] Error parseando movimientos_aplicados:`, e);
                movimientosAplicados = [];
            }

            if (movimientosAplicados.length > 0) {
                // Obtener los cargos originales con su referencia_id y monto
                const { rows: cargosOriginales } = await client.query(`
                    SELECT 
                        movimiento_id,
                        referencia_id,
                        monto,
                        descripcion
                    FROM credito_movimientos
                    WHERE movimiento_id = ANY($1::int[])
                      AND tipo_movimiento IN ('CARGO', 'CREDITO', 'COMPRA')
                    ORDER BY fecha_movimiento ASC
                `, [movimientosAplicados]);

                if (cargosOriginales.length === 0) {
                    console.warn(`[PAGO-${pago.pago_id}] No se encontraron cargos originales para los IDs proporcionados`);
                }

                // Calcular el saldo pendiente de cada cargo (cargo - abonos previos)
                const cargosConSaldo = [];
                for (const cargo of cargosOriginales) {
                    // Obtener el total de abonos previos para este referencia_id
                    const { rows: [abonosPrevios] } = await client.query(`
                        SELECT COALESCE(SUM(monto), 0) as total_abonado
                        FROM credito_movimientos
                        WHERE credito_id = $1
                          AND referencia_id = $2
                          AND tipo_movimiento IN ('ABONO', 'PAGO')
                    `, [credito.credito_id, cargo.referencia_id]);

                    const saldoPendiente = parseFloat(cargo.monto) - parseFloat(abonosPrevios.total_abonado);
                    
                    if (saldoPendiente > 0.01) { // Tolerancia de centavos
                        cargosConSaldo.push({
                            ...cargo,
                            saldoPendiente
                        });
                    }
                }

                // Distribuir el monto del pago entre los cargos pendientes
                let montoRestante = parseFloat(pago.monto);
                
                for (const cargo of cargosConSaldo) {
                    if (montoRestante <= 0) break;

                    // Determinar cuánto abonar a este cargo (mínimo entre saldo pendiente y monto restante)
                    const montoAbono = Math.min(cargo.saldoPendiente, montoRestante);
                    
                    // Insertar ABONO con el MISMO referencia_id del cargo original (CLAVE DE LA CONCILIACIÓN)
                    await client.query(`
                        INSERT INTO credito_movimientos 
                            (credito_id, tipo_movimiento, monto, referencia_id, descripcion, saldo_despues_movimiento, registrado_por, admin_id)
                        VALUES 
                            ($1, 'ABONO', $2, $3, $4, $5, $6, $6)
                    `, [
                        credito.credito_id,
                        montoAbono,
                        cargo.referencia_id, // ← HERENCIA DE REFERENCIA: Usar el mismo ID del cargo (ej: "PED-9")
                        `Abono a ${cargo.referencia_id} (Pago PAGO-${pago.pago_id}, Ref: ${pago.referencia_bancaria || pago.transaccion_id || 'N/A'})`,
                        nuevoSaldo,
                        adminId
                    ]);

                    montoRestante -= montoAbono;
                }

                // Si sobra dinero (pago mayor a deuda), crear un abono genérico
                if (montoRestante > 0.01) {
                    await client.query(`
                        INSERT INTO credito_movimientos 
                            (credito_id, tipo_movimiento, monto, referencia_id, descripcion, saldo_despues_movimiento, registrado_por, admin_id)
                        VALUES 
                            ($1, 'ABONO', $2, $3, $4, $5, $6, $6)
                    `, [
                        credito.credito_id,
                        montoRestante,
                        `PAGO-${pago.pago_id}`,
                        `Saldo a favor por pago excedente (Ref: ${pago.referencia_bancaria || pago.transaccion_id || 'N/A'})`,
                        nuevoSaldo,
                        adminId
                    ]);
                }

            } else {
                // Si no hay movimientos aplicados, crear un abono genérico (pago sin asignación específica)
                await client.query(`
                    INSERT INTO credito_movimientos 
                        (credito_id, tipo_movimiento, monto, referencia_id, descripcion, saldo_despues_movimiento, registrado_por, admin_id)
                    VALUES 
                        ($1, 'ABONO', $2, $3, $4, $5, $6, $6)
                `, [
                    credito.credito_id,
                    pago.monto,
                    `PAGO-${pago.pago_id}`,
                    `Pago genérico sin asignación específica (Ref: ${pago.referencia_bancaria || pago.transaccion_id || 'N/A'})`,
                    nuevoSaldo,
                    adminId
                ]);
            }

            await client.query(
                'UPDATE pagos_clientes SET estatus = \'APROBADO\', fecha_validacion = CURRENT_TIMESTAMP, validado_por = $1 WHERE pago_id = $2',
                [adminId, id]
            );

            // ========== LÓGICA FIFO: DISTRIBUCIÓN DE PAGO A PEDIDOS INDIVIDUALES ==========
            // Obtener pedidos a crédito del cliente con deuda pendiente, ordenados por fecha (FIFO)
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
            `, [pago.cliente_id, req.tenant?.tenant_id]);

            // Distribuir el monto del pago entre los pedidos más antiguos primero
            let remanente = parseFloat(pago.monto);
            
            for (const pedido of pedidosConDeuda) {
                if (remanente <= 0) break;

                const saldoPendiente = parseFloat(pedido.saldo_pendiente);
                const montoAplicar = Math.min(remanente, saldoPendiente);
                const nuevoSaldoPedido = Math.max(0, saldoPendiente - montoAplicar);
                const pedidoLiquidado = nuevoSaldoPedido < 0.01; // Tolerancia de centavos

                // Actualizar saldo_pendiente del pedido y marcarlo como pagado si se liquidó
                await client.query(`
                    UPDATE pedidos
                    SET saldo_pendiente = $1,
                        pagado = $2
                    WHERE pedidoid = $3
                `, [nuevoSaldoPedido, pedidoLiquidado, pedido.pedidoid]);

                remanente -= montoAplicar;
            }

            await client.query('COMMIT');

            return res.json({
                success: true,
                message: 'Pago aprobado exitosamente',
                data: {
                    pagoId: pago.pago_id,
                    nuevoSaldo,
                    movimientosCreados: movimientosAplicados.length
                }
            });

        } else if (accion === 'rechazar') {
            await client.query(
                'UPDATE pagos_clientes SET estatus = \'RECHAZADO\', fecha_validacion = CURRENT_TIMESTAMP, validado_por = $1, notas = $2 WHERE pago_id = $3',
                [adminId, motivo || 'Comprobante no válido', id]
            );

            await client.query('COMMIT');

            return res.json({
                success: true,
                message: 'Pago rechazado',
                data: {
                    pagoId: pago.pago_id
                }
            });
        }

    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Error gestionando pago de cliente:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
        return res.status(500).json({
            success: false,
            message: 'Error al procesar la solicitud'
        });
    } finally {
        client.release();
    }
}

module.exports = {
    obtenerPagosPendientes,
    gestionarPago
};
