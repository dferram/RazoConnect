const ExcelJS = require('exceljs');
const db = require('../db');
const { format } = require('date-fns');
const path = require('path');
const fs = require('fs').promises;

/**
 * Exporta los registros de Cuentas por Cobrar a Excel y los marca como exportados
 * @param {Object} req Express request object
 * @param {Object} res Express response object
 */
async function exportarLoteCxC(req, res) {
    const client = await db.pool.connect();
    
    try {
        await client.query('BEGIN');

        // 1. Obtener pedidos a crédito pendientes agrupados por cliente (para reporte de antigüedad)
        const { rows } = await client.query(`
            WITH pedidos_pendientes AS (
                SELECT 
                    p.pedidoid,
                    p.clienteid,
                    p.fechapedido,
                    p.montototal,
                    p.fecha_vencimiento,
                    p.estatus,
                    CASE 
                        WHEN p.fecha_vencimiento IS NULL THEN 0
                        ELSE GREATEST(0, CURRENT_DATE - p.fecha_vencimiento::date)
                    END as dias_vencido,
                    c.nombre,
                    c.apellido,
                    COALESCE(ag.codigoagente, 'SIN-RUTA') as codigo_ruta
                FROM pedidos p
                INNER JOIN clientes c ON c.clienteid = p.clienteid
                LEFT JOIN agentesdeventas ag ON ag.agenteid = c.agenteid
                WHERE p.es_credito = true 
                AND COALESCE(p.pagado, false) = false
                AND p.estatus NOT IN ('Cancelado', 'Rechazado')
                ORDER BY p.clienteid, p.fechapedido
            )
            SELECT 
                clienteid,
                nombre,
                apellido,
                codigo_ruta,
                json_agg(
                    json_build_object(
                        'pedidoId', pedidoid,
                        'documento', 'F-' || pedidoid,
                        'fecha', fechapedido,
                        'fechaVencimiento', fecha_vencimiento,
                        'monto', montototal,
                        'diasVencido', dias_vencido,
                        'estatus', estatus
                    ) ORDER BY fechapedido
                ) as documentos
            FROM pedidos_pendientes
            GROUP BY clienteid, nombre, apellido, codigo_ruta
            ORDER BY nombre, apellido
        `);

        // Si no hay registros con deuda, retornar 404
        if (rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                message: 'No hay clientes con saldo pendiente para exportar'
            });
        }

        // 2. Generar ID único para el reporte
        const reporteId = `CxC-${format(new Date(), 'yyyyMMdd-HHmmss')}`;

        // 3. Crear workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Antigüedad de Saldos');

        // 4. Configurar anchos de columnas (sin encabezados automáticos)
        worksheet.getColumn(1).width = 12;  // A: ID Cliente
        worksheet.getColumn(2).width = 40;  // B: Nombre Cliente / Documento
        worksheet.getColumn(3).width = 15;  // C: Fecha
        worksheet.getColumn(4).width = 10;  // D: Días
        worksheet.getColumn(5).width = 18;  // E: 1-30 días
        worksheet.getColumn(6).width = 18;  // F: 31 o más

        // Cargar e insertar logo (dimensiones corregidas para mantener proporción)
        try {
            const logoPath = path.join(__dirname, '..', 'icon', 'Logo_Razo.png');
            const logoBuffer = await fs.readFile(logoPath);
            const imageId = workbook.addImage({
                buffer: logoBuffer,
                extension: 'png',
            });
            worksheet.addImage(imageId, {
                tl: { col: 0.1, row: 0.1 },
                ext: { width: 45, height: 45 },
                editAs: 'oneCell'
            });
        } catch (logoError) {
            console.warn('No se pudo cargar el logo:', logoError);
        }

        // Ajustar altura de filas para que el logo respire
        worksheet.getRow(1).height = 20;
        worksheet.getRow(2).height = 20;
        worksheet.getRow(3).height = 20;

        // 5. Agregar título (fila 2)
        worksheet.mergeCells('B2:E2');
        const titleCell = worksheet.getCell('B2');
        titleCell.value = 'ANTIGÜEDAD DE SALDOS';
        titleCell.font = { bold: true, size: 14 };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        
        // Fecha en la esquina superior derecha (fila 1)
        const dateCell = worksheet.getCell('F1');
        dateCell.value = format(new Date(), 'dd-MMM-yy');
        dateCell.alignment = { horizontal: 'right', vertical: 'middle' };
        
        // 6. Configurar encabezados de columnas (fila 4) - UNA SOLA VEZ
        const headerRow = worksheet.getRow(4);
        headerRow.values = ['', 'Documento', 'Fecha', 'Días', '1-30', '31 o más'];
        headerRow.font = { bold: true, size: 11 };
        headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
        headerRow.height = 20;

        // 7. Agregar datos con formato jerárquico EXACTO según imagen de referencia
        let currentRow = 6; // Empezar después de los encabezados (fila 6)
        
        rows.forEach((clienteData) => {
            const documentos = clienteData.documentos || [];
            
            // Calcular totales por rango de antigüedad
            const totales = documentos.reduce((acc, doc) => {
                const monto = parseFloat(doc.monto) || 0;
                const dias = parseInt(doc.diasVencido) || 0;
                
                acc.total += monto;
                
                if (dias >= 1 && dias <= 30) {
                    acc.dias_1_30 += monto;
                } else if (dias >= 31) {
                    acc.dias_31_mas += monto;
                }
                
                return acc;
            }, { total: 0, dias_1_30: 0, dias_31_mas: 0 });
            
            // ========== FILA CABECERA: Cliente ==========
            const clienteRow = worksheet.getRow(currentRow);
            
            // Columna A: ID Cliente con fondo dorado
            clienteRow.getCell(1).value = clienteData.clienteid;
            clienteRow.getCell(1).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFD4AF37' } // Dorado
            };
            clienteRow.getCell(1).font = { bold: true };
            clienteRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
            
            // Columna B: Nombre del Cliente con Código de Ruta (negrita, sin fondo)
            clienteRow.getCell(2).value = `${clienteData.nombre} ${clienteData.apellido} (${clienteData.codigo_ruta})`.toUpperCase();
            clienteRow.getCell(2).font = { bold: true };
            clienteRow.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };
            
            currentRow++;
            
            // ========== FILAS DETALLE: Documentos ==========
            // Capturamos la fila inicial usando lastRow
            const startRow = worksheet.lastRow.number + 1;
            
            documentos.forEach((doc) => {
                const dias = parseInt(doc.diasVencido) || 0;
                const monto = parseFloat(doc.monto) || 0;
                
                const docRow = worksheet.addRow(['']); // Agrega nueva fila
                
                // Columna B: ID Documento con color de fondo
                docRow.getCell(2).value = doc.documento;
                const docColor = getDocumentColor(doc.documento, dias);
                docRow.getCell(2).fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: docColor }
                };
                docRow.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };
                
                // Columna C: Fecha
                const fecha = doc.fecha ? format(new Date(doc.fecha), 'dd-MMM-yy') : '';
                docRow.getCell(3).value = fecha;
                docRow.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
                
                // Columna D: Días vencidos
                docRow.getCell(4).value = dias;
                docRow.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
                
                // Asignación de montos según antigüedad
                if (dias <= 30) {
                    // Columna E: 1-30 días
                    docRow.getCell(5).value = monto;
                    docRow.getCell(6).value = 0;
                } else {
                    // Columna F: 31+ días
                    docRow.getCell(5).value = 0;
                    docRow.getCell(6).value = monto;
                }
                
                // Formato de moneda para ambas columnas
                docRow.getCell(5).numFmt = '"$"#,##0.00';
                docRow.getCell(6).numFmt = '"$"#,##0.00';
                docRow.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };
                docRow.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' };
            });
            
            // ========== FILA PIE: Subtotal del Cliente ==========
            const endRow = worksheet.lastRow.number;
            
            // Agregar fila de totales
            const subtotalRow = worksheet.addRow(['']);
            
            // Columna B: Etiqueta 'TOTAL'
            subtotalRow.getCell(2).value = 'TOTAL';
            subtotalRow.getCell(2).font = { bold: true };
            subtotalRow.getCell(2).alignment = { horizontal: 'right', vertical: 'middle' };
            
            // Columna E: Total 1-30 días
            subtotalRow.getCell(5).value = {
                formula: 'SUM(E' + startRow + ':E' + endRow + ')'
            };
            subtotalRow.getCell(5).numFmt = '"$"#,##0.00';
            subtotalRow.getCell(5).font = { bold: true };
            subtotalRow.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };
            subtotalRow.getCell(5).border = {
                top: { style: 'thin' }
            };
            
            // Columna F: Total 31+ días
            subtotalRow.getCell(6).value = {
                formula: 'SUM(F' + startRow + ':F' + endRow + ')'
            };
            subtotalRow.getCell(6).numFmt = '"$"#,##0.00';
            subtotalRow.getCell(6).font = { bold: true };
            subtotalRow.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' };
            subtotalRow.getCell(6).border = {
                top: { style: 'thin' }
            };
            
            // Agregar fila en blanco después del total
            worksheet.addRow(['']);
            
            currentRow++;
            currentRow++; // Espacio entre clientes
        });
        
        // Función auxiliar para determinar color de documento según imagen
        function getDocumentColor(documento, dias) {
            // Según la imagen:
            // F-1190, F-1198 = Verde (días <= 30)
            // F-1159, R-2139 = Naranja (días 31-60 o remisiones)
            // F-1101, F-1129 = Amarillo/Mostaza (días 61-90)
            // F-1156 = Naranja oscuro (días > 90)
            // F-0796 = Cyan/Azul claro (muy antiguo)
            // F0958 = Naranja claro
            
            if (documento.startsWith('F-')) {
                if (dias <= 30) return 'FF90EE90'; // Verde
                if (dias <= 60) return 'FFFF8C00'; // Naranja oscuro
                if (dias <= 90) return 'FFD4AF37'; // Amarillo/Mostaza
                if (dias <= 365) return 'FFFF6347'; // Naranja rojizo
                return 'FF00CED1'; // Cyan para muy antiguos
            }
            if (documento.startsWith('R-')) return 'FFFF8C00'; // Naranja para remisiones
            return 'FFFFA07A'; // Naranja claro por defecto
        }

        // 8. Registrar en log el reporte generado (para auditoría)
        // 9. Commit transacción
        await client.query('COMMIT');

        // 9. Generar archivo
        const buffer = await workbook.xlsx.writeBuffer();

        // 10. Enviar respuesta
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=Reporte_CxC_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
        res.send(buffer);

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en exportación CxC:', error);
        res.status(500).json({
            message: 'Error al generar el reporte de CxC',
            error: error.message
        });
    } finally {
        client.release();
    }
}

