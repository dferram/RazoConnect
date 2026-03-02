const PDFDocument = require('pdfkit');
const pool = require('../db');
const logger = require('../utils/logger');
const configuracionService = require('./configuracionService');

async function generarFacturaPDF(pedidoId, tenantId, rol) {
  try {
    const pedidoData = await obtenerDatosPedido(pedidoId, tenantId);
    
    if (!pedidoData) {
      throw new Error('Pedido no encontrado o no pertenece al tenant');
    }

    const detalles = await obtenerDetallesPedido(pedidoId);
    const ivaTasa = await configuracionService.getIvaTasa(tenantId);
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
      p.costo_envio, p.metodo_pago,
      c.nombre, c.apellido, c.email,
      d.calle, d.numero_exterior, d.numero_interior, d.colonia, 
      d.ciudad, e.nombre as estado, d.codigo_postal as cp,
      d.referencias
    FROM pedidos p
    INNER JOIN clientes c ON c.clienteid = p.clienteid
    LEFT JOIN cliente_direcciones d ON d.direccionid = p.direccionenvio_id
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
      dp.preciounitario, dp.preciorporpaquete,
      pv.sku, pr.nombreproducto,
      t.nombre as tamano
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
    'SELECT nombre_negocio, dominio FROM tenants WHERE tenant_id = $1',
    [tenantId]
  );

  return result.rows[0] || { nombre_negocio: 'RazoConnect', dominio: '' };
}

function generarHeader(doc, tenantInfo, pedidoData) {
  doc.fontSize(20)
     .font('Helvetica-Bold')
     .fillColor('#F97316')
     .text(tenantInfo.nombre_negocio.toUpperCase(), 50, 50);

  doc.fontSize(10)
     .font('Helvetica')
     .fillColor('#333333')
     .text(`www.${tenantInfo.dominio}`, 50, 75);

  const numeroFactura = `FAC-${pedidoData.pedidoid}-${tenantInfo.tenant_id || '1'}`;
  const fechaEmision = new Date().toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  doc.fontSize(12)
     .font('Helvetica-Bold')
     .fillColor('#F97316')
     .text('FACTURA', 400, 50, { align: 'right' });

  doc.fontSize(10)
     .font('Helvetica')
     .fillColor('#333333')
     .text(`No. ${numeroFactura}`, 400, 68, { align: 'right' })
     .text(`Fecha: ${fechaEmision}`, 400, 83, { align: 'right' });

  doc.moveTo(50, 110)
     .lineTo(562, 110)
     .strokeColor('#F97316')
     .lineWidth(2)
     .stroke();
}

function generarDatosPedido(doc, pedidoData) {
  let yPos = 130;

  doc.fontSize(11)
     .font('Helvetica-Bold')
     .fillColor('#333333')
     .text('INFORMACIÓN DEL PEDIDO', 50, yPos);

  yPos += 20;

  doc.fontSize(9)
     .font('Helvetica')
     .text(`Pedido #${pedidoData.pedidoid}`, 50, yPos)
     .text(`Fecha: ${new Date(pedidoData.fechapedido).toLocaleDateString('es-MX')}`, 200, yPos)
     .text(`Estatus: ${pedidoData.estatus}`, 350, yPos);

  yPos += 25;

  doc.fontSize(11)
     .font('Helvetica-Bold')
     .text('DATOS DEL CLIENTE', 50, yPos);

  yPos += 20;

  doc.fontSize(9)
     .font('Helvetica')
     .text(`${pedidoData.nombre} ${pedidoData.apellido}`, 50, yPos);

  yPos += 15;
  doc.text(`Email: ${pedidoData.email}`, 50, yPos);

  if (pedidoData.calle) {
    yPos += 20;
    doc.fontSize(11)
       .font('Helvetica-Bold')
       .text('DIRECCIÓN DE ENVÍO', 50, yPos);

    yPos += 20;
    doc.fontSize(9)
       .font('Helvetica');

    const direccion = [
      pedidoData.calle,
      pedidoData.numero_exterior,
      pedidoData.numero_interior
    ].filter(Boolean).join(' ');

    doc.text(direccion, 50, yPos);
    yPos += 15;

    doc.text(`${pedidoData.colonia}, ${pedidoData.ciudad}`, 50, yPos);
    yPos += 15;

    doc.text(`${pedidoData.estado}, C.P. ${pedidoData.cp}`, 50, yPos);

    if (pedidoData.referencias) {
      yPos += 15;
      doc.text(`Referencias: ${pedidoData.referencias}`, 50, yPos);
    }
  }

  doc.currentY = yPos + 25;
}

