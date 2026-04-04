const pool = require('../db');
const logger = require('../utils/logger');
const kardexService = require('../services/kardexService');
const { calcularTotalSurtido } = require('../utils/calcularTotalSurtido');

/**
 * CONTROLADOR DE REMISIONES
 * Gestiona la generación de remisiones (delivery notes) y la creación de CXC
 * REGLA DE NEGOCIO CRÍTICA: La deuda (CXC) solo se genera cuando se emite una remisión,
 * NO cuando se crea el pedido. Esto permite entregas parciales y backorders sin cobrar.
 */

/**
 * POST /api/remisiones/generar
 * Genera una remisión a partir de un pedido, surtiendo productos seleccionados
 * 
 * Body esperado:
 * {
 *   pedido_id: number,
 *   items_a_surtir: [
 *     {
 *       detalle_pedido_id: number,
 *       cantidad_paquetes: number  // Cantidad de paquetes que se van a surtir
 *     }
 *   ],
 *   notas: string (opcional),
 *   emitir_inmediatamente: boolean (opcional, default: true)
 * }
 */
exports.generarRemision = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { pedido_id, items_a_surtir, notas, emitir_inmediatamente = true } = req.body;
    const { tenant_id } = req.tenant;

    // Validaciones básicas
    if (!pedido_id || !items_a_surtir || !Array.isArray(items_a_surtir) || items_a_surtir.length === 0) {
      return res.status(400).json({ 
        error: 'Datos inválidos. Se requiere pedido_id y items_a_surtir (array no vacío)' 
      });
    }

    await client.query('BEGIN');

    // BUG FIX 2: Validar estado del pedido antes de generar remisión
    const pedidoQuery = await client.query(
      `SELECT p.pedidoid, p.clienteid, p.agenteid, p.direccionenvioid, p.fechapedido, p.montototal, p.estatus, 
              p.costoenvio, p.es_credito, p.fecha_vencimiento, p.pagado, p.transaccion_id, p.comprobante_url, 
              p.metodo_pago, p.cupon_id, p.monto_descuento, p.saldo_pendiente, p.url_evidencia_entrega, 
              p.fecha_entrega_real, p.tenant_id, p.estatus_deuda, p.dias_atraso, p.tiene_remisiones, 
              p.completamente_surtido, p.monto_surtido, p.monto_backorder, p.es_prioritario, p.es_historico, 
              p.fecha_confirmacion, p.observaciones_finanzas, p.rechazado_por_finanzas, p.fecha_rechazo_finanzas,
              c.nombre AS cliente_nombre, c.apellido AS cliente_apellido
       FROM pedidos p
       INNER JOIN clientes c ON p.clienteid = c.clienteid
       WHERE p.pedidoid = $1 AND p.tenant_id = $2`,
      [pedido_id, tenant_id]
    );

    if (pedidoQuery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    const pedido = pedidoQuery.rows[0];

    // BUG FIX 2: Validar que el pedido está en estado válido para generar remisión
    const estadosValidos = ['Pendiente', 'Confirmado', 'Listo para Surtir', 'Parcial', 'Parcialmente Surtido', 'Pendiente de Confirmación', 'Pendiente de Confirmacion'];
    if (!estadosValidos.includes(pedido.estatus)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: `No se puede generar remisión. El pedido debe estar en un estado válido. Estado actual: ${pedido.estatus}`,
        estado_actual: pedido.estatus,
        estados_validos: estadosValidos
      });
    }

    // 2. Obtener detalles del pedido con información completa
    // CRÍTICO: Incluir stock REAL desde producto_variantes (NO desde sesiones de inventario)
    const detallesQuery = await client.query(
      `SELECT DISTINCT ON (dp.detalleid)
        dp.*,
        pv.sku,
        pv.nombre AS variante_nombre,
        pv.stock AS stock_real_variante,
        p.nombre AS producto_nombre,
        tp.tamanopaquete,
        COALESCE(dp.cantidad_surtida_remisiones, 0) AS ya_surtido
       FROM detallesdelpedido dp
       INNER JOIN producto_variantes pv ON dp.varianteid = pv.varianteid
       INNER JOIN productos p ON pv.productoid = p.productoid
       LEFT JOIN cat_tamanopaquetes tp ON dp.tamanoid = tp.tamanoid AND tp.tenant_id = $2
       WHERE dp.pedidoid = $1 AND dp.tenant_id = $2
       ORDER BY dp.detalleid`,
      [pedido_id, tenant_id]
    );

    if (detallesQuery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'El pedido no tiene detalles' });
    }

    const detallesPedido = detallesQuery.rows;

    // 3. Validar que los items a surtir son válidos y hay stock disponible
    // CRÍTICO: Validar contra stock REAL de producto_variantes, NO contra sesiones de inventario
    const itemsValidados = [];
    const itemsBackorder = [];
    let totalRemision = 0;

    for (const item of items_a_surtir) {
      const detalle = detallesPedido.find(d => d.detalleid === item.detalle_pedido_id);
      
      if (!detalle) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: `Detalle de pedido ${item.detalle_pedido_id} no encontrado en este pedido` 
        });
      }

      // DEBUG: Log del stock real detectado

      const cantidadDisponible = detalle.cantidadpaquetes - detalle.ya_surtido;
      
      if (item.cantidad_paquetes <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: `La cantidad a surtir debe ser mayor a 0 para ${detalle.sku}` 
        });
      }

      if (item.cantidad_paquetes > cantidadDisponible) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: `No se puede surtir ${item.cantidad_paquetes} paquetes de ${detalle.sku}. Disponible: ${cantidadDisponible}` 
        });
      }

      // Calcular piezas y subtotal
      const piezasPorPaquete = detalle.tamanopaquete || 1;
      const piezasSurtidas = item.cantidad_paquetes * piezasPorPaquete;
      const precioUnitario = detalle.preciounitario || (detalle.precioporpaquete / piezasPorPaquete);
      const subtotal = precioUnitario * piezasSurtidas;

      // VALIDACIÓN CRÍTICA: Comparar contra stock REAL de producto_variantes
      const stockRealPiezas = parseInt(detalle.stock_real_variante || 0);
      
      if (stockRealPiezas <= 0) {
        // Si el stock real es 0, este producto debe ir a backorder automáticamente
        
        itemsBackorder.push({
          detalle_pedido_id: item.detalle_pedido_id,
          variante_id: detalle.varianteid,
          sku: detalle.sku,
          cantidad_paquetes: item.cantidad_paquetes,
          piezas_solicitadas: piezasSurtidas,
          precio_unitario: precioUnitario,
          tamano_id: detalle.tamanoid,
          subtotal: subtotal
        });
        
        // Actualizar el detalle del pedido para marcarlo como backorder
        await client.query(
          `UPDATE detallesdelpedido 
           SET esbackorder = TRUE
           WHERE detalleid = $1 AND tenant_id = $2`,
          [item.detalle_pedido_id, tenant_id]
        );
        
        continue; // No agregar a itemsValidados, saltar al siguiente
      }
      
      if (piezasSurtidas > stockRealPiezas) {
        // Stock insuficiente: solo surtir lo disponible, el resto a backorder
        const paquetesSurtibles = Math.floor(stockRealPiezas / piezasPorPaquete);
        const piezasRealmenteSurtidas = paquetesSurtibles * piezasPorPaquete;
        const paquetesBackorder = item.cantidad_paquetes - paquetesSurtibles;
        const piezasBackorder = paquetesBackorder * piezasPorPaquete;
        
        
        if (paquetesSurtibles > 0) {
          const subtotalSurtido = precioUnitario * piezasRealmenteSurtidas;
          itemsValidados.push({
            detalle_pedido_id: item.detalle_pedido_id,
            variante_id: detalle.varianteid,
            cantidad_paquetes: paquetesSurtibles,
            piezas_surtidas: piezasRealmenteSurtidas,
            precio_unitario: precioUnitario,
            tamano_id: detalle.tamanoid,
            subtotal: subtotalSurtido
          });
          totalRemision += subtotalSurtido;
        }
        
        if (paquetesBackorder > 0) {
          const subtotalBackorder = precioUnitario * piezasBackorder;
          itemsBackorder.push({
            detalle_pedido_id: item.detalle_pedido_id,
            variante_id: detalle.varianteid,
            sku: detalle.sku,
            cantidad_paquetes: paquetesBackorder,
            piezas_solicitadas: piezasBackorder,
            precio_unitario: precioUnitario,
            tamano_id: detalle.tamanoid,
            subtotal: subtotalBackorder
          });
        }
        
        continue;
      }
      
      // Stock suficiente: proceder normalmente

      itemsValidados.push({
        detalle_pedido_id: item.detalle_pedido_id,
        variante_id: detalle.varianteid,
        cantidad_paquetes: item.cantidad_paquetes,
        piezas_surtidas: piezasSurtidas,
        precio_unitario: precioUnitario,
        tamano_id: detalle.tamanoid,
        subtotal: subtotal
      });

      totalRemision += subtotal;
    }
    
    // Si no hay items validados (todo fue a backorder), informar al usuario
    if (itemsValidados.length === 0 && itemsBackorder.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: 'No hay stock disponible para generar la remisión. Todos los productos han sido movidos a BACKORDER.',
        items_backorder: itemsBackorder.map(i => ({ sku: i.sku, cantidad: i.cantidad_paquetes }))
      });
    }

    // 4. Generar folio único
    const folioResult = await client.query(
      'SELECT generar_folio_remision($1) AS folio',
      [tenant_id]
    );
    const folio = folioResult.rows[0].folio;

    // 5. Insertar remisión
    // Estados: BORRADOR → PENDIENTE_REVISION → PENDIENTE_CONFIRMACION_FINANZAS → SURTIDO → EMPACADA → ENVIADA
    // IMPORTANTE: Al generar remisión, NO se afecta stock ni CxC hasta confirmación de finanzas
    const estadoInicial = emitir_inmediatamente ? 'PENDIENTE_REVISION' : 'BORRADOR';
    
    const remisionInsert = await client.query(
      `INSERT INTO remisiones 
       (pedido_id, cliente_id, agente_id, folio, total_remision, estado, notas, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING remision_id, folio, fecha_emision, estado`,
      [
        pedido_id,
        pedido.clienteid,
        pedido.agenteid,
        folio,
        totalRemision.toFixed(2),
        estadoInicial,
        notas || null,
        tenant_id
      ]
    );

    const remision = remisionInsert.rows[0];

    // 6. Insertar detalles de remisión
    for (const item of itemsValidados) {
      // Calcular número de ronda: contar cuántas veces se ha surtido este detalle antes
      const rondaQuery = await client.query(
        `SELECT COALESCE(MAX(ronda_surtido), 0) + 1 AS siguiente_ronda
         FROM detalles_remision
         WHERE detalle_pedido_id = $1 AND tenant_id = $2`,
        [item.detalle_pedido_id, tenant_id]
      );
      const rondaSurtido = rondaQuery.rows[0].siguiente_ronda;

      await client.query(
        `INSERT INTO detalles_remision 
         (remision_id, detalle_pedido_id, variante_id, cantidad_paquetes_surtidos, 
          piezas_surtidas, precio_unitario, tamano_id, subtotal, tenant_id, ronda_surtido)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          remision.remision_id,
          item.detalle_pedido_id,
          item.variante_id,
          item.cantidad_paquetes,
          item.piezas_surtidas,
          item.precio_unitario,
          item.tamano_id,
          item.subtotal,
          tenant_id,
          rondaSurtido
        ]
      );

      // 6.5. IMPORTANTE: NO descontar stock aquí
      // El stock solo se descuenta cuando FINANZAS confirma la remisión
      // Por ahora solo registramos los items en detalles_remision

      // 7. Actualizar cantidad surtida en detallesdelpedido
      await client.query(
        `UPDATE detallesdelpedido 
         SET cantidad_surtida_remisiones = COALESCE(cantidad_surtida_remisiones, 0) + $1
         WHERE detalleid = $2 AND tenant_id = $3`,
        [item.cantidad_paquetes, item.detalle_pedido_id, tenant_id]
      );
    }

    // 8. Actualizar estado del pedido con MONTOS REALES
    // Obtener monto total del pedido y monto ya surtido
    const pedidoMontoQuery = await client.query(
      `SELECT 
        montototal,
        COALESCE(monto_surtido, 0) AS monto_surtido_actual,
        COALESCE(monto_descuento, 0) AS monto_descuento
       FROM pedidos
       WHERE pedidoid = $1 AND tenant_id = $2`,
      [pedido_id, tenant_id]
    );

    const montoTotalPedido = parseFloat(pedidoMontoQuery.rows[0].montototal || 0);
    const montoSurtidoAnterior = parseFloat(pedidoMontoQuery.rows[0].monto_surtido_actual || 0);
    const montoDescuento = parseFloat(pedidoMontoQuery.rows[0].monto_descuento || 0);
    
    // Calcular nuevo monto surtido (acumulativo)
    const nuevoMontoSurtido = parseFloat((montoSurtidoAnterior + totalRemision).toFixed(2));
    
    // Calcular monto pendiente (backorder)
    const montoBackorder = parseFloat((montoTotalPedido - nuevoMontoSurtido).toFixed(2));
    
    // Determinar si está completamente surtido comparando MONTOS (con tolerancia de 1 centavo)
    const completamenteSurtido = Math.abs(nuevoMontoSurtido - montoTotalPedido) < 0.01;

    // SOLUCIÓN: Cuando se genera una remisión, SIEMPRE cambiar a "Pendiente de Confirmación"
    // Esto indica: "Surtido y esperando confirmación de finanzas"
    // Sin importar si es contado o crédito, el pedido debe aparecer en tabla de "Pedidos Surtidos"
    // Finanzas VE el pedido → Confirma → Estatus cambia a "Completado" → Stock se descuenta
    const nuevoEstatus = 'Pendiente de Confirmación';

    // FIX 3: es_historico solo debe ser true cuando el pedido está 100% completado y remisionado
    // No marcar como histórico hasta que todo esté confirmado por finanzas
    const esHistorico = false; // Solo finanzas puede marcar como histórico tras confirmar remisión
    
    // CRÍTICO: Actualizar con montos reales, no solo banderas booleanas
    await client.query(
      `UPDATE pedidos 
       SET tiene_remisiones = TRUE,
           completamente_surtido = $1,
           estatus = $2,
           monto_surtido = $3,
           monto_backorder = $4,
           es_historico = $5
       WHERE pedidoid = $6 AND tenant_id = $7`,
      [completamenteSurtido, nuevoEstatus, nuevoMontoSurtido, montoBackorder, esHistorico, pedido_id, tenant_id]
    );

    // 9. CRÍTICO: NO generar CXC hasta que finanzas confirme
    // El CXC se generará en el endpoint confirmar-finanzas
    // Por ahora solo registramos la remisión en estado PENDIENTE_REVISION
    if (false && emitir_inmediatamente && pedido.es_credito) {
      // Obtener información de crédito del cliente
      const creditoQuery = await client.query(
        `SELECT credito_id, saldo_deudor, limite_credito
         FROM cliente_creditos
         WHERE cliente_id = $1
         FOR UPDATE`,
        [pedido.clienteid]
      );

      if (creditoQuery.rows.length > 0) {
        const creditoInfo = creditoQuery.rows[0];
        const saldoActual = parseFloat(creditoInfo.saldo_deudor || 0);
        const montoRemision = parseFloat(totalRemision);
        
        // NUEVA LÓGICA: El saldo ya incluye la RESERVA del pedido completo.
        // Ahora debemos:
        // 1. Restar la reserva del pedido completo
        // 2. Sumar el cargo real de la remisión
        // Resultado neto: saldo_deudor refleja solo lo que realmente se ha entregado
        
        const saldoSinReserva = parseFloat((saldoActual - montoTotalPedido).toFixed(2));
        const nuevoSaldo = parseFloat((saldoSinReserva + montoRemision).toFixed(2));

        // Actualizar saldo deudor
        await client.query(
          `UPDATE cliente_creditos
           SET saldo_deudor = $1, ultima_actualizacion = NOW()
           WHERE credito_id = $2`,
          [nuevoSaldo, creditoInfo.credito_id]
        );


        // Registrar movimiento de AJUSTE (quitar reserva)
        await client.query(
          `INSERT INTO credito_movimientos (
             credito_id,
             tipo_movimiento,
             monto,
             referencia_id,
             descripcion,
             saldo_despues_movimiento,
             tenant_id
           )
           VALUES ($1, 'AJUSTE', $2, $3, $4, $5, $6)`,
          [
            creditoInfo.credito_id,
            (-montoTotalPedido).toFixed(2),
            `PED-${pedido_id}`,
            `Liberación de reserva del pedido #${pedido_id}`,
            saldoSinReserva.toFixed(2),
            tenant_id
          ]
        );

        // Registrar movimiento de CARGO (cargo real de la remisión)
        await client.query(
          `INSERT INTO credito_movimientos (
             credito_id,
             tipo_movimiento,
             monto,
             referencia_id,
             descripcion,
             saldo_despues_movimiento,
             tenant_id
           )
           VALUES ($1, 'CARGO', $2, $3, $4, $5, $6)`,
          [
            creditoInfo.credito_id,
            montoRemision.toFixed(2),
            `REM-${remision.remision_id}`,
            `Cargo confirmado por remisión ${folio} (Pedido #${pedido_id})`,
            nuevoSaldo.toFixed(2),
            tenant_id
          ]
        );

        // AHORA SÍ: Crear registro en CXC (solo cuando se confirma)
        await client.query(
          `INSERT INTO cuentas_por_cobrar 
           (pedido_id, cliente_id, remision_id, tipo_movimiento, monto, descripcion, tenant_id)
           VALUES ($1, $2, $3, 'CARGO', $4, $5, $6)`,
          [
            pedido_id,
            pedido.clienteid,
            remision.remision_id,
            montoRemision.toFixed(2),
            `Remisión ${folio} - ${pedido.cliente_nombre} ${pedido.cliente_apellido || ''}`.trim(),
            tenant_id
          ]
        );

      }
    }

    // 11. NUEVO: Crear notificación in-app para pedidos de contado
    if (!pedido.es_credito && emitir_inmediatamente) {
      // Para pedidos de pago contra entrega, notificar al agente
      if (pedido.metodo_pago === 'contra_entrega' && pedido.agenteid) {
        await client.query(
          `INSERT INTO notificaciones (
             agente_id,
             tipo,
             titulo,
             mensaje,
             referencia_tipo,
             referencia_id,
             tenant_id
           )
           VALUES ($1, 'ENTREGA_PENDIENTE', $2, $3, 'PEDIDO', $4, $5)`,
          [
            pedido.agenteid,
            '🔔 Nueva entrega pendiente de Pago contra entrega',
            `Tienes una nueva entrega pendiente de Pago contra entrega para el cliente ${pedido.cliente_nombre} ${pedido.cliente_apellido || ''}. Monto: $${totalRemision.toFixed(2)}`,
            pedido_id,
            tenant_id
          ]
        );
      } else {
        // Para otros métodos de pago de contado
        await client.query(
          `INSERT INTO notificaciones (
             cliente_id,
             tipo,
             titulo,
             mensaje,
             referencia_tipo,
             referencia_id,
             tenant_id
           )
           VALUES ($1, 'PAGO_DISPONIBLE', $2, $3, 'PEDIDO', $4, $5)`,
          [
            pedido.clienteid,
            '¡Tu pedido está listo para pago!',
            `Tu pedido #${pedido_id} ya fue surtido. Puedes proceder al pago por el monto de $${totalRemision.toFixed(2)}. Haz clic aquí para pagar.`,
            pedido_id,
            tenant_id
          ]
        );
      }
    }

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: `Remisión ${folio} generada exitosamente`,
      remision: {
        remision_id: remision.remision_id,
        folio: remision.folio,
        fecha_emision: remision.fecha_emision,
        total_remision: totalRemision.toFixed(2),
        estado: remision.estado,
        items_surtidos: itemsValidados.length,
        cxc_generado: emitir_inmediatamente && pedido.es_credito,
        pago_habilitado: !pedido.es_credito
      }
    });

    // 12. NUEVO: Enviar email de notificación para pedidos de contado (async, no bloquea respuesta)
    if (!pedido.es_credito && emitir_inmediatamente && clienteEmail) {
      const { sendTemplatedEmail } = require('../services/emailService');
      const frontendUrl = process.env.FRONTEND_BASE_URL || 'http://localhost:3000';
      
      sendTemplatedEmail(clienteEmail, '¡Tu pedido está listo para pago!', {
        title: '¡Buenas noticias!',
        name: pedido.cliente_nombre || 'Cliente',
        message: `Tu pedido #${pedido_id} ya fue surtido por nuestro equipo de almacén. Ahora puedes proceder al pago por el monto final de $${totalRemision.toFixed(2)}.`,
        buttonText: 'Pagar Ahora',
        buttonUrl: `${frontendUrl}/dashboard?tab=pedidos&pedido=${pedido_id}&action=pagar`,
        additionalInfo: `<strong>Remisión:</strong> ${folio}<br><strong>Monto a pagar:</strong> $${totalRemision.toFixed(2)}<br><strong>Método de pago:</strong> ${pedido.metodo_pago || 'Por definir'}`
      }).catch(err => {
        logger.error('Error enviando email de pago disponible:', {
      error: err.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
      });
    }

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error al generar remisión:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({ 
      success: false,
      message: 'Error al generar remisión'
    });
  } finally {
    client.release();
  }
};

