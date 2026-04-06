/**
 * PEDIDOS ADMIN CONTROLLER
 * 
 * Controlador especializado para operaciones de pedidos.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/pedidosAdminController
 * @author RazoConnect Team
 * @date 2026-02-26
 */

const db = require('../db');
const logger = require('../utils/logger');
const inventoryService = require('../services/inventoryService');
const { getPaginationParams, buildPaginationMeta } = require('../utils/pagination');
const { updatePedidoStatus, calcularEstadoPedidoCorrect } = require('../utils/pedidoStatus');
const { ESTADOS_PEDIDO, normalizarEstado } = require('../utils/pedidoEstados');

/**
 * @swagger
 * /api/admin/pedidos:
 *   get:
 *     summary: Obtener todos los pedidos
 *     description: Retorna lista paginada de pedidos con validación de integridad financiera
 *     tags: [Admin - Pedidos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: estatus
 *         schema:
 *           type: string
 *           enum: [Pendiente, Aprobado, Surtido, Parcialmente Surtido, Cancelado, Entregado]
 *         description: Filtrar por estatus del pedido
 *       - in: query
 *         name: clienteId
 *         schema:
 *           type: integer
 *         description: Filtrar por ID de cliente
 *       - in: query
 *         name: agenteId
 *         schema:
 *           type: integer
 *         description: Filtrar por ID de agente
 *       - in: query
 *         name: fechaInicio
 *         schema:
 *           type: string
 *           format: date
 *         description: Fecha inicial del rango (YYYY-MM-DD)
 *       - in: query
 *         name: fechaFin
 *         schema:
 *           type: string
 *           format: date
 *         description: Fecha final del rango (YYYY-MM-DD)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Número de página
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Registros por página
 *     responses:
 *       200:
 *         description: Lista de pedidos obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       pedidoId:
 *                         type: integer
 *                       fechaPedido:
 *                         type: string
 *                         format: date-time
 *                       montoTotal:
 *                         type: number
 *                       montoEsperado:
 *                         type: number
 *                       tieneDiscrepancia:
 *                         type: boolean
 *                       diferencia:
 *                         type: number
 *                       estatus:
 *                         type: string
 *                       clienteNombre:
 *                         type: string
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                 integridad:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     conDiscrepancia:
 *                       type: integer
 *                     validos:
 *                       type: integer
 *       500:
 *         description: Error al obtener pedidos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                 error:
 *                   type: string
 */
