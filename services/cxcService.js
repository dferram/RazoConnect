/**
 * CXC SERVICE - Servicio de Cuentas por Cobrar
 * 
 * Centraliza toda la lógica de generación de CxC basada en remisiones.
 * REGLA DE NEGOCIO: La remisión es el único eje de la deuda.
 * 
 * @module services/cxcService
 * @author RazoConnect Team
 * @date 2026-05-19
 */

const logger = require('../utils/logger');

/**
 * Calcula el monto parcial de una remisión con prorrateo exacto de envío y descuento
 * 
 * @param {Object} client - Cliente de base de datos (transacción activa)
 * @param {number} pedidoId - ID del pedido
 * @param {Array<number>} detalleIds - IDs de los detalles confirmados en esta remisión
 * @param {number} tenantId - ID del tenant
 * @returns {Promise<Object>} { subtotal, envio_proporcional, descuento_proporcional, total_cxc }
 */
async function calcularMontoParcial(client, pedidoId, detalleIds, tenantId) {
  try {
    // 1. Obtener datos del pedido (totales globales)
    const pedidoQuery = await client.query(
      `SELECT 
        montototal,
        costoenvio,
        monto_descuento,
        cupon_id
       FROM pedidos
       WHERE pedidoid = $1 AND tenant_id = $2`,
      [pedidoId, tenantId]
    );

    if (pedidoQuery.rows.length === 0) {
      throw new Error(`Pedido ${pedidoId} no encontrado`);
    }

    const pedido = pedidoQuery.rows[0];
    const costoEnvioTotal = parseFloat(pedido.costoenvio || 0);
    const montoDescuentoTotal = parseFloat(pedido.monto_descuento || 0);
    const cuponId = pedido.cupon_id;

    // El descuento solo aplica si hay cupón
    const tieneCupon = cuponId && !isNaN(parseInt(cuponId)) && parseInt(cuponId) > 0;
    const descuentoAplicable = tieneCupon ? montoDescuentoTotal : 0;

    // 2. Calcular subtotal del pedido COMPLETO (sin envío ni descuento)
    const subtotalPedidoQuery = await client.query(
      `SELECT COALESCE(SUM(preciounitario * piezastotales), 0) AS subtotal_pedido
       FROM detallesdelpedido
       WHERE pedidoid = $1 AND tenant_id = $2`,
      [pedidoId, tenantId]
    );

    const subtotalPedidoCompleto = parseFloat(subtotalPedidoQuery.rows[0].subtotal_pedido || 0);

    if (subtotalPedidoCompleto === 0) {
      throw new Error(`El pedido ${pedidoId} no tiene productos o el subtotal es 0`);
    }

    // 3. Calcular subtotal de los items CONFIRMADOS en esta remisión
    const subtotalParcialQuery = await client.query(
      `SELECT COALESCE(SUM(preciounitario * cantidadsurtida), 0) AS subtotal_parcial
       FROM detallesdelpedido
       WHERE pedidoid = $1 
         AND detalleid = ANY($2::int[])
         AND cantidadsurtida > 0
         AND tenant_id = $3`,
      [pedidoId, detalleIds, tenantId]
    );

    const subtotalParcial = parseFloat(subtotalParcialQuery.rows[0].subtotal_parcial || 0);

    if (subtotalParcial === 0) {
      logger.warn('⚠️ Subtotal parcial es 0. No hay productos surtidos para generar CxC.', {
        pedidoId,
        detalleIds
      });
      return {
        subtotal: 0,
        envio_proporcional: 0,
        descuento_proporcional: 0,
        total_cxc: 0
      };
    }

    // 4. Calcular proporciones usando regla de tres
    // Proporción = (subtotal_parcial / subtotal_pedido_completo)
    const proporcion = subtotalParcial / subtotalPedidoCompleto;

    const envioProporcional = costoEnvioTotal * proporcion;
    const descuentoProporcional = descuentoAplicable * proporcion;

    // 5. Total CxC = subtotal + envío - descuento
    const totalCxc = subtotalParcial + envioProporcional - descuentoProporcional;

    logger.info('✅ Cálculo proporcional de CxC completado:', {
      pedidoId,
      detalleIds,
      subtotalPedidoCompleto: subtotalPedidoCompleto.toFixed(2),
      subtotalParcial: subtotalParcial.toFixed(2),
      proporcion: (proporcion * 100).toFixed(2) + '%',
      costoEnvioTotal: costoEnvioTotal.toFixed(2),
      envioProporcional: envioProporcional.toFixed(2),
      descuentoAplicable: descuentoAplicable.toFixed(2),
      descuentoProporcional: descuentoProporcional.toFixed(2),
      totalCxc: totalCxc.toFixed(2)
    });

    return {
      subtotal: parseFloat(subtotalParcial.toFixed(2)),
      envio_proporcional: parseFloat(envioProporcional.toFixed(2)),
      descuento_proporcional: parseFloat(descuentoProporcional.toFixed(2)),
      total_cxc: parseFloat(totalCxc.toFixed(2)),
      // Metadata adicional para auditoría
      _metadata: {
        subtotal_pedido_completo: parseFloat(subtotalPedidoCompleto.toFixed(2)),
        proporcion: parseFloat((proporcion * 100).toFixed(2)),
        costo_envio_total: parseFloat(costoEnvioTotal.toFixed(2)),
        descuento_total: parseFloat(descuentoAplicable.toFixed(2))
      }
    };

  } catch (error) {
    logger.error('❌ Error calculando monto parcial:', {
      error: error.message,
      pedidoId,
      detalleIds
    });
    throw error;
  }
}

