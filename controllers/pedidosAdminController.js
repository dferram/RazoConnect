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
    const { estatus, clienteId, agenteId, fechaInicio, fechaFin } = req.query;
    const { limit, offset, page } = getPaginationParams(req.query);

    let query = `
      SELECT 
        p.PedidoID,
        p.FechaPedido,
        p.MontoTotal,
        p.Estatus,
        p.CostoEnvio,
        p.Monto_Descuento,
        p.Cupon_ID,
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
        COALESCE(
          dp.preciounitario, 
          ROUND(dp.precioporpaquete / NULLIF((dp.piezastotales / NULLIF(dp.cantidadpaquetes, 0)), 0), 2)
        ) as preciounitariocalculado,
        pv.sku,
        pv.dimensiones,
        pv.productoid,
        pv.color_nombre,
        pv.color_hex,
        pv.stock,
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

    const motivo = `Venta Pedido #${pedidoId}`;

    for (const item of itemsResult.rows) {
      const varianteId = Number.parseInt(item.varianteid, 10);
      const piezasTotales = Number.parseInt(item.piezastotales, 10);

      if (!Number.isInteger(varianteId) || varianteId <= 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "No se pudo confirmar: item inválido (varianteId)",
        });
      }

      if (!Number.isInteger(piezasTotales) || piezasTotales <= 0) {
        continue;
      }

      try {
        await inventoryService.registrarMovimiento(client, {
          varianteId,
          cantidadDelta: -1 * piezasTotales,
          motivo,
          usuarioId: req.user.id,
          esExcepcion: false,
        });
      } catch (invError) {
        await client.query("ROLLBACK");

        const nombre = (item.nombreproducto || "Producto").toString().trim();
        const sku = (item.sku || "").toString().trim();
        const ref = sku ? `${nombre} (${sku})` : nombre;

        if (invError && invError.code === "STOCK_INSUFICIENTE") {
          return res.status(400).json({
            success: false,
            message: `No se pudo confirmar: Stock insuficiente para el producto ${ref}`,
            code: invError.code,
          });
        }

        return res.status(500).json({
          success: false,
          message: `No se pudo confirmar: Error al descontar inventario para ${ref}`,
          code: invError.code,
        });
      }
    }

    await client.query(
      "UPDATE Pedidos SET Estatus = 'Confirmado' WHERE PedidoID = $1",
      [pedidoId]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Pedido confirmado exitosamente",
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

module.exports = {
  getAllPedidos,
  getPedidoDetalle,
  confirmarPedido
};
