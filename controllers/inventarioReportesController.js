const pool = require('../db');
const PDFDocument = require('pdfkit');
const { format } = require('date-fns');
const { es } = require('date-fns/locale');

/**
 * GET /api/admin/inventario/sesiones
 * Obtiene el listado histórico de sesiones de inventario cerradas
 */
async function obtenerSesionesInventario(req, res) {
    const { tenant_id } = req.tenant;
    const { search = '', page = 1, limit = 10 } = req.query;

    try {
        const offset = (parseInt(page) - 1) * parseInt(limit);

        const query = `
            SELECT 
                s.sesionid,
                s.nombre,
                s.fechainicio,
                s.fechacierre,
                s.estatus,
                a.nombre AS admin_nombre,
                a.apellido AS admin_apellido,
                COUNT(DISTINCT c.usuario_a_id) FILTER (WHERE c.usuario_a_id IS NOT NULL) +
                COUNT(DISTINCT c.usuario_b_id) FILTER (WHERE c.usuario_b_id IS NOT NULL) AS total_agentes,
                COUNT(c.conteoid) AS total_productos,
                COUNT(c.conteoid) FILTER (WHERE c.estatus_fila = 'VALIDADO' AND c.conteo_a = c.conteo_b) AS coincidencias,
                COUNT(c.conteoid) FILTER (WHERE c.estatus_fila = 'VALIDADO' AND c.conteo_a != c.conteo_b) AS discrepancias
            FROM toma_inventario_sesiones s
            LEFT JOIN administradores a ON a.adminid = s.usuario_creador_id
            LEFT JOIN toma_inventario_conteos c ON c.sesionid = s.sesionid AND c.tenant_id = s.tenant_id
            WHERE s.tenant_id = $1
            AND s.estatus IN ('CERRADA', 'APLICADA', 'APLICADA_PARCIAL')
            AND (
                LOWER(s.nombre) LIKE LOWER($2)
                OR LOWER(a.nombre || ' ' || a.apellido) LIKE LOWER($2)
            )
            GROUP BY s.sesionid, s.nombre, s.fechainicio, s.fechacierre, s.estatus, a.nombre, a.apellido
            ORDER BY s.fechacierre DESC NULLS LAST, s.fechainicio DESC
            LIMIT $3 OFFSET $4
        `;

        const countQuery = `
            SELECT COUNT(DISTINCT s.sesionid) as total
            FROM toma_inventario_sesiones s
            LEFT JOIN administradores a ON a.adminid = s.usuario_creador_id
            WHERE s.tenant_id = $1
            AND s.estatus IN ('CERRADA', 'APLICADA', 'APLICADA_PARCIAL')
            AND (
                LOWER(s.nombre) LIKE LOWER($2)
                OR LOWER(a.nombre || ' ' || a.apellido) LIKE LOWER($2)
            )
        `;

        const searchPattern = `%${search}%`;

        const [sesionesResult, countResult] = await Promise.all([
            pool.query(query, [tenant_id, searchPattern, parseInt(limit), offset]),
            pool.query(countQuery, [tenant_id, searchPattern])
        ]);

        const totalRecords = parseInt(countResult.rows[0].total);
        const totalPages = Math.ceil(totalRecords / parseInt(limit));

        res.json({
            success: true,
            data: sesionesResult.rows,
            pagination: {
                currentPage: parseInt(page),
                totalPages,
                totalRecords,
                limit: parseInt(limit)
            }
        });

    } catch (error) {
        console.error('❌ [ERROR] obtenerSesionesInventario:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener sesiones de inventario',
            error: error.message
        });
    }
}

/**
 * GET /api/admin/inventario/reporte/:sesionId
 * Genera un reporte PDF detallado de una sesión de inventario
 */
