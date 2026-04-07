const ExcelJS = require('exceljs');
const logger = require('../utils/logger');
const pool = require('../db');
const { format } = require('date-fns');

/**
 * Exporta registros de CxC pendientes a Excel y los marca como exportados
 * @param {Object} req Express request object
 * @param {Object} res Express response object
 */
async function exportarCxC(req, res) {
    const client = await pool.connect();
    const { tenant_id } = req.tenant;
    const adminId = req.user?.adminId || req.user?.userId;

    try {
        await client.query('BEGIN');

        // 1. Obtener registros pendientes - ⚠️ CRITICAL: Filtrar por admin_id y tenant_id
        const { rows } = await client.query(`
            SELECT
                cc.credito_id,
                cc.cliente_id,
                cc.limite_credito,
                cc.saldo_deudor,
                c.nombre,
                c.apellido
            FROM cliente_creditos cc
            INNER JOIN clientes c ON c.clienteid = cc.cliente_id
            WHERE cc.saldo_deudor > 0
              AND cc.exportado_en IS NULL
              AND cc.admin_id = $1
              AND cc.tenant_id = $2
            ORDER BY cc.cliente_id
        `, [adminId, tenant_id]);

        // Validar si hay registros
        if (rows.length === 0) {
            return res.status(404).json({
                message: 'No hay registros nuevos pendientes de exportar'
            });
        }

        // 2. Generar ID único para el reporte
        const reporteId = `REP-${format(new Date(), 'yyyyMMddHHmmss')}`;

        // 3. Crear workbook con ExcelJS
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('CxC Pendiente');

        // 4. Configurar columnas
        worksheet.columns = [
            { header: 'ID', key: 'id', width: 15 },
            { header: 'CLIENTE', key: 'cliente', width: 30 },
            { header: 'LIMITE', key: 'limite', width: 15 },
            { header: 'DEUDA', key: 'deuda', width: 15 },
            { header: 'DISPONIBLE', key: 'disponible', width: 15 }
        ];

        // 5. Estilo del encabezado
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
        headerRow.alignment = { horizontal: 'center' };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '003366' }
        };

        // 6. Agregar datos y fórmulas
        rows.forEach((record, index) => {
            const rowNumber = index + 2; // Empezar en fila 2 después del encabezado

            worksheet.addRow({
                id: record.cliente_id,
                cliente: `${record.nombre} ${record.apellido}`,
                limite: record.limite_credito,
                deuda: record.saldo_deudor
            });

            // Formato moneda para columnas numéricas
            worksheet.getCell(`C${rowNumber}`).numFmt = '$#,##0.00';
            worksheet.getCell(`D${rowNumber}`).numFmt = '$#,##0.00';

            // Fórmula para calcular disponible (LIMITE - DEUDA)
            worksheet.getCell(`E${rowNumber}`).value = {
                formula: `C${rowNumber}-D${rowNumber}`
            };
            worksheet.getCell(`E${rowNumber}`).numFmt = '$#,##0.00';
        });

        // 7. Agregar fila de TOTAL GENERAL
        const totalRow = rows.length + 2; // Fila después de todos los datos
        const lastDataRow = rows.length + 1; // Última fila con datos

        worksheet.addRow({
            id: '',
            cliente: 'TOTAL GENERAL',
            limite: { formula: `SUM(C2:C${lastDataRow})` },
            deuda: { formula: `SUM(D2:D${lastDataRow})` },
            disponible: { formula: `SUM(E2:E${lastDataRow})` }
        });

        // Estilo para la fila de total
        const totalRowObj = worksheet.getRow(totalRow);
        totalRowObj.font = { bold: true, size: 12 };
        totalRowObj.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'E8F4F8' }
        };

        // Formato moneda para totales
        worksheet.getCell(`C${totalRow}`).numFmt = '$#,##0.00';
        worksheet.getCell(`D${totalRow}`).numFmt = '$#,##0.00';
        worksheet.getCell(`E${totalRow}`).numFmt = '$#,##0.00';

        // 7. Marcar registros como exportados - ⚠️ CRITICAL: Validar admin_id y tenant_id
        await client.query(`
            UPDATE cliente_creditos
            SET exportado_en = NOW(),
                reporte_id = $1
            WHERE credito_id = ANY($2)
              AND admin_id = $3
              AND tenant_id = $4
        `, [
            reporteId,
            rows.map(r => r.credito_id),
            adminId,
            tenant_id
        ]);

        // 8. Commit de la transacción
        await client.query('COMMIT');

        // 9. Generar buffer del archivo
        const buffer = await workbook.xlsx.writeBuffer();

        // 10. Enviar archivo al cliente
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=CxC_RazoConnect_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
        res.send(buffer);

    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Error en exportación CxC:', {
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
        res.status(500).json({
            success: false,
            message: 'Error al generar el reporte de CxC'
        });
    } finally {
        client.release();
    }
}

module.exports = {
    exportarCxC
};
