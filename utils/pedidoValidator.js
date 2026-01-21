/**
 * Validador de Integridad Financiera de Pedidos
 * 
 * Este módulo valida que el MontoTotal de un pedido coincida
 * con la suma de sus DetallesDelPedido.
 * 
 * Dispara alertas cuando detecta discrepancias.
 */

const db = require('../db');

/**
 * Valida la integridad financiera de un pedido
 * @param {number} pedidoId - ID del pedido a validar
 * @param {object} client - Cliente de BD (opcional, para transacciones)
 * @returns {Promise<object>} Resultado de la validación
 */
async function validarIntegridadPedido(pedidoId, client = null) {
  const dbClient = client || db;

  try {
    // 1. Obtener el MontoTotal registrado en la tabla Pedidos
    const pedidoQuery = `
      SELECT 
        PedidoID,
        MontoTotal,
        Monto_Descuento,
        CostoEnvio,
        Cupon_ID,
        ClienteID,
        FechaPedido,
        Estatus
      FROM Pedidos
      WHERE PedidoID = $1
    `;
    
    const pedidoResult = await dbClient.query(pedidoQuery, [pedidoId]);
    
    if (pedidoResult.rows.length === 0) {
      return {
        valido: false,
        error: 'Pedido no encontrado',
        pedidoId
      };
    }

    const pedido = pedidoResult.rows[0];
    const montoTotalRegistrado = parseFloat(pedido.montototal || 0);
    const montoDescuento = parseFloat(pedido.monto_descuento || 0);
    const costoEnvio = parseFloat(pedido.costoenvio || 0);
    const cuponId = pedido.cupon_id;

    // 2. Calcular el total REAL sumando los DetallesDelPedido
    const detallesQuery = `
      SELECT 
        DetalleID,
        VarianteID,
        TamanoID,
        CantidadPaquetes,
        PrecioPorPaquete,
        PrecioUnitario,
        PiezasTotales,
        EsBackorder
      FROM DetallesDelPedido
      WHERE PedidoID = $1
    `;

    const detallesResult = await dbClient.query(detallesQuery, [pedidoId]);

    if (detallesResult.rows.length === 0) {
      return {
        valido: false,
        error: 'Pedido sin detalles',
        pedidoId,
        montoRegistrado: montoTotalRegistrado
      };
    }

    // Calcular subtotal sumando cada detalle
    const subtotalCalculado = detallesResult.rows.reduce((sum, detalle) => {
      const cantidad = parseFloat(detalle.cantidadpaquetes || 0);
      const precioPaquete = parseFloat(detalle.precioporpaquete || 0);
      const subtotal = cantidad * precioPaquete;
      return sum + subtotal;
    }, 0);

    // 3. Calcular el total esperado: Subtotal + Envío - Descuento
    // NOTA: Solo aplicar descuento si hay un cupón válido
    const tieneCupon = cuponId && !isNaN(parseInt(cuponId)) && parseInt(cuponId) > 0;
    const descuentoAplicable = tieneCupon ? montoDescuento : 0;
    
    const montoTotalEsperado = subtotalCalculado + costoEnvio - descuentoAplicable;

    // 4. Comparar con tolerancia de 1 centavo (por redondeos)
    const diferencia = Math.abs(montoTotalRegistrado - montoTotalEsperado);
    const TOLERANCIA = 0.01;
    const esValido = diferencia <= TOLERANCIA;

    const resultado = {
      valido: esValido,
      pedidoId: parseInt(pedido.pedidoid),
      montoRegistrado: parseFloat(montoTotalRegistrado.toFixed(2)),
      montoEsperado: parseFloat(montoTotalEsperado.toFixed(2)),
      diferencia: parseFloat(diferencia.toFixed(2)),
      desglose: {
        subtotalItems: parseFloat(subtotalCalculado.toFixed(2)),
        costoEnvio: parseFloat(costoEnvio.toFixed(2)),
        descuento: parseFloat(descuentoAplicable.toFixed(2)),
        tieneCupon,
        cuponId: cuponId || null
      },
      detalles: {
        totalItems: detallesResult.rows.length,
        clienteId: pedido.clienteid,
        fechaPedido: pedido.fechapedido,
        estatus: pedido.estatus
      }
    };

    // 5. Si hay discrepancia, registrar alerta
    if (!esValido) {
      console.error(`
╔════════════════════════════════════════════════════════════════╗
║  ⚠️  ALERTA: DISCREPANCIA FINANCIERA DETECTADA                ║
╠════════════════════════════════════════════════════════════════╣
║  Pedido ID:          ${pedidoId.toString().padEnd(42)}║
║  Monto Registrado:   $${montoTotalRegistrado.toFixed(2).padEnd(41)}║
║  Monto Esperado:     $${montoTotalEsperado.toFixed(2).padEnd(41)}║
║  Diferencia:         $${diferencia.toFixed(2).padEnd(41)}║
║                                                                ║
║  Desglose:                                                     ║
║    Subtotal Items:   $${subtotalCalculado.toFixed(2).padEnd(41)}║
║    Costo Envío:      $${costoEnvio.toFixed(2).padEnd(41)}║
║    Descuento:        $${descuentoAplicable.toFixed(2).padEnd(41)}║
║    Cupón ID:         ${(cuponId || 'N/A').toString().padEnd(42)}║
║                                                                ║
║  Cliente ID:         ${pedido.clienteid.toString().padEnd(42)}║
║  Fecha:              ${new Date(pedido.fechapedido).toISOString().substring(0, 10).padEnd(42)}║
║  Estatus:            ${pedido.estatus.padEnd(42)}║
╚════════════════════════════════════════════════════════════════╝
      `);

      // Registrar en tabla de auditoría (si existe)
      try {
        await dbClient.query(`
          INSERT INTO auditoria_pedidos_discrepancias 
            (pedido_id, monto_registrado, monto_esperado, diferencia, fecha_deteccion, detalles)
          VALUES ($1, $2, $3, $4, NOW(), $5)
          ON CONFLICT (pedido_id) DO UPDATE SET
            monto_registrado = EXCLUDED.monto_registrado,
            monto_esperado = EXCLUDED.monto_esperado,
            diferencia = EXCLUDED.diferencia,
            fecha_ultima_deteccion = NOW(),
            detalles = EXCLUDED.detalles
        `, [
          pedidoId,
          montoTotalRegistrado,
          montoTotalEsperado,
          diferencia,
          JSON.stringify(resultado)
        ]);
      } catch (auditError) {
        // Si la tabla no existe, solo loguear (no fallar)
        if (auditError.code !== '42P01') { // 42P01 = undefined_table
          console.warn('No se pudo registrar en auditoría:', auditError.message);
        }
      }
    }

    return resultado;

  } catch (error) {
    console.error(`Error validando integridad del pedido ${pedidoId}:`, error);
    return {
      valido: false,
      error: error.message,
      pedidoId
    };
  }
}

/**
 * Valida múltiples pedidos en lote
 * @param {number[]} pedidoIds - Array de IDs de pedidos
 * @returns {Promise<object[]>} Array de resultados de validación
 */
async function validarLotePedidos(pedidoIds) {
  const resultados = [];
  
  for (const pedidoId of pedidoIds) {
    const resultado = await validarIntegridadPedido(pedidoId);
    resultados.push(resultado);
  }

  const invalidos = resultados.filter(r => !r.valido);
  
  if (invalidos.length > 0) {
    console.warn(`
⚠️  RESUMEN DE VALIDACIÓN EN LOTE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total pedidos validados:  ${resultados.length}
Pedidos válidos:          ${resultados.length - invalidos.length}
Pedidos con discrepancia: ${invalidos.length}

Pedidos afectados: ${invalidos.map(r => `#${r.pedidoId}`).join(', ')}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);
  }

  return resultados;
}

module.exports = {
  validarIntegridadPedido,
  validarLotePedidos
};
