/**
 * MÓDULO CENTRALIZADO DE CÁLCULO DE PEDIDOS
 * 
 * Este módulo garantiza que TODOS los cálculos de totales, subtotales y descuentos
 * se realicen con la MISMA lógica en todo el sistema (backend y frontend).
 * 
 * FÓRMULA ESTÁNDAR:
 * 1. Subtotal Item = (PrecioUnitario × PiezasPorPaquete) × CantidadPaquetes
 * 2. Total Bruto = SUM(Subtotales)
 * 3. Descuento = Aplicar cupón sobre Total Bruto
 * 4. Total Final = Total Bruto - Descuento
 * 5. Prorratear descuento proporcionalmente en cada item
 * 
 * @module calculadoraPedidos
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
      : 0;
    
    const precioOferta = item.precioOferta !== null && item.precioOferta !== undefined
      ? parseFloat(item.precioOferta)
      : null;
    
    const precioUnitario = precioOferta !== null ? precioOferta : precioBase;

    // Validar piezas por paquete
    const piezasPorPaquete = item.piezasPorPaquete !== null && item.piezasPorPaquete !== undefined
      ? parseInt(item.piezasPorPaquete, 10)
      : 0;

    // Validar cantidad
    const cantidad = item.cantidad !== null && item.cantidad !== undefined
      ? parseInt(item.cantidad, 10)
      : 0;

    // FÓRMULA DE ORO: NO redondear intermedios
    const precioPaquete = precioUnitario * piezasPorPaquete;
    
    // Redondeo SOLO al final
    const subtotal = parseFloat((precioPaquete * cantidad).toFixed(2));

    return {
      ...item,
      precioUnitario,
      precioPaquete,
      subtotal,
      subtotalOriginal: subtotal, // Guardar para referencia
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
 * Calcula el split de backorder para un item
 * (Reutiliza la lógica existente pero la centraliza aquí)
 * 
 * @param {Object} params - Parámetros del split
 * @returns {Object} Resultado del split con cantidades surtidas y backorder
 */
function calcularSplitBackorder({
  cantidadSolicitada,
  stockPiezas,
  piezasPorPaquete,
  multiploBackorder
}) {
  const cantidad = Number.isInteger(cantidadSolicitada) ? cantidadSolicitada : 0;
  const stock = Number.isInteger(stockPiezas) ? stockPiezas : 0;
  const piezas = Number.isInteger(piezasPorPaquete) ? piezasPorPaquete : 0;
  const multiplo = Number.isInteger(multiploBackorder) ? multiploBackorder : 1;
  const regla = multiplo > 1 ? 'PAQUETE' : 'UNITARIO';

  if (cantidad <= 0 || piezas <= 0) {
    return {
      cantidadSurtida: 0,
      cantidadPendiente: 0,
      cantidadBackorderAjustada: 0,
      cantidadTotalCobrar: 0,
      ajusteAplicado: false,
      reglaBackorder: regla
    };
  }

  const paquetesSurtibles = Math.floor(Math.max(stock, 0) / piezas);
  const cantidadSurtida = Math.max(Math.min(cantidad, paquetesSurtibles), 0);
  const cantidadPendiente = Math.max(cantidad - cantidadSurtida, 0);

  let cantidadBackorderAjustada = cantidadPendiente;
  if (cantidadPendiente > 0 && multiplo > 1) {
    const piezasPendientes = cantidadPendiente * piezas;
    const piezasBackorderAjustadas = Math.ceil(piezasPendientes / multiplo) * multiplo;
    cantidadBackorderAjustada = Math.ceil(piezasBackorderAjustadas / piezas);
  }

  const cantidadTotalCobrar = cantidad;
  const ajusteAplicado = cantidadBackorderAjustada !== cantidadPendiente;

  return {
    cantidadSurtida,
    cantidadPendiente,
    cantidadBackorderAjustada,
    cantidadTotalCobrar,
    ajusteAplicado,
    reglaBackorder: regla
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

module.exports = {
  calcularTotalPedido,
  calcularSplitBackorder,
  validarConsistenciaTotales
};
