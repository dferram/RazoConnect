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
                p.total,
                p.subtotal,
                p.costoenvio,
                p.descuento,
                p.estatus,
                c.nombre AS cliente_nombre,
                c.apellido AS cliente_apellido,
                c.razonsocial AS cliente_razon_social,
                c.telefono AS cliente_telefono,
                c.email AS cliente_email,
                cd.calle,
                cd.numeroexterior,
                cd.numerointerior,
                cd.colonia,
                cd.codigopostal,
                cd.ciudad,
                cd.referencias,
                e.nombre AS estado_nombre
            FROM pedidos p
            INNER JOIN clientes c ON p.clienteid = c.clienteid
            LEFT JOIN cliente_direcciones cd ON p.direccionid = cd.direccionid
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
                dp.cantidad,
                dp.preciounitario,
                dp.subtotal,
                p.nombre AS producto_nombre,
                pv.nombre AS variante_nombre,
                pv.sku,
                t.etiqueta AS tamano_etiqueta,
                t.valor AS tamano_valor
            FROM detallesdelpedido dp
            INNER JOIN producto_variantes pv ON dp.varianteid = pv.varianteid
            INNER JOIN productos p ON pv.productoid = p.productoid
            LEFT JOIN cat_tamanopaquetes t ON dp.tamanoid = t.tamanoid
            WHERE dp.pedidoid = $1
            ORDER BY dp.detalleid`,
            [pedidoId]
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
           .text('Tel: (123) 456-7890', logoExists ? 140 : 50, 90)
           .text('contacto@razoconnect.com', logoExists ? 140 : 50, 105);

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

        const clienteNombre = pedido.cliente_razon_social || 
                             `${pedido.cliente_nombre || ''} ${pedido.cliente_apellido || ''}`.trim();

        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#333333')
           .text(`Cliente: ${clienteNombre}`, 50, 170)
           .text(`Teléfono: ${pedido.cliente_telefono || 'N/A'}`, 50, 185)
           .text(`Email: ${pedido.cliente_email || 'N/A'}`, 50, 200);

        if (pedido.calle) {
            const direccion = `${pedido.calle} ${pedido.numeroexterior || ''}${pedido.numerointerior ? ' Int. ' + pedido.numerointerior : ''}, ${pedido.colonia || ''}`;
            const ciudadEstado = `${pedido.ciudad || ''}, ${pedido.estado_nombre || ''} CP ${pedido.codigopostal || ''}`;
            
            doc.text(`Dirección: ${direccion}`, 50, 215)
               .text(ciudadEstado, 50, 230);
            
            if (pedido.referencias) {
                doc.text(`Referencias: ${pedido.referencias}`, 50, 245);
            }
        }

        const tableTop = pedido.referencias ? 275 : 260;

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
               .text(item.tamano_etiqueta || 'N/A', 350, yPosition)
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

        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#333333')
           .text('Subtotal:', 400, yPosition)
           .text(`$${parseFloat(pedido.subtotal).toFixed(2)}`, 510, yPosition, { align: 'right', width: 50 });

        yPosition += 20;

        if (pedido.costoenvio && parseFloat(pedido.costoenvio) > 0) {
            doc.text('Costo de Envío:', 400, yPosition)
               .text(`$${parseFloat(pedido.costoenvio).toFixed(2)}`, 510, yPosition, { align: 'right', width: 50 });
            yPosition += 20;
        }

        if (pedido.descuento && parseFloat(pedido.descuento) > 0) {
            doc.fillColor('#DC2626')
               .text('Descuento:', 400, yPosition)
               .text(`-$${parseFloat(pedido.descuento).toFixed(2)}`, 510, yPosition, { align: 'right', width: 50 });
            yPosition += 20;
        }

        doc.moveTo(400, yPosition)
           .lineTo(562, yPosition)
           .strokeColor('#F97316')
           .lineWidth(2)
           .stroke();

        yPosition += 10;

        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#F97316')
           .text('TOTAL:', 400, yPosition)
           .text(`$${parseFloat(pedido.total).toFixed(2)}`, 510, yPosition, { align: 'right', width: 50 });

        yPosition += 40;

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