function generarTablaProductos(doc, detalles) {
  const tableTop = doc.currentY + 10;
  const colWidths = {
    descripcion: 180,
    sku: 80,
    cantidad: 60,
    piezas: 50,
    precio: 70,
    subtotal: 70
  };

  doc.fontSize(11)
     .font('Helvetica-Bold')
     .fillColor('#333333')
     .text('PRODUCTOS', 50, tableTop);

  const headerTop = tableTop + 25;

  doc.rect(50, headerTop, 512, 25)
     .fillAndStroke('#F5F1ED', '#F97316');

  doc.fontSize(9)
     .font('Helvetica-Bold')
     .fillColor('#333333')
     .text('Descripción', 55, headerTop + 8, { width: colWidths.descripcion })
     .text('SKU', 240, headerTop + 8, { width: colWidths.sku })
     .text('Cant.', 325, headerTop + 8, { width: colWidths.cantidad })
     .text('Pzas', 390, headerTop + 8, { width: colWidths.piezas })
     .text('Precio Unit.', 445, headerTop + 8, { width: colWidths.precio })
     .text('Subtotal', 520, headerTop + 8, { width: colWidths.subtotal, align: 'right' });

  let yPos = headerTop + 25;

  doc.fontSize(8)
     .font('Helvetica');

  detalles.forEach((detalle, index) => {
    if (yPos > 680) {
      doc.addPage();
      yPos = 50;
    }

    const subtotal = parseFloat(detalle.preciorporpaquete || 0) * parseInt(detalle.cantidadpaquetes || 0);

    if (index % 2 === 0) {
      doc.rect(50, yPos, 512, 20)
         .fill('#FAFAFA');
    }

    doc.fillColor('#333333')
       .text(detalle.nombreproducto, 55, yPos + 5, { width: colWidths.descripcion - 10, ellipsis: true })
       .text(detalle.sku || 'N/A', 240, yPos + 5, { width: colWidths.sku })
       .text(`${detalle.cantidadpaquetes} paq`, 325, yPos + 5, { width: colWidths.cantidad })
       .text(detalle.piezastotales || '0', 390, yPos + 5, { width: colWidths.piezas })
       .text(`$${parseFloat(detalle.preciounitario || 0).toFixed(2)}`, 445, yPos + 5, { width: colWidths.precio })
       .text(`$${subtotal.toFixed(2)}`, 490, yPos + 5, { width: 72, align: 'right' });

    yPos += 20;
  });

  doc.moveTo(50, yPos)
     .lineTo(562, yPos)
     .strokeColor('#CCCCCC')
     .lineWidth(1)
     .stroke();

  doc.currentY = yPos + 10;
}

function generarTotales(doc, pedidoData, ivaTasa) {
  const yStart = doc.currentY + 10;
  
  const subtotal = parseFloat(pedidoData.montototal || 0);
  const descuento = parseFloat(pedidoData.monto_descuento || 0);
  const costoEnvio = parseFloat(pedidoData.costo_envio || 0);
  
  const subtotalSinIva = subtotal - descuento + costoEnvio;
  const montoIva = subtotalSinIva * ivaTasa;
  const totalConIva = subtotalSinIva + montoIva;

  const ivaPorcentaje = (ivaTasa * 100).toFixed(0);

  const xLabel = 380;
  const xValue = 520;
  let yPos = yStart;

  doc.fontSize(9)
     .font('Helvetica')
     .fillColor('#333333');

  doc.text('Subtotal:', xLabel, yPos)
     .text(`$${subtotal.toFixed(2)}`, xValue, yPos, { align: 'right' });

  if (descuento > 0) {
    yPos += 18;
    doc.fillColor('#DC2626')
       .text('Descuento:', xLabel, yPos)
       .text(`-$${descuento.toFixed(2)}`, xValue, yPos, { align: 'right' });
    doc.fillColor('#333333');
  }

  if (costoEnvio > 0) {
    yPos += 18;
    doc.text('Envío:', xLabel, yPos)
       .text(`$${costoEnvio.toFixed(2)}`, xValue, yPos, { align: 'right' });
  }

  yPos += 18;
  doc.fillColor('#F97316')
     .text(`IVA (${ivaPorcentaje}%):`, xLabel, yPos)
     .text(`$${montoIva.toFixed(2)}`, xValue, yPos, { align: 'right' });

  yPos += 5;
  doc.moveTo(380, yPos)
     .lineTo(562, yPos)
     .strokeColor('#F97316')
     .lineWidth(1.5)
     .stroke();

  yPos += 10;
  doc.fontSize(11)
     .font('Helvetica-Bold')
     .fillColor('#F97316')
     .text('TOTAL:', xLabel, yPos)
     .text(`$${totalConIva.toFixed(2)}`, xValue, yPos, { align: 'right' });

  doc.currentY = yPos + 30;
}

function generarFooter(doc) {
  const pageHeight = doc.page.height;
  const footerY = pageHeight - 80;

  doc.fontSize(8)
     .font('Helvetica-Oblique')
     .fillColor('#666666')
     .text(
       'Este documento es una representación de factura interna. No es un CFDI fiscal.',
       50,
       footerY,
       { align: 'center', width: 512 }
     );

  const fechaGeneracion = new Date().toLocaleString('es-MX', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  doc.fontSize(7)
     .fillColor('#999999')
     .text(
       `Generado el ${fechaGeneracion}`,
       50,
       footerY + 20,
       { align: 'center', width: 512 }
     );
}

module.exports = {
  generarFacturaPDF
};
