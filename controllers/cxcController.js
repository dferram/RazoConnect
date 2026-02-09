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
                AND ultima_actualizacion >= date_trunc('month', CURRENT_DATE)
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

// FUNCIÓN REMOVIDA: obtenerPagosPendientes
// Esta funcionalidad se movió a admin-validar-pagos.html
// La validación de pagos de transferencias debe manejarse exclusivamente
// en el módulo de validación de pagos, NO en CXC.

// FUNCIÓN REMOVIDA: gestionarPago
// Esta funcionalidad se movió a admin-validar-pagos.html

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

/**
 * Obtiene resumen de cartera con aging (antigüedad de saldos)
 * @route GET /api/admin/cxc/summary-aging
 */
async function getSummaryAging(req, res) {
    const client = await db.pool.connect();
    const tenant_id = req.tenant?.tenant_id || 1;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    try {
        // Obtener cartera activa con aging
        const { rows } = await client.query(`
            WITH pedidos_aging AS (
                SELECT 
                    p.clienteid,
                    p.pedidoid,
                    p.montototal,
                    p.saldo_pendiente,
                    p.fecha_vencimiento,
                    p.fechapedido,
                    CASE 
                        WHEN p.fecha_vencimiento IS NULL THEN 0
                        WHEN p.fecha_vencimiento::date >= CURRENT_DATE THEN 0
                        ELSE CURRENT_DATE - p.fecha_vencimiento::date
                    END as dias_vencido
                FROM pedidos p
                WHERE p.es_credito = true
                    AND p.saldo_pendiente > 0
                    AND p.estatus NOT IN ('Cancelado', 'Rechazado')
                    AND p.tenant_id = $1
            )
            SELECT 
                cc.credito_id as "creditoId",
                c.clienteid as "clienteId",
                c.nombre as "clienteNombre",
                c.apellido,
                c.email,
                cc.limite_credito as "limiteCredito",
                cc.saldo_deudor as "saldoDeudor",
                (cc.limite_credito - cc.saldo_deudor) as disponible,
                cc.estado_credito as estado,
                cc.ultimo_movimiento as "ultimoMovimiento",
                -- Aging buckets
                COALESCE(SUM(CASE WHEN pa.dias_vencido = 0 THEN pa.saldo_pendiente ELSE 0 END), 0) as "alCorriente",
                COALESCE(SUM(CASE WHEN pa.dias_vencido BETWEEN 1 AND 30 THEN pa.saldo_pendiente ELSE 0 END), 0) as "vencido1a30",
                COALESCE(SUM(CASE WHEN pa.dias_vencido > 30 THEN pa.saldo_pendiente ELSE 0 END), 0) as "vencidoMas30",
                COALESCE(MAX(pa.dias_vencido), 0) as "maxDiasVencido"
            FROM cliente_creditos cc
            INNER JOIN clientes c ON c.clienteid = cc.cliente_id
            LEFT JOIN pedidos_aging pa ON pa.clienteid = c.clienteid
            WHERE cc.saldo_deudor > 0
                AND cc.tenant_id = $1
                AND c.tenant_id = $1
            GROUP BY cc.credito_id, c.clienteid, c.nombre, c.apellido, c.email, 
                     cc.limite_credito, cc.saldo_deudor, cc.estado_credito, cc.ultimo_movimiento
            ORDER BY cc.saldo_deudor DESC
            LIMIT $2 OFFSET $3
        `, [tenant_id, limit, offset]);

        // Total de registros
        const { rows: [count] } = await client.query(`
            SELECT COUNT(DISTINCT cc.credito_id) as total
            FROM cliente_creditos cc
            INNER JOIN clientes c ON c.clienteid = cc.cliente_id
            WHERE cc.saldo_deudor > 0
                AND cc.tenant_id = $1
                AND c.tenant_id = $1
        `, [tenant_id]);

        // Métricas agregadas
        const { rows: [metrics] } = await client.query(`
            SELECT 
                COALESCE(SUM(cc.saldo_deudor), 0) as total_cobrar,
                COALESCE(SUM(CASE WHEN cc.estado_credito = 'SUSPENDIDO' THEN cc.saldo_deudor ELSE 0 END), 0) as total_vencido,
                COUNT(*) as conteo_clientes
            FROM cliente_creditos cc
            INNER JOIN clientes c ON c.clienteid = cc.cliente_id
            WHERE cc.saldo_deudor > 0
                AND cc.tenant_id = $1
                AND c.tenant_id = $1
        `, [tenant_id]);

        const totalPages = Math.ceil(parseInt(count.total) / limit);

        res.json({
            success: true,
            data: {
                cartera: rows,
                totalCobrar: parseFloat(metrics.total_cobrar),
                totalVencido: parseFloat(metrics.total_vencido),
                conteoClientes: parseInt(metrics.conteo_clientes),
                currentPage: page,
                totalPages,
                totalRecords: parseInt(count.total)
            }
        });

    } catch (error) {
        console.error('Error obteniendo summary aging:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener resumen de cartera'
        });
    } finally {
        client.release();
    }
}

/**
 * Obtiene pagos de clientes pendientes de validación (tabla pagos_clientes)
 * @route GET /api/admin/pagos-clientes/pendientes
 */
