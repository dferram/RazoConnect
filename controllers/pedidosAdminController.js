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
const SmartStockService = require('../services/SmartStockService');
const { getPaginationParams, buildPaginationMeta } = require('../utils/pagination');
const { updatePedidoStatus, calcularEstadoPedidoCorrect } = require('../utils/pedidoStatus');
const { ESTADOS_PEDIDO, normalizarEstado } = require('../utils/pedidoEstados');

// Importar controladores delegados (refactorización)
const { confirmarSurtidoFinanzas: confirmarSurtidoFinanzasFromFinanzas } = require('./finanzas/confirmController');
const { rechazarPedidoFinanzas: rechazarPedidoFinanzasFromFinanzas } = require('./finanzas/rejectController');
const { validarYMarcarProductos } = require('./inventarios/markingController');

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

    // ⚠️ CRÍTICO: Obtener admin_responsable_id del usuario para aislamiento
    let adminAsignadoId = null;
    if (isFinanzas) {
      // Finanzas ve pedidos del admin al que está asignado (admin_responsable_id)
      adminAsignadoId = req.user?.admin_responsable_id || null;
      
      if (!adminAsignadoId) {
        logger.warn('⚠️ [PEDIDOS] Usuario finanzas sin admin_responsable_id asignado', {
          userId: req.user?.id,
          adminid: req.user?.adminid,
          rol: userRole
        });
      }
    }

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
        p.pedidoid,
        p.fechapedido,
        p.montototal,
        p.estatus,
        p.costoenvio,
        p.monto_descuento,
        p.cupon_id,
        p.completamente_surtido,
        p.es_historico,
        p.fecha_confirmacion,
        c.nombre as ClienteNombre,
        c.apellido as ClienteApellido,
        c.email as ClienteEmail,
        a.nombre as AgenteNombre,
        a.apellido as AgenteApellido,
        a.codigoagente,
        d.ciudad,
        d.estadoid,
        e.nombre as EstadoNombre
      FROM pedidos p
      LEFT JOIN clientes c ON p.clienteid = c.clienteid
      LEFT JOIN agentesdeventas a ON p.agenteid = a.agenteid
      LEFT JOIN cliente_direcciones d ON p.direccionenvioid = d.direccionid
      LEFT JOIN estados e ON d.estadoid = e.estadoid
      WHERE p.tenant_id = $1
    `;

    // ⚠️ CRÍTICO: Agregar filtro de admin si es finanzas
    if (isFinanzas && adminAsignadoId) {
      query += ` AND p.admin_asignado_id = $2`;
    }

    // FILTRO POR ROL Y TIPO DE VISTA
    if (isInventarios) {
      // Inventarios solo ve ACTIVOS (no entregados)
      query += ` AND p.estatus NOT IN ('Surtido', 'Enviado', 'Entregado')`;
      logger.info('✅ [PEDIDOS] Inventarios - mostrando solo pedidos activos (excluyendo Surtido/Enviado/Entregado)', {
        userId: req.user?.id,
        rol: userRole
      });
    } else if (wantsHistorico) {
      // Finanzas/Admin/SuperAdmin pueden ver históricos (solo Entregado)
      query += ` AND p.estatus IN ('Entregado')`;
      logger.info('✅ [PEDIDOS] Histórico - mostrando solo pedidos entregados', {
        userId: req.user?.id,
        rol: userRole,
        isFinanzas,
        isAdmin,
        adminAsignadoId
      });
    } else {
      // Finanzas/Admin/SuperAdmin ven activos (todo MENOS Entregado)
      query += ` AND p.estatus NOT IN ('Entregado')`;
      logger.info('✅ [PEDIDOS] Activos - mostrando pedidos activos', {
        userId: req.user?.id,
        rol: userRole,
        isFinanzas,
        isAdmin,
        adminAsignadoId
      });
    }

    const params = [tenant_id];
    if (isFinanzas && adminAsignadoId) {
      params.push(adminAsignadoId);
    }
    let paramIndex = params.length + 1;

    if (estatus) {
      query += ` AND p.estatus = $${paramIndex}`;
      params.push(estatus);
      paramIndex++;
    }

    if (clienteId) {
      query += ` AND p.clienteid = $${paramIndex}`;
      params.push(parseInt(clienteId));
      paramIndex++;
    }

    if (agenteId) {
      query += ` AND p.agenteid = $${paramIndex}`;
      params.push(parseInt(agenteId));
      paramIndex++;
    }

    if (fechaInicio) {
      query += ` AND p.fechapedido >= $${paramIndex}`;
      params.push(fechaInicio);
      paramIndex++;
    }

    if (fechaFin) {
      query += ` AND p.fechapedido <= $${paramIndex}`;
      params.push(fechaFin);
      paramIndex++;
    }

    // Count total records for pagination (use same filters as main query)
    const countParams = [tenant_id];
    if (isFinanzas && adminAsignadoId) {
      countParams.push(adminAsignadoId);
    }
    let countParamIndex = countParams.length + 1;
    let countQuery = `SELECT COUNT(*) FROM pedidos p WHERE p.tenant_id = $1`;

    // ⚠️ CRÍTICO: Agregar filtro de admin en COUNT también
    if (isFinanzas && adminAsignadoId) {
      countQuery += ` AND p.admin_asignado_id = $2`;
    }

    // Aplicar mismo filtro por rol en el count
    if (isInventarios) {
      countQuery += ` AND p.estatus NOT IN ('Surtido', 'Enviado', 'Entregado')`;
    } else if (wantsHistorico) {
      countQuery += ` AND p.estatus IN ('Entregado')`;
    } else {
      countQuery += ` AND p.estatus NOT IN ('Entregado')`;
    }

    if (estatus) {
      countQuery += ` AND p.estatus = $${countParamIndex}`;
      countParams.push(estatus);
      countParamIndex++;
    }
    if (clienteId) {
      countQuery += ` AND p.clienteid = $${countParamIndex}`;
      countParams.push(parseInt(clienteId));
      countParamIndex++;
    }
    if (agenteId) {
      countQuery += ` AND p.agenteid = $${countParamIndex}`;
      countParams.push(parseInt(agenteId));
      countParamIndex++;
    }
    if (fechaInicio) {
      countQuery += ` AND p.fechapedido >= $${countParamIndex}`;
      countParams.push(fechaInicio);
      countParamIndex++;
    }
    if (fechaFin) {
      countQuery += ` AND p.fechapedido <= $${countParamIndex}`;
      countParams.push(fechaFin);
      countParamIndex++;
    }
    
    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count, 10);

    query += ` ORDER BY p.fechapedido DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
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
        FROM detallesdelpedido
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

    // ⚠️ CRÍTICO: Obtener admin del cliente para filtrar stock (ANTES de usarlo en queries)
    const estadosHelper = require('../utils/estadosHelper');
    let adminClienteId = null;

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

    // Ahora sí obtenemos el admin del cliente
    adminClienteId = await estadosHelper.getAdminByClienteEstado(pedido.clienteid, tenant_id);

    // Obtener detalles de productos del pedido
    const detallesResult = await db.query(
      `SELECT
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
        COALESCE(dp.estado_producto, 'Pendiente') as estado_producto,
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
          (SELECT cantidad FROM stock_admin WHERE variante_id = pv.varianteid AND admin_id = $3 AND tenant_id = $2 LIMIT 1),
          pv.stock,
          0
        ) as stock,
        pr.nombreproducto,
        COALESCE(
          (SELECT url_imagen FROM producto_variante_imagenes WHERE varianteid = pv.varianteid AND tenant_id = $2 ORDER BY orden ASC LIMIT 1),
          (SELECT url_imagen FROM producto_imagenes WHERE productoid = pv.productoid AND tenant_id = $2 ORDER BY orden ASC LIMIT 1)
        ) as imagenurl,
        row_to_json(ct) as tamano_info
      FROM detallesdelpedido dp
      INNER JOIN producto_variantes pv ON dp.varianteid = pv.varianteid AND pv.tenant_id = $2
      INNER JOIN productos pr ON pv.productoid = pr.productoid AND pr.tenant_id = $2
      LEFT JOIN cat_tamanopaquetes ct ON dp.tamanoid = ct.tamanoid AND ct.tenant_id = $2
      WHERE dp.pedidoid = $1 AND dp.tenant_id = $2
      ORDER BY dp.detalleid`,
      [pedidoId, tenant_id, adminClienteId]
    ).catch(async (error) => {
      // Si el campo confirmado_finanzas no existe, usar query sin ese campo
      if (error.message && error.message.includes('column "confirmado_finanzas" does not exist')) {
        logger.warn('⚠️ Campo confirmado_finanzas no existe. Usando query sin ese campo. Ejecuta add_finanzas_confirmation_fields.sql', { pedidoId });
        return db.query(
          `SELECT
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
            COALESCE(dp.estado_producto, 'Pendiente') as estado_producto,
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
              (SELECT cantidad FROM stock_admin WHERE variante_id = pv.varianteid AND admin_id = $3 AND tenant_id = $2 LIMIT 1),
              pv.stock,
              0
            ) as stock,
            pr.nombreproducto,
            COALESCE(
              (SELECT url_imagen FROM producto_variante_imagenes WHERE varianteid = pv.varianteid AND tenant_id = $2 ORDER BY orden ASC LIMIT 1),
              (SELECT url_imagen FROM producto_imagenes WHERE productoid = pv.productoid AND tenant_id = $2 ORDER BY orden ASC LIMIT 1)
            ) as imagenurl,
            row_to_json(ct) as tamano_info
          FROM detallesdelpedido dp
          INNER JOIN producto_variantes pv ON dp.varianteid = pv.varianteid AND pv.tenant_id = $2
          INNER JOIN productos pr ON pv.productoid = pr.productoid AND pr.tenant_id = $2
          LEFT JOIN cat_tamanopaquetes ct ON dp.tamanoid = ct.tamanoid AND ct.tenant_id = $2
          WHERE dp.pedidoid = $1 AND dp.tenant_id = $2
          ORDER BY dp.detalleid`,
          [pedidoId, tenant_id, adminClienteId]
        );
      }
      throw error;
    });

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
      tenantId: req.tenant?.tenant_id,
      errorMessage: error.message,
      errorStack: error.stack,
      pedidoId: req.params.id
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
      "SELECT PedidoID, Estatus FROM pedidos WHERE PedidoID = $1 AND tenant_id = $2 FOR UPDATE",
      [pedidoId, tenant_id, null, adminClienteId]
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
       FROM detallesdelpedido dp
       INNER JOIN Producto_Variantes pv ON pv.VarianteID = dp.VarianteID
       INNER JOIN Productos pr ON pr.ProductoID = pv.ProductoID
       INNER JOIN Pedidos p ON p.pedidoid = dp.pedidoid
       WHERE dp.pedidoid = $1 AND p.tenant_id = $2`,
      [pedidoId, tenant_id]
    );

    if (!itemsResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "No se puede confirmar: el pedido no tiene productos",
      });
    }

    await client.query(
      "UPDATE Pedidos SET estatus = 'Confirmado', fecha_confirmacion = NOW() WHERE PedidoID = $1 AND tenant_id = $2",
      [pedidoId, tenant_id]
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
 * ✅ DESCUENTA stock_admin inmediatamente al surtir
 * POST /api/admin/pedidos/:id/surtir
 */
const surtirPedido = async (req, res) => {
  const client = await db.getClient();
  
  try {
    const { id: pedidoId } = req.params;
    const { detalleIds } = req.body; // Array de IDs de productos seleccionados
    const { tenant_id } = req.tenant;
    const userRole = (req.user?.rol || req.user?.role || '').toLowerCase().trim();
    const userId = req.user?.id || req.user?.adminid;

    // ⚠️ CRÍTICO: Obtener admin_responsable_id del usuario para filtrar stock correctamente
    const adminIdUser = req.user?.admin_responsable_id ?? req.user?.id;
    console.log('🔍 [SURTIR PEDIDO] Admin ID Being Used:', {
      adminIdUser,
      admin_responsable_id: req.user?.admin_responsable_id,
      user_id: req.user?.id,
      adminid: req.user?.adminid,
      rol: req.user?.rol,
      email: req.user?.email,
      tenantId: tenant_id
    });

    await client.query('BEGIN');

    // Obtener pedido (incluir admin_asignado_id para FIFO)
    const pedidoQuery = `
      SELECT p.pedidoid, p.clienteid, p.agenteid, p.direccionenvioid, p.fechapedido, p.montototal, p.estatus,
             p.costoenvio, p.es_credito, p.fecha_vencimiento, p.pagado, p.transaccion_id, p.comprobante_url,
             p.metodo_pago, p.cupon_id, p.monto_descuento, p.saldo_pendiente, p.url_evidencia_entrega,
             p.fecha_entrega_real, p.tenant_id, p.estatus_deuda, p.dias_atraso, p.tiene_remisiones,
             p.completamente_surtido, p.monto_surtido, p.monto_backorder, p.es_prioritario, p.es_historico,
             p.fecha_confirmacion, p.observaciones_finanzas, p.rechazado_por_finanzas, p.fecha_rechazo_finanzas,
             p.admin_asignado_id,
        (SELECT COUNT(*) FROM detallesdelpedido WHERE pedidoid = p.pedidoid) as total_productos,
        (SELECT COUNT(*) FROM detallesdelpedido WHERE pedidoid = p.pedidoid AND esbackorder = true) as productos_backorder
      FROM pedidos p
      WHERE p.pedidoid = $1 AND p.tenant_id = $2 AND p.admin_asignado_id = $3
    `;

    const pedidoResult = await client.query(pedidoQuery, [pedidoId, tenant_id, adminIdUser]);
    
    if (pedidoResult.rows.length === 0) {
      await client.query('ROLLBACK');
      // Distinguir: ¿pedido no existe vs. no asignado al admin actual?
      const existeResult = await db.query(
        'SELECT pedidoid, admin_asignado_id FROM pedidos WHERE pedidoid = $1 AND tenant_id = $2',
        [pedidoId, tenant_id]
      );
      if (existeResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Pedido no encontrado'
        });
      }
      return res.status(403).json({
        success: false,
        message: 'Este pedido no está asignado a tu inventario. Verifica que el pedido tenga un admin asignado correcto.',
        debug: process.env.NODE_ENV === 'development' ? {
          pedidoId,
          admin_asignado_id: existeResult.rows[0].admin_asignado_id,
          adminIdUser
        } : undefined
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
      // MODO SELECTIVO: Delegar a markingController para validar FIFO y marcar
      const markingResult = await validarYMarcarProductos({
        pedidoId,
        detalleIds,
        pedido,
        tenant_id,
        userId,
        adminIdUser,
        client
      });

      if (!markingResult.success) {
        await client.query('ROLLBACK');

        // Si FIFO bloqueó todos los items seleccionados, marcarlos como 'Bajo pedido'
        // en una operación separada (fuera de la transacción rollbackeada) para
        // desbloquear el pedido del estado 'Combinado'.
        const idsBackorder = markingResult.idsParaMarcarBajoPedido || [];
        if (idsBackorder.length > 0) {
          try {
            await db.query(
              `UPDATE detallesdelpedido
               SET estado_producto = 'Bajo pedido'
               WHERE pedidoid = $1
                 AND detalleid = ANY($2::int[])
                 AND tenant_id = $3
                 AND cantidadsurtida = 0`,
              [pedidoId, idsBackorder, tenant_id]
            );
            await updatePedidoStatus(pedidoId, tenant_id);
            logger.info('📦 Items FIFO-backorder reclasificados a Bajo pedido (post-ROLLBACK):', {
              pedidoId,
              idsBackorder,
              tenantId: tenant_id
            });
          } catch (rescueError) {
            logger.warn('No se pudo reclasificar items backorder:', {
              error: rescueError.message,
              pedidoId
            });
          }
        }

        return res.status(400).json({
          success: false,
          message: markingResult.message,
          razon: markingResult.razon,
          detalles_fifo: markingResult.detalles_fifo,
          analisis: markingResult.analisis
        });
      }

      // ✅ Obtener resultados del marking
      marcarResult = markingResult.marcarResult;
      const { productosCompletos, productosParciales, productosAlcanza } = markingResult;

      logger.info('✅ Productos marcados por markingController (FIFO):', {
        pedidoId,
        admin_asignado_id: pedido.admin_asignado_id,
        completos: productosCompletos.length,
        parciales: productosParciales.length,
        totalMarcados: marcarResult.rowCount,
        tenantId: tenant_id
      });
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
        SET cantidadsurtida = cantidadpaquetes,
            estado_producto = 'Surtido'
        FROM producto_variantes pv
        LEFT JOIN stock_admin sa ON sa.variante_id = d.varianteid AND sa.tenant_id = d.tenant_id AND sa.admin_id = $3
        WHERE d.pedidoid = $1
          AND d.esbackorder = false
          AND d.cantidadsurtida = 0
          AND d.tenant_id = $2
          AND pv.varianteid = d.varianteid
          AND pv.tenant_id = $2
          AND (
            CASE
              WHEN sa.cantidad IS NOT NULL THEN sa.cantidad >= d.piezastotales
              ELSE pv.stock >= d.piezastotales
            END
          )
        RETURNING d.detalleid, d.cantidadsurtida, d.cantidadpaquetes, d.estado_producto
      `;
      
      marcarResult = await client.query(marcarSurtidosQuery, [pedidoId, tenant_id, adminIdUser]);
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
        AND (
          (dp.cantidadsurtida > 0 AND ${detalleIds && detalleIds.length > 0 ? 'dp.detalleid = ANY($3::int[])' : 'TRUE'})
          OR
          (${detalleIds && detalleIds.length > 0 ? 'dp.detalleid = ANY($3::int[])' : 'FALSE'})
        )
    `;
    
    const detallesMarcadosParams = detalleIds && detalleIds.length > 0 
      ? [pedidoId, tenant_id, detalleIds]
      : [pedidoId, tenant_id];
    
    const detallesMarcadosResult = await client.query(detallesMarcadosQuery, detallesMarcadosParams);
    
    // Insertar registro en historial_pedidos para auditoría
    try {
      await client.query(
        `INSERT INTO historial_pedidos (
          pedido_id,
          accion,
          detalles,
          usuario_id,
          tenant_id
        ) VALUES ($1, $2, $3, $4, $5)`,
        [
          pedidoId,
          'SURTIDO_INVENTARIOS',
          JSON.stringify({
            productos_marcados: detallesMarcadosResult.rows.map(r => ({
              detalle_id: r.detalleid,
              variante_id: r.varianteid,
              sku: r.sku,
              nombre: r.nombreproducto,
              cantidad_surtida: r.cantidadsurtida,
              piezas_totales: r.piezastotales
            })),
            cantidad_productos: marcarResult.rowCount,
            modo: detalleIds && detalleIds.length > 0 ? 'selectivo' : 'todos',
            timestamp: new Date().toISOString()
          }),
          req.user?.id || req.user?.adminid || null,
          tenant_id
        ]
      );
    } catch (auditError) {
      logger.warn('No se pudo registrar en historial_pedidos:', { error: auditError.message });
    }

    logger.info('Productos marcados para surtir:', {
      pedidoId,
      productosRegistrados: detallesMarcadosResult.rows.length
    });

    // 🔥 CRÍTICO: Actualizar stock e insertar en pedido_surtido_detalle
    // Por cada producto marcado, debemos:
    // 1. Restar del stock_admin la cantidad de piezas surtidas
    // 2. Insertar registro en pedido_surtido_detalle con las piezas correctas
    
    for (const detalle of detallesMarcadosResult.rows) {
      const adminId = adminIdUser; // Usar el admin asignado, no el admin del usuario actual

      // ✅ IMPORTANTE: Usar cantidadsurtida (cantidad real surtida)
      // Para productos completos: cantidadsurtida = piezastotales
      // Para productos parciales: cantidadsurtida = piezasDisponibles
      const piezasSurtidas = parseInt(detalle.cantidadsurtida || 0, 10);

      if (piezasSurtidas <= 0) {
        logger.warn('⚠️ Producto sin cantidad surtida, saltando:', {
          detalleId: detalle.detalleid,
          cantidadsurtida: detalle.cantidadsurtida
        });
        continue;
      }

      // 1. Obtener stock actual del admin que surte
      const stockActualResult = await client.query(
        `SELECT cantidad FROM stock_admin
         WHERE variante_id = $1 AND admin_id = $2 AND tenant_id = $3`,
        [detalle.varianteid, adminId, tenant_id]
      );

      if (stockActualResult.rows.length === 0) {
        // ❌ FATAL: el producto fue marcado como surtido pero no hay stock_admin.
        // Hacer ROLLBACK para evitar inconsistencia de datos (marcado sin descuento).
        await client.query('ROLLBACK');
        logger.error('❌ [SURTIR] No existe registro stock_admin — abortando para evitar inconsistencia:', {
          detalleId: detalle.detalleid,
          varianteId: detalle.varianteid,
          adminId,
          pedidoId,
          tenantId: tenant_id
        });
        return res.status(409).json({
          success: false,
          message: `El admin asignado no tiene inventario registrado para el producto SKU: ${detalle.sku}. Recibe el inventario primero antes de surtir.`,
          data: { detalleId: detalle.detalleid, varianteId: detalle.varianteid, adminId }
        });
      }

      const stockPrevio = parseInt(stockActualResult.rows[0].cantidad || 0, 10);
      const stockPosterior = stockPrevio - piezasSurtidas;

      // 2. Descontar stock inmediatamente al surtir
      // ⚠️ CRÍTICO: También ajustar cantidad_reservada para mantener el constraint
      // chk_reserva_no_excede_stock (cantidad_reservada <= cantidad)
      await client.query(
        `UPDATE stock_admin
         SET cantidad = $1,
             cantidad_reservada = GREATEST(0, cantidad_reservada - $5)
         WHERE variante_id = $2 AND admin_id = $3 AND tenant_id = $4`,
        [stockPosterior, detalle.varianteid, adminId, tenant_id, piezasSurtidas]
      );

      // 3. Registrar movimiento de inventario
      await client.query(
        `INSERT INTO movimientos_inventario
         (admin_id, variante_id, tenant_id, tipo, cantidad, stock_previo, stock_posterior, motivo, observaciones)
         VALUES ($1, $2, $3, 'MERMA', $4, $5, $6, 'Surtido de pedido', $7)`,
        [
          adminId, detalle.varianteid, tenant_id,
          piezasSurtidas, stockPrevio, stockPosterior,
          `Pedido #${pedidoId}: surtido por inventarios`
        ]
      );

      logger.info('✅ Stock descontado al surtir:', {
        pedidoId,
        detalleId: detalle.detalleid,
        varianteId: detalle.varianteid,
        adminId,
        piezasSurtidas,
        stockPrevio,
        stockPosterior
      });

      // 4. Registrar en pedido_surtido_detalle para auditoría y para poder revertir
      await client.query(
        `INSERT INTO pedido_surtido_detalle
         (pedido_id, detalle_id, variante_id, admin_id, cantidad, tenant_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [pedidoId, detalle.detalleid, detalle.varianteid, adminId, piezasSurtidas, tenant_id]
      );

      logger.info('✅ Surtido registrado (completo o parcial):', {
        pedidoId,
        detalleId: detalle.detalleid,
        varianteId: detalle.varianteid,
        piezasSurtidas,
        estadoProducto: detalle.estado_producto,
        adminId,
        tenantId: tenant_id
      });
    }

    // ✅ NUEVA LÓGICA: Calcular estado del pedido DINÁMICAMENTE basado en estado de detalles
    // Obtener TODOS los detalles del pedido para analizar su estado
    const estadosDetallesQuery = `
      SELECT
        detalleid,
        estado_producto,
        cantidadsurtida,
        piezastotales
      FROM detallesdelpedido
      WHERE pedidoid = $1 AND tenant_id = $2
      ORDER BY detalleid
    `;

    const estadosDetallesResult = await client.query(estadosDetallesQuery, [pedidoId, tenant_id]);
    const detalles = estadosDetallesResult.rows;

    // Contar estados de productos
    const surtidos = detalles.filter(d => d.estado_producto === 'Surtido').length;
    const bajosPedido = detalles.filter(d => d.estado_producto === 'Bajo pedido').length;
    const conStock = detalles.filter(d => d.estado_producto === 'Con stock').length;
    const totalDetalles = detalles.length;

    // Calcular nuevo estado del pedido basado en estado de detalles
    let nuevoEstatus = 'Bajo pedido'; // default
    let completamenteSurtido = false;

    if (surtidos === totalDetalles && surtidos > 0) {
      // ✅ TODOS surtidos por inventarios → Listo para que finanzas confirme
      nuevoEstatus = 'Listo para remisionar';
      completamenteSurtido = false;
    } else if (surtidos > 0 && (bajosPedido > 0 || conStock > 0)) {
      // ⚠️ MIX: algunos surtidos + otros pending/con stock → Combinado
      nuevoEstatus = 'Combinado';
      completamenteSurtido = false;
    } else if (conStock === totalDetalles && surtidos === 0 && bajosPedido === 0) {
      // 🟢 TODOS con stock pero NO surtidos aún
      nuevoEstatus = 'Con stock';
      completamenteSurtido = false;
    } else if (bajosPedido === totalDetalles && surtidos === 0 && conStock === 0) {
      // 🔴 TODOS bajo pedido, nada surtido
      nuevoEstatus = 'Bajo pedido';
      completamenteSurtido = false;
    }

    logger.info('✅ [ESTADO] Calculado estado del pedido dinámicamente', {
      pedidoId,
      productosActualizados: marcarResult.rowCount,
      surtidos,
      bajosPedido,
      conStock,
      totalDetalles,
      nuevoEstatus,
      completamenteSurtido,
      tenantId: tenant_id,
      detalles: detalles.map(d => ({
        detalleid: d.detalleid,
        estado_producto: d.estado_producto,
        cantidadsurtida: d.cantidadsurtida,
        piezastotales: d.piezastotales
      }))
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
      message: `Pedido enviado a finanzas para confirmación. ${marcarResult.rowCount} producto(s) marcado(s) como listo(s) para remisionar, ${productosBackorder} en backorder. Stock descontado inmediatamente.`,
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

    // 🔑 CRÍTICO: Recalcular FIFO para todas las variantes del pedido
    if (prioritario) {
      try {
        const variantesResult = await client.query(
          `SELECT DISTINCT d.varianteid FROM detallesdelpedido d
           WHERE d.pedidoid = $1 AND d.tenant_id = $2`,
          [pedidoId, tenant_id]
        );

        const SmartStockService = require('../services/SmartStockService');

        for (const row of variantesResult.rows) {
          const varianteId = row.varianteid;
          await SmartStockService.reallocateStockForVariant(varianteId, tenant_id);
          logger.info(`[setPrioritario] Realocado stock para variante ${varianteId} por pedido prioritario`);
        }
      } catch (error) {
        logger.error('Error recalculando FIFO después de marcar prioritario:', error);
        // Continuar aunque falle - no bloquear la marca de prioritario
      }
    }

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
  // Delegadas a controladores específicos (refactorización)
  confirmarSurtidoFinanzas: confirmarSurtidoFinanzasFromFinanzas,
  rechazarPedidoFinanzas: rechazarPedidoFinanzasFromFinanzas,
  setPrioritario,
};
