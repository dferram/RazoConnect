const ExcelJS = require('exceljs');
const db = require('../db');

/**
 * Genera Excel CONSOLIDADO para PROVEEDOR
 * Agrupa productos idénticos sumando cantidades
 * Muestra PIEZAS como unidad principal
 */
async function generarExcelProveedorGrupo(req, res) {
    const grupoId = parseInt(req.params.id);
    const { tenant_id } = req.tenant;

    try {
        // Obtener información del grupo
        const grupoQuery = await db.query(
            `SELECT 
                og.grupoid,
                og.nombre_grupo,
                og.created_at,
                p.nombreempresa as proveedor_nombre
            FROM ordenes_grupos og
            LEFT JOIN proveedores p ON og.proveedorid = p.proveedorid
            WHERE og.grupoid = $1 AND og.tenant_id = $2`,
            [grupoId, tenant_id]
        );

        if (grupoQuery.rows.length === 0) {
            return res.status(404).json({ error: 'Grupo no encontrado' });
        }

        const grupo = grupoQuery.rows[0];

        // Obtener productos CONSOLIDADOS
        const productosQuery = await db.query(
            `SELECT 
                p.sku,
                p.nombre as producto_nombre,
                pv.dimensionesfisicas,
                pv.color,
                tp.piezasporpaquete,
                SUM(doc.cantidadpaquetes) as total_paquetes,
                SUM(doc.subtotal) as subtotal_total
            FROM ordenesdecompra oc
            INNER JOIN detallesordencompra doc ON oc.ordencompraid = doc.ordencompraid
            LEFT JOIN productos p ON doc.productoid = p.productoid
            LEFT JOIN producto_variantes pv ON doc.varianteid = pv.varianteid
            LEFT JOIN cat_tamanopaquetes tp ON doc.tamanoid = tp.tamanaid
            WHERE oc.grupo_id = $1 AND oc.tenant_id = $2
            GROUP BY p.sku, p.nombre, pv.dimensionesfisicas, pv.color, tp.piezasporpaquete
            ORDER BY p.nombre ASC`,
            [grupoId, tenant_id]
        );

        const productos = productosQuery.rows;

        // Crear workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Orden Consolidada');

        // Configurar columnas
        worksheet.columns = [
            { header: 'SKU', key: 'sku', width: 15 },
            { header: 'PRODUCTO', key: 'producto', width: 40 },
            { header: 'VARIANTE', key: 'variante', width: 25 },
            { header: 'PIEZAS', key: 'piezas', width: 12 },
            { header: 'COSTO/PIEZA', key: 'costo_pieza', width: 15 },
            { header: 'TOTAL', key: 'total', width: 15 }
        ];

        // Título
        worksheet.mergeCells('A1:F1');
        const titleCell = worksheet.getCell('A1');
        titleCell.value = 'ORDEN DE COMPRA CONSOLIDADA';
        titleCell.font = { size: 16, bold: true, color: { argb: 'FFF97316' } };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        titleCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFF7ED' }
        };

        // Información del grupo
        worksheet.mergeCells('A2:F2');
        const infoCell = worksheet.getCell('A2');
        infoCell.value = `${grupo.nombre_grupo || `Grupo #${grupoId}`} - ${grupo.proveedor_nombre}`;
        infoCell.font = { size: 12, bold: true };
        infoCell.alignment = { horizontal: 'center' };

        worksheet.mergeCells('A3:F3');
        const dateCell = worksheet.getCell('A3');
        dateCell.value = `Fecha: ${new Date(grupo.created_at).toLocaleDateString('es-MX')}`;
        dateCell.alignment = { horizontal: 'center' };

        // Espacio
        worksheet.addRow([]);

        // Header de tabla
        const headerRow = worksheet.addRow(['SKU', 'PRODUCTO', 'VARIANTE', 'PIEZAS', 'COSTO/PIEZA', 'TOTAL']);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF97316' }
        };
        headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
        headerRow.height = 25;

        let totalPiezasGeneral = 0;
        let totalValorGeneral = 0;

        // Agregar productos
        productos.forEach((prod, index) => {
            const totalPaquetes = parseInt(prod.total_paquetes || 0);
            const piezasPorPaquete = parseInt(prod.piezasporpaquete || 1);
            const totalPiezas = totalPaquetes * piezasPorPaquete;
            const subtotal = parseFloat(prod.subtotal_total || 0);
            const costoPorPieza = totalPiezas > 0 ? subtotal / totalPiezas : 0;

            totalPiezasGeneral += totalPiezas;
            totalValorGeneral += subtotal;

            const variante = prod.color 
                ? `${prod.dimensionesfisicas || ''} - ${prod.color}`
                : (prod.dimensionesfisicas || '');

            const row = worksheet.addRow({
                sku: prod.sku || 'N/A',
                producto: prod.producto_nombre || 'N/A',
                variante: variante,
                piezas: totalPiezas,
                costo_pieza: costoPorPieza,
                total: subtotal
            });

            // Formato de números
            row.getCell('piezas').numFmt = '#,##0';
            row.getCell('costo_pieza').numFmt = '$#,##0.00';
            row.getCell('total').numFmt = '$#,##0.00';

            // Fila alternada
            if (index % 2 === 0) {
                row.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFF9FAFB' }
                };
            }
        });

        // Fila de totales
        worksheet.addRow([]);
        const totalRow = worksheet.addRow({
            sku: '',
            producto: '',
            variante: 'TOTALES:',
            piezas: totalPiezasGeneral,
            costo_pieza: '',
            total: totalValorGeneral
        });

        totalRow.font = { bold: true, size: 12 };
        totalRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFF7ED' }
        };
        totalRow.getCell('piezas').numFmt = '#,##0';
        totalRow.getCell('total').numFmt = '$#,##0.00';
        totalRow.getCell('total').font = { bold: true, size: 12, color: { argb: 'FFF97316' } };

        // Bordes
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber >= 5) {
                row.eachCell((cell) => {
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                        right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
                    };
                });
            }
        });

        // Enviar archivo
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="Grupo-${grupoId}-Proveedor.xlsx"`);

        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error('❌ Error generando Excel proveedor:', error);
        res.status(500).json({ error: 'Error al generar Excel' });
    }
}

/**
 * Genera Excel DESGLOSADO para ADMINISTRACIÓN
 * Muestra cada orden por separado con su creador
 * Muestra PIEZAS como unidad principal
 */
async function generarExcelInternoGrupo(req, res) {
    const grupoId = parseInt(req.params.id);
    const { tenant_id } = req.tenant;

    try {
        // Obtener información del grupo
        const grupoQuery = await db.query(
            `SELECT 
                og.grupoid,
                og.nombre_grupo,
                og.created_at,
                p.nombreempresa as proveedor_nombre
            FROM ordenes_grupos og
            LEFT JOIN proveedores p ON og.proveedorid = p.proveedorid
            WHERE og.grupoid = $1 AND og.tenant_id = $2`,
            [grupoId, tenant_id]
        );

        if (grupoQuery.rows.length === 0) {
            return res.status(404).json({ error: 'Grupo no encontrado' });
        }

        const grupo = grupoQuery.rows[0];

        // Obtener órdenes del grupo
        const ordenesQuery = await db.query(
            `SELECT 
                oc.ordencompraid,
                oc.fechacreacion,
                oc.total,
                a.nombre as admin_creador_nombre,
                u.nombre as usuario_creador_nombre
            FROM ordenesdecompra oc
            LEFT JOIN administradores a ON oc.admin_creador_id = a.adminid
            LEFT JOIN usuarios u ON oc.usuario_creador_id = u.usuarioid
            WHERE oc.grupo_id = $1 AND oc.tenant_id = $2
            ORDER BY oc.fechacreacion ASC`,
            [grupoId, tenant_id]
        );

        const ordenes = ordenesQuery.rows;

        // Crear workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Reporte Interno');

        // Configurar columnas
        worksheet.columns = [
            { header: 'ORDEN', key: 'orden', width: 10 },
            { header: 'SKU', key: 'sku', width: 15 },
            { header: 'PRODUCTO', key: 'producto', width: 35 },
            { header: 'VARIANTE', key: 'variante', width: 25 },
            { header: 'PIEZAS', key: 'piezas', width: 12 },
            { header: 'COSTO/PIEZA', key: 'costo_pieza', width: 15 },
            { header: 'TOTAL', key: 'total', width: 15 }
        ];

        // Título
        worksheet.mergeCells('A1:G1');
        const titleCell = worksheet.getCell('A1');
        titleCell.value = 'REPORTE INTERNO - GRUPO DE ÓRDENES';
        titleCell.font = { size: 16, bold: true, color: { argb: 'FFF97316' } };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        titleCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFF7ED' }
        };

        // Información del grupo
        worksheet.mergeCells('A2:G2');
        const infoCell = worksheet.getCell('A2');
        infoCell.value = `${grupo.nombre_grupo || `Grupo #${grupoId}`} - ${grupo.proveedor_nombre}`;
        infoCell.font = { size: 12, bold: true };
        infoCell.alignment = { horizontal: 'center' };

        worksheet.mergeCells('A3:G3');
        const dateCell = worksheet.getCell('A3');
        dateCell.value = `Fecha: ${new Date(grupo.created_at).toLocaleDateString('es-MX')}`;
        dateCell.alignment = { horizontal: 'center' };

        // Espacio
        worksheet.addRow([]);

        let currentRow = 5;
        let totalPiezasGlobal = 0;
        let totalValorGlobal = 0;

        // Iterar sobre cada orden
        for (const orden of ordenes) {
            // Header de orden
            worksheet.mergeCells(`A${currentRow}:G${currentRow}`);
            const ordenHeaderCell = worksheet.getCell(`A${currentRow}`);
            const creadorNombre = orden.admin_creador_nombre || orden.usuario_creador_nombre || 'Sistema';
            const fechaCreacion = new Date(orden.fechacreacion).toLocaleDateString('es-MX');
            ordenHeaderCell.value = `ORDEN #${orden.ordencompraid} - Creada por: ${creadorNombre} | ${fechaCreacion}`;
            ordenHeaderCell.font = { bold: true, size: 11 };
            ordenHeaderCell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE5E7EB' }
            };
            ordenHeaderCell.alignment = { horizontal: 'left', vertical: 'middle' };
            currentRow++;

            // Header de tabla
            const headerRow = worksheet.getRow(currentRow);
            headerRow.values = ['', 'SKU', 'PRODUCTO', 'VARIANTE', 'PIEZAS', 'COSTO/PIEZA', 'TOTAL'];
            headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            headerRow.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFF97316' }
            };
            headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
            headerRow.height = 20;
            currentRow++;

            // Obtener detalles de la orden
            const detallesQuery = await db.query(
                `SELECT 
                    p.sku,
                    p.nombre as producto_nombre,
                    pv.dimensionesfisicas,
                    pv.color,
                    doc.cantidadpaquetes,
                    tp.piezasporpaquete,
                    doc.subtotal
                FROM detallesordencompra doc
                LEFT JOIN productos p ON doc.productoid = p.productoid
                LEFT JOIN producto_variantes pv ON doc.varianteid = pv.varianteid
                LEFT JOIN cat_tamanopaquetes tp ON doc.tamanoid = tp.tamanaid
                WHERE doc.ordencompraid = $1
                ORDER BY p.nombre ASC`,
                [orden.ordencompraid]
            );

            const detalles = detallesQuery.rows;

            let totalPiezasOrden = 0;
            let totalValorOrden = 0;

            detalles.forEach((det, index) => {
                const cantidadPaquetes = parseInt(det.cantidadpaquetes || 0);
                const piezasPorPaquete = parseInt(det.piezasporpaquete || 1);
                const totalPiezas = cantidadPaquetes * piezasPorPaquete;
                const subtotal = parseFloat(det.subtotal || 0);
                const costoPorPieza = totalPiezas > 0 ? subtotal / totalPiezas : 0;

                totalPiezasOrden += totalPiezas;
                totalValorOrden += subtotal;

                const variante = det.color 
                    ? `${det.dimensionesfisicas || ''} - ${det.color}`
                    : (det.dimensionesfisicas || '');

                const row = worksheet.getRow(currentRow);
                row.values = {
                    orden: '',
                    sku: det.sku || 'N/A',
                    producto: det.producto_nombre || 'N/A',
                    variante: variante,
                    piezas: totalPiezas,
                    costo_pieza: costoPorPieza,
                    total: subtotal
                };

                // Formato de números
                row.getCell('piezas').numFmt = '#,##0';
                row.getCell('costo_pieza').numFmt = '$#,##0.00';
                row.getCell('total').numFmt = '$#,##0.00';

                // Fila alternada
                if (index % 2 === 0) {
                    row.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFF9FAFB' }
                    };
                }

                currentRow++;
            });

            totalPiezasGlobal += totalPiezasOrden;
            totalValorGlobal += totalValorOrden;

            // Subtotal de la orden
            const subtotalRow = worksheet.getRow(currentRow);
            subtotalRow.values = {
                orden: '',
                sku: '',
                producto: '',
                variante: `Subtotal Orden #${orden.ordencompraid}:`,
                piezas: totalPiezasOrden,
                costo_pieza: '',
                total: totalValorOrden
            };
            subtotalRow.font = { bold: true };
            subtotalRow.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFDCFCE7' }
            };
            subtotalRow.getCell('piezas').numFmt = '#,##0';
            subtotalRow.getCell('total').numFmt = '$#,##0.00';
            subtotalRow.getCell('total').font = { bold: true, color: { argb: 'FF10B981' } };
            currentRow++;

            // Espacio entre órdenes
            currentRow++;
        }

        // Totales generales
        currentRow++;
        const totalRow = worksheet.getRow(currentRow);
        totalRow.values = {
            orden: '',
            sku: '',
            producto: '',
            variante: 'TOTALES GENERALES:',
            piezas: totalPiezasGlobal,
            costo_pieza: '',
            total: totalValorGlobal
        };
        totalRow.font = { bold: true, size: 12 };
        totalRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFF7ED' }
        };
        totalRow.getCell('piezas').numFmt = '#,##0';
        totalRow.getCell('total').numFmt = '$#,##0.00';
        totalRow.getCell('total').font = { bold: true, size: 12, color: { argb: 'FFF97316' } };

        // Bordes
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber >= 5) {
                row.eachCell((cell) => {
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                        right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
                    };
                });
            }
        });

        // Enviar archivo
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="Grupo-${grupoId}-Interno.xlsx"`);

        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error('❌ Error generando Excel interno:', error);
        res.status(500).json({ error: 'Error al generar Excel' });
    }
}

module.exports = {
    generarExcelProveedorGrupo,
    generarExcelInternoGrupo
};
