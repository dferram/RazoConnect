/**
 * ÓRDENES DE COMPRA CONTROLLER
 * 
 * Controlador especializado para la gestión de órdenes de compra.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * CARACTERÍSTICAS:
 * - Transacciones atómicas con rollback automático
 * - Validación de proveedores y productos
 * - Gestión de detalles de orden
 * - Filtrado por admin (multi-tenant)
 * 
 * @module controllers/ordenesCompraController
 * @author RazoConnect Team
 * @date 2026-02-26
 */

const db = require('../db');
const { executeTransaction } = require('../utils/transactionManager');

/**
 * Obtener todas las órdenes de compra con filtros
 * 
 * @route GET /api/admin/ordenes-compra
 * @param {Object} req.query.estatus - Filtrar por estatus
 * @param {Object} req.query.adminId - Filtrar por admin (solo superadmin)
 * @param {Object} req.query.origen - Filtrar por origen (backorder/manual)
 * @param {Object} req.query.proveedorId - Filtrar por proveedor
 * @param {Object} req.query.soloRecibidas - Solo órdenes con productos recibidos
 */
const getAllOrdenesCompra = async (req, res) => {
  try {
    const { estatus, adminId, origen, proveedorId, soloRecibidas } = req.query;
    const userRole = req.user.rol;
    const userId = req.user.id;
    const { tenant_id } = req.tenant;

    let query = `
      SELECT 
        oc.ordencompraid,
        oc.proveedorid,
        oc.fechacreacion,
        oc.fechaentregaesperada,
        oc.estatus,
        oc.origenoc,
        oc.usuario_creador_id,
        oc.admin_creador_id,
        p.nombreempresa as proveedornombre,
        COUNT(doc.detalleoc_id) as totalproductos,
        a.nombre as adminnombre,
        CONCAT(c.nombre, ' ', c.apellido) as nombrecliente,
        COALESCE(SUM(doc.cantidadrecibida), 0) as total_recibido
      FROM ordenesdecompra oc
      INNER JOIN proveedores p ON oc.proveedorid = p.proveedorid
      LEFT JOIN detallesordencompra doc ON oc.ordencompraid = doc.ordencompraid
      LEFT JOIN administradores a ON oc.admin_creador_id = a.adminid
      LEFT JOIN pedidos ped ON oc.pedido_origen_id = ped.pedidoid
      LEFT JOIN clientes c ON ped.clienteid = c.clienteid
      WHERE oc.tenant_id = $1
    `;

    const values = [tenant_id];
    let paramIndex = 2;

    // REGLA DE VISIBILIDAD: Admin solo ve sus órdenes, SuperAdmin ve todas
    if (userRole === 'admin') {
      query += ` AND oc.admin_creador_id = $${paramIndex}`;
      values.push(userId);
      paramIndex++;
    } else if (userRole === 'superadmin' && adminId) {
      query += ` AND oc.admin_creador_id = $${paramIndex}`;
      values.push(parseInt(adminId));
      paramIndex++;
    }

    // Filtrar por estatus
    if (estatus) {
      if (estatus === "Pendiente,Parcial") {
        query += ` AND oc.estatus IN ('Pendiente', 'Parcial')`;
      } else {
        query += ` AND oc.estatus = $${paramIndex}`;
        values.push(estatus);
        paramIndex++;
      }
    }

    // Filtrar por origen
    if (origen) {
      if (origen === 'backorder') {
        query += ` AND oc.origenoc = 'backorder'`;
      } else if (origen === 'manual') {
        query += ` AND (oc.origenoc IS NULL OR oc.origenoc = 'manual')`;
      }
    }

    // Filtrar por proveedor
    if (proveedorId) {
      query += ` AND oc.proveedorid = $${paramIndex}`;
      values.push(parseInt(proveedorId));
      paramIndex++;
    }

    query += `
      GROUP BY oc.ordencompraid, oc.proveedorid, oc.fechacreacion, 
               oc.fechaentregaesperada, oc.estatus, oc.origenoc, oc.usuario_creador_id,
               oc.admin_creador_id, p.nombreempresa, a.nombre, c.nombre, c.apellido
    `;

    // Solo órdenes con productos recibidos
    if (soloRecibidas === 'true') {
      query += ` HAVING COALESCE(SUM(doc.cantidadrecibida), 0) > 0`;
    }

    query += ` ORDER BY oc.fechacreacion DESC`;

    const result = await db.query(query, values);

    res.json({
      success: true,
      message: "Órdenes de compra obtenidas exitosamente",
      data: {
        ordenes: result.rows.map((row) => ({
          ordenCompraId: row.ordencompraid,
          ordencompraid: row.ordencompraid,
          proveedorId: row.proveedorid,
          proveedorNombre: row.proveedornombre,
          proveedor_nombre: row.proveedornombre,
          fechaCreacion: row.fechacreacion,
          fechaEntregaEsperada: row.fechaentregaesperada,
          estatus: row.estatus,
          origenOC: row.origenoc,
          totalProductos: parseInt(row.totalproductos),
          usuarioCreadorId: row.usuario_creador_id,
          adminCreadorId: row.admin_creador_id,
          admin_nombre: row.adminnombre || 'Sin asignar',
          propietarioNombre: row.adminnombre || 'Sin asignar',
          nombreCliente: row.nombrecliente || null,
        })),
        total: result.rows.length,
      },
    });
  } catch (error) {
    console.error("Error al obtener órdenes de compra:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener órdenes de compra",
    });
  }
};

