const db = require("../db");
const logger = require('../utils/logger');
const { sendTemplatedEmail } = require("../services/emailService");
const SmartStockService = require("../services/SmartStockService");

/**
 * =====================================================
 * CONTROLADOR DE DEVOLUCIONES (RMA SYSTEM)
 * =====================================================
 * 
 * Gestiona el ciclo completo de devoluciones:
 * 1. Solicitud del cliente (con validación de 30 días)
 * 2. Revisión y aprobación/rechazo del admin
 * 3. Procesamiento automático de:
 *    - Reintegro de inventario (stock vendible o mermas)
 *    - Ajustes financieros (CXC, saldo a favor)
 *    - Actualización de estado del pedido
 */

// =====================================================
// CLIENTE: SOLICITAR DEVOLUCIÓN
// =====================================================

/**
 * POST /api/cliente/devoluciones
 * Crea una nueva solicitud de devolución
 */
async function solicitarDevolucion(req, res) {
  const client = await db.getClient();
  
  try {
    const { userId: clienteId, tenant_id } = req.user;
    const { pedido_id, items, notas_cliente } = req.body;

    // VALIDACIÓN 1: Verificar que el pedido existe y pertenece al cliente
    const pedidoQuery = await client.query(
      `SELECT p.pedidoid, p.clienteid, p.fechapedido, p.montototal, p.es_credito, p.pagado,
              p.estatus, p.monto_surtido,
              c.nombre, c.apellido, c.email
       FROM pedidos p
       INNER JOIN clientes c ON c.clienteid = p.clienteid
       WHERE p.pedidoid = $1 AND p.clienteid = $2 AND p.tenant_id = $3`,
      [pedido_id, clienteId, tenant_id]
    );

    if (pedidoQuery.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Pedido no encontrado o no pertenece a tu cuenta' 
      });
    }

    const pedido = pedidoQuery.rows[0];

    // VALIDACIÓN 2: Regla de los 30 días
    const fechaPedido = new Date(pedido.fechapedido);
    const fechaActual = new Date();
    const diasTranscurridos = Math.floor((fechaActual - fechaPedido) / (1000 * 60 * 60 * 24));

    if (diasTranscurridos > 30) {
      return res.status(403).json({ 
        error: 'El plazo para solicitar devolución ha expirado',
        detalle: `Han transcurrido ${diasTranscurridos} días desde la compra (máximo 30 días)`,
        fecha_pedido: fechaPedido.toISOString().split('T')[0]
      });
    }

    // VALIDACIÓN 3: El pedido debe estar entregado o completado
    const estatusPermitidos = ['Completado', 'Entregado', 'Parcial'];
    if (!estatusPermitidos.includes(pedido.estatus)) {
      return res.status(400).json({ 
        error: 'Solo puedes devolver pedidos que ya han sido entregados',
        estatus_actual: pedido.estatus
      });
    }

    // VALIDACIÓN 4: Verificar que los items existen en el pedido
    if (!items || items.length === 0) {
      return res.status(400).json({ 
        error: 'Debes especificar al menos un producto a devolver' 
      });
    }

    await client.query('BEGIN');

    // PASO 1: Crear registro de devolución
    const devolucionInsert = await client.query(
      `INSERT INTO devoluciones 
       (pedido_id, cliente_id, estado, notas_cliente, tenant_id)
       VALUES ($1, $2, 'PENDIENTE', $3, $4)
       RETURNING devolucion_id, fecha_solicitud`,
      [pedido_id, clienteId, notas_cliente || null, tenant_id]
    );

    const devolucionId = devolucionInsert.rows[0].devolucion_id;
    const itemsValidados = [];

    // PASO 2: Validar y registrar cada item
    for (const item of items) {
      const { detalle_pedido_id, cantidad_paquetes, motivo, condicion_producto } = item;

      // Validar campos requeridos
      if (!detalle_pedido_id || !cantidad_paquetes || !motivo || !condicion_producto) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: 'Cada item debe tener: detalle_pedido_id, cantidad_paquetes, motivo y condicion_producto' 
        });
      }

      // Obtener información del detalle del pedido
      const detalleQuery = await client.query(
        `SELECT d.detalleid, d.varianteid, d.cantidadpaquetes, d.piezastotales, 
                d.precioporpaquete, d.tamanoid, d.preciounitario,
                pv.sku, p.nombre as producto_nombre,
                t.valor as piezas_por_paquete
         FROM detallesdelpedido d
         INNER JOIN producto_variantes pv ON pv.varianteid = d.varianteid
         INNER JOIN productos p ON p.productoid = pv.productoid
         LEFT JOIN cat_tamanopaquetes t ON t.tamanoid = d.tamanoid
         WHERE d.detalleid = $1 AND d.pedidoid = $2 AND d.tenant_id = $3`,
        [detalle_pedido_id, pedido_id, tenant_id]
      );

      if (detalleQuery.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ 
          error: `El item ${detalle_pedido_id} no pertenece a este pedido` 
        });
      }

      const detalle = detalleQuery.rows[0];

      // VALIDACIÓN: Cantidad no puede exceder lo comprado
      const cantidadComprada = parseInt(detalle.cantidadpaquetes, 10);
      const cantidadSolicitada = parseInt(cantidad_paquetes, 10);

      // Verificar cantidad ya devuelta previamente
      const devueltaQuery = await client.query(
        `SELECT COALESCE(SUM(dd.cantidad_paquetes), 0) as cantidad_devuelta
         FROM devoluciones_detalles dd
         INNER JOIN devoluciones d ON d.devolucion_id = dd.devolucion_id
         WHERE dd.detalle_pedido_id = $1 
           AND d.estado IN ('PENDIENTE', 'EN_REVISION', 'APROBADA')
           AND d.tenant_id = $2`,
        [detalle_pedido_id, tenant_id]
      );

      const cantidadYaDevuelta = parseInt(devueltaQuery.rows[0].cantidad_devuelta, 10);
      const cantidadDisponible = cantidadComprada - cantidadYaDevuelta;

      if (cantidadSolicitada > cantidadDisponible) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: `No puedes devolver ${cantidadSolicitada} paquetes del producto "${detalle.producto_nombre}"`,
          detalle: `Compraste ${cantidadComprada}, ya devolviste ${cantidadYaDevuelta}, disponible: ${cantidadDisponible}`,
          sku: detalle.sku
        });
      }

      // Calcular piezas totales y subtotal
      const piezasPorPaquete = parseInt(detalle.piezas_por_paquete || 1, 10);
      const piezasTotales = cantidadSolicitada * piezasPorPaquete;
      const precioUnitario = parseFloat(detalle.preciounitario || 0);
      const subtotal = parseFloat((precioUnitario * piezasTotales).toFixed(2));

      // Insertar detalle de devolución
      await client.query(
        `INSERT INTO devoluciones_detalles 
         (devolucion_id, detalle_pedido_id, variante_id, cantidad_paquetes, piezas_totales,
          motivo, condicion_producto, precio_unitario, tamano_id, subtotal, tenant_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          devolucionId, detalle_pedido_id, detalle.varianteid, cantidadSolicitada, piezasTotales,
          motivo, condicion_producto, precioUnitario, detalle.tamanoid, subtotal, tenant_id
        ]
      );

      itemsValidados.push({
        sku: detalle.sku,
        producto: detalle.producto_nombre,
        cantidad_paquetes: cantidadSolicitada,
        piezas_totales: piezasTotales,
        subtotal: subtotal
      });
    }

    await client.query('COMMIT');

    // Obtener monto total calculado automáticamente por el trigger
    const devolucionFinal = await db.query(
      `SELECT devolucion_id, monto_total, fecha_solicitud, estado
       FROM devoluciones
       WHERE devolucion_id = $1`,
      [devolucionId]
    );

    // Enviar email de confirmación al cliente
    try {
      await sendTemplatedEmail({
        to: pedido.email,
        subject: `Solicitud de Devolución Recibida - Pedido #${pedido_id}`,
        templateName: 'devolucion-solicitada',
        templateData: {
          nombre_cliente: `${pedido.nombre} ${pedido.apellido}`,
          numero_devolucion: devolucionId,
          numero_pedido: pedido_id,
          monto_devolucion: devolucionFinal.rows[0].monto_total,
          items: itemsValidados,
          dias_restantes: 30 - diasTranscurridos
        }
      });
    } catch (emailError) {
      logger.error('Error al enviar email de confirmación:', {
      error: emailError.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    }

    res.status(201).json({
      message: 'Solicitud de devolución creada exitosamente',
      devolucion: {
        devolucion_id: devolucionId,
        pedido_id: pedido_id,
        monto_total: devolucionFinal.rows[0].monto_total,
        estado: 'PENDIENTE',
        fecha_solicitud: devolucionFinal.rows[0].fecha_solicitud,
        items: itemsValidados
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error al solicitar devolución:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({ 
      success: false,
      message: 'Error al procesar la solicitud de devolución'
    });
  } finally {
    client.release();
  }
}

// =====================================================
// CLIENTE: SUBIR EVIDENCIAS
// =====================================================

/**
 * POST /api/cliente/devoluciones/:id/evidencias
 * Sube fotos/documentos como evidencia de la devolución
 */
async function subirEvidencia(req, res) {
  try {
    const { userId: clienteId, tenant_id } = req.user;
    const { id: devolucionId } = req.params;
    const { url_imagen, descripcion, tipo_archivo } = req.body;

    // Validar que la devolución existe y pertenece al cliente
    const devolucionQuery = await db.query(
      `SELECT d.devolucion_id, d.estado, d.cliente_id
       FROM devoluciones d
       WHERE d.devolucion_id = $1 AND d.cliente_id = $2 AND d.tenant_id = $3`,
      [devolucionId, clienteId, tenant_id]
    );

    if (devolucionQuery.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Devolución no encontrada o no pertenece a tu cuenta' 
      });
    }

    const devolucion = devolucionQuery.rows[0];

    // Solo se pueden subir evidencias si está PENDIENTE o EN_REVISION
    if (!['PENDIENTE', 'EN_REVISION'].includes(devolucion.estado)) {
      return res.status(400).json({ 
        error: 'No puedes agregar evidencias a una devolución ya procesada',
        estado_actual: devolucion.estado
      });
    }

    // Insertar evidencia
    const evidenciaInsert = await db.query(
      `INSERT INTO evidencias_devolucion 
       (devolucion_id, url_imagen, descripcion, tipo_archivo, tenant_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING evidencia_id, fecha_subida`,
      [devolucionId, url_imagen, descripcion || null, tipo_archivo || 'jpg', tenant_id]
    );

    res.status(201).json({
      message: 'Evidencia subida exitosamente',
      evidencia: evidenciaInsert.rows[0]
    });

  } catch (error) {
    logger.error('Error al subir evidencia:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({ 
      success: false,
      message: 'Error al subir la evidencia'
    });
  }
}

