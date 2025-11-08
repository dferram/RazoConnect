const db = require('../db');
const { enviarEmail } = require('../services/emailService');

/**
 * Crear un nuevo pedido desde el carrito
 * POST /api/pedidos
 */
const crearPedido = async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    const clienteId = req.user.userId;
    const { DireccionEnvioID, AgenteID } = req.body;

    // Validar datos de entrada
    if (!DireccionEnvioID) {
      return res.status(400).json({
        success: false,
        message: 'DireccionEnvioID es requerido'
      });
    }

    // Iniciar transacción
    await client.query('BEGIN');

    // 1. Verificar que la dirección pertenece al cliente
    const direccionResult = await client.query(
      'SELECT DireccionID FROM Cliente_Direcciones WHERE DireccionID = $1 AND ClienteID = $2',
      [DireccionEnvioID, clienteId]
    );

    if (direccionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Dirección no encontrada o no pertenece al cliente'
      });
    }

    // 2. Obtener el carrito del cliente
    const carritoResult = await client.query(
      'SELECT CarritoID FROM CarritoDeCompra WHERE ClienteID = $1',
      [clienteId]
    );

    if (carritoResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'No tienes un carrito activo'
      });
    }

    const carritoId = carritoResult.rows[0].carritoid;

    // 3. Obtener los items del carrito con información de productos
    const itemsResult = await client.query(
      `SELECT 
        ic.itemid,
        ic.varianteid,
        ic.cantidadpaquetes,
        pv.productoid,
        pv.sku,
        pv.dimensiones,
        pv.piezasporpaquete,
        pv.preciopaquete,
        pv.stock,
        pv.costounitario,
        p.nombreproducto
      FROM itemsdelcarrito ic
      INNER JOIN producto_variantes pv ON pv.varianteid = ic.varianteid
      INNER JOIN productos p ON p.productoid = pv.productoid
      WHERE ic.carritoid = $1`,
      [carritoId]
    );

    if (itemsResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'El carrito está vacío'
      });
    }

    const items = itemsResult.rows;

    // 4. Validar stock para todos los productos
    for (const item of items) {
      const stockDisponible = item.stock !== null ? parseInt(item.stock, 10) : 0;
      if (stockDisponible < item.cantidadpaquetes) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Stock insuficiente para ${item.nombreproducto} (${item.sku}). Disponible: ${stockDisponible}, Solicitado: ${item.cantidadpaquetes}`
        });
      }
    }

    // 5. Calcular el monto total
    const montoTotal = items.reduce((total, item) => {
      const precioPaquete = item.preciopaquete !== null
        ? parseFloat(item.preciopaquete)
        : 0;
      return total + (item.cantidadpaquetes * precioPaquete);
    }, 0);

    // 6. Validar el AgenteID si se proporcionó
    let agenteId = null;
    if (AgenteID) {
      const agenteResult = await client.query(
        'SELECT agenteid, activo FROM agentesdeventas WHERE agenteid = $1',
        [AgenteID]
      );

      if (agenteResult.rows.length > 0 && agenteResult.rows[0].activo) {
        agenteId = agenteResult.rows[0].agenteid;
      } else {
        // AgenteID no válido o inactivo - continuar sin comisión
        console.warn(`AgenteID inválido o inactivo: ${AgenteID}`);
      }
    }

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
      const piezasPorPaquete = item.piezasporpaquete !== null
        ? parseInt(item.piezasporpaquete, 10)
        : null;
      const precioPaquete = item.preciopaquete !== null
        ? parseFloat(item.preciopaquete)
        : null;
      const precioUnitario = piezasPorPaquete && precioPaquete
        ? precioPaquete / piezasPorPaquete
        : null;

      // Insertar detalle del pedido
      const detalleResult = await client.query(
        `INSERT INTO DetallesDelPedido (PedidoID, VarianteID, CantidadPaquetes, PrecioPorPaquete, PiezasTotales, PrecioUnitario)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING DetalleID`,
        [
          pedidoId,
          item.varianteid,
          item.cantidadpaquetes,
          precioPaquete,
          piezasPorPaquete ? item.cantidadpaquetes * piezasPorPaquete : null,
          precioUnitario !== null ? precioUnitario.toFixed(2) : null
        ]
      );

      // Actualizar stock del producto
      const nuevoStockVariante = parseInt(item.stock, 10) - item.cantidadpaquetes;
      await client.query(
        'UPDATE producto_variantes SET Stock = $1 WHERE VarianteID = $2',
        [nuevoStockVariante, item.varianteid]
      );

      // Crear registro en Log_Inventario
      await client.query(
        `INSERT INTO Log_Inventario (VarianteID, CantidadCambiado, NuevoStock, Motivo, UsuarioID)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          item.varianteid,
          -item.cantidadpaquetes,
          nuevoStockVariante,
          `Venta Pedido #${pedidoId}`,
          clienteId
        ]
      );

      detallesPedido.push({
        detalleId: detalleResult.rows[0].detalleid,
        varianteId: item.varianteid,
        productoId: item.productoid,
        nombreProducto: item.nombreproducto,
        cantidadPaquetes: item.cantidadpaquetes,
        precioPorPaquete: precioPaquete,
        precioUnitario: precioUnitario,
        piezasTotales: piezasPorPaquete ? item.cantidadpaquetes * piezasPorPaquete : null,
        subtotal: precioPaquete !== null ? item.cantidadpaquetes * precioPaquete : null,
        sku: item.sku,
        dimensiones: item.dimensiones
      });
    }

    // 9. Crear comisión si se usó código de agente
    let comision = null;
    if (agenteId) {
      const montoComision = montoTotal * 0.20; // 20% de comisión
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
        estatus: 'Pendiente'
      };
    }

    // 10. Limpiar el carrito
    await client.query(
      'DELETE FROM ItemsDelCarrito WHERE CarritoID = $1',
      [carritoId]
    );

    // Confirmar transacción
    await client.query('COMMIT');

    const respuesta = {
      success: true,
      message: 'Pedido creado exitosamente',
      data: {
        pedido: {
          pedidoId: pedido.pedidoid,
          fechaPedido: pedido.fechapedido,
          montoTotal: parseFloat(pedido.montototal),
          estatus: pedido.estatus,
          detalles: detallesPedido,
          comision: comision
        }
      }
    };

    res.status(201).json(respuesta);

    const emailCliente = req.user?.email;
    if (emailCliente) {
      const asunto = `Tu pedido RazoConnect ha sido recibido (#${pedido.pedidoid})`;
      const cuerpoHtml = `
        <div style="font-family: Arial, sans-serif; color: #1f2937;">
          <h2 style="color:#f97316;">¡Gracias por tu compra!</h2>
          <p>Hemos recibido tu pedido <strong>#${pedido.pedidoid}</strong> y ya estamos procesándolo.</p>
          <p>Monto total: <strong>$${parseFloat(pedido.montototal).toFixed(2)}</strong></p>
          <p>Te avisaremos cuando esté confirmado y en camino.</p>
          <p style="margin-top: 1.5rem;">Equipo RazoConnect</p>
        </div>
      `;

      enviarEmail(emailCliente, asunto, cuerpoHtml).catch((err) => {
        console.error('No se pudo enviar correo de recibo de pedido:', err);
      });
    }

  } catch (error) {
    // Revertir transacción en caso de error
    await client.query('ROLLBACK');
    console.error('Error al crear pedido:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear el pedido',
      error: error.message
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
        d.Estado,
        a.Nombre as AgenteNombre,
        a.Apellido as AgenteApellido,
        a.CodigoAgente
      FROM Pedidos p
      LEFT JOIN Cliente_Direcciones d ON p.DireccionEnvioID = d.DireccionID
      LEFT JOIN AgentesDeVentas a ON p.AgenteID = a.AgenteID
      WHERE p.ClienteID = $1
      ORDER BY p.FechaPedido DESC
    `;

    const result = await db.query(query, [clienteId]);

    // Para cada pedido, obtener sus detalles
    const pedidos = await Promise.all(result.rows.map(async (pedido) => {
      const detallesQuery = `
        SELECT
          dp.detalleid,
          dp.varianteid,
          dp.cantidadpaquetes,
          dp.precioporpaquete,
          dp.piezastotales,
          COALESCE(
            dp.preciounitario,
            ROUND(dp.precioporpaquete / NULLIF((dp.piezastotales / NULLIF(dp.cantidadpaquetes, 0)), 0), 2)
          ) AS preciounitario,
          pv.productoid,
          pv.sku,
          pv.dimensiones,
          pv.piezasporpaquete,
          p.nombreproducto,
          imagen.url_imagen
        FROM detallesdelpedido dp
        INNER JOIN producto_variantes pv ON pv.varianteid = dp.varianteid
        INNER JOIN productos p ON p.productoid = pv.productoid
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
          estado: pedido.estado
        },
        agente: pedido.agentenombre ? {
          nombre: pedido.agentenombre,
          apellido: pedido.agenteapellido,
          codigoAgente: pedido.codigoagente
        } : null,
        items: detallesResult.rows.map(item => ({
          detalleId: item.detalleid,
          varianteId: item.varianteid,
          productoId: item.productoid,
          sku: item.sku,
          nombreProducto: item.nombreproducto,
          cantidadPaquetes: item.cantidadpaquetes,
          precioPorPaquete: item.precioporpaquete !== null ? parseFloat(item.precioporpaquete) : null,
          precioUnitario: item.preciounitario !== null ? parseFloat(item.preciounitario) : null,
          piezasTotales: item.piezastotales,
          piezasPorPaquete: item.piezasporpaquete,
          dimensiones: item.dimensiones,
          imagenUrl: item.url_imagen
        }))
      };
    }));

    res.status(200).json({
      success: true,
      message: 'Pedidos obtenidos exitosamente',
      data: {
        pedidos,
        total: pedidos.length
      }
    });

  } catch (error) {
    console.error('Error al obtener pedidos:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener los pedidos',
      error: error.message
    });
  }
};

module.exports = {
  crearPedido,
  obtenerPedidos
};
