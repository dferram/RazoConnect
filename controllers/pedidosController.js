const db = require("../db");
const { enviarEmail } = require("../services/emailService");

/**
 * Crear un nuevo pedido desde el carrito
 * POST /api/pedidos
 */
const crearPedido = async (req, res) => {
  const client = await db.pool.connect();
  let transactionStarted = false;

  try {
    const clienteId = req.user.userId;
    const { DireccionEnvioID } = req.body;

    // Validar datos de entrada
    if (!DireccionEnvioID) {
      return res.status(400).json({
        success: false,
        message: "DireccionEnvioID es requerido",
      });
    }

    // Iniciar transacción
    await client.query("BEGIN");
    transactionStarted = true;

    // 1. Verificar que la dirección pertenece al cliente
    const direccionResult = await client.query(
      "SELECT DireccionID FROM Cliente_Direcciones WHERE DireccionID = $1 AND ClienteID = $2",
      [DireccionEnvioID, clienteId]
    );

    if (direccionResult.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(404).json({
        success: false,
        message: "Dirección no encontrada o no pertenece al cliente",
      });
    }

    // 2. Obtener el carrito del cliente
    const carritoResult = await client.query(
      "SELECT CarritoID FROM CarritoDeCompra WHERE ClienteID = $1",
      [clienteId]
    );

    if (carritoResult.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(400).json({
        success: false,
        message: "No tienes un carrito activo",
      });
    }

    const carritoId = carritoResult.rows[0].carritoid;

    // 3. Obtener los items del carrito con información de productos
    const itemsResult = await client.query(
      `SELECT 
        ic.itemid,
        ic.varianteid,
        ic.cantidad,
        ic.tamanoid,
        t.valor AS tamano_valor,
        pv.productoid,
        pv.sku,
        pv.dimensiones,
        pv.preciounitario,
        pv.stock,
        pv.costounitario,
        p.nombreproducto
      FROM itemsdelcarrito ic
      INNER JOIN producto_variantes pv ON pv.varianteid = ic.varianteid
      INNER JOIN productos p ON p.productoid = pv.productoid
      INNER JOIN cat_tamanopaquetes t ON t.tamanoid = ic.tamanoid
      WHERE ic.carritoid = $1
      FOR UPDATE OF pv`,
      [carritoId]
    );

    if (itemsResult.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(400).json({
        success: false,
        message: "El carrito está vacío",
      });
    }

    const items = itemsResult.rows;

    // 4. Validar stock para todos los productos
    for (const item of items) {
      const stockDisponible =
        item.stock !== null ? parseInt(item.stock, 10) : 0;
      const tamanoValor =
        item.tamano_valor !== null ? parseInt(item.tamano_valor, 10) : 0;
      const totalPiezasSolicitadas = tamanoValor * item.cantidad;

      if (!tamanoValor || tamanoValor <= 0) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(400).json({
          success: false,
          message: `El tamaño seleccionado es inválido para ${item.nombreproducto} (${item.sku})`,
        });
      }

      if (stockDisponible < totalPiezasSolicitadas) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(400).json({
          success: false,
          message: `Stock insuficiente para ${item.nombreproducto} (${item.sku}). Disponible: ${stockDisponible} piezas, Solicitado: ${totalPiezasSolicitadas}`,
        });
      }
    }

    // 5. Calcular el monto total
    const montoTotal = items.reduce((total, item) => {
      const precioUnitario =
        item.preciounitario !== null ? parseFloat(item.preciounitario) : 0;
      const tamanoValor =
        item.tamano_valor !== null ? parseInt(item.tamano_valor, 10) : 0;
      return total + item.cantidad * tamanoValor * precioUnitario;
    }, 0);

    // 6. Obtener el agente asignado al cliente (si existe)
    const clienteAgenteResult = await client.query(
      "SELECT AgenteID FROM Clientes WHERE ClienteID = $1",
      [clienteId]
    );

    if (clienteAgenteResult.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(404).json({
        success: false,
        message: "Cliente no encontrado",
      });
    }

    const agenteId = clienteAgenteResult.rows[0].agenteid
      ? parseInt(clienteAgenteResult.rows[0].agenteid, 10)
      : null;

    // 7. Crear el pedido
    const pedidoResult = await client.query(
      `INSERT INTO Pedidos (ClienteID, AgenteID, DireccionEnvioID, MontoTotal, Estatus)
       VALUES ($1, $2, $3, $4, 'Pendiente')
       RETURNING PedidoID, FechaPedido, MontoTotal, Estatus`,
      [clienteId, agenteId, DireccionEnvioID, montoTotal]
    );

    const pedido = pedidoResult.rows[0];
    const pedidoId = pedido.pedidoid;

    // 8. Crear los detalles del pedido y actualizar inventario
    const detallesPedido = [];
    for (const item of items) {
      const tamanoValor =
        item.tamano_valor !== null ? parseInt(item.tamano_valor, 10) : 0;
      const precioUnitario =
        item.preciounitario !== null ? parseFloat(item.preciounitario) : 0;
      const piezasTotales = tamanoValor * item.cantidad;
      const subtotal = parseFloat((precioUnitario * piezasTotales).toFixed(2));

      // Insertar detalle del pedido
      const detalleResult = await client.query(
        `INSERT INTO DetallesDelPedido (PedidoID, VarianteID, TamanoID, Cantidad, PrecioUnitarioAplicado, PiezasTotales)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING DetalleID`,
        [
          pedidoId,
          item.varianteid,
          item.tamanoid,
          item.cantidad,
          precioUnitario.toFixed(2),
          piezasTotales,
        ]
      );

      // Actualizar stock del producto
      const nuevoStockVariante = parseInt(item.stock, 10) - piezasTotales;
      await client.query(
        "UPDATE producto_variantes SET Stock = $1 WHERE VarianteID = $2",
        [nuevoStockVariante, item.varianteid]
      );

      // Crear registro en Log_Inventario
      await client.query(
        `INSERT INTO Log_Inventario (VarianteID, CantidadCambiado, NuevoStock, Motivo, UsuarioID)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          item.varianteid,
          -piezasTotales,
          nuevoStockVariante,
          `Venta Pedido #${pedidoId}`,
          clienteId,
        ]
      );

      detallesPedido.push({
        detalleId: detalleResult.rows[0].detalleid,
        varianteId: item.varianteid,
        productoId: item.productoid,
        nombreProducto: item.nombreproducto,
        tamanoId: item.tamanoid,
        cantidad: item.cantidad,
        piezasPorTamano: tamanoValor,
        precioUnitario,
        piezasTotales,
        subtotal,
        sku: item.sku,
        dimensiones: item.dimensiones,
      });
    }

    // 9. Crear comisión si se usó código de agente
    let comision = null;
    if (agenteId) {
      const montoComision = montoTotal * 0.2; // 20% de comisión
      const comisionResult = await client.query(
        `INSERT INTO Comisiones (PedidoID, AgenteID, MontoComision, Estatus)
         VALUES ($1, $2, $3, 'Pendiente')
         RETURNING ComisionID, MontoComision, FechaCalculo`,
        [pedidoId, agenteId, montoComision]
      );

      comision = {
        comisionId: comisionResult.rows[0].comisionid,
        agenteId: agenteId,
        montoComision: parseFloat(comisionResult.rows[0].montocomision),
        fechaCalculo: comisionResult.rows[0].fechacalculo,
        estatus: "Pendiente",
      };
    }

    // 10. Limpiar el carrito
    await client.query("DELETE FROM ItemsDelCarrito WHERE CarritoID = $1", [
      carritoId,
    ]);

    // Confirmar transacción
    await client.query("COMMIT");
    transactionStarted = false;

    const respuesta = {
      success: true,
      message: "Pedido creado exitosamente",
      data: {
        pedido: {
          pedidoId: pedido.pedidoid,
          fechaPedido: pedido.fechapedido,
          montoTotal: parseFloat(pedido.montototal),
          estatus: pedido.estatus,
          detalles: detallesPedido,
          comision: comision,
        },
      },
    };

    res.status(201).json(respuesta);

    const emailCliente = req.user?.email;
    if (emailCliente) {
      const asunto = `Tu pedido RazoConnect ha sido recibido (#${pedido.pedidoid})`;
      const cuerpoHtml = `
        <div style="font-family: Arial, sans-serif; color: #1f2937;">
          <h2 style="color:#f97316;">¡Gracias por tu compra!</h2>
          <p>Hemos recibido tu pedido <strong>#${
            pedido.pedidoid
          }</strong> y ya estamos procesándolo.</p>
          <p>Monto total: <strong>$${parseFloat(pedido.montototal).toFixed(
            2
          )}</strong></p>
          <p>Te avisaremos cuando esté confirmado y en camino.</p>
          <p style="margin-top: 1.5rem;">Equipo RazoConnect</p>
        </div>
      `;

      enviarEmail(emailCliente, asunto, cuerpoHtml).catch((err) => {
        console.error("No se pudo enviar correo de recibo de pedido:", err);
      });
    }
  } catch (error) {
    // Revertir transacción en caso de error
    if (transactionStarted) {
      await client.query("ROLLBACK");
      transactionStarted = false;
    }
    console.error("Error al crear pedido:", error);
    res.status(500).json({
      success: false,
      message: "Error al crear el pedido",
      error: error.message,
    });
  } finally {
    // Liberar el cliente de vuelta al pool
    client.release();
  }
};