/**
 * Crea un registro de CxC vinculado a una remisión
 * 
 * REGLA ESTRICTA: remision_id es OBLIGATORIO para CARGOS, opcional para ABONOS
 * 
 * @param {Object} client - Cliente de base de datos (transacción activa)
 * @param {Object} params - Parámetros de la CxC
 * @param {number} params.pedido_id - ID del pedido
 * @param {number} params.cliente_id - ID del cliente
 * @param {number} params.remision_id - ID de la remisión (OBLIGATORIO para CARGO)
 * @param {string} params.tipo_movimiento - 'CARGO' o 'ABONO' (default: 'CARGO')
 * @param {number} params.monto - Monto de la CxC
 * @param {string} params.descripcion - Descripción del movimiento
 * @param {number} params.tenant_id - ID del tenant
 * @param {number} params.admin_id - ID del admin responsable
 * @returns {Promise<Object>} Registro de CxC creado
 */
async function crearCxC(client, params) {
  const {
    pedido_id,
    cliente_id,
    remision_id,
    tipo_movimiento = 'CARGO',
    monto,
    descripcion,
    tenant_id,
    admin_id
  } = params;

  // VALIDACIÓN ESTRICTA: remision_id es obligatorio SOLO para CARGOS
  if (tipo_movimiento === 'CARGO' && (!remision_id || remision_id === null || remision_id === undefined)) {
    throw new Error(
      'VIOLACIÓN DE REGLA DE NEGOCIO: remision_id es obligatorio para CARGOS. ' +
      'La deuda debe estar vinculada a una remisión específica.'
    );
  }

  if (!pedido_id || !cliente_id || !monto || !tenant_id || !admin_id) {
    throw new Error('Faltan parámetros obligatorios para crear CxC');
  }

  try {
    const result = await client.query(
      `INSERT INTO cuentas_por_cobrar
       (pedido_id, cliente_id, remision_id, tipo_movimiento, monto, descripcion, tenant_id, admin_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING cxcid, pedido_id, cliente_id, remision_id, tipo_movimiento, monto, descripcion, fecha_movimiento`,
      [pedido_id, cliente_id, remision_id || null, tipo_movimiento, monto.toFixed(2), descripcion, tenant_id, admin_id]
    );

    logger.info('✅ CxC creada exitosamente:', {
      cxcid: result.rows[0].cxcid,
      pedido_id,
      remision_id: remision_id || 'N/A',
      tipo_movimiento,
      monto: monto.toFixed(2),
      cliente_id
    });

    return result.rows[0];

  } catch (error) {
    logger.error('❌ Error creando CxC:', {
      error: error.message,
      params
    });
    throw error;
  }
}

/**
 * Crea un movimiento de crédito (AJUSTE o CARGO)
 * 
 * @param {Object} client - Cliente de base de datos (transacción activa)
 * @param {Object} params - Parámetros del movimiento
 * @returns {Promise<Object>} Movimiento creado
 */
async function crearMovimientoCredito(client, params) {
  const {
    credito_id,
    tipo_movimiento,
    monto,
    referencia_id,
    descripcion,
    saldo_despues_movimiento,
    tenant_id,
    pedido_id,
    admin_id
  } = params;

  if (!credito_id || !tipo_movimiento || monto === undefined || !tenant_id) {
    throw new Error('Faltan parámetros obligatorios para crear movimiento de crédito');
  }

  try {
    const result = await client.query(
      `INSERT INTO credito_movimientos
       (credito_id, tipo_movimiento, monto, referencia_id, descripcion,
        saldo_despues_movimiento, tenant_id, pedido_id, admin_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING movimiento_id, credito_id, tipo_movimiento, monto, fecha_movimiento`,
      [
        credito_id,
        tipo_movimiento,
        monto.toFixed(2),
        referencia_id,
        descripcion,
        saldo_despues_movimiento.toFixed(2),
        tenant_id,
        pedido_id || null,
        admin_id || null
      ]
    );

    logger.info(`✅ Movimiento de crédito ${tipo_movimiento} creado:`, {
      movimiento_id: result.rows[0].movimiento_id,
      credito_id,
      monto: monto.toFixed(2)
    });

    return result.rows[0];

  } catch (error) {
    logger.error('❌ Error creando movimiento de crédito:', {
      error: error.message,
      params
    });
    throw error;
  }
}