// =====================================================
// CLIENTE: LISTAR MIS DEVOLUCIONES
// =====================================================

/**
 * GET /api/cliente/devoluciones
 * Obtiene todas las devoluciones del cliente
 */
async function obtenerMisDevoluciones(req, res) {
  try {
    const { userId: clienteId, tenant_id } = req.user;

    const devolucionesQuery = await db.query(
      `SELECT 
         d.devolucion_id,
         d.pedido_id,
         d.fecha_solicitud,
         d.estado,
         d.monto_total,
         d.notas_cliente,
         d.notas_admin,
         d.motivo_rechazo,
         d.fecha_resolucion,
         COUNT(DISTINCT dd.detalle_devolucion_id) as total_items,
         COUNT(DISTINCT e.evidencia_id) as total_evidencias
       FROM devoluciones d
       LEFT JOIN devoluciones_detalles dd ON dd.devolucion_id = d.devolucion_id
       LEFT JOIN evidencias_devolucion e ON e.devolucion_id = d.devolucion_id
       WHERE d.cliente_id = $1 AND d.tenant_id = $2
       GROUP BY d.devolucion_id
       ORDER BY d.fecha_solicitud DESC`,
      [clienteId, tenant_id]
    );

    res.json({
      devoluciones: devolucionesQuery.rows
    });

  } catch (error) {
    logger.error('Error al obtener devoluciones:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({ 
      success: false,
      message: 'Error al obtener las devoluciones'
    });
  }
}