/**
 * Obtener historial de pedidos del cliente logueado
 * GET /api/pedidos
 */
const obtenerPedidos = async (req, res) => {
  try {
    const clienteId = req.user.userId;

    const query = `
      SELECT 
        p.PedidoID,
        p.FechaPedido,
        p.MontoTotal,
        p.Estatus,
        d.Receptor,
        d.Calle,
        d.Ciudad,
        d.EstadoID,
        e.Nombre AS EstadoNombre,
        a.Nombre as AgenteNombre,
        a.Apellido as AgenteApellido,
        a.CodigoAgente
      FROM Pedidos p
      LEFT JOIN Cliente_Direcciones d ON p.DireccionEnvioID = d.DireccionID
      LEFT JOIN Estados e ON d.EstadoID = e.EstadoID
      LEFT JOIN AgentesDeVentas a ON p.AgenteID = a.AgenteID
      WHERE p.ClienteID = $1
      ORDER BY p.FechaPedido DESC
    `;

    const result = await db.query(query, [clienteId]);

    // Para cada pedido, obtener sus detalles
    const pedidos = await Promise.all(
      result.rows.map(async (pedido) => {
        const detallesQuery = `
        SELECT
          dp.detalleid,
          dp.varianteid,
          dp.cantidad,
          dp.tamanoid,
          dp.preciounitarioaplicado,
          dp.piezastotales,
          pv.productoid,
          pv.sku,
          pv.dimensiones,
          ORDER BY pi.orden ASC NULLS LAST, pi.imagenid ASC
          LIMIT 1
        ) imagen ON TRUE
        WHERE dp.pedidoid = $1
        ORDER BY dp.detalleid ASC
      `;

        const detallesResult = await db.query(detallesQuery, [pedido.pedidoid]);

        return {
          pedidoId: pedido.pedidoid,
          fechaPedido: pedido.fechapedido,
          montoTotal: parseFloat(pedido.montototal),
          estatus: pedido.estatus,
          direccion: {
            receptor: pedido.receptor,
            calle: pedido.calle,
            ciudad: pedido.ciudad,
            estadoId:
              pedido.estadoid !== null ? parseInt(pedido.estadoid, 10) : null,
            estado: pedido.estadonombre || null,
            estadoNombre: pedido.estadonombre || null,
          },
          agente: pedido.agentenombre
            ? {
                nombre: pedido.agentenombre,
                apellido: pedido.agenteapellido,
                codigoAgente: pedido.codigoagente,
              }
            : null,
          items: detallesResult.rows.map((item) => {
            const tamanoValor =
              item.tamano_valor !== null
                ? parseInt(item.tamano_valor, 10)
                : null;
            const precioUnitarioAplicado =
              item.preciounitarioaplicado !== null
                ? parseFloat(item.preciounitarioaplicado)
                : null;
            const cantidad =
              item.cantidad !== null ? parseInt(item.cantidad, 10) : null;
            const subtotal =
              tamanoValor !== null &&
              cantidad !== null &&
              precioUnitarioAplicado !== null
                ? parseFloat(
                    (tamanoValor * cantidad * precioUnitarioAplicado).toFixed(2)
                  )
                : null;

            return {
              detalleId: item.detalleid,
              varianteId: item.varianteid,
              productoId: item.productoid,
              sku: item.sku,
              nombreProducto: item.nombreproducto,
              tamanoId: item.tamanoid,
              piezasPorTamano: tamanoValor,
              cantidad,
              precioUnitario: precioUnitarioAplicado,
              subtotal,
              piezasTotales: item.piezastotales,
              dimensiones: item.dimensiones,
              imagenUrl: item.url_imagen,
            };
          }),
        };
      })
    );

    res.status(200).json({
      success: true,
      message: "Pedidos obtenidos exitosamente",
      data: {
        pedidos,
        total: pedidos.length,
      },
    });
  } catch (error) {
    console.error("Error al obtener pedidos:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener los pedidos",
      error: error.message,
    });
  }
};