/**
 * GET /api/remisiones/:id
 * Obtiene el detalle completo de una remisión
 */
exports.obtenerRemision = async (req, res) => {
  try {
    const { id } = req.params;
    const { tenant_id } = req.tenant;

    const remisionQuery = await pool.query(
      `SELECT 
        r.*,
        p.pedidoid,
        p.montototal AS total_pedido_original,
        c.clienteid,
        c.nombre AS cliente_nombre,
        c.apellido AS cliente_apellido,
        a.agenteid,
        a.nombre AS agente_nombre
       FROM remisiones r
       INNER JOIN pedidos p ON r.pedido_id = p.pedidoid
       INNER JOIN clientes c ON r.cliente_id = c.clienteid
       LEFT JOIN agentesdeventas a ON r.agente_id = a.agenteid
       WHERE r.remision_id = $1 AND r.tenant_id = $2`,
      [id, tenant_id]
    );

    if (remisionQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Remisión no encontrada' });
    }

    const remision = remisionQuery.rows[0];

    // Obtener detalles
    const detallesQuery = await pool.query(
      `SELECT 
        dr.*,
        pv.sku,
        pv.nombre AS variante_nombre,
        p.nombre AS producto_nombre,
        tp.tamanopaquete,
        COALESCE(dr.ronda_surtido, 1) AS ronda_surtido
       FROM detalles_remision dr
       INNER JOIN producto_variantes pv ON dr.variante_id = pv.varianteid
       INNER JOIN productos p ON pv.productoid = p.productoid
       LEFT JOIN cat_tamanopaquetes tp ON dr.tamano_id = tp.tamanoid
       WHERE dr.remision_id = $1 AND dr.tenant_id = $2
       ORDER BY dr.ronda_surtido, dr.detalle_remision_id`,
      [id, tenant_id]
    );

    remision.detalles = detallesQuery.rows;

    res.json(remision);

  } catch (error) {
    logger.error('Error al obtener remisión:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({ 
      success: false,
      message: 'Error al obtener remisión'
    });
  }
};

