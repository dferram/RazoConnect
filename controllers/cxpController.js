const ExcelJS = require('exceljs');
const { pool } = require('../db');
const { format } = require('date-fns');
const cloudinary = require('../config/cloudinary');

/**
 * Exporta CxP a Excel con filtros opcionales
 * Si no hay filtros: exporta pendientes y marca como exportados (lote)
 * Si hay filtros: exporta vista filtrada sin marcar como exportados
 */
async function exportarLoteCxP(req, res) {
    const client = await pool.connect();
    const { search, estatus, fechaInicio, fechaFin } = req.query;
    
    // Determinar si es exportación con filtros o lote completo
    const hasFilters = !!(search || estatus || fechaInicio || fechaFin);
    
    try {
        if (!hasFilters) {
            await client.query('BEGIN');
        }

        // Construir query dinámico con filtros
        let whereConditions = ["cxp.estatus NOT IN ('CANCELADO')"];
        let queryParams = [];
        let paramIndex = 1;

        // Si NO hay filtros, solo exportar pendientes no exportados
        if (!hasFilters) {
            whereConditions.push('cxp.exportado_en IS NULL');
            whereConditions.push("cxp.estatus NOT IN ('PAGADO')");
        }

        // Aplicar filtros si existen
        if (search && search.trim()) {
            queryParams.push(`%${search.trim()}%`);
            whereConditions.push(`p.nombreempresa ILIKE $${paramIndex}`);
            paramIndex++;
        }

        if (estatus && estatus.trim()) {
            queryParams.push(estatus.trim());
            whereConditions.push(`cxp.estatus = $${paramIndex}`);
            paramIndex++;
        }

        if (fechaInicio && fechaInicio.trim()) {
            queryParams.push(fechaInicio.trim());
            whereConditions.push(`cxp.fecha_vencimiento >= $${paramIndex}`);
            paramIndex++;
        }

        if (fechaFin && fechaFin.trim()) {
            queryParams.push(fechaFin.trim());
            whereConditions.push(`cxp.fecha_vencimiento <= $${paramIndex}`);
            paramIndex++;
        }

        const whereClause = whereConditions.join(' AND ');

        // 1. Obtener registros
        const { rows, rowCount } = await client.query(`
            SELECT 
                cxp.cxp_id,
                cxp.proveedor_id,
                cxp.fecha_emision,
                cxp.fecha_vencimiento,
                cxp.monto_total as importe,
                COALESCE(cxp.monto_pagado, 0) as abono,
                (cxp.monto_total - COALESCE(cxp.monto_pagado, 0)) as saldo,
                cxp.estatus,
                cxp.notas,
                p.nombreempresa as proveedor
            FROM cuentas_por_pagar cxp
            INNER JOIN proveedores p ON p.proveedorid = cxp.proveedor_id
            WHERE ${whereClause}
            ORDER BY cxp.fecha_vencimiento ASC
        `, queryParams);

        if (rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                message: hasFilters ? 'No hay registros que coincidan con los filtros' : 'No hay pagos pendientes de exportar'
            });
        }

        // 2. Crear workbook
        const workbook = new ExcelJS.Workbook();
        const sheetName = hasFilters ? 'CxP Filtrado' : 'CxP Pendiente';
        const worksheet = workbook.addWorksheet(sheetName);

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
            const saldo = record.saldo || (record.importe - record.abono);
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

        // 7. Marcar como exportados SOLO si NO hay filtros (exportación de lote completo)
        if (!hasFilters) {
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

            await client.query('COMMIT');
        }

        // 8. Enviar archivo
        
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

/**
 * Obtiene KPIs de cuentas por pagar
 */
async function getCxPKPIs(req, res) {
    const client = await pool.connect();
    
    try {
        const { rows } = await client.query(`
            SELECT 
                SUM(CASE 
                    WHEN estatus IN ('PENDIENTE', 'PARCIAL') 
                    THEN monto_total - COALESCE(monto_pagado, 0) 
                    ELSE 0 
                END) as total_por_pagar,
                SUM(CASE 
                    WHEN estatus IN ('PENDIENTE', 'PARCIAL') 
                    AND fecha_vencimiento < CURRENT_DATE 
                    THEN monto_total - COALESCE(monto_pagado, 0) 
                    ELSE 0 
                END) as vencido,
                SUM(CASE 
                    WHEN estatus IN ('PENDIENTE', 'PARCIAL') 
                    AND fecha_vencimiento >= CURRENT_DATE 
                    AND fecha_vencimiento <= CURRENT_DATE + INTERVAL '7 days' 
                    THEN monto_total - COALESCE(monto_pagado, 0) 
                    ELSE 0 
                END) as proximo_vencer,
                COUNT(CASE 
                    WHEN estatus IN ('PENDIENTE', 'PARCIAL') 
                    AND fecha_vencimiento < CURRENT_DATE 
                    THEN 1 
                END) as count_vencido,
                COUNT(CASE 
                    WHEN estatus IN ('PENDIENTE', 'PARCIAL') 
                    AND fecha_vencimiento >= CURRENT_DATE 
                    AND fecha_vencimiento <= CURRENT_DATE + INTERVAL '7 days' 
                    THEN 1 
                END) as count_proximo
            FROM cuentas_por_pagar
            WHERE estatus NOT IN ('CANCELADO')
        `);

        res.json({
            success: true,
            data: rows[0]
        });

    } catch (error) {
        console.error('Error obteniendo KPIs CxP:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener KPIs'
        });
    } finally {
        client.release();
    }
}