/**
 * Genera CxC completa para una remisión (incluye cálculo proporcional + inserción)
 * 
 * @param {Object} client - Cliente de base de datos (transacción activa)
 * @param {Object} params - Parámetros
 * @param {number} params.pedido_id - ID del pedido
 * @param {number} params.cliente_id - ID del cliente
 * @param {number} params.remision_id - ID de la remisión (OBLIGATORIO)
 * @param {Array<number>} params.detalle_ids - IDs de detalles confirmados
 * @param {number} params.tenant_id - ID del tenant
 * @param {number} params.admin_id - ID del admin
 * @param {string} params.descripcion - Descripción personalizada (opcional)
 * @returns {Promise<Object>} { cxc, calculo, movimientos }
 */
async function generarCxCParaRemision(client, params) {
  const {
    pedido_id,
    cliente_id,
    remision_id,
    detalle_ids,
    tenant_id,
    admin_id,
    descripcion
  } = params;

  // 1. Calcular monto proporcional
  const calculo = await calcularMontoParcial(client, pedido_id, detalle_ids, tenant_id);

  if (calculo.total_cxc === 0) {
    logger.warn('⚠️ Total CxC es 0, no se generará registro', { pedido_id, remision_id });
    return {
      cxc: null,
      calculo,
      movimientos: []
    };
  }

  // 2. Obtener información de crédito del cliente
  const creditoQuery = await client.query(
    `SELECT credito_id, saldo_deudor
     FROM cliente_creditos
     WHERE cliente_id = $1 AND tenant_id = $2
     FOR UPDATE`,
    [cliente_id, tenant_id]
  );

  if (creditoQuery.rows.length === 0) {
    throw new Error(`No se encontró crédito para el cliente ${cliente_id}`);
  }

  const creditoInfo = creditoQuery.rows[0];
  const saldoActual = parseFloat(creditoInfo.saldo_deudor || 0);

  // 3. Crear movimientos de crédito
  const movimientos = [];

  // 3.1. AJUSTE: Liberar reserva parcial (monto negativo)
  const ajuste = await crearMovimientoCredito(client, {
    credito_id: creditoInfo.credito_id,
    tipo_movimiento: 'AJUSTE',
    monto: -calculo.total_cxc,
    referencia_id: `PED-${pedido_id}`,
    descripcion: `Lib. reserva parcial - Remisión #${remision_id} (Pedido #${pedido_id})`,
    saldo_despues_movimiento: saldoActual - calculo.total_cxc,
    tenant_id,
    pedido_id,
    admin_id
  });
  movimientos.push(ajuste);

  // 3.2. CARGO: Cargo real de la remisión
  const cargo = await crearMovimientoCredito(client, {
    credito_id: creditoInfo.credito_id,
    tipo_movimiento: 'CARGO',
    monto: calculo.total_cxc,
    referencia_id: `REM-${remision_id}`,
    descripcion: `Cargo confirmado - Remisión #${remision_id} (Pedido #${pedido_id})`,
    saldo_despues_movimiento: saldoActual,
    tenant_id,
    pedido_id,
    admin_id
  });
  movimientos.push(cargo);

  // 4. Crear CxC vinculada a la remisión
  const descripcionFinal = descripcion || 
    `Remisión #${remision_id} - Pedido #${pedido_id} (${detalle_ids.length} productos)`;

  const cxc = await crearCxC(client, {
    pedido_id,
    cliente_id,
    remision_id,
    monto: calculo.total_cxc,
    descripcion: descripcionFinal,
    tenant_id,
    admin_id
  });

  logger.info('✅ CxC completa generada para remisión:', {
    cxcid: cxc.cxcid,
    remision_id,
    pedido_id,
    monto: calculo.total_cxc,
    detalles_confirmados: detalle_ids.length
  });

  return {
    cxc,
    calculo,
    movimientos
  };
}

module.exports = {
  calcularMontoParcial,
  crearCxC,
  crearMovimientoCredito,
  generarCxCParaRemision
};