/**
 * Obtiene métricas del dashboard de cobranza
 */
async function getMetricasCobranza(req, res) {
    const client = await db.pool.connect();
    
    try {
        // Ejecutar consultas en paralelo
        const [porCobrar, enGestion, clientesMora] = await Promise.all([
            // Saldo total pendiente (foto actual de toda la deuda)
            client.query(`
                SELECT COALESCE(SUM(saldo_deudor), 0) as total
                FROM cliente_creditos
                WHERE saldo_deudor > 0
            `),
            
            // Saldo en gestión (exportado este mes)
            client.query(`
                SELECT COALESCE(SUM(saldo_deudor), 0) as total
                FROM cliente_creditos
                WHERE saldo_deudor > 0
                AND exportado_en >= date_trunc('month', CURRENT_DATE)
            `),
            
            // Clientes en mora
            client.query(`
                SELECT COUNT(*) as total
                FROM cliente_creditos
                WHERE estado_credito = 'SUSPENDIDO'
            `)
        ]);

        res.json({
            success: true,
            data: {
                por_cobrar: porCobrar.rows[0].total,
                en_gestion: enGestion.rows[0].total,
                clientes_mora: clientesMora.rows[0].total
            }
        });

    } catch (error) {
        console.error('Error obteniendo métricas CxC:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener métricas de cobranza'
        });
    } finally {
        client.release();
    }
}