/**
 * Obtiene lista paginada de cuentas por pagar con filtros avanzados
 */
async function getCuentasPorPagar(req, res) {
    const client = await pool.connect();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const { search, estatus, fechaInicio, fechaFin } = req.query;
    
    try {
        let whereConditions = ['cxp.estatus NOT IN (\'CANCELADO\')'];
        let queryParams = [];
        let paramIndex = 1;

        // Filtro de búsqueda por proveedor
        if (search && search.trim()) {
            queryParams.push(`%${search.trim()}%`);
            whereConditions.push(`p.nombreempresa ILIKE $${paramIndex}`);
            paramIndex++;
        }

        // Filtro de estatus
        if (estatus && estatus.trim()) {
            queryParams.push(estatus.trim());
            whereConditions.push(`cxp.estatus = $${paramIndex}`);
            paramIndex++;
        }

        // Filtro de rango de fechas
        if (fechaInicio) {
            queryParams.push(fechaInicio);
            whereConditions.push(`cxp.fecha_vencimiento >= $${paramIndex}`);
            paramIndex++;
        }
        if (fechaFin) {
            queryParams.push(fechaFin);
            whereConditions.push(`cxp.fecha_vencimiento <= $${paramIndex}`);
            paramIndex++;
        }

        const whereClause = whereConditions.join(' AND ');

        // Total de registros
        const { rows: [count] } = await client.query(`
            SELECT COUNT(*) as total
            FROM cuentas_por_pagar cxp
            INNER JOIN proveedores p ON p.proveedorid = cxp.proveedor_id
            WHERE ${whereClause}
        `, queryParams);

        // Datos paginados con cálculo dinámico de estatus
        queryParams.push(limit, offset);
        const { rows } = await client.query(`
            SELECT 
                cxp.cxp_id,
                cxp.proveedor_id,
                cxp.orden_compra_id,
                cxp.fecha_emision,
                cxp.fecha_vencimiento,
                cxp.monto_total,
                COALESCE(cxp.monto_pagado, 0) as monto_pagado,
                (cxp.monto_total - COALESCE(cxp.monto_pagado, 0)) as saldo_restante,
                cxp.estatus,
                cxp.referencia_factura,
                cxp.notas,
                p.nombreempresa as proveedor,
                CASE 
                    WHEN (cxp.monto_total - COALESCE(cxp.monto_pagado, 0)) <= 0 THEN 'PAGADO'
                    WHEN cxp.fecha_vencimiento < CURRENT_DATE AND (cxp.monto_total - COALESCE(cxp.monto_pagado, 0)) > 0 THEN 'VENCIDO'
                    WHEN COALESCE(cxp.monto_pagado, 0) > 0 AND (cxp.monto_total - COALESCE(cxp.monto_pagado, 0)) > 0 THEN 'PARCIAL'
                    ELSE 'PENDIENTE'
                END as estatus_calculado
            FROM cuentas_por_pagar cxp
            INNER JOIN proveedores p ON p.proveedorid = cxp.proveedor_id
            WHERE ${whereClause}
            ORDER BY 
                CASE 
                    WHEN cxp.fecha_vencimiento < CURRENT_DATE THEN 0
                    ELSE 1
                END,
                cxp.fecha_vencimiento ASC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `, queryParams);

        const totalPages = Math.ceil(count.total / limit);

        res.json({
            success: true,
            data: rows,
            totalRecords: parseInt(count.total),
            totalPages,
            currentPage: page
        });

    } catch (error) {
        console.error('Error obteniendo CxP:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener cuentas por pagar'
        });
    } finally {
        client.release();
    }
}

/**
 * Obtiene detalle de una cuenta por pagar con historial de pagos
 */