/**
 * GET /api/remisiones
 * Lista todas las remisiones con filtros opcionales
 */
exports.listarRemisiones = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;
    const { estado, cliente_id, pedido_id, fecha_desde, fecha_hasta, page = 1, limit = 50 } = req.query;

    let whereConditions = ['r.tenant_id = $1'];
    let params = [tenant_id];
    let paramCount = 1;

    if (estado) {
      paramCount++;
      whereConditions.push(`r.estado = $${paramCount}`);
      params.push(estado);
    }

    if (cliente_id) {
      paramCount++;
      whereConditions.push(`r.cliente_id = $${paramCount}`);
      params.push(cliente_id);
    }

    if (pedido_id) {
      paramCount++;
      whereConditions.push(`r.pedido_id = $${paramCount}`);
      params.push(pedido_id);
    }

    if (fecha_desde) {
      paramCount++;
      whereConditions.push(`r.fecha_emision >= $${paramCount}`);
      params.push(fecha_desde);
    }

    if (fecha_hasta) {
      paramCount++;
      whereConditions.push(`r.fecha_emision <= $${paramCount}`);
      params.push(fecha_hasta);
    }

    const offset = (page - 1) * limit;
    paramCount++;
    params.push(limit);
    const limitParam = paramCount;
    paramCount++;
    params.push(offset);
    const offsetParam = paramCount;

    const query = `
      SELECT 
        r.remision_id,
        r.folio,
        r.fecha_emision,
        r.total_remision,
        r.estado,
        r.pdf_url,
        p.pedidoid,
        c.clienteid,
        c.nombre AS cliente_nombre,
        c.apellido AS cliente_apellido,
        a.nombre AS agente_nombre,
        COUNT(dr.detalle_remision_id) AS total_items
      FROM remisiones r
      INNER JOIN pedidos p ON r.pedido_id = p.pedidoid
      INNER JOIN clientes c ON r.cliente_id = c.clienteid
      LEFT JOIN agentesdeventas a ON r.agente_id = a.agenteid
      LEFT JOIN detalles_remision dr ON r.remision_id = dr.remision_id
      WHERE ${whereConditions.join(' AND ')}
      GROUP BY r.remision_id, r.folio, r.fecha_emision, r.total_remision, r.estado, 
               r.pdf_url, p.pedidoid, c.clienteid, c.nombre, c.apellido, a.nombre
      ORDER BY r.fecha_emision DESC
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `;

    const result = await pool.query(query, params);

    // Contar total
    const countQuery = `
      SELECT COUNT(DISTINCT r.remision_id) AS total
      FROM remisiones r
      WHERE ${whereConditions.join(' AND ')}
    `;
    const countResult = await pool.query(countQuery, params.slice(0, -2));

    res.json({
      remisiones: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit)
      }
    });

  } catch (error) {
    logger.error('Error al listar remisiones:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({ 
      success: false,
      message: 'Error al listar remisiones'
    });
  }
};

