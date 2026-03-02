const PDFDocument = require('pdfkit');
const pool = require('../db');
const logger = require('../utils/logger');
const configuracionService = require('./configuracionService');
const path = require('path');
const fs   = require('fs');

// ── Paleta de colores para factura formal ─────────────────────────────────
const COLOR_PRIMARIO      = '#1E3A5F'; // Azul marino oscuro — encabezados, títulos, totales
const COLOR_ACENTO        = '#2563EB'; // Azul medio — IVA, líneas de separación importantes  
const COLOR_TEXTO         = '#1A1A1A'; // Negro casi puro — texto principal
const COLOR_TEXTO_SUAVE   = '#555555'; // Gris oscuro — etiquetas secundarias
const COLOR_FONDO_HEADER  = '#F0F4F8'; // Gris azulado muy claro — fondo de encabezado de tabla
const COLOR_LINEA         = '#C8D6E5'; // Gris azulado — líneas separadoras
const COLOR_NARANJA       = '#F97316'; // Naranja Razo — SOLO para el logo/nombre empresa

async function generarFacturaPDF(pedidoId, tenantId, rol) {
  try {
    const pedidoData = await obtenerDatosPedido(pedidoId, tenantId);
    
    if (!pedidoData) {
      throw new Error('Pedido no encontrado o no pertenece al tenant');
    }

    const detalles = await obtenerDetallesPedido(pedidoId);
    
    // OBTENER IVA con protección contra NaN/null/undefined
    let ivaTasa = await configuracionService.getIvaTasa(tenantId);
    
    // Validación defensiva: si ivaTasa no es un número finito válido, usar 0.16 por defecto
    if (typeof ivaTasa !== 'number' || !isFinite(ivaTasa) || isNaN(ivaTasa)) {
      logger.warn(`[FacturaService] IVA inválido para tenant ${tenantId}: "${ivaTasa}". Usando 0.16 por defecto.`);
      ivaTasa = 0.16;
    }
    
    const tenantInfo = await obtenerInfoTenant(tenantId);

    const doc = new PDFDocument({ 
      size: 'LETTER',
      margins: { top: 50, bottom: 50, left: 50, right: 50 }
    });

    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    
    const pdfPromise = new Promise((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    generarHeader(doc, tenantInfo, pedidoData);
    
    generarDatosPedido(doc, pedidoData);
    
    generarTablaProductos(doc, detalles);
    
    generarTotales(doc, pedidoData, ivaTasa);
    
    generarFooter(doc);

    doc.end();

    logger.info(`[FacturaService] Factura generada: Pedido=${pedidoId}, Tenant=${tenantId}, Rol=${rol}`);

    return await pdfPromise;

  } catch (error) {
    logger.error(`[FacturaService] Error al generar factura para pedido ${pedidoId}:`, error);
    throw error;
  }
}

async function obtenerDatosPedido(pedidoId, tenantId) {
  const result = await pool.query(
    `SELECT 
      p.pedidoid, p.fechapedido, p.estatus, p.montototal, p.monto_descuento,
      p.costoenvio, p.metodo_pago,
      c.nombre, c.apellido, c.email,
      d.calle, d.numeroext, d.numeroint, d.colonia, 
      d.ciudad, e.nombre as estado, d.codigopostal as cp
    FROM pedidos p
    INNER JOIN clientes c ON c.clienteid = p.clienteid
    LEFT JOIN cliente_direcciones d ON d.direccionid = p.direccionenvioid
    LEFT JOIN estados e ON e.estadoid = d.estadoid
    WHERE p.pedidoid = $1 AND p.tenant_id = $2`,
    [pedidoId, tenantId]
  );

  return result.rows[0] || null;
}

async function obtenerDetallesPedido(pedidoId) {
  const result = await pool.query(
    `SELECT 
      dp.detalleid, dp.cantidadpaquetes, dp.piezastotales,
      dp.preciounitario, dp.precioporpaquete,
      pv.sku, pr.nombreproducto,
      t.cantidad as tamano
    FROM detallesdelpedido dp
    INNER JOIN producto_variantes pv ON pv.varianteid = dp.varianteid
    INNER JOIN productos pr ON pr.productoid = pv.productoid
    LEFT JOIN cat_tamanopaquetes t ON t.tamanoid = dp.tamanoid
    WHERE dp.pedidoid = $1
    ORDER BY dp.detalleid`,
    [pedidoId]
  );

  return result.rows;
}

async function obtenerInfoTenant(tenantId) {
  const result = await pool.query(
    `SELECT 
      COALESCE(nombre_cliente, 'RazoConnect') as nombre_negocio,
      COALESCE(dominio, '') as dominio,
      tenant_id
    FROM tenants WHERE tenant_id = $1`,
    [tenantId]
  );

  return result.rows[0] || { nombre_negocio: 'RazoConnect', dominio: '', tenant_id: tenantId };
}

function generarHeader(doc, tenantInfo, pedidoData) {
  // ── Logo ──────────────────────────────────────────────────────────
  const logoPath = path.join(__dirname, '..', 'icon', 'Logo_Razo.png');
  let logoExists = false;
  try { if (fs.existsSync(logoPath)) logoExists = true; } catch (_) {}

  const logoW = 70;
  const textX = logoExists ? 50 + logoW + 10 : 50;

  if (logoExists) {
    doc.image(logoPath, 50, 30, { width: logoW });
  }

  // Nombre empresa — mantener naranja SOLO aquí (es la marca)
  doc.fontSize(18)
     .font('Helvetica-Bold')
     .fillColor(COLOR_NARANJA)
     .text(tenantInfo.nombre_negocio.toUpperCase(), textX, 45);

  doc.fontSize(9)
     .font('Helvetica')
     .fillColor(COLOR_TEXTO_SUAVE)
     .text(tenantInfo.dominio ? `www.${tenantInfo.dominio}` : '', textX, 68);

  // Bloque FACTURA — derecha, color azul marino
  const numeroFactura = `FAC-${pedidoData.pedidoid}-${tenantInfo.tenant_id || '1'}`;
  const fechaEmision  = new Date().toLocaleDateString('es-MX', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  doc.fontSize(14)
     .font('Helvetica-Bold')
     .fillColor(COLOR_PRIMARIO)
     .text('FACTURA', 390, 45, { align: 'right', width: 172 });

  doc.fontSize(9)
     .font('Helvetica')
     .fillColor(COLOR_TEXTO_SUAVE)
     .text(`No. ${numeroFactura}`,   390, 64, { align: 'right', width: 172 })
     .text(`Fecha: ${fechaEmision}`, 390, 78, { align: 'right', width: 172 });

  // Línea separadora — azul marino
  doc.moveTo(50, 115)
     .lineTo(562, 115)
     .strokeColor(COLOR_PRIMARIO)
     .lineWidth(1.5)
     .stroke();
}

function generarDatosPedido(doc, pedidoData) {
  let yPos = 125; // Justo debajo de la línea separadora del header

  // ── INFORMACIÓN DEL PEDIDO ──────────────────────────────────────────
  doc.fontSize(10)
     .font('Helvetica-Bold')
     .fillColor(COLOR_PRIMARIO)
     .text('INFORMACIÓN DEL PEDIDO', 50, yPos);

  yPos += 18;

  doc.fontSize(9)
     .font('Helvetica')
     .fillColor(COLOR_TEXTO)
     .text(`Pedido #${pedidoData.pedidoid}`, 50, yPos)
     .text(`Fecha: ${new Date(pedidoData.fechapedido).toLocaleDateString('es-MX')}`, 200, yPos)
     .text(`Estatus: ${pedidoData.estatus || 'N/A'}`, 380, yPos);

  yPos += 22;

  // ── DATOS DEL CLIENTE ───────────────────────────────────────────────
  doc.fontSize(10)
     .font('Helvetica-Bold')
     .fillColor(COLOR_PRIMARIO)
     .text('DATOS DEL CLIENTE', 50, yPos);

  yPos += 18;

  const nombreCliente = `${pedidoData.nombre || ''} ${pedidoData.apellido || ''}`.trim() || 'N/A';
  const emailCliente  = (pedidoData.email && pedidoData.email !== 'null') ? pedidoData.email : 'N/A';

  doc.fontSize(9)
     .font('Helvetica')
     .fillColor(COLOR_TEXTO)
     .text(nombreCliente, 50, yPos);

  yPos += 14;
  doc.text(`Email: ${emailCliente}`, 50, yPos);
  yPos += 14;

  // ── DIRECCIÓN DE ENVÍO ──────────────────────────────────────────────
  // Solo mostrar si hay datos reales (filtrar placeholders de 1 carácter)
  const calleReal = pedidoData.calle && pedidoData.calle.trim().length > 1 
    ? pedidoData.calle.trim() 
    : null;

  if (calleReal) {
    yPos += 8;

    doc.fontSize(10)
       .font('Helvetica-Bold')
       .fillColor(COLOR_PRIMARIO)
       .text('DIRECCIÓN DE ENVÍO', 50, yPos);

    yPos += 18;

    // Filtrar ext/int: ignorar si es un solo carácter o si es "X", "N/A", "0", etc.
    const esValorReal = (val) => val && val.toString().trim().length > 1 
      && !['x', 'n/a', 'na', '0', 'nd', 's/n'].includes(val.toString().trim().toLowerCase());

    const partesCalle = [calleReal];
    if (esValorReal(pedidoData.numeroext)) partesCalle.push(`#${pedidoData.numeroext}`);
    if (esValorReal(pedidoData.numeroint)) partesCalle.push(`Int. ${pedidoData.numeroint}`);

    const direccionLinea1 = partesCalle.join(' ');
    const coloniaLinea    = [pedidoData.colonia, pedidoData.ciudad].filter(Boolean).join(', ');
    const estadoLinea     = `${pedidoData.estado || ''}, C.P. ${pedidoData.cp || ''}`.trim().replace(/^,\s*/, '');

    doc.fontSize(9)
       .font('Helvetica')
       .fillColor(COLOR_TEXTO)
       .text(direccionLinea1, 50, yPos);
    
    if (coloniaLinea) { yPos += 14; doc.text(coloniaLinea, 50, yPos); }
    if (estadoLinea)  { yPos += 14; doc.text(estadoLinea,  50, yPos); }
  }

  // Línea separadora antes de PRODUCTOS — color gris
  yPos += 18;
  doc.moveTo(50, yPos)
     .lineTo(562, yPos)
     .strokeColor(COLOR_LINEA)
     .lineWidth(0.8)
     .stroke();

  // Actualizar currentY con el valor REAL para que generarTablaProductos empiece en el lugar correcto
  doc.currentY = yPos + 12;
}

function generarTablaProductos(doc, detalles) {
  const tableTop = doc.currentY;

  doc.fontSize(10)
     .font('Helvetica-Bold')
     .fillColor(COLOR_PRIMARIO)
     .text('PRODUCTOS', 50, tableTop);

  const headerTop = tableTop + 18;

  // Encabezado tabla — fondo gris azulado, texto azul marino
  doc.rect(50, headerTop, 512, 22)
     .fillAndStroke(COLOR_FONDO_HEADER, COLOR_LINEA);

  doc.fontSize(8.5)
     .font('Helvetica-Bold')
     .fillColor(COLOR_PRIMARIO)
     .text('Descripción',  55, headerTop + 7, { width: 185 })
     .text('SKU',         245, headerTop + 7, { width: 85  })
     .text('Cant.',       335, headerTop + 7, { width: 45  })
     .text('Pzas',        385, headerTop + 7, { width: 40  })
     .text('Precio Unit.', 430, headerTop + 7, { width: 65  })
     .text('Subtotal',    500, headerTop + 7, { width: 60, align: 'right' });

  let yPos = headerTop + 22;

  doc.fontSize(8.5).font('Helvetica');

  detalles.forEach((detalle, index) => {
    if (yPos > 680) {
      doc.addPage();
      yPos = 50;
    }

    // Filas alternadas: blanco y gris muy claro
    if (index % 2 !== 0) {
      doc.rect(50, yPos, 512, 20).fill('#F7F9FC');
    }

    const subtotalItem = parseFloat(detalle.precioporpaquete || 0) > 0
      ? parseFloat(detalle.precioporpaquete) * parseInt(detalle.cantidadpaquetes || 0)
      : parseFloat(detalle.preciounitario || 0) * parseInt(detalle.cantidadpaquetes || 1);

    doc.fillColor(COLOR_TEXTO)
       .text(detalle.nombreproducto || 'N/A', 55,  yPos + 5, { width: 185, ellipsis: true })
       .text(detalle.sku || 'N/A',            245, yPos + 5, { width: 85  })
       .text(`${detalle.cantidadpaquetes || 0} paq`, 335, yPos + 5, { width: 45 })
       .text(`${detalle.piezastotales   || 0}`,      385, yPos + 5, { width: 40 })
       .text(`$${parseFloat(detalle.preciounitario || 0).toFixed(2)}`, 430, yPos + 5, { width: 65 })
       .text(`$${subtotalItem.toFixed(2)}`, 500, yPos + 5, { width: 60, align: 'right' });

    yPos += 20;
  });

  // Línea de cierre de tabla
  doc.moveTo(50, yPos)
     .lineTo(562, yPos)
     .strokeColor(COLOR_LINEA)
     .lineWidth(0.8)
     .stroke();

  doc.currentY = yPos + 12;
}

function generarTotales(doc, pedidoData, ivaTasa) {
  const yStart = doc.currentY + 8;

  const subtotal   = isFinite(parseFloat(pedidoData.montototal))      ? parseFloat(pedidoData.montototal)      : 0;
  const descuento  = isFinite(parseFloat(pedidoData.monto_descuento))  ? parseFloat(pedidoData.monto_descuento)  : 0;
  const costoEnvio = isFinite(parseFloat(pedidoData.costoenvio))       ? parseFloat(pedidoData.costoenvio)       : 0;
  const tasaIva    = (isFinite(ivaTasa) && ivaTasa > 0) ? ivaTasa : 0.16;

  const base        = subtotal - descuento + costoEnvio;
  const montoIva    = base * tasaIva;
  const totalConIva = base + montoIva;
  const ivaPct      = (tasaIva * 100).toFixed(0);

  const xLabel = 370;
  const xValue = 460;
  const wValue = 100; // 460 → 560
  let   yPos   = yStart;

  doc.fontSize(9).font('Helvetica');

  // Subtotal
  doc.fillColor(COLOR_TEXTO_SUAVE).text('Subtotal:',               xLabel, yPos)
     .fillColor(COLOR_TEXTO)      .text(`$${subtotal.toFixed(2)}`, xValue, yPos, { width: wValue, align: 'right' });

  // Descuento
  if (descuento > 0) {
    yPos += 16;
    doc.fillColor(COLOR_TEXTO_SUAVE).text('Descuento:',                xLabel, yPos)
       .fillColor('#DC2626')        .text(`-$${descuento.toFixed(2)}`, xValue, yPos, { width: wValue, align: 'right' });
  }

  // Envío
  if (costoEnvio > 0) {
    yPos += 16;
    doc.fillColor(COLOR_TEXTO_SUAVE).text('Envío:',                    xLabel, yPos)
       .fillColor(COLOR_TEXTO)      .text(`$${costoEnvio.toFixed(2)}`, xValue, yPos, { width: wValue, align: 'right' });
  }

  // IVA — azul acento (no naranja)
  yPos += 16;
  doc.fillColor(COLOR_ACENTO).text(`IVA (${ivaPct}%):`,      xLabel, yPos)
     .fillColor(COLOR_ACENTO).text(`$${montoIva.toFixed(2)}`, xValue, yPos, { width: wValue, align: 'right' });

  // Línea separadora DESPUÉS del IVA
  yPos += 14;
  doc.moveTo(xLabel, yPos)
     .lineTo(562, yPos)
     .strokeColor(COLOR_PRIMARIO)
     .lineWidth(1)
     .stroke();

  // TOTAL — azul marino, bold, más grande
  yPos += 10;
  doc.fontSize(11).font('Helvetica-Bold')
     .fillColor(COLOR_PRIMARIO).text('TOTAL:',                        xLabel, yPos)
     .fillColor(COLOR_PRIMARIO).text(`$${totalConIva.toFixed(2)}`,    xValue, yPos, { width: wValue, align: 'right' });

  doc.currentY = yPos + 30;
}

function generarFooter(doc) {
  const pageHeight = doc.page.height;
  const footerY    = pageHeight - 80;

  // Línea fina de cierre
  doc.moveTo(50, footerY - 10)
     .lineTo(562, footerY - 10)
     .strokeColor(COLOR_LINEA)
     .lineWidth(0.5)
     .stroke();

  doc.fontSize(7.5)
     .font('Helvetica-Oblique')
     .fillColor(COLOR_TEXTO_SUAVE)
     .text(
       'Este documento es una representación de factura interna. No es un CFDI fiscal.',
       50, footerY,
       { align: 'center', width: 512 }
     );

  const fechaGeneracion = new Date().toLocaleString('es-MX', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  doc.fontSize(7)
     .fillColor('#999999')
     .text(`Generado el ${fechaGeneracion}`, 50, footerY + 16, { align: 'center', width: 512 });
}

module.exports = {
  generarFacturaPDF
};
