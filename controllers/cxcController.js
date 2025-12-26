const ExcelJS = require('exceljs');
const db = require('../db');
const { format } = require('date-fns');

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
        console.log(`[CXC EXPORT] Reporte generado: ${reporteId} - ${rows.length} clientes - ${rows.reduce((acc, r) => acc + (r.documentos?.length || 0), 0)} documentos`);

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
    const client = await pool.connect();
    
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
    const client = await pool.connect();
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

module.exports = {
    exportarLoteCxC,
    getMetricasCobranza,
    getClientesCredito
};