/**
 * Obtiene lista paginada de clientes con crédito
 */
async function getClientesCredito(req, res) {
    const client = await db.pool.connect();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    try {
        // Total de registros
        const { rows: [count] } = await client.query(`
            SELECT COUNT(*) as total
            FROM cliente_creditos cc
            JOIN clientes c ON c.clienteid = cc.cliente_id
            WHERE cc.saldo_deudor > 0
        `);

        // Datos paginados
        const { rows } = await client.query(`
            SELECT 
                cc.credito_id,
                cc.cliente_id,
                cc.limite_credito,
                cc.saldo_deudor,
                cc.estado_credito,
                c.nombre,
                c.apellido,
                c.email,
                COALESCE(cc.ultimo_movimiento, cc.fecha_creacion) as ultimo_movimiento
            FROM cliente_creditos cc
            JOIN clientes c ON c.clienteid = cc.cliente_id
            WHERE cc.saldo_deudor > 0
            ORDER BY cc.estado_credito DESC, cc.saldo_deudor DESC
            LIMIT $1 OFFSET $2
        `, [limit, offset]);

        const totalPages = Math.ceil(count.total / limit);

        res.json({
            success: true,
            data: rows,
            totalRecords: parseInt(count.total),
            totalPages,
            currentPage: page
        });

    } catch (error) {
        console.error('Error obteniendo clientes:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener lista de clientes'
        });
    } finally {
        client.release();
    }
}