/**
 * PUT /api/remisiones/:id/cancelar
 * Cancela una remisión (solo si está en estado BORRADOR o EMITIDA)
 */
exports.cancelarRemision = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const { tenant_id } = req.tenant;
    const { motivo } = req.body;

    await client.query('BEGIN');

    // Verificar que la remisión existe y puede cancelarse
    const remisionQuery = await client.query(
      `SELECT remision_id, pedido_id, estado, folio, tenant_id FROM remisiones 
       WHERE remision_id = $1 AND tenant_id = $2`,
      [id, tenant_id]
    );

    if (remisionQuery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Remisión no encontrada' });
    }

    const remision = remisionQuery.rows[0];

    if (remision.estado === 'CANCELADA') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'La remisión ya está cancelada' });
    }

    if (remision.estado === 'ENTREGADA') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No se puede cancelar una remisión entregada' });
    }

    // Obtener detalles para revertir cantidades
    const detallesQuery = await client.query(
      `SELECT detalle_remision_id, detalle_pedido_id, variante_id, cantidad_paquetes_surtidos, piezas_surtidas, tenant_id FROM detalles_remision 
       WHERE remision_id = $1 AND tenant_id = $2`,
      [id, tenant_id]
    );

    // CRÍTICO: Obtener admin_id para devolver stock al inventario correcto
    const pedidoAdminQuery = await client.query(
      `SELECT agenteid FROM pedidos WHERE pedidoid = $1 AND tenant_id = $2`,
      [remision.pedido_id, tenant_id]
    );
    
    let adminIdStock = 1; // Default admin
    if (pedidoAdminQuery.rows.length > 0 && pedidoAdminQuery.rows[0].agenteid) {
      const agenteQuery = await client.query(
        `SELECT admin_id FROM agentesdeventas WHERE agenteid = $1`,
        [pedidoAdminQuery.rows[0].agenteid]
      );
      if (agenteQuery.rows.length > 0 && agenteQuery.rows[0].admin_id) {
        adminIdStock = agenteQuery.rows[0].admin_id;
      }
    }

    // Revertir cantidades surtidas en detallesdelpedido Y devolver stock
    for (const detalle of detallesQuery.rows) {
      // 1. Revertir cantidad surtida en pedido
      await client.query(
        `UPDATE detallesdelpedido 
         SET cantidad_surtida_remisiones = GREATEST(0, COALESCE(cantidad_surtida_remisiones, 0) - $1)
         WHERE detalleid = $2 AND tenant_id = $3`,
        [detalle.cantidad_paquetes_surtidos, detalle.detalle_pedido_id, tenant_id]
      );

      // 2. DEVOLVER STOCK: Incrementar cantidad física y reservada
      const stockReturnResult = await client.query(
        `UPDATE stock_admin 
         SET cantidad = cantidad + $1,
             cantidad_reservada = cantidad_reservada + $1,
             updated_at = NOW()
         WHERE variante_id = $2 
           AND admin_id = $3 
           AND tenant_id = $4
         RETURNING stockadminid, cantidad, cantidad_reservada`,
        [detalle.piezas_surtidas, detalle.variante_id, adminIdStock, tenant_id]
      );

      if (stockReturnResult.rows.length > 0) {
        const stockInfo = stockReturnResult.rows[0];
        
        // 3. Registrar reversión en log de auditoría
        await client.query(
          `INSERT INTO inventario_reservas_log (
             stockadminid, variante_id, admin_id, pedido_id, detalle_id,
             cantidad_reservada, accion, cantidad_antes, cantidad_despues,
             usuario_id, tenant_id
           )
           VALUES ($1, $2, $3, $4, $5, $6, 'REVERTIR_CANCELACION', $7, $8, $9, $10)`,
          [
            stockInfo.stockadminid,
            detalle.variante_id,
            adminIdStock,
            remision.pedido_id,
            detalle.detalle_pedido_id,
            detalle.piezas_surtidas,
            stockInfo.cantidad_reservada - detalle.piezas_surtidas,
            stockInfo.cantidad_reservada,
            req.user?.id || null,
            tenant_id
          ]
        );
      }

      // 4. REVERTIR MOVIMIENTO EN KARDEX
      try {
        await kardexService.registrarMovimiento({
          varianteId: detalle.variante_id,
          adminId: adminIdStock,
          tenantId: tenant_id,
          tipo: 'ENTRADA',
          cantidad: detalle.piezas_surtidas, // Positivo para entradas
          motivo: 'DEVOLUCION',
          referenciaTipo: 'CANCELACION_REMISION',
          referenciaId: `REM-${id}`,
          observaciones: `Devolución por cancelación de remisión ${remision.folio}. Motivo: ${motivo || 'No especificado'}`,
          ipOrigen: null
        }, client);
      } catch (kardexError) {
        logger.error('Error al revertir movimiento en Kardex', {
          error: kardexError.message,
          remisionId: id,
          varianteId: detalle.variante_id,
          requestId: req.requestId,
          tenantId: req.tenant?.tenant_id
        });
      }
    }

    // Actualizar estado de la remisión
    await client.query(
      `UPDATE remisiones 
       SET estado = 'CANCELADA',
           notas = COALESCE(notas || E'\n\n', '') || 'CANCELADA: ' || $1
       WHERE remision_id = $2 AND tenant_id = $3`,
      [motivo || 'Sin motivo especificado', id, tenant_id]
    );

    // Eliminar movimiento de CXC si existe
    await client.query(
      `DELETE FROM cuentas_por_cobrar 
       WHERE remision_id = $1 AND tenant_id = $2`,
      [id, tenant_id]
    );

    // Recalcular estado del pedido
    const pedidoCompletoQuery = await client.query(
      `SELECT 
        BOOL_AND(dp.cantidadpaquetes <= COALESCE(dp.cantidad_surtida_remisiones, 0)) AS completamente_surtido,
        BOOL_OR(dp.cantidad_surtida_remisiones > 0) AS tiene_remisiones
       FROM detallesdelpedido dp
       WHERE dp.pedidoid = $1 AND dp.tenant_id = $2`,
      [remision.pedido_id, tenant_id]
    );

    const { completamente_surtido, tiene_remisiones } = pedidoCompletoQuery.rows[0];

    await client.query(
      `UPDATE pedidos 
       SET tiene_remisiones = $1,
           completamente_surtido = $2,
           estatus = CASE 
             WHEN $2 = TRUE THEN 'Completado'
             WHEN $1 = TRUE THEN 'Parcial'
             ELSE 'Pendiente'
           END
       WHERE pedidoid = $3 AND tenant_id = $4`,
      [tiene_remisiones, completamente_surtido, remision.pedido_id, tenant_id]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Remisión cancelada exitosamente'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error al cancelar remisión:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({ 
      success: false,
      message: 'Error al cancelar remisión'
    });
  } finally {
    client.release();
  }
};

/**
 * GET /api/remisiones/pedido/:pedido_id/pendiente
 * Obtiene los items del pedido que aún no han sido completamente surtidos
 */
exports.obtenerItemsPendientesSurtir = async (req, res) => {
  try {
    const { pedido_id } = req.params;
    const { tenant_id } = req.tenant;

    const query = await pool.query(
      `SELECT DISTINCT ON (dp.detalleid)
        dp.detalleid,
        dp.varianteid,
        dp.cantidadpaquetes AS cantidad_pedida,
        COALESCE(dp.cantidad_surtida_remisiones, 0) AS cantidad_surtida,
        (dp.cantidadpaquetes - COALESCE(dp.cantidad_surtida_remisiones, 0)) AS cantidad_pendiente,
        dp.precioporpaquete,
        dp.piezastotales,
        dp.preciounitario,
        dp.tamanoid,
        pv.sku,
        pv.nombre AS variante_nombre,
        pv.stock_piezas,
        p.nombre AS producto_nombre,
        tp.tamanopaquete,
        tp.descripcion AS tamano_descripcion
       FROM detallesdelpedido dp
       INNER JOIN producto_variantes pv ON dp.varianteid = pv.varianteid
       INNER JOIN productos p ON pv.productoid = p.productoid
       LEFT JOIN cat_tamanopaquetes tp ON dp.tamanoid = tp.tamanoid AND tp.tenant_id = $2
       WHERE dp.pedidoid = $1 
         AND dp.tenant_id = $2
         AND dp.cantidadpaquetes > COALESCE(dp.cantidad_surtida_remisiones, 0)
       ORDER BY dp.detalleid`,
      [pedido_id, tenant_id]
    );

    res.json({
      pedido_id: parseInt(pedido_id),
      items_pendientes: query.rows
    });

  } catch (error) {
    logger.error('Error al obtener items pendientes:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({ 
      success: false,
      message: 'Error al obtener items pendientes'
    });
  }
};

/**
 * PUT /api/remisiones/:id/corregir
 * Corrige items de una remisión sin cancelarla
 * Permite ajustar cantidades, agregar/quitar items
 */
