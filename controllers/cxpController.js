const ExcelJS = require('exceljs');
const pool = require('../db');
const { format } = require('date-fns');

/**
 * Exporta lote de CxP pendientes a Excel y marca como exportados
 */
async function exportarLoteCxP(req, res) {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');

        // 1. Obtener registros pendientes
        const { rows, rowCount } = await client.query(`
            SELECT 
                cxp.cxp_id,
                cxp.proveedor_id,
                cxp.fecha_emision,
                cxp.fecha_vencimiento,
                cxp.importe_total as importe,
                COALESCE(cxp.importe_pagado, 0) as abono,
                cxp.notas,
                p.nombre as proveedor
            FROM cuentas_por_pagar cxp
            INNER JOIN proveedores p ON p.proveedorid = cxp.proveedor_id
            WHERE cxp.estatus NOT IN ('PAGADO', 'CANCELADO')
            AND cxp.exportado_en IS NULL
            ORDER BY cxp.fecha_vencimiento ASC
        `);

        if (rowCount === 0) {
            return res.status(404).json({
                message: 'No hay pagos pendientes de exportar'
            });
        }

        // 2. Crear workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('CxP Pendiente');

        // 3. Configurar columnas
        worksheet.columns = [
            { header: 'ID', key: 'id', width: 12 },
            { header: 'PROVEEDOR', key: 'proveedor', width: 40 },
            { header: 'F. EMISION', key: 'emision', width: 15 },
            { header: 'F. VTO', key: 'vencimiento', width: 15 },
            { header: 'IMPORTE', key: 'importe', width: 15 },
            { header: 'ABONO', key: 'abono', width: 15 },
            { header: 'SALDO', key: 'saldo', width: 15 },
            { header: 'OBSERVACIONES', key: 'notas', width: 40 }
        ];

        // 4. Estilo del encabezado
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
        headerRow.alignment = { horizontal: 'center' };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '217346' }
        };
        headerRow.eachCell(cell => {
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
        });

        // 5. Agregar datos
        let totalSaldo = 0;
        rows.forEach((record, index) => {
            const rowNumber = index + 2;
            const saldo = record.importe - record.abono;
            totalSaldo += saldo;
            
            worksheet.addRow({
                id: record.cxp_id,
                proveedor: record.proveedor,
                emision: record.fecha_emision,
                vencimiento: record.fecha_vencimiento,
                importe: record.importe,
                abono: record.abono,
                notas: record.notas || ''
            });

            // Formato fecha
            worksheet.getCell(`C${rowNumber}`).numFmt = 'dd/mm/yyyy';
            worksheet.getCell(`D${rowNumber}`).numFmt = 'dd/mm/yyyy';
            
            // Formato moneda
            worksheet.getCell(`E${rowNumber}`).numFmt = '$#,##0.00';
            worksheet.getCell(`F${rowNumber}`).numFmt = '$#,##0.00';
            
            // Fórmula saldo
            worksheet.getCell(`G${rowNumber}`).value = { 
                formula: `E${rowNumber}-F${rowNumber}` 
            };
            worksheet.getCell(`G${rowNumber}`).numFmt = '$#,##0.00';

            // Bordes para toda la fila
            worksheet.getRow(rowNumber).eachCell(cell => {
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
            });
        });

        // 6. Agregar fila de total
        const totalRow = worksheet.addRow({
            id: '',
            proveedor: 'GRAN TOTAL',
            emision: '',
            vencimiento: '',
            importe: '',
            abono: '',
            saldo: totalSaldo,
            notas: ''
        });

        totalRow.font = { bold: true };
        totalRow.getCell('G').numFmt = '$#,##0.00';
        totalRow.eachCell(cell => {
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'double' },
                right: { style: 'thin' }
            };
        });

        // 7. Marcar como exportados
        const reporteId = `CXP-${Date.now()}`;
        await client.query(`
            UPDATE cuentas_por_pagar 
            SET exportado_en = NOW(),
                reporte_id = $1
            WHERE cxp_id = ANY($2)
        `, [
            reporteId,
            rows.map(r => r.cxp_id)
        ]);

        // 8. Commit y enviar archivo
        await client.query('COMMIT');
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=CXP_Pendientes_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
        
        await workbook.xlsx.write(res);

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en exportación CxP:', error);
        res.status(500).json({
            message: 'Error al generar el reporte de CxP',
            error: error.message
        });
    } finally {
        client.release();
    }
}

module.exports = {
    exportarLoteCxP
};
