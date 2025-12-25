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

        // 1. Obtener registros pendientes
        const { rows } = await client.query(`
            SELECT 
                cc.credito_id,
                cc.cliente_id,
                cc.limite_credito,
                cc.saldo_deudor,
                c.nombre,
                c.apellido
            FROM cliente_creditos cc
            JOIN clientes c ON c.clienteid = cc.cliente_id
            WHERE cc.saldo_deudor > 0 
            AND cc.exportado_en IS NULL
            ORDER BY cc.cliente_id
        `);

        // Si no hay registros, retornar 404
        if (rows.length === 0) {
            return res.status(404).json({
                message: 'No hay nuevos registros para exportar'
            });
        }

        // 2. Generar ID único para el reporte
        const reporteId = `CxC-${format(new Date(), 'yyyyMMdd-HHmmss')}`;

        // 3. Crear workbook
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

        // 6. Agregar datos
        rows.forEach((record, index) => {
            const rowNumber = index + 2;
            const row = worksheet.addRow({
                id: record.cliente_id,
                cliente: `${record.nombre} ${record.apellido}`,
                limite: record.limite_credito,
                deuda: record.saldo_deudor
            });

            // Formato moneda para límite y deuda
            row.getCell('limite').numFmt = '$#,##0.00';
            row.getCell('deuda').numFmt = '$#,##0.00';
            
            // Fórmula para disponible
            worksheet.getCell(`E${rowNumber}`).value = {
                formula: `C${rowNumber}-D${rowNumber}`
            };
            worksheet.getCell(`E${rowNumber}`).numFmt = '$#,##0.00';
        });

        // 7. Marcar registros como exportados
        await client.query(`
            UPDATE cliente_creditos 
            SET exportado_en = NOW(),
                reporte_id = $1
            WHERE credito_id = ANY($2)
        `, [
            reporteId,
            rows.map(r => r.credito_id)
        ]);

        // 8. Commit transacción
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
            // Saldo pendiente sin exportar
            client.query(`
                SELECT COALESCE(SUM(saldo_deudor), 0) as total
                FROM cliente_creditos
                WHERE saldo_deudor > 0 
                AND exportado_en IS NULL
            `),
            
            // Saldo en gestión (exportado este mes)
            client.query(`
                SELECT COALESCE(SUM(saldo_deudor), 0) as total
                FROM cliente_creditos
                WHERE exportado_en >= date_trunc('month', CURRENT_DATE)
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
