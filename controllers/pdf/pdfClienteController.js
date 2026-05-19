/**
 * ============================================================================
 * PDF CONTROLLER - VISTA CLIENTE
 * ============================================================================
 * 
 * Propósito: Generar PDF de pedido para clientes y agentes
 * 
 * Características:
 * - Vista simplificada sin información interna
 * - Agrupación por estado: Surtido | Con Stock | Bajo Pedido | Facturado
 * - Sin detalles de almacén (marcados, rondas, admin_id)
 * - Enfoque: ¿Qué voy a recibir?
 * 
 * @module controllers/pdf/pdfClienteController
 * @author RazoConnect Team
 * @date 2026-05-19
 */

const PDFDocument = require('pdfkit');
const logger = require('../../utils/logger');
const db = require('../../db');
const path = require('path');
const fs = require('fs');

/**
 * Generar PDF de pedido para cliente/agente
 * GET /api/pedidos/:id/pdf
 */
async function generarPDFCliente(req, res) {
    const pedidoId = parseInt(req.params.id);
    const { tenant_id } = req.tenant;
    
    const userId = req.user?.userId ?? req.user?.clienteid ?? req.user?.id;
    const userRole = (req.user?.rol || req.user?.role || '').toLowerCase().trim();

    logger.info('PDF Cliente: Request iniciada', {
        pedidoId,
        userId,
        userRole,
        tenantId: tenant_id,
        requestId: req.requestId
    });

    try {
        // 1. Obtener información del pedido
        const pedidoQuery = await db.query(
            `SELECT 
                p.pedidoid,
                p.clienteid,
                p.fechapedido,
                p.montototal,
                p.costoenvio,
                p.estatus,
                c.nombre AS cliente_nombre,
                c.apellido AS cliente_apellido,
                c.telefono AS cliente_telefono,
                c.email AS cliente_email,
                d.calle,
                d.numeroext,
                d.colonia,
                d.ciudad,
                e.nombre AS estado_nombre,
                d.codigopostal
            FROM pedidos p
            INNER JOIN clientes c ON p.clienteid = c.clienteid AND c.tenant_id = $2
            LEFT JOIN cliente_direcciones d ON p.direccionenvioid = d.direccionid AND d.tenant_id = $2
            LEFT JOIN estados e ON d.estadoid = e.estadoid
            WHERE p.pedidoid = $1 AND p.tenant_id = $2`,
            [pedidoId, tenant_id]
        );

        if (pedidoQuery.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Pedido no encontrado'
            });
        }

        const pedido = pedidoQuery.rows[0];

        // 2. Verificar permisos
        const pedidoClienteId = parseInt(pedido.clienteid, 10);
        const isClienteOwner = userRole === 'cliente' && pedidoClienteId === userId;
        
        let isAgenteAutorizado = false;
        if (userRole === 'agente' && userId) {
            const agenteCheck = await db.query(
                `SELECT 1 FROM clientes
                 WHERE clienteid = $1 AND tenant_id = $2
                 AND (agenteid = $3 OR agentedeventasid = $3)
                 LIMIT 1`,
                [pedido.clienteid, tenant_id, userId]
            );
            isAgenteAutorizado = agenteCheck.rows.length > 0;
        }

        if (!isClienteOwner && !isAgenteAutorizado) {
            logger.warn('PDF Cliente: Acceso denegado', {
                userId,
                userRole,
                pedidoClienteId,
                pedidoId,
                requestId: req.requestId
            });
            return res.status(403).json({
                success: false,
                message: 'No tienes permiso para acceder a este pedido'
            });
        }

        // 3. Obtener productos del pedido - SOLO estado_producto de BD
        const detallesQuery = await db.query(
            `SELECT 
                dp.detalleid,
                dp.cantidadpaquetes AS cantidad,
                dp.preciounitario,
                dp.piezastotales,
                (dp.preciounitario * dp.piezastotales) AS subtotal,
                COALESCE(dp.estado_producto, 'Pendiente') as estado_producto,
                p.nombreproducto AS producto_nombre,
                COALESCE(pv.dimensiones, pv.color_nombre, 'Estándar') AS variante_nombre,
                pv.color_nombre,
                pv.sku,
                t.cantidad AS tamano_cantidad
            FROM detallesdelpedido dp
            INNER JOIN producto_variantes pv ON dp.varianteid = pv.varianteid
            INNER JOIN productos p ON pv.productoid = p.productoid AND p.tenant_id = $2
            LEFT JOIN cat_tamanopaquetes t ON dp.tamanoid = t.tamanoid AND t.tenant_id = $2
            WHERE dp.pedidoid = $1 AND dp.tenant_id = $2
            ORDER BY dp.detalleid`,
            [pedidoId, tenant_id]
        );

        const detalles = detallesQuery.rows;

        // 4. Categorizar productos ESTRICTAMENTE por estado_producto de BD
        const itemsFacturados = detalles.filter(item => 
            (item.estado_producto || '').toLowerCase().trim() === 'facturado'
        );

        const itemsSurtidos = detalles.filter(item => 
            (item.estado_producto || '').toLowerCase().trim() === 'surtido'
        );

        const itemsConStock = detalles.filter(item => 
            (item.estado_producto || '').toLowerCase().trim() === 'con stock'
        );

        const itemsBajoPedido = detalles.filter(item => 
            (item.estado_producto || '').toLowerCase().trim() === 'bajo pedido'
        );

        const itemsPendientes = detalles.filter(item => {
            const estado = (item.estado_producto || '').toLowerCase().trim();
            return estado === 'pendiente' || estado === '';
        });

        logger.info('PDF Cliente: Productos categorizados', {
            pedidoId,
            facturados: itemsFacturados.length,
            surtidos: itemsSurtidos.length,
            conStock: itemsConStock.length,
            bajoPedido: itemsBajoPedido.length,
            pendientes: itemsPendientes.length,
            requestId: req.requestId
        });

        // 5. Generar PDF
        const doc = new PDFDocument({ 
            size: 'LETTER',
            margins: { top: 50, bottom: 50, left: 50, right: 50 }
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="Pedido-${pedidoId}.pdf"`);
        doc.pipe(res);

        // Header
        doc.fontSize(20)
           .font('Helvetica-Bold')
           .fillColor('#F97316')
           .text('DETALLE DE PEDIDO', 50, 50);

        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#333333')
           .text(`Pedido #${pedidoId}`, 50, 80)
           .text(`Fecha: ${new Date(pedido.fechapedido).toLocaleDateString('es-MX')}`, 50, 95)
           .text(`Estado: ${pedido.estatus}`, 50, 110);

        // Cliente info
        doc.fontSize(11)
           .font('Helvetica-Bold')
           .text('CLIENTE', 50, 140);

        doc.fontSize(10)
           .font('Helvetica')
           .text(`${pedido.cliente_nombre} ${pedido.cliente_apellido}`, 50, 160)
           .text(`${pedido.cliente_email}`, 50, 175)
           .text(`Tel: ${pedido.cliente_telefono}`, 50, 190);

        // Dirección
        if (pedido.calle) {
            doc.fontSize(11)
               .font('Helvetica-Bold')
               .text('DIRECCIÓN DE ENVÍO', 320, 140);

            doc.fontSize(10)
               .font('Helvetica')
               .text(`${pedido.calle} ${pedido.numeroext}`, 320, 160)
               .text(`${pedido.colonia}, ${pedido.ciudad}`, 320, 175)
               .text(`${pedido.estado_nombre} - CP ${pedido.codigopostal}`, 320, 190);
        }

        let yPosition = 230;

        // Helper: Render table header
        const renderTableHeader = (title, yPos, color) => {
            if (yPos + 70 > 730) {
                doc.addPage();
                yPos = 50;
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
               .text('CANT.', 55, headerY + 6)
               .text('DESCRIPCIÓN', 120, headerY + 6)
               .text('TAMAÑO', 350, headerY + 6)
               .text('P. UNIT.', 420, headerY + 6)
               .text('TOTAL', 480, headerY + 6, { align: 'right', width: 75 });

            return headerY + 30;
        };

        // Helper: Render items
        const renderItems = (items, startY, bgColor) => {
            let currentY = startY;
            const rowHeight = 25;

            items.forEach((item, index) => {
                if (currentY + rowHeight > 730) {
                    doc.addPage();
                    currentY = 50;
                }

                if (index % 2 === 0) {
                    doc.rect(50, currentY - 5, 512, rowHeight)
                       .fillAndStroke(bgColor, bgColor);
                }

                const cantidad = Math.round(parseInt(item.cantidad) || 0);
                const tamano = Math.round(parseInt(item.tamano_cantidad) || 1);
                const descripcion = `${item.producto_nombre}`;
                const variante = item.color_nombre 
                    ? `${item.variante_nombre} - ${item.color_nombre}`
                    : item.variante_nombre;

                doc.fillColor('#333333')
                   .fontSize(9)
                   .font('Helvetica')
                   .text(cantidad, 55, currentY)
                   .text(descripcion, 120, currentY, { width: 220 })
                   .text(variante, 120, currentY + 10, { width: 220, fontSize: 8 })
                   .text(tamano > 1 ? `Pack ${tamano}` : 'Unit.', 350, currentY)
                   .text(`$${parseFloat(item.preciounitario).toFixed(2)}`, 420, currentY)
                   .text(`$${parseFloat(item.subtotal).toFixed(2)}`, 480, currentY, { align: 'right', width: 75 });

                currentY += rowHeight;
            });

            return currentY;
        };

        // Renderizar secciones
        if (itemsFacturados.length > 0) {
            yPosition = renderTableHeader('FACTURADO', yPosition, '#1F2937');
            yPosition = renderItems(itemsFacturados, yPosition, '#F3F4F6');
            yPosition += 15;
        }

        if (itemsSurtidos.length > 0) {
            yPosition = renderTableHeader('SURTIDO - LISTO PARA ENVÍO', yPosition, '#F97316');
            yPosition = renderItems(itemsSurtidos, yPosition, '#FFF7ED');
            yPosition += 15;
        }

        if (itemsConStock.length > 0) {
            yPosition = renderTableHeader('CON STOCK - DISPONIBLE', yPosition, '#10B981');
            yPosition = renderItems(itemsConStock, yPosition, '#F0FDF4');
            yPosition += 15;
        }

        if (itemsBajoPedido.length > 0) {
            yPosition = renderTableHeader('BAJO PEDIDO - EN PROCESO', yPosition, '#DC2626');
            yPosition = renderItems(itemsBajoPedido, yPosition, '#FEF2F2');
            yPosition += 15;
        }

        if (itemsPendientes.length > 0) {
            yPosition = renderTableHeader('PENDIENTE DE PROCESAR', yPosition, '#6B7280');
            yPosition = renderItems(itemsPendientes, yPosition, '#F9FAFB');
            yPosition += 15;
        }

        // Total
        if (yPosition + 80 > 730) {
            doc.addPage();
            yPosition = 50;
        }

        yPosition += 20;

        doc.fontSize(11)
           .font('Helvetica-Bold')
           .fillColor('#333333')
           .text('RESUMEN', 50, yPosition);

        yPosition += 20;

        doc.fontSize(10)
           .font('Helvetica')
           .text(`Subtotal: $${parseFloat(pedido.montototal - (pedido.costoenvio || 0)).toFixed(2)}`, 350, yPosition)
           .text(`Envío: $${parseFloat(pedido.costoenvio || 0).toFixed(2)}`, 350, yPosition + 15)
           .font('Helvetica-Bold')
           .text(`TOTAL: $${parseFloat(pedido.montototal).toFixed(2)}`, 350, yPosition + 35);

        doc.end();

        logger.info('PDF Cliente: Generado exitosamente', {
            pedidoId,
            requestId: req.requestId
        });

    } catch (error) {
        logger.error('PDF Cliente: Error generando PDF', {
            error: error.message,
            stack: error.stack,
            pedidoId,
            requestId: req.requestId
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
    generarPDFCliente
};