async function generarReportePDF(req, res) {
    const { tenant_id } = req.tenant;
    const { sesionId } = req.params;

    try {
        const sesionQuery = `
            SELECT 
                s.sesionid,
                s.nombre,
                s.fechainicio,
                s.fechacierre,
                s.estatus,
                a.nombre AS admin_nombre,
                a.apellido AS admin_apellido,
                t.nombre_cliente AS tenant_nombre
            FROM toma_inventario_sesiones s
            LEFT JOIN administradores a ON a.adminid = s.usuario_creador_id
            LEFT JOIN tenants t ON t.tenant_id = s.tenant_id
            WHERE s.sesionid = $1 AND s.tenant_id = $2
        `;

        const sesionResult = await pool.query(sesionQuery, [sesionId, tenant_id]);

        if (sesionResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Sesión de inventario no encontrada'
            });
        }

        const sesion = sesionResult.rows[0];

        const agentesQuery = `
            SELECT DISTINCT
                COALESCE(ag1.nombre, adm1.nombre) AS nombre,
                COALESCE(ag1.apellido, adm1.apellido) AS apellido,
                CASE 
                    WHEN ag1.agenteid IS NOT NULL THEN 'Agente'
                    WHEN adm1.adminid IS NOT NULL THEN 'Admin'
                    ELSE 'Usuario'
                END AS tipo
            FROM toma_inventario_conteos c
            LEFT JOIN agentesdeventas ag1 ON ag1.agenteid = c.usuario_a_id
            LEFT JOIN administradores adm1 ON adm1.adminid = c.usuario_a_id
            WHERE c.sesionid = $1 AND c.tenant_id = $2 AND c.usuario_a_id IS NOT NULL
            UNION
            SELECT DISTINCT
                COALESCE(ag2.nombre, adm2.nombre) AS nombre,
                COALESCE(ag2.apellido, adm2.apellido) AS apellido,
                CASE 
                    WHEN ag2.agenteid IS NOT NULL THEN 'Agente'
                    WHEN adm2.adminid IS NOT NULL THEN 'Admin'
                    ELSE 'Usuario'
                END AS tipo
            FROM toma_inventario_conteos c
            LEFT JOIN agentesdeventas ag2 ON ag2.agenteid = c.usuario_b_id
            LEFT JOIN administradores adm2 ON adm2.adminid = c.usuario_b_id
            WHERE c.sesionid = $1 AND c.tenant_id = $2 AND c.usuario_b_id IS NOT NULL
            ORDER BY tipo, nombre
        `;

        const agentesResult = await pool.query(agentesQuery, [sesionId, tenant_id]);

        const conteosQuery = `
            SELECT 
                c.conteoid,
                pv.sku,
                p.nombreproducto AS producto_nombre,
                pv.color_nombre,
                pv.dimensiones,
                pv.costounitario,
                pv.preciounitario,
                cat.nombre AS categoria_nombre,
                ia.cantidad AS stock_teorico,
                c.conteo_a,
                c.conteo_b,
                c.cantidad_final,
                c.estatus_fila,
                COALESCE(c.cantidad_final, c.conteo_a, c.conteo_b, 0) - COALESCE(ia.cantidad, 0) AS diferencia
            FROM toma_inventario_conteos c
            INNER JOIN producto_variantes pv ON pv.varianteid = c.varianteid
            INNER JOIN productos p ON p.productoid = pv.productoid
            LEFT JOIN categorias cat ON cat.categoriaid = p.categoriaid
            LEFT JOIN stock_admin ia ON ia.variante_id = c.varianteid AND ia.admin_id = $3
            WHERE c.sesionid = $1 AND c.tenant_id = $2
            ORDER BY 
                CASE 
                    WHEN c.estatus_fila = 'VALIDADO' AND c.conteo_a = c.conteo_b THEN 1
                    ELSE 2
                END,
                pv.sku
        `;

        const conteosResult = await pool.query(conteosQuery, [sesionId, tenant_id, req.user.userId]);

        const coincidencias = conteosResult.rows.filter(row => 
            row.estatus_fila === 'VALIDADO' && row.diferencia === 0
        );
        const discrepancias = conteosResult.rows.filter(row => 
            row.estatus_fila === 'VALIDADO' && row.diferencia !== 0
        );

        const doc = new PDFDocument({
            size: 'LETTER',
            margins: { top: 50, bottom: 50, left: 50, right: 50 }
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Reporte_Inventario_${sesionId}_${format(new Date(), 'yyyyMMdd')}.pdf"`);

        doc.pipe(res);

        let currentPage = 1;

        function addHeader() {
            doc.fontSize(18).fillColor('#F97316').text(`INVENTARIO DE ${(sesion.tenant_nombre || 'RazoConnect').toUpperCase()}`, 50, 50, { align: 'center' });
            doc.fontSize(10).fillColor('#666666').text('Reporte de Toma de Inventario', 50, 75, { align: 'center' });
            doc.moveTo(50, 95).lineTo(562, 95).stroke('#F97316');
        }

        function addFooter() {
            const footerY = 742;
            doc.fontSize(8).fillColor('#999999');
            doc.text(`Página ${currentPage}`, 50, footerY, { align: 'center', width: 512 });
            doc.text(`Generado: ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: es })}`, 50, footerY + 12, { align: 'center', width: 512 });
            currentPage++;
        }

        addHeader();

        doc.fontSize(12).fillColor('#333333');
        doc.text('Resumen Ejecutivo', 50, 110, { underline: true });

        doc.fontSize(10).fillColor('#666666');
        let yPos = 135;

        doc.text(`Sesión: ${sesion.nombre}`, 50, yPos);
        yPos += 20;
        doc.text(`Responsable: ${sesion.admin_nombre} ${sesion.admin_apellido}`, 50, yPos);
        yPos += 20;
        doc.text(`Fecha Inicio: ${format(new Date(sesion.fechainicio), "dd/MM/yyyy HH:mm", { locale: es })}`, 50, yPos);
        yPos += 20;
        if (sesion.fechacierre) {
            doc.text(`Fecha Cierre: ${format(new Date(sesion.fechacierre), "dd/MM/yyyy HH:mm", { locale: es })}`, 50, yPos);
            yPos += 20;
        }
        doc.text(`Estado: ${sesion.estatus}`, 50, yPos);
        yPos += 30;

        doc.fontSize(11).fillColor('#333333').text('Participantes:', 50, yPos);
        yPos += 20;
        doc.fontSize(9).fillColor('#666666');
        agentesResult.rows.forEach(agente => {
            doc.text(`• ${agente.nombre} ${agente.apellido} (${agente.tipo})`, 70, yPos);
            yPos += 15;
        });

        yPos += 20;
        doc.fontSize(11).fillColor('#333333').text('Estadísticas:', 50, yPos);
        yPos += 20;
        doc.fontSize(9).fillColor('#666666');
        doc.text(`Total de productos contados: ${conteosResult.rows.length}`, 70, yPos);
        yPos += 15;
        doc.fillColor('#10B981').text(`Coincidencias: ${coincidencias.length}`, 70, yPos);
        yPos += 15;
        doc.fillColor('#EF4444').text(`Discrepancias: ${discrepancias.length}`, 70, yPos);

        doc.addPage();
        currentPage++;
        addHeader();

        doc.fontSize(12).fillColor('#10B981');
        doc.text('COINCIDENCIAS', 50, 110, { underline: true });

        if (coincidencias.length > 0) {
            yPos = 140;

            const tableHeaders = ['SKU', 'Producto', 'Color', 'Teórico', 'Contado'];
            const colWidths = [70, 220, 80, 60, 60];
            let xPos = 50;

            doc.fontSize(9).fillColor('#FFFFFF').fillOpacity(1);
            doc.rect(50, yPos, 512, 20).fill('#10B981');

            doc.fillColor('#FFFFFF');
            tableHeaders.forEach((header, i) => {
                doc.text(header, xPos + 5, yPos + 5, { width: colWidths[i], align: i > 1 ? 'center' : 'left' });
                xPos += colWidths[i];
            });

            yPos += 20;
            doc.fillColor('#333333');

            coincidencias.forEach((item, index) => {
                if (yPos > 700) {
                    addFooter();
                    doc.addPage();
                    currentPage++;
                    addHeader();
                    yPos = 110;
                }

                const bgColor = index % 2 === 0 ? '#F9FAFB' : '#FFFFFF';
                doc.rect(50, yPos, 512, 18).fill(bgColor);

                xPos = 50;
                doc.fillColor('#333333').fontSize(8);
                doc.text(item.sku || 'N/A', xPos + 5, yPos + 4, { width: colWidths[0] });
                xPos += colWidths[0];
                doc.text(item.producto_nombre || 'Sin nombre', xPos + 5, yPos + 4, { width: colWidths[1], ellipsis: true });
                xPos += colWidths[1];
                doc.text(item.color_nombre || 'N/A', xPos + 5, yPos + 4, { width: colWidths[2] });
                xPos += colWidths[2];
                doc.text(String(item.stock_teorico || 0), xPos + 5, yPos + 4, { width: colWidths[3], align: 'center' });
                xPos += colWidths[3];
                doc.text(String(item.cantidad_final || 0), xPos + 5, yPos + 4, { width: colWidths[4], align: 'center' });

                yPos += 18;
            });
        } else {
            doc.fontSize(10).fillColor('#666666').text('No hay coincidencias registradas', 50, 140);
        }

        doc.addPage();
        currentPage++;
        addHeader();

        doc.fontSize(12).fillColor('#EF4444');
        doc.text('DISCREPANCIAS', 50, 110, { underline: true });

        if (discrepancias.length > 0) {
            yPos = 140;

            const tableHeaders = ['SKU', 'Producto', 'Color', 'Teórico', 'Contado', 'Diferencia'];
            const colWidths = [60, 180, 70, 60, 60, 70];
            let xPos = 50;

            doc.fontSize(9).fillColor('#FFFFFF').fillOpacity(1);
            doc.rect(50, yPos, 512, 20).fill('#EF4444');

            doc.fillColor('#FFFFFF');
            tableHeaders.forEach((header, i) => {
                doc.text(header, xPos + 5, yPos + 5, { width: colWidths[i], align: i > 1 ? 'center' : 'left' });
                xPos += colWidths[i];
            });

            yPos += 20;
            doc.fillColor('#333333');

            discrepancias.forEach((item, index) => {
                if (yPos > 700) {
                    addFooter();
                    doc.addPage();
                    currentPage++;
                    addHeader();
                    yPos = 110;
                }

                const bgColor = index % 2 === 0 ? '#FEF2F2' : '#FFFFFF';
                doc.rect(50, yPos, 512, 18).fill(bgColor);

                xPos = 50;
                doc.fillColor('#333333').fontSize(8);
                doc.text(item.sku || 'N/A', xPos + 5, yPos + 4, { width: colWidths[0] });
                xPos += colWidths[0];
                doc.text(item.producto_nombre || 'Sin nombre', xPos + 5, yPos + 4, { width: colWidths[1], ellipsis: true });
                xPos += colWidths[1];
                doc.text(item.color_nombre || 'N/A', xPos + 5, yPos + 4, { width: colWidths[2] });
                xPos += colWidths[2];
                doc.text(String(item.stock_teorico || 0), xPos + 5, yPos + 4, { width: colWidths[3], align: 'center' });
                xPos += colWidths[3];
                doc.text(String(item.cantidad_final || 0), xPos + 5, yPos + 4, { width: colWidths[4], align: 'center' });
                xPos += colWidths[4];

                const diff = item.diferencia || 0;
                const diffText = diff > 0 ? `+${diff}` : String(diff);
                const diffColor = diff > 0 ? '#10B981' : '#EF4444';
                doc.fillColor(diffColor).text(diffText, xPos + 5, yPos + 4, { width: colWidths[5], align: 'center' });

                yPos += 18;
            });
        } else {
            doc.fontSize(10).fillColor('#666666').text('No hay discrepancias registradas', 50, 140);
        }

        addFooter();

        doc.end();

    } catch (error) {
        console.error('❌ [ERROR] generarReportePDF:', error);
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: 'Error al generar reporte PDF',
                error: error.message
            });
        }
    }
}