async function getCxPDetalle(req, res) {
    const client = await pool.connect();
    const { id } = req.params;
    
    try {
        // Obtener cuenta por pagar
        const { rows: [cxp] } = await client.query(`
            SELECT 
                cxp.*,
                p.nombreempresa as proveedor,
                (cxp.monto_total - COALESCE(cxp.monto_pagado, 0)) as saldo_restante
            FROM cuentas_por_pagar cxp
            INNER JOIN proveedores p ON p.proveedorid = cxp.proveedor_id
            WHERE cxp.cxp_id = $1
        `, [id]);

        if (!cxp) {
            return res.status(404).json({
                success: false,
                message: 'Cuenta por pagar no encontrada'
            });
        }

        // Obtener historial de pagos
        const { rows: pagos } = await client.query(`
            SELECT 
                pago_id,
                monto,
                fecha_pago,
                metodo_pago,
                referencia_bancaria as referencia,
                comprobante_url,
                nota as notas,
                usuario_id
            FROM pagos_cxp
            WHERE cxp_id = $1
            ORDER BY fecha_pago DESC
        `, [id]);

        res.json({
            success: true,
            data: {
                ...cxp,
                historial_pagos: pagos
            }
        });

    } catch (error) {
        console.error('Error obteniendo detalle CxP:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener detalle'
        });
    } finally {
        client.release();
    }
}

/**
 * Registra un pago/abono a una cuenta por pagar
 */
async function registrarPago(req, res) {
    const client = await pool.connect();
    const { id } = req.params;
    const { monto, metodoPago, referencia, notas } = req.body;
    const usuarioId = req.user.id;
    
    try {
        await client.query('BEGIN');

        // Validar que la cuenta existe y obtener saldo
        const { rows: [cxp] } = await client.query(`
            SELECT 
                cxp_id,
                monto_total,
                COALESCE(monto_pagado, 0) as monto_pagado,
                estatus
            FROM cuentas_por_pagar
            WHERE cxp_id = $1
        `, [id]);

        if (!cxp) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                message: 'Cuenta por pagar no encontrada'
            });
        }

        const saldoRestante = cxp.monto_total - cxp.monto_pagado;
        const montoPago = parseFloat(monto);

        // Validaciones
        if (montoPago <= 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                message: 'El monto debe ser mayor a 0'
            });
        }

        if (montoPago > saldoRestante) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                message: `El monto excede el saldo restante ($${saldoRestante.toFixed(2)})`
            });
        }

        // Subir comprobante a Cloudinary si existe
        let comprobanteUrl = null;
        if (req.file) {
            try {
                const result = await new Promise((resolve, reject) => {
                    const uploadStream = cloudinary.uploader.upload_stream(
                        {
                            folder: 'comprobantes_cxp',
                            resource_type: 'auto'
                        },
                        (error, result) => {
                            if (error) reject(error);
                            else resolve(result);
                        }
                    );
                    uploadStream.end(req.file.buffer);
                });
                comprobanteUrl = result.secure_url;
            } catch (uploadError) {
                console.error('Error subiendo comprobante:', uploadError);
            }
        }

        // Registrar pago
        const { rows: [pago] } = await client.query(`
            INSERT INTO pagos_cxp (
                cxp_id,
                monto,
                fecha_pago,
                metodo_pago,
                referencia_bancaria,
                comprobante_url,
                nota,
                usuario_id
            ) VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7)
            RETURNING pago_id, fecha_pago
        `, [id, montoPago, metodoPago || 'TRANSFERENCIA', referencia, comprobanteUrl, notas, usuarioId]);

        // Actualizar monto pagado y estatus
        const nuevoMontoPagado = cxp.monto_pagado + montoPago;
        const nuevoEstatus = nuevoMontoPagado >= cxp.monto_total ? 'PAGADO' : 'PARCIAL';

        await client.query(`
            UPDATE cuentas_por_pagar
            SET 
                monto_pagado = $1,
                estatus = $2,
                fecha_cierre = CASE WHEN $2 = 'PAGADO' THEN NOW() ELSE fecha_cierre END
            WHERE cxp_id = $3
        `, [nuevoMontoPagado, nuevoEstatus, id]);

        await client.query('COMMIT');

        res.json({
            success: true,
            message: 'Pago registrado exitosamente',
            data: {
                pago_id: pago.pago_id,
                fecha_pago: pago.fecha_pago,
                nuevo_estatus: nuevoEstatus,
                saldo_restante: cxp.monto_total - nuevoMontoPagado
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error registrando pago:', error);
        res.status(500).json({
            success: false,
            message: 'Error al registrar el pago'
        });
    } finally {
        client.release();
    }
}

module.exports = {
    exportarLoteCxP,
    getCuentasPorPagar,
    getCxPKPIs,
    getCxPDetalle,
    registrarPago
};
