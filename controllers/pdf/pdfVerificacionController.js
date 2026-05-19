/**
 * ============================================================================
 * PDF CONTROLLER - VERIFICACIÓN DE ALMACÉN
 * ============================================================================
 * 
 * Propósito: Generar PDF de verificación pre-confirmación para inventarios
 * 
 * Muestra 3 tablas:
 * - Productos marcados para surtir
 * - Disponibles sin marcar
 * - Bajo pedido (sin stock)
 * 
 * @module controllers/pdf/pdfVerificacionController
 * @author RazoConnect Team
 * @date 2026-05-19
 */

const PDFDocument = require('pdfkit');
const logger = require('../../utils/logger');
const db = require('../../db');
const path = require('path');
const fs = require('fs');

/**
 * Generar PDF de verificación PRE-CONFIRMACIÓN
 * GET /api/admin/pedidos/:id/pdf-verificacion
 */
async function generarPDFVerificacion(req, res) {
    const pedidoId = parseInt(req.params.id);
    const { tenant_id } = req.tenant;
    
    try {
        const pedidoQuery = await db.query(
            `SELECT 
                p.pedidoid,
                p.clienteid,
                p.fechapedido,
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
                e.nombre AS estado_nombre,
                (
                    SELECT COUNT(*)
                    FROM pedidos p2
                    WHERE p2.clienteid = p.clienteid
                      AND p2.tenant_id = p.tenant_id
                      AND (p2.fechapedido < p.fechapedido 
                           OR (p2.fechapedido = p.fechapedido AND p2.pedidoid <= p.pedidoid))
                ) AS numero_pedido_cliente
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

        // Get detailed items with stock information
        const detallesQuery = await db.query(
            `SELECT DISTINCT ON (dp.detalleid)
                dp.detalleid,
                dp.cantidadpaquetes AS cantidad,
                dp.preciounitario,
                dp.piezastotales,
                dp.cantidadsurtida,
                COALESCE(dp.estado_producto, 'Pendiente') as estado_producto,
                p.nombreproducto AS producto_nombre,
                COALESCE(pv.dimensiones, pv.color_nombre, 'Estándar') AS variante_nombre,
                pv.color_nombre,
                pv.sku,
                t.cantidad AS tamano_cantidad,
                COALESCE(sa.cantidad, 0) as stock_admin,
                COALESCE(sa.cantidad_reservada, 0) as stock_reservado,
                (COALESCE(sa.cantidad, 0) - COALESCE(sa.cantidad_reservada, 0)) as stock_disponible
            FROM detallesdelpedido dp
            INNER JOIN producto_variantes pv ON dp.varianteid = pv.varianteid
            INNER JOIN productos p ON pv.productoid = p.productoid AND p.tenant_id = $2
            LEFT JOIN cat_tamanopaquetes t ON dp.tamanoid = t.tamanoid AND t.tenant_id = $2
            LEFT JOIN stock_admin sa ON sa.variante_id = pv.varianteid AND sa.tenant_id = $2 AND sa.admin_id = (
              SELECT DISTINCT ame.admin_id
              FROM clientes c
              LEFT JOIN administrador_estados ame ON c.estado_id = ame.estado_id AND c.tenant_id = ame.tenant_id
              WHERE c.clienteid = (SELECT clienteid FROM pedidos WHERE pedidoid = $1 AND tenant_id = $2)
              LIMIT 1
            )
            WHERE dp.pedidoid = $1
            ORDER BY dp.detalleid`,
            [pedidoId, tenant_id]
        );

        const detalles = detallesQuery.rows;

        // Categorizar productos usando estado_producto de BD
        const itemsMarcados = detalles.filter(item => 
            (item.estado_producto || '').toLowerCase().trim() === 'surtido' ||
            parseInt(item.cantidadsurtida || 0) > 0
        );

        const itemsConStock = detalles.filter(item => {
            const estado = (item.estado_producto || '').toLowerCase().trim();
            if (estado === 'surtido' || parseInt(item.cantidadsurtida || 0) > 0) return false;
            return estado === 'con stock';
        });

        const itemsBajoPedido = detalles.filter(item => {
            const estado = (item.estado_producto || '').toLowerCase().trim();
            return estado === 'bajo pedido';
        });

        logger.info('PDF Verificación: Productos categorizados', {
            pedidoId,
            marcados: itemsMarcados.length,
            conStock: itemsConStock.length,
            bajoPedido: itemsBajoPedido.length,
            requestId: req.requestId
        });

        const doc = new PDFDocument({ 
            size: 'LETTER',
            margins: { top: 50, bottom: 50, left: 50, right: 50 }
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="Verificacion-${pedidoId}.pdf"`);

        doc.pipe(res);

        const logoPath = path.join(__dirname, '..', '..', 'icon', 'Logo_Razo.png');
        let logoExists = false;
        try {
            if (fs.existsSync(logoPath)) {
                logoExists = true;
            }
        } catch (err) {
            logger.info('Logo no encontrado', { requestId: req.requestId });
        }

        // Header function
        const renderHeader = (doc, pedido, logoPath, logoExists) => {
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
               .text('VERIFICACIÓN PRE-CONFIRMACIÓN', 350, 50, { width: 212, align: 'right' });

            doc.fontSize(9)
               .font('Helvetica')
               .fillColor('#333333')
               .text(`Pedido: #${pedido.numero_pedido_cliente || pedido.pedidoid}`, 350, 70, { width: 212, align: 'right' })
               .text(`Folio: ${String(pedido.pedidoid).padStart(6, '0')}`, 350, 85, { width: 212, align: 'right' })
               .text(`Fecha: ${new Date(pedido.fechapedido).toLocaleDateString('es-MX')}`, 350, 100, { width: 212, align: 'right' });

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
               .text(`Teléfono: ${pedido.cliente_telefono || 'N/A'}`, 50, 185);

            if (pedido.calle) {
                const direccion = `${pedido.calle} ${pedido.numeroext || ''}`;
                doc.text(`Dirección: ${direccion}`, 50, 200);
            }
        };

        doc.on('pageAdded', () => {
            renderHeader(doc, pedido, logoPath, logoExists);
        });

        renderHeader(doc, pedido, logoPath, logoExists);

        let yPosition = 230;
        const rowHeight = 25;

        const renderTableHeader = (title, yPos, color = '#F97316') => {
            if (yPos + 70 > 730) {
                doc.addPage();
                yPos = 260;
            }

            doc.fontSize(12)
               .font('Helvetica-Bold')
               .fillColor(color)
               .text(title, 50, yPos);

            const headerY = yPos + 20;
            doc.fontSize(9)
               .font('Helvetica-Bold')
               .fillColor('#FFFFFF')
               .rect(50, headerY, 512, 20)
               .fillAndStroke(color, color);

            doc.fillColor('#FFFFFF')
               .text('SKU', 55, headerY + 6)
               .text('PRODUCTO', 120, headerY + 6)
               .text('CANT.', 350, headerY + 6)
               .text('TAMAÑO', 400, headerY + 6)
               .text('STOCK', 470, headerY + 6);

            return headerY + 30;
        };

        const renderItems = (items, startY, bgColor = '#F9F9F9') => {
            let currentY = startY;

            items.forEach((item, index) => {
                if (currentY + rowHeight > 730) {
                    doc.addPage();
                    currentY = 260;
                }

                if (index % 2 === 0) {
                    doc.rect(50, currentY - 5, 512, rowHeight)
                       .fillAndStroke(bgColor, bgColor);
                }

                const cantidad = Math.round(parseInt(item.cantidad) || 0);
                const tamano = Math.round(parseInt(item.tamano_cantidad) || 1);
                const stock = parseInt(item.stock_disponible || 0);
                const productoTexto = item.producto_nombre + (item.color_nombre ? ` (${item.color_nombre})` : '');
                
                doc.fillColor('#333333')
                   .fontSize(9)
                   .font('Helvetica')
                   .text(item.sku || '-', 55, currentY)
                   .text(productoTexto, 120, currentY, { width: 220 })
                   .text(cantidad.toString(), 350, currentY)
                   .text(tamano > 1 ? `Pack ${tamano}` : 'Unit.', 400, currentY)
                   .text(stock.toString(), 470, currentY);

                currentY += rowHeight;
            });

            return currentY;
        };

        if (itemsMarcados.length > 0) {
            yPosition = renderTableHeader('PRODUCTOS MARCADOS PARA SURTIR', yPosition, '#10B981');
            yPosition = renderItems(itemsMarcados, yPosition, '#F0FDF4');
            yPosition += 15;
        }

        if (itemsConStock.length > 0) {
            yPosition = renderTableHeader('DISPONIBLE - SIN MARCAR', yPosition, '#3B82F6');
            yPosition = renderItems(itemsConStock, yPosition, '#EFF6FF');
            yPosition += 15;
        }

        if (itemsBajoPedido.length > 0) {
            yPosition = renderTableHeader('BAJO PEDIDO - SIN STOCK', yPosition, '#DC2626');
            yPosition = renderItems(itemsBajoPedido, yPosition, '#FEF2F2');
            yPosition += 15;
        }

        yPosition += 20;

        if (yPosition + 80 > 730) {
            doc.addPage();
            yPosition = 260;
        }

        doc.fontSize(11)
           .font('Helvetica-Bold')
           .fillColor('#333333')
           .text('RESUMEN DE VERIFICACIÓN', 50, yPosition);

        yPosition += 20;

        doc.save();
        doc.roundedRect(50, yPosition, 512, 75, 5)
           .fillAndStroke('#F5F1ED', '#F97316');
        doc.restore();

        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#333333')
           .text(`Productos Marcados: ${itemsMarcados.length}`, 60, yPosition + 10)
           .text(`Disponibles (sin marcar): ${itemsConStock.length}`, 60, yPosition + 30)
           .text(`Bajo Pedido: ${itemsBajoPedido.length}`, 60, yPosition + 50);

        yPosition += 85;

        doc.fontSize(9)
           .font('Helvetica')
           .fillColor('#666666')
           .text('INSTRUCCIONES:', 50, yPosition);

        yPosition += 15;

        doc.fontSize(8)
           .fillColor('#333333')
           .text('1. Verifique en almacén todos los productos listados', 50, yPosition, { width: 512 })
           .text('2. Revise cantidades y stock disponible', 50, yPosition + 12, { width: 512 })
           .text('3. Puede cambiar la selección en sistema si es necesario', 50, yPosition + 24, { width: 512 })
           .text('4. Confirme en sistema cuando esté listo', 50, yPosition + 36, { width: 512 });

        doc.end();

        logger.info('PDF Verificación generado', {
            pedidoId,
            requestId: req.requestId
        });

    } catch (error) {
        logger.error('Error generando PDF de verificación', {
            error: error.message,
            stack: error.stack,
            pedidoId,
            requestId: req.requestId,
            tenantId: req.tenant?.tenant_id
        });

        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: 'Error al generar el PDF'
            });
        }
    }
}

module.exports = {
    generarPDFVerificacion
};