// =====================================================
// CLIENTE: DETALLE DE DEVOLUCIÓN
// =====================================================

/**
 * GET /api/cliente/devoluciones/:id
 * Obtiene el detalle completo de una devolución
 */
async function obtenerDetalleDevolucion(req, res) {
  try {
    const { userId: clienteId, tenant_id } = req.user;
    const { id: devolucionId } = req.params;

    // Información principal
    const devolucionQuery = await db.query(
      `SELECT 
         d.devolucion_id,
         d.pedido_id,
         d.fecha_solicitud,
         d.estado,
         d.monto_total,
         d.notas_cliente,
         d.notas_admin,
         d.motivo_rechazo,
         d.fecha_resolucion,
         d.admin_resolutor_id,
         CONCAT(a.nombre, ' ', a.apellido) as admin_resolutor
       FROM devoluciones d
       LEFT JOIN administradores a ON a.adminid = d.admin_resolutor_id
       WHERE d.devolucion_id = $1 AND d.cliente_id = $2 AND d.tenant_id = $3`,
      [devolucionId, clienteId, tenant_id]
    );

    if (devolucionQuery.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Devolución no encontrada' 
      });
    }

    // Items devueltos
    const itemsQuery = await db.query(
      `SELECT 
         dd.detalle_devolucion_id,
         dd.cantidad_paquetes,
         dd.piezas_totales,
         dd.motivo,
         dd.condicion_producto,
         dd.subtotal,
         pv.sku,
         p.nombre as producto_nombre,
         p.imagen_url,
         t.etiqueta as tamano_etiqueta
       FROM devoluciones_detalles dd
       INNER JOIN producto_variantes pv ON pv.varianteid = dd.variante_id
       INNER JOIN productos p ON p.productoid = pv.productoid
       LEFT JOIN cat_tamanopaquetes t ON t.tamanoid = dd.tamano_id
       WHERE dd.devolucion_id = $1 AND dd.tenant_id = $2
       ORDER BY dd.detalle_devolucion_id`,
      [devolucionId, tenant_id]
    );

    // Evidencias
    const evidenciasQuery = await db.query(
      `SELECT evidencia_id, url_imagen, descripcion, tipo_archivo, fecha_subida
       FROM evidencias_devolucion
       WHERE devolucion_id = $1 AND tenant_id = $2
       ORDER BY fecha_subida DESC`,
      [devolucionId, tenant_id]
    );

    res.json({
      devolucion: devolucionQuery.rows[0],
      items: itemsQuery.rows,
      evidencias: evidenciasQuery.rows
    });

  } catch (error) {
    logger.error('Error al obtener detalle de devolución:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({ 
      success: false,
      message: 'Error al obtener el detalle'
    });
  }
}

