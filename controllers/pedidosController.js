const db = require("../db");
const { enviarEmail } = require("../services/emailService");
const {
  generarOrdenCompraAutomatica,
  generarBackorderProveedor,
} = require("../services/ordenesService");
const { checkStockBajo } = require("../utils/stockAlerts");

const TAMANO_VALUE_KEYS = [
  "valor",
  "cantidad",
  "piezas",
  "piezasporpaquete",
  "numeropiezas",
  "tamano",
  "cantidadpiezas",
];

const TAMANO_LABEL_KEYS = ["etiqueta", "descripcion", "nombre", "label"];

function extraerInfoTamano(tamanoRaw) {
  if (!tamanoRaw || typeof tamanoRaw !== "object") {
    return { valor: null, etiqueta: null };
  }

  let valorEncontrado = null;
  for (const [key, value] of Object.entries(tamanoRaw)) {
    const lowerKey = key.toLowerCase();
    if (TAMANO_VALUE_KEYS.includes(lowerKey)) {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        valorEncontrado = parsed;
        break;
      }
    }
  }

  let etiquetaEncontrada = null;
  for (const [key, value] of Object.entries(tamanoRaw)) {
    const lowerKey = key.toLowerCase();
    if (
      TAMANO_LABEL_KEYS.includes(lowerKey) &&
      typeof value === "string" &&
      value.trim()
    ) {
      etiquetaEncontrada = value.trim();
      break;
    }
  }

  if (etiquetaEncontrada === null && Number.isFinite(valorEncontrado)) {
    etiquetaEncontrada =
      valorEncontrado === 1 ? "Pieza individual" : `Pack de ${valorEncontrado}`;
  }

  return {
    valor: Number.isFinite(valorEncontrado) ? valorEncontrado : null,
    etiqueta: etiquetaEncontrada,
  };
}

/**
 * Crear un nuevo pedido desde el carrito
 * POST /api/pedidos
 */
