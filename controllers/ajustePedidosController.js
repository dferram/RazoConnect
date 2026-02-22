const db = require("../db");
const SmartStockService = require("../services/SmartStockService");

async function ajustarPedido(req, res) {
  const client = await db.pool.connect();
  let transactionStarted = false;

  try {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔧 [AJUSTE PEDIDO] Inicio de ajuste');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (!req.tenant || !req.tenant.tenant_id) {
      client.release();
      return res.status(500).json({
        success: false,
        message: "Error: tenant no disponible"
      });
    }

    const { tenant_id } = req.tenant;
    const pedidoId = parseInt(req.params.id, 10);
    const { itemsAgregar = [], itemsEliminar = [], itemsModificar = [] } = req.body;

    console.log(`📋 Pedido ID: ${pedidoId}`);
    console.log(`📦 Items a agregar: ${itemsAgregar.length}`);
    console.log(`🗑️  Items a eliminar: ${itemsEliminar.length}`);
    console.log(`✏️  Items a modificar: ${itemsModificar.length}`);

    // Validación de datos de entrada
    if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
      client.release();
      return res.status(400).json({
        success: false,
        message: "ID de pedido inválido"
      });
    }

    // Validar que los arrays sean realmente arrays
    if (!Array.isArray(itemsAgregar) || !Array.isArray(itemsEliminar) || !Array.isArray(itemsModificar)) {
      client.release();
      return res.status(400).json({
        success: false,
        message: "Formato de datos inválido. Se esperan arrays para itemsAgregar, itemsEliminar e itemsModificar"
      });
    }

    // Validar que haya al menos un cambio
    if (itemsAgregar.length === 0 && itemsEliminar.length === 0 && itemsModificar.length === 0) {
      client.release();
      return res.status(400).json({
        success: false,
        message: "No se detectaron cambios para aplicar"
      });
    }

    await client.query("BEGIN");
    transactionStarted = true;

    const pedidoResult = await client.query(
      `SELECT 
        p.pedidoid,
        p.clienteid,
        p.montototal,
        p.estatus,
        p.pagado,
        p.es_credito,
        p.metodo_pago,
        p.monto_surtido,
        p.monto_backorder,
        c.nombre AS cliente_nombre,
        c.email AS cliente_email
      FROM pedidos p
      INNER JOIN clientes c ON c.clienteid = p.clienteid
      WHERE p.pedidoid = $1 AND p.tenant_id = $2
      FOR UPDATE`,
      [pedidoId, tenant_id]
    );

    if (pedidoResult.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      client.release();
      return res.status(404).json({
        success: false,
        message: "Pedido no encontrado"
      });
    }

    const pedido = pedidoResult.rows[0];

    if (pedido.pagado && pedido.metodo_pago === 'transferencia' && pedido.monto_surtido > 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      client.release();
      return res.status(400).json({
        success: false,
        message: "⚠️ Este pedido ya fue pagado por transferencia y tiene remisiones. Los ajustes generarán un saldo a favor o requerirán pago adicional.",
        requiereConfirmacion: true
      });
    }

    const cambiosRealizados = [];
    let montoTotalNuevo = parseFloat(pedido.montototal);

    for (const itemId of itemsEliminar) {
      const detalleId = parseInt(itemId, 10);
      if (!Number.isInteger(detalleId) || detalleId <= 0) continue;

      const detalleResult = await client.query(
        `SELECT 
          d.detalleid,
          d.varianteid,
          d.cantidadpaquetes,
          d.precioporpaquete,
          d.piezastotales,
          d.tamanoid,
          d.esbackorder,
          pv.sku,
          p.nombreproducto
        FROM detallesdelpedido d
        INNER JOIN producto_variantes pv ON pv.varianteid = d.varianteid
        INNER JOIN productos p ON p.productoid = pv.productoid
        WHERE d.detalleid = $1 AND d.pedidoid = $2
        FOR UPDATE OF d`,
        [detalleId, pedidoId]
      );

      if (detalleResult.rows.length === 0) continue;

      const detalle = detalleResult.rows[0];
      const subtotalEliminado = parseFloat(detalle.cantidadpaquetes) * parseFloat(detalle.precioporpaquete);
      montoTotalNuevo -= subtotalEliminado;

      if (!detalle.esbackorder) {
        const varianteStockResult = await client.query(
          `SELECT varianteid, stock FROM producto_variantes WHERE varianteid = $1 FOR UPDATE`,
          [detalle.varianteid]
        );

        if (varianteStockResult.rows.length > 0) {
          const stockActual = parseInt(varianteStockResult.rows[0].stock, 10);
          const piezasDevolver = parseInt(detalle.piezastotales, 10);
          const nuevoStock = stockActual + piezasDevolver;

          await client.query(
            `UPDATE producto_variantes SET stock = $1 WHERE varianteid = $2`,
            [nuevoStock, detalle.varianteid]
          );

          await client.query(
            `INSERT INTO log_inventario (
              varianteid,
              tipo_movimiento,
              cantidad_piezas,
              stock_previo,
              stock_posterior,
              referencia,
              notas,
              tenant_id
            ) VALUES ($1, 'DEVOLUCION_AJUSTE', $2, $3, $4, $5, $6, $7)`,
            [
              detalle.varianteid,
              piezasDevolver,
              stockActual,
              nuevoStock,
              `AJUSTE-PED-${pedidoId}`,
              `Devolución por eliminación de producto en ajuste de pedido`,
              tenant_id
            ]
          );

          cambiosRealizados.push({
            tipo: 'ELIMINADO',
            producto: detalle.nombreproducto,
            sku: detalle.sku,
            cantidad: detalle.cantidadpaquetes,
            piezasDevueltas: piezasDevolver,
            subtotal: subtotalEliminado
          });
        }
      } else {
        cambiosRealizados.push({
          tipo: 'ELIMINADO_BACKORDER',
          producto: detalle.nombreproducto,
          sku: detalle.sku,
          cantidad: detalle.cantidadpaquetes,
          subtotal: subtotalEliminado
        });
      }

      await client.query(
        `DELETE FROM detallesdelpedido WHERE detalleid = $1`,
        [detalleId]
      );
    }

    for (const modificacion of itemsModificar) {
      const detalleId = parseInt(modificacion.detalleId, 10);
      const nuevaCantidad = parseInt(modificacion.cantidad, 10);
      const nuevoTamanoId = modificacion.tamanoId ? parseInt(modificacion.tamanoId, 10) : null;

      if (!Number.isInteger(detalleId) || detalleId <= 0) continue;
      if (!Number.isInteger(nuevaCantidad) || nuevaCantidad <= 0) continue;

      const detalleResult = await client.query(
        `SELECT 
          d.detalleid,
          d.varianteid,
          d.cantidadpaquetes,
          d.precioporpaquete,
          d.preciounitario,
          d.piezastotales,
          d.tamanoid,
          d.esbackorder,
          pv.sku,
          pv.stock,
          pv.preciounitario as precio_unitario_variante,
          pv.precioofertaunitario,
          p.nombreproducto,
          t.cantidad AS tamano_piezas
        FROM detallesdelpedido d
        INNER JOIN producto_variantes pv ON pv.varianteid = d.varianteid
        INNER JOIN productos p ON p.productoid = pv.productoid
        LEFT JOIN cat_tamanopaquetes t ON t.tamanoid = d.tamanoid
        WHERE d.detalleid = $1 AND d.pedidoid = $2
        FOR UPDATE OF d, pv`,
        [detalleId, pedidoId]
      );

      if (detalleResult.rows.length === 0) continue;

      const detalle = detalleResult.rows[0];
      const cantidadAnterior = parseInt(detalle.cantidadpaquetes, 10);
      const tamanoAnterior = detalle.tamanoid;
      const diferenciaCantidad = nuevaCantidad - cantidadAnterior;
      const cambioTamano = nuevoTamanoId && nuevoTamanoId !== tamanoAnterior;

      // Si no hay cambios, continuar
      if (diferenciaCantidad === 0 && !cambioTamano) continue;

      let tamanoPiezas = parseInt(detalle.tamano_piezas, 10) || 1;
      let nuevoPrecioPorPaquete = parseFloat(detalle.precioporpaquete);
      let nuevoPrecioUnitario = parseFloat(detalle.preciounitario);

      // Si cambió el tamaño, obtener el nuevo precio
      if (cambioTamano) {
        const nuevoTamanoResult = await client.query(
          `SELECT cantidad FROM cat_tamanopaquetes WHERE tamanoid = $1`,
          [nuevoTamanoId]
        );

        if (nuevoTamanoResult.rows.length === 0) {
          console.error(`Tamaño ${nuevoTamanoId} no encontrado`);
          continue;
        }

        tamanoPiezas = parseInt(nuevoTamanoResult.rows[0].cantidad, 10);
        const precioBase = parseFloat(detalle.precioofertaunitario || detalle.precio_unitario_variante);
        nuevoPrecioPorPaquete = parseFloat((precioBase * tamanoPiezas).toFixed(2));
        nuevoPrecioUnitario = precioBase;

        console.log(`📦 Cambio de tamaño detectado:`, {
          detalleId,
          tamanoAnterior,
          nuevoTamanoId,
          piezasAnterior: detalle.tamano_piezas,
          piezasNuevo: tamanoPiezas,
          precioAnterior: detalle.precioporpaquete,
          precioNuevo: nuevoPrecioPorPaquete
        });
      }

      const diferenciaPiezas = diferenciaCantidad * tamanoPiezas;
      const subtotalAnterior = cantidadAnterior * parseFloat(detalle.precioporpaquete);
      const subtotalNuevo = nuevaCantidad * nuevoPrecioPorPaquete;
      const diferenciaSubtotal = subtotalNuevo - subtotalAnterior;

      // ❌ DESHABILITADO: Stock NO se ajusta al modificar pedido
      // ✅ NUEVO FLUJO: El stock se deduce SOLO cuando el pedido cambia a "Confirmado"
      // Ver: adminController.js -> updatePedidoEstatus() para la lógica de deducción
      
      /* CÓDIGO ORIGINAL COMENTADO - NO AJUSTAR STOCK AL MODIFICAR PEDIDO
      if (!detalle.esbackorder) {
        if (diferenciaCantidad > 0) {
          const piezasNecesarias = diferenciaPiezas;
          console.log(`📉 Descontando ${piezasNecesarias} piezas de variante ${detalle.varianteid}`);
          const resultado = await SmartStockService.adjustStock({
            varianteId: detalle.varianteid,
            cantidad: -piezasNecesarias,
            userId: req.user.id || req.user.userId,
            userRole: req.user.roles || [req.user.rol],
            tenantId: tenant_id,
            client: client
          });
          if (!resultado.success) {
            await client.query("ROLLBACK");
            transactionStarted = false;
            client.release();
            return res.status(400).json({
              success: false,
              message: `Stock insuficiente para ${detalle.nombreproducto} (${detalle.sku}). ${resultado.message || 'No hay suficiente inventario disponible'}`
            });
          }
          console.log(`✅ Stock ajustado: ${resultado.oldStock} → ${resultado.newStock}`);
        } else if (diferenciaCantidad < 0) {
          const piezasDevolver = Math.abs(diferenciaPiezas);
          console.log(`📈 Devolviendo ${piezasDevolver} piezas a variante ${detalle.varianteid}`);
          const resultado = await SmartStockService.adjustStock({
            varianteId: detalle.varianteid,
            cantidad: +piezasDevolver,
            userId: req.user.id || req.user.userId,
            userRole: req.user.roles || [req.user.rol],
            tenantId: tenant_id,
            client: client
          });
          if (!resultado.success) {
            console.error(`⚠️ Error al devolver stock: ${resultado.message}`);
          } else {
            console.log(`✅ Stock devuelto: ${resultado.oldStock} → ${resultado.newStock}`);
          }
        }
      }
      FIN CÓDIGO COMENTADO */
      
      console.log(`ℹ️ [Pedido ${pedidoId}] Stock NO modificado al ajustar - se deducirá al confirmar`)

      // Actualizar detalle del pedido con nuevos valores
      if (cambioTamano) {
        await client.query(
          `UPDATE detallesdelpedido 
          SET cantidadpaquetes = $1, 
              piezastotales = $2, 
              tamanoid = $3,
              precioporpaquete = $4,
              preciounitario = $5
          WHERE detalleid = $6`,
          [nuevaCantidad, nuevaCantidad * tamanoPiezas, nuevoTamanoId, nuevoPrecioPorPaquete, nuevoPrecioUnitario, detalleId]
        );
      } else {
        await client.query(
          `UPDATE detallesdelpedido 
          SET cantidadpaquetes = $1, piezastotales = $2
          WHERE detalleid = $3`,
          [nuevaCantidad, nuevaCantidad * tamanoPiezas, detalleId]
        );
      }

      montoTotalNuevo += diferenciaSubtotal;

      cambiosRealizados.push({
        tipo: 'MODIFICADO',
        producto: detalle.nombreproducto,
        sku: detalle.sku,
        cantidadAnterior,
        cantidadNueva: nuevaCantidad,
        diferencia: diferenciaCantidad,
        cambioTamano: cambioTamano,
        tamanoAnterior: tamanoAnterior,
        tamanoNuevo: nuevoTamanoId,
        subtotalAnterior,
        subtotalNuevo,
        diferenciaSubtotal
      });
    }

    for (const nuevoItem of itemsAgregar) {
      const varianteId = parseInt(nuevoItem.varianteId, 10);
      const tamanoId = parseInt(nuevoItem.tamanoId, 10);
      const cantidad = parseInt(nuevoItem.cantidad, 10);

      if (!Number.isInteger(varianteId) || varianteId <= 0) continue;
      if (!Number.isInteger(tamanoId) || tamanoId <= 0) continue;
      if (!Number.isInteger(cantidad) || cantidad <= 0) continue;

      const varianteResult = await client.query(
        `SELECT 
          pv.varianteid,
          pv.sku,
          pv.stock,
          pv.preciounitario,
          pv.precioofertaunitario,
          p.productoid,
          p.nombreproducto,
          t.cantidad AS tamano_piezas
        FROM producto_variantes pv
        INNER JOIN productos p ON p.productoid = pv.productoid
        LEFT JOIN cat_tamanopaquetes t ON t.tamanoid = $2
        WHERE pv.varianteid = $1 AND p.tenant_id = $3
        FOR UPDATE OF pv`,
        [varianteId, tamanoId, tenant_id]
      );

      if (varianteResult.rows.length === 0) continue;

      const variante = varianteResult.rows[0];
      const tamanoPiezas = parseInt(variante.tamano_piezas, 10) || 1;
      const piezasNecesarias = cantidad * tamanoPiezas;

      console.log(`📦 Agregando producto: ${variante.nombreproducto} - ${piezasNecesarias} piezas`);

      // ❌ DESHABILITADO: Stock NO se descuenta al agregar producto
      // ✅ NUEVO FLUJO: El stock se deduce SOLO cuando el pedido cambia a "Confirmado"
      // Ver: adminController.js -> updatePedidoEstatus() para la lógica de deducción
      
      /* CÓDIGO ORIGINAL COMENTADO - NO DESCONTAR STOCK AL AGREGAR PRODUCTO
      const resultado = await SmartStockService.adjustStock({
        varianteId,
        cantidad: -piezasNecesarias,
        userId: req.user.id || req.user.userId,
        userRole: req.user.roles || [req.user.rol],
        tenantId: tenant_id,
        client: client
      });
      if (!resultado.success) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        client.release();
        return res.status(400).json({
          success: false,
          message: `Stock insuficiente para ${variante.nombreproducto} (${variante.sku}). ${resultado.message || 'No hay suficiente inventario disponible'}`
        });
      }
      console.log(`✅ Stock descontado: ${resultado.oldStock} → ${resultado.newStock}`);
      FIN CÓDIGO COMENTADO */
      
      console.log(`ℹ️ [Pedido ${pedidoId}] Stock NO deducido al agregar - se deducirá al confirmar`)

      const precioBase = parseFloat(variante.preciounitario) || 0;
      const precioOferta = variante.precioofertaunitario ? parseFloat(variante.precioofertaunitario) : null;
      const precioUnitario = precioOferta || precioBase;
      const precioPorPaquete = precioUnitario * tamanoPiezas;
      const subtotal = cantidad * precioPorPaquete;

      await client.query(
        `INSERT INTO detallesdelpedido (
          pedidoid,
          varianteid,
          tamanoid,
          cantidadpaquetes,
          precioporpaquete,
          piezastotales,
          preciounitario,
          esbackorder,
          cantidadsurtida,
          cantidadbackorder,
          tenant_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, $4, 0, $8)`,
        [
          pedidoId,
          varianteId,
          tamanoId,
          cantidad,
          precioPorPaquete.toFixed(2),
          piezasNecesarias,
          precioUnitario.toFixed(2),
          tenant_id
        ]
      );

      montoTotalNuevo += subtotal;

      cambiosRealizados.push({
        tipo: 'AGREGADO',
        producto: variante.nombreproducto,
        sku: variante.sku,
        cantidad,
        piezasDescontadas: piezasNecesarias,
        subtotal
      });
    }

    montoTotalNuevo = parseFloat(montoTotalNuevo.toFixed(2));

    await client.query(
      `UPDATE pedidos 
      SET montototal = $1,
          monto_backorder = $1 - COALESCE(monto_surtido, 0)
      WHERE pedidoid = $2`,
      [montoTotalNuevo, pedidoId]
    );

    await client.query(
      `INSERT INTO historial_pedidos (
        pedido_id,
        accion,
        detalles,
        monto_anterior,
        monto_nuevo,
        usuario_id,
        tenant_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        pedidoId,
        'AJUSTE_MANUAL',
        JSON.stringify(cambiosRealizados),
        parseFloat(pedido.montototal),
        montoTotalNuevo,
        req.user?.id || req.user?.userId || null,
        tenant_id
      ]
    );

    // Crear notificación para el cliente usando el sistema existente
    const diferenciaMonto = montoTotalNuevo - parseFloat(pedido.montototal);
    const signo = diferenciaMonto >= 0 ? '+' : '';
    const tituloNotificacion = '⚠️ Pedido Modificado';
    const mensajeNotificacion = `Tu pedido #${pedidoId} ha sido modificado por el administrador. El monto cambió de $${parseFloat(pedido.montototal).toFixed(2)} a $${montoTotalNuevo.toFixed(2)} (${signo}$${diferenciaMonto.toFixed(2)}). Revisa los detalles actualizados.`;

    await client.query(
      `INSERT INTO notificaciones (
        clienteid,
        tipo,
        titulo,
        mensaje,
        url,
        prioridad,
        metadata,
        tenant_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        pedido.clienteid,
        'pedido',
        tituloNotificacion,
        mensajeNotificacion,
        `/dashboard.html?tab=pedidos&pedido=${pedidoId}`,
        'alta',
        JSON.stringify({
          pedidoId,
          monto_anterior: parseFloat(pedido.montototal),
          monto_nuevo: montoTotalNuevo,
          diferencia: diferenciaMonto,
          cambios_realizados: cambiosRealizados.length,
          items_agregados: itemsAgregar.length,
          items_eliminados: itemsEliminar.length,
          items_modificados: itemsModificar.length
        }),
        tenant_id
      ]
    );

    await client.query("COMMIT");
    transactionStarted = false;

    const pedidoActualizadoResult = await client.query(
      `SELECT 
        p.*,
        c.nombre AS cliente_nombre,
        c.email AS cliente_email
      FROM pedidos p
      INNER JOIN clientes c ON c.clienteid = p.clienteid
      WHERE p.pedidoid = $1`,
      [pedidoId]
    );

    client.release();

    return res.status(200).json({
      success: true,
      message: `Pedido #${pedidoId} ajustado exitosamente`,
      data: {
        pedido: pedidoActualizadoResult.rows[0],
        cambios: cambiosRealizados,
        montoAnterior: parseFloat(pedido.montototal),
        montoNuevo: montoTotalNuevo,
        diferencia: montoTotalNuevo - parseFloat(pedido.montototal)
      }
    });

  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK");
    }
    client.release();
    console.error("Error al ajustar pedido:", error);
    return res.status(500).json({
      success: false,
      message: "Error al ajustar el pedido",
      error: error.message
    });
  }
}

module.exports = {
  ajustarPedido
};