// =====================================================
// ADMIN: LISTAR TODAS LAS DEVOLUCIONES
// =====================================================

/**
 * GET /api/admin/devoluciones
 * Obtiene todas las devoluciones (con filtros opcionales)
 */
async function obtenerTodasDevoluciones(req, res) {
  try {
    const { tenant_id } = req.tenant;
    const { estado, fecha_desde, fecha_hasta, cliente_id } = req.query;

    let whereConditions = ['d.tenant_id = $1'];
    let queryParams = [tenant_id];
    let paramCounter = 2;

    if (estado) {
      whereConditions.push(`d.estado = $${paramCounter}`);
      queryParams.push(estado);
      paramCounter++;
    }

    if (fecha_desde) {
      whereConditions.push(`d.fecha_solicitud >= $${paramCounter}`);
      queryParams.push(fecha_desde);
      paramCounter++;
    }

    if (fecha_hasta) {
      whereConditions.push(`d.fecha_solicitud <= $${paramCounter}`);
      queryParams.push(fecha_hasta);
      paramCounter++;
    }

    if (cliente_id) {
      whereConditions.push(`d.cliente_id = $${paramCounter}`);
      queryParams.push(cliente_id);
      paramCounter++;
    }

    const whereClause = whereConditions.join(' AND ');

    const devolucionesQuery = await db.query(
      `SELECT 
         d.devolucion_id,
         d.pedido_id,
         d.cliente_id,
         CONCAT(c.nombre, ' ', c.apellido) as cliente_nombre,
         c.email as cliente_email,
         d.fecha_solicitud,
         d.estado,
         d.monto_total,
         d.fecha_resolucion,
         COUNT(DISTINCT dd.detalle_devolucion_id) as total_items,
         COUNT(DISTINCT e.evidencia_id) as total_evidencias,
         CONCAT(a.nombre, ' ', a.apellido) as admin_resolutor
       FROM devoluciones d
       INNER JOIN clientes c ON c.clienteid = d.cliente_id
       LEFT JOIN devoluciones_detalles dd ON dd.devolucion_id = d.devolucion_id
       LEFT JOIN evidencias_devolucion e ON e.devolucion_id = d.devolucion_id
       LEFT JOIN administradores a ON a.adminid = d.admin_resolutor_id
       WHERE ${whereClause}
       GROUP BY d.devolucion_id, c.nombre, c.apellido, c.email, a.nombre, a.apellido
       ORDER BY 
         CASE d.estado
           WHEN 'PENDIENTE' THEN 1
           WHEN 'EN_REVISION' THEN 2
           WHEN 'APROBADA' THEN 3
           WHEN 'RECHAZADA' THEN 4
           WHEN 'CANCELADA' THEN 5
         END,
         d.fecha_solicitud DESC`,
      queryParams
    );

    // Estadísticas
    const statsQuery = await db.query(
      `SELECT 
         COUNT(*) FILTER (WHERE estado = 'PENDIENTE') as pendientes,
         COUNT(*) FILTER (WHERE estado = 'EN_REVISION') as en_revision,
         COUNT(*) FILTER (WHERE estado = 'APROBADA') as aprobadas,
         COUNT(*) FILTER (WHERE estado = 'RECHAZADA') as rechazadas,
         COALESCE(SUM(monto_total) FILTER (WHERE estado = 'APROBADA'), 0) as monto_total_aprobado
       FROM devoluciones
       WHERE tenant_id = $1`,
      [tenant_id]
    );

    res.json({
      devoluciones: devolucionesQuery.rows,
      estadisticas: statsQuery.rows[0]
    });

  } catch (error) {
    logger.error('Error al obtener devoluciones (admin):', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({ 
      success: false,
      message: 'Error al obtener las devoluciones'
    });
  }
}

// =====================================================
// ADMIN: APROBAR DEVOLUCIÓN (TRANSACCIÓN ATÓMICA)
// =====================================================

/**
 * POST /api/admin/devoluciones/:id/aprobar
 * Aprueba una devolución y ejecuta todas las acciones financieras/inventario
 */
async function aprobarDevolucion(req, res) {
  const client = await db.getClient();
  
  try {
    const { userId: adminId, tenant_id } = req.user;
    const { id: devolucionId } = req.params;
    const { notas_admin } = req.body;

    await client.query('BEGIN');

    // PASO 1: Obtener información de la devolución
    const devolucionQuery = await client.query(
      `SELECT d.*, p.es_credito, p.pagado, p.montototal, p.admin_responsable_id,
              c.nombre as cliente_nombre, c.apellido as cliente_apellido, c.email as cliente_email
       FROM devoluciones d
       INNER JOIN pedidos p ON p.pedidoid = d.pedido_id
       INNER JOIN clientes c ON c.clienteid = d.cliente_id
       WHERE d.devolucion_id = $1 AND d.tenant_id = $2
       FOR UPDATE`,
      [devolucionId, tenant_id]
    );

    if (devolucionQuery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Devolución no encontrada' });
    }

    const devolucion = devolucionQuery.rows[0];

    // Validar que esté PENDIENTE o EN_REVISION
    if (!['PENDIENTE', 'EN_REVISION'].includes(devolucion.estado)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: 'Solo se pueden aprobar devoluciones pendientes o en revisión',
        estado_actual: devolucion.estado
      });
    }

    // PASO 2: Obtener detalles de los items
    const itemsQuery = await client.query(
      `SELECT dd.*, pv.sku, p.nombre as producto_nombre
       FROM devoluciones_detalles dd
       INNER JOIN producto_variantes pv ON pv.varianteid = dd.variante_id
       INNER JOIN productos p ON p.productoid = pv.productoid
       WHERE dd.devolucion_id = $1 AND dd.tenant_id = $2`,
      [devolucionId, tenant_id]
    );

    const items = itemsQuery.rows;
    const adminResponsable = devolucion.admin_responsable_id || adminId;


    // PASO 3: PROCESAR INVENTARIO
    for (const item of items) {
      const { variante_id, piezas_totales, condicion_producto, sku, producto_nombre, detalle_pedido_id } = item;

      // ============================================
      // HARD-RESERVE: Verificar si hay reserva activa para este item
      // ============================================
      // Las devoluciones pueden ocurrir DESPUÉS de que se generó la remisión,
      // por lo que la reserva ya fue liberada en ese momento.
      // Solo necesitamos verificar si hay reserva residual por algún error.
      // ⚠️ CRÍTICO: Filtrar solo por admin responsable, no sumar todos los admins
      const reservaCheck = await client.query(
        `SELECT COALESCE(SUM(cantidad_reservada), 0) as reserva_total
         FROM stock_admin
         WHERE variante_id = $1 AND admin_id = $2 AND tenant_id = $3 AND cantidad_reservada > 0`,
        [variante_id, adminResponsable, tenant_id]
      );

      const reservaActiva = parseInt(reservaCheck.rows[0]?.reserva_total || 0, 10);
      
      if (reservaActiva > 0) {
        
        // Liberar reserva residual del admin responsable (no debería ocurrir en flujo normal)
        await client.query(
          `UPDATE stock_admin
           SET cantidad_reservada = GREATEST(0, cantidad_reservada - $1),
               updated_at = NOW()
           WHERE variante_id = $2
             AND admin_id = $3
             AND tenant_id = $4
             AND cantidad_reservada > 0`,
          [Math.min(piezas_totales, reservaActiva), variante_id, adminResponsable, tenant_id]
        );
      }

      if (condicion_producto === 'SELLADO') {
        // Producto en buen estado: Regresar a stock vendible
        
        const ajusteResult = await SmartStockService.adjustStock({
          varianteId: variante_id,
          cantidad: piezas_totales,
          userId: adminResponsable,
          userRole: ['admin'],
          tenantId: tenant_id,
          motivo: `Devolución aprobada #${devolucionId}`,
          client: client
        });

        if (!ajusteResult.success) {
          logger.error('   ❌ Error al reintegrar stock: ${ajusteResult.message}', {
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
        }
      } else {
        // Producto dañado/abierto: Registrar como merma
        
        await client.query(
          `INSERT INTO inventario_mermas 
           (variante_id, admin_id, cantidad, motivo, devolucion_id, notas, tenant_id)
           VALUES ($1, $2, $3, 'DEVOLUCION', $4, $5, $6)`,
          [
            variante_id, 
            adminResponsable, 
            piezas_totales, 
            devolucionId,
            `Producto devuelto en condición: ${condicion_producto} - ${producto_nombre}`,
            tenant_id
          ]
        );
      }
    }

    // PASO 4: PROCESAR FINANZAS
    const montoDevolucion = parseFloat(devolucion.monto_total);

    if (devolucion.es_credito) {
      // CASO A: Pedido a crédito - Generar Nota de Crédito
      
      await client.query(
        `INSERT INTO cuentas_por_cobrar 
         (pedido_id, cliente_id, tipo_movimiento, monto, descripcion, tenant_id)
         VALUES ($1, $2, 'ABONO', $3, $4, $5)`,
        [
          devolucion.pedido_id,
          devolucion.cliente_id,
          montoDevolucion,
          `Nota de Crédito - Devolución #${devolucionId}`,
          tenant_id
        ]
      );

      // Actualizar saldo deudor del cliente
      await client.query(
        `UPDATE cliente_creditos
         SET saldo_deudor = GREATEST(saldo_deudor - $1, 0),
             ultima_actualizacion = CURRENT_TIMESTAMP
         WHERE cliente_id = $2`,
        [montoDevolucion, devolucion.cliente_id]
      );

      // Registrar movimiento de crédito
      const creditoQuery = await client.query(
        `SELECT credito_id, saldo_deudor FROM cliente_creditos WHERE cliente_id = $1`,
        [devolucion.cliente_id]
      );

      if (creditoQuery.rows.length > 0) {
        const nuevoSaldo = parseFloat(creditoQuery.rows[0].saldo_deudor);
        await client.query(
          `INSERT INTO credito_movimientos 
           (credito_id, tipo_movimiento, monto, referencia_id, descripcion, 
            saldo_despues_movimiento, admin_id, tenant_id)
           VALUES ($1, 'ABONO', $2, $3, $4, $5, $6, $7)`,
          [
            creditoQuery.rows[0].credito_id,
            montoDevolucion,
            `DEV-${devolucionId}`,
            `Devolución aprobada #${devolucionId}`,
            nuevoSaldo,
            adminId,
            tenant_id
          ]
        );
      }

    } else if (devolucion.pagado) {
      // CASO B: Pedido pagado - Crear Saldo a Favor
      
      // Verificar si ya tiene saldo a favor
      const saldoQuery = await client.query(
        `SELECT saldo_id, saldo_disponible FROM cliente_saldo_favor 
         WHERE cliente_id = $1 AND tenant_id = $2`,
        [devolucion.cliente_id, tenant_id]
      );

      let saldoAnterior = 0;
      if (saldoQuery.rows.length > 0) {
        saldoAnterior = parseFloat(saldoQuery.rows[0].saldo_disponible);
        
        // Actualizar saldo existente
        await client.query(
          `UPDATE cliente_saldo_favor
           SET saldo_disponible = saldo_disponible + $1,
               ultima_actualizacion = CURRENT_TIMESTAMP
           WHERE cliente_id = $2 AND tenant_id = $3`,
          [montoDevolucion, devolucion.cliente_id, tenant_id]
        );
      } else {
        // Crear nuevo saldo
        await client.query(
          `INSERT INTO cliente_saldo_favor (cliente_id, saldo_disponible, tenant_id)
           VALUES ($1, $2, $3)`,
          [devolucion.cliente_id, montoDevolucion, tenant_id]
        );
      }

      const nuevoSaldo = saldoAnterior + montoDevolucion;

      // Registrar movimiento
      await client.query(
        `INSERT INTO cliente_saldo_favor_movimientos 
         (cliente_id, tipo_movimiento, monto, saldo_anterior, saldo_nuevo, 
          devolucion_id, descripcion, tenant_id)
         VALUES ($1, 'ABONO', $2, $3, $4, $5, $6, $7)`,
        [
          devolucion.cliente_id,
          montoDevolucion,
          saldoAnterior,
          nuevoSaldo,
          devolucionId,
          `Saldo a favor por devolución aprobada #${devolucionId}`,
          tenant_id
        ]
      );

    } else {
      // CASO C: Pedido pendiente de pago - Ajustar montos del pedido
      
      await client.query(
        `UPDATE pedidos
         SET monto_surtido = GREATEST(monto_surtido - $1, 0),
             monto_backorder = GREATEST(monto_backorder + $1, 0)
         WHERE pedidoid = $2 AND tenant_id = $3`,
        [montoDevolucion, devolucion.pedido_id, tenant_id]
      );
    }

    // PASO 5: Actualizar estado de la devolución
    await client.query(
      `UPDATE devoluciones
       SET estado = 'APROBADA',
           admin_resolutor_id = $1,
           notas_admin = $2,
           fecha_resolucion = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE devolucion_id = $3 AND tenant_id = $4`,
      [adminId, notas_admin || null, devolucionId, tenant_id]
    );

    // PASO 6: Actualizar estado del pedido
    await client.query(
      `UPDATE pedidos
       SET estatus = CASE 
         WHEN estatus = 'Completado' THEN 'Devolución Parcial'
         ELSE estatus
       END
       WHERE pedidoid = $1 AND tenant_id = $2`,
      [devolucion.pedido_id, tenant_id]
    );

    await client.query('COMMIT');


    // Enviar email al cliente
    try {
      await sendTemplatedEmail({
        to: devolucion.cliente_email,
        subject: `Devolución Aprobada - #${devolucionId}`,
        templateName: 'devolucion-aprobada',
        templateData: {
          nombre_cliente: `${devolucion.cliente_nombre} ${devolucion.cliente_apellido}`,
          numero_devolucion: devolucionId,
          monto_devolucion: montoDevolucion,
          tipo_reembolso: devolucion.es_credito ? 'Nota de Crédito' : (devolucion.pagado ? 'Saldo a Favor' : 'Ajuste de Pedido'),
          notas_admin: notas_admin
        }
      });
    } catch (emailError) {
      logger.error('Error al enviar email de aprobación:', {
      error: emailError.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    }

    res.json({
      message: 'Devolución aprobada exitosamente',
      devolucion_id: devolucionId,
      monto_procesado: montoDevolucion,
      items_procesados: items.length
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('❌ [RMA] Error al aprobar devolución:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({ 
      success: false,
      message: 'Error al aprobar la devolución'
    });
  } finally {
    client.release();
  }
}

// =====================================================
// ADMIN: RECHAZAR DEVOLUCIÓN
// =====================================================

/**
 * POST /api/admin/devoluciones/:id/rechazar
 * Rechaza una devolución con motivo
 */
async function rechazarDevolucion(req, res) {
  const client = await db.getClient();
  
  try {
    const { userId: adminId, tenant_id } = req.user;
    const { id: devolucionId } = req.params;
    const { motivo_rechazo, notas_admin } = req.body;

    if (!motivo_rechazo) {
      return res.status(400).json({ 
        error: 'Debes proporcionar un motivo de rechazo' 
      });
    }

    await client.query('BEGIN');

    // Obtener información de la devolución
    const devolucionQuery = await client.query(
      `SELECT d.*, c.nombre as cliente_nombre, c.apellido as cliente_apellido, c.email as cliente_email
       FROM devoluciones d
       INNER JOIN clientes c ON c.clienteid = d.cliente_id
       WHERE d.devolucion_id = $1 AND d.tenant_id = $2
       FOR UPDATE`,
      [devolucionId, tenant_id]
    );

    if (devolucionQuery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Devolución no encontrada' });
    }

    const devolucion = devolucionQuery.rows[0];

    if (!['PENDIENTE', 'EN_REVISION'].includes(devolucion.estado)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: 'Solo se pueden rechazar devoluciones pendientes o en revisión',
        estado_actual: devolucion.estado
      });
    }

    // Actualizar estado
    await client.query(
      `UPDATE devoluciones
       SET estado = 'RECHAZADA',
           admin_resolutor_id = $1,
           motivo_rechazo = $2,
           notas_admin = $3,
           fecha_resolucion = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE devolucion_id = $4 AND tenant_id = $5`,
      [adminId, motivo_rechazo, notas_admin || null, devolucionId, tenant_id]
    );

    await client.query('COMMIT');


    // Enviar email al cliente
    try {
      await sendTemplatedEmail({
        to: devolucion.cliente_email,
        subject: `Devolución Rechazada - #${devolucionId}`,
        templateName: 'devolucion-rechazada',
        templateData: {
          nombre_cliente: `${devolucion.cliente_nombre} ${devolucion.cliente_apellido}`,
          numero_devolucion: devolucionId,
          motivo_rechazo: motivo_rechazo,
          notas_admin: notas_admin
        }
      });
    } catch (emailError) {
      logger.error('Error al enviar email de rechazo:', {
      error: emailError.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    }

    res.json({
      message: 'Devolución rechazada',
      devolucion_id: devolucionId,
      motivo: motivo_rechazo
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error al rechazar devolución:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({ 
      success: false,
      message: 'Error al rechazar la devolución'
    });
  } finally {
    client.release();
  }
}

// =====================================================
// EXPORTAR FUNCIONES
// =====================================================

module.exports = {
  // Cliente
  solicitarDevolucion,
  subirEvidencia,
  obtenerMisDevoluciones,
  obtenerDetalleDevolucion,
  
  // Admin
  obtenerTodasDevoluciones,
  aprobarDevolucion,
  rechazarDevolucion
};
