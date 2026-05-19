/**
 * ============================================================================
 * PDF CONTROLLER - VISTA ADMINISTRATIVA
 * ============================================================================
 * 
 * Propósito: Generar PDF de pedido para roles administrativos
 * 
 * Características:
 * - Vista completa con información de gestión interna
 * - Desglose por estado_producto con detalles de surtimiento
 * - Filtros por rol (inventarios sin precios, finanzas con todo)
 * - Información de rondas, admin asignado, marcados
 * - Enfoque: ¿Qué debo procesar/verificar?
 * 
 * @module controllers/pdf/pdfAdminController
 * @author RazoConnect Team
 * @date 2026-05-19
 */

const PDFDocument = require('pdfkit');
const logger = require('../../utils/logger');
const db = require('../../db');
const path = require('path');
const fs = require('fs');

/**
 * Generar PDF de pedido para administradores
 * GET /api/admin/pedidos/:id/pdf
 */
async function generarPDFAdmin(req, res) {
    const pedidoId = parseInt(req.params.id);
    const { tenant_id } = req.tenant;
    
    // Parámetros opcionales
    const selectedItemsParam = req.query.selectedItems;
    let selectedItemIds = [];
    if (selectedItemsParam) {
        try {
            selectedItemIds = selectedItemsParam.split(',').map(id => parseInt(id, 10)).filter(id => !isNaN(id));
        } catch (e) {
            logger.warn('PDF Admin: Error parseando selectedItems', { error: e.message });
        }
    }

    const userId = req.user?.userId ?? req.user?.adminid ?? req.user?.id;
    const userRole = (req.user?.rol || req.user?.role || '').toLowerCase().trim();
    
    // Inventarios no ve precios
    let mostrarPrecios = req.query.mostrarPrecios !== 'false';
    if (userRole === 'inventarios') {
        mostrarPrecios = false;
    }

    logger.info('PDF Admin: Request iniciada', {
        pedidoId,
        userId,
        userRole,
        mostrarPrecios,
        selectedItems: selectedItemIds.length,
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
                p.admin_asignado_id,
                c.nombre AS cliente_nombre,
                c.apellido AS cliente_apellido,
                c.telefono AS cliente_telefono,
                c.email AS cliente_email,
                a.nombre AS admin_nombre,
                a.apellido AS admin_apellido,
                d.calle,
                d.numeroext,
                d.colonia,
                d.ciudad,
                e.nombre AS estado_nombre,
                d.codigopostal
            FROM pedidos p
            INNER JOIN clientes c ON p.clienteid = c.clienteid AND c.tenant_id = $2
            LEFT JOIN administradores a ON p.admin_asignado_id = a.adminid AND a.tenant_id = $2
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

        // 2. Obtener productos con información completa
        const detallesQuery = await db.query(
            `SELECT 
                dp.detalleid,
                dp.cantidadpaquetes AS cantidad,
                dp.preciounitario,
                dp.piezastotales,
                (dp.preciounitario * dp.piezastotales) AS subtotal,
                dp.cantidadsurtida,
                COALESCE(dp.estado_producto, 'Pendiente') as estado_producto,
                p.nombreproducto AS producto_nombre,
                COALESCE(pv.dimensiones, pv.color_nombre, 'Estándar') AS variante_nombre,
                pv.color_nombre,
                pv.sku,
                t.cantidad AS tamano_cantidad,
                (
                  SELECT json_agg(json_build_object(
                    'ronda', COALESCE(dr.ronda_surtido, 1),
                    'cantidad', dr.cantidad_paquetes_surtidos,
                    'admin_id', dr.admin_id
                  ) ORDER BY dr.ronda_surtido)
                  FROM detalles_remision dr
                  INNER JOIN remisiones r ON dr.remision_id = r.remision_id
                  WHERE dr.detalle_pedido_id = dp.detalleid
                ) as rondas_surtido
            FROM detallesdelpedido dp
            INNER JOIN producto_variantes pv ON dp.varianteid = pv.varianteid
            INNER JOIN productos p ON pv.productoid = p.productoid AND p.tenant_id = $2
            LEFT JOIN cat_tamanopaquetes t ON dp.tamanoid = t.tamanoid AND t.tenant_id = $2
            WHERE dp.pedidoid = $1 AND dp.tenant_id = $2
            ORDER BY dp.detalleid`,
            [pedidoId, tenant_id]
        );

        const detalles = detallesQuery.rows;

        // 3. Categorizar productos ESTRICTAMENTE por estado_producto de BD
        const itemsFacturados = detalles.filter(item => 
            (item.estado_producto || '').toLowerCase().trim() === 'facturado'
        );

        const itemsSurtidos = detalles.filter(item => 
            (item.estado_producto || '').toLowerCase().trim() === 'surtido'
        );

        // Con stock - separar marcados vs no marcados
        const itemsConStockMarcados = detalles.filter(item => {
            const estado = (item.estado_producto || '').toLowerCase().trim();
            if (estado !== 'con stock') return false;
            return selectedItemIds.length > 0 && selectedItemIds.includes(item.detalleid);
        });

        const itemsConStockNoMarcados = detalles.filter(item => {
            const estado = (item.estado_producto || '').toLowerCase().trim();
            if (estado !== 'con stock') return false;
            if (selectedItemIds.length > 0 && selectedItemIds.includes(item.detalleid)) return false;
            return true;
        });

        const itemsBajoPedido = detalles.filter(item => 
            (item.estado_producto || '').toLowerCase().trim() === 'bajo pedido'
        );

        const itemsPendientes = detalles.filter(item => {
            const estado = (item.estado_producto || '').toLowerCase().trim();
            return estado === 'pendiente' || estado === '';
        });

        logger.info('PDF Admin: Productos categorizados', {
            pedidoId,
            facturados: itemsFacturados.length,
            surtidos: itemsSurtidos.length,
            conStockMarcados: itemsConStockMarcados.length,
            conStockNoMarcados: itemsConStockNoMarcados.length,
            bajoPedido: itemsBajoPedido.length,
            pendientes: itemsPendientes.length,
            requestId: req.requestId
        });

        // 4. Generar PDF
        const doc = new PDFDocument({ 
            size: 'LETTER',
            margins: { top: 50, bottom: 50, left: 50, right: 50 }
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="Pedido-Admin-${pedidoId}.pdf"`);
        doc.pipe(res);

        // Header
        doc.fontSize(20)
           .font('Helvetica-Bold')
           .fillColor('#F97316')
           .text('PEDIDO - VISTA ADMINISTRATIVA', 50, 50);

        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#333333')
           .text(`Pedido #${pedidoId}`, 50, 80)
           .text(`Fecha: ${new Date(pedido.fechapedido).toLocaleDateString('es-MX')}`, 50, 95)
           .text(`Estado: ${pedido.estatus}`, 50, 110);

        if (pedido.admin_nombre) {
            doc.text(`Admin Asignado: ${pedido.admin_nombre} ${pedido.admin_apellido}`, 50, 125);
        }

        // Cliente info
        doc.fontSize(11)
           .font('Helvetica-Bold')
           .text('CLIENTE', 50, 155);

        doc.fontSize(10)
           .font('Helvetica')
           .text(`${pedido.cliente_nombre} ${pedido.cliente_apellido}`, 50, 175)
           .text(`${pedido.cliente_email}`, 50, 190)
           .text(`Tel: ${pedido.cliente_telefono}`, 50, 205);

        // Dirección
        if (pedido.calle) {
            doc.fontSize(11)
               .font('Helvetica-Bold')
               .text('DIRECCIÓN DE ENVÍO', 320, 155);

            doc.fontSize(10)
               .font('Helvetica')
               .text(`${pedido.calle} ${pedido.numeroext}`, 320, 175)
               .text(`${pedido.colonia}, ${pedido.ciudad}`, 320, 190)
               .text(`${pedido.estado_nombre} - CP ${pedido.codigopostal}`, 320, 205);
        }

        let yPosition = 240;

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
               .text('SURT.', 330, headerY + 6);

            if (mostrarPrecios) {
                doc.text('P. UNIT.', 380, headerY + 6)
                   .text('TOTAL', 480, headerY + 6, { align: 'right', width: 75 });
            }

            return headerY + 30;
        };

        // Helper: Render items
        const renderItems = (items, startY, bgColor) => {
            let currentY = startY;
            const rowHeight = 30;

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
                const surtido = Math.round(parseInt(item.cantidadsurtida) || 0);
                const descripcion = `${item.producto_nombre}`;
                const variante = item.color_nombre 
                    ? `${item.variante_nombre} - ${item.color_nombre}`
                    : item.variante_nombre;

                // Rondas de surtimiento
                let rondaTexto = '';
                if (item.rondas_surtido && Array.isArray(item.rondas_surtido) && item.rondas_surtido.length > 0) {
                    const rondas = item.rondas_surtido.map(r => `R${r.ronda}`).join(', ');
                    rondaTexto = ` [${rondas}]`;
                }

                doc.fillColor('#333333')
                   .fontSize(9)
                   .font('Helvetica')
                   .text(cantidad, 55, currentY)
                   .text(descripcion, 120, currentY, { width: 200 })
                   .text(variante + rondaTexto, 120, currentY + 10, { width: 200, fontSize: 8 })
                   .text(`${surtido}/${cantidad * tamano}`, 330, currentY);

                if (mostrarPrecios) {
                    doc.text(`$${parseFloat(item.preciounitario).toFixed(2)}`, 380, currentY)
                       .text(`$${parseFloat(item.subtotal).toFixed(2)}`, 480, currentY, { align: 'right', width: 75 });
                }

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
            yPosition = renderTableHeader('SURTIDO', yPosition, '#F97316');
            yPosition = renderItems(itemsSurtidos, yPosition, '#FFF7ED');
            yPosition += 15;
        }

        if (itemsConStockMarcados.length > 0) {
            yPosition = renderTableHeader('CON STOCK - MARCADO PARA SURTIR', yPosition, '#10B981');
            yPosition = renderItems(itemsConStockMarcados, yPosition, '#F0FDF4');
            yPosition += 15;
        }

        if (itemsConStockNoMarcados.length > 0) {
            yPosition = renderTableHeader('CON STOCK - SIN MARCAR', yPosition, '#3B82F6');
            yPosition = renderItems(itemsConStockNoMarcados, yPosition, '#EFF6FF');
            yPosition += 15;
        }

        if (itemsBajoPedido.length > 0) {
            yPosition = renderTableHeader('BAJO PEDIDO', yPosition, '#DC2626');
            yPosition = renderItems(itemsBajoPedido, yPosition, '#FEF2F2');
            yPosition += 15;
        }

        if (itemsPendientes.length > 0) {
            yPosition = renderTableHeader('PENDIENTE', yPosition, '#6B7280');
            yPosition = renderItems(itemsPendientes, yPosition, '#F9FAFB');
            yPosition += 15;
        }

        // Total (solo si mostrarPrecios)
        if (mostrarPrecios) {
            if (yPosition + 80 > 730) {
                doc.addPage();
                yPosition = 50;
            }

            yPosition += 20;

            doc.fontSize(11)
               .font('Helvetica-Bold')
               .fillColor('#333333')
               .text('RESUMEN FINANCIERO', 50, yPosition);

            yPosition += 20;

            doc.fontSize(10)
               .font('Helvetica')
               .text(`Subtotal: $${parseFloat(pedido.montototal - (pedido.costoenvio || 0)).toFixed(2)}`, 350, yPosition)
               .text(`Envío: $${parseFloat(pedido.costoenvio || 0).toFixed(2)}`, 350, yPosition + 15)
               .font('Helvetica-Bold')
               .text(`TOTAL: $${parseFloat(pedido.montototal).toFixed(2)}`, 350, yPosition + 35);
        }

        doc.end();

        logger.info('PDF Admin: Generado exitosamente', {
            pedidoId,
            requestId: req.requestId
        });

    } catch (error) {
        logger.error('PDF Admin: Error generando PDF', {
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
    generarPDFAdmin
};
