/**
 * MÓDULO CENTRALIZADO DE CÁLCULO DE PEDIDOS - VERSIÓN FRONTEND
 * 
 * Este módulo garantiza que el frontend use la MISMA lógica de cálculo que el backend.
 * Mantiene sincronización con utils/calculadoraPedidos.js del servidor.
 * 
 * @module calculadoraPedidos (Frontend)
 */

/**
 * Calcula el total de un pedido con lógica de descuentos prorrateados
 * 
 * @param {Object} params - Parámetros de cálculo
 * @param {Array} params.items - Array de items del pedido
 * @param {Object|null} params.cupon - Objeto de cupón (opcional)
 * @param {boolean} params.aplicarDescuentoEnDetalles - Si se debe prorratear el descuento
 * @returns {Object} Resultado del cálculo con totales y items procesados
 */
function calcularTotalPedido({
  items,
  cupon = null,
  aplicarDescuentoEnDetalles = false
}) {
  // Validación de entrada
  if (!Array.isArray(items) || items.length === 0) {
    return {
      items: [],
      totalBruto: 0,
      montoDescuento: 0,
      totalFinal: 0,
      factorDescuento: 1.0,
      error: 'No hay items para calcular'
    };
  }

  // PASO 1: Calcular subtotales por item SIN descuento
  const itemsConSubtotal = items.map(item => {
    // Determinar precio unitario (oferta tiene prioridad)
    const precioBase = item.precioBase !== null && item.precioBase !== undefined
      ? parseFloat(item.precioBase)
      : (item.precioUnitario !== null && item.precioUnitario !== undefined
        ? parseFloat(item.precioUnitario)
        : 0);
    
    const precioOferta = item.precioOferta !== null && item.precioOferta !== undefined
      ? parseFloat(item.precioOferta)
      : (item.precioOfertaUnitario !== null && item.precioOfertaUnitario !== undefined
        ? parseFloat(item.precioOfertaUnitario)
        : null);
    
    const precioUnitario = precioOferta !== null ? precioOferta : precioBase;

    // Validar piezas por paquete
    const piezasPorPaquete = item.piezasPorPaquete !== null && item.piezasPorPaquete !== undefined
      ? parseInt(item.piezasPorPaquete, 10)
      : (item.tamanoCantidad !== null && item.tamanoCantidad !== undefined
        ? parseInt(item.tamanoCantidad, 10)
        : 0);

    // Validar cantidad
    const cantidad = item.cantidad !== null && item.cantidad !== undefined
      ? parseInt(item.cantidad, 10)
      : (item.cantidadPaquetes !== null && item.cantidadPaquetes !== undefined
        ? parseInt(item.cantidadPaquetes, 10)
        : 0);

    // FÓRMULA DE ORO: NO redondear intermedios
    const precioPaquete = precioUnitario * piezasPorPaquete;
    
    // Redondeo SOLO al final
    const subtotal = parseFloat((precioPaquete * cantidad).toFixed(2));

    return {
      ...item,
      precioUnitario,
      precioPaquete,
      subtotal,
      subtotalOriginal: subtotal,
      tieneOferta: precioOferta !== null
    };
  });

  // PASO 2: Sumar total bruto (sin descuento)
  const totalBruto = itemsConSubtotal.reduce((sum, item) => {
    const subtotal = Number.isFinite(item.subtotal) ? item.subtotal : 0;
    return sum + subtotal;
  }, 0);

  // PASO 3: Aplicar descuento del cupón
  let montoDescuento = 0;
  let cuponAplicado = null;

  if (cupon && cupon.valor) {
    const tipoDescuento = (cupon.tipoDescuento || cupon.tipo_descuento || 'PORCENTAJE').toUpperCase();
    const valor = parseFloat(cupon.valor);

    if (tipoDescuento === 'PORCENTAJE') {
      montoDescuento = (totalBruto * valor) / 100;
    } else if (tipoDescuento === 'FIJO') {
      montoDescuento = valor;
    }

    // El descuento no puede ser mayor al total
    montoDescuento = Math.min(montoDescuento, totalBruto);
    montoDescuento = parseFloat(montoDescuento.toFixed(2));

    cuponAplicado = {
      cuponId: cupon.cuponId || cupon.cuponid,
      codigo: cupon.codigo,
      tipoDescuento,
      valor,
      montoDescuento
    };
  }

  // PASO 4: Calcular total final
  const totalFinal = parseFloat((totalBruto - montoDescuento).toFixed(2));

  // PASO 5: Prorratear descuento en items si se solicita
  const factorDescuento = totalBruto > 0 ? totalFinal / totalBruto : 1.0;

  if (aplicarDescuentoEnDetalles && montoDescuento > 0 && totalBruto > 0) {
    // Distribuir descuento proporcionalmente
    let descuentoAcumulado = 0;

    itemsConSubtotal.forEach((item, index) => {
      const esUltimoItem = index === itemsConSubtotal.length - 1;

      if (esUltimoItem) {
        // En el último item, ajustar para evitar errores de redondeo
        const descuentoItem = montoDescuento - descuentoAcumulado;
        item.descuentoAplicado = parseFloat(descuentoItem.toFixed(2));
      } else {
        // Calcular descuento proporcional
        const descuentoItem = item.subtotalOriginal * (montoDescuento / totalBruto);
        item.descuentoAplicado = parseFloat(descuentoItem.toFixed(2));
        descuentoAcumulado += item.descuentoAplicado;
      }

      // Calcular precio y subtotal con descuento
      item.precioPaqueteConDescuento = parseFloat((item.precioPaquete * factorDescuento).toFixed(2));
      item.subtotalConDescuento = parseFloat((item.subtotalOriginal - item.descuentoAplicado).toFixed(2));

      // Validación de consistencia
      if (item.subtotalConDescuento < 0) {
        console.error(`⚠️ [CALCULADORA] Subtotal negativo detectado en item ${item.varianteId || item.sku}`);
        item.subtotalConDescuento = 0;
      }
    });
  } else {
    // Si no se aplica descuento en detalles, mantener precios originales
    itemsConSubtotal.forEach(item => {
      item.precioPaqueteConDescuento = item.precioPaquete;
      item.subtotalConDescuento = item.subtotal;
      item.descuentoAplicado = 0;
    });
  }

  // PASO 6: Validación final de consistencia matemática
  const sumSubtotalesConDescuento = itemsConSubtotal.reduce((sum, item) => {
    return sum + (item.subtotalConDescuento || 0);
  }, 0);

  const diferencia = Math.abs(sumSubtotalesConDescuento - totalFinal);
  
  if (diferencia > 0.02) {
    console.warn(`⚠️ [CALCULADORA] Discrepancia de redondeo: ${diferencia.toFixed(2)}`);
    console.warn(`   SUM(subtotales con descuento): ${sumSubtotalesConDescuento.toFixed(2)}`);
    console.warn(`   Total final esperado: ${totalFinal.toFixed(2)}`);
  }

  return {
    items: itemsConSubtotal,
    totalBruto: parseFloat(totalBruto.toFixed(2)),
    montoDescuento,
    totalFinal,
    factorDescuento: parseFloat(factorDescuento.toFixed(4)),
    cuponAplicado,
    consistenciaValidada: diferencia <= 0.02
  };
}

/**
 * Valida que dos totales sean consistentes dentro de una tolerancia
 * 
 * @param {number} total1 - Primer total
 * @param {number} total2 - Segundo total
 * @param {number} tolerancia - Tolerancia permitida (default: 0.02)
 * @returns {Object} Resultado de la validación
 */
function validarConsistenciaTotales(total1, total2, tolerancia = 0.02) {
  const diferencia = Math.abs(total1 - total2);
  const esConsistente = diferencia <= tolerancia;

  return {
    esConsistente,
    diferencia: parseFloat(diferencia.toFixed(2)),
    total1: parseFloat(total1.toFixed(2)),
    total2: parseFloat(total2.toFixed(2)),
    tolerancia
  };
}

// Exponer funciones globalmente para uso en carrito.html
window.CalculadoraPedidos = {
  calcularTotalPedido,
  validarConsistenciaTotales
};