/**
 * Obtener detalle de un pedido específico del cliente logueado
 * GET /api/pedidos/:id
 */
const obtenerPedidoPorId = async (req, res) => {
  try {
    const clienteId = req.user.userId;
    const pedidoId = parseInt(req.params.id, 10);

    if (Number.isNaN(pedidoId)) {
      return res.status(400).json({
        success: false,
        message: "ID de pedido inválido",
      });
    }

    const pedidoQuery = `
      SELECT 
        p.PedidoID,
        p.FechaPedido,
        p.MontoTotal,
        p.Estatus,
        d.Receptor,
        d.Calle,
        d.Ciudad,
        d.EstadoID,
        e.Nombre AS EstadoNombre,
        a.Nombre AS AgenteNombre,
        a.Apellido AS AgenteApellido,
        a.CodigoAgente
      FROM Pedidos p
      LEFT JOIN Cliente_Direcciones d ON p.DireccionEnvioID = d.DireccionID
      LEFT JOIN Estados e ON d.EstadoID = e.EstadoID
      LEFT JOIN AgentesDeVentas a ON p.AgenteID = a.AgenteID
      WHERE p.PedidoID = $1 AND p.ClienteID = $2
    `;

    const pedidoResult = await db.query(pedidoQuery, [pedidoId, clienteId]);

    if (pedidoResult.rows.length === 0) {
      const existsResult = await db.query(
        "SELECT ClienteID FROM Pedidos WHERE PedidoID = $1",
        [pedidoId]
      );

      if (existsResult.rows.length > 0) {
        return res.status(403).json({
          success: false,
          message: "No tienes permisos para acceder a este pedido",
        });
      }

      return res.status(404).json({
        success: false,
        message: "Pedido no encontrado",
      });
    }

    const pedido = pedidoResult.rows[0];

    const detallesQuery = `
      SELECT
        dp.detalleid,
        dp.varianteid,
        dp.cantidad,
        dp.tamanoid,
        dp.preciounitarioaplicado,
        dp.piezastotales,
        pv.productoid,
        pv.sku,
        pv.dimensiones,
        pv.preciounitario,
        prod.nombreproducto,
        t.valor AS tamano_valor,
        imagen.url_imagen
      FROM detallesdelpedido dp
      INNER JOIN producto_variantes pv ON pv.varianteid = dp.varianteid
      INNER JOIN productos prod ON prod.productoid = pv.productoid
      LEFT JOIN cat_tamanopaquetes t ON t.tamanoid = dp.tamanoid
      LEFT JOIN LATERAL (
        SELECT pi.url_imagen
        FROM producto_imagenes pi
        WHERE pi.varianteid = pv.varianteid
        ORDER BY pi.orden ASC NULLS LAST, pi.imagenid ASC
        LIMIT 1
      ) imagen ON TRUE
      WHERE dp.pedidoid = $1
      ORDER BY dp.detalleid ASC
    `;

    const detallesResult = await db.query(detallesQuery, [pedidoId]);

    const direccion = {
      receptor: pedido.receptor,
      calle: pedido.calle,
      ciudad: pedido.ciudad,
      estadoId: pedido.estadoid !== null ? parseInt(pedido.estadoid, 10) : null,
      estado: pedido.estadonombre || null,
      estadoNombre: pedido.estadonombre || null,
    };

    const agente = pedido.agentenombre
      ? {
          nombre: pedido.agentenombre,
          apellido: pedido.agenteapellido,
          codigoAgente: pedido.codigoagente,
        }
      : null;

    const items = detallesResult.rows.map((item) => {
      const tamanoValor =
        item.tamano_valor !== null ? parseInt(item.tamano_valor, 10) : null;
      const precioUnitarioAplicado =
        item.preciounitarioaplicado !== null
          ? parseFloat(item.preciounitarioaplicado)
          : null;
      const cantidad =
        item.cantidad !== null ? parseInt(item.cantidad, 10) : null;
      const subtotal =
        tamanoValor !== null &&
        cantidad !== null &&
        precioUnitarioAplicado !== null
          ? parseFloat(
              (tamanoValor * cantidad * precioUnitarioAplicado).toFixed(2)
            )
          : null;

      return {
        detalleId: item.detalleid,
        varianteId: item.varianteid,
        productoId: item.productoid,
        sku: item.sku,
        nombreProducto: item.nombreproducto,
        tamanoId: item.tamanoid,
        piezasPorTamano: tamanoValor,
        cantidad,
        precioUnitario: precioUnitarioAplicado,
        subtotal,
        piezasTotales: item.piezastotales,
        dimensiones: item.dimensiones,
        imagenUrl: item.url_imagen,
      };
    });

    return res.status(200).json({
      success: true,
      message: "Pedido obtenido exitosamente",
      data: {
        pedido: {
          pedidoId: pedido.pedidoid,
          fechaPedido: pedido.fechapedido,
          montoTotal:
            pedido.montototal !== null ? parseFloat(pedido.montototal) : null,
          estatus: pedido.estatus,
          direccion,
          agente,
          items,
        },
      },
    });
  } catch (error) {
    console.error("Error al obtener pedido:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener el pedido",
      error: error.message,
    });
  }
};

module.exports = {
  crearPedido,
  obtenerPedidos,
  obtenerPedidoPorId,
};
