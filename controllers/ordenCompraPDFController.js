const PDFDocument = require('pdfkit');
const db = require('../db');
const path = require('path');
const fs = require('fs');

/**
 * Genera PDF de Orden de Compra con soporte para consolidación
 * Agrupa productos por pedido_original_id y muestra indicadores visuales
 */
async function generarPDFOrdenCompra(req, res) {
    const ordenCompraId = parseInt(req.params.id);
    const { tenant_id } = req.tenant;

    try {
        const ordenQuery = await db.query(
            `SELECT 
                oc.ordencompraid,
                oc.proveedorid,
                oc.fechacreacion,
                oc.fechaentregaesperada,
                oc.estatus,
                oc.origenoc,
                oc.total,
                p.nombreproveedor,
                p.telefono AS proveedor_telefono,
                p.email AS proveedor_email,
                p.direccion AS proveedor_direccion
            FROM ordenesdecompra oc
            INNER JOIN proveedores p ON oc.proveedorid = p.proveedorid
            WHERE oc.ordencompraid = $1 AND oc.tenant_id = $2`,
            [ordenCompraId, tenant_id]
        );

        if (ordenQuery.rows.length === 0) {
            return res.status(404).json({ error: 'Orden de compra no encontrada' });
        }

        const orden = ordenQuery.rows[0];

        const detallesQuery = await db.query(
            `SELECT 
                doc.detalleoc_id,
                doc.varianteid,
                doc.cantidadsolicitada,
                doc.cantidadrecibida,
                doc.piezasporpaquete,
                doc.costounitario,
                doc.pedido_original_id,
                pv.sku,
                pv.dimensiones,
                pv.color_nombre,
                p.nombreproducto,
                p.productoid,
                COALESCE(ped.pedidoid, 0) AS pedido_id,
                COALESCE(c.nombre || ' ' || c.apellido, 'N/A') AS cliente_nombre
            FROM detallesordencompra doc
            INNER JOIN producto_variantes pv ON doc.varianteid = pv.varianteid
            INNER JOIN productos p ON pv.productoid = p.productoid
            LEFT JOIN pedidos ped ON doc.pedido_original_id = ped.pedidoid
            LEFT JOIN clientes c ON ped.clienteid = c.clienteid
            WHERE doc.ordencompraid = $1
            ORDER BY doc.pedido_original_id NULLS FIRST, doc.detalleoc_id`,
            [ordenCompraId]
        );

        const detalles = detallesQuery.rows;

        const pedidosUnicos = await db.query(
            `SELECT DISTINCT pedido_original_id
             FROM detallesordencompra
             WHERE ordencompraid = $1 AND pedido_original_id IS NOT NULL`,
            [ordenCompraId]
        );

        const esConsolidada = pedidosUnicos.rows.length > 1;

        const doc = new PDFDocument({ 
            size: 'LETTER',
            margins: { top: 50, bottom: 50, left: 50, right: 50 }
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="Orden-Compra-${ordenCompraId}.pdf"`);

        doc.pipe(res);

        const logoPath = path.join(__dirname, '..', 'icon', 'Logo_Razo.png');
        let logoExists = false;
        try {
            if (fs.existsSync(logoPath)) {
                logoExists = true;
            }
        } catch (err) {
            console.log('Logo no encontrado');
        }

        const renderHeader = (doc, orden, logoPath, logoExists) => {
            if (logoExists && fs.existsSync(logoPath)) {
                doc.image(logoPath, 50, 45, { width: 80 });
            }

            doc.fontSize(20)
               .font('Helvetica-Bold')
               .fillColor('#F97316')
               .text('RazoConnect', logoExists ? 140 : 50, 50);

            doc.fontSize(10)
               .font('Helvetica')
               .fillColor('#333333')
               .text('Sistema de Gestión Comercial', logoExists ? 140 : 50, 75);

            doc.fontSize(14)
               .font('Helvetica-Bold')
               .fillColor('#F97316')
               .text('ORDEN DE COMPRA', 350, 50, { width: 212, align: 'right' });

            doc.fontSize(9)
               .font('Helvetica')
               .fillColor('#333333')
               .text(`Folio: OC-${String(orden.ordencompraid).padStart(6, '0')}`, 350, 70, { width: 212, align: 'right' })
               .text(`Fecha: ${new Date(orden.fechacreacion).toLocaleDateString('es-MX')}`, 350, 85, { width: 212, align: 'right' })
               .text(`Estatus: ${orden.estatus}`, 350, 100, { width: 212, align: 'right' });

            if (esConsolidada) {
                doc.fontSize(8)
                   .font('Helvetica-Bold')
                   .fillColor('#DC2626')
                   .text('⚡ ORDEN CONSOLIDADA', 350, 115, { width: 212, align: 'right' });
            }

            doc.moveTo(50, 135)
               .lineTo(562, 135)
               .strokeColor('#F97316')
               .lineWidth(2)
               .stroke();

            doc.fontSize(12)
               .font('Helvetica-Bold')
               .fillColor('#F97316')
               .text('INFORMACIÓN DEL PROVEEDOR', 50, 150);

            doc.fontSize(10)
               .font('Helvetica')
               .fillColor('#333333')
               .text(`Proveedor: ${orden.nombreproveedor}`, 50, 170)
               .text(`Teléfono: ${orden.proveedor_telefono || 'N/A'}`, 50, 185)
               .text(`Email: ${orden.proveedor_email || 'N/A'}`, 50, 200);

            if (orden.fechaentregaesperada) {
                doc.text(`Fecha Entrega Esperada: ${new Date(orden.fechaentregaesperada).toLocaleDateString('es-MX')}`, 50, 215);
            }
        };

        doc.on('pageAdded', () => {
            renderHeader(doc, orden, logoPath, logoExists);
        });

        renderHeader(doc, orden, logoPath, logoExists);

        let yPosition = 250;

        const agruparPorPedido = (detalles) => {
            const grupos = new Map();
            
            detalles.forEach(detalle => {
                const key = detalle.pedido_original_id || 'MANUAL';
                if (!grupos.has(key)) {
                    grupos.set(key, []);
                }
                grupos.get(key).push(detalle);
            });

            return grupos;
        };

        const gruposPedidos = agruparPorPedido(detalles);

        const renderPedidoHeader = (pedidoId, clienteNombre, yPos) => {
            if (yPos > 680) {
                doc.addPage();
                yPos = 250;
            }

            doc.save();
            doc.strokeColor('#3B82F6')
               .lineWidth(1)
               .dash(5, { space: 3 })
               .rect(50, yPos, 512, 30)
               .stroke();
            doc.restore();

            doc.fontSize(10)
               .font('Helvetica-Bold')
               .fillColor('#3B82F6')
               .text('📦 Proveniente del Pedido:', 60, yPos + 8);

            doc.fontSize(10)
               .font('Helvetica')
               .fillColor('#333333')
               .text(`#${pedidoId} - Cliente: ${clienteNombre}`, 220, yPos + 8);

            return yPos + 40;
        };

        const renderTableHeader = (yPos) => {
            if (yPos > 680) {
                doc.addPage();
                yPos = 250;
            }

            doc.fontSize(9)
               .font('Helvetica-Bold')
               .fillColor('#FFFFFF')
               .rect(50, yPos, 512, 20)
               .fillAndStroke('#F97316', '#F97316');

            doc.fillColor('#FFFFFF')
               .text('CANT.', 55, yPos + 6)
               .text('SKU', 100, yPos + 6)
               .text('DESCRIPCIÓN', 180, yPos + 6)
               .text('PIEZAS/PAQ', 360, yPos + 6)
               .text('COSTO UNIT.', 440, yPos + 6)
               .text('TOTAL', 510, yPos + 6, { align: 'right', width: 45 });

            return yPos + 25;
        };

        const renderItems = (items, startY) => {
            let currentY = startY;
            doc.font('Helvetica').fillColor('#333333');

            items.forEach((item, index) => {
                if (currentY > 720) {
                    doc.addPage();
                    currentY = 250;
                }

                if (index % 2 === 0) {
                    doc.rect(50, currentY - 5, 512, 25)
                       .fillAndStroke('#F9F9F9', '#F9F9F9');
                }

                const descripcion = `${item.nombreproducto}`;
                const variante = item.color_nombre 
                    ? `${item.dimensiones} - ${item.color_nombre}`
                    : `${item.dimensiones}`;

                const cantidadPaquetes = Math.round(parseInt(item.cantidadsolicitada) || 0);
                const piezasPorPaquete = Math.round(parseInt(item.piezasporpaquete) || 1);
                const costoUnitario = parseFloat(item.costounitario) || 0;
                const subtotal = costoUnitario * cantidadPaquetes;

                doc.fillColor('#333333')
                   .fontSize(9)
                   .font('Helvetica')
                   .text(cantidadPaquetes, 55, currentY)
                   .text(item.sku || 'N/A', 100, currentY, { width: 70, ellipsis: true })
                   .text(descripcion, 180, currentY, { width: 170 })
                   .text(variante, 180, currentY + 10, { width: 170, fontSize: 8 })
                   .text(piezasPorPaquete, 360, currentY)
                   .text(`$${costoUnitario.toFixed(2)}`, 440, currentY)
                   .text(`$${subtotal.toFixed(2)}`, 510, currentY, { align: 'right', width: 45 });

                currentY += 25;
            });

            return currentY;
        };

        let totalGeneral = 0;

        for (const [pedidoKey, items] of gruposPedidos.entries()) {
            if (pedidoKey !== 'MANUAL' && esConsolidada) {
                const primerItem = items[0];
                yPosition = renderPedidoHeader(
                    primerItem.pedido_id, 
                    primerItem.cliente_nombre, 
                    yPosition
                );
            }

            yPosition = renderTableHeader(yPosition);
            yPosition = renderItems(items, yPosition);

            items.forEach(item => {
                const cantidadPaquetes = parseInt(item.cantidadsolicitada) || 0;
                const costoUnitario = parseFloat(item.costounitario) || 0;
                totalGeneral += costoUnitario * cantidadPaquetes;
            });

            yPosition += 15;
        }

        if (yPosition > 650) {
            doc.addPage();
            yPosition = 250;
        }

        yPosition += 10;

        doc.moveTo(50, yPosition)
           .lineTo(562, yPosition)
           .strokeColor('#CCCCCC')
           .lineWidth(1)
           .stroke();

        yPosition += 15;

        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#F97316')
           .text('TOTAL DE LA ORDEN:', 320, yPosition)
           .text(`$${totalGeneral.toFixed(2)} MXN`, 440, yPosition, { align: 'right', width: 122 });

        yPosition += 30;

        if (esConsolidada) {
            doc.fontSize(8)
               .font('Helvetica')
               .fillColor('#666666')
               .text(
                   `Esta orden consolida productos de ${pedidosUnicos.rows.length} pedido(s) de cliente(s) diferentes.`,
                   50,
                   yPosition,
                   { width: 512, align: 'center' }
               );
            yPosition += 15;
        }

        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('#666666')
           .text('Este documento es una orden de compra. Conserve este comprobante para cualquier aclaración.', 50, yPosition, {
               width: 512,
               align: 'center'
           });

        doc.end();

    } catch (error) {
        console.error('Error generando PDF de orden de compra:', error);
        
        if (!res.headersSent) {
            res.status(500).json({ 
                success: false,
                error: 'Error al generar el PDF',
                message: error.message
            });
        }
    }
}

module.exports = {
    generarPDFOrdenCompra
};
