const ExcelJS = require('exceljs');
const logger = require('../utils/logger');
const db = require('../db');
const { format } = require('date-fns');
const path = require('path');
const fs = require('fs').promises;

/**
 * Exporta un reporte detallado de movimientos de CxC con filtros
 * Formato: [Fecha] | [Cliente] | [Tipo (Cargo/Abono)] | [Referencia] | [Monto] | [Saldo Acumulado]
 */
async function exportarCxCDetallado(req, res) {
    const client = await db.pool.connect();
    
    try {
        const { fechaDesde, fechaHasta, clienteId, estado } = req.query;

        // Construir condiciones WHERE dinámicamente
        const conditions = [];
        const params = [];
        let paramIndex = 1;

        // Filtro de fecha
        if (fechaDesde) {
            conditions.push(`cm.fecha_movimiento >= $${paramIndex}::date`);
            params.push(fechaDesde);
            paramIndex++;
        }
        if (fechaHasta) {
            conditions.push(`cm.fecha_movimiento <= $${paramIndex}::date + interval '1 day' - interval '1 second'`);
            params.push(fechaHasta);
            paramIndex++;
        }

        // Filtro de cliente específico
        if (clienteId && clienteId !== '') {
            conditions.push(`cc.cliente_id = $${paramIndex}::integer`);
            params.push(clienteId);
            paramIndex++;
        }

        // Filtro de estado (con-deuda o vencidos)
        if (estado === 'con-deuda') {
            conditions.push(`cc.saldo_deudor > 0`);
        } else if (estado === 'vencidos') {
            conditions.push(`cc.estado_credito = 'SUSPENDIDO'`);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Consulta principal: obtener todos los movimientos con información del cliente
        const query = `
            SELECT 
                cm.movimiento_id,
                cm.fecha_movimiento,
                cm.tipo_movimiento,
                cm.monto,
                cm.referencia_id,
                cm.descripcion,
                cm.saldo_despues_movimiento,
                cc.cliente_id,
                c.nombre,
                c.apellido,
                c.email
            FROM credito_movimientos cm
            INNER JOIN cliente_creditos cc ON cc.credito_id = cm.credito_id
            INNER JOIN clientes c ON c.clienteid = cc.cliente_id
            ${whereClause}
            ORDER BY cc.cliente_id, cm.fecha_movimiento ASC
        `;

        const { rows } = await client.query(query, params);

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No se encontraron movimientos con los filtros aplicados'
            });
        }

        // Crear workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Detalle CxC');

        // Configurar anchos de columnas
        worksheet.columns = [
            { header: 'Fecha', key: 'fecha', width: 18 },
            { header: 'Cliente', key: 'cliente', width: 35 },
            { header: 'Tipo', key: 'tipo', width: 12 },
            { header: 'Referencia', key: 'referencia', width: 20 },
            { header: 'Monto', key: 'monto', width: 15 },
            { header: 'Saldo Acumulado', key: 'saldo', width: 18 }
        ];

        // Estilo del encabezado
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFF' }, size: 11 };
        headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF0369A1' } // Azul oscuro
        };
        headerRow.height = 25;

        // Agregar logo si existe
        try {
            const logoPath = path.join(__dirname, '..', 'icon', 'Logo_Razo.png');
            const logoBuffer = await fs.readFile(logoPath);
            const imageId = workbook.addImage({
                buffer: logoBuffer,
                extension: 'png',
            });
            
            // Insertar fila para el logo
            worksheet.insertRow(1, []);
            worksheet.getRow(1).height = 50;
            
            worksheet.addImage(imageId, {
                tl: { col: 0.1, row: 0.1 },
                ext: { width: 50, height: 50 },
                editAs: 'oneCell'
            });

            // Título del reporte
            worksheet.mergeCells('B1:E1');
            const titleCell = worksheet.getCell('B1');
            titleCell.value = 'REPORTE DETALLADO DE CUENTAS POR COBRAR';
            titleCell.font = { bold: true, size: 14, color: { argb: 'FF111827' } };
            titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

            // Fecha del reporte
            const dateCell = worksheet.getCell('F1');
            dateCell.value = format(new Date(), 'dd/MMM/yyyy HH:mm');
            dateCell.alignment = { horizontal: 'right', vertical: 'middle' };
            dateCell.font = { size: 10, color: { argb: 'FF6B7280' } };

            // Mover encabezados a fila 3
            worksheet.spliceRows(2, 0, []);
            const newHeaderRow = worksheet.getRow(3);
            newHeaderRow.values = ['Fecha', 'Cliente', 'Tipo', 'Referencia', 'Monto', 'Saldo Acumulado'];
            newHeaderRow.font = { bold: true, color: { argb: 'FFFFFF' }, size: 11 };
            newHeaderRow.alignment = { horizontal: 'center', vertical: 'middle' };
            newHeaderRow.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF0369A1' }
            };
            newHeaderRow.height = 25;

        } catch (logoError) {
            console.warn('No se pudo cargar el logo:', logoError);
        }

        // Agrupar movimientos por cliente
        const movimientosPorCliente = {};
        rows.forEach(mov => {
            const clienteKey = mov.cliente_id;
            if (!movimientosPorCliente[clienteKey]) {
                movimientosPorCliente[clienteKey] = {
                    nombre: `${mov.nombre || ''} ${mov.apellido || ''}`.trim(),
                    email: mov.email,
                    movimientos: []
                };
            }
            movimientosPorCliente[clienteKey].movimientos.push(mov);
        });

        // Agregar datos agrupados por cliente
        let currentRow = 4; // Empezar después del logo y encabezados

        Object.keys(movimientosPorCliente).forEach((clienteId, index) => {
            const clienteData = movimientosPorCliente[clienteId];
            
            // Fila separadora con nombre del cliente (negrita, fondo gris claro)
            const clienteRow = worksheet.getRow(currentRow);
            worksheet.mergeCells(`A${currentRow}:F${currentRow}`);
            clienteRow.getCell(1).value = `CLIENTE: ${clienteData.nombre.toUpperCase()} (${clienteData.email || 'Sin email'})`;
            clienteRow.getCell(1).font = { bold: true, size: 11, color: { argb: 'FF111827' } };
            clienteRow.getCell(1).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE5E7EB' }
            };
            clienteRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
            clienteRow.height = 22;
            currentRow++;

            // Agregar movimientos del cliente
            clienteData.movimientos.forEach((mov) => {
                const tipo = mov.tipo_movimiento.toUpperCase();
                const esCargo = ['CARGO', 'CREDITO', 'COMPRA'].includes(tipo);
                const monto = parseFloat(mov.monto) || 0;
                const saldo = parseFloat(mov.saldo_despues_movimiento) || 0;

                const row = worksheet.addRow({
                    fecha: mov.fecha_movimiento ? format(new Date(mov.fecha_movimiento), 'dd/MMM/yyyy HH:mm') : '—',
                    cliente: '', // Ya está en la fila de encabezado del cliente
                    tipo: esCargo ? 'Cargo' : 'Abono',
                    referencia: mov.referencia_id || '—',
                    monto: monto,
                    saldo: saldo
                });

                // Formato de fecha
                row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
                row.getCell(1).font = { size: 10 };

                // Tipo con color
                row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
                row.getCell(3).font = { bold: true, color: { argb: esCargo ? 'FFDC2626' : 'FF16A34A' } };

                // Referencia
                row.getCell(4).alignment = { horizontal: 'left', vertical: 'middle' };
                row.getCell(4).font = { size: 10 };

                // Monto con formato de moneda y color
                row.getCell(5).numFmt = '"$"#,##0.00';
                row.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };
                row.getCell(5).font = { bold: true, color: { argb: esCargo ? 'FFDC2626' : 'FF16A34A' } };

                // Saldo acumulado con formato de moneda
                row.getCell(6).numFmt = '"$"#,##0.00';
                row.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' };
                row.getCell(6).font = { bold: true, size: 10 };

                // Alternar color de fondo para mejor legibilidad
                if (currentRow % 2 === 0) {
                    row.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFF9FAFB' }
                    };
                }

                currentRow++;
            });

            // Fila de subtotal del cliente
            const ultimoMovimiento = clienteData.movimientos[clienteData.movimientos.length - 1];
            const saldoFinal = parseFloat(ultimoMovimiento.saldo_despues_movimiento) || 0;

            const subtotalRow = worksheet.getRow(currentRow);
            worksheet.mergeCells(`A${currentRow}:E${currentRow}`);
            subtotalRow.getCell(1).value = `SALDO ACTUAL DEL CLIENTE`;
            subtotalRow.getCell(1).font = { bold: true, size: 11, color: { argb: 'FF111827' } };
            subtotalRow.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' };
            subtotalRow.getCell(1).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFFEF3C7' }
            };

            subtotalRow.getCell(6).value = saldoFinal;
            subtotalRow.getCell(6).numFmt = '"$"#,##0.00';
            subtotalRow.getCell(6).font = { bold: true, size: 12, color: { argb: saldoFinal > 0 ? 'FFDC2626' : 'FF16A34A' } };
            subtotalRow.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' };
            subtotalRow.getCell(6).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFFEF3C7' }
            };
            subtotalRow.height = 25;

            currentRow++;
            
            // Espacio entre clientes
            worksheet.addRow([]);
            currentRow++;
        });

        // Agregar bordes a todas las celdas con datos
        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            if (rowNumber >= 3) { // Después de logo y título
                row.eachCell({ includeEmpty: true }, (cell) => {
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
                        left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
                        bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
                        right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
                    };
                });
            }
        });

        // Generar buffer del archivo
        const buffer = await workbook.xlsx.writeBuffer();

        // Construir nombre del archivo con filtros aplicados
        let filename = 'CxC_Detallado';
        if (fechaDesde && fechaHasta) {
            filename += `_${fechaDesde}_a_${fechaHasta}`;
        } else if (fechaDesde) {
            filename += `_desde_${fechaDesde}`;
        } else if (fechaHasta) {
            filename += `_hasta_${fechaHasta}`;
        }
        filename += `_${format(new Date(), 'yyyyMMdd_HHmmss')}.xlsx`;

        // Enviar archivo al cliente
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        res.send(buffer);

    } catch (error) {
        logger.error('Error en exportación detallada CxC:', {
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
        res.status(500).json({
            success: false,
            message: 'Error al generar el reporte detallado'
        });
    } finally {
        client.release();
    }
}

/**
 * Obtiene lista de clientes con crédito activo para el selector de filtros
 */
async function obtenerClientesConCredito(req, res) {
    const tenant_id = req.tenant?.tenant_id || 1;
    
    try {
        const { rows } = await db.query(`
            SELECT 
                c.clienteid,
                c.nombre,
                c.apellido,
                cc.saldo_deudor
            FROM cliente_creditos cc
            INNER JOIN clientes c ON c.clienteid = cc.cliente_id
            WHERE cc.estado_credito = 'ACTIVO'
                AND cc.tenant_id = $1
                AND c.tenant_id = $1
            ORDER BY c.nombre, c.apellido
        `, [tenant_id]);

        return res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        logger.error('Error obteniendo clientes con crédito:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
        return res.status(500).json({
            success: false,
            message: 'Error al obtener lista de clientes'
        });
    }
}

module.exports = {
    exportarCxCDetallado,
    obtenerClientesConCredito
};