/**
 * GET /api/admin/inventario/sesiones/:sesionId/detalle
 * Obtiene el detalle completo de una sesión con todos los conteos
 */
async function obtenerDetalleSesion(req, res) {
    const { tenant_id } = req.tenant;
    const { sesionId } = req.params;

    try {
        const sesionQuery = `
            SELECT 
                s.sesionid,
                s.nombre,
                s.fechainicio,
                s.fechacierre,
                s.estatus,
                a.nombre AS admin_nombre,
                a.apellido AS admin_apellido
            FROM toma_inventario_sesiones s
            LEFT JOIN administradores a ON a.adminid = s.usuario_creador_id
            WHERE s.sesionid = $1 AND s.tenant_id = $2
        `;

        const sesionResult = await pool.query(sesionQuery, [sesionId, tenant_id]);

        if (sesionResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Sesión de inventario no encontrada'
            });
        }

        const sesion = sesionResult.rows[0];

        const conteosQuery = `
            SELECT 
                c.conteoid,
                pv.sku,
                p.nombreproducto AS producto_nombre,
                pv.color_nombre,
                pv.dimensiones,
                pv.costounitario,
                pv.preciounitario,
                cat.nombre AS categoria_nombre,
                ia.cantidad AS stock_teorico,
                c.conteo_a,
                c.conteo_b,
                c.cantidad_final,
                c.estatus_fila,
                COALESCE(c.cantidad_final, c.conteo_a, c.conteo_b, 0) - COALESCE(ia.cantidad, 0) AS diferencia
            FROM toma_inventario_conteos c
            INNER JOIN producto_variantes pv ON pv.varianteid = c.varianteid
            INNER JOIN productos p ON p.productoid = pv.productoid
            LEFT JOIN categorias cat ON cat.categoriaid = p.categoriaid
            LEFT JOIN stock_admin ia ON ia.variante_id = c.varianteid AND ia.admin_id = $3
            WHERE c.sesionid = $1 AND c.tenant_id = $2
            ORDER BY 
                CASE 
                    WHEN c.estatus_fila = 'VALIDADO' AND c.conteo_a = c.conteo_b THEN 1
                    ELSE 2
                END,
                pv.sku
        `;

        const conteosResult = await pool.query(conteosQuery, [sesionId, tenant_id, req.user.userId]);

        res.json({
            success: true,
            data: {
                sesion,
                conteos: conteosResult.rows
            }
        });

    } catch (error) {
        console.error('❌ [ERROR] obtenerDetalleSesion:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener detalle de sesión',
            error: error.message
        });
    }
}

module.exports = {
    obtenerSesionesInventario,
    generarReportePDF,
    obtenerDetalleSesion
};