const getAllPedidos = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;
    const { estatus, clienteId, agenteId, fechaInicio, fechaFin, showHistorico } = req.query;
    const { limit, offset, page } = getPaginationParams(req.query);

    // Detectar rol del usuario
    const userRole = req.user?.rol?.toLowerCase()?.trim() || '';
    const isInventarios = userRole === 'inventarios';
    const isFinanzas = userRole === 'finanzas';
    const isAdmin = userRole === 'admin' || userRole === 'superadmin';
    
    // VALIDACIÓN: Inventarios NO puede ver históricos
    const wantsHistorico = showHistorico === 'true';
    if (isInventarios && wantsHistorico) {
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado. El rol inventarios no tiene permiso para ver pedidos históricos.',
        data: []
      });
    }

    let query = `
      SELECT 
        p.PedidoID,
        p.FechaPedido,
        p.MontoTotal,
        p.Estatus,
        p.CostoEnvio,
        p.Monto_Descuento,
        p.Cupon_ID,
        p.completamente_surtido,
        p.es_historico,
        p.fecha_confirmacion,
        c.Nombre as ClienteNombre,
        c.Apellido as ClienteApellido,
        c.Email as ClienteEmail,
        a.Nombre as AgenteNombre,
        a.Apellido as AgenteApellido,
        a.CodigoAgente,
        d.Ciudad,
        d.EstadoID,
        e.Nombre as EstadoNombre
      FROM Pedidos p
      LEFT JOIN Clientes c ON p.ClienteID = c.ClienteID
      LEFT JOIN AgentesDeVentas a ON p.AgenteID = a.AgenteID
      LEFT JOIN Cliente_Direcciones d ON p.DireccionEnvioID = d.DireccionID
      LEFT JOIN Estados e ON d.EstadoID = e.EstadoID
      WHERE p.tenant_id = $1
    `;

    // FILTRO POR ROL Y TIPO DE VISTA
    if (isInventarios) {
      // Inventarios solo ve ACTIVOS (no entregados)
      query += ` AND p.Estatus NOT IN ('Surtido', 'Enviado', 'Entregado')`;
      logger.info('✅ [PEDIDOS] Inventarios - mostrando solo pedidos activos (excluyendo Surtido/Enviado/Entregado)', {
        userId: req.user?.id,
        rol: userRole
      });
    } else if (wantsHistorico) {
      // Finanzas/Admin/SuperAdmin pueden ver históricos (solo Entregado)
      query += ` AND p.Estatus IN ('Entregado')`;
      logger.info('✅ [PEDIDOS] Histórico - mostrando solo pedidos entregados', {
        userId: req.user?.id,
        rol: userRole,
        isFinanzas,
        isAdmin
      });
    } else {
      // Finanzas/Admin/SuperAdmin ven activos (todo MENOS Entregado)
      query += ` AND p.Estatus NOT IN ('Entregado')`;
      logger.info('✅ [PEDIDOS] Activos - mostrando pedidos activos', {
        userId: req.user?.id,
        rol: userRole,
        isFinanzas,
        isAdmin
      });
    }

    const params = [tenant_id];
    let paramIndex = 2;

    if (estatus) {
      query += ` AND p.Estatus = $${paramIndex}`;
      params.push(estatus);
      paramIndex++;
    }

    if (clienteId) {
      query += ` AND p.ClienteID = $${paramIndex}`;
      params.push(parseInt(clienteId));
      paramIndex++;
    }

    if (agenteId) {
      query += ` AND p.AgenteID = $${paramIndex}`;
      params.push(parseInt(agenteId));
      paramIndex++;
    }

    if (fechaInicio) {
      query += ` AND p.FechaPedido >= $${paramIndex}`;
      params.push(fechaInicio);
      paramIndex++;
    }

    if (fechaFin) {
      query += ` AND p.FechaPedido <= $${paramIndex}`;
      params.push(fechaFin);
      paramIndex++;
    }

    // Count total records for pagination (use same filters as main query)
    const countParams = [tenant_id];
    let countParamIndex = 2;
    let countQuery = `SELECT COUNT(*) FROM Pedidos p WHERE p.tenant_id = $1`;
    
    // Aplicar mismo filtro por rol en el count
    if (isInventarios) {
      countQuery += ` AND p.Estatus NOT IN ('Surtido', 'Enviado', 'Entregado')`;
    } else if (wantsHistorico) {
      countQuery += ` AND p.Estatus IN ('Entregado')`;
    } else {
      countQuery += ` AND p.Estatus NOT IN ('Entregado')`;
    }
    
    if (estatus) {
      countQuery += ` AND p.Estatus = $${countParamIndex}`;
      countParams.push(estatus);
      countParamIndex++;
    }
    if (clienteId) {
      countQuery += ` AND p.ClienteID = $${countParamIndex}`;
      countParams.push(parseInt(clienteId));
      countParamIndex++;
    }
    if (agenteId) {
      countQuery += ` AND p.AgenteID = $${countParamIndex}`;
      countParams.push(parseInt(agenteId));
      countParamIndex++;
    }
    if (fechaInicio) {
      countQuery += ` AND p.FechaPedido >= $${countParamIndex}`;
      countParams.push(fechaInicio);
      countParamIndex++;
    }
    if (fechaFin) {
      countQuery += ` AND p.FechaPedido <= $${countParamIndex}`;
      countParams.push(fechaFin);
      countParamIndex++;
    }
    
    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count, 10);

    query += ` ORDER BY p.FechaPedido DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    // VALIDACIÓN DE INTEGRIDAD FINANCIERA: Obtener detalles en una sola query
    const pedidoIds = result.rows.map(r => r.pedidoid);
    
    let detallesPorPedido = new Map();
    if (pedidoIds.length > 0) {
      const detallesQuery = `
        SELECT 
          PedidoID,
          CantidadPaquetes,
          PrecioPorPaquete
        FROM DetallesDelPedido
        WHERE PedidoID = ANY($1::int[])
      `;
      
      const detallesResult = await db.query(detallesQuery, [pedidoIds]);
      
      // Agrupar detalles por pedido
      detallesResult.rows.forEach(detalle => {
        if (!detallesPorPedido.has(detalle.pedidoid)) {
          detallesPorPedido.set(detalle.pedidoid, []);
        }
        detallesPorPedido.get(detalle.pedidoid).push(detalle);
      });
    }

    // Procesar pedidos sin queries adicionales
    const pedidos = result.rows.map((row) => {
      const detalles = detallesPorPedido.get(row.pedidoid) || [];
      
      // Calcular subtotal desde items
      const subtotalItems = detalles.reduce((sum, detalle) => {
        const cantidad = parseFloat(detalle.cantidadpaquetes || 0);
        const precio = parseFloat(detalle.precioporpaquete || 0);
        return sum + (cantidad * precio);
      }, 0);

      const costoEnvio = parseFloat(row.costoenvio || 0);
      
      // Solo aplicar descuento si hay cupón válido
      const cuponId = parseInt(row.cupon_id);
      const tieneCupon = !isNaN(cuponId) && cuponId > 0;
      const descuento = tieneCupon ? parseFloat(row.monto_descuento || 0) : 0;
      
      // Total esperado: Subtotal + Envío - Descuento
      const montoEsperado = subtotalItems + costoEnvio - descuento;
      const montoRegistrado = parseFloat(row.montototal);
      
      // Detectar discrepancia (tolerancia de 1 centavo)
      const diferencia = Math.abs(montoRegistrado - montoEsperado);
      const tieneDiscrepancia = diferencia > 0.01;

      // ALERTA: Si hay discrepancia, loguear en consola
      if (tieneDiscrepancia) {
        console.warn(`⚠️  DISCREPANCIA DETECTADA en Pedido #${row.pedidoid}: Registrado=$${montoRegistrado.toFixed(2)}, Esperado=$${montoEsperado.toFixed(2)}, Diferencia=$${diferencia.toFixed(2)}`);
      }

      return {
        pedidoId: row.pedidoid,
        fechaPedido: row.fechapedido,
        montoTotal: parseFloat(montoRegistrado.toFixed(2)),
        montoEsperado: parseFloat(montoEsperado.toFixed(2)),
        tieneDiscrepancia,
        diferencia: tieneDiscrepancia ? parseFloat(diferencia.toFixed(2)) : 0,
        costoEnvio,
        estatus: row.estatus,
        completamente_surtido: row.completamente_surtido || false,
        es_historico: row.es_historico || false,
        fecha_confirmacion: row.fecha_confirmacion || null,
        clienteNombre: `${row.clientenombre || ''} ${row.clienteapellido || ''}`.trim(),
        cliente: {
          nombre: row.clientenombre,
          apellido: row.clienteapellido,
          email: row.clienteemail
        },
        agente: row.agentenombre ? {
          nombre: row.agentenombre,
          apellido: row.agenteapellido,
          codigoAgente: row.codigoagente
        } : null,
        direccion: {
          ciudad: row.ciudad,
          estadoId: row.estadoid,
          estado: row.estadonombre
        }
      };
    });

    // Contar pedidos con discrepancia
    const pedidosConDiscrepancia = pedidos.filter(p => p.tieneDiscrepancia);
    
    if (pedidosConDiscrepancia.length > 0) {
      console.warn(`\n⚠️  RESUMEN: ${pedidosConDiscrepancia.length} de ${pedidos.length} pedidos tienen discrepancias financieras.\n`);
    }

    res.json({
      success: true,
      data: pedidos,
      pagination: buildPaginationMeta(total, page, limit),
      integridad: {
        total: pedidos.length,
        conDiscrepancia: pedidosConDiscrepancia.length,
        validos: pedidos.length - pedidosConDiscrepancia.length
      }
    });
  } catch (error) {
    console.error('❌ ERROR al obtener pedidos:', error);
    logger.error('Error al obtener pedidos:', {
      error: error.message,
      stack: error.stack,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error al obtener pedidos",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Obtener detalle de un pedido
 * GET /api/admin/pedidos/:id/detalle
 */
const getPedidoDetalle = async (req, res) => {
  try {
    const pedidoId = parseInt(req.params.id);

    // Obtener información del pedido
    const { tenant_id } = req.tenant;

    const pedidoResult = await db.query(
      `SELECT 
        p.*,
        c.nombre as clientenombre,
        c.apellido as clienteapellido,
        c.email as clienteemail,
        c.telefono as clientetelefono,
        a.nombre as agentenombre,
        a.apellido as agenteapellido,
        a.codigoagente,
        d.calle,
        d.numeroext,
        d.numeroint,
        d.colonia,
        d.ciudad,
        d.estadoid,
        e.nombre as estadonombre,
        e.abreviatura as estadoabreviatura,
        d.codigopostal,
        d.telefonocontacto as referencias
      FROM pedidos p
      INNER JOIN clientes c ON p.clienteid = c.clienteid AND c.tenant_id = $2
      LEFT JOIN agentesdeventas a ON p.agenteid = a.agenteid AND a.tenant_id = $2
      LEFT JOIN cliente_direcciones d ON p.direccionenvioid = d.direccionid AND d.tenant_id = $2
      LEFT JOIN estados e ON d.estadoid = e.estadoid
      WHERE p.pedidoid = $1 AND p.tenant_id = $2`,
      [pedidoId, tenant_id]
    );

    if (pedidoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pedido no encontrado",
      });
    }

    const pedido = pedidoResult.rows[0];

    // Obtener detalles de productos del pedido
    const detallesResult = await db.query(
      `SELECT DISTINCT ON (dp.detalleid)
        dp.detalleid,
        dp.pedidoid,
        dp.varianteid,
        dp.tamanoid,
        dp.cantidadpaquetes,
        dp.precioporpaquete,
        dp.piezastotales,
        dp.preciounitario,
        dp.esbackorder,
        dp.cantidadsurtida,
        CASE 
          WHEN dp.cantidadsurtida > 0 AND dp.cantidadsurtida = dp.cantidadpaquetes THEN 'Surtido'
          WHEN dp.cantidadsurtida > 0 AND dp.cantidadsurtida < dp.cantidadpaquetes THEN 'Parcialmente Surtido'
          WHEN dp.cantidadsurtida > 0 THEN 'Parcialmente Surtido'
          ELSE 'Pendiente' 
        END as estado_producto,
        COALESCE(
          dp.preciounitario, 
          ROUND(dp.precioporpaquete / NULLIF((dp.piezastotales / NULLIF(dp.cantidadpaquetes, 0)), 0), 2)
        ) as preciounitariocalculado,
        pv.sku,
        pv.dimensiones,
        pv.productoid,
        pv.color_nombre,
        pv.color_hex,
        COALESCE(
          (SELECT cantidad FROM stock_admin WHERE variante_id = pv.varianteid AND tenant_id = $2 LIMIT 1),
          pv.stock,
          0
        ) as stock,
        pr.nombreproducto,
        COALESCE(
          (
            SELECT pvi.url_imagen 
            FROM producto_variante_imagenes pvi 
            WHERE pvi.varianteid = pv.varianteid 
              AND pvi.tenant_id = $2
            ORDER BY pvi.orden ASC 
            LIMIT 1
          ),
          (
            SELECT pi.url_imagen 
            FROM producto_imagenes pi 
            WHERE pi.productoid = pv.productoid 
              AND pi.tenant_id = $2
            ORDER BY pi.orden ASC 
            LIMIT 1
          )
        ) as imagenurl,
        row_to_json(ct) as tamano_info
      FROM detallesdelpedido dp
      INNER JOIN producto_variantes pv ON dp.varianteid = pv.varianteid AND pv.tenant_id = $2
      INNER JOIN productos pr ON pv.productoid = pr.productoid AND pr.tenant_id = $2
      LEFT JOIN cat_tamanopaquetes ct ON dp.tamanoid = ct.tamanoid AND ct.tenant_id = $2
      WHERE dp.pedidoid = $1 AND dp.tenant_id = $2
      ORDER BY dp.detalleid`,
      [pedidoId, tenant_id]
    );

    res.json({
      success: true,
      data: {
        pedido: {
          pedidoId: pedido.pedidoid,
          fechaPedido: pedido.fechapedido,
          estatus: pedido.estatus,
          montoTotal: parseFloat(pedido.montototal),
          costoEnvio:
            pedido.costoenvio !== null ? parseFloat(pedido.costoenvio) : null,
          cliente: {
            nombre: `${pedido.clientenombre} ${pedido.clienteapellido}`,
            email: pedido.clienteemail,
            telefono: pedido.clientetelefono,
          },
          agente: pedido.agentenombre
            ? {
                nombre: `${pedido.agentenombre} ${pedido.agenteapellido}`,
                codigo: pedido.codigoagente,
              }
            : null,
          direccion: {
            calle: pedido.calle,
            numeroExterior: pedido.numeroext,
            numeroInterior: pedido.numeroint,
            colonia: pedido.colonia,
            ciudad: pedido.ciudad,
            estadoId:
              pedido.estadoid !== null ? parseInt(pedido.estadoid, 10) : null,
            estado: pedido.estadonombre || null,
            estadoNombre: pedido.estadonombre || null,
            estadoAbreviatura: pedido.estadoabreviatura || null,
            codigoPostal: pedido.codigopostal,
            referencias: pedido.referencias,
          },
        },
        productos: detallesResult.rows.map((row) => {
          // Extraer piezasPorPaquete del tamano_info JSON
          const tamanoInfo = row.tamano_info || {};
          const piezasPorPaquete =
            tamanoInfo.valor ||
            tamanoInfo.cantidad ||
            tamanoInfo.piezas ||
            tamanoInfo.piezasporpaquete ||
            tamanoInfo.numeropiezas ||
            null;

          return {
            detalleId: row.detalleid,
            productoId: row.productoid,
            varianteId: row.varianteid,
            tamanoId: row.tamanoid || null,
            nombre: row.nombreproducto,
            sku: row.sku,
            cantidadPaquetes: parseInt(row.cantidadpaquetes, 10),
            cantidadSurtida: row.cantidadsurtida !== null ? parseInt(row.cantidadsurtida, 10) : 0,
            estadoProducto: row.estado_producto || 'Pendiente',
            piezasPorPaquete,
            precioPorPaquete: row.precioporpaquete
              ? parseFloat(row.precioporpaquete)
              : 0,
            precioUnitario: row.preciounitariocalculado
              ? parseFloat(row.preciounitariocalculado)
              : 0,
            piezasTotales: parseInt(row.piezastotales, 10),
            dimensiones: row.dimensiones || null,
            colorNombre: row.color_nombre || null,
            colorHex: row.color_hex || null,
            imagenUrl: row.imagenurl || null,
            stock: row.stock !== null ? parseInt(row.stock, 10) : 0,
            esBackorder: row.esbackorder || false,
            subtotal: row.precioporpaquete
              ? parseFloat((row.cantidadpaquetes || 0) * row.precioporpaquete)
              : 0,
          };
        }),
      },
    });
  } catch (error) {
    logger.error('Error al obtener detalle del pedido:', {
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error en el servidor"
    });
  }
};

/**
 * Confirmar pedido
 * POST /api/admin/pedidos/:id/confirmar
 * 
 * FIX: Este endpoint ahora SOLO cambia el estado del pedido.
 * El inventario se descuenta cuando finanzas confirma el surtido en confirmarSurtidoFinanzas.
 * Esto previene el doble descuento de inventario.
 */
const confirmarPedido = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const { tenant_id } = req.tenant;
    const pedidoId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de pedido inválido",
      });
    }

    await client.query("BEGIN");

    const pedidoResult = await client.query(
      "SELECT PedidoID, Estatus FROM Pedidos WHERE PedidoID = $1 AND tenant_id = $2 FOR UPDATE",
      [pedidoId, tenant_id]
    );

    if (!pedidoResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Pedido no encontrado",
      });
    }

    const estatusActual = (pedidoResult.rows[0].estatus || "").toString().trim();
    if (estatusActual !== "Pendiente") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: `No se puede confirmar un pedido con estatus '${estatusActual || "(vacío)"}'`,
      });
    }

    const itemsResult = await client.query(
      `SELECT
         dp.DetalleID,
         dp.VarianteID,
         dp.PiezasTotales,
         pr.NombreProducto,
         pv.SKU
       FROM DetallesDelPedido dp
       INNER JOIN Producto_Variantes pv ON pv.VarianteID = dp.VarianteID
       INNER JOIN Productos pr ON pr.ProductoID = pv.ProductoID
       WHERE dp.PedidoID = $1`,
      [pedidoId]
    );

    if (!itemsResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "No se puede confirmar: el pedido no tiene productos",
      });
    }

    await client.query(
      "UPDATE Pedidos SET Estatus = 'Confirmado', fecha_confirmacion = NOW() WHERE PedidoID = $1",
      [pedidoId]
    );

    await client.query("COMMIT");

    logger.info('Pedido confirmado (sin afectar inventario):', {
      pedidoId,
      tenantId: tenant_id,
      mensaje: 'El inventario se descontará cuando finanzas confirme el surtido'
    });

    return res.status(200).json({
      success: true,
      message: "Pedido confirmado exitosamente. El inventario se descontará cuando finanzas confirme el surtido.",
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (e) {
      // ignore
    }

    logger.error('Error confirmando pedido:', {
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "Error al confirmar el pedido"
    });
  } finally {
    client.release();
  }
};

