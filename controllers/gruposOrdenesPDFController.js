const PDFDocument = require('pdfkit');
const db = require('../db');
const path = require('path');
const fs = require('fs');

/**
 * Genera PDF CONSOLIDADO para PROVEEDOR
 * Agrupa productos idénticos sumando cantidades
 * Muestra PIEZAS como unidad principal
 */
async function generarPDFProveedorGrupo(req, res) {
    const grupoId = parseInt(req.params.id);
    const { tenant_id } = req.tenant;

    try {
        // Obtener información del grupo
        const grupoQuery = await db.query(
            `SELECT 
                og.grupoid,
                og.nombre_grupo,
                og.created_at,
                og.estatus,
                p.nombreempresa as proveedor_nombre,
                p.contactonombre as proveedor_contacto,
                p.telefono as proveedor_telefono,
                p.email as proveedor_email,
                p.calle as proveedor_direccion
            FROM ordenes_grupos og
            LEFT JOIN proveedores p ON og.proveedorid = p.proveedorid
            WHERE og.grupoid = $1 AND og.tenant_id = $2`,
            [grupoId, tenant_id]
        );

        if (grupoQuery.rows.length === 0) {
            return res.status(404).json({ error: 'Grupo no encontrado' });
        }

        const grupo = grupoQuery.rows[0];

        // Obtener productos CONSOLIDADOS (sumados por SKU + variante)
        const productosQuery = await db.query(
            `SELECT 
                p.productoid,
                p.nombreproducto as producto_nombre,
                p.sku_maestro as sku,
                pv.varianteid,
                pv.dimensiones as dimensionesfisicas,
                pv.color_nombre as color,
                doc.piezasporpaquete,
                SUM(doc.cantidadsolicitada) as total_paquetes,
                AVG(doc.costounitario) as costo_promedio,
                SUM(doc.cantidadsolicitada * doc.costounitario) as subtotal_total
            FROM ordenesdecompra oc
            INNER JOIN detallesordencompra doc ON oc.ordencompraid = doc.ordencompraid
            LEFT JOIN producto_variantes pv ON doc.varianteid = pv.varianteid
            LEFT JOIN productos p ON pv.productoid = p.productoid
            WHERE oc.grupo_id = $1 AND oc.tenant_id = $2
            GROUP BY p.productoid, p.nombreproducto, p.sku_maestro, pv.varianteid, 
                     pv.dimensiones, pv.color_nombre, doc.piezasporpaquete
            ORDER BY p.nombreproducto ASC`,
            [grupoId, tenant_id]
        );

        const productos = productosQuery.rows;

        // Crear PDF
        const doc = new PDFDocument({ 
            size: 'LETTER',
            margins: { top: 50, bottom: 50, left: 50, right: 50 }
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="Grupo-${grupoId}-Proveedor.pdf"`);

        doc.pipe(res);

        // Logo
        const logoPath = path.join(__dirname, '..', 'icon', 'Logo_Razo.png');
        let logoExists = false;
        try {
            if (fs.existsSync(logoPath)) {
                logoExists = true;
                doc.image(logoPath, 50, 45, { width: 80 });
            }
        } catch (err) {
            console.log('Logo no encontrado');
        }

        // Header
        doc.fontSize(20)
           .font('Helvetica-Bold')
           .fillColor('#F97316')
           .text('ORDEN DE COMPRA CONSOLIDADA', 140, 50, { align: 'left' });

        doc.fontSize(12)
           .font('Helvetica')
           .fillColor('#666666')
           .text(grupo.nombre_grupo || `Grupo #${grupoId}`, 140, 75);

        // Línea separadora
        doc.moveTo(50, 100)
           .lineTo(562, 100)
           .strokeColor('#F97316')
           .lineWidth(2)
           .stroke();

        // Información del proveedor y fecha
        let yPos = 120;

        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor('#666666')
           .text('PROVEEDOR:', 50, yPos);

        doc.font('Helvetica')
           .fillColor('#333333')
           .text(grupo.proveedor_nombre || 'N/A', 50, yPos + 12);

        if (grupo.proveedor_contacto) {
            doc.text(`Contacto: ${grupo.proveedor_contacto}`, 50, yPos + 24);
        }

        if (grupo.proveedor_telefono) {
            doc.text(`Tel: ${grupo.proveedor_telefono}`, 50, yPos + 36);
        }

        doc.font('Helvetica-Bold')
           .fillColor('#666666')
           .text('FECHA:', 350, yPos);

        doc.font('Helvetica')
           .fillColor('#333333')
           .text(new Date(grupo.created_at).toLocaleDateString('es-MX', {
               year: 'numeric',
               month: 'long',
               day: 'numeric'
           }), 350, yPos + 12);

        doc.font('Helvetica-Bold')
           .fillColor('#666666')
           .text('GRUPO ID:', 350, yPos + 30);

        doc.font('Helvetica')
           .fillColor('#333333')
           .text(`#${grupoId}`, 350, yPos + 42);

        yPos = 200;

        // Tabla de productos
        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor('#FFFFFF')
           .rect(50, yPos, 512, 20)
           .fillAndStroke('#F97316', '#F97316');

        doc.fillColor('#FFFFFF')
           .text('SKU', 55, yPos + 6)
           .text('DESCRIPCIÓN', 120, yPos + 6)
           .text('PIEZAS', 380, yPos + 6, { align: 'center', width: 60 })
           .text('COSTO/PZA', 450, yPos + 6)
           .text('TOTAL', 510, yPos + 6, { align: 'right', width: 45 });

        yPos += 25;

        let totalPiezasGeneral = 0;
        let totalValorGeneral = 0;

        productos.forEach((prod, index) => {
            if (yPos > 720) {
                doc.addPage();
                yPos = 50;
            }

            // Fila alternada
            if (index % 2 === 0) {
                doc.rect(50, yPos - 5, 512, 30)
                   .fillAndStroke('#F9F9F9', '#F9F9F9');
            }

            const totalPaquetes = parseInt(prod.total_paquetes || 0);
            const piezasPorPaquete = parseInt(prod.piezasporpaquete || 1);
            const totalPiezas = totalPaquetes * piezasPorPaquete;
            const costoPromedio = parseFloat(prod.costo_promedio || 0);
            const subtotal = parseFloat(prod.subtotal_total || 0);
            const costoPorPieza = totalPiezas > 0 ? subtotal / totalPiezas : 0;

            totalPiezasGeneral += totalPiezas;
            totalValorGeneral += subtotal;

            const descripcion = prod.producto_nombre || 'N/A';
            const variante = prod.color 
                ? `${prod.dimensionesfisicas || ''} - ${prod.color}`
                : (prod.dimensionesfisicas || '');

            doc.fillColor('#333333')
               .fontSize(9)
               .font('Helvetica')
               .text(prod.sku || 'N/A', 55, yPos, { width: 60, ellipsis: true })
               .text(descripcion, 120, yPos, { width: 250 })
               .text(variante, 120, yPos + 10, { width: 250, fontSize: 8, fillColor: '#999999' })
               .fillColor('#333333')
               .font('Helvetica-Bold')
               .text(totalPiezas.toLocaleString('es-MX'), 380, yPos, { align: 'center', width: 60 })
               .font('Helvetica')
               .text(`$${costoPorPieza.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 450, yPos)
               .font('Helvetica-Bold')
               .text(`$${subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 510, yPos, { align: 'right', width: 45 });

            yPos += 30;
        });

        // Espacio antes del resumen
        if (yPos > 650) {
            doc.addPage();
            yPos = 50;
        } else {
            yPos += 20;
        }

        // Línea separadora
        doc.moveTo(50, yPos)
           .lineTo(562, yPos)
           .strokeColor('#CCCCCC')
           .lineWidth(1)
           .stroke();

        yPos += 15;

        // Resumen Financiero
        const boxX = 350;
        const boxWidth = 212;
        const boxHeight = 70;
        
        doc.save();
        doc.roundedRect(boxX, yPos, boxWidth, boxHeight, 5)
           .fillAndStroke('#FFF7ED', '#F97316');
        doc.restore();
        
        // Título del box
        doc.fontSize(11)
           .font('Helvetica-Bold')
           .fillColor('#F97316')
           .text('RESUMEN FINANCIERO', boxX + 5, yPos + 8, { width: boxWidth - 10, align: 'center' });
        
        // Línea separadora
        doc.moveTo(boxX + 10, yPos + 22)
           .lineTo(boxX + boxWidth - 10, yPos + 22)
           .strokeColor('#F97316')
           .lineWidth(0.5)
           .stroke();
        
        // Total Piezas
        doc.fontSize(9)
           .font('Helvetica')
           .fillColor('#666666')
           .text('Total Piezas:', boxX + 10, yPos + 30);
        
        doc.font('Helvetica-Bold')
           .fillColor('#333333')
           .text(`${totalPiezasGeneral.toLocaleString('es-MX')} pzas`, boxX + boxWidth - 90, yPos + 30, { width: 80, align: 'right' });
        
        // Total Valor
        doc.fontSize(9)
           .font('Helvetica')
           .fillColor('#666666')
           .text('COSTO TOTAL:', boxX + 10, yPos + 48);
        
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor('#F97316')
           .text(`$${totalValorGeneral.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, boxX + boxWidth - 120, yPos + 45, { width: 110, align: 'right' });

        // Footer
        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('#999999')
           .text('Este documento es una orden de compra consolidada. Por favor, verifique las cantidades antes de surtir.', 50, 750, { align: 'center', width: 512 });

        doc.end();

    } catch (error) {
        console.error('❌ Error generando PDF proveedor:', error);
        res.status(500).json({ error: 'Error al generar PDF' });
    }
}

/**
 * Genera PDF DESGLOSADO para ADMINISTRACIÓN
 * Muestra cada orden por separado con su creador
 * Muestra PIEZAS como unidad principal
 */
async function generarPDFInternoGrupo(req, res) {
    const grupoId = parseInt(req.params.id);
    const { tenant_id } = req.tenant;

    try {
        // Obtener información del grupo
        const grupoQuery = await db.query(
            `SELECT 
                og.grupoid,
                og.nombre_grupo,
                og.created_at,
                og.estatus,
                p.nombreempresa as proveedor_nombre,
                a.nombre as admin_nombre
            FROM ordenes_grupos og
            LEFT JOIN proveedores p ON og.proveedorid = p.proveedorid
            LEFT JOIN administradores a ON og.admin_creador_id = a.adminid
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
                oc.fechaentregaesperada,
                oc.estatus as orden_estatus,
                oc.origenoc,
                oc.total,
                oc.usuario_creador_id,
                oc.admin_creador_id,
                a.nombre as admin_creador_nombre,
                au.nombre as usuario_creador_nombre
            FROM ordenesdecompra oc
            LEFT JOIN administradores a ON oc.admin_creador_id = a.adminid
            LEFT JOIN administradores au ON oc.usuario_creador_id = au.adminid
            WHERE oc.grupo_id = $1 AND oc.tenant_id = $2
            ORDER BY oc.fechacreacion ASC`,
            [grupoId, tenant_id]
        );

        const ordenes = ordenesQuery.rows;

        // Crear PDF
        const doc = new PDFDocument({ 
            size: 'LETTER',
            margins: { top: 50, bottom: 50, left: 50, right: 50 }
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="Grupo-${grupoId}-Interno.pdf"`);

        doc.pipe(res);

        // Logo
        const logoPath = path.join(__dirname, '..', 'icon', 'Logo_Razo.png');
        let logoExists = false;
        try {
            if (fs.existsSync(logoPath)) {
                logoExists = true;
                doc.image(logoPath, 50, 45, { width: 80 });
            }
        } catch (err) {
            console.log('Logo no encontrado');
        }

        // Header
        doc.fontSize(20)
           .font('Helvetica-Bold')
           .fillColor('#F97316')
           .text('REPORTE INTERNO - GRUPO DE ÓRDENES', 140, 50, { align: 'left', width: 400 });

        doc.fontSize(12)
           .font('Helvetica')
           .fillColor('#666666')
           .text(grupo.nombre_grupo || `Grupo #${grupoId}`, 140, 75);

        // Línea separadora
        doc.moveTo(50, 100)
           .lineTo(562, 100)
           .strokeColor('#F97316')
           .lineWidth(2)
           .stroke();

        // Información del grupo
        let yPos = 120;

        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor('#666666')
           .text('PROVEEDOR:', 50, yPos);

        doc.font('Helvetica')
           .fillColor('#333333')
           .text(grupo.proveedor_nombre || 'N/A', 50, yPos + 12);

        doc.font('Helvetica-Bold')
           .fillColor('#666666')
           .text('FECHA CREACIÓN:', 350, yPos);

        doc.font('Helvetica')
           .fillColor('#333333')
           .text(new Date(grupo.created_at).toLocaleDateString('es-MX', {
               year: 'numeric',
               month: 'long',
               day: 'numeric'
           }), 350, yPos + 12);

        yPos = 160;

        let totalPiezasGlobal = 0;
        let totalValorGlobal = 0;

        // Iterar sobre cada orden
        for (let i = 0; i < ordenes.length; i++) {
            const orden = ordenes[i];

            if (yPos > 700 || i > 0) {
                doc.addPage();
                yPos = 50;
            }

            // Header de la orden
            doc.fontSize(14)
               .font('Helvetica-Bold')
               .fillColor('#374151')
               .text(`ORDEN #${orden.ordencompraid}`, 50, yPos);

            yPos += 20;

            const creadorNombre = orden.admin_creador_nombre || orden.usuario_creador_nombre || 'Sistema';
            const fechaCreacion = new Date(orden.fechacreacion).toLocaleDateString('es-MX', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
            });

            doc.fontSize(9)
               .font('Helvetica')
               .fillColor('#6B7280')
               .text(`Creada por: ${creadorNombre} | ${fechaCreacion}`, 50, yPos);

            yPos += 25;

            // Obtener detalles de la orden
            const detallesQuery = await db.query(
                `SELECT 
                    doc.detalleoc_id,
                    doc.varianteid,
                    doc.cantidadsolicitada,
                    doc.costounitario,
                    doc.piezasporpaquete,
                    pv.productoid,
                    p.nombreproducto as producto_nombre,
                    p.sku_maestro as sku,
                    pv.dimensiones as dimensionesfisicas,
                    pv.color_nombre as color
                FROM detallesordencompra doc
                LEFT JOIN producto_variantes pv ON doc.varianteid = pv.varianteid
                LEFT JOIN productos p ON pv.productoid = p.productoid
                WHERE doc.ordencompraid = $1
                ORDER BY p.nombreproducto ASC`,
                [orden.ordencompraid]
            );

            const detalles = detallesQuery.rows;

            // Tabla de productos
            doc.fontSize(9)
               .font('Helvetica-Bold')
               .fillColor('#FFFFFF')
               .rect(50, yPos, 512, 20)
               .fillAndStroke('#F97316', '#F97316');

            doc.fillColor('#FFFFFF')
               .text('SKU', 55, yPos + 6)
               .text('DESCRIPCIÓN', 120, yPos + 6)
               .text('PIEZAS', 380, yPos + 6, { align: 'center', width: 60 })
               .text('COSTO/PZA', 450, yPos + 6)
               .text('TOTAL', 510, yPos + 6, { align: 'right', width: 45 });

            yPos += 25;

            let totalPiezasOrden = 0;
            let totalValorOrden = 0;

            detalles.forEach((det, index) => {
                if (yPos > 720) {
                    doc.addPage();
                    yPos = 50;
                }

                // Fila alternada
                if (index % 2 === 0) {
                    doc.rect(50, yPos - 5, 512, 30)
                       .fillAndStroke('#F9F9F9', '#F9F9F9');
                }

                const cantidadPaquetes = parseInt(det.cantidadsolicitada || 0);
                const piezasPorPaquete = parseInt(det.piezasporpaquete || 1);
                const totalPiezas = cantidadPaquetes * piezasPorPaquete;
                const costoUnitario = parseFloat(det.costounitario || 0);
                const subtotal = costoUnitario * cantidadPaquetes;
                const costoPorPieza = totalPiezas > 0 ? subtotal / totalPiezas : 0;

                totalPiezasOrden += totalPiezas;
                totalValorOrden += subtotal;

                const descripcion = det.producto_nombre || 'N/A';
                const variante = det.color 
                    ? `${det.dimensionesfisicas || ''} - ${det.color}`
                    : (det.dimensionesfisicas || '');

                doc.fillColor('#333333')
                   .fontSize(8)
                   .font('Helvetica')
                   .text(det.sku || 'N/A', 55, yPos, { width: 60, ellipsis: true })
                   .text(descripcion, 120, yPos, { width: 250 })
                   .text(variante, 120, yPos + 10, { width: 250, fontSize: 7, fillColor: '#999999' })
                   .fillColor('#333333')
                   .font('Helvetica-Bold')
                   .text(totalPiezas.toLocaleString('es-MX'), 380, yPos, { align: 'center', width: 60 })
                   .font('Helvetica')
                   .text(`$${costoPorPieza.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 450, yPos)
                   .font('Helvetica-Bold')
                   .text(`$${subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 510, yPos, { align: 'right', width: 45 });

                yPos += 30;
            });

            totalPiezasGlobal += totalPiezasOrden;
            totalValorGlobal += totalValorOrden;

            // Totales de la orden
            yPos += 10;

            doc.fontSize(9)
               .font('Helvetica')
               .fillColor('#6B7280')
               .text(`Piezas: ${totalPiezasOrden.toLocaleString('es-MX')}`, 380, yPos, { align: 'right', width: 60 });

            doc.fontSize(10)
               .font('Helvetica-Bold')
               .fillColor('#10B981')
               .text(`Total: $${totalValorOrden.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 450, yPos, { align: 'right', width: 105 });

            yPos += 30;
        }

        // Página final con totales generales
        doc.addPage();
        yPos = 50;

        doc.fontSize(16)
           .font('Helvetica-Bold')
           .fillColor('#374151')
           .text('TOTALES GENERALES', 50, yPos);

        yPos += 40;

        // Resumen Financiero Global
        const boxX = 180;
        const boxWidth = 250;
        const boxHeight = 100;
        
        doc.save();
        doc.roundedRect(boxX, yPos, boxWidth, boxHeight, 5)
           .fillAndStroke('#FFF7ED', '#F97316');
        doc.restore();
        
        // Título del box
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#F97316')
           .text('RESUMEN FINANCIERO', boxX + 5, yPos + 10, { width: boxWidth - 10, align: 'center' });
        
        // Línea separadora
        doc.moveTo(boxX + 15, yPos + 28)
           .lineTo(boxX + boxWidth - 15, yPos + 28)
           .strokeColor('#F97316')
           .lineWidth(0.5)
           .stroke();
        
        // Órdenes
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#666666')
           .text('Órdenes:', boxX + 15, yPos + 38);
        
        doc.font('Helvetica-Bold')
           .fillColor('#333333')
           .text(ordenes.length.toString(), boxX + boxWidth - 60, yPos + 38, { width: 45, align: 'right' });
        
        // Total Piezas
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#666666')
           .text('Total Piezas:', boxX + 15, yPos + 54);
        
        doc.font('Helvetica-Bold')
           .fillColor('#333333')
           .text(`${totalPiezasGlobal.toLocaleString('es-MX')} pzas`, boxX + boxWidth - 100, yPos + 54, { width: 85, align: 'right' });
        
        // Total Valor
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#666666')
           .text('TOTAL:', boxX + 15, yPos + 72);
        
        doc.fontSize(16)
           .font('Helvetica-Bold')
           .fillColor('#F97316')
           .text(`$${totalValorGlobal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, boxX + boxWidth - 140, yPos + 68, { width: 125, align: 'right' });

        // Footer
        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('#999999')
           .text('Documento interno para administración y auditoría. No compartir con proveedores.', 50, 750, { align: 'center', width: 512 });

        doc.end();

    } catch (error) {
        console.error('❌ Error generando PDF interno:', error);
        res.status(500).json({ error: 'Error al generar PDF' });
    }
}

module.exports = {
    generarPDFProveedorGrupo,
    generarPDFInternoGrupo
};