exports.corregirRemision = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const { tenant_id } = req.tenant;
    const { items_corregir, motivo_correccion } = req.body;
    const userId = req.user?.id || req.user?.userId;

    if (!items_corregir || !Array.isArray(items_corregir) || items_corregir.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere array de items_corregir'
      });
    }

    await client.query('BEGIN');

    // Verificar remisión
    const remisionQuery = await client.query(
      `SELECT remision_id, estado, tenant_id FROM remisiones WHERE remision_id = $1 AND tenant_id = $2 FOR UPDATE`,
      [id, tenant_id]
    );

    if (remisionQuery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Remisión no encontrada' });
    }

    const remision = remisionQuery.rows[0];

    // Permitir corrección en PENDIENTE_REVISION, CONFIRMADA y REVISION_ALMACEN
    // REVISION_ALMACEN es cuando finanzas rechazó y almacén necesita corregir
    if (!['PENDIENTE_REVISION', 'CONFIRMADA', 'REVISION_ALMACEN'].includes(remision.estado)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: `No se puede corregir en estado ${remision.estado}. Estados permitidos: PENDIENTE_REVISION, CONFIRMADA, REVISION_ALMACEN`
      });
    }

    let totalNuevo = 0;
    const cambios = [];

    // Procesar correcciones
    for (const item of items_corregir) {
      const { detalle_remision_id, nueva_cantidad_paquetes } = item;

      const detalleQuery = await client.query(
        `SELECT dr.detalle_remision_id, dr.remision_id, dr.detalle_pedido_id, dr.variante_id, 
                dr.cantidad_paquetes_surtidos, dr.piezas_surtidas, dr.precio_unitario, dr.tamano_id, 
                dr.subtotal, dr.tenant_id, pv.sku, p.nombre as producto_nombre
         FROM detalles_remision dr
         INNER JOIN producto_variantes pv ON dr.variante_id = pv.varianteid
         INNER JOIN productos p ON pv.productoid = p.productoid
         WHERE dr.detalle_remision_id = $1 AND dr.remision_id = $2 AND dr.tenant_id = $3
         FOR UPDATE`,
        [detalle_remision_id, id, tenant_id]
      );

      if (detalleQuery.rows.length === 0) continue;

      const detalle = detalleQuery.rows[0];
      const cantidadAnterior = parseInt(detalle.cantidad_paquetes_surtidos);
      const diferencia = nueva_cantidad_paquetes - cantidadAnterior;

      if (diferencia !== 0) {
        const piezasPorPaquete = Math.floor(detalle.piezas_surtidas / cantidadAnterior);
        const nuevasPiezas = nueva_cantidad_paquetes * piezasPorPaquete;
        const nuevoSubtotal = detalle.precio_unitario * nuevasPiezas;

        // Actualizar detalle
        await client.query(
          `UPDATE detalles_remision
           SET cantidad_paquetes_surtidos = $1,
               piezas_surtidas = $2,
               subtotal = $3
           WHERE detalle_remision_id = $4`,
          [nueva_cantidad_paquetes, nuevasPiezas, nuevoSubtotal, detalle_remision_id]
        );

        totalNuevo += nuevoSubtotal;

        cambios.push({
          sku: detalle.sku,
          producto: detalle.producto_nombre,
          cantidad_anterior: cantidadAnterior,
          cantidad_nueva: nueva_cantidad_paquetes,
          diferencia
        });
      } else {
        totalNuevo += parseFloat(detalle.subtotal);
      }
    }

    // Actualizar total de remisión
    await client.query(
      `UPDATE remisiones
       SET total_remision = $1,
           notas = COALESCE(notas || E'\n\n', '') || 'CORREGIDO: ' || $2
       WHERE remision_id = $3`,
      [totalNuevo.toFixed(2), motivo_correccion || 'Ajuste de cantidades', id]
    );

    // Registrar en historial
    await client.query(
      `INSERT INTO historial_remisiones (
        remision_id, accion, usuario_id, detalles, tenant_id
      ) VALUES ($1, 'CORRECCION', $2, $3, $4)`,
      [id, userId, JSON.stringify({ cambios, motivo: motivo_correccion }), tenant_id]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Remisión corregida exitosamente',
      cambios,
      total_nuevo: totalNuevo.toFixed(2)
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error al corregir remisión:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({ success: false, message: 'Error al corregir remisión' });
  } finally {
    client.release();
  }
};

/**
 * POST /api/remisiones/:id/confirmar-finanzas
 * Confirmación final por finanzas - afecta CxC definitivamente
 * Solo para rol finanzas
 */
