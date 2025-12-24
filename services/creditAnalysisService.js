const db = require("../db");

const RIESGO = {
  BAJO: "BAJO",
  MEDIO: "MEDIO",
  ALTO: "ALTO"
};

function calcularAntiguedadMeses(fechaRegistro) {
  const hoy = new Date();
  const registro = new Date(fechaRegistro);
  const diferenciaMeses = (hoy.getFullYear() - registro.getFullYear()) * 12 + 
    (hoy.getMonth() - registro.getMonth());
  return Math.max(0, diferenciaMeses);
}

function calcularFrecuenciaDias(pedidos) {
  if (!pedidos.length) return null;
  if (pedidos.length === 1) return 0;

  // Ordenar pedidos por fecha
  const fechas = pedidos
    .map(p => new Date(p.fecha))
    .sort((a, b) => a - b);

  // Calcular diferencia promedio en días
  const primerPedido = fechas[0];
  const ultimoPedido = fechas[fechas.length - 1];
  const diasTotales = (ultimoPedido - primerPedido) / (1000 * 60 * 60 * 24);
  return Math.round(diasTotales / (pedidos.length - 1));
}

async function obtenerHistorialPedidos(clienteId) {
  const { rows } = await db.query(
    `SELECT 
      pedidoid,
      montototal,
      fecha,
      pagado,
      es_credito,
      fecha_vencimiento
     FROM pedidos 
     WHERE clienteid = $1 
       AND estatus = 'COMPLETADO'
       AND pagado = true
     ORDER BY fecha DESC`,
    [clienteId]
  );
  return rows;
}

async function verificarPagosVencidos(clienteId) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int as vencidos
     FROM pedidos 
     WHERE clienteid = $1 
       AND es_credito = true
       AND pagado = false
       AND fecha_vencimiento < CURRENT_DATE`,
    [clienteId]
  );
  return rows[0].vencidos > 0;
}

async function analizarRiesgoCredito(solicitudId) {
  // Obtener datos de la solicitud
  const { rows: [solicitud] } = await db.query(
    `SELECT 
      s.*,
      c.fechaderegistro,
      c.nombre || ' ' || c.apellido as nombre_completo,
      COALESCE(c.ingreso_mensual, s.ingreso_mensual) as ingreso_mensual
     FROM solicitudes_credito s
     INNER JOIN clientes c ON c.clienteid = s.cliente_id
     WHERE s.solicitud_id = $1`,
    [solicitudId]
  );

  if (!solicitud) {
    throw new Error("Solicitud no encontrada");
  }

  // Obtener historial de pedidos pagados
  const historialPedidos = await obtenerHistorialPedidos(solicitud.cliente_id);
  
  // Calcular métricas
  const antiguedadMeses = calcularAntiguedadMeses(solicitud.fechaderegistro);
  const frecuenciaDias = calcularFrecuenciaDias(historialPedidos);
  const compraMaxima = Math.max(0, ...historialPedidos.map(p => Number(p.montototal) || 0));
  const montoSolicitado = Number(solicitud.monto_solicitado);
  const tienePagosVencidos = await verificarPagosVencidos(solicitud.cliente_id);

  // Calcular nivel de riesgo
  let nivelRiesgo = RIESGO.MEDIO;
  let advertencias = [];

  if (historialPedidos.length === 0) {
    nivelRiesgo = RIESGO.ALTO;
    advertencias.push("Cliente sin historial de compras en la plataforma");
  } else if (tienePagosVencidos) {
    nivelRiesgo = RIESGO.ALTO;
    advertencias.push("Cliente tiene pagos vencidos pendientes");
  } else if (antiguedadMeses < 3) {
    nivelRiesgo = RIESGO.MEDIO;
    advertencias.push("Cliente con menos de 3 meses de antigüedad");
  } else if (montoSolicitado > compraMaxima * 2) {
    nivelRiesgo = RIESGO.MEDIO;
    advertencias.push(`Monto solicitado supera 2x la compra máxima histórica ($${compraMaxima.toFixed(2)})`);
  } else if (antiguedadMeses >= 6 && montoSolicitado <= compraMaxima * 1.5 && historialPedidos.length > 0) {
    nivelRiesgo = RIESGO.BAJO;
  }

  // Preparar respuesta
  return {
    solicitud_id: solicitudId,
    cliente_id: solicitud.cliente_id,
    nombre_cliente: solicitud.nombre_completo,
    monto_solicitado: montoSolicitado,
    metricas: {
      antiguedad_meses: antiguedadMeses,
      total_pedidos: historialPedidos.length,
      compra_maxima: compraMaxima,
      frecuencia_dias: frecuenciaDias,
      ingreso_mensual: solicitud.ingreso_mensual || null
    },
    analisis: {
      nivel_riesgo: nivelRiesgo,
      advertencias,
      ratio_monto_vs_maximo: compraMaxima > 0 ? (montoSolicitado / compraMaxima).toFixed(2) : null,
      tiene_pagos_vencidos: tienePagosVencidos
    }
  };
}

module.exports = {
  analizarRiesgoCredito,
  RIESGO
};
