const PDFDocument = require('pdfkit');
const logger = require('../utils/logger');
const db = require('../db');
const path = require('path');
const fs = require('fs');

async function generarPDFPedido(req, res) {
    const pedidoId = parseInt(req.params.id);
    const { tenant_id } = req.tenant;
    
    // Support for hiding prices (for inventarios role)
    const mostrarPrecios = req.query.mostrarPrecios !== 'false';
    
    // Support for role-based filtering (inventarios vs finanzas)
    const filtrarPorRol = req.query.filtrarPorRol === 'true';
    
    // Normalizar userId — forzar a número para comparaciones con la DB
    const userIdRaw = req.user?.userId 
        ?? req.user?.clienteid 
        ?? req.user?.clienteId 
        ?? req.user?.adminid 
        ?? req.user?.id;
    const userId = userIdRaw ? parseInt(userIdRaw, 10) : null;
    
    // Normalizar rol: siempre lowercase para comparaciones
    const userRole = (req.user?.rol || req.user?.role || '').toLowerCase().trim();
    const userRoles = Array.isArray(req.user?.roles) && req.user.roles.length > 0
        ? req.user.roles.map(r => (r || '').toString().toLowerCase().trim())
        : [userRole].filter(Boolean);

    // Log de diagnóstico para detectar problemas de permisos
    logger.info('PDF request iniciada', {
        pedidoId,
        userId,
        userRole,
        userRoles,
        tenantId: tenant_id,
        requestId: req.requestId
    });

    try {
        const pedidoQuery = await db.query(
            `SELECT 
                p.pedidoid,
                p.clienteid,
                p.fechapedido,
                p.montototal,
                p.costoenvio,
                p.monto_descuento,
                p.cupon_id,
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

        // Verificación de permisos CORREGIDA
        // admin y super_admin incluyen todas las variantes posibles del rol
        const isAdmin = userRoles.some(r => 
            ['admin', 'superadmin', 'super_admin', 'super-admin'].includes(r)
        );
        
        // Comparación de números para evitar mismatch de tipos (string vs integer de DB)
        const pedidoClienteIdNum = parseInt(pedido.clienteid, 10);
        const isClienteOwner = userRole === 'cliente' && pedidoClienteIdNum === userId;
        
        // Verificación de agente con columna correcta
        let isAgenteAutorizado = false;
        if (userRoles.includes('agente') && userId) {
            const agenteClienteCheck = await db.query(
                `SELECT 1 FROM clientes 
                 WHERE clienteid = $1 
                 AND (agenteid = $2 OR agentedeventasid = $2)
                 LIMIT 1`,
                [pedido.clienteid, userId]
            );
            isAgenteAutorizado = agenteClienteCheck.rows.length > 0;
        }

        if (!isAdmin && !isClienteOwner && !isAgenteAutorizado) {
            logger.warn('PDF acceso denegado - detalle completo', {
                userId,
                userRole,
                userRoles,
                isAdmin,
                isClienteOwner,
                isAgenteAutorizado,
                pedidoClienteId: pedido.clienteid,
                pedidoClienteIdNum,
                pedidoId,
                requestId: req.requestId
            });
            return res.status(403).json({ 
                success: false,
                message: 'No tienes permiso para acceder a este recurso' 
            });
        }

        // 🚨 CRITICAL FIX: Added DISTINCT ON to prevent duplicate rows from JOIN
        // This fixes the "factor 4" bug where cat_tamanopaquetes duplicates cause double counting
        const detallesQuery = await db.query(
            `SELECT DISTINCT ON (dp.detalleid)
                dp.detalleid,
                dp.cantidadpaquetes AS cantidad,
                dp.preciounitario,
                dp.piezastotales,
                (dp.preciounitario * dp.piezastotales) AS subtotal,
                dp.esbackorder,
                dp.cantidadsurtida,
                dp.cantidadbackorder,
                p.nombreproducto AS producto_nombre,
                COALESCE(pv.dimensiones, pv.color_nombre, 'Estándar') AS variante_nombre,
                pv.color_nombre,
                pv.sku,
                pv.stock AS stock_actual_variante,
                t.cantidad AS tamano_cantidad
            FROM detallesdelpedido dp
            INNER JOIN producto_variantes pv ON dp.varianteid = pv.varianteid
            INNER JOIN productos p ON pv.productoid = p.productoid AND p.tenant_id = $2
            LEFT JOIN cat_tamanopaquetes t ON dp.tamanoid = t.tamanoid AND t.tenant_id = $2
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
                logoExists = true;
            }
        } catch (err) {
            logger.info('Logo no encontrado, usando texto', { requestId: req.requestId });
        }

        // Function to render header on each page
        const renderHeader = (doc, pedido, logoPath, logoExists) => {
            // Logo
            if (logoExists && fs.existsSync(logoPath)) {
                doc.image(logoPath, 50, 45, { width: 80 });
            }

            // Company info - left side
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

            // Header derecho - Folio, Fecha, Estatus
            doc.fontSize(14)
               .font('Helvetica-Bold')
               .fillColor('#F97316')
               .text('REMISIÓN DE VENTA', 350, 50, { width: 212, align: 'right' });

            doc.fontSize(9)
               .font('Helvetica')
               .fillColor('#333333')
               .text(`Pedido: #${pedido.numero_pedido_cliente || pedido.pedidoid}`, 350, 70, { width: 212, align: 'right' })
               .text(`Folio Interno: ${String(pedido.pedidoid).padStart(6, '0')}`, 350, 85, { width: 212, align: 'right' })
               .text(`Fecha: ${new Date(pedido.fechapedido).toLocaleDateString('es-MX', { 
                   year: 'numeric', 
                   month: 'long', 
                   day: 'numeric' 
               })}`, 350, 100, { width: 212, align: 'right' })
               .text(`Estatus: ${pedido.estatus}`, 350, 115, { width: 212, align: 'right' });

            // Separator line
            doc.moveTo(50, 135)
               .lineTo(562, 135)
               .strokeColor('#F97316')
               .lineWidth(2)
               .stroke();

            // Client information section
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
        };

        // Event listener for automatic header rendering on new pages
        doc.on('pageAdded', () => {
            renderHeader(doc, pedido, logoPath, logoExists);
        });

        // Render header on first page manually
        renderHeader(doc, pedido, logoPath, logoExists);

        // Separate items by REAL stock availability (FIXED CALCULATION)
        let itemsEnExistencia = detalles.filter(item => {
            const stockActual = parseInt(item.stock_actual_variante) || 0;
            const cantidadRequerida = parseInt(item.cantidad) * parseInt(item.tamano_cantidad || 1);
            const esBajoPedido = stockActual < cantidadRequerida;
            return !esBajoPedido;
        });
        let itemsBajoPedido = detalles.filter(item => {
            const stockActual = parseInt(item.stock_actual_variante) || 0;
            const cantidadRequerida = parseInt(item.cantidad) * parseInt(item.tamano_cantidad || 1);
            const esBajoPedido = stockActual < cantidadRequerida;
            return esBajoPedido;
        });

        // ROLE-BASED FILTERING: Apply filtering if requested
        if (filtrarPorRol) {
            const isInventarios = userRole === 'inventarios';
            const isFinanzas = ['finanzas', 'gerente_finanzas'].includes(userRole);
            
            if (isInventarios) {
                // Inventarios only sees BACKORDER items (without prices)
                itemsEnExistencia = [];
                // itemsBajoPedido stays as is
            } else if (isFinanzas) {
                // Finanzas only sees IN-STOCK items (with prices)
                itemsBajoPedido = [];
                // itemsEnExistencia stays as is
            }
        }

        let yPosition = 260;
        const rowHeight = 25;

        // Helper function to render table header (SMART PAGINATION)
        const renderTableHeader = (title, yPos, headerColor = '#F97316') => {
            // Check if there's enough space for header + at least one row (~70pts total)
            if (yPos + 70 > 730) {
                doc.addPage();
                yPos = 260; // Start below header on new page
            }

            doc.moveTo(50, yPos - 10)
               .lineTo(562, yPos - 10)
               .strokeColor('#CCCCCC')
               .lineWidth(1)
               .stroke();

            doc.fontSize(12)
               .font('Helvetica-Bold')
               .fillColor(headerColor)
               .text(title, 50, yPos);

    const headerY = yPos + 25;
    doc.fontSize(9)
       .font('Helvetica-Bold')
       .fillColor('#FFFFFF')
       .rect(50, headerY, 512, 20)
       .fillAndStroke(headerColor, headerColor);

    doc.fillColor('#FFFFFF')
       .text('CANT.', 55, headerY + 6)
       .text('DESCRIPCIÓN', 110, headerY + 6)
       .text('TAMAÑO', 290, headerY + 6)
       .text('ESTADO', 350, headerY + 6);
    
    // Only show price columns if mostrarPrecios is true
    if (mostrarPrecios) {
        doc.text('P. UNIT.', 420, headerY + 6)
           .text('TOTAL', 480, headerY + 6, { align: 'right', width: 75 });
    }

    return headerY + 30;
};

// Helper function to render items (SMART PAGINATION)
// Pass mostrarPrecios to control price visibility
const renderItems = (items, startY, alternateColor = '#F9F9F9', pedidoEstatus = '', mostrarPrecios = true) => {
    let currentY = startY;
    doc.font('Helvetica').fillColor('#333333');

    items.forEach((item, index) => {
        // Check if there's space for complete item block (row height + padding = ~30pts)
        // Use 730 as threshold to ensure we have at least 30pts before page end (760)
        if (currentY + rowHeight > 730) {
            doc.addPage();
            currentY = 260; // Start below header on new page
        }

        if (index % 2 === 0) {
            doc.rect(50, currentY - 5, 512, rowHeight)
               .fillAndStroke(alternateColor, alternateColor);
        }

        const descripcionLinea1 = `${item.producto_nombre}`;
        const descripcionLinea2 = item.color_nombre 
            ? `${item.variante_nombre} - Color: ${item.color_nombre}`
            : `${item.variante_nombre}`;

        // 🚨 MISIÓN 4: Use Math.round() to prevent decimal issues in cantidad
        const cantidadSegura = Math.round(parseInt(item.cantidad) || 0);
        const tamanoSeguro = Math.round(parseInt(item.tamano_cantidad) || 1);
        
        // Determinar estado del badge
        const stockActual = parseInt(item.stock_actual_variante) || 0;
        const cantidadRequerida = cantidadSegura * tamanoSeguro;
        const hayStockSuficiente = stockActual >= cantidadRequerida;
        
        // Determinar si el pedido ya fue procesado/surtido por su estatus real
        // Los estatus que indican que el pedido ya fue atendido:
        const estatusSurtido = ['surtido', 'enviado', 'entregado', 'confirmado'];
        const pedidoProcesado = pedidoEstatus && estatusSurtido.includes(pedidoEstatus.toLowerCase().trim());
        
        let badgeColor, badgeText;
        if (!hayStockSuficiente) {
            // Sin stock suficiente al momento del pedido → Bajo Pedido
            badgeColor = '#DC2626'; // Rojo
            badgeText = 'BAJO PEDIDO';
        } else if (pedidoProcesado) {
            // El pedido ya fue surtido/enviado/entregado → Surtido
            badgeColor = '#F97316'; // Naranja
            badgeText = 'SURTIDO';
        } else {
            // Hay stock y el pedido aún está pendiente → Con Stock
            badgeColor = '#16A34A'; // Verde
            badgeText = 'CON STOCK';
        }
        
        doc.fillColor('#333333')
           .fontSize(9)
           .font('Helvetica')
           .text(cantidadSegura, 55, currentY)
           .text(descripcionLinea1, 110, currentY, { width: 170 })
           .text(descripcionLinea2, 110, currentY + 10, { width: 170 })
           .text(tamanoSeguro > 1 ? `Pack ${tamanoSeguro}` : 'Unit.', 290, currentY);
        
        // Badge de estado con color
        doc.save();
        doc.roundedRect(350, currentY - 2, 60, 12, 3)
           .fillAndStroke(badgeColor, badgeColor);
        doc.restore();
        
        doc.fontSize(7)
           .font('Helvetica-Bold')
           .fillColor('#FFFFFF')
           .text(badgeText, 350, currentY + 1, { width: 60, align: 'center' });
        
        // Only show prices if mostrarPrecios is true
        if (mostrarPrecios) {
            doc.fillColor('#333333')
               .fontSize(9)
               .font('Helvetica')
               .text(`$${parseFloat(item.preciounitario).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 420, currentY)
               .text(`$${parseFloat(item.subtotal).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 480, currentY, { align: 'right', width: 75 });
        }

        currentY += rowHeight;
    });

    return currentY;
};

// Render IN-STOCK items section
if (itemsEnExistencia.length > 0) {
    yPosition = renderTableHeader('PRODUCTOS LISTOS PARA ENTREGA', yPosition, '#F97316');
    yPosition = renderItems(itemsEnExistencia, yPosition, '#F9F9F9', pedido.estatus, mostrarPrecios);
    yPosition += 10;
}

// Render BACKORDER items section with distinct styling
if (itemsBajoPedido.length > 0) {
    // Add minimal spacing if there were in-stock items
    if (itemsEnExistencia.length > 0) {
        yPosition += 5;
    }

    yPosition = renderTableHeader('PRODUCTOS BAJO PEDIDO (PENDIENTES)', yPosition, '#DC2626');
    yPosition = renderItems(itemsBajoPedido, yPosition, '#FEE2E2', pedido.estatus, mostrarPrecios);
    
    // Add informative note immediately after backorder table
    yPosition += 5;
    
    // Dashed border box for the note
    doc.save();
    doc.strokeColor('#DC2626')
       .lineWidth(1)
       .dash(5, { space: 3 })
       .rect(50, yPosition, 512, 50)
       .stroke();
    doc.restore();

    doc.fontSize(8)
       .font('Helvetica-Bold')
       .fillColor('#DC2626')
       .text('NOTA IMPORTANTE:', 60, yPosition + 10);
    
    doc.fontSize(8)
       .font('Helvetica')
       .fillColor('#666666')
       .text(
           'Los productos marcados como BAJO PEDIDO tienen un tiempo estimado de fabricación de 7-15 días hábiles. ' +
           'Se le notificará vía correo electrónico cuando estén listos para su entrega.',
           60,
           yPosition + 25,
           { width: 492, align: 'left', lineGap: 2 }
       );
    
    yPosition += 55;
}

yPosition += 5;

doc.moveTo(50, yPosition)
   .lineTo(562, yPosition)
   .strokeColor('#CCCCCC')
   .lineWidth(1)
   .stroke();

yPosition += 10;

// Only render financial summary if mostrarPrecios is true
if (!mostrarPrecios) {
    // Add note for inventory users
    doc.fontSize(10)
       .font('Helvetica')
       .fillColor('#666666')
       .text('Este documento es una remisión de inventario. Los precios han sido omitidos.', 50, yPosition, {
           width: 512,
           align: 'center'
       });
    
    yPosition += 20;
    doc.text('Gracias por su colaboración.', 50, yPosition, {
        width: 512,
        align: 'center'
    });
    
    doc.end();
    return;
}

// Calculate totals by stock status - FORCED RECALCULATION WITH CORRECT FORMULA
let totalEnStock = 0;
let totalSinStock = 0;
let totalPiezasEntregadas = 0;

detalles.forEach((item) => {
    // CORRECT SUBTOTAL CALCULATION: (precioUnitario * tamano_cantidad) * cantidad
    const precioUnitario = parseFloat(item.preciounitario) || 0;
    const tamanoCantidad = parseInt(item.tamano_cantidad || 1);
    const cantidad = parseInt(item.cantidad) || 0;
    const itemSubtotal = parseFloat(((precioUnitario * tamanoCantidad) * cantidad).toFixed(2));
    const piezasTotales = parseInt(item.piezastotales) || 0;
    
    // Use REAL stock to determine backorder status
    const stockActual = parseInt(item.stock_actual_variante) || 0;
    const cantidadRequerida = cantidad * tamanoCantidad;
    const esBajoPedido = stockActual < cantidadRequerida;
    
    if (esBajoPedido) {
        totalSinStock += itemSubtotal;
    } else {
        totalEnStock += itemSubtotal;
    }
    
    totalPiezasEntregadas += piezasTotales;
});

// Recalculate subtotal from actual items (DO NOT trust database montototal)
const subtotalProductos = parseFloat((totalEnStock + totalSinStock).toFixed(2));

// Parse shipping with fallback to 0
const costoEnvio = parseFloat(pedido.costoenvio) || 0;

// CRITICAL FIX: Only apply discount if there's a valid coupon ID (must be a positive integer)
// This prevents 'phantom discounts' on orders without promotions
const cuponIdNumerico = parseInt(pedido.cupon_id);
const tieneCupon = !isNaN(cuponIdNumerico) && cuponIdNumerico > 0;
const montoDescuento = tieneCupon ? (parseFloat(pedido.monto_descuento) || 0) : 0;

// Calculate REAL total: Subtotal + Shipping - Discount (only if coupon exists)
const totalCalculado = parseFloat((subtotalProductos + costoEnvio - montoDescuento).toFixed(2));

// Financial Summary Box - Dynamic height based on content
const boxX = 350;
const boxWidth = 212;
let boxHeight = 28; // Base height for title

// Calculate dynamic height
boxHeight += 12; // Total Piezas
boxHeight += 12; // Total En Stock
boxHeight += 12; // Total Backorder
boxHeight += 6;  // Separator
boxHeight += 12; // Subtotal
if (costoEnvio > 0) boxHeight += 12;
if (tieneCupon && montoDescuento > 0) boxHeight += 12;
boxHeight += 6;  // Separator before total
boxHeight += 14; // Total final

// Check if we need a new page for the financial summary box + footer text (~50px extra)
const spaceNeeded = boxHeight + 50;
if (yPosition + spaceNeeded > 750) {
    doc.addPage();
    yPosition = 260; // Start below header on new page
}

doc.save();
doc.roundedRect(boxX, yPosition, boxWidth, boxHeight, 5)
   .fillAndStroke('#FFF7ED', '#F97316');
doc.restore();

// Box Title
doc.fontSize(11)
   .font('Helvetica-Bold')
   .fillColor('#F97316')
   .text('RESUMEN FINANCIERO', boxX + 5, yPosition + 8, { width: boxWidth - 10, align: 'center' });

// Separator line
doc.moveTo(boxX + 10, yPosition + 22)
   .lineTo(boxX + boxWidth - 10, yPosition + 22)
   .strokeColor('#F97316')
   .lineWidth(0.5)
   .stroke();

let lineY = yPosition + 28;

// Total Pieces
doc.fontSize(9)
   .font('Helvetica')
   .fillColor('#666666')
   .text('Total Piezas:', boxX + 10, lineY);

doc.font('Helvetica-Bold')
   .fillColor('#333333')
   .text(`${totalPiezasEntregadas.toLocaleString('es-MX')} pzas`, boxX + boxWidth - 70, lineY, { width: 60, align: 'right' });

lineY += 12;

// Total En Stock (green)
doc.fontSize(8)
   .font('Helvetica')
   .fillColor('#666666')
   .text('Productos en Stock:', boxX + 10, lineY);

doc.font('Helvetica-Bold')
   .fillColor('#10B981')
   .text(`$${totalEnStock.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, boxX + boxWidth - 90, lineY, { width: 80, align: 'right' });

lineY += 12;

// Total Backorder (red)
doc.fontSize(8)
   .font('Helvetica')
   .fillColor('#666666')
   .text('Productos Backorder:', boxX + 10, lineY);

doc.font('Helvetica-Bold')
   .fillColor('#DC2626')
   .text(`$${totalSinStock.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, boxX + boxWidth - 90, lineY, { width: 80, align: 'right' });

lineY += 12;

// Separator
doc.moveTo(boxX + 10, lineY)
   .lineTo(boxX + boxWidth - 10, lineY)
   .strokeColor('#E5E7EB')
   .lineWidth(0.3)
   .stroke();

lineY += 6;

// Subtotal
doc.fontSize(9)
   .font('Helvetica')
   .fillColor('#666666')
   .text('Subtotal:', boxX + 10, lineY);

doc.font('Helvetica-Bold')
   .fillColor('#333333')
   .text(`$${subtotalProductos.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, boxX + boxWidth - 90, lineY, { width: 80, align: 'right' });

lineY += 12;

// Shipping (if applicable)
if (costoEnvio > 0) {
    doc.fontSize(9)
       .font('Helvetica')
       .fillColor('#666666')
       .text('Envío:', boxX + 10, lineY);
    
    doc.font('Helvetica-Bold')
       .fillColor('#333333')
       .text(`$${costoEnvio.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, boxX + boxWidth - 90, lineY, { width: 80, align: 'right' });
    
    lineY += 12;
}

// Discount (if applicable)
if (tieneCupon && montoDescuento > 0) {
    doc.fontSize(9)
       .font('Helvetica')
       .fillColor('#DC2626')
       .text('Descuento:', boxX + 10, lineY);
    
    doc.font('Helvetica-Bold')
       .fillColor('#DC2626')
       .text(`-$${montoDescuento.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, boxX + boxWidth - 90, lineY, { width: 80, align: 'right' });
    
    lineY += 12;
}

// Separator before total
doc.moveTo(boxX + 10, lineY)
   .lineTo(boxX + boxWidth - 10, lineY)
   .strokeColor('#F97316')
   .lineWidth(1)
   .stroke();

lineY += 8;

// Total
doc.fontSize(11)
   .font('Helvetica-Bold')
   .fillColor('#F97316')
   .text('TOTAL:', boxX + 10, lineY);

doc.fontSize(12)
   .fillColor('#F97316')
   .text(`$${totalCalculado.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`, boxX + boxWidth - 110, lineY, { width: 100, align: 'right' });

yPosition += boxHeight + 5;

yPosition += 25;

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
        logger.error('Error generando PDF', {
            error: error.message,
            stack: error.stack,
            code: error.code,
            name: error.name,
            requestId: req.requestId,
            tenantId: req.tenant?.tenant_id
        });
        
        if (!res.headersSent) {
            res.status(500).json({ 
                success: false,
                message: "Error al generar el PDF"
            });
        }
    }
}

async function generarPDFEstadoCuenta(req, res) {
    const { mes, anio } = req.params;
    const { tenant_id } = req.tenant;
    const clienteId = req.user?.userId ?? req.user?.id ?? req.user?.clienteId ?? req.user?.clienteid;

    try {
        const mesNum = parseInt(mes, 10);
        const anioNum = parseInt(anio, 10);

        if (!mesNum || mesNum < 1 || mesNum > 12 || !anioNum || anioNum < 2000) {
            return res.status(400).json({ error: 'Mes o año inválido' });
        }

        const creditoQuery = await db.query(
            `SELECT credito_id, limite_credito, saldo_deudor 
             FROM cliente_creditos 
             WHERE cliente_id = $1 AND tenant_id = $2 AND estado_credito = 'ACTIVO'
             LIMIT 1`,
            [clienteId, tenant_id]
        );

        if (creditoQuery.rows.length === 0) {
            return res.status(404).json({ error: 'No tienes una línea de crédito activa' });
        }

        const credito = creditoQuery.rows[0];
        const creditoId = credito.credito_id;

        const fechaInicio = new Date(anioNum, mesNum - 1, 1);
        const fechaFin = new Date(anioNum, mesNum, 0, 23, 59, 59);

        const saldoInicialQuery = await db.query(
            `SELECT COALESCE(
                (SELECT saldo_despues_movimiento 
                 FROM credito_movimientos 
                 WHERE credito_id = $1 AND tenant_id = $2 AND fecha_movimiento < $3
                 ORDER BY fecha_movimiento DESC, movimiento_id DESC
                 LIMIT 1
                ), 0
             ) as saldo_inicial`,
            [creditoId, tenant_id, fechaInicio]
        );
        const saldoInicial = parseFloat(saldoInicialQuery.rows[0]?.saldo_inicial || 0);

        const movimientosQuery = await db.query(
            `SELECT 
                movimiento_id, tipo_movimiento, monto, saldo_despues_movimiento,
                referencia_id, descripcion, fecha_movimiento
             FROM credito_movimientos
             WHERE credito_id = $1 AND tenant_id = $2 
               AND fecha_movimiento >= $3 AND fecha_movimiento <= $4
             ORDER BY fecha_movimiento ASC, movimiento_id ASC`,
            [creditoId, tenant_id, fechaInicio, fechaFin]
        );

        const movimientos = movimientosQuery.rows;
        const saldoFinal = movimientos.length > 0 
            ? parseFloat(movimientos[movimientos.length - 1].saldo_despues_movimiento || 0)
            : saldoInicial;

        const clienteQuery = await db.query(
            `SELECT c.nombre, c.apellido, c.email, c.telefono
             FROM clientes c
             WHERE c.clienteid = $1 AND c.tenant_id = $2`,
            [clienteId, tenant_id]
        );
        const cliente = clienteQuery.rows[0] || {};

        const tenantQuery = await db.query(
            `SELECT nombre_comercial, logo_url FROM tenants WHERE tenant_id = $1`,
            [tenant_id]
        );
        const tenant = tenantQuery.rows[0] || {};

        const mesesNombres = [
            'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
        ];

        const doc = new PDFDocument({ 
            size: 'LETTER',
            margins: { top: 50, bottom: 50, left: 50, right: 50 }
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="Estado-Cuenta-${mesesNombres[mesNum - 1]}-${anioNum}.pdf"`);

        doc.pipe(res);

        let yPosition = 50;

        doc.fontSize(20)
           .font('Helvetica-Bold')
           .fillColor('#F97316')
           .text(tenant.nombre_comercial || 'RazoConnect', 50, yPosition);

        yPosition += 30;

        doc.fontSize(16)
           .fillColor('#333333')
           .text('Estado de Cuenta', 50, yPosition);

        yPosition += 25;

        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#666666')
           .text(`Cliente: ${cliente.nombre || ''} ${cliente.apellido || ''}`, 50, yPosition);

        yPosition += 15;
        doc.text(`Periodo: ${mesesNombres[mesNum - 1]} ${anioNum}`, 50, yPosition);

        yPosition += 15;
        doc.text(`Fecha de emisión: ${new Date().toLocaleDateString('es-MX')}`, 50, yPosition);

        yPosition += 30;

        doc.fontSize(11)
           .font('Helvetica-Bold')
           .fillColor('#333333')
           .text('Resumen del Periodo', 50, yPosition);

        yPosition += 20;

        const boxY = yPosition;
        doc.roundedRect(50, boxY, 512, 60, 5)
           .fillAndStroke('#F5F1ED', '#E0E0E0');

        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#666666')
           .text('Saldo Inicial:', 60, boxY + 15);
        doc.font('Helvetica-Bold')
           .fillColor('#333333')
           .text(`$${saldoInicial.toFixed(2)}`, 200, boxY + 15);

        doc.font('Helvetica')
           .fillColor('#666666')
           .text('Saldo Final:', 60, boxY + 35);
        doc.font('Helvetica-Bold')
           .fillColor(saldoFinal > 0 ? '#DC2626' : '#16A34A')
           .text(`$${saldoFinal.toFixed(2)}`, 200, boxY + 35);

        doc.font('Helvetica')
           .fillColor('#666666')
           .text('Límite de Crédito:', 320, boxY + 15);
        doc.font('Helvetica-Bold')
           .fillColor('#333333')
           .text(`$${parseFloat(credito.limite_credito || 0).toFixed(2)}`, 450, boxY + 15);

        const disponible = Math.max(parseFloat(credito.limite_credito || 0) - saldoFinal, 0);
        doc.font('Helvetica')
           .fillColor('#666666')
           .text('Crédito Disponible:', 320, boxY + 35);
        doc.font('Helvetica-Bold')
           .fillColor('#16A34A')
           .text(`$${disponible.toFixed(2)}`, 450, boxY + 35);

        yPosition = boxY + 80;

        doc.fontSize(11)
           .font('Helvetica-Bold')
           .fillColor('#333333')
           .text('Movimientos del Periodo', 50, yPosition);

        yPosition += 25;

        if (movimientos.length === 0) {
            doc.fontSize(10)
               .font('Helvetica')
               .fillColor('#999999')
               .text('No hay movimientos en este periodo', 50, yPosition, { align: 'center', width: 512 });
        } else {
            const tableTop = yPosition;
            const colWidths = {
                fecha: 70,
                concepto: 180,
                referencia: 80,
                cargo: 70,
                abono: 70,
                saldo: 70
            };

            doc.fontSize(9)
               .font('Helvetica-Bold')
               .fillColor('#FFFFFF');

            doc.roundedRect(50, tableTop, 512, 20, 3)
               .fill('#333333');

            doc.text('Fecha', 55, tableTop + 6);
            doc.text('Concepto', 130, tableTop + 6);
            doc.text('Referencia', 315, tableTop + 6);
            doc.text('Cargo', 400, tableTop + 6);
            doc.text('Abono', 475, tableTop + 6);
            doc.text('Saldo', 545, tableTop + 6, { width: 50, align: 'right' });

            yPosition = tableTop + 25;

            movimientos.forEach((mov, index) => {
                // Smart pagination: Check space for complete row (30pts)
                if (yPosition > 710) {
                    doc.addPage();
                    yPosition = 50;
                }

                const rowBg = index % 2 === 0 ? '#FFFFFF' : '#F9FAFB';
                doc.rect(50, yPosition, 512, 30)
                   .fill(rowBg);

                const fecha = new Date(mov.fecha_movimiento);
                const fechaStr = fecha.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });

                doc.fontSize(8)
                   .font('Helvetica')
                   .fillColor('#333333')
                   .text(fechaStr, 55, yPosition + 8);

                const concepto = mov.descripcion || 'Movimiento';
                doc.text(concepto, 130, yPosition + 8, { width: 175, ellipsis: true });

                const referencia = mov.referencia_id || '-';
                doc.text(referencia, 315, yPosition + 8, { width: 75, ellipsis: true });

                const esCargo = mov.tipo_movimiento === 'CARGO';
                const monto = parseFloat(mov.monto || 0);

                if (esCargo) {
                    doc.roundedRect(395, yPosition + 5, 65, 18, 4)
                       .fillAndStroke('#F8D7DA', '#F8D7DA');
                    doc.fontSize(8)
                       .font('Helvetica-Bold')
                       .fillColor('#721C24')
                       .text(`$${monto.toFixed(2)}`, 400, yPosition + 9, { width: 60, align: 'center' });
                } else {
                    doc.roundedRect(470, yPosition + 5, 65, 18, 4)
                       .fillAndStroke('#D4EDDA', '#D4EDDA');
                    doc.fontSize(8)
                       .font('Helvetica-Bold')
                       .fillColor('#155724')
                       .text(`$${monto.toFixed(2)}`, 475, yPosition + 9, { width: 60, align: 'center' });
                }

                const saldo = parseFloat(mov.saldo_despues_movimiento || 0);
                doc.fontSize(8)
                   .font('Helvetica')
                   .fillColor('#333333')
                   .text(`$${saldo.toFixed(2)}`, 540, yPosition + 8, { width: 50, align: 'right' });

                yPosition += 30;
            });
        }

        yPosition += 20;

        // Smart pagination: Ensure footer block stays together (needs ~50pts)
        if (yPosition > 700) {
            doc.addPage();
            yPosition = 50;
        }

        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('#999999')
           .text('Este documento es un estado de cuenta informativo. Para cualquier aclaración, contacte a su ejecutivo.', 50, yPosition, {
               width: 512,
               align: 'center'
           });

        yPosition += 15;
        doc.text('Gracias por su confianza.', 50, yPosition, {
            width: 512,
            align: 'center'
        });

        doc.end();

    } catch (error) {
        logger.error('Error generando PDF de estado de cuenta:', {
      error: error.message,
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
    generarPDFPedido,
    generarPDFEstadoCuenta
};