/**
 * Surtir pedido (marcar como listo para surtir)
 * Usado por inventarios para marcar productos como preparados
 * NO reduce stock - eso lo hace finanzas al confirmar
 * POST /api/admin/pedidos/:id/surtir
 */
const surtirPedido = async (req, res) => {
  const client = await db.getClient();
  
  try {
    const { id: pedidoId } = req.params;
    const { detalleIds } = req.body; // Array de IDs de productos seleccionados
    const { tenant_id } = req.tenant;
    const userRole = (req.user?.rol || req.user?.role || '').toLowerCase().trim();

    await client.query('BEGIN');

    // Obtener pedido
    const pedidoQuery = `
      SELECT p.pedidoid, p.clienteid, p.agenteid, p.direccionenvioid, p.fechapedido, p.montototal, p.estatus, 
             p.costoenvio, p.es_credito, p.fecha_vencimiento, p.pagado, p.transaccion_id, p.comprobante_url, 
             p.metodo_pago, p.cupon_id, p.monto_descuento, p.saldo_pendiente, p.url_evidencia_entrega, 
             p.fecha_entrega_real, p.tenant_id, p.estatus_deuda, p.dias_atraso, p.tiene_remisiones, 
             p.completamente_surtido, p.monto_surtido, p.monto_backorder, p.es_prioritario, p.es_historico, 
             p.fecha_confirmacion, p.observaciones_finanzas, p.rechazado_por_finanzas, p.fecha_rechazo_finanzas,
        (SELECT COUNT(*) FROM detallesdelpedido WHERE pedidoid = p.pedidoid) as total_productos,
        (SELECT COUNT(*) FROM detallesdelpedido WHERE pedidoid = p.pedidoid AND esbackorder = true) as productos_backorder
      FROM pedidos p
      WHERE p.pedidoid = $1 AND p.tenant_id = $2
    `;
    
    const pedidoResult = await client.query(pedidoQuery, [pedidoId, tenant_id]);
    
    if (pedidoResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Pedido no encontrado'
      });
    }

    const pedido = pedidoResult.rows[0];
    const productosBackorder = parseInt(pedido.productos_backorder || 0);
    const totalProductos = parseInt(pedido.total_productos || 0);

    // VALIDATION: Reject empty product arrays to prevent 0-product confirmations
    if (!detalleIds || !Array.isArray(detalleIds) || detalleIds.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Debes seleccionar al menos un producto para surtir. No se puede enviar un pedido vacío a finanzas.'
      });
    }

    // Marcar productos seleccionados como surtidos (NO reduce inventario)
    let marcarResult;
    
    // FIX: Check if detalleIds is provided AND not empty (prevent LEGACY mode with empty array)
    const esModoSelectivo = detalleIds && Array.isArray(detalleIds) && detalleIds.length > 0;
    
    if (esModoSelectivo) {
      // MODO SELECTIVO: Solo marcar productos específicos seleccionados por inventarios
      // FIX: Trust frontend validation - if inventarios selected them, they have stock
      // Don't filter by esbackorder flag as it can be inconsistent
      
      logger.info('Intentando marcar productos como surtidos:', {
        pedidoId,
        detalleIds,
        cantidadSeleccionados: detalleIds.length,
        tenantId: tenant_id
      });
      
      // STEP 1: Get detailed info about products and their stock
      // Single query to check what we need to mark
      const detalleProductosQuery = `
        SELECT 
          dp.detalleid,
          dp.varianteid,
          dp.cantidadsurtida,
          dp.piezastotales,
          pv.stock as stock_pv,
          pv.nombre_producto,
          COALESCE(sa.cantidad, 0) as stock_sa,
          COALESCE(sa.cantidad_reservada, 0) as stock_reservado
        FROM detallesdelpedido dp
        INNER JOIN producto_variantes pv ON dp.varianteid = pv.varianteid AND pv.tenant_id = $3
        LEFT JOIN stock_admin sa ON sa.variante_id = dp.varianteid AND sa.tenant_id = $3
        WHERE dp.pedidoid = $1 
          AND dp.detalleid = ANY($2::int[])
          AND dp.cantidadsurtida = 0
          AND dp.tenant_id = $3
      `;
      
      const detalleProductos = await client.query(detalleProductosQuery, [pedidoId, detalleIds, tenant_id]);
      
      logger.info('Stock info para productos seleccionados:', {
        encontrados: detalleProductos.rows.length,
        detalles: detalleProductos.rows.map(p => ({
          detalleid: p.detalleid,
          producto: p.nombre_producto,
          piezas: p.piezastotales,
          stock_variante: p.stock_pv,
          stock_admin: p.stock_sa,
          stock_disponible: Math.max(p.stock_sa - p.stock_reservado, p.stock_pv)
        }))
      });
      
      // STEP 2: Only keep products with sufficient stock
      const productosConStock = detalleProductos.rows.filter(p => {
        const stockSaDisponible = p.stock_sa - p.stock_reservado;
        return stockSaDisponible >= p.piezastotales || p.stock_pv >= p.piezastotales;
      });
      
      if (productosConStock.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Ninguno de los productos seleccionados tiene stock suficiente'
        });
      }
      
      // STEP 3: Now mark only those with stock
      const detalleIdsConStock = productosConStock.map(p => p.detalleid);
      const marcarSurtidosQuery = `
        UPDATE detallesdelpedido
        SET cantidadsurtida = cantidadpaquetes
        WHERE pedidoid = $1 
          AND detalleid = ANY($2::int[])
          AND cantidadsurtida = 0
          AND tenant_id = $3
        RETURNING detalleid, cantidadsurtida, cantidadpaquetes
      `;
      
      marcarResult = await client.query(marcarSurtidosQuery, [pedidoId, detalleIdsConStock, tenant_id]);
    } else if (!esModoSelectivo && detalleIds && Array.isArray(detalleIds)) {
      // VALIDATION: Prevent empty array from triggering LEGACY mode
      await client.query('ROLLBACK');
      logger.warn('Empty detalleIds array sent - aborting to prevent mass marking', {
        pedidoId,
        detalleIds,
        tenantId: tenant_id
      });
      return res.status(400).json({
        success: false,
        message: 'Debes seleccionar al menos un producto para surtir',
        error: 'empty_selection'
      });
    } else {
      // MODO LEGACY: Marcar todos los productos con stock VERIFICANDO disponibilidad
      // Verifica en stock_admin si existe, sino en producto_variantes.stock
      logger.info('=== SURTIR PEDIDO - MODO LEGACY (SIN SELECCIÓN ESPECÍFICA) ===', { 
        pedidoId, 
        tenantId: tenant_id,
        razon: 'detalleIds no proporcionado o vacío'
      });
      
      const marcarSurtidosQuery = `
        UPDATE detallesdelpedido d
        SET cantidadsurtida = cantidadpaquetes
        FROM producto_variantes pv
        LEFT JOIN stock_admin sa ON sa.variante_id = d.varianteid AND sa.tenant_id = d.tenant_id
        WHERE d.pedidoid = $1 
          AND d.esbackorder = false
          AND d.cantidadsurtida = 0
          AND d.tenant_id = $2
          AND pv.varianteid = d.varianteid
          AND pv.tenant_id = $2
          AND (
            CASE 
              WHEN sa.cantidad IS NOT NULL THEN (sa.cantidad - COALESCE(sa.cantidad_reservada, 0)) >= d.piezastotales
              ELSE pv.stock >= d.piezastotales
            END
          )
        RETURNING d.detalleid, d.cantidadsurtida, d.cantidadpaquetes
      `;
      
      marcarResult = await client.query(marcarSurtidosQuery, [pedidoId, tenant_id]);
    }
    
    // VALIDATION: Ensure at least one product was actually marked
    if (marcarResult.rowCount === 0) {
      // Provide detailed feedback about why products couldn't be marked
      await client.query('ROLLBACK');
      
      logger.warn('No products could be marked', {
        pedidoId,
        selectedCount: esModoSelectivo ? detalleIds.length : 'LEGACY',
        modo: esModoSelectivo ? 'SELECTIVO' : 'LEGACY',
        tenantId: tenant_id
      });
      
      return res.status(400).json({
        success: false,
        message: 'No se pudo marcar ningún producto. Verifica que tengan stock suficiente disponible.'
      });
    }
    
    logger.info('Productos marcados como surtidos:', {
      pedidoId,
      productosActualizados: marcarResult.rowCount,
      modoSelectivo: esModoSelectivo,
      detalleIds: esModoSelectivo ? detalleIds : 'todos',
      tenantId: tenant_id
    });

    // BUG FIX 5: Insertar en histórico cuando Inventarios marca productos
    // Obtener detalles de productos marcados para el histórico
    const detallesMarcadosQuery = `
      SELECT 
        dp.detalleid,
        dp.varianteid,
        dp.cantidadsurtida,
        dp.piezastotales,
        pv.sku,
        pr.nombreproducto
      FROM detallesdelpedido dp
      INNER JOIN producto_variantes pv ON dp.varianteid = pv.varianteid AND pv.tenant_id = $2
      INNER JOIN productos pr ON pv.productoid = pr.productoid AND pr.tenant_id = $2
      WHERE dp.pedidoid = $1 
        AND dp.tenant_id = $2
        AND dp.cantidadsurtida > 0
        ${detalleIds && detalleIds.length > 0 ? 'AND dp.detalleid = ANY($3::int[])' : ''}
    `;
    
    const detallesMarcadosParams = detalleIds && detalleIds.length > 0 
      ? [pedidoId, tenant_id, detalleIds]
      : [pedidoId, tenant_id];
    
    const detallesMarcadosResult = await client.query(detallesMarcadosQuery, detallesMarcadosParams);
    
    // ⚠️ NOTA: Inserción a historial_pedidos comentada pendiente verificación de tabla
    // Insertar registro en historial_pedidos para auditoría
    // try {
    //   await client.query(
    //     `INSERT INTO historial_pedidos (
    //       pedido_id,
    //       accion,
    //       detalles,
    //       usuario_id,
    //       tenant_id
    //     ) VALUES ($1, $2, $3, $4, $5)`,
    //     [
    //       pedidoId,
    //       'SURTIDO_INVENTARIOS',
    //       JSON.stringify({
    //         productos_marcados: detallesMarcadosResult.rows.map(r => ({
    //           detalle_id: r.detalleid,
    //           variante_id: r.varianteid,
    //           sku: r.sku,
    //           nombre: r.nombreproducto,
    //           cantidad_surtida: r.cantidadsurtida,
    //           piezas_totales: r.piezastotales
    //         })),
    //         cantidad_productos: marcarResult.rowCount,
    //         modo: detalleIds && detalleIds.length > 0 ? 'selectivo' : 'todos',
    //         timestamp: new Date().toISOString()
    //       }),
    //       req.user?.id || req.user?.adminid || null,
    //       tenant_id
    //     ]
    //   );
    // } catch (auditError) {
    //   logger.warn('No se pudo registrar en historial_pedidos (tabla posiblemente no existe):', { error: auditError.message });
    // }

    logger.info('Productos marcados para surtir:', {
      pedidoId,
      productosRegistrados: detallesMarcadosResult.rows.length
    });

    // Actualizar estatus del pedido
    // LÓGICA: Inventarios marcó productos → Cambiar a "Listo para remisionar"
    // Después Finanzas confirmará y el status será "Surtido"
    
    const nuevoEstatus = 'Listo para remisionar';
    const completamenteSurtido = false; // Inventarios solo marca, Finanzas confirma y cambia esto

    logger.info('✅ [ESTADO] Actualizando estado del pedido después de marcar surtidos', {
      pedidoId,
      productosActualizados: marcarResult.rowCount,
      nuevoEstatus,
      completamenteSurtido,
      tenantId: tenant_id
    });
    
    const updateQuery = `
      UPDATE pedidos 
      SET 
        estatus = $3,
        completamente_surtido = $4
      WHERE pedidoid = $1 AND tenant_id = $2
      RETURNING pedidoid, estatus, completamente_surtido
    `;
    
    const updateResult = await client.query(updateQuery, [pedidoId, tenant_id, nuevoEstatus, completamenteSurtido]);
    
    if (!updateResult.rows || updateResult.rows.length === 0) {
      logger.error('❌ [ERROR] El UPDATE del estado del pedido no retornó filas', {
        pedidoId,
        nuevoEstatus,
        tenantId: tenant_id
      });
      throw new Error('No se pudo actualizar el estado del pedido');
    }

    await client.query('COMMIT');

    // Obtener datos actualizados de productos marcados
    const productosActualizadosQuery = `
      SELECT 
        dp.detalleid,
        dp.cantidadsurtida,
        dp.cantidadpaquetes,
        pv.sku
      FROM detallesdelpedido dp
      INNER JOIN producto_variantes pv ON dp.varianteid = pv.varianteid
      WHERE dp.pedidoid = $1 
        AND dp.tenant_id = $2
        AND dp.cantidadsurtida > 0
      ORDER BY dp.detalleid
    `;
    const productosActualizadosResult = await client.query(productosActualizadosQuery, [pedidoId, tenant_id]);

    logger.info('✅ Pedido marcado como listo para remisionar - Enviando a Finanzas', {
      pedidoId,
      estatus: nuevoEstatus,
      productosActualizados: marcarResult.rowCount,
      userRole,
      tenantId: tenant_id,
      requestId: req.requestId
    });

    res.json({
      success: true,
      message: `Pedido enviado a finanzas para confirmación. ${marcarResult.rowCount} producto(s) marcado(s) como listo(s) para remisionar, ${productosBackorder} en backorder. Stock NO afectado hasta confirmación de finanzas.`,
      data: {
        pedidoId: updateResult.rows[0].pedidoid,
        estatus: updateResult.rows[0].estatus,
        completamente_surtido: updateResult.rows[0].completamente_surtido,
        productosMarcados: marcarResult.rowCount,
        productosBackorder,
        productosActualizados: productosActualizadosResult.rows
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error al surtir pedido:', {
      error: error.message,
      stack: error.stack,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: 'Error al surtir el pedido',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    client.release();
  }
};

/**
 * Confirmar surtido y reducir inventario (finanzas)
 * Usado por finanzas para confirmar que el pedido está listo y reducir stock
 * 
 * ⚠️ PROTECCIÓN DE LÓGICA FINANCIERA PARA SURTIDO PARCIAL:
 * - Solo reduce stock de productos que fueron marcados como surtidos (cantidadsurtida > 0)
 * - Si el pedido está en "Surtido Parcial", solo procesa los items completados
 * - El resto de items quedan pendientes para futuras entregas
 * - La CXC se genera posteriormente en remisionesController basada en lo realmente entregado
 * 
 * POST /api/admin/pedidos/:id/confirmar-surtido
 */
const confirmarSurtidoFinanzas = async (req, res) => {
  const client = await db.getClient();
  
  try {
    const { id: pedidoId } = req.params;
    const { tenant_id } = req.tenant;
    const userId = req.user?.id || req.user?.adminid;

    await client.query('BEGIN');

    // Obtener pedido y verificar que está listo para surtir
    const pedidoQuery = `
      SELECT p.pedidoid, p.clienteid, p.agenteid, p.direccionenvioid, p.fechapedido, p.montototal, p.estatus, 
             p.costoenvio, p.es_credito, p.fecha_vencimiento, p.pagado, p.transaccion_id, p.comprobante_url, 
             p.metodo_pago, p.cupon_id, p.monto_descuento, p.saldo_pendiente, p.url_evidencia_entrega, 
             p.fecha_entrega_real, p.tenant_id, p.estatus_deuda, p.dias_atraso, p.tiene_remisiones, 
             p.completamente_surtido, p.monto_surtido, p.monto_backorder, p.es_prioritario, p.es_historico, 
             p.fecha_confirmacion, p.observaciones_finanzas, p.rechazado_por_finanzas, p.fecha_rechazo_finanzas,
        (SELECT COUNT(*) FROM detallesdelpedido WHERE pedidoid = p.pedidoid AND esbackorder = false) as productos_con_stock
      FROM pedidos p
      WHERE p.pedidoid = $1 AND p.tenant_id = $2
    `;
    
    const pedidoResult = await client.query(pedidoQuery, [pedidoId, tenant_id]);
    
    if (pedidoResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Pedido no encontrado'
      });
    }

    const pedido = pedidoResult.rows[0];
    const estatusActual = (pedido.estatus || '').toLowerCase().trim();
    
    // Validar que el pedido está en estado correcto
    if (!['listo para surtir', 'parcialmente surtido', 'parcialmente_surtido', 'surtido parcial', 'listo para remisionar'].includes(estatusActual)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `No se puede confirmar. El pedido debe estar en estado "Listo para Surtir", "Surtido Parcial" o "Listo para remisionar". Estado actual: ${pedido.estatus}`
      });
    }

    // PROTECCIÓN PARA SURTIDO PARCIAL: Obtener productos que están SURTIDOS (marcados por inventarios)
    // Filtrar solo los que NO han sido confirmados aún por finanzas
    const productosQuery = `
      SELECT 
        dp.detalleid,
        dp.varianteid,
        dp.piezastotales,
        dp.cantidadsurtida,
        dp.esbackorder,
        pv.sku,
        pr.nombreproducto
      FROM detallesdelpedido dp
      INNER JOIN producto_variantes pv ON dp.varianteid = pv.varianteid
      INNER JOIN productos pr ON pv.productoid = pr.productoid
      WHERE dp.pedidoid = $1 
        AND dp.cantidadsurtida > 0
        AND dp.tenant_id = $2
    `;
    
    const productosResult = await client.query(productosQuery, [pedidoId, tenant_id]);
    
    if (productosResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'No hay productos surtidos para confirmar. Inventarios debe marcar productos primero.'
      });
    }

    let productosConfirmados = 0;

    logger.info('🔍 [DEBUG] Iniciando confirmación de surtido:', {
      pedidoId,
      userId,
      tenant_id,
      userRole: ['finanzas', 'admin'],
      productosConStock: productosResult.rows.length
    });

    // Reducir inventario solo para productos con stock que no han sido confirmados
    for (const item of productosResult.rows) {
      const varianteId = parseInt(item.varianteid);
      const piezasSurtidas = parseInt(item.cantidadsurtida || 0);

      logger.info('🔍 [DEBUG] Procesando producto para confirmar:', {
        varianteId,
        piezasSurtidas,
        sku: item.sku,
        nombre: item.nombreproducto
      });

      try {
        await inventoryService.registrarMovimiento(client, {
          varianteId,
          cantidadDelta: -1 * piezasSurtidas,
          motivo: `Confirmación surtido Pedido #${pedidoId}`,
          usuarioId: userId,
          esExcepcion: false,
          tenantId: tenant_id,
          userRole: ['finanzas', 'admin'],
          tipoOrigen: 'VENTA'
        });
        
        productosConfirmados++;
        logger.info('✅ [DEBUG] Producto confirmado exitosamente:', { varianteId, productosConfirmados });
      } catch (invError) {
        await client.query('ROLLBACK');

        const nombre = (item.nombreproducto || 'Producto').toString().trim();
        const sku = (item.sku || '').toString().trim();
        const ref = sku ? `${nombre} (${sku})` : nombre;

        if (invError && invError.code === 'STOCK_INSUFICIENTE') {
          return res.status(400).json({
            success: false,
            message: `Stock insuficiente para el producto ${ref}`,
            code: invError.code,
          });
        }

        return res.status(500).json({
          success: false,
          message: `Error al descontar inventario para ${ref}`,
          code: invError.code,
        });
      }
    }

    // Verificar si todos los productos han sido confirmados
    const todosProductosQuery = `
      SELECT COUNT(*) as total FROM detallesdelpedido 
      WHERE pedidoid = $1 AND tenant_id = $2 AND cantidadsurtida > 0
    `;
    const todosProductosResult = await client.query(todosProductosQuery, [pedidoId, tenant_id]);
    const totalProductosSurtidos = parseInt(todosProductosResult.rows[0].total);
    
    // Determinar nuevo estado basado en lo que se confirmó
    // Si se confirmaron todos los que tenían cantidadsurtida > 0, entonces "Surtido"
    // Si solo se confirmaron algunos, entonces "Parcialmente Surtido"
    const todoConfirmado = totalProductosSurtidos > 0 && totalProductosSurtidos === productosConfirmados;
    const nuevoEstatusPedido = todoConfirmado ? 'Surtido' : 'Parcialmente Surtido';
    const completamenteSurtido = todoConfirmado;

    // Actualizar pedido con el nuevo estado
    const updateQuery = `
      UPDATE pedidos 
      SET 
        estatus = $3,
        completamente_surtido = $4,
        fecha_confirmacion = NOW()
      WHERE pedidoid = $1 AND tenant_id = $2
      RETURNING pedidoid, estatus, completamente_surtido
    `;
    
    const updateResult = await client.query(updateQuery, [pedidoId, tenant_id, nuevoEstatusPedido, completamenteSurtido]);
    
    if (!updateResult.rows || updateResult.rows.length === 0) {
      await client.query('ROLLBACK');
      logger.error('❌ [ERROR] El UPDATE del estado del pedido no retornó filas', {
        pedidoId,
        nuevoEstatusPedido,
        tenantId: tenant_id
      });
      return res.status(500).json({
        success: false,
        message: 'Error: No se pudo actualizar el estado del pedido'
      });
    }

    await client.query('COMMIT');

    // Obtener datos actualizados del pedido y productos después de la confirmación
    const pedidoActualizadoQuery = `
      SELECT p.pedidoid, p.estatus, p.completamente_surtido
      FROM pedidos 
      WHERE pedidoid = $1 AND tenant_id = $2
    `;
    const pedidoActualizadoResult = await client.query(pedidoActualizadoQuery, [pedidoId, tenant_id]);
    
    const productosActualizadosQuery = `
      SELECT 
        dp.detalleid,
        dp.cantidadsurtida,
        dp.cantidadpaquetes,
        CASE WHEN dp.cantidadsurtida > 0 AND dp.cantidadsurtida = dp.cantidadpaquetes THEN 'Surtido'
             WHEN dp.cantidadsurtida > 0 AND dp.cantidadsurtida < dp.cantidadpaquetes THEN 'Parcialmente Surtido'
             ELSE 'Pendiente' END as estado_producto
      FROM detallesdelpedido dp
      WHERE dp.pedidoid = $1 AND dp.tenant_id = $2
    `;
    const productosActualizadosResult = await client.query(productosActualizadosQuery, [pedidoId, tenant_id]);

    logger.info('✅ Pedido confirmado por Finanzas - Estado actualizado:', {
      pedidoId,
      productosConfirmados,
      totalProductosSurtidos,
      nuevoEstatusPedido,
      todoConfirmado,
      completamenteSurtido,
      tenantId: tenant_id,
      userId,
      requestId: req.requestId
    });

    res.json({
      success: true,
      message: `✅ ${productosConfirmados} producto(s) confirmado(s) exitosamente. Pedido actualizado a estado: "${nuevoEstatusPedido}".`,
      data: {
        pedidoId,
        estatusPedido: nuevoEstatusPedido,
        productosConfirmados,
        totalProductosSurtidos,
        completamenteSurtido,
        pedidoActualizado: pedidoActualizadoResult.rows[0] || {},
        productosActualizados: productosActualizadosResult.rows || []
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error al confirmar surtido:', {
      error: error.message,
      stack: error.stack,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: 'Error al confirmar el surtido',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    client.release();
  }
};

/**
 * Rechazar pedido y regresar a almacén (finanzas)
 * Usado por finanzas para rechazar un pedido y regresarlo al almacenista para corrección
 * POST /api/admin/pedidos/:id/rechazar-finanzas
 */
const rechazarPedidoFinanzas = async (req, res) => {
  const client = await db.getClient();
  
  try {
    const { id: pedidoId } = req.params;
    const { tenant_id } = req.tenant;
    const { observaciones_finanzas } = req.body;
    const userId = req.user?.id || req.user?.adminid;

    if (!observaciones_finanzas || observaciones_finanzas.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Se requieren observaciones para rechazar el pedido'
      });
    }

    await client.query('BEGIN');

    // Obtener pedido
    const pedidoQuery = `
      SELECT p.pedidoid, p.clienteid, p.agenteid, p.direccionenvioid, p.fechapedido, p.montototal, p.estatus, 
             p.costoenvio, p.es_credito, p.fecha_vencimiento, p.pagado, p.transaccion_id, p.comprobante_url, 
             p.metodo_pago, p.cupon_id, p.monto_descuento, p.saldo_pendiente, p.url_evidencia_entrega, 
             p.fecha_entrega_real, p.tenant_id, p.estatus_deuda, p.dias_atraso, p.tiene_remisiones, 
             p.completamente_surtido, p.monto_surtido, p.monto_backorder, p.es_prioritario, p.es_historico, 
             p.fecha_confirmacion, p.observaciones_finanzas, p.rechazado_por_finanzas, p.fecha_rechazo_finanzas
      FROM pedidos p
      WHERE p.pedidoid = $1 AND p.tenant_id = $2
    `;
    
    const pedidoResult = await client.query(pedidoQuery, [pedidoId, tenant_id]);
    
    if (pedidoResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Pedido no encontrado'
      });
    }

    const pedido = pedidoResult.rows[0];
    const estatusActual = (pedido.estatus || '').toLowerCase().trim();
    
    // Validar que el pedido está listo para remisionar
    const estadosValidos = ['listo para remisionar'];
    if (!estadosValidos.includes(estatusActual)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `No se puede rechazar. El pedido debe estar en estado "Listo para remisionar". Estado actual: ${pedido.estatus}`
      });
    }

    // Cambiar estado a "Revisión de almacén"
    const updateQuery = `
      UPDATE pedidos 
      SET 
        estatus = 'Revisión de almacén',
        observaciones_finanzas = $3,
        rechazado_por_finanzas = $4,
        fecha_rechazo_finanzas = NOW()
      WHERE pedidoid = $1 AND tenant_id = $2
      RETURNING *
    `;
    
    const updateResult = await client.query(updateQuery, [pedidoId, tenant_id, observaciones_finanzas, userId]);

    await client.query('COMMIT');

    logger.info('Pedido rechazado por finanzas y regresado a almacén:', {
      pedidoId,
      observaciones: observaciones_finanzas,
      userId,
      tenantId: tenant_id,
      requestId: req.requestId
    });

    res.json({
      success: true,
      message: 'Pedido regresado al almacén para corrección',
      data: {
        pedidoId: updateResult.rows[0].pedidoid,
        estatus: updateResult.rows[0].estatus,
        observaciones_finanzas
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error al rechazar pedido por finanzas:', {
      error: error.message,
      stack: error.stack,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: 'Error al rechazar el pedido',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    client.release();
  }
};

/**
 * Marcar/desmarcar pedido como prioritario
 * POST /api/admin/pedidos/:id/prioritario
 * Solo accesible por roles: finanzas, admin, super_admin
 */
const setPrioritario = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const { tenant_id } = req.tenant;
    const pedidoId = Number.parseInt(req.params.id, 10);
    const { prioritario, motivo } = req.body;
    const usuarioId = req.user?.id || req.user?.userId;

    if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'ID de pedido inválido',
      });
    }

    if (typeof prioritario !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'El campo prioritario debe ser boolean',
      });
    }

    await client.query('BEGIN');

    const pedidoResult = await client.query(
      'SELECT pedidoid, estatus, es_prioritario FROM pedidos WHERE pedidoid = $1 AND tenant_id = $2',
      [pedidoId, tenant_id]
    );

    if (pedidoResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Pedido no encontrado',
      });
    }

    await client.query(
      'UPDATE pedidos SET es_prioritario = $1 WHERE pedidoid = $2 AND tenant_id = $3',
      [prioritario, pedidoId, tenant_id]
    );

    const userName = req.user?.nombre || req.user?.username || 'Usuario';
    const titulo = prioritario
      ? `⚠️ Pedido #${pedidoId} Marcado como PRIORITARIO`
      : `Prioridad Removida - Pedido #${pedidoId}`;
    
    const mensaje = prioritario
      ? `El pedido #${pedidoId} ha sido marcado como PRIORITARIO por ${userName}. Motivo: ${motivo || 'Sin motivo especificado'}`
      : `La prioridad del pedido #${pedidoId} ha sido removida por ${userName}. Motivo: ${motivo || 'Sin motivo'}`;

    const almacenistasResult = await client.query(
      `SELECT DISTINCT a.adminid
       FROM administradores a
       WHERE LOWER(a.rol) IN ('inventarios', 'almacenista')
         AND a.activo = TRUE
         AND a.tenant_id = $1`,
      [tenant_id]
    );

    const destinatarios = almacenistasResult.rows.map(r => r.adminid);

    for (const destId of destinatarios) {
      await client.query(
        `INSERT INTO notificaciones (
          administrador_id, tipo, titulo, mensaje, metadata, prioridad, leida, tenant_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          destId,
          'prioridad_pedido',
          titulo,
          mensaje,
          JSON.stringify({
            pedidoId,
            motivo: motivo || '',
            marcado_por: usuarioId,
            prioritario,
            usuario_nombre: userName,
            timestamp: new Date().toISOString(),
          }),
          prioritario ? 'alta' : 'normal',
          false,
          tenant_id,
        ]
      );
    }

    logger.info('Pedido prioritario actualizado:', {
      pedidoId,
      prioritario,
      motivo,
      usuarioId,
      destinatarios: destinatarios.length,
      tenantId: tenant_id,
    });

    await client.query('COMMIT');

    return res.json({
      success: true,
      pedidoId,
      prioritario,
      message: prioritario
        ? `Pedido marcado como prioritario. Se notificó a ${destinatarios.length} miembro(s) del equipo de inventarios.`
        : 'Prioridad removida del pedido',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error al actualizar prioridad de pedido:', {
      error: error.message,
      stack: error.stack,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id,
    });
    return res.status(500).json({
      success: false,
      message: 'Error al actualizar prioridad del pedido',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  } finally {
    client.release();
  }
};

module.exports = {
  getAllPedidos,
  getPedidoDetalle,
  confirmarPedido,
  surtirPedido,
  confirmarSurtidoFinanzas,
  rechazarPedidoFinanzas,
  setPrioritario,
};
