const pool = require('../db');

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

    // 1. Validar que el pedido existe y pertenece al tenant
    const pedidoQuery = await client.query(
      `SELECT p.*, c.nombre AS cliente_nombre, c.apellido AS cliente_apellido
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

    // 2. Obtener detalles del pedido con información completa
    const detallesQuery = await client.query(
      `SELECT 
        dp.*,
        pv.sku,
        pv.nombre AS variante_nombre,
        p.nombre AS producto_nombre,
        tp.tamanopaquete,
        COALESCE(dp.cantidad_surtida_remisiones, 0) AS ya_surtido
       FROM detallesdelpedido dp
       INNER JOIN producto_variantes pv ON dp.varianteid = pv.varianteid
       INNER JOIN productos p ON pv.productoid = p.productoid
       LEFT JOIN cat_tamanopaquetes tp ON dp.tamanoid = tp.tamanoid
       WHERE dp.pedidoid = $1 AND dp.tenant_id = $2`,
      [pedido_id, tenant_id]
    );

    if (detallesQuery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'El pedido no tiene detalles' });
    }

    const detallesPedido = detallesQuery.rows;

    // 3. Validar que los items a surtir son válidos y hay stock disponible
    const itemsValidados = [];
    let totalRemision = 0;

    for (const item of items_a_surtir) {
      const detalle = detallesPedido.find(d => d.detalleid === item.detalle_pedido_id);
      
      if (!detalle) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: `Detalle de pedido ${item.detalle_pedido_id} no encontrado en este pedido` 
        });
      }

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

    // 4. Generar folio único
    const folioResult = await client.query(
      'SELECT generar_folio_remision($1) AS folio',
      [tenant_id]
    );
    const folio = folioResult.rows[0].folio;

    // 5. Insertar remisión
    const estadoInicial = emitir_inmediatamente ? 'EMITIDA' : 'BORRADOR';
    
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
      await client.query(
        `INSERT INTO detalles_remision 
         (remision_id, detalle_pedido_id, variante_id, cantidad_paquetes_surtidos, 
          piezas_surtidas, precio_unitario, tamano_id, subtotal, tenant_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          remision.remision_id,
          item.detalle_pedido_id,
          item.variante_id,
          item.cantidad_paquetes,
          item.piezas_surtidas,
          item.precio_unitario,
          item.tamano_id,
          item.subtotal,
          tenant_id
        ]
      );

      // 7. Actualizar cantidad surtida en detallesdelpedido
      await client.query(
        `UPDATE detallesdelpedido 
         SET cantidad_surtida_remisiones = COALESCE(cantidad_surtida_remisiones, 0) + $1
         WHERE detalleid = $2 AND tenant_id = $3`,
        [item.cantidad_paquetes, item.detalle_pedido_id, tenant_id]
      );
    }

    // 8. Actualizar estado del pedido
    const pedidoCompletoQuery = await client.query(
      `SELECT 
        BOOL_AND(dp.cantidadpaquetes <= COALESCE(dp.cantidad_surtida_remisiones, 0)) AS completamente_surtido
       FROM detallesdelpedido dp
       WHERE dp.pedidoid = $1 AND dp.tenant_id = $2`,
      [pedido_id, tenant_id]
    );

    const completamenteSurtido = pedidoCompletoQuery.rows[0].completamente_surtido;

    await client.query(
      `UPDATE pedidos 
       SET tiene_remisiones = TRUE,
           completamente_surtido = $1,
           estatus = CASE 
             WHEN $1 = TRUE THEN 'Completado'
             ELSE 'Parcial'
           END
       WHERE pedidoid = $2 AND tenant_id = $3`,
      [completamenteSurtido, pedido_id, tenant_id]
    );

    // 9. CRÍTICO: Generar movimiento en CXC solo si la remisión se emite y el cliente es de crédito
    if (emitir_inmediatamente && pedido.es_credito) {
      await client.query(
        `INSERT INTO cuentas_por_cobrar 
         (pedido_id, cliente_id, remision_id, tipo_movimiento, monto, descripcion, tenant_id)
         VALUES ($1, $2, $3, 'CARGO', $4, $5, $6)`,
        [
          pedido_id,
          pedido.clienteid,
          remision.remision_id,
          totalRemision.toFixed(2),
          `Remisión ${folio} - ${pedido.cliente_nombre} ${pedido.cliente_apellido || ''}`.trim(),
          tenant_id
        ]
      );

      // 10. NUEVO: Aplicar cargo real al saldo de crédito del cliente
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
        const nuevoSaldo = parseFloat((saldoActual + totalRemision).toFixed(2));

        // Actualizar saldo deudor
        await client.query(
          `UPDATE cliente_creditos
           SET saldo_deudor = $1, ultima_actualizacion = NOW()
           WHERE credito_id = $2`,
          [nuevoSaldo, creditoInfo.credito_id]
        );

        // Registrar movimiento de crédito
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
            totalRemision.toFixed(2),
            `REM-${remision.remision_id}`,
            `Cargo por remisión ${folio} (Pedido #${pedido_id})`,
            nuevoSaldo.toFixed(2),
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
        cxc_generado: emitir_inmediatamente && pedido.es_credito
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al generar remisión:', error);
    res.status(500).json({ 
      error: 'Error al generar remisión',
      detalle: error.message 
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
        c.razonsocial AS cliente_razon_social,
        c.rfc AS cliente_rfc,
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
        tp.tamanopaquete
       FROM detalles_remision dr
       INNER JOIN producto_variantes pv ON dr.variante_id = pv.varianteid
       INNER JOIN productos p ON pv.productoid = p.productoid
       LEFT JOIN cat_tamanopaquetes tp ON dr.tamano_id = tp.tamanoid
       WHERE dr.remision_id = $1 AND dr.tenant_id = $2
       ORDER BY dr.detalle_remision_id`,
      [id, tenant_id]
    );

    remision.detalles = detallesQuery.rows;

    res.json(remision);

  } catch (error) {
    console.error('Error al obtener remisión:', error);
    res.status(500).json({ 
      error: 'Error al obtener remisión',
      detalle: error.message 
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
        c.razonsocial AS cliente_razon_social,
        c.rfc AS cliente_rfc,
        a.nombre AS agente_nombre,
        COUNT(dr.detalle_remision_id) AS total_items
      FROM remisiones r
      INNER JOIN pedidos p ON r.pedido_id = p.pedidoid
      INNER JOIN clientes c ON r.cliente_id = c.clienteid
      LEFT JOIN agentesdeventas a ON r.agente_id = a.agenteid
      LEFT JOIN detalles_remision dr ON r.remision_id = dr.remision_id
      WHERE ${whereConditions.join(' AND ')}
      GROUP BY r.remision_id, r.folio, r.fecha_emision, r.total_remision, r.estado, 
               r.pdf_url, p.pedidoid, c.clienteid, c.nombre, c.apellido, c.razonsocial, c.rfc, a.nombre
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
    console.error('Error al listar remisiones:', error);
    res.status(500).json({ 
      error: 'Error al listar remisiones',
      detalle: error.message 
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
      `SELECT * FROM remisiones 
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
      `SELECT * FROM detalles_remision 
       WHERE remision_id = $1 AND tenant_id = $2`,
      [id, tenant_id]
    );

    // Revertir cantidades surtidas en detallesdelpedido
    for (const detalle of detallesQuery.rows) {
      await client.query(
        `UPDATE detallesdelpedido 
         SET cantidad_surtida_remisiones = GREATEST(0, COALESCE(cantidad_surtida_remisiones, 0) - $1)
         WHERE detalleid = $2 AND tenant_id = $3`,
        [detalle.cantidad_paquetes_surtidos, detalle.detalle_pedido_id, tenant_id]
      );
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
    console.error('Error al cancelar remisión:', error);
    res.status(500).json({ 
      error: 'Error al cancelar remisión',
      detalle: error.message 
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
      `SELECT 
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
       LEFT JOIN cat_tamanopaquetes tp ON dp.tamanoid = tp.tamanoid
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
    console.error('Error al obtener items pendientes:', error);
    res.status(500).json({ 
      error: 'Error al obtener items pendientes',
      detalle: error.message 
    });
  }
};

module.exports = exports;