exports.confirmarRemisionFinanzas = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const { tenant_id } = req.tenant;
    const userId = req.user?.id || req.user?.userId;

    await client.query('BEGIN');

    // Verificar remisión
    // IMPORTANTE: Usar FOR UPDATE en ambas tablas para serializar confirmaciones concurrentes
    // Esto evita race conditions donde dos remisiones se confirmen simultáneamente
    const remisionQuery = await client.query(
      `SELECT r.remision_id, r.pedido_id, r.cliente_id, r.agente_id, r.folio, r.fecha_emision, 
              r.total_remision, r.estado, r.pdf_url, r.notas, r.tenant_id, r.created_at, r.updated_at, 
              r.fecha_confirmacion_almacen, r.confirmado_por_almacen, r.fecha_emision_final, 
              r.confirmado_por_finanzas, p.pedidoid, p.clienteid, p.es_credito, p.montototal,
              p.primera_remision_confirmada_id
       FROM remisiones r
       INNER JOIN pedidos p ON r.pedido_id = p.pedidoid
       WHERE r.remision_id = $1 AND r.tenant_id = $2
       FOR UPDATE OF r, p`,
      [id, tenant_id]
    );

    if (remisionQuery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Remisión no encontrada' });
    }

    const remision = remisionQuery.rows[0];

    // BUG FIX 2: Validar estado antes de confirmar
    // Solo permitir confirmación desde PENDIENTE_CONFIRMACION_FINANZAS
    // PENDIENTE_REVISION debe ser corregido por almacén primero
    if (remision.estado !== 'PENDIENTE_CONFIRMACION_FINANZAS') {
      await client.query('ROLLBACK');
      
      // Mensaje más específico para doble confirmación
      let mensaje = `No se puede confirmar finanzas. Estado actual: ${remision.estado}. Se requiere PENDIENTE_CONFIRMACION_FINANZAS`;
      if (remision.estado === 'SURTIDO') {
        mensaje = `Remisión ${remision.folio} ya fue confirmada por finanzas. No se puede confirmar dos veces.`;
      }
      
      return res.status(400).json({
        success: false,
        error: mensaje,
        estado_actual: remision.estado,
        estado_requerido: 'PENDIENTE_CONFIRMACION_FINANZAS',
        remision_folio: remision.folio
      });
    }

    // Obtener detalles de la remisión para descontar stock
    const detallesQuery = await client.query(
      `SELECT dr.detalle_remision_id, dr.remision_id, dr.detalle_pedido_id, dr.variante_id, 
              dr.cantidad_paquetes_surtidos, dr.piezas_surtidas, dr.precio_unitario, dr.tamano_id, 
              dr.subtotal, dr.tenant_id, pv.sku
       FROM detalles_remision dr
       INNER JOIN producto_variantes pv ON dr.variante_id = pv.varianteid
       WHERE dr.remision_id = $1 AND dr.tenant_id = $2`,
      [id, tenant_id]
    );

    // Obtener admin_id del pedido para descontar del inventario correcto
    const adminQuery = await client.query(
      `SELECT agenteid FROM pedidos WHERE pedidoid = $1 AND tenant_id = $2`,
      [remision.pedidoid, tenant_id]
    );
    
    let adminIdStock = 1;
    if (adminQuery.rows.length > 0 && adminQuery.rows[0].agenteid) {
      const agenteQuery = await client.query(
        `SELECT admin_id FROM agentesdeventas WHERE agenteid = $1`,
        [adminQuery.rows[0].agenteid]
      );
      if (agenteQuery.rows.length > 0 && agenteQuery.rows[0].admin_id) {
        adminIdStock = agenteQuery.rows[0].admin_id;
      }
    }

    // AHORA SÍ: Descontar stock y registrar en Kardex para cada item surtido
    const itemsConError = [];
    
    for (const detalle of detallesQuery.rows) {
      // Descontar stock físico y liberar reserva
      const stockUpdateResult = await client.query(
        `UPDATE stock_admin 
         SET cantidad = GREATEST(0, cantidad - $1),
             cantidad_reservada = GREATEST(0, cantidad_reservada - $1),
             updated_at = NOW()
         WHERE variante_id = $2 
           AND admin_id = $3 
           AND tenant_id = $4
         RETURNING stockadminid, cantidad, cantidad_reservada`,
        [detalle.piezas_surtidas, detalle.variante_id, adminIdStock, tenant_id]
      );

      if (stockUpdateResult.rows.length === 0) {
        // No se encontró el registro de stock - error crítico
        itemsConError.push({
          sku: detalle.sku,
          variante_id: detalle.variante_id,
          error: 'No se encontró registro de stock'
        });
        continue;
      }

      if (stockUpdateResult.rows.length > 0) {
        const stockInfo = stockUpdateResult.rows[0];
        
        // Registrar en log de auditoría
        await client.query(
          `INSERT INTO inventario_reservas_log (
             stockadminid, variante_id, admin_id, pedido_id, detalle_id,
             cantidad_reservada, accion, cantidad_antes, cantidad_despues,
             usuario_id, tenant_id
           )
           VALUES ($1, $2, $3, $4, $5, $6, 'CONFIRMAR_FINANZAS', $7, $8, $9, $10)`,
          [
            stockInfo.stockadminid,
            detalle.variante_id,
            adminIdStock,
            remision.pedidoid,
            detalle.detalle_pedido_id,
            detalle.piezas_surtidas,
            stockInfo.cantidad_reservada + detalle.piezas_surtidas,
            stockInfo.cantidad_reservada,
            userId,
            tenant_id
          ]
        );
      }

      // Registrar movimiento en Kardex
      try {
        await kardexService.registrarMovimiento({
          varianteId: detalle.variante_id,
          adminId: adminIdStock,
          tenantId: tenant_id,
          tipo: 'SALIDA',
          cantidad: -detalle.piezas_surtidas,
          motivo: 'VENTA',
          referenciaTipo: 'REMISION',
          referenciaId: `REM-${id}`,
          observaciones: `Confirmado por finanzas. Remisión ${remision.folio}. Pedido #${remision.pedidoid}`,
          ipOrigen: null
        }, client);
      } catch (kardexError) {
        logger.error('Error al registrar movimiento en Kardex', {
          error: kardexError.message,
          varianteId: detalle.variante_id,
          requestId: req.requestId,
          tenantId: req.tenant?.tenant_id
        });
        itemsConError.push({
          sku: detalle.sku,
          variante_id: detalle.variante_id,
          error: 'Error en Kardex: ' + kardexError.message
        });
      }
    }

    // Validar que no hubo errores críticos en el descuento de stock
    if (itemsConError.length > 0) {
      await client.query('ROLLBACK');
      logger.error('Error al descontar stock en confirmación de finanzas', {
        remisionId: id,
        itemsConError,
        requestId: req.requestId,
        tenantId: req.tenant?.tenant_id
      });
      return res.status(500).json({
        success: false,
        message: 'Error al descontar stock. No se pudo confirmar la remisión.',
        errors: itemsConError
      });
    }

    // Actualizar estado a SURTIDO (no EMITIDA)
    await client.query(
      `UPDATE remisiones
       SET estado = 'SURTIDO',
           fecha_emision_final = NOW(),
           confirmado_por_finanzas = $1
       WHERE remision_id = $2`,
      [userId, id]
    );

    // AHORA SÍ: Generar movimiento en CXC si es crédito
    // ⚠️ PROTECCIÓN DE LÓGICA FINANCIERA PARA SURTIDO PARCIAL:
    // - Se libera la RESERVA del pedido completo (montototal) SOLO EN LA PRIMERA REMISIÓN
    // - Se genera CARGO solo por lo realmente surtido (total_remision) EN CADA REMISIÓN
    // - Si es surtido parcial, el resto queda pendiente para futuras entregas
    // - Esto permite entregas parciales sin cobrar de más al cliente
    
    // CRITICAL: Determinar si es la primera remisión confirmada
    // Esto se usa en la lógica de crédito AND para actualizar el pedido
    let isPrimeraRemision = false;
    
    if (remision.es_credito) {
      const creditoQuery = await client.query(
        `SELECT credito_id, saldo_deudor, limite_credito
         FROM cliente_creditos
         WHERE cliente_id = $1
         FOR UPDATE`,
        [remision.clienteid]
      );

      if (creditoQuery.rows.length > 0) {
        const creditoInfo = creditoQuery.rows[0];
        const saldoActual = parseFloat(creditoInfo.saldo_deudor || 0);
        const montoRemision = parseFloat(remision.total_remision);
        
        // CRITICAL FIX: Usar campo primera_remision_confirmada_id en lugar de consultar previas
        // Esto evita race conditions: si dos remisiones se confirman simultáneamente,
        // PostreSQL asegura que solo UNA actualizará el campo (gracias a FOR UPDATE)
        let isPrimeraRemision = false;
        
        if (remision.primera_remision_confirmada_id === null) {
          // El campo es NULL → ESTA es la primera remisión confirmada
          isPrimeraRemision = true;
          
          logger.info('🔒 [REMISIÓN] Primera remisión detectada', {
            remision_id: id,
            pedido_id: remision.pedidoid,
            folio: remision.folio,
            monto_liberacion: remision.montototal,
            requestId: req.requestId,
            tenantId: tenant_id
          });
        } else if (remision.primera_remision_confirmada_id === parseInt(id)) {
          // El campo apunta a ESTA remisión → ya fue marcada como primera (estado anterior)
          // Esto NO debería ocurrir en flujo normal (remisión no se confirma dos veces)
          isPrimeraRemision = true;
          
          logger.warn('⚠️ [REMISIÓN] Re-confirmación de primera remisión detectada', {
            remision_id: id,
            pedido_id: remision.pedidoid,
            requestId: req.requestId,
            tenantId: tenant_id
          });
        } else {
          // El campo apunta a OTRA remisión → ESTA es una remisión adicional
          isPrimeraRemision = false;
          
          logger.info('➕ [REMISIÓN] Remisión adicional detectada', {
            remision_id: id,
            pedido_id: remision.pedidoid,
            primera_remision_id: remision.primera_remision_confirmada_id,
            folio: remision.folio,
            requestId: req.requestId,
            tenantId: tenant_id
          });
        }
        
        let nuevoSaldo = saldoActual;
        
        if (isPrimeraRemision) {
          // Primera remisión: Liberar reserva del pedido completo y sumar cargo real
          const saldoSinReserva = parseFloat((saldoActual - remision.montototal).toFixed(2));
          nuevoSaldo = parseFloat((saldoSinReserva + montoRemision).toFixed(2));

          await client.query(
            `UPDATE cliente_creditos
             SET saldo_deudor = $1, ultima_actualizacion = NOW()
             WHERE credito_id = $2`,
            [nuevoSaldo, creditoInfo.credito_id]
          );

          // Registrar AJUSTE (quitar reserva) - SOLO EN PRIMERA REMISIÓN
          await client.query(
            `INSERT INTO credito_movimientos (
               credito_id, tipo_movimiento, monto, referencia_id, 
               descripcion, saldo_despues_movimiento, tenant_id
             )
             VALUES ($1, 'AJUSTE', $2, $3, $4, $5, $6)`,
            [
              creditoInfo.credito_id,
              (-remision.montototal).toFixed(2),
              `PED-${remision.pedidoid}`,
              `Liberación de reserva del pedido #${remision.pedidoid} (Primera remisión)`,
              saldoSinReserva.toFixed(2),
              tenant_id
            ]
          );

          // Registrar CARGO (cargo real de la primera remisión)
          await client.query(
            `INSERT INTO credito_movimientos (
               credito_id, tipo_movimiento, monto, referencia_id,
               descripcion, saldo_despues_movimiento, tenant_id
             )
             VALUES ($1, 'CARGO', $2, $3, $4, $5, $6)`,
            [
              creditoInfo.credito_id,
              montoRemision.toFixed(2),
              `REM-${id}`,
              `Cargo confirmado por remisión ${remision.folio} (Pedido #${remision.pedidoid} - Primera remisión)`,
              nuevoSaldo.toFixed(2),
              tenant_id
            ]
          );
        } else {
          // Remisiones subsecuentes: SOLO sumar cargo, NO liberar reserva
          nuevoSaldo = parseFloat((saldoActual + montoRemision).toFixed(2));

          await client.query(
            `UPDATE cliente_creditos
             SET saldo_deudor = $1, ultima_actualizacion = NOW()
             WHERE credito_id = $2`,
            [nuevoSaldo, creditoInfo.credito_id]
          );

          // Registrar CARGO (cargo real) - SIN AJUSTE DE RESERVA
          await client.query(
            `INSERT INTO credito_movimientos (
               credito_id, tipo_movimiento, monto, referencia_id,
               descripcion, saldo_despues_movimiento, tenant_id
             )
             VALUES ($1, 'CARGO', $2, $3, $4, $5, $6)`,
            [
              creditoInfo.credito_id,
              montoRemision.toFixed(2),
              `REM-${id}`,
              `Cargo confirmado por remisión ${remision.folio} (Pedido #${remision.pedidoid} - Remisión adicional)`,
              nuevoSaldo.toFixed(2),
              tenant_id
            ]
          );
        }

        // Crear registro en CXC (siempre, en todas las remisiones)
        // 🔒 CRÍTICO: Verificar que NO exista ya un CXC para esta remisión (evita doble inserción)
        const cxcExistenteQuery = await client.query(
          `SELECT cxc_id FROM cuentas_por_cobrar 
           WHERE remision_id = $1 AND pedido_id = $2 AND tenant_id = $3`,
          [id, remision.pedidoid, tenant_id]
        );
        
        if (cxcExistenteQuery.rows.length === 0) {
          // No existe CXC previo → crear uno nuevo
          await client.query(
            `INSERT INTO cuentas_por_cobrar 
             (pedido_id, cliente_id, remision_id, tipo_movimiento, monto, descripcion, tenant_id)
             VALUES ($1, $2, $3, 'CARGO', $4, $5, $6)`,
            [
              remision.pedidoid,
              remision.clienteid,
              id,
              montoRemision.toFixed(2),
              `Remisión ${remision.folio}`,
              tenant_id
            ]
          );
          
          logger.info('✅ [CXC] Registro creado en cuentas_por_cobrar', {
            remision_id: id,
            remision_folio: remision.folio,
            pedido_id: remision.pedidoid,
            monto: montoRemision.toFixed(2),
            requestId: req.requestId,
            tenantId: tenant_id
          });
        } else {
          logger.warn('⚠️ [CXC] CXC ya existe para esta remisión - no se duplica', {
            remision_id: id,
            remision_folio: remision.folio,
            pedido_id: remision.pedidoid,
            cxc_id: cxcExistenteQuery.rows[0].cxc_id,
            requestId: req.requestId,
            tenantId: tenant_id
          });
        }
        
        // 🔒 CRITICAL: Registrar en auditoría de liberación de reservas
        try {
          await client.query(
            `INSERT INTO auditoria_liberacion_reservas 
             (pedido_id, remision_id, primera_remision_confirmada, monto_liberado, usuario_id, tenant_id, observaciones)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              remision.pedidoid,
              id,
              isPrimeraRemision,
              isPrimeraRemision ? remision.montototal : 0,
              userId,
              tenant_id,
              `Confirmación de remisión ${remision.folio}. Estado primera: ${isPrimeraRemision}`
            ]
          );
        } catch (auditError) {
          logger.warn('⚠️ [AUDITORÍA] Error al registrar en auditoria_liberacion_reservas', {
            error: auditError.message,
            remision_id: id,
            pedido_id: remision.pedidoid,
            requestId: req.requestId
          });
          // No fallar por esto - es solo auditoría
        }
      } else {
        // Pedido de contado (no es crédito)
        // Aún así, necesitamos marcar la primera remisión para auditoría
        if (remision.primera_remision_confirmada_id === null) {
          isPrimeraRemision = true;
          logger.info('🔒 [REMISIÓN] Primera remisión de pedido contado', {
            remision_id: id,
            pedido_id: remision.pedidoid,
            folio: remision.folio,
            requestId: req.requestId,
            tenantId: tenant_id
          });
        } else {
          isPrimeraRemision = false;
          logger.info('➕ [REMISIÓN] Remisión adicional de pedido contado', {
            remision_id: id,
            pedido_id: remision.pedidoid,
            folio: remision.folio,
            requestId: req.requestId,
            tenantId: tenant_id
          });
        }
        
        // Registrar auditoría para pedidos contado también
        try {
          await client.query(
            `INSERT INTO auditoria_liberacion_reservas 
             (pedido_id, remision_id, primera_remision_confirmada, monto_liberado, usuario_id, tenant_id, observaciones)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              remision.pedidoid,
              id,
              isPrimeraRemision,
              0,
              userId,
              tenant_id,
              `Confirmación de remisión ${remision.folio} (pedido contado). Estado primera: ${isPrimeraRemision}`
            ]
          );
        } catch (auditError) {
          logger.warn('⚠️ [AUDITORÍA] Error al registrar auditoría para pedido contado', {
            error: auditError.message,
            remision_id: id,
            pedido_id: remision.pedidoid,
            requestId: req.requestId
          });
        }
      }
    }
    
    // 🔒 CRITICAL: Actualizar pedidos con primera_remision_confirmada_id SOLO si es la primera
    // Esto debe hacerse FUERA del bloque de crédito ya que aplica a TODOS los pedidos (crédito o contado)
    if (isPrimeraRemision && remision.primera_remision_confirmada_id === null) {
      const updatePedidoResult = await client.query(
        `UPDATE pedidos
         SET primera_remision_confirmada_id = $1,
             ultima_actualizacion = NOW()
         WHERE pedidoid = $2 AND tenant_id = $3 AND primera_remision_confirmada_id IS NULL
         RETURNING pedidoid, primera_remision_confirmada_id`,
        [id, remision.pedidoid, tenant_id]
      );
      
      if (updatePedidoResult.rows.length > 0) {
        logger.info('✅ [REMISIÓN] primera_remision_confirmada_id actualizado exitosamente', {
          remision_id: id,
          pedido_id: remision.pedidoid,
          folio: remision.folio,
          requestId: req.requestId,
          tenantId: tenant_id
        });
      } else {
        logger.warn('⚠️ [REMISIÓN] No se lograron actualizar primera_remision_confirmada_id', {
          remision_id: id,
          pedido_id: remision.pedidoid,
          razon: 'Primera remisión ya había sido asignada (race condition detectada)',
          requestId: req.requestId,
          tenantId: tenant_id
        });
      }
    }

    // Registrar en historial
    await client.query(
      `INSERT INTO historial_remisiones (
        remision_id, accion, usuario_id, detalles, tenant_id
      ) VALUES ($1, 'CONFIRMACION_FINANZAS', $2, $3, $4)`,
      [
        id,
        userId,
        JSON.stringify({
          cxc_generado: remision.es_credito,
          monto: remision.total_remision,
          timestamp: new Date().toISOString()
        }),
        tenant_id
      ]
    );

    // FIX 3: Actualizar es_historico del pedido si está 100% completado
    // Verificar si todos los productos del pedido han sido completamente remisionados
    const verificacionQuery = await client.query(
      `SELECT 
        COALESCE(SUM(dp.cantidadpaquetes), 0) as total_pedido,
        COALESCE(SUM(COALESCE(dp.cantidad_surtida_remisiones, 0)), 0) as total_remisionado
       FROM detallesdelpedido dp
       WHERE dp.pedidoid = $1 AND dp.tenant_id = $2`,
      [remision.pedidoid, tenant_id]
    );

    const totalPedido = parseFloat(verificacionQuery.rows[0].total_pedido || 0);
    const totalRemisionado = parseFloat(verificacionQuery.rows[0].total_remisionado || 0);
    const pedidoCompletado = totalPedido > 0 && Math.abs(totalPedido - totalRemisionado) < 0.01;

    if (pedidoCompletado) {
      await client.query(
        `UPDATE pedidos 
         SET es_historico = TRUE,
             estatus = 'Completado'
         WHERE pedidoid = $1 AND tenant_id = $2`,
        [remision.pedidoid, tenant_id]
      );

      logger.info('Pedido marcado como histórico tras completar última remisión:', {
        pedidoId: remision.pedidoid,
        remisionId: id,
        totalPedido,
        totalRemisionado
      });
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Remisión confirmada por finanzas. Stock descontado y CxC generado',
      remision: {
        remision_id: parseInt(id),
        estado: 'SURTIDO',
        cxc_generado: remision.es_credito,
        items_procesados: detallesQuery.rows.length
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error al confirmar remisión por finanzas:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({ success: false, message: 'Error al confirmar remisión' });
  } finally {
    client.release();
  }
};

