/**
 * Módulo Unificado de Generación de PDF - Entrada de Almacén
 * Genera reportes PDF para recepciones de inventario con información completa:
 * - Productos recibidos
 * - Productos faltantes (cerrados por merma)
 * - Información de sesión y responsable
 * - Resumen financiero y logístico
 */

// Esperar a que jsPDF esté disponible antes de definir la función
(function() {
  // Función para verificar si jsPDF está disponible
  function waitForJsPDF(callback) {
    if (typeof window.jspdf !== 'undefined') {
      callback();
    } else {
      setTimeout(() => waitForJsPDF(callback), 50);
    }
  }

  // Esperar y luego definir la función global
  waitForJsPDF(function() {
    /**
     * Genera PDF de entrada de almacén
     * @param {Object} datos - Datos de la recepción
     * @param {Object} datos.orden - Información de la orden de compra
     * @param {Array} datos.productosRecibidos - Productos que fueron recibidos
     * @param {Array} datos.productosFaltantes - Productos cerrados por merma/faltantes
     * @param {Object} datos.sesion - Información de la sesión de recepción
     * @param {Object} datos.totales - Totales financieros y logísticos
     */
    window.generarPDFEntradaAlmacen = async function(datos) {
      try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('l', 'mm', 'a4'); // Landscape para más espacio

    // Agregar logo con timeout
    try {
      const logoPromise = fetch('/icon/Logo_Razo.png', { 
        method: 'GET',
        cache: 'force-cache'
      }).then(response => {
        if (!response.ok) throw new Error('Logo no disponible');
        return response.blob();
      }).then(blob => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      });

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 2000)
      );

      const logoBase64 = await Promise.race([logoPromise, timeoutPromise]);
      doc.addImage(logoBase64, 'PNG', 10, 10, 20, 20);
    } catch (logoError) {
      console.warn('Logo no cargado, continuando sin logo:', logoError.message);
      // Continuar sin logo
    }

    // ENCABEZADO
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('REPORTE DE ENTRADA DE ALMACÉN', 148, 15, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`OC #${datos.orden.ordenCompraId || 'N/A'}`, 240, 12);
    doc.text(`Fecha: ${new Date().toLocaleDateString('es-MX')}`, 240, 17);

    // INFORMACIÓN DE LA ORDEN
    let yPos = 25;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Proveedor:', 40, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(datos.orden.proveedorNombre || 'N/A', 65, yPos);

    doc.setFont('helvetica', 'bold');
    doc.text('Estado:', 150, yPos);
    doc.setFont('helvetica', 'normal');
    const estadoColor = datos.orden.estadoRecepcion === 'Completa' ? [16, 185, 129] : 
                        datos.orden.estadoRecepcion === 'Parcial' ? [245, 158, 11] : [107, 114, 128];
    doc.setTextColor(...estadoColor);
    doc.text(datos.orden.estadoRecepcion || 'N/A', 165, yPos);
    doc.setTextColor(0, 0, 0);

    // INFORMACIÓN DE SESIÓN
    if (datos.sesion) {
      yPos += 6;
      doc.setFont('helvetica', 'bold');
      doc.text('Responsable:', 40, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(datos.sesion.responsable || 'N/A', 65, yPos);

      if (datos.sesion.fechaRecepcion) {
        doc.setFont('helvetica', 'bold');
        doc.text('Fecha Recepción:', 150, yPos);
        doc.setFont('helvetica', 'normal');
        doc.text(new Date(datos.sesion.fechaRecepcion).toLocaleString('es-MX'), 185, yPos);
      }
    }

    yPos += 10;

    // PREPARAR DATOS DE TABLA
    const tableData = [];
    
    // SECCIÓN 1: PRODUCTOS RECIBIDOS
    if (datos.productosRecibidos && datos.productosRecibidos.length > 0) {
      tableData.push([
        { 
          content: '✅ PRODUCTOS RECIBIDOS', 
          colSpan: 9, 
          styles: { 
            fillColor: [209, 250, 229], 
            textColor: [6, 95, 70], 
            fontStyle: 'bold', 
            halign: 'center',
            fontSize: 9
          } 
        }
      ]);
      
      datos.productosRecibidos.forEach(item => {
        tableData.push([
          item.sku || 'N/A',
          item.producto || item.nombreproducto || 'N/A',
          item.categoria || 'N/A',
          item.variante || `${item.color || ''}\n${item.dimensiones || ''}`.trim() || 'N/A',
          (item.cantidadPiezas || item.piezasRecibidas || 0).toLocaleString('es-MX'),
          `$${(item.costoUnitario || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `$${(item.totalCosto || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `$${(item.precioVenta || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `$${(item.totalVenta || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        ]);
      });
    }
    
    // SECCIÓN 2: PRODUCTOS FALTANTES (CERRADOS POR MERMA)
    if (datos.productosFaltantes && datos.productosFaltantes.length > 0) {
      tableData.push([
        { 
          content: '❌ PRODUCTOS FALTANTES (CERRADOS - NO LLEGARÁN)', 
          colSpan: 9, 
          styles: { 
            fillColor: [254, 226, 226], 
            textColor: [153, 27, 27], 
            fontStyle: 'bold', 
            halign: 'center',
            fontSize: 9
          } 
        }
      ]);
      
      datos.productosFaltantes.forEach(item => {
        tableData.push([
          item.sku || 'N/A',
          item.producto || item.nombreproducto || 'N/A',
          item.categoria || 'N/A',
          item.variante || `${item.color || ''}\n${item.dimensiones || ''}`.trim() || 'N/A',
          { 
            content: (item.cantidadPiezas || item.piezasFaltantes || 0).toLocaleString('es-MX'), 
            styles: { textColor: [220, 38, 38], fontStyle: 'bold' } 
          },
          `$${(item.costoUnitario || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          { 
            content: `$${(item.totalCosto || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 
            styles: { textColor: [220, 38, 38], fontStyle: 'bold' } 
          },
          `$${(item.precioVenta || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `$${(item.totalVenta || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        ]);
      });
    }

    // Si no hay datos en ninguna sección
    if (tableData.length === 0) {
      tableData.push([
        { 
          content: 'Sin productos registrados', 
          colSpan: 9, 
          styles: { halign: 'center', textColor: [107, 114, 128] } 
        }
      ]);
    }

    // GENERAR TABLA
    doc.autoTable({
      startY: yPos,
      head: [[
        'SKU', 
        'Producto', 
        'Categoría', 
        'Variante', 
        'Cantidad\n(Piezas)', 
        'Costo\nUnit.', 
        'Total\nCosto', 
        'Precio\nVenta', 
        'Total\nVenta'
      ]],
      body: tableData,
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 2,
        lineColor: [200, 200, 200],
        lineWidth: 0.1
      },
      headStyles: {
        fillColor: [238, 238, 238],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle'
      },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 45 },
        2: { cellWidth: 30 },
        3: { cellWidth: 35 },
        4: { halign: 'center', cellWidth: 18 },
        5: { halign: 'right', cellWidth: 20 },
        6: { halign: 'right', cellWidth: 23 },
        7: { halign: 'right', cellWidth: 20 },
        8: { halign: 'right', cellWidth: 23 }
      }
    });

    // TABLA DE TOTALES
    const finalY = doc.lastAutoTable.finalY + 2;
    
    const totales = datos.totales || {};
    const totalPiezas = totales.totalPiezas || 0;
    const totalPaquetes = totales.totalPaquetes || 0;
    const totalInversion = totales.totalInversion || 0;
    const totalVentaEsperada = totales.totalVentaEsperada || 0;

    doc.autoTable({
      startY: finalY,
      head: [[
        { content: 'TOTALES', colSpan: 4, styles: { halign: 'center', fontStyle: 'bold', fillColor: [249, 250, 251] } },
        { content: `${totalPiezas.toLocaleString('es-MX')} pzas\n(${totalPaquetes.toLocaleString('es-MX')} paq)`, styles: { halign: 'center', fontStyle: 'bold', fillColor: [249, 250, 251], fontSize: 9 } },
        { content: '', styles: { fillColor: [249, 250, 251] } },
        { content: `$${totalInversion.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, styles: { halign: 'right', fontStyle: 'bold', textColor: [220, 38, 38], fillColor: [249, 250, 251] } },
        { content: '', styles: { fillColor: [249, 250, 251] } },
        { content: `$${totalVentaEsperada.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, styles: { halign: 'right', fontStyle: 'bold', textColor: [16, 185, 129], fillColor: [249, 250, 251] } }
      ]],
      body: [],
      theme: 'grid',
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 45 },
        2: { cellWidth: 30 },
        3: { cellWidth: 35 },
        4: { halign: 'center', cellWidth: 18 },
        5: { halign: 'right', cellWidth: 20 },
        6: { halign: 'right', cellWidth: 23 },
        7: { halign: 'right', cellWidth: 20 },
        8: { halign: 'right', cellWidth: 23 }
      }
    });

    // RESUMEN FINANCIERO
    const summaryHeight = 50;
    let summaryY = doc.lastAutoTable.finalY + 10;
    
    // Verificar si hay espacio en la página actual
    if (summaryY + summaryHeight > 195) {
      doc.addPage();
      summaryY = 20;
    }
    
    // Box de resumen
    doc.setFillColor(249, 115, 22);
    doc.rect(10, summaryY, 120, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('RESUMEN FINANCIERO', 70, summaryY + 7, { align: 'center' });

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    
    let detailY = summaryY + 15;
    
    // Total Piezas Recibidas
    doc.text('Total Piezas Recibidas:', 15, detailY);
    doc.setFont('helvetica', 'normal');
    doc.text(`${totalPiezas.toLocaleString('es-MX')} piezas (${totalPaquetes.toLocaleString('es-MX')} paquetes)`, 80, detailY);

    // Valor Total de Compra
    detailY += 7;
    doc.setFont('helvetica', 'bold');
    doc.text('Valor Total de Compra:', 15, detailY);
    doc.setTextColor(220, 38, 38);
    doc.text(`$${totalInversion.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 80, detailY);

    // Valor Total de Venta Esperado
    detailY += 7;
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text('Valor Total de Venta Esperado:', 15, detailY);
    doc.setTextColor(16, 185, 129);
    doc.text(`$${totalVentaEsperada.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 80, detailY);

    // Margen Esperado
    detailY += 7;
    const margen = totalVentaEsperada - totalInversion;
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text('Margen Esperado:', 15, detailY);
    doc.setTextColor(margen >= 0 ? 16 : 220, margen >= 0 ? 185 : 38, margen >= 0 ? 129 : 38);
    doc.text(`$${margen.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 80, detailY);

    // Información adicional de productos faltantes
    if (datos.productosFaltantes && datos.productosFaltantes.length > 0) {
      detailY += 7;
      doc.setTextColor(220, 38, 38);
      doc.setFont('helvetica', 'bold');
      doc.text('Productos Faltantes:', 15, detailY);
      doc.setFont('helvetica', 'normal');
      doc.text(`${datos.productosFaltantes.length} producto${datos.productosFaltantes.length !== 1 ? 's' : ''} cerrado${datos.productosFaltantes.length !== 1 ? 's' : ''}`, 80, detailY);
    }

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    const footerY = summaryY + summaryHeight + 5;
    doc.text(`Generado el ${new Date().toLocaleString('es-MX')}`, 148, footerY, { align: 'center' });
    doc.text('RazoConnect - Sistema de Gestión de Inventario', 148, footerY + 4, { align: 'center' });

    // Guardar PDF
    const fileName = `Entrada_Almacen_OC_${datos.orden.ordenCompraId}_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(fileName);

    return { success: true, fileName };

      } catch (error) {
        console.error('Error generando PDF de entrada de almacén:', error);
        throw error;
      }
    };
    
    console.log('✅ Módulo PDF de Entrada de Almacén cargado correctamente');
  });
})();
