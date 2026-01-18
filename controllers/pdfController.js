const PDFDocument = require('pdfkit');
const db = require('../db');
const path = require('path');
const fs = require('fs');

async function generarPDFPedido(req, res) {
    const pedidoId = parseInt(req.params.id);
    const { tenant_id } = req.tenant;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    try {
        const pedidoQuery = await db.query(
            `SELECT 
                p.pedidoid,
                p.clienteid,
                p.fechapedido,
                p.montototal,
                p.costoenvio,
                p.monto_descuento,
                p.estatus,
                c.nombre AS cliente_nombre,
                c.apellido AS cliente_apellido,
                c.telefono AS cliente_telefono,
                c.email AS cliente_email,
                cd.calle,
                cd.numeroext,
                cd.numeroint,
                cd.colonia,
                cd.codigopostal,
                cd.ciudad,
                e.nombre AS estado_nombre
            FROM pedidos p
            INNER JOIN clientes c ON p.clienteid = c.clienteid
            LEFT JOIN cliente_direcciones cd ON p.direccionenvioid = cd.direccionid
            LEFT JOIN estados e ON cd.estadoid = e.estadoid
            WHERE p.pedidoid = $1 AND p.tenant_id = $2`,
            [pedidoId, tenant_id]
        );

        if (pedidoQuery.rows.length === 0) {
            return res.status(404).json({ error: 'Pedido no encontrado' });
        }

        const pedido = pedidoQuery.rows[0];

        if (userRole !== 'admin' && userRole !== 'superadmin' && pedido.clienteid !== userId) {
            return res.status(403).json({ error: 'No tienes permiso para acceder a este pedido' });
        }

        const detallesQuery = await db.query(
            `SELECT 
                dp.cantidadpaquetes AS cantidad,
                dp.preciounitario,
                dp.piezastotales,
                (dp.preciounitario * dp.piezastotales) AS subtotal,
                dp.esbackorder,
                dp.cantidadsurtida,
                dp.cantidadbackorder,
                p.nombreproducto AS producto_nombre,
                COALESCE(pv.dimensiones, pv.color_nombre, 'Estándar') AS variante_nombre,
                pv.sku,
                t.cantidad AS tamano_cantidad
            FROM detallesdelpedido dp
            INNER JOIN producto_variantes pv ON dp.varianteid = pv.varianteid
            INNER JOIN productos p ON pv.productoid = p.productoid AND p.tenant_id = $2
            LEFT JOIN cat_tamanopaquetes t ON dp.tamanoid = t.tamanoid
            WHERE dp.pedidoid = $1
            ORDER BY dp.detalleid`,
            [pedidoId, tenant_id]
        );

        const detalles = detallesQuery.rows;

        const doc = new PDFDocument({ 
            size: 'LETTER',
            margins: { top: 50, bottom: 50, left: 50, right: 50 }
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="Remision-${pedidoId}.pdf"`);

        doc.pipe(res);

        const logoPath = path.join(__dirname, '..', 'icon', 'Logo_Razo.png');
        let logoExists = false;
        try {
            if (fs.existsSync(logoPath)) {
                doc.image(logoPath, 50, 45, { width: 80 });
                logoExists = true;
            }
        } catch (err) {
            console.log('Logo no encontrado, usando texto');
        }

        doc.fontSize(20)
           .font('Helvetica-Bold')
           .fillColor('#F97316')
           .text('RazoConnect', logoExists ? 140 : 50, 50);

        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#333333')
           .text('Sistema de Gestión Comercial', logoExists ? 140 : 50, 75)
           .text('Tel: 55 6098 9524', logoExists ? 140 : 50, 90)
           .text('fegarcia@hotmail.com', logoExists ? 140 : 50, 105);

        doc.fontSize(16)
           .font('Helvetica-Bold')
           .fillColor('#F97316')
           .text('REMISIÓN DE VENTA', 400, 50, { align: 'right' });

        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#333333')
           .text(`Folio: ${String(pedidoId).padStart(6, '0')}`, 400, 75, { align: 'right' })
           .text(`Fecha: ${new Date(pedido.fechapedido).toLocaleDateString('es-MX', { 
               year: 'numeric', 
               month: 'long', 
               day: 'numeric' 
           })}`, 400, 90, { align: 'right' })
           .text(`Estatus: ${pedido.estatus}`, 400, 105, { align: 'right' });

        doc.moveTo(50, 135)
           .lineTo(562, 135)
           .strokeColor('#F97316')
           .lineWidth(2)
           .stroke();

        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#F97316')
           .text('INFORMACIÓN DEL CLIENTE', 50, 150);

        const clienteNombre = `${pedido.cliente_nombre || ''} ${pedido.cliente_apellido || ''}`.trim();

        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#333333')
           .text(`Cliente: ${clienteNombre}`, 50, 170)
           .text(`Teléfono: ${pedido.cliente_telefono || 'N/A'}`, 50, 185)
           .text(`Email: ${pedido.cliente_email || 'N/A'}`, 50, 200);

        if (pedido.calle) {
            const direccion = `${pedido.calle} ${pedido.numeroext || ''}${pedido.numeroint ? ' Int. ' + pedido.numeroint : ''}, ${pedido.colonia || ''}`;
            const ciudadEstado = `${pedido.ciudad || ''}, ${pedido.estado_nombre || ''} CP ${pedido.codigopostal || ''}`;
            
            doc.text(`Dirección: ${direccion}`, 50, 215)
               .text(ciudadEstado, 50, 230);
        }

        const tableTop = 260;

        doc.moveTo(50, tableTop - 10)
           .lineTo(562, tableTop - 10)
           .strokeColor('#CCCCCC')
           .lineWidth(1)
           .stroke();

        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#F97316')
           .text('PRODUCTOS', 50, tableTop);

        const headerY = tableTop + 25;
        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor('#FFFFFF')
           .rect(50, headerY, 512, 20)
           .fillAndStroke('#F97316', '#F97316');

        doc.fillColor('#FFFFFF')
           .text('CANT.', 55, headerY + 6)
           .text('DESCRIPCIÓN', 110, headerY + 6)
           .text('TAMAÑO', 350, headerY + 6)
           .text('PRECIO UNIT.', 420, headerY + 6)
           .text('TOTAL', 510, headerY + 6, { align: 'right', width: 50 });

        let yPosition = headerY + 30;
        const rowHeight = 25;

        doc.font('Helvetica')
           .fillColor('#333333');

        detalles.forEach((item, index) => {
            if (yPosition > 700) {
                doc.addPage();
                yPosition = 50;
            }

            if (index % 2 === 0) {
                doc.rect(50, yPosition - 5, 512, rowHeight)
                   .fillAndStroke('#F9F9F9', '#F9F9F9');
            }

            doc.fillColor('#333333')
               .fontSize(9)
               .text(item.cantidad, 55, yPosition)
               .text(`${item.producto_nombre}`, 110, yPosition, { width: 230 })
               .text(`${item.variante_nombre}`, 110, yPosition + 10, { width: 230 })
               .text(item.tamano_cantidad ? `Pack ${item.tamano_cantidad}` : 'Unitario', 350, yPosition)
               .text(`$${parseFloat(item.preciounitario).toFixed(2)}`, 420, yPosition)
               .text(`$${parseFloat(item.subtotal).toFixed(2)}`, 510, yPosition, { align: 'right', width: 50 });

            yPosition += rowHeight;
        });

        yPosition += 20;

        doc.moveTo(50, yPosition)
           .lineTo(562, yPosition)
           .strokeColor('#CCCCCC')
           .lineWidth(1)
           .stroke();

        yPosition += 15;

        // Calculate totals by stock status
        let totalEnStock = 0;
        let totalSinStock = 0;

        detalles.forEach((item) => {
            const itemSubtotal = parseFloat(item.subtotal);
            
            // If esbackorder is true, it's out of stock
            if (item.esbackorder === true) {
                totalSinStock += itemSubtotal;
            } else {
                totalEnStock += itemSubtotal;
            }
        });

        const subtotalProductos = totalEnStock + totalSinStock;

        // Display Total in Stock
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#333333')
           .text('Total Productos en Existencia:', 350, yPosition)
           .text(`$${totalEnStock.toFixed(2)} MXN`, 510, yPosition, { align: 'right', width: 50 });

        yPosition += 20;

        // Display Total Pending (Out of Stock)
        doc.fillColor('#DC2626')
           .text('Total Productos bajo Pedido:', 350, yPosition)
           .fillColor('#333333')
           .text(`$${totalSinStock.toFixed(2)} MXN`, 510, yPosition, { align: 'right', width: 50 });

        yPosition += 20;

        // Separator line
        doc.moveTo(350, yPosition)
           .lineTo(562, yPosition)
           .strokeColor('#CCCCCC')
           .lineWidth(1)
           .stroke();

        yPosition += 10;

        // Display Subtotal
        doc.fillColor('#333333')
           .text('Subtotal:', 350, yPosition)
           .text(`$${subtotalProductos.toFixed(2)} MXN`, 510, yPosition, { align: 'right', width: 50 });

        yPosition += 20;

        if (pedido.costoenvio && parseFloat(pedido.costoenvio) > 0) {
            doc.fillColor('#333333')
               .text('Costo de Envío:', 350, yPosition)
               .text(`$${parseFloat(pedido.costoenvio).toFixed(2)} MXN`, 510, yPosition, { align: 'right', width: 50 });
            yPosition += 20;
        }

        if (pedido.monto_descuento && parseFloat(pedido.monto_descuento) > 0) {
            doc.fillColor('#DC2626')
               .text('Descuento:', 350, yPosition)
               .text(`-$${parseFloat(pedido.monto_descuento).toFixed(2)} MXN`, 510, yPosition, { align: 'right', width: 50 });
            yPosition += 20;
        }

        doc.moveTo(350, yPosition)
           .lineTo(562, yPosition)
           .strokeColor('#F97316')
           .lineWidth(2)
           .stroke();

        yPosition += 10;

        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#F97316')
           .text('TOTAL DE LA ORDEN:', 350, yPosition)
           .text(`$${parseFloat(pedido.montototal).toFixed(2)} MXN`, 510, yPosition, { align: 'right', width: 50 });

        yPosition += 30;

        // Add informative note if there are backorder items
        if (totalSinStock > 0) {
            doc.fontSize(9)
               .font('Helvetica-Bold')
               .fillColor('#DC2626')
               .text('NOTA IMPORTANTE:', 50, yPosition);
            
            yPosition += 15;
            
            doc.fontSize(8)
               .font('Helvetica')
               .fillColor('#666666')
               .text('Los productos marcados como "bajo pedido" serán fabricados especialmente para usted y se entregarán en una fecha posterior. Se le notificará cuando estén listos.', 50, yPosition, {
                   width: 512,
                   align: 'left'
               });
            
            yPosition += 25;
        } else {
            yPosition += 10;
        }

        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('#666666')
           .text('Este documento es una remisión de venta. Conserve este comprobante para cualquier aclaración.', 50, yPosition, {
               width: 512,
               align: 'center'
           });

        yPosition += 15;
        doc.text('Gracias por su preferencia.', 50, yPosition, {
            width: 512,
            align: 'center'
        });

        doc.end();

    } catch (error) {
        console.error('Error generando PDF:', error);
        console.error('Stack trace:', error.stack);
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            name: error.name
        });
        
        if (!res.headersSent) {
            res.status(500).json({ 
                success: false,
                error: 'Error al generar el PDF',
                message: error.message,
                details: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    }
}

module.exports = {
    generarPDFPedido
};