/**
 * POST /api/remisiones/:id/confirmar-almacen
 * Confirma una remisión después de verificación física por personal de inventarios
 * Solo para rol inventarios
 */
exports.confirmarRemisionAlmacen = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const { tenant_id } = req.tenant;
    const { notas_almacen, discrepancias } = req.body;
    const userId = req.user?.id || req.user?.userId;

    await client.query('BEGIN');

    // Verificar que la remisión existe y está en estado correcto
    const remisionQuery = await client.query(
      `SELECT r.remision_id, r.pedido_id, r.cliente_id, r.agente_id, r.folio, r.fecha_emision, 
              r.total_remision, r.estado, r.pdf_url, r.notas, r.tenant_id, r.created_at, r.updated_at, 
              r.fecha_confirmacion_almacen, r.confirmado_por_almacen, r.fecha_emision_final, 
              r.confirmado_por_finanzas, r.observaciones_finanzas, p.pedidoid, p.clienteid
       FROM remisiones r
       INNER JOIN pedidos p ON r.pedido_id = p.pedidoid
       WHERE r.remision_id = $1 AND r.tenant_id = $2
       FOR UPDATE`,
      [id, tenant_id]
    );

    if (remisionQuery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        success: false,
        error: 'Remisión no encontrada' 
      });
    }

    const remision = remisionQuery.rows[0];

    // 🔒 VALIDACIÓN CRÍTICA: Bloquear doble confirmación por inventarios
    // Si la remisión ya está en PENDIENTE_CONFIRMACION_FINANZAS, fue confirmada por almacén
    // Inventarios NO puede volver a confirmar
    if (remision.estado === 'PENDIENTE_CONFIRMACION_FINANZAS') {
      await client.query('ROLLBACK');
      logger.warn('⚠️ [DOBLE CONFIRMACIÓN] Intento de re-confirmar remisión', {
        remision_id: id,
        remision_folio: remision.folio,
        remision_estado: remision.estado,
        usuario_id: userId,
        requestId: req.requestId,
        tenantId: tenant_id
      });
      return res.status(409).json({ 
        success: false,
        error: `Remisión ${remision.folio} ya fue confirmada por almacén. Está en espera de confirmación por finanzas. No se puede confirmar dos veces.`,
        estado_actual: remision.estado,
        detalles: {
          remision_id: id,
          folio: remision.folio,
          razon: 'Ya fue confirmada', 
          siguiente_paso: 'Finanzas debe confirmar esta remisión'
        }
      });
    }

    if (!['PENDIENTE_REVISION', 'REVISION_ALMACEN'].includes(remision.estado)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false,
        error: `No se puede confirmar. Estado actual: ${remision.estado}. Se requiere estado PENDIENTE_REVISION o REVISION_ALMACEN` 
      });
    }

    // Actualizar estado a PENDIENTE_CONFIRMACION_FINANZAS (no CONFIRMADA)
    // El almacenista marca como listo, pero finanzas debe confirmar antes de afectar stock/CxC
    const notasCompletas = remision.estado === 'REVISION_ALMACEN' 
      ? `CORREGIDO Y REENVIADO: ${notas_almacen || 'Sin observaciones'}. Observaciones previas de finanzas: ${remision.observaciones_finanzas || 'N/A'}`
      : `CONFIRMADO POR ALMACÉN: ${notas_almacen || 'Sin observaciones'}`;
    
    await client.query(
      `UPDATE remisiones 
       SET estado = 'PENDIENTE_CONFIRMACION_FINANZAS',
           notas = COALESCE(notas || E'\n\n', '') || $1,
           fecha_confirmacion_almacen = NOW(),
           confirmado_por_almacen = $2,
           observaciones_finanzas = NULL
       WHERE remision_id = $3 AND tenant_id = $4`,
      [notasCompletas, userId, id, tenant_id]
    );

    // 🔒 CRITICAL: Actualizar estado del pedido para que aparezca en tabla de finanzas
    // Cuando inventarios confirma una remisión, el pedido debe cambiar a "Pendiente de Confirmación"
    // para que finanzas lo vea y lo procese
    const montoTotalPedidoQuery = await client.query(
      `SELECT montototal, monto_surtido
       FROM pedidos
       WHERE pedidoid = $1 AND tenant_id = $2`,
      [remision.pedido_id, tenant_id]
    );

    if (montoTotalPedidoQuery.rows.length > 0) {
      const pedidoInfo = montoTotalPedidoQuery.rows[0];
      const montoTotalPedido = parseFloat(pedidoInfo.montototal || 0);
      const montoSurtidoAnterior = parseFloat(pedidoInfo.monto_surtido || 0);
      
      // Calcular nuevo monto surtido (se suma el de esta remisión)
      const nuevoMontoSurtido = parseFloat((montoSurtidoAnterior + remision.total_remision).toFixed(2));
      
      // Calcular monto backorder (pendiente)
      const montoBackorder = parseFloat((montoTotalPedido - nuevoMontoSurtido).toFixed(2));
      
      // Determinar si está completamente surtido
      const completamenteSurtido = Math.abs(nuevoMontoSurtido - montoTotalPedido) < 0.01;

      // ACTUALIZAR ESTADO DEL PEDIDO
      // Siempre cambiar a "Pendiente de Confirmación" cuando hay una remisión confirmada
      const nuevoEstatus = 'Pendiente de Confirmación';
      const esHistorico = completamenteSurtido; // Solo si está 100% surtido

      await client.query(
        `UPDATE pedidos 
         SET tiene_remisiones = TRUE,
             completamente_surtido = $1,
             estatus = $2,
             monto_surtido = $3,
             monto_backorder = $4,
             es_historico = $5
         WHERE pedidoid = $6 AND tenant_id = $7`,
        [completamenteSurtido, nuevoEstatus, nuevoMontoSurtido, montoBackorder, esHistorico, remision.pedido_id, tenant_id]
      );

      logger.info('✅ [PEDIDO] Estado actualizado al confirmar remisión por almacén', {
        pedido_id: remision.pedido_id,
        remision_id: id,
        remision_folio: remision.folio,
        nuevo_estado: nuevoEstatus,
        completamente_surtido: completamenteSurtido,
        monto_total_pedido: montoTotalPedido,
        monto_surtido_anterior: montoSurtidoAnterior,
        monto_remision: remision.total_remision,
        nuevo_monto_surtido: nuevoMontoSurtido,
        monto_backorder: montoBackorder,
        es_historico: esHistorico,
        requestId: req.requestId,
        tenantId: tenant_id
      });
    } else {
      logger.error('❌ [PEDIDO] No se encontró pedido para actualizar', {
        pedido_id: remision.pedido_id,
        remision_id: id,
        requestId: req.requestId,
        tenantId: tenant_id
      });
    }

    // Registrar en historial
    await client.query(
      `INSERT INTO historial_remisiones (
        remision_id, accion, usuario_id, detalles, tenant_id
      ) VALUES ($1, 'CONFIRMACION_ALMACEN', $2, $3, $4)`,
      [
        id,
        userId,
        JSON.stringify({
          notas: notas_almacen,
          discrepancias: discrepancias || [],
          timestamp: new Date().toISOString()
        }),
        tenant_id
      ]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Remisión enviada a finanzas para confirmación final',
      remision: {
        remision_id: parseInt(id),
        estado: 'PENDIENTE_CONFIRMACION_FINANZAS',
        notas_almacen
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error al confirmar remisión por almacén:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({ 
      success: false,
      message: 'Error al confirmar remisión'
    });
  } finally {
    client.release();
  }
};

