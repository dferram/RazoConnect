const fs = require("fs");
const path = require("path");
const db = require("../db");
const { enviarEmail, sendTemplatedEmail } = require("../services/emailService");
const {
  generarOrdenCompraAutomatica,
  generarBackorderProveedor,
  generarBackordersAgrupados,
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

function calcularSplitBackorder({
  cantidadSolicitada,
  stockPiezas,
  piezasPorPaquete,
  multiploBackorder,
}) {
  const cantidad = Number.isInteger(cantidadSolicitada) ? cantidadSolicitada : 0;
  const stock = Number.isInteger(stockPiezas) ? stockPiezas : 0;
  const piezas = Number.isInteger(piezasPorPaquete) ? piezasPorPaquete : 0;
  const multiplo = Number.isInteger(multiploBackorder) ? multiploBackorder : 1;
  const regla = multiplo > 1 ? "PAQUETE" : "UNITARIO";

  if (cantidad <= 0 || piezas <= 0) {
    return {
      cantidadSurtida: 0,
      cantidadPendiente: 0,
      cantidadBackorderAjustada: 0,
      cantidadTotalCobrar: 0,
      ajusteAplicado: false,
      reglaBackorder: regla,
    };
  }

  const paquetesSurtibles = Math.floor(Math.max(stock, 0) / piezas);
  const cantidadSurtida = Math.max(Math.min(cantidad, paquetesSurtibles), 0);
  const cantidadPendiente = Math.max(cantidad - cantidadSurtida, 0);

  let cantidadBackorderAjustada = cantidadPendiente;
  if (cantidadPendiente > 0 && multiplo > 1) {
    const piezasPendientes = cantidadPendiente * piezas;
    const piezasBackorderAjustadas = Math.ceil(piezasPendientes / multiplo) * multiplo;
    cantidadBackorderAjustada = Math.ceil(piezasBackorderAjustadas / piezas);
  }

  const cantidadTotalCobrar = cantidad;
  const ajusteAplicado = cantidadBackorderAjustada !== cantidadPendiente;

  return {
    cantidadSurtida,
    cantidadPendiente,
    cantidadBackorderAjustada,
    cantidadTotalCobrar,
    ajusteAplicado,
    reglaBackorder: regla,
  };
}

async function obtenerMultiploBackorderDesdeReglaEmpaque({
  proveedorId,
  tipoProductoId,
}) {
  const proveedor = Number.parseInt(proveedorId, 10);
  const tipo = Number.parseInt(tipoProductoId, 10);
  if (!Number.isInteger(proveedor) || proveedor <= 0) return 1;
  if (!Number.isInteger(tipo) || tipo <= 0) return 1;

  try {
    const { rows } = await db.query(
      `SELECT cantidadempaque
       FROM proveedor_reglas_empaque
       WHERE proveedorid = $1 AND tipoproductoid = $2
       LIMIT 1`,
      [proveedor, tipo]
    );
    const raw = rows[0]?.cantidadempaque;
    const parsed = Number.parseInt(raw, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
  } catch (dbError) {
    if (dbError && dbError.code === "42703") {
      const { rows } = await db.query(
        `SELECT piezasporpaquete AS cantidadempaque
         FROM proveedor_reglas_empaque
         WHERE proveedorid = $1 AND tipoproductoid = $2
         LIMIT 1`,
        [proveedor, tipo]
      );
      const raw = rows[0]?.cantidadempaque;
      const parsed = Number.parseInt(raw, 10);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
    }
    throw dbError;
  }
}

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

  const removeUploadedComprobante = () => {
    if (req.file?.path) {
      fs.unlink(req.file.path, () => {});
    }
  };

  try {
    if (!req.tenant || !req.tenant.tenant_id) {
      removeUploadedComprobante();
      client.release();
      return res.status(500).json({
        success: false,
        message: "Error: tenant no disponible"
      });
    }
    const { tenant_id } = req.tenant;
    const clienteId = req.user.userId;
    const rawDireccionEnvioId =
      req.body?.DireccionEnvioID ??
      req.body?.direccionEnvioId ??
      req.body?.direccionenvioid;
    const DireccionEnvioID = Number.parseInt(rawDireccionEnvioId, 10);

    const rawMetodoPago =
      req.body?.MetodoPago ?? req.body?.metodoPago ?? req.body?.metodo ?? null;

    let MetodoPago = rawMetodoPago;
    if (typeof rawMetodoPago === "string") {
      const trimmed = rawMetodoPago.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          MetodoPago = JSON.parse(trimmed);
        } catch {
          MetodoPago = trimmed;
        }
      } else {
        MetodoPago = trimmed;
      }
    }

    // Validar datos de entrada
    if (!Number.isInteger(DireccionEnvioID) || DireccionEnvioID <= 0) {
      removeUploadedComprobante();
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
      removeUploadedComprobante();
      return res.status(404).json({
        success: false,
        message: "Dirección no encontrada o no pertenece al cliente",
      });
    }

    // 2. Obtener el carrito del cliente
    const carritoResult = await client.query(
      "SELECT CarritoID FROM CarritoDeCompra WHERE ClienteID = $1 AND tenant_id = $2",
      [clienteId, tenant_id]
    );

    if (carritoResult.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      removeUploadedComprobante();
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
        pre.tipoproductoid,
        pv.preciounitario,
        pv.precioofertaunitario,
        pv.stock,
        p.nombreproducto,
        p.proveedorid_default,
        COALESCE(
          (SELECT url_imagen FROM producto_variante_imagenes WHERE varianteid = pv.varianteid ORDER BY orden LIMIT 1),
          (SELECT url_imagen FROM producto_imagenes WHERE productoid = p.productoid ORDER BY orden LIMIT 1)
        ) AS imagenurl
      FROM itemsdelcarrito ic
      INNER JOIN producto_variantes pv ON pv.varianteid = ic.varianteid
      INNER JOIN productos p ON p.productoid = pv.productoid
      LEFT JOIN proveedor_reglas_empaque pre ON pre.reglaid = p.reglaid
      LEFT JOIN cat_tamanopaquetes t ON t.tamanoid = ic.tamanoid
      WHERE ic.carritoid = $1
        AND p.tenant_id = $2
        AND (t.tenant_id = $2 OR t.tenant_id IS NULL)
      FOR UPDATE OF pv`,
      [carritoId, tenant_id]
    );

    if (itemsResult.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      removeUploadedComprobante();
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

    // Validar que todos los items tengan tamano_valor válido
    const itemsInvalidos = items.filter(item => !item.tamano_valor || item.tamano_valor <= 0);
    if (itemsInvalidos.length > 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      removeUploadedComprobante();
      
      const detallesError = itemsInvalidos.map(item => 
        `${item.nombreproducto} (SKU: ${item.sku}) - TamanoID: ${item.tamanoid || 'NULL'}`
      ).join(', ');
      
      console.error('Items del carrito sin presentación válida:', detallesError);
      
      return res.status(400).json({
        success: false,
        message: "Algunos productos en tu carrito no tienen una presentación válida. Por favor, elimínalos y vuelve a agregarlos.",
      });
    }

    const multiploPorKey = new Map();
    for (const item of items) {
      const key = `${item.proveedorid_default || 0}:${item.tipoproductoid || 0}`;
      if (multiploPorKey.has(key)) continue;
      const multiplo = await obtenerMultiploBackorderDesdeReglaEmpaque({
        proveedorId: item.proveedorid_default,
        tipoProductoId: item.tipoproductoid,
      });
      multiploPorKey.set(key, multiplo);
    }

    const productosEnPedido = [
      ...new Set(items.map((item) => item.productoid).filter(Boolean)),
    ];

    let masterVariantsMap = new Map();

    if (productosEnPedido.length) {
      const masterVariantsResult = await client.query(
        `SELECT pv.ProductoID, pv.VarianteID, COALESCE(pv.Stock, 0) AS Stock
         FROM Producto_Variantes pv
         INNER JOIN Productos p ON p.ProductoID = pv.ProductoID
         WHERE pv.ProductoID = ANY($1::int[])
           AND pv.PiezasPorPaquete = 1
           AND p.tenant_id = $2
         FOR UPDATE`,
        [productosEnPedido, tenant_id]
      );

      masterVariantsMap = new Map(
        masterVariantsResult.rows.map((row) => [
          row.productoid,
          {
            varianteId: row.varianteid,
            stock: Math.max(parseInt(row.stock, 10), 0),
          },
        ])
      );
    }

    for (const productId of productosEnPedido) {
      if (!masterVariantsMap.has(productId)) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        removeUploadedComprobante();
        return res.status(400).json({
          success: false,
          message:
            "No se encontró la variante maestra (1 pieza) para uno de los productos en el pedido.",
        });
      }
    }

    // 4. Calcular el monto total CON LÓGICA DE OFERTAS + split (stock + backorder)
    const montoTotal = items.reduce((total, item, index) => {

      const precioBase =
        item.preciounitario !== null ? parseFloat(item.preciounitario) : 0;
      const precioOferta =
        item.precioofertaunitario !== null
          ? parseFloat(item.precioofertaunitario)
          : null;
      const precioUnitario = precioOferta || precioBase;
      const tamanoValor =
        item.tamano_valor !== null ? parseInt(item.tamano_valor, 10) : 0;

      if (!tamanoValor || tamanoValor <= 0) {
        return total;
      }

      const masterInfo = masterVariantsMap.get(item.productoid);
      const stockActual =
        masterInfo && typeof masterInfo.stock === "number" ? masterInfo.stock : 0;

      const split = calcularSplitBackorder({
        cantidadSolicitada: item.cantidad,
        stockPiezas: stockActual,
        piezasPorPaquete: tamanoValor,
        multiploBackorder:
          multiploPorKey.get(
            `${item.proveedorid_default || 0}:${item.tipoproductoid || 0}`
          ) || 1,
      });

      const subtotal = split.cantidadTotalCobrar * tamanoValor * precioUnitario;
      
      return total + (Number.isFinite(subtotal) ? subtotal : 0);
    }, 0);

    // Validar que el monto total sea válido
    if (!Number.isFinite(montoTotal) || montoTotal <= 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      removeUploadedComprobante();
      return res.status(400).json({
        success: false,
        message: "Error al calcular el monto del pedido. Verifica que todos los productos tengan precio y presentación válidos.",
      });
    }

    // 4.5. Validar y aplicar cupón si se proporcionó
    let cuponId = null;
    let montoDescuento = 0;
    let montoTotalFinal = montoTotal;
    const codigoCupon = req.body?.codigoCupon || req.body?.cupon || null;

    if (codigoCupon && typeof codigoCupon === "string" && codigoCupon.trim()) {
      const codigoUpper = codigoCupon.trim().toUpperCase();

      const cuponResult = await client.query(
        `SELECT 
          cuponid,
          codigo,
          descripcion,
          tipo_descuento,
          valor,
          fecha_inicio,
          fecha_fin,
          uso_maximo,
          usos_actuales,
          activo,
          monto_minimo_compra
        FROM cupones
        WHERE UPPER(codigo) = $1
        FOR UPDATE`,
        [codigoUpper]
      );

      if (cuponResult.rows.length === 0) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        removeUploadedComprobante();
        return res.status(400).json({
          success: false,
          message: "El cupón no existe",
        });
      }

      const cupon = cuponResult.rows[0];

      if (!cupon.activo) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        removeUploadedComprobante();
        return res.status(400).json({
          success: false,
          message: "Este cupón ya no está activo",
        });
      }

      const ahora = new Date();
      const fechaInicio = cupon.fecha_inicio ? new Date(cupon.fecha_inicio) : null;
      const fechaFin = cupon.fecha_fin ? new Date(cupon.fecha_fin) : null;

      if (fechaInicio && ahora < fechaInicio) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        removeUploadedComprobante();
        return res.status(400).json({
          success: false,
          message: "Este cupón aún no está disponible",
        });
      }

      if (fechaFin && ahora > fechaFin) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        removeUploadedComprobante();
        return res.status(400).json({
          success: false,
          message: "Este cupón ya expiró",
        });
      }

      const usoMaximo = cupon.uso_maximo ? parseInt(cupon.uso_maximo, 10) : null;
      const usosActuales = parseInt(cupon.usos_actuales || 0, 10);

      if (usoMaximo !== null && usosActuales >= usoMaximo) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        removeUploadedComprobante();
        return res.status(400).json({
          success: false,
          message: "Este cupón ha alcanzado su límite de usos",
        });
      }

      const montoMinimo = parseFloat(cupon.monto_minimo_compra || 0);
      if (montoTotal < montoMinimo) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        removeUploadedComprobante();
        return res.status(400).json({
          success: false,
          message: `Este cupón requiere una compra mínima de $${montoMinimo.toFixed(2)}`,
        });
      }

      const tipoDescuento = (cupon.tipo_descuento || "PORCENTAJE").toUpperCase();
      const valor = parseFloat(cupon.valor || 0);

      if (tipoDescuento === "PORCENTAJE") {
        montoDescuento = (montoTotal * valor) / 100;
      } else if (tipoDescuento === "FIJO") {
        montoDescuento = valor;
      }

      montoDescuento = Math.min(montoDescuento, montoTotal);
      montoDescuento = parseFloat(montoDescuento.toFixed(2));
      montoTotalFinal = parseFloat((montoTotal - montoDescuento).toFixed(2));
      cuponId = cupon.cuponid;

      await client.query(
        "UPDATE cupones SET usos_actuales = usos_actuales + 1 WHERE cuponid = $1",
        [cuponId]
      );
    }

    // 5. Obtener el agente asignado al cliente (si existe)
    const clienteAgenteResult = await client.query(
      "SELECT AgenteID, Nombre, Email FROM Clientes WHERE ClienteID = $1",
      [clienteId]
    );

    if (clienteAgenteResult.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      removeUploadedComprobante();
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

    const metodoPago = (() => {
      if (
        MetodoPago &&
        typeof MetodoPago === "object" &&
        typeof MetodoPago.metodo === "string"
      ) {
        return MetodoPago.metodo.trim().toLowerCase();
      }
      if (typeof MetodoPago === "string" && MetodoPago.trim()) {
        return MetodoPago.trim().toLowerCase();
      }
      return "efectivo";
    })();

    const metodoPagoEsCredito = metodoPago === "credito";
    let creditoInfo = null;
    let diasGracia = 0;

    if (metodoPagoEsCredito) {
      const creditoResult = await client.query(
        `
          SELECT credito_id, limite_credito, saldo_deudor, dias_gracia
          FROM cliente_creditos
          WHERE cliente_id = $1
          FOR UPDATE
          LIMIT 1
        `,
        [clienteId]
      );

      if (!creditoResult.rows.length) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(400).json({
          success: false,
          message:
            "No tienes una línea de crédito activa. Selecciona otro método de pago.",
        });
      }

      const creditoRow = creditoResult.rows[0];

      const limiteCredito =
        Number.parseFloat(creditoRow.limite_credito ?? 0) || 0;
      const saldoDeudor =
        Number.parseFloat(creditoRow.saldo_deudor ?? 0) || 0;
      const saldoDisponible = limiteCredito - saldoDeudor;

      if (montoTotalFinal - saldoDisponible > 0.009) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(400).json({
          success: false,
          message: "Saldo de crédito insuficiente para completar esta compra.",
        });
      }

      const diasRaw = Number.parseInt(creditoRow.dias_gracia, 10);
      diasGracia =
        !Number.isNaN(diasRaw) && diasRaw > 0 ? diasRaw : 15;

      creditoInfo = {
        creditoId: creditoRow.credito_id,
        saldoActual: saldoDeudor,
        limiteCredito,
        nuevoSaldo: parseFloat((saldoDeudor + montoTotalFinal).toFixed(2)),
      };
    }

    const metodoPagoReferencia =
      typeof MetodoPago === "object" ? MetodoPago?.referenciaPago || null : null;

    const comprobanteUrl =
      req.file && req.file.path
        ? req.file.path
        : null;

    // Validar que si se sube comprobante, el método de pago sea transferencia
    if (comprobanteUrl && metodoPago !== "transferencia") {
      removeUploadedComprobante();
      return res.status(400).json({
        success: false,
        message: "Solo se puede subir comprobante para pagos por transferencia.",
      });
    }

    // Si es transferencia Y se subió comprobante, validar que exista
    if (metodoPago === "transferencia" && comprobanteUrl) {
      // Validar que el archivo se subió correctamente
      if (!req.file || !req.file.path) {
        removeUploadedComprobante();
        return res.status(400).json({
          success: false,
          message: "Error al procesar el comprobante de pago. Inténtalo de nuevo.",
        });
      }
    }

    let pedido;
    let pedidoId;
    let pedidoTransaccionId = null;
    let pedidoComprobanteUrl = null;
    let pedidoEstatus = "Pendiente";
    let pedidoPagado = false;

    // Lógica de estatus según método de pago
    if (metodoPago === "mercadopago") {
      pedidoPagado = false;
      pedidoEstatus = "Esperando Surtido";
      pedidoTransaccionId = null;
      pedidoComprobanteUrl = null;
    } else if (metodoPago === "transferencia") {
      // Si se subió comprobante, el pedido está pagado y confirmado
      if (comprobanteUrl) {
        pedidoPagado = true;
        pedidoEstatus = "Confirmado";
        pedidoComprobanteUrl = comprobanteUrl;
      } else {
        // Si NO se subió comprobante, se espera pago post-surtido
        pedidoPagado = false;
        pedidoEstatus = "Esperando Surtido";
        pedidoComprobanteUrl = null;
      }
    } else if (metodoPago === "contra_entrega") {
      pedidoPagado = false;
      pedidoEstatus = "Confirmado";
      pedidoTransaccionId = null;
      pedidoComprobanteUrl = null;
    } else if (metodoPagoEsCredito) {
      pedidoPagado = false;
      pedidoEstatus = "Aprobado";
      pedidoComprobanteUrl = null;
    }

    async function registrarPedido() {
      const pedidoResult = await client.query(
        `INSERT INTO Pedidos (
           ClienteID,
           AgenteID,
           DireccionEnvioID,
           MontoTotal,
           Estatus,
           Es_Credito,
           Pagado,
           Fecha_Vencimiento,
           Metodo_Pago,
           Transaccion_ID,
           Comprobante_URL,
           Cupon_ID,
           Monto_Descuento,
           Saldo_Pendiente,
           monto_surtido,
           monto_backorder,
           tenant_id
         )
         VALUES (
           $1,
           $2,
           $3,
           $4,
           $5,
           $6,
           $7,
           CASE
             WHEN $6 THEN CURRENT_TIMESTAMP + ($8 * INTERVAL '1 day')
             ELSE NULL
           END,
           $9,
           $10,
           $11,
           $12,
           $13,
           $14,
           0,
           $4,
           $15
         )
         RETURNING PedidoID, FechaPedido, MontoTotal, Estatus, Fecha_Vencimiento, Es_Credito, Pagado, Metodo_Pago, Transaccion_ID, Comprobante_URL, Cupon_ID, Monto_Descuento, Saldo_Pendiente`,
        [
          clienteId,
          agenteId,
          DireccionEnvioID,
          montoTotalFinal,
          pedidoEstatus,
          metodoPagoEsCredito,
          pedidoPagado,
          metodoPagoEsCredito ? diasGracia : 0,
          metodoPago || null,
          pedidoTransaccionId,
          pedidoComprobanteUrl,
          cuponId,
          montoDescuento,
          metodoPagoEsCredito ? montoTotalFinal : 0,
          tenant_id,
        ]
      );
      pedido = pedidoResult.rows[0];
      pedidoId = pedido.pedidoid;
    }

    async function aplicarCargoCredito(info) {
      // REFACTORIZACIÓN: Ya NO se cobra el crédito al crear el pedido.
      // El cargo real se aplicará cuando el admin genere la remisión.
      // Esta función se mantiene por compatibilidad pero ya no ejecuta el cargo.
      if (!info) return null;

      // Solo retornamos información sin modificar saldo
      return {
        creditoId: info.creditoId,
        saldoAnterior: info.saldoActual,
        saldoActual: info.saldoActual, // Mantener el saldo sin cambios
        cargoDiferido: true, // Indicador de que el cargo está pendiente
      };
    }

    await registrarPedido();

    // 7. Crear los detalles del pedido y actualizar inventario
    const detallesPedido = [];
    const backordersGenerados = [];
    const itemsConBackorder = []; // Acumular items para procesamiento agrupado
    let pedidoTieneBackorder = false;
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
      const masterInfo = masterVariantsMap.get(item.productoid);
      const stockActual =
        masterInfo && typeof masterInfo.stock === "number"
          ? masterInfo.stock
          : 0;

      const split = calcularSplitBackorder({
        cantidadSolicitada: cantidadRequerida,
        stockPiezas: stockActual,
        piezasPorPaquete: tamanoValor,
        multiploBackorder:
          multiploPorKey.get(
            `${item.proveedorid_default || 0}:${item.tipoproductoid || 0}`
          ) || 1,
      });

      const cantidadSurtida = split.cantidadSurtida;
      const cantidadBackorder = split.cantidadBackorderAjustada;
      const piezasSurtidas = cantidadSurtida * tamanoValor;
      const piezasBackorder = cantidadBackorder * tamanoValor;

      const piezasSolicitadasOriginal = tamanoValor * cantidadRequerida;
      const piezasTotalesCobrar = tamanoValor * split.cantidadTotalCobrar;

      const subtotalSolicitado = parseFloat(
        (precioUnitario * piezasTotalesCobrar).toFixed(2)
      );
      const subtotalSurtido = parseFloat(
        (precioUnitario * piezasSurtidas).toFixed(2)
      );

      // PUNTO CLAVE: Si hay backorder, acumular para procesamiento agrupado
      if (cantidadBackorder > 0) {
        pedidoTieneBackorder = true;
        itemsConBackorder.push({
          productoID: item.productoid,
          varianteID: item.varianteid,
          cantidadFaltante: cantidadBackorder,
          tamanoID: item.tamanoid,
          proveedorID: item.proveedorid_default,
          sku: item.sku,
          nombreProducto: item.nombreproducto,
          cantidadPiezasFaltantes: piezasBackorder,
        });
      }

      // Insertar detalle surtido (si aplica)
      if (cantidadSurtida > 0) {
        const detalleResult = await client.query(
          `INSERT INTO DetallesDelPedido (
             PedidoID,
             VarianteID,
             TamanoID,
             CantidadPaquetes,
             PrecioPorPaquete,
             PiezasTotales,
             PrecioUnitario,
             EsBackorder,
             CantidadSurtida,
             CantidadBackorder,
             tenant_id
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, $4, 0, $8)
           RETURNING DetalleID`,
          [
            pedidoId,
            item.varianteid,
            item.tamanoid,
            cantidadSurtida,
            precioPorPaquete,
            piezasSurtidas,
            precioUnitario.toFixed(2),
            tenant_id,
          ]
        );

        detallesPedido.push({
          detalleId: detalleResult.rows[0].detalleid,
          varianteId: item.varianteid,
          productoId: item.productoid,
          nombreProducto: item.nombreproducto,
          tamanoId: item.tamanoid,
          cantidad: cantidadSurtida,
          esBackorder: false,
          cantidadSurtida,
          cantidadBackorder: 0,
          piezasPorPaquete: tamanoValor,
          presentacion: item.tamano_etiqueta || null,
          precioUnitario,
          precioPorPaquete,
          piezasSolicitadas: piezasSolicitadasOriginal,
          piezasSurtidas,
          piezasBackorder: 0,
          subtotalSolicitado,
          subtotalSurtido,
          sku: item.sku,
          dimensiones: item.dimensiones,
          imagenUrl: item.imagenurl,
          reglaBackorder: split.reglaBackorder,
          ajusteAplicado: split.ajusteAplicado,
          cantidadTotalCobrar: split.cantidadTotalCobrar,
        });
      }

      // Insertar detalle backorder (si aplica)
      if (cantidadBackorder > 0) {
        const detalleBackorderResult = await client.query(
          `INSERT INTO DetallesDelPedido (
             PedidoID,
             VarianteID,
             TamanoID,
             CantidadPaquetes,
             PrecioPorPaquete,
             PiezasTotales,
             PrecioUnitario,
             EsBackorder,
             CantidadSurtida,
             CantidadBackorder,
             tenant_id
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, 0, $4, $8)
           RETURNING DetalleID`,
          [
            pedidoId,
            item.varianteid,
            item.tamanoid,
            cantidadBackorder,
            precioPorPaquete,
            piezasBackorder,
            precioUnitario.toFixed(2),
            tenant_id,
          ]
        );

        detallesPedido.push({
          detalleId: detalleBackorderResult.rows[0].detalleid,
          varianteId: item.varianteid,
          productoId: item.productoid,
          nombreProducto: item.nombreproducto,
          tamanoId: item.tamanoid,
          cantidad: cantidadBackorder,
          esBackorder: true,
          cantidadSurtida: 0,
          cantidadBackorder,
          piezasPorPaquete: tamanoValor,
          presentacion: item.tamano_etiqueta || null,
          precioUnitario,
          precioPorPaquete,
          piezasSolicitadas: piezasSolicitadasOriginal,
          piezasSurtidas: 0,
          piezasBackorder,
          subtotalSolicitado,
          subtotalSurtido: 0,
          sku: item.sku,
          dimensiones: item.dimensiones,
          imagenUrl: item.imagenurl,
          reglaBackorder: split.reglaBackorder,
          ajusteAplicado: split.ajusteAplicado,
          cantidadTotalCobrar: split.cantidadTotalCobrar,
        });
      }

      // Actualizar stock del producto (solo se descuenta lo efectivamente surtido en PIEZAS)
      if (piezasSurtidas > 0 && masterInfo) {
        const nuevoStockMaestro = Math.max(stockActual - piezasSurtidas, 0);
        masterInfo.stock = nuevoStockMaestro;

        await client.query(
          "UPDATE producto_variantes SET Stock = $1 WHERE VarianteID = $2",
          [nuevoStockMaestro, masterInfo.varianteId]
        );

        await client.query(
          `INSERT INTO Log_Inventario (VarianteID, CantidadCambiado, NuevoStock, Motivo, UsuarioID, tenant_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            masterInfo.varianteId,
            -piezasSurtidas,
            nuevoStockMaestro,
            `Venta Pedido #${pedidoId}`,
            clienteId,
            tenant_id,
          ]
        );

        variantesAfectadas.add(masterInfo.varianteId);
      }

      // detallesPedido se llena con las líneas insertadas (surtido / backorder)
    }

    // PROCESAMIENTO AGRUPADO DE BACKORDERS
    // Después de procesar todos los items, generar órdenes de compra agrupadas por proveedor
    if (itemsConBackorder.length > 0) {
      const ordenesGeneradas = await generarBackordersAgrupados(
        client,
        itemsConBackorder,
        null, // usuarioCreadorId (NULL para backorders generados por clientes)
        pedidoId, // pedidoOrigenId - Trazabilidad al pedido
        tenant_id // tenant_id - Aislamiento multi-tenant
      );

      // Mapear resultados para el array de backordersGenerados
      for (const orden of ordenesGeneradas) {
        for (const detalle of orden.detalles) {
          const itemOriginal = itemsConBackorder.find(
            i => i.varianteID === detalle.varianteID
          );
          
          if (itemOriginal) {
            backordersGenerados.push({
              varianteId: detalle.varianteID,
              sku: itemOriginal.sku,
              productoId: detalle.productoID,
              nombreProducto: itemOriginal.nombreProducto,
              cantidadPaquetesFaltantes: detalle.cantidadSolicitada,
              cantidadPiezasFaltantes: itemOriginal.cantidadPiezasFaltantes,
              ordenCompraId: orden.ordenCompraID,
              proveedorId: orden.proveedorID,
              esOrdenNueva: true,
            });
          }
        }
      }
    }

    if (pedidoTieneBackorder) {
      const updatePedidoResult = await client.query(
        "UPDATE Pedidos SET Estatus = 'Parcialmente Surtido' WHERE PedidoID = $1 RETURNING Estatus",
        [pedidoId]
      );
      if (updatePedidoResult.rows.length > 0) {
        pedido.estatus = updatePedidoResult.rows[0].estatus;
      } else {
        pedido.estatus = "Parcialmente Surtido";
      }
    }

    // 8. Crear comisión si se usó código de agente
    let comision = null;
    if (agenteId) {
      // Obtener el porcentaje de comisión del agente desde la base de datos
      const agenteResult = await client.query(
        `SELECT porcentaje_comision FROM agentesdeventas WHERE agenteid = $1`,
        [agenteId]
      );
      
      // Usar el porcentaje configurado o default 5% si no existe
      const porcentajeComision = agenteResult.rows.length > 0 && agenteResult.rows[0].porcentaje_comision 
        ? parseFloat(agenteResult.rows[0].porcentaje_comision) 
        : 5.00;
      
      // Calcular comisión: (Total - Costo Envío) * (Porcentaje / 100)
      const baseComision = montoTotalFinal - (costoEnvio || 0);
      const montoComision = baseComision * (porcentajeComision / 100);
      
      const comisionResult = await client.query(
        `INSERT INTO Comisiones (PedidoID, AgenteID, MontoComision, Estatus, tenant_id)
         VALUES ($1, $2, $3, 'Pendiente', $4)
         RETURNING ComisionID, MontoComision, FechaCalculo`,
        [pedidoId, agenteId, montoComision, tenant_id]
      );

      comision = {
        comisionId: comisionResult.rows[0].comisionid,
        agenteId: agenteId,
        montoComision: parseFloat(comisionResult.rows[0].montocomision),
        porcentajeAplicado: porcentajeComision,
        fechaCalculo: comisionResult.rows[0].fechacalculo,
        estatus: "Pendiente",
      };
    }

    // REFACTORIZACIÓN: El cargo de crédito ya NO se aplica aquí.
    // Se aplicará cuando el admin confirme el pedido vía remisión.
    let resultadoCredito = null;
    if (metodoPagoEsCredito) {
      resultadoCredito = await aplicarCargoCredito(creditoInfo);
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
        credito: resultadoCredito,
      },
    };

    res.status(201).json(respuesta);

    const emailCliente = req.user?.email || clienteEmailDb;
    if (emailCliente) {
      const asunto = `Confirmación de Pedido #${pedido.pedidoid}`;
      
      // Construir detalles de productos para el correo
      const productosParaEmail = detallesPedido.map(detalle => {
        const imagenUrl = detalle.imagenUrl || 'https://via.placeholder.com/60x60/e5e7eb/6b7280?text=Producto';
        const variant = detalle.dimensiones ? `${detalle.dimensiones}` : null;
        const precioFormateado = `$${parseFloat(detalle.precioPorPaquete || 0).toFixed(2)}`;
        
        return {
          name: detalle.nombreProducto || 'Producto',
          variant: variant,
          quantity: detalle.cantidad || 0,
          price: precioFormateado,
          image: imagenUrl
        };
      });

      const subtotalCalculado = detallesPedido.reduce((sum, d) => {
        return sum + (parseFloat(d.precioPorPaquete || 0) * (d.cantidad || 0));
      }, 0);

      // Calcular costo de envío (diferencia entre total y subtotal si aplica descuento)
      const costoEnvio = 0; // Por ahora el sistema no cobra envío
      const descuentoAplicado = montoDescuento || 0;

      const orderDetails = {
        id: pedido.pedidoid,
        items: productosParaEmail,
        subtotal: `$${subtotalCalculado.toFixed(2)}`,
        shipping: `$${costoEnvio.toFixed(2)}`,
        total: `$${parseFloat(pedido.montototal).toFixed(2)}`
      };

      const frontendUrl = process.env.FRONTEND_BASE_URL || 'https://razo.com.mx';
      
      sendTemplatedEmail(emailCliente, asunto, {
        title: '¡Pedido Confirmado!',
        name: clienteNombre,
        message: `Hemos recibido tu pedido y ya estamos trabajando en prepararlo. Te notificaremos cuando esté listo para envío.`,
        orderDetails: orderDetails,
        buttonText: 'Ver Mi Pedido',
        buttonUrl: `${frontendUrl}/perfil/pedidos`,
        additionalInfo: `<strong>Método de Pago:</strong> ${metodoPago === 'credito' ? 'Crédito' : metodoPago === 'transferencia' ? 'Transferencia' : 'Efectivo'}<br><strong>Estatus:</strong> ${pedido.estatus}`
      }).catch((err) => {
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
      const esContraEntrega = metodoPago === 'contra_entrega';
      const asuntoAgente = esContraEntrega 
        ? `🚚 PAGO CONTRA ENTREGA - Nuevo pedido de ${clienteNombre} (#${pedido.pedidoid})`
        : `🔔 Tu cliente ${clienteNombre} ha realizado un pedido (#${pedido.pedidoid})`;
      
      const mensajeEspecial = esContraEntrega
        ? `<div style="background: #fffbeb; border-left: 4px solid #f59e0b; padding: 1rem; margin: 1rem 0; border-radius: 0.5rem;">
             <p style="margin: 0; color: #92400e; font-weight: bold;">⚠️ IMPORTANTE: Pago contra entrega</p>
             <p style="margin: 0.5rem 0 0; color: #78350f; font-size: 0.9rem;">
               Este pedido requiere que cobres el monto directamente al cliente al momento de la entrega. 
               <strong>Recuerda subir la foto de la remisión firmada como comprobante.</strong>
             </p>
           </div>`
        : '';
      
      const cuerpoAgente = `
        <div style="font-family: Arial, sans-serif; color: #1f2937;">
          <h2 style=\"color:#2563eb;\">Nuevo pedido de tu cliente</h2>
          <p>Cliente: <strong>${clienteNombre}</strong></p>
          <p>Pedido: <strong>#${pedido.pedidoid}</strong></p>
          <p>Monto total: <strong>$${parseFloat(pedido.montototal).toFixed(
            2
          )}</strong></p>
          <p>Método de pago: <strong>${esContraEntrega ? 'Pago contra entrega' : metodoPago === 'credito' ? 'Crédito' : metodoPago === 'transferencia' ? 'Transferencia' : 'Efectivo'}</strong></p>
          ${mensajeEspecial}
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
    const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    const isServerError = status >= 500;
    res.status(status).json({
      success: false,
      message: isServerError
        ? "Error al crear el pedido"
        : error.message || "No se pudo crear el pedido",
      ...(isServerError ? { error: error.message } : {}),
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
    if (!req.tenant || !req.tenant.tenant_id) {
      return res.status(500).json({
        success: false,
        message: "Error: tenant no disponible"
      });
    }
    const { tenant_id } = req.tenant;
    const clienteId = req.user.userId;

    const query = `
      SELECT 
        p.PedidoID,
        p.FechaPedido,
        p.MontoTotal,
        p.CostoEnvio,
        p.Monto_Descuento,
        p.Cupon_ID,
        p.Estatus,
        p.Es_Credito,
        p.Pagado,
        p.Metodo_Pago,
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
      WHERE p.ClienteID = $1 AND p.tenant_id = $2
      ORDER BY p.FechaPedido DESC
    `;

    const result = await db.query(query, [clienteId, tenant_id]);

    // Para cada pedido, obtener sus detalles
    const pedidos = await Promise.all(
      result.rows.map(async (pedido) => {
        const detallesQuery = `
        SELECT
          dp.detalleid,
          dp.varianteid,
          dp.cantidadpaquetes AS cantidad,
          dp.esbackorder,
          dp.cantidadsurtida,
          dp.cantidadbackorder,
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
          AND (pr.tenant_id = $2 OR pr.tenant_id IS NULL)
          AND (ct.tenant_id = $2 OR ct.tenant_id IS NULL)
        ORDER BY dp.detalleid ASC
      `;

        const detallesResult = await db.query(detallesQuery, [pedido.pedidoid, tenant_id]);

        // Recalcular total desde items (NO confiar en montototal de BD)
        const items = detallesResult.rows.map((item) => {
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
            esBackorder: item.esbackorder === true,
            cantidadSurtida:
              item.cantidadsurtida !== null
                ? parseInt(item.cantidadsurtida, 10)
                : null,
            cantidadBackorder:
              item.cantidadbackorder !== null
                ? parseInt(item.cantidadbackorder, 10)
                : null,
            precioUnitario: precioUnitarioAplicado,
            precioPorPaquete,
            subtotal,
            piezasTotales: item.piezastotales,
            dimensiones: item.dimensiones,
            imagenUrl: item.imagenurl,
          };
        });

        // Calcular subtotal desde items reales
        const subtotalProductos = items.reduce((sum, item) => sum + (parseFloat(item.subtotal) || 0), 0);
        
        // Parse shipping y descuento
        const costoEnvio = parseFloat(pedido.costoenvio) || 0;
        
        // Solo aplicar descuento si hay un cupón válido (ID numérico positivo)
        const cuponIdNumerico = parseInt(pedido.cupon_id);
        const tieneCupon = !isNaN(cuponIdNumerico) && cuponIdNumerico > 0;
        const montoDescuento = tieneCupon ? (parseFloat(pedido.monto_descuento) || 0) : 0;
        
        // Calcular total real: Subtotal + Envío - Descuento (solo si hay cupón)
        const montoTotalCalculado = subtotalProductos + costoEnvio - montoDescuento;

        return {
          pedidoId: pedido.pedidoid,
          fechaPedido: pedido.fechapedido,
          montoTotal: parseFloat(montoTotalCalculado.toFixed(2)),
          esCredito: pedido.es_credito || false,
          pagado: pedido.pagado || false,
          metodoPago: pedido.metodo_pago || null,
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
          items,
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
    if (!req.tenant || !req.tenant.tenant_id) {
      return res.status(500).json({
        success: false,
        message: "Error: tenant no disponible"
      });
    }
    const { tenant_id } = req.tenant;
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
      WHERE p.PedidoID = $1 AND p.ClienteID = $2 AND p.tenant_id = $3
    `;

    const pedidoResult = await db.query(pedidoQuery, [pedidoId, clienteId, tenant_id]);

    if (pedidoResult.rows.length === 0) {
      const existsResult = await db.query(
        "SELECT ClienteID FROM Pedidos WHERE PedidoID = $1 AND tenant_id = $2",
        [pedidoId, tenant_id]
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
        dp.esbackorder,
        dp.cantidadsurtida,
        dp.cantidadbackorder,
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
        AND prod.tenant_id = $2
        AND (t.tenant_id = $2 OR t.tenant_id IS NULL)
      ORDER BY dp.detalleid ASC
    `;

    const detallesResult = await db.query(detallesQuery, [pedidoId, tenant_id]);

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
        esBackorder: item.esbackorder === true,
        cantidadSurtida:
          item.cantidadsurtida !== null ? parseInt(item.cantidadsurtida, 10) : null,
        cantidadBackorder:
          item.cantidadbackorder !== null
            ? parseInt(item.cantidadbackorder, 10)
            : null,
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

/**
 * GET /api/pedidos/:id/payment-trigger
 * Verifica si el pedido tiene remisión y genera datos de pago
 * LÓGICA: Solo permite pago cuando existe remisión (stock confirmado)
 */
const obtenerDatosPago = async (req, res) => {
  try {
    if (!req.tenant || !req.tenant.tenant_id) {
      return res.status(500).json({
        success: false,
        message: "Error: tenant no disponible"
      });
    }
    const { tenant_id } = req.tenant;
    const clienteId = req.user.userId;
    const pedidoId = parseInt(req.params.id, 10);

    if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de pedido inválido",
      });
    }

    // 1. Verificar que el pedido existe y pertenece al cliente
    const pedidoQuery = await db.query(
      `SELECT 
        p.pedidoid,
        p.clienteid,
        p.montototal,
        p.estatus,
        p.metodo_pago,
        p.pagado,
        p.es_credito,
        c.nombre AS cliente_nombre,
        c.email AS cliente_email
       FROM pedidos p
       INNER JOIN clientes c ON p.clienteid = c.clienteid
       WHERE p.pedidoid = $1 AND p.clienteid = $2 AND p.tenant_id = $3`,
      [pedidoId, clienteId, tenant_id]
    );

    if (pedidoQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pedido no encontrado",
      });
    }

    const pedido = pedidoQuery.rows[0];

    // 2. Verificar si ya está pagado
    if (pedido.pagado) {
      return res.status(400).json({
        success: false,
        message: "Este pedido ya ha sido pagado",
      });
    }

    // 3. Verificar si es pedido a crédito (no aplica pago post-surtido)
    if (pedido.es_credito) {
      return res.status(400).json({
        success: false,
        message: "Los pedidos a crédito no requieren pago inmediato",
      });
    }

    // 4. Verificar si existe remisión para este pedido
    const remisionQuery = await db.query(
      `SELECT 
        remision_id,
        folio,
        total_remision,
        estado,
        fecha_emision
       FROM remisiones
       WHERE pedido_id = $1 AND tenant_id = $2 AND estado = 'EMITIDA'
       ORDER BY fecha_emision DESC
       LIMIT 1`,
      [pedidoId, tenant_id]
    );

    // 5. Si NO hay remisión, el pedido está en proceso de validación
    if (remisionQuery.rows.length === 0) {
      return res.status(200).json({
        success: true,
        paymentReady: false,
        message: "Tu pedido está en proceso de validación de stock. Te notificaremos cuando esté listo para pago.",
        data: {
          pedidoId: pedido.pedidoid,
          estatus: pedido.estatus,
          montoOriginal: parseFloat(pedido.montototal),
        },
      });
    }

    // 6. Si hay remisión, generar datos de pago según método
    const remision = remisionQuery.rows[0];
    const montoAPagar = parseFloat(remision.total_remision);
    const metodoPago = pedido.metodo_pago || 'transferencia';

    const responseData = {
      success: true,
      paymentReady: true,
      message: "Tu pedido está listo para pago",
      data: {
        pedidoId: pedido.pedidoid,
        remisionId: remision.remision_id,
        folioRemision: remision.folio,
        montoAPagar: montoAPagar,
        montoOriginal: parseFloat(pedido.montototal),
        metodoPago: metodoPago,
        estatus: pedido.estatus,
      },
    };

    // 7. Si es Mercado Pago, generar preferencia de pago
    if (metodoPago === 'mercadopago') {
      // TODO: Integrar con Mercado Pago SDK para generar preferencia
      // Por ahora retornamos la estructura básica
      responseData.data.mercadoPago = {
        publicKey: process.env.MERCADOPAGO_PUBLIC_KEY || null,
        preferenceId: null, // Se generará cuando se integre MP
        amount: montoAPagar,
      };
    }

    // 8. Si es transferencia, obtener datos bancarios
    if (metodoPago === 'transferencia') {
      const datosBancariosQuery = await db.query(
        `SELECT banco, cuenta, clabe, titular, referencia
         FROM configuracion_bancaria
         WHERE tenant_id = $1 AND activo = true
         LIMIT 1`,
        [tenant_id]
      );

      if (datosBancariosQuery.rows.length > 0) {
        responseData.data.datosBancarios = datosBancariosQuery.rows[0];
      } else {
        responseData.data.datosBancarios = {
          banco: "Información no disponible",
          cuenta: "Contacta a soporte",
          clabe: "Contacta a soporte",
          titular: "RazoConnect",
          referencia: `PED-${pedidoId}`,
        };
      }
    }

    return res.status(200).json(responseData);

  } catch (error) {
    console.error("Error al obtener datos de pago:", error);
    res.status(500).json({
      success: false,
      message: "Error al procesar la solicitud de pago",
      error: error.message,
    });
  }
};

module.exports = {
  crearPedido,
  obtenerPedidos,
  obtenerPedidoPorId,
  obtenerDatosPago,
};