const crearPedido = async (req, res) => {
  const client = await db.pool.connect();
  let transactionStarted = false;
  const adminEmail = process.env.ADMIN_EMAIL || null;

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
    const variantesAfectadas = new Set();

    // 3. Obtener los items del carrito con información de productos
    const itemsResult = await client.query(
      `SELECT 
        ic.itemid,
        ic.varianteid,
        ic.cantidad,
        ic.tamanoid,
        row_to_json(t) AS tamano_info,
        pv.productoid,
        pv.sku,
        pv.dimensiones,
        pv.preciounitario,
        pv.precioofertaunitario,
        pv.stock,
        pv.costounitario,
        p.nombreproducto
      FROM itemsdelcarrito ic
      INNER JOIN producto_variantes pv ON pv.varianteid = ic.varianteid
      INNER JOIN productos p ON p.productoid = pv.productoid
      LEFT JOIN cat_tamanopaquetes t ON t.tamanoid = ic.tamanoid
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

    const items = itemsResult.rows.map((row) => {
      const tamanoInfo = extraerInfoTamano(row.tamano_info);
      return {
        ...row,
        tamano_valor: tamanoInfo.valor,
        tamano_etiqueta: tamanoInfo.etiqueta,
      };
    });

    // 4. Calcular el monto total CON LÓGICA DE OFERTAS
    const montoTotal = items.reduce((total, item) => {
      const precioBase =
        item.preciounitario !== null ? parseFloat(item.preciounitario) : 0;
      const precioOferta =
        item.precioofertaunitario !== null
          ? parseFloat(item.precioofertaunitario)
          : null;
      // Si existe precio de oferta, úsalo. Si no, usa precio base.
      const precioUnitario = precioOferta || precioBase;
      const tamanoValor =
        item.tamano_valor !== null ? parseInt(item.tamano_valor, 10) : 0;
      return total + item.cantidad * tamanoValor * precioUnitario;
    }, 0);

    // 5. Obtener el agente asignado al cliente (si existe)
    const clienteAgenteResult = await client.query(
      "SELECT AgenteID, Nombre, Email FROM Clientes WHERE ClienteID = $1",
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

    const clienteInfo = clienteAgenteResult.rows[0];
    const agenteId = clienteInfo.agenteid
      ? parseInt(clienteInfo.agenteid, 10)
      : null;
    const clienteNombre = (clienteInfo.nombre || "cliente").trim() || "cliente";
    const clienteEmailDb = clienteInfo.email || null;

    let agenteEmail = null;
    let agenteNombre = null;
    if (agenteId) {
      const agenteResult = await client.query(
        "SELECT Email, Nombre FROM AgentesDeVentas WHERE AgenteID = $1",
        [agenteId]
      );

      if (agenteResult.rows.length > 0) {
        agenteEmail = agenteResult.rows[0].email || null;
        agenteNombre = agenteResult.rows[0].nombre || null;
      }
    }

    // 6. Crear el pedido
    const pedidoResult = await client.query(
      `INSERT INTO Pedidos (ClienteID, AgenteID, DireccionEnvioID, MontoTotal, Estatus)
       VALUES ($1, $2, $3, $4, 'Pendiente')
       RETURNING PedidoID, FechaPedido, MontoTotal, Estatus`,
      [clienteId, agenteId, DireccionEnvioID, montoTotal]
    );

    const pedido = pedidoResult.rows[0];
    const pedidoId = pedido.pedidoid;

    // 7. Crear los detalles del pedido y actualizar inventario
    const detallesPedido = [];
    const backordersGenerados = [];
    for (const item of items) {
      const tamanoValor =
        item.tamano_valor !== null ? parseInt(item.tamano_valor, 10) : 0;

      if (!tamanoValor || tamanoValor <= 0) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(400).json({
          success: false,
          message: `El tamaño seleccionado es inválido para ${item.nombreproducto} (${item.sku})`,
        });
      }

      // LÓGICA DE PRECIOS CON OFERTA
      const precioBase =
        item.preciounitario !== null ? parseFloat(item.preciounitario) : 0;
      const precioOferta =
        item.precioofertaunitario !== null
          ? parseFloat(item.precioofertaunitario)
          : null;
      // Si existe precio de oferta, úsalo. Si no, usa precio base.
      const precioUnitario = precioOferta || precioBase;
      const precioPorPaquete = parseFloat(
        (precioUnitario * tamanoValor).toFixed(2)
      );
      // Calcular cantidades requeridas y disponibles
      const cantidadRequerida = item.cantidad; // Paquetes que pide el cliente
      const piezasSolicitadas = tamanoValor * item.cantidad; // Piezas totales
      const stockActual =
        item.stock !== null ? Math.max(parseInt(item.stock, 10), 0) : 0; // Stock en piezas

      // Calcular cuántos paquetes se pueden surtir con el stock disponible
      const paquetesSurtibles = Math.floor(stockActual / tamanoValor);
      const cantidadSurtida = Math.min(cantidadRequerida, paquetesSurtibles); // Paquetes surtidos
      const cantidadBackorder = cantidadRequerida - cantidadSurtida; // Paquetes faltantes

      const piezasSurtidas = cantidadSurtida * tamanoValor; // Piezas efectivamente surtidas
      const piezasFaltantes = cantidadBackorder * tamanoValor; // Piezas en backorder

      const subtotalSolicitado = parseFloat(
        (precioUnitario * piezasSolicitadas).toFixed(2)
      );
      const subtotalSurtido = parseFloat(
        (precioUnitario * piezasSurtidas).toFixed(2)
      );

      // PUNTO CLAVE: Si hay backorder, generar orden de compra al proveedor
      if (cantidadBackorder > 0) {
        const resultadoBackorder = await generarBackorderProveedor(
          client,
          item.productoid, // ProductoID
          item.varianteid, // VarianteID
          cantidadBackorder, // Cantidad de PAQUETES faltantes
          item.tamanoid // TamanoID (puede ser null)
        );

        backordersGenerados.push({
          varianteId: item.varianteid,
          sku: item.sku,
          productoId: item.productoid,
          nombreProducto: item.nombreproducto,
          cantidadPaquetesFaltantes: cantidadBackorder,
          cantidadPiezasFaltantes: piezasFaltantes,
          ordenCompraId: resultadoBackorder.ordenCompraID,
          proveedorId: resultadoBackorder.proveedorID,
          esOrdenNueva: resultadoBackorder.esOrdenNueva,
        });
      }

      // Insertar detalle del pedido
      const detalleResult = await client.query(
        `INSERT INTO DetallesDelPedido (PedidoID, VarianteID, TamanoID, CantidadPaquetes, PrecioPorPaquete, PiezasTotales, PrecioUnitario)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING DetalleID`,
        [
          pedidoId,
          item.varianteid,
          item.tamanoid,
          item.cantidad,
          precioPorPaquete,
          piezasSolicitadas,
          precioUnitario.toFixed(2),
        ]
      );

      // Actualizar stock del producto (solo se descuenta lo efectivamente surtido en PIEZAS)
      const nuevoStockVariante = Math.max(stockActual - piezasSurtidas, 0);
      await client.query(
        "UPDATE producto_variantes SET Stock = $1 WHERE VarianteID = $2",
        [nuevoStockVariante, item.varianteid]
      );

      variantesAfectadas.add(item.varianteid);

      // Crear registro en Log_Inventario cuando se surte inventario existente
      if (piezasSurtidas > 0) {
        await client.query(
          `INSERT INTO Log_Inventario (VarianteID, CantidadCambiado, NuevoStock, Motivo, UsuarioID)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            item.varianteid,
            -piezasSurtidas,
            nuevoStockVariante,
            `Venta Pedido #${pedidoId}`,
            clienteId,
          ]
        );
      }

      detallesPedido.push({
        detalleId: detalleResult.rows[0].detalleid,
        varianteId: item.varianteid,
        productoId: item.productoid,
        nombreProducto: item.nombreproducto,
        tamanoId: item.tamanoid,
        cantidad: item.cantidad,
        paquetesSurtidos: cantidadSurtida,
        paquetesBackorder: cantidadBackorder,
        piezasPorPaquete: tamanoValor,
        presentacion: item.tamano_etiqueta || null,
        precioUnitario,
        precioPorPaquete,
        piezasSolicitadas,
        piezasSurtidas,
        piezasFaltantes,
        subtotalSolicitado,
        subtotalSurtido,
        sku: item.sku,
        dimensiones: item.dimensiones,
      });
    }

    // 8. Crear comisión si se usó código de agente
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

    // 9. Limpiar el carrito
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
          backorders: backordersGenerados,
        },
      },
    };

    res.status(201).json(respuesta);

    const emailCliente = req.user?.email || clienteEmailDb;
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

    if (!adminEmail) {
      console.warn(
        "ADMIN_EMAIL no está configurado; no se enviará alerta de nuevo pedido."
      );
    } else {
      const montoFormateado = parseFloat(pedido.montototal).toFixed(2);
      const asuntoAdmin = `💰 Nuevo Pedido #${pedido.pedidoid} - $${montoFormateado}`;
      const cuerpoAdmin = `
        <div style="font-family: Arial, sans-serif; color: #1f2937;">
          <h2 style=\"color:#f97316;\">Nuevo pedido recibido</h2>
          <p>Pedido: <strong>#${pedido.pedidoid}</strong></p>
          <p>Monto total: <strong>$${montoFormateado}</strong></p>
          <p>Cliente: <strong>${clienteNombre}</strong></p>
          <p>Fecha: ${pedido.fechapedido}</p>
          <p style=\"margin-top: 1.5rem;\">Sistema RazoConnect</p>
        </div>
      `;

      enviarEmail(adminEmail, asuntoAdmin, cuerpoAdmin).catch((err) => {
        console.error(
          "No se pudo enviar alerta de nuevo pedido al admin:",
          err
        );
      });

      if (backordersGenerados.length > 0) {
        const asuntoBackorder = `⚠️ Alerta: Backorder generado para el pedido #${pedido.pedidoid}`;
        const resumenItems = backordersGenerados
          .map(
            (item) =>
              `<li><strong>${item.nombreProducto}</strong> (SKU: ${
                item.sku
              }) &mdash; Faltante: ${
                item.cantidadPaquetesFaltantes
              } paquetes (${item.cantidadPiezasFaltantes} piezas) &mdash; OC #${
                item.ordenCompraId
              } (Proveedor #${item.proveedorId})${
                item.esOrdenNueva ? " [NUEVA]" : " [ACTUALIZADA]"
              }</li>`
          )
          .join("");
        const cuerpoBackorder = `
          <div style="font-family: Arial, sans-serif; color: #1f2937;">
            <h2 style="color:#DC2626;">Se generó un backorder</h2>
            <p>Pedido: <strong>#${pedido.pedidoid}</strong></p>
            <p>Cliente: <strong>${clienteNombre}</strong></p>
            <p>Se ha creado/actualizado una Orden de Compra para surtir los productos faltantes:</p>
            <ul style="padding-left: 1.25rem;">${resumenItems}</ul>
            <p style="margin-top: 1.5rem; color: #6b7280; font-size: 0.875rem;">
              Los productos en backorder se solicitarán automáticamente al proveedor correspondiente.
            </p>
            <p style="margin-top: 1.5rem;">Sistema RazoConnect</p>
          </div>
        `;

        enviarEmail(adminEmail, asuntoBackorder, cuerpoBackorder).catch(
          (err) => {
            console.error(
              "No se pudo enviar alerta de backorder al admin:",
              err
            );
          }
        );
      }
    }

    if (agenteEmail) {
      const asuntoAgente = `🔔 Tu cliente ${clienteNombre} ha realizado un pedido (#${pedido.pedidoid})`;
      const cuerpoAgente = `
        <div style="font-family: Arial, sans-serif; color: #1f2937;">
          <h2 style=\"color:#2563eb;\">Nuevo pedido de tu cliente</h2>
          <p>Cliente: <strong>${clienteNombre}</strong></p>
          <p>Pedido: <strong>#${pedido.pedidoid}</strong></p>
          <p>Monto total: <strong>$${parseFloat(pedido.montototal).toFixed(
            2
          )}</strong></p>
          <p>Revisa tus comisiones para más detalles.</p>
          <p style=\"margin-top: 1.5rem;\">Sistema RazoConnect</p>
        </div>
      `;

      enviarEmail(agenteEmail, asuntoAgente, cuerpoAgente).catch((err) => {
        console.error(
          "No se pudo enviar notificación de nuevo pedido al agente:",
          err
        );
      });
    }

    for (const varianteId of variantesAfectadas) {
      checkStockBajo(varianteId).catch((err) => {
        console.error(
          `Error verificando stock bajo para la variante ${varianteId} tras pedido:`,
          err
        );
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
          dp.cantidadpaquetes AS cantidad,
          dp.tamanoid,
          dp.preciounitario AS preciounitarioaplicado,
          dp.piezastotales,
          dp.precioporpaquete,
          pv.productoid,
          pv.sku,
          pv.dimensiones,
          pr.nombreproducto,
          row_to_json(ct) AS tamano_info,
          imagen.url_imagen AS imagenurl
        FROM detallesdelpedido dp
        LEFT JOIN producto_variantes pv ON dp.varianteid = pv.varianteid
        LEFT JOIN productos pr ON pv.productoid = pr.productoid
        LEFT JOIN cat_tamanopaquetes ct ON dp.tamanoid = ct.tamanoid
        LEFT JOIN LATERAL (
          SELECT pi.url_imagen
          FROM producto_imagenes pi
          WHERE pi.productoid = pv.productoid
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
            const { valor: tamanoValor } = extraerInfoTamano(item.tamano_info);
            const precioUnitarioAplicado =
              item.preciounitarioaplicado !== null
                ? parseFloat(item.preciounitarioaplicado)
                : null;
            const precioPorPaquete =
              item.precioporpaquete !== null
                ? parseFloat(item.precioporpaquete)
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
              precioPorPaquete,
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
        dp.cantidadpaquetes AS cantidad,
        dp.tamanoid,
        dp.preciounitario AS preciounitarioaplicado,
        dp.piezastotales,
        dp.precioporpaquete,
        pv.productoid,
        pv.sku,
        pv.dimensiones,
        pv.preciounitario,
        prod.nombreproducto,
        row_to_json(t) AS tamano_info,
        imagen.url_imagen
      FROM detallesdelpedido dp
      INNER JOIN producto_variantes pv ON pv.varianteid = dp.varianteid
      INNER JOIN productos prod ON prod.productoid = pv.productoid
      LEFT JOIN cat_tamanopaquetes t ON t.tamanoid = dp.tamanoid
      LEFT JOIN LATERAL (
        SELECT pi.url_imagen
        FROM producto_imagenes pi
        WHERE pi.productoid = pv.productoid
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
      const tamanoInfo = extraerInfoTamano(item.tamano_info);
      const tamanoValor =
        tamanoInfo.valor !== null ? parseInt(tamanoInfo.valor, 10) : null;
      const precioUnitarioAplicado =
        item.preciounitarioaplicado !== null
          ? parseFloat(item.preciounitarioaplicado)
          : null;
      const precioPorPaquete =
        item.precioporpaquete !== null
          ? parseFloat(item.precioporpaquete)
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
        presentacion: tamanoInfo.etiqueta,
        cantidad,
        precioUnitario: precioUnitarioAplicado,
        precioPorPaquete,
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