/**
 * Crear una nueva orden de compra con transacciones atómicas
 * 
 * @route POST /api/admin/ordenes-compra
 * @param {Object} req.body.proveedorId - ID del proveedor
 * @param {Object} req.body.fechaEntregaEsperada - Fecha esperada de entrega
 * @param {Array} req.body.productos - Array de productos a ordenar
 */
const crearOrdenCompra = async (req, res) => {
  try {
    const { proveedorId, fechaEntregaEsperada, productos } = req.body;
    const { tenant_id } = req.tenant;

    // Validaciones previas (fuera de transacción)
    if (!proveedorId) {
      return res.status(400).json({
        success: false,
        message: "El proveedor es requerido",
      });
    }

    if (!fechaEntregaEsperada) {
      return res.status(400).json({
        success: false,
        message: "La fecha de entrega esperada es requerida",
      });
    }

    if (!productos || !Array.isArray(productos) || productos.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Debe incluir al menos un producto",
      });
    }

    // Validar cada producto
    for (const producto of productos) {
      if (!producto.varianteId || !producto.cantidadSolicitada) {
        return res.status(400).json({
          success: false,
          message: "Cada producto debe tener varianteId y cantidadSolicitada",
        });
      }

      if (producto.cantidadSolicitada <= 0) {
        return res.status(400).json({
          success: false,
          message: "La cantidad solicitada debe ser mayor a 0",
        });
      }

      const piezasPorPaqueteParsed = Number.parseInt(
        producto.piezasPorPaquete ?? producto.piezasporpaquete ?? 1,
        10
      );
      if (!Number.isInteger(piezasPorPaqueteParsed) || piezasPorPaqueteParsed <= 0) {
        return res.status(400).json({
          success: false,
          message: "piezasPorPaquete inválido",
        });
      }

      const costoRaw =
        producto.costoUnitario ?? producto.costounitario ?? producto.costo_unitario;
      if (costoRaw !== undefined && costoRaw !== null && costoRaw !== "") {
        const costoParsed = Number.parseFloat(costoRaw);
        if (!Number.isFinite(costoParsed) || costoParsed < 0) {
          return res.status(400).json({
            success: false,
            message: "costoUnitario inválido",
          });
        }
      }
    }

    // Ejecutar creación dentro de transacción atómica
    const result = await executeTransaction(async (client, logger) => {
      logger.logOperation('INICIO_CREAR_ORDEN', { proveedorId, productosCount: productos.length });

      // Verificar que el proveedor existe
      const proveedorCheck = await client.query(
        "SELECT ProveedorID FROM Proveedores WHERE ProveedorID = $1 AND tenant_id = $2",
        [proveedorId, tenant_id]
      );

      if (proveedorCheck.rows.length === 0) {
        throw new Error("Proveedor no encontrado");
      }

      // Crear la orden de compra
      const ordenQuery = `
        INSERT INTO OrdenesDeCompra (ProveedorID, FechaEntregaEsperada, Estatus, usuario_creador_id, tenant_id, admin_creador_id)
        VALUES ($1, $2, 'Pendiente', $3, $4, $5)
        RETURNING OrdenCompraID, ProveedorID, FechaCreacion, FechaEntregaEsperada, Estatus
      `;

      const ordenResult = await client.query(ordenQuery, [
        proveedorId,
        fechaEntregaEsperada,
        req.user.id,
        tenant_id,
        req.user.id, // admin_creador_id
      ]);

      const ordenCompra = ordenResult.rows[0];
      const ordenCompraId = ordenCompra.ordencompraid;

      logger.logOperation('ORDEN_CREADA', { ordenCompraId });

      // Insertar detalles de la orden
      const detallesInsertados = [];
      let totalCents = 0;

      for (const producto of productos) {
        // Verificar que la variante existe
        const varianteResult = await client.query(
          `SELECT pv.VarianteID, pv.ProductoID, pv.SKU, pv.Dimensiones, pv.MedidaID, pv.CostoUnitario, pr.NombreProducto
           FROM Producto_Variantes pv
           INNER JOIN Productos pr ON pv.ProductoID = pr.ProductoID
           WHERE pv.VarianteID = $1 AND pr.tenant_id = $2`,
          [producto.varianteId, tenant_id]
        );

        if (varianteResult.rows.length === 0) {
          throw new Error(`Variante con ID ${producto.varianteId} no encontrada`);
        }

        const variante = varianteResult.rows[0];

        if (producto.productoId && producto.productoId !== variante.productoid) {
          throw new Error("La variante seleccionada no pertenece al producto indicado");
        }

        const piezasPorPaquete = Number.parseInt(
          producto.piezasPorPaquete ?? producto.piezasporpaquete ?? 1,
          10
        );

        const costoUnitario = (() => {
          const costoRaw =
            producto.costoUnitario ?? producto.costounitario ?? producto.costo_unitario;
          const costoParsed = Number.parseFloat(costoRaw);
          if (Number.isFinite(costoParsed) && costoParsed >= 0) return costoParsed;
          const fallback = Number.parseFloat(variante.costounitario);
          if (Number.isFinite(fallback) && fallback >= 0) return fallback * piezasPorPaquete;
          return 0;
        })();

        const cantidadSolicitada = Number.parseInt(producto.cantidadSolicitada, 10);
        if (Number.isInteger(cantidadSolicitada) && cantidadSolicitada > 0) {
          totalCents += Math.round(costoUnitario * 100) * cantidadSolicitada;
        }

        const detalleQuery = `
          INSERT INTO DetallesOrdenCompra (OrdenCompraID, VarianteID, CantidadSolicitada, CantidadRecibida, PiezasPorPaquete, CostoUnitario, tenant_id)
          VALUES ($1, $2, $3, 0, $4, $5, $6)
          RETURNING DetalleOC_ID, VarianteID, CantidadSolicitada, CantidadRecibida
        `;

        const detalleResult = await client.query(detalleQuery, [
          ordenCompraId,
          variante.varianteid,
          producto.cantidadSolicitada,
          piezasPorPaquete,
          costoUnitario,
          tenant_id,
        ]);

        detallesInsertados.push({
          detalleId: detalleResult.rows[0].detalleoc_id,
          varianteId: detalleResult.rows[0].varianteid,
          productoId: variante.productoid,
          nombreProducto: variante.nombreproducto,
          sku: variante.sku,
          medidaId: variante.medidaid,
          dimensiones: variante.dimensiones,
          cantidadSolicitada: detalleResult.rows[0].cantidadsolicitada,
          cantidadRecibida: detalleResult.rows[0].cantidadrecibida,
        });

        logger.logOperation('DETALLE_INSERTADO', { sku: variante.sku, cantidad: producto.cantidadSolicitada });
      }

      // Actualizar total de la orden
      const totalMonetario = totalCents / 100;
      await client.query(
        "UPDATE OrdenesDeCompra SET Total = $1 WHERE OrdenCompraID = $2 AND tenant_id = $3",
        [totalMonetario, ordenCompraId, tenant_id]
      );

      logger.logOperation('TOTAL_ACTUALIZADO', { total: totalMonetario });

      return {
        success: true,
        ordenCompra,
        detallesInsertados,
        ordenCompraId
      };

    }, {
      context: {
        userId: req.user.id,
        endpoint: 'POST /api/admin/ordenes-compra',
        proveedorId
      },
      timeout: 30000
    });

    console.log(`✅ [ORDEN COMPRA] Orden #${result.ordenCompraId} creada exitosamente`);

    res.status(201).json({
      success: true,
      message: "Orden de compra creada exitosamente",
      data: {
        ordenCompra: {
          ordenCompraId: result.ordenCompraId,
          proveedorId: result.ordenCompra.proveedorid,
          fechaCreacion: result.ordenCompra.fechacreacion,
          fechaEntregaEsperada: result.ordenCompra.fechaentregaesperada,
          estatus: result.ordenCompra.estatus,
        },
        detalles: result.detallesInsertados,
      },
    });

  } catch (error) {
    console.error("❌ [ORDEN COMPRA] Error al crear:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al crear la orden de compra",
    });
  }
};

module.exports = {
  getAllOrdenesCompra,
  crearOrdenCompra
};