/**
 * POST /api/remisiones/:id/rechazar-finanzas
 * Rechaza una remisión y la regresa al almacenista para corrección
 * Solo para rol finanzas
 */
exports.rechazarRemisionFinanzas = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const { tenant_id } = req.tenant;
    const { observaciones_finanzas } = req.body;
    const userId = req.user?.id || req.user?.userId;

    if (!observaciones_finanzas || observaciones_finanzas.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Se requieren observaciones para rechazar la remisión'
      });
    }

    await client.query('BEGIN');

    // Verificar remisión
    const remisionQuery = await client.query(
      `SELECT r.remision_id, r.pedido_id, r.cliente_id, r.agente_id, r.folio, r.fecha_emision, 
              r.total_remision, r.estado, r.pdf_url, r.notas, r.tenant_id, r.created_at, r.updated_at, 
              r.fecha_confirmacion_almacen, r.confirmado_por_almacen, r.fecha_emision_final, 
              r.confirmado_por_finanzas, p.pedidoid
       FROM remisiones r
       INNER JOIN pedidos p ON r.pedido_id = p.pedidoid
       WHERE r.remision_id = $1 AND r.tenant_id = $2
       FOR UPDATE`,
      [id, tenant_id]
    );

    if (remisionQuery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Remisión no encontrada' });
    }

    const remision = remisionQuery.rows[0];

    if (remision.estado !== 'PENDIENTE_CONFIRMACION_FINANZAS') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: `No se puede rechazar. Estado actual: ${remision.estado}. Se requiere PENDIENTE_CONFIRMACION_FINANZAS`
      });
    }

    // Cambiar estado a REVISION_ALMACEN para que el almacenista pueda corregir
    await client.query(
      `UPDATE remisiones
       SET estado = 'REVISION_ALMACEN',
           observaciones_finanzas = $1,
           rechazado_por_finanzas = $2,
           fecha_rechazo_finanzas = NOW()
       WHERE remision_id = $3`,
      [observaciones_finanzas, userId, id]
    );

    // Registrar en historial
    await client.query(
      `INSERT INTO historial_remisiones (
        remision_id, accion, usuario_id, detalles, tenant_id
      ) VALUES ($1, 'RECHAZO_FINANZAS', $2, $3, $4)`,
      [
        id,
        userId,
        JSON.stringify({
          observaciones: observaciones_finanzas,
          timestamp: new Date().toISOString()
        }),
        tenant_id
      ]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Remisión regresada al almacén para corrección',
      remision: {
        remision_id: parseInt(id),
        estado: 'REVISION_ALMACEN',
        observaciones_finanzas
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error al rechazar remisión por finanzas:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({ success: false, message: 'Error al rechazar remisión' });
  } finally {
    client.release();
  }
};

module.exports = exports;