async function getPagosClientesPendientes(req, res) {
    const tenant_id = req.tenant?.tenant_id || 1;

    try {
        const { rows } = await db.query(`
            SELECT 
                pc.pago_id,
                pc.cliente_id,
                pc.monto,
                pc.tipo_pago,
                pc.estatus,
                pc.comprobante_url,
                pc.referencia_bancaria,
                pc.transaccion_id,
                pc.fecha_pago,
                pc.notas,
                c.nombre,
                c.apellido,
                c.email
            FROM pagos_clientes pc
            INNER JOIN clientes c ON c.clienteid = pc.cliente_id
            WHERE pc.estatus = 'PENDIENTE'
                AND pc.tenant_id = $1
                AND c.tenant_id = $1
            ORDER BY pc.fecha_pago DESC
        `, [tenant_id]);

        res.json({
            success: true,
            data: rows
        });

    } catch (error) {
        console.error('Error obteniendo pagos de clientes pendientes:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener pagos pendientes'
        });
    }
}

/**
 * Gestiona un pago de cliente (aprobar o rechazar)
 * @route POST /api/admin/pagos-clientes/:pagoId/gestionar
 */
async function gestionarPagoCliente(req, res) {
    const client = await db.pool.connect();
    const { pagoId } = req.params;
    const { accion, motivo } = req.body;
    const adminId = req.user?.adminId || req.user?.userId;
    const tenant_id = req.tenant?.tenant_id || 1;

    if (!['aprobar', 'rechazar'].includes(accion)) {
        return res.status(400).json({
            success: false,
            message: 'Acción inválida. Debe ser "aprobar" o "rechazar"'
        });
    }

    try {
        await client.query('BEGIN');

        // Obtener información del pago
        const { rows: [pago] } = await client.query(`
            SELECT 
                pc.*,
                c.nombre,
                c.apellido,
                cc.credito_id,
                cc.saldo_deudor
            FROM pagos_clientes pc
            INNER JOIN clientes c ON c.clienteid = pc.cliente_id
            INNER JOIN cliente_creditos cc ON cc.cliente_id = pc.cliente_id
            WHERE pc.pago_id = $1 
                AND pc.tenant_id = $2
                AND c.tenant_id = $2
            FOR UPDATE
        `, [pagoId, tenant_id]);

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
            // Actualizar estado del pago
            await client.query(`
                UPDATE pagos_clientes
                SET estatus = 'APROBADO',
                    fecha_validacion = NOW(),
                    validado_por = $1
                WHERE pago_id = $2 AND tenant_id = $3
            `, [adminId, pagoId, tenant_id]);

            // Actualizar saldo del cliente (ABONO)
            const nuevoSaldo = parseFloat(pago.saldo_deudor) - parseFloat(pago.monto);
            await client.query(`
                UPDATE cliente_creditos
                SET saldo_deudor = GREATEST(0, $1),
                    ultimo_movimiento = NOW()
                WHERE credito_id = $2 AND tenant_id = $3
            `, [nuevoSaldo, pago.credito_id, tenant_id]);

            // Registrar movimiento de crédito
            await client.query(`
                INSERT INTO credito_movimientos (
                    credito_id, tipo_movimiento, monto, referencia_id, 
                    descripcion, saldo_despues_movimiento, tenant_id
                )
                VALUES ($1, 'ABONO', $2, $3, $4, GREATEST(0, $5), $6)
            `, [
                pago.credito_id,
                pago.monto,
                `PAGO-${pagoId}`,
                `Pago validado: ${pago.tipo_pago} - Ref: ${pago.referencia_bancaria || 'N/A'}`,
                nuevoSaldo,
                tenant_id
            ]);

            // Notificar al cliente
            await client.query(`
                INSERT INTO notificaciones (clienteid, tipo, titulo, mensaje, prioridad, tenant_id)
                VALUES ($1, 'sistema', 'Pago Aprobado', $2, 'normal', $3)
            `, [
                pago.cliente_id,
                `Tu pago de ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(pago.monto)} ha sido validado exitosamente.`,
                tenant_id
            ]);

            await client.query('COMMIT');

            res.json({
                success: true,
                message: 'Pago aprobado exitosamente',
                data: {
                    nuevoSaldo: Math.max(0, nuevoSaldo)
                }
            });

        } else if (accion === 'rechazar') {
            // Actualizar estado del pago
            await client.query(`
                UPDATE pagos_clientes
                SET estatus = 'RECHAZADO',
                    fecha_validacion = NOW(),
                    validado_por = $1,
                    notas = COALESCE(notas || ' | ', '') || 'Motivo rechazo: ' || $2
                WHERE pago_id = $3 AND tenant_id = $4
            `, [adminId, motivo || 'No especificado', pagoId, tenant_id]);

            // Notificar al cliente
            const mensajeRechazo = motivo
                ? `Tu pago fue rechazado. Motivo: ${motivo}. Por favor, contacta con soporte.`
                : 'Tu pago fue rechazado. Por favor, contacta con soporte para más información.';

            await client.query(`
                INSERT INTO notificaciones (clienteid, tipo, titulo, mensaje, prioridad, tenant_id)
                VALUES ($1, 'sistema', 'Pago Rechazado', $2, 'alta', $3)
            `, [pago.cliente_id, mensajeRechazo, tenant_id]);

            await client.query('COMMIT');

            res.json({
                success: true,
                message: 'Pago rechazado'
            });
        }

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error gestionando pago de cliente:', error);
        res.status(500).json({
            success: false,
            message: 'Error al gestionar el pago'
        });
    } finally {
        client.release();
    }
}

module.exports = {
    exportarLoteCxC,
    getMetricasCobranza,
    getClientesCredito,
    getSummaryAging,
    getPagosClientesPendientes,
    gestionarPagoCliente,
    obtenerHistorialMovimientos
};
