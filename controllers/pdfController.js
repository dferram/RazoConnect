const PDFDocument = require('pdfkit');
const logger = require('../utils/logger');
const db = require('../db');
const path = require('path');
const fs = require('fs');

async function generarPDFPedido(req, res) {
    const pedidoId = parseInt(req.params.id);
    const { tenant_id } = req.tenant;
    
    // ⚡ NEW: Extract selectedItems from query parameter (current session selection)
    const selectedItemsParam = req.query.selectedItems;
    let selectedItemIds = [];
    if (selectedItemsParam) {
        try {
            selectedItemIds = selectedItemsParam.split(',').map(id => parseInt(id, 10)).filter(id => !isNaN(id));
            logger.info('✅ PDF: Selected items extracted', {
                count: selectedItemIds.length,
                itemIds: selectedItemIds.slice(0, 5), // Show first 5
                pedidoId,
                requestId: req.requestId
            });
        } catch (e) {
            logger.warn('❌ Could not parse selectedItems', { 
                selectedItemsParam,
                error: e.message,
                requestId: req.requestId 
            });
        }
    } else {
        logger.info('⚠️ PDF: No selectedItems in query', {
            pedidoId,
            requestId: req.requestId
        });
    }
    
    // ⚡ NEW: Extract mode parameter from query (?mode=surtido_only or ?mode=full)
    const requestedMode = (req.query.mode || 'full').toLowerCase().trim();
    
    // Support for hiding prices (for inventarios role)
    // Changed to 'let' to allow role-based enforcement
    let mostrarPrecios = req.query.mostrarPrecios !== 'false';
    
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

    // ⚡ ROLE-BASED MODE ENFORCEMENT
    let finalMode = requestedMode;
    
    // Inventarios: hide prices — all other roles see prices
    if (userRoles.some(r => r === 'inventarios')) {
        mostrarPrecios = false;
    }

    logger.info('PDF: Mode determined', {
        requestedMode,
        finalMode,
        userRole,
        pedidoId,
        requestId: req.requestId
    });

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
        // Incluir TODOS los roles de admin que tienen acceso a PDFs
        const adminRoles = [
            'admin', 'superadmin', 'super_admin', 'super-admin',
            'inventarios', 'finanzas', 'gerente_finanzas', 'gerente_comercial',
            'gerente_operaciones', 'jefe_almacen'
        ];
        const isAdmin = userRoles.some(r => adminRoles.includes(r));
        
        // Comparación de números para evitar mismatch de tipos (string vs integer de DB)
        const pedidoClienteIdNum = parseInt(pedido.clienteid, 10);
        const isClienteOwner = userRole === 'cliente' && pedidoClienteIdNum === userId;
        
        // Verificación de agente con columna correcta
        let isAgenteAutorizado = false;
        if (userRoles.includes('agente') && userId) {
            const agenteClienteCheck = await db.query(
                `SELECT 1 FROM clientes
                 WHERE clienteid = $1
                 AND tenant_id = $3
                 AND (agenteid = $2 OR agentedeventasid = $2)
                 LIMIT 1`,
                [pedido.clienteid, userId, tenant_id]
            );
            isAgenteAutorizado = agenteClienteCheck.rows.length > 0;
        }

        // Clientes y agentes ven una vista simplificada: sin etiquetas internas del almacén
        const isClienteOrAgente = isClienteOwner || isAgenteAutorizado;

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
        // INCLUIR ronda_surtido para mostrar en qué ronda se surtió cada producto
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
                COALESCE(dp.estado_producto, 'Pendiente') as estado_producto,
                p.nombreproducto AS producto_nombre,
                COALESCE(pv.dimensiones, pv.color_nombre, 'Estándar') AS variante_nombre,
                pv.color_nombre,
                pv.sku,
                pv.stock AS stock_actual_variante,
                t.cantidad AS tamano_cantidad,
                (
                  SELECT json_agg(json_build_object(
                    'ronda', COALESCE(dr.ronda_surtido, 1),
                    'cantidad', dr.cantidad_paquetes_surtidos
                  ) ORDER BY dr.ronda_surtido)
                  FROM detalles_remision dr
                  INNER JOIN remisiones r ON dr.remision_id = r.remision_id
                  WHERE dr.detalle_pedido_id = dp.detalleid
                ) as rondas_surtido
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

        // 5-TABLE UNIVERSAL CATEGORIZATION — strictly using database estado_producto
        // 1. Facturado (negro)
        const itemsFacturados = detalles.filter(item => 
            (item.estado_producto || '').toLowerCase().trim() === 'facturado'
        );

        // 2. Surtido (naranja)
        const itemsSurtidos = detalles.filter(item => 
            (item.estado_producto || '').toLowerCase().trim() === 'surtido'
        );

        // 3. Con stock - Marcado por inventarios (verde)
        // Note: For 'Con stock' items, we still use selectedItemIds to highlight current session selection if needed
        const itemsMarcados = detalles.filter(item => {
            const estado = (item.estado_producto || '').toLowerCase().trim();
            if (estado !== 'con stock') return false;
            return selectedItemIds && selectedItemIds.length > 0 && selectedItemIds.includes(item.detalleid);
        });

        // 4. Con stock - Sin marcar (azul)
        const itemsConStock = detalles.filter(item => {
            const estado = (item.estado_producto || '').toLowerCase().trim();
            if (estado !== 'con stock') return false;
            if (selectedItemIds && selectedItemIds.length > 0 && selectedItemIds.includes(item.detalleid)) return false;
            return true;
        });

        // 5. Bajo pedido (rojo)
        const itemsBajoPedido = detalles.filter(item => 
            (item.estado_producto || '').toLowerCase().trim() === 'bajo pedido'
        );

        logger.info('PDF: Items categorized (Strict database states)', {
            pedidoId,
            surtidos: itemsSurtidos.length,
            marcados: itemsMarcados.length,
            conStock: itemsConStock.length,
            bajoPedido: itemsBajoPedido.length,
            facturados: itemsFacturados.length,
            requestId: req.requestId
        });

        // DEBUG MODE: ?debug=true returns an HTML page instead of the PDF
        if (req.query.debug === 'true') {
            // Categorizar basado ESTRICTAMENTE en estado_producto de BD
            const categorizar = item => {
                const estado = (item.estado_producto || '').toLowerCase().trim();
                if (estado === 'facturado') return 'FACTURADO';
                if (estado === 'surtido') return 'SURTIDO';
                if (estado === 'con stock') return 'CON_STOCK';
                if (estado === 'bajo pedido') return 'BAJO_PEDIDO';
                return 'PENDIENTE';
            };

            const colorMap = {
                FACTURADO:   { bg: '#1F2937', text: '#fff' },
                SURTIDO:     { bg: '#F97316', text: '#fff' },
                BAJO_PEDIDO: { bg: '#DC2626', text: '#fff' },
                CON_STOCK:   { bg: '#3B82F6', text: '#fff' },
                MARCADO:     { bg: '#10B981', text: '#fff' },
                PENDIENTE:   { bg: '#6B7280', text: '#fff' },
            };

            const rows = detalles.map(item => {
                const cat = categorizar(item);
                const isMarcado = itemsMarcados.some(m => m.detalleid === item.detalleid);
                const finalCat = isMarcado ? 'MARCADO' : cat;
                const c = colorMap[finalCat];
                return `<tr>
                    <td>${item.detalleid}</td>
                    <td>${item.producto_nombre}</td>
                    <td>${item.sku || '-'}</td>
                    <td>${item.cantidad}</td>
                    <td>${item.piezastotales}</td>
                    <td>${item.cantidadsurtida}</td>
                    <td>${item.esbackorder}</td>
                    <td>${item.estado_producto}</td>
                    <td>${item.stock_actual_variante}</td>
                    <td style="background:${c.bg};color:${c.text};font-weight:bold;text-align:center">${finalCat}</td>
                </tr>`;
            }).join('');

            const summary = [
                { label: 'SURTIDO', color: '#F97316', count: itemsSurtidos.length },
                { label: 'MARCADO POR INV.', color: '#10B981', count: itemsMarcados.length },
                { label: 'CON STOCK - SIN MARCAR', color: '#3B82F6', count: itemsConStock.length },
                { label: 'BAJO PEDIDO', color: '#DC2626', count: itemsBajoPedido.length },
                { label: 'FACTURADO', color: '#1F2937', count: itemsFacturados.length },
            ].map(s => `<span style="background:${s.color};color:#fff;padding:6px 14px;border-radius:6px;font-weight:bold;margin-right:8px">${s.label}: ${s.count}</span>`).join('');

            const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
            <title>DEBUG PDF — Pedido ${pedidoId}</title>
            <style>body{font-family:sans-serif;padding:24px;background:#f8f9fa}
            h1{color:#F97316}table{border-collapse:collapse;width:100%;font-size:13px}
            th{background:#374151;color:#fff;padding:8px 10px;text-align:left}
            td{padding:7px 10px;border-bottom:1px solid #e5e7eb}
            tr:nth-child(even) td{background:#f3f4f6}
            .summary{margin:16px 0}</style></head><body>
            <h1>🔍 DEBUG — Remisión Pedido #${pedidoId}</h1>
            <p>Role: <strong>${userRole}</strong> | selectedItemIds: <strong>[${selectedItemIds.join(', ') || 'ninguno'}]</strong> | Total items: <strong>${detalles.length}</strong></p>
            <div class="summary">${summary}</div>
            <table><thead><tr>
                <th>ID</th><th>Producto</th><th>SKU</th><th>Cant.</th>
                <th>Piezas Total</th><th>Cant. Surtida</th><th>esBackorder</th>
                <th>Estado Producto</th><th>Stock Variante</th><th>CATEGORÍA</th>
            </tr></thead><tbody>${rows}</tbody></table>
            </body></html>`;

            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send(html);
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
       .text('PAQUETES', 110, headerY + 6)
       .text('DESCRIPCIÓN', 160, headerY + 6)
       .text('TAMAÑO', 370, headerY + 6);
    
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

        // Determinar ronda de surtido para mostrar indicador
        let rondaTexto = '';
        if (item.rondas_surtido && Array.isArray(item.rondas_surtido) && item.rondas_surtido.length > 0) {
            const rondas = item.rondas_surtido.map(r => `R${r.ronda}`).join(', ');
            rondaTexto = ` [${rondas}]`;
        }

        // 🚨 MISIÓN 4: Use Math.round() to prevent decimal issues in cantidad
        const cantidadSegura = Math.round(parseInt(item.cantidad) || 0);
        const tamanoSeguro = Math.round(parseInt(item.tamano_cantidad) || 1);
        
        // Determinar texto de estado para mostrar
        const estadoTexto = pedidoEstatus || 'N/A';
        
        doc.fillColor('#333333')
           .fontSize(9)
           .font('Helvetica')
           .text(cantidadSegura, 55, currentY)
           .text(`${cantidadSegura} paquetes`, 110, currentY)
           .text(descripcionLinea1, 160, currentY, { width: 200 })
           .text(descripcionLinea2 + rondaTexto, 160, currentY + 10, { width: 200 })
           .text(tamanoSeguro > 1 ? `Pack ${tamanoSeguro}` : 'Unit.', 370, currentY)
           .font('Helvetica')
           .fontSize(9);
        
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

// SURTIDO (naranja)
if (itemsSurtidos.length > 0) {
    yPosition = renderTableHeader('SURTIDO', yPosition, '#F97316');
    yPosition = renderItems(itemsSurtidos, yPosition, '#FFF7ED', pedido.estatus, mostrarPrecios);
    yPosition += 10;
}

// CON STOCK — vista según rol
if (isClienteOrAgente) {
    // Clientes/agentes: una sola sección sin etiquetas internas del almacén
    const itemsConStockCliente = [...itemsMarcados, ...itemsConStock];
    if (itemsConStockCliente.length > 0) {
        yPosition = renderTableHeader('CON STOCK', yPosition, '#10B981');
        yPosition = renderItems(itemsConStockCliente, yPosition, '#F0FDF4', pedido.estatus, mostrarPrecios);
        yPosition += 10;
    }
} else {
    // Admin/inventarios: vista completa con distinción de marcado interno
    if (itemsMarcados.length > 0) {
        yPosition = renderTableHeader('CON STOCK - MARCADO POR INVENTARIOS', yPosition, '#10B981');
        yPosition = renderItems(itemsMarcados, yPosition, '#F0FDF4', pedido.estatus, mostrarPrecios);
        yPosition += 10;
    }
    if (itemsConStock.length > 0) {
        yPosition = renderTableHeader('CON STOCK - SIN MARCAR', yPosition, '#3B82F6');
        yPosition = renderItems(itemsConStock, yPosition, '#EFF6FF', pedido.estatus, mostrarPrecios);
        yPosition += 10;
    }
}

// BAJO PEDIDO (rojo)
if (itemsBajoPedido.length > 0) {
    yPosition = renderTableHeader('BAJO PEDIDO - SIN STOCK', yPosition, '#DC2626');
    yPosition = renderItems(itemsBajoPedido, yPosition, '#FEF2F2', pedido.estatus, mostrarPrecios);
    yPosition += 10;
}

// FACTURADO (negro)
if (itemsFacturados.length > 0) {
    yPosition = renderTableHeader('FACTURADO', yPosition, '#1F2937');
    yPosition = renderItems(itemsFacturados, yPosition, '#F3F4F6', pedido.estatus, mostrarPrecios);
    yPosition += 10;
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

// CRITICAL FIX: Calculate totals from VISIBLE items only (not all detalles)
// Choose items array based on current display mode
const chosenItems = [...itemsSurtidos, ...itemsMarcados, ...itemsConStock, ...itemsBajoPedido, ...itemsFacturados];

let totalEnStock = 0;
let totalSinStock = 0;
let totalPiezasEntregadas = 0;

chosenItems.forEach((item) => {
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
    const estadosHelper = require('../utils/estadosHelper');

    try {
        const mesNum = parseInt(mes, 10);
        const anioNum = parseInt(anio, 10);

        if (!mesNum || mesNum < 1 || mesNum > 12 || !anioNum || anioNum < 2000) {
            return res.status(400).json({ error: 'Mes o año inválido' });
        }

        // Get admin_id for this client (deterministic from estado)
        const adminIdForClient = await estadosHelper.getAdminByClienteEstado(clienteId, tenant_id);

        const creditoQuery = await db.query(
            `SELECT credito_id, limite_credito, saldo_deudor
             FROM cliente_creditos
             WHERE cliente_id = $1
               AND tenant_id = $2
               AND admin_id = $3
               AND estado_credito = 'ACTIVO'
             LIMIT 1`,
            [clienteId, tenant_id, adminIdForClient]
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

/**
 * Generar PDF de Verificación PRE-CONFIRMACIÓN
 * Muestra 3 tablas: Marcados | Con Stock No Marcados | Bajo Pedido
 * Para etapa de warehouse verification antes de confirmar en sistema
 * 
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

        // Get detailed items with stock information
        const detallesQuery = await db.query(
            `SELECT DISTINCT ON (dp.detalleid)
                dp.detalleid,
                dp.cantidadpaquetes AS cantidad,
                dp.preciounitario,
                dp.piezastotales,
                (dp.preciounitario * dp.piezastotales) AS subtotal,
                dp.esbackorder,
                dp.cantidadsurtida,
                p.nombreproducto AS producto_nombre,
                COALESCE(pv.dimensiones, pv.color_nombre, 'Estándar') AS variante_nombre,
                pv.color_nombre,
                pv.sku,
                pv.stock AS stock_actual_variante,
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

        // Categorize items into 3 groups
        let itemsMarcados = [];      // cantidadsurtida > 0
        let itemsConStockNoMarcados = [];  // cantidadsurtida = 0 AND stock >= piezas
        let itemsBajoPedido = [];    // stock < piezas

        detalles.forEach(item => {
            const cantidadSurtida = parseInt(item.cantidadsurtida || 0);
            const stockDisponible = parseInt(item.stock_disponible || 0);
            const piezasRequeridas = parseInt(item.piezastotales || 0);
            const tamanoCantidad = parseInt(item.tamano_cantidad || 1);
            const piezasNecesarias = (parseInt(item.cantidad || 0) * tamanoCantidad);

            const itemData = {
                sku: item.sku,
                nombreProducto: item.producto_nombre,
                dimensiones: item.dimensiones,
                variante: item.variante_nombre,
                color: item.color_nombre,
                cantidad: parseInt(item.cantidad || 0),
                paquetes: `${parseInt(item.cantidad || 0)} paquetes`,
                precioUnitario: parseFloat(item.preciounitario || 0),
                piezastotales: piezasRequeridas,
                subtotal: parseFloat(item.subtotal || 0),
                stockDisponible: stockDisponible,
                stockAdmin: parseInt(item.stock_admin || 0),
                tamanoCantidad: tamanoCantidad,
                tamanoTexto: tamanoCantidad > 1 ? `Pack ${tamanoCantidad}` : 'Unit.'
            };

            if (cantidadSurtida > 0) {
                itemsMarcados.push(itemData);
            } else if (stockDisponible >= piezasNecesarias) {
                itemsConStockNoMarcados.push(itemData);
            } else {
                itemsBajoPedido.push(itemData);
            }
        });

        const doc = new PDFDocument({ 
            size: 'LETTER',
            margins: { top: 50, bottom: 50, left: 50, right: 50 }
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="Verificacion-${pedidoId}.pdf"`);

        doc.pipe(res);

        const logoPath = path.join(__dirname, '..', 'icon', 'Logo_Razo.png');
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
               .text('Sistema de Gestión Comercial', logoExists ? 140 : 50, 75)
               .text('Tel: 55 6098 9524', logoExists ? 140 : 50, 90)
               .text('fegarcia@hotmail.com', logoExists ? 140 : 50, 105);

            doc.fontSize(14)
               .font('Helvetica-Bold')
               .fillColor('#F97316')
               .text('VERIFICACIÓN PRE-CONFIRMACIÓN', 350, 50, { width: 212, align: 'right' });

            doc.fontSize(9)
               .font('Helvetica')
               .fillColor('#333333')
               .text(`Pedido: #${pedido.numero_pedido_cliente || pedido.pedidoid}`, 350, 70, { width: 212, align: 'right' })
               .text(`Folio: ${String(pedido.pedidoid).padStart(6, '0')}`, 350, 85, { width: 212, align: 'right' })
               .text(`Fecha: ${new Date(pedido.fechapedido).toLocaleDateString('es-MX', { 
                   year: 'numeric', 
                   month: 'long', 
                   day: 'numeric' 
               })}`, 350, 100, { width: 212, align: 'right' })
               .text(`Estatus: ${pedido.estatus}`, 350, 115, { width: 212, align: 'right' });

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
        };

        // Render header on page creation
        doc.on('pageAdded', () => {
            renderHeader(doc, pedido, logoPath, logoExists);
        });

        renderHeader(doc, pedido, logoPath, logoExists);

        let yPosition = 260;
        const rowHeight = 25;

        // Helper to render table header
        const renderTableHeader = (title, yPos, color = '#F97316') => {
            if (yPos + 70 > 730) {
                doc.addPage();
                yPos = 260;
            }

            doc.moveTo(50, yPos - 10)
               .lineTo(562, yPos - 10)
               .strokeColor('#CCCCCC')
               .lineWidth(1)
               .stroke();

            doc.fontSize(12)
               .font('Helvetica-Bold')
               .fillColor(color)
               .text(title, 50, yPos);

            const headerY = yPos + 25;
            doc.fontSize(9)
               .font('Helvetica-Bold')
               .fillColor('#FFFFFF')
               .rect(50, headerY, 512, 20)
               .fillAndStroke(color, color);

            doc.fillColor('#FFFFFF')
               .text('SKU', 55, headerY + 6)
               .text('PRODUCTO', 110, headerY + 6)
               .text('CANT.', 320, headerY + 6)
               .text('TAMAÑO', 370, headerY + 6)
               .text('STOCK', 430, headerY + 6)
               .text('PRECIO', 480, headerY + 6, { align: 'right', width: 75 });

            return headerY + 30;
        };

        // Helper to render items
        const renderItems = (items, startY, bgColor = '#F9F9F9') => {
            let currentY = startY;
            doc.font('Helvetica').fillColor('#333333').fontSize(9);

            items.forEach((item, index) => {
                if (currentY + rowHeight > 730) {
                    doc.addPage();
                    currentY = 260;
                }

                if (index % 2 === 0) {
                    doc.rect(50, currentY - 5, 512, rowHeight)
                       .fillAndStroke(bgColor, bgColor);
                }

                const productoTexto = item.nombreProducto + (item.color ? ` (${item.color})` : '');
                
                doc.fillColor('#333333')
                   .fontSize(9)
                   .font('Helvetica')
                   .text(item.sku, 55, currentY)
                   .text(productoTexto, 110, currentY, { width: 200 })
                   .text(item.cantidad.toString(), 320, currentY)
                   .text(item.tamanoTexto, 370, currentY)
                   .text(item.stockDisponible.toString(), 430, currentY)
                   .text(`$${item.precioUnitario.toFixed(2)}`, 480, currentY, { align: 'right', width: 75 });

                currentY += rowHeight;
            });

            return currentY;
        };

        // Render MARCADOS section
        if (itemsMarcados.length > 0) {
            yPosition = renderTableHeader('PRODUCTOS MARCADOS PARA SURTIR', yPosition, '#10B981');
            yPosition = renderItems(itemsMarcados, yPosition, '#F0FDF4');
            yPosition += 10;
        }

        // Render CON STOCK NO MARCADOS section
        if (itemsConStockNoMarcados.length > 0) {
            yPosition = renderTableHeader('DISPONIBLE - SIN MARCAR', yPosition, '#3B82F6');
            yPosition = renderItems(itemsConStockNoMarcados, yPosition, '#EFF6FF');
            yPosition += 10;
        }

        // Render BAJO PEDIDO section
        if (itemsBajoPedido.length > 0) {
            yPosition = renderTableHeader('BAJO PEDIDO - SIN STOCK', yPosition, '#DC2626');
            yPosition = renderItems(itemsBajoPedido, yPosition, '#FEF2F2');
            yPosition += 10;
        }

        yPosition += 20;

        // Summary box
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
           .text(`Disponibles (sin marcar): ${itemsConStockNoMarcados.length}`, 60, yPosition + 30)
           .text(`Bajo Pedido: ${itemsBajoPedido.length}`, 60, yPosition + 50);

        yPosition += 85;

        // Footer instructions
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

    } catch (error) {
        logger.error('Error generando PDF de verificación:', {
            error: error.message,
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
    generarPDFPedido,
    generarPDFEstadoCuenta,
    generarPDFVerificacion
};