async function obtenerPagosPendientes(req, res) {
    try {
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
            INNER JOIN clientes c ON c.clienteid = pc.cliente_id
            LEFT JOIN cliente_creditos cc ON cc.cliente_id = pc.cliente_id AND cc.estado_credito = 'ACTIVO'
            WHERE pc.estatus = 'PENDIENTE'
            ORDER BY pc.fecha_pago DESC
        `);

        return res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('Error obteniendo pagos pendientes:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al obtener pagos pendientes'
        });
    }
}

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
            'SELECT * FROM pagos_clientes WHERE pago_id = $1',
            [id]
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
            const { rows: [credito] } = await client.query(
                'SELECT credito_id, saldo_deudor FROM cliente_creditos WHERE cliente_id = $1 AND estado_credito = \'ACTIVO\'',
                [pago.cliente_id]
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
                'UPDATE cliente_creditos SET saldo_deudor = $1, ultima_actualizacion = CURRENT_TIMESTAMP WHERE credito_id = $2',
                [nuevoSaldo, credito.credito_id]
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
                ORDER BY fechapedido ASC
            `, [pago.cliente_id]);

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
        console.error('Error gestionando pago:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al procesar la solicitud'
        });
    } finally {
        client.release();
    }
}

async function obtenerHistorialMovimientos(req, res) {
    const limit = parseInt(req.query.limit) || 100;

    try {
        const { rows } = await db.query(`
            SELECT 
                cm.movimiento_id,
                cm.tipo_movimiento,
                cm.monto,
                cm.referencia_id,
                cm.descripcion,
                cm.fecha_movimiento,
                cm.saldo_despues_movimiento,
                c.clienteid,
                c.nombre,
                c.apellido,
                c.email,
                cc.credito_id
            FROM credito_movimientos cm
            INNER JOIN cliente_creditos cc ON cc.credito_id = cm.credito_id
            INNER JOIN clientes c ON c.clienteid = cc.cliente_id
            ORDER BY cm.fecha_movimiento DESC
            LIMIT $1
        `, [limit]);

        return res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('Error obteniendo historial de movimientos:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al obtener el historial de movimientos'
        });
    }
}

module.exports = {
    exportarLoteCxC,
    getMetricasCobranza,
    getClientesCredito,
    obtenerPagosPendientes,
    gestionarPago,
    obtenerHistorialMovimientos
};
