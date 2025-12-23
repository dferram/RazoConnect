const ExcelJS = require('exceljs');
const pool = require('../db');
const { format } = require('date-fns');

/**
 * Exporta entradas de almacén a Excel y las marca como exportadas
 */
async function exportarEntradasAlmacen(req, res) {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');

        // 1. Obtener órdenes pendientes de exportar
        const { rows } = await client.query(`
            SELECT 
                oc.ordenid,
                oc.fecha_recepcion,
                doc.sku,
                p.descripcion,
                doc.cantidad_recibida,
                doc.costo_unitario
            FROM ordenesdecompra oc
            INNER JOIN detallesordencompra doc ON doc.ordenid = oc.ordenid
            INNER JOIN productos p ON p.sku = doc.sku
            WHERE oc.estatus = 'RECIBIDO' 
            AND oc.exportado_en IS NULL
            ORDER BY oc.ordenid, doc.sku
        `);

        if (rows.length === 0) {
            return res.status(404).json({
                message: 'No hay entradas pendientes de exportar'
            });
        }

        // 2. Generar ID único para el reporte
        const reporteId = `ENT-${format(new Date(), 'yyyyMMddHHmmss')}`;

        // 3. Crear workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Entradas Almacén');

        // 4. Configurar columnas
        worksheet.columns = [
            { header: 'PEDIDO', key: 'pedido', width: 12 },
            { header: 'CODIGO', key: 'codigo', width: 15 },
            { header: 'DESCRIPCIÓN', key: 'descripcion', width: 40 },
            { header: 'CANTIDAD', key: 'cantidad', width: 12 },
            { header: 'PRECIO UNITARIO', key: 'precio', width: 15 },
            { header: 'TOTAL', key: 'total', width: 15 }
        ];

        // 5. Estilo del encabezado
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '217346' }
        };
        headerRow.alignment = { horizontal: 'center' };

        // 6. Agregar datos y fórmulas
        rows.forEach((record, index) => {
            const rowNumber = index + 2;
            worksheet.addRow({
                pedido: record.ordenid,
                codigo: record.sku,
                descripcion: record.descripcion,
                cantidad: record.cantidad_recibida,
                precio: record.costo_unitario
            });

            // Formato moneda
            worksheet.getCell(`E${rowNumber}`).numFmt = '$#,##0.00';
            worksheet.getCell(`F${rowNumber}`).numFmt = '$#,##0.00';

            // Fórmula total
            worksheet.getCell(`F${rowNumber}`).value = {
                formula: `D${rowNumber}*E${rowNumber}`
            };
        });

        // 7. Marcar órdenes como exportadas
        await client.query(`
            UPDATE ordenesdecompra 
            SET exportado_en = NOW(),
                reporte_id = $1
            WHERE ordenid IN (
                SELECT DISTINCT ordenid 
                FROM ordenesdecompra oc
                WHERE oc.estatus = 'RECIBIDO' 
                AND oc.exportado_en IS NULL
            )
        `, [reporteId]);

        // 8. Commit y generar archivo
        await client.query('COMMIT');
        const buffer = await workbook.xlsx.writeBuffer();

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=Entradas_Almacen_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
        res.send(buffer);

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en exportación de entradas:', error);
        res.status(500).json({
            message: 'Error al generar el reporte de entradas',
            error: error.message
        });
    } finally {
        client.release();
    }
}

/**
 * Obtiene órdenes pendientes con paginación
 */
async function getOrdenesPendientes(req, res) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const client = await pool.connect();
    
    try {
        // Total de registros
        const { rows: [count] } = await client.query(`
            SELECT COUNT(*) as total 
            FROM ordenesdecompra 
            WHERE estatus = 'PENDIENTE'
        `);

        // Datos paginados
        const { rows: ordenes } = await client.query(`
            SELECT 
                oc.ordenid,
                oc.fecha_creacion,
                oc.fecha_recepcion,
                oc.estatus,
                p.nombre as proveedor,
                COUNT(doc.detalleid) as total_items,
                SUM(doc.cantidad_solicitada) as total_piezas,
                SUM(doc.cantidad_solicitada * doc.costo_unitario) as valor_total
            FROM ordenesdecompra oc
            INNER JOIN proveedores p ON p.proveedorid = oc.proveedorid
            LEFT JOIN detallesordencompra doc ON doc.ordenid = oc.ordenid
            WHERE oc.estatus = 'PENDIENTE'
            GROUP BY oc.ordenid, p.nombre
            ORDER BY oc.fecha_creacion DESC
            LIMIT $1 OFFSET $2
        `, [limit, offset]);

        const totalPages = Math.ceil(count.total / limit);

        res.json({
            data: ordenes,
            total: parseInt(count.total),
            pagina: page,
            totalPaginas: totalPages
        });

    } catch (error) {
        console.error('Error al obtener órdenes:', error);
        res.status(500).json({
            message: 'Error al obtener órdenes pendientes',
            error: error.message
        });
    } finally {
        client.release();
    }
}

module.exports = {
    exportarEntradasAlmacen,
    getOrdenesPendientes
};
