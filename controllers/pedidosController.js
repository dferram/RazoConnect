const fs = require("fs");
const path = require("path");
const db = require("../db");
const logger = require('../utils/logger');
const { enviarEmail, sendTemplatedEmail } = require("../services/emailService");
const {
  generarOrdenCompraAutomatica,
  generarBackorderProveedor,
  generarBackordersAgrupados,
} = require("../services/ordenesService");
const { checkStockBajo } = require("../utils/stockAlerts");
const { calcularTotalPedido, validarConsistenciaTotales } = require("../utils/calculadoraPedidos");
const SmartStockService = require("../services/SmartStockService");
const { calcularEstadoPedido } = require("../utils/pedidoStatus");
const { normalizarEstado, ESTADOS_PEDIDO } = require("../utils/pedidoEstados");

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
    // 🚨 CRITICAL FIX: Added DISTINCT ON (ic.itemid) to prevent duplicate rows
    // This prevents the "factor 4" bug where JOIN conditions create multiple rows
    // Note: FOR UPDATE cannot be used with DISTINCT ON in PostgreSQL
    const itemsResult = await client.query(
      `SELECT DISTINCT ON (ic.itemid)
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
      LEFT JOIN cat_tamanopaquetes t ON t.tamanoid = ic.tamanoid AND t.tenant_id = $2
      WHERE ic.carritoid = $1
        AND p.tenant_id = $2
      ORDER BY ic.itemid`,
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

    // 🔍 DIAGNOSTIC: Log raw query results to detect duplicates

    // 🚨 CRITICAL FIX: Deduplicate items by ItemID to prevent double insertion
    // This prevents the bug where the same cart item appears twice due to JOIN issues
    const uniqueItemsMap = new Map();
    itemsResult.rows.forEach((row) => {
      const itemId = row.itemid;
      if (!uniqueItemsMap.has(itemId)) {
        uniqueItemsMap.set(itemId, row);
      } else {
        console.warn(`⚠️ [DUPLICATE DETECTED] ItemID ${itemId} appears multiple times in query result - using first occurrence`);
      }
    });

    const items = Array.from(uniqueItemsMap.values()).map((row) => {
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
      
      logger.error('Items del carrito sin presentación válida', {
        detalles: detallesError,
        requestId: req.requestId,
        tenantId: tenant_id
      });
      
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

    // ✅ SMART STOCK: Obtener variantes maestras y stock dinámico según rol
    if (productosEnPedido.length) {
      const masterVariantsResult = await client.query(
        `SELECT pv.ProductoID, pv.VarianteID
         FROM Producto_Variantes pv
         INNER JOIN Productos p ON p.ProductoID = pv.ProductoID
         WHERE pv.ProductoID = ANY($1::int[])
           AND pv.PiezasPorPaquete = 1
           AND p.tenant_id = $2
         FOR UPDATE`,
        [productosEnPedido, tenant_id]
      );

      // Obtener IDs de variantes maestras
      const masterVarianteIds = masterVariantsResult.rows.map(r => r.varianteid);
      
      // ✅ SMART STOCK: Obtener stock dinámico según rol del cliente
      let stockMapBulk = new Map();
      if (masterVarianteIds.length > 0) {
        try {
          stockMapBulk = await SmartStockService.getBulkStock({
            varianteIds: masterVarianteIds,
            userId: req.user.id || clienteId,
            userRole: req.user.roles || ['cliente'],
            tenantId: tenant_id
          });
        } catch (stockError) {
          logger.error('Error al obtener stock dinámico', {
            error: stockError.message,
            requestId: req.requestId,
            tenantId: tenant_id
          });
          // Si falla SmartStock, rechazar pedido (seguro)
          await client.query("ROLLBACK");
          transactionStarted = false;
          removeUploadedComprobante();
          return res.status(500).json({
            success: false,
            message: "Error al validar disponibilidad de stock. Por favor, intenta nuevamente."
          });
        }
      }

      // CRITICAL: Log stock source verification
      masterVariantsResult.rows.forEach(row => {
        const stockValue = stockMapBulk.get(row.varianteid) || 0;
        if (stockValue < 0) {
          logger.error('Stock negativo detectado', {
            varianteId: row.varianteid,
            stock: stockValue,
            requestId: req.requestId,
            tenantId: tenant_id
          });
        } else if (stockValue === 0) {
          console.warn(`⚠️ [STOCK WARNING] Variante ${row.varianteid} tiene stock CERO`);
        }
      });

      masterVariantsMap = new Map(
        masterVariantsResult.rows.map((row) => {
          const stockDinamico = stockMapBulk.get(row.varianteid) || 0;
          const stockFinal = Math.max(stockDinamico, 0);
          
          return [
            row.productoid,
            {
              varianteId: row.varianteid,
              stock: stockFinal,
              stockOriginal: stockDinamico,
            },
          ];
        })
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
    // CRÍTICO: El servidor SIEMPRE recalcula el total. NUNCA confiar en el total del cliente.
    // NUEVO: Preparar items para la función centralizada de cálculo
    // 🚀 FIFO ALLOCATION: Usar fecha actual como referencia para este pedido
    const orderDate = new Date();
    
    const itemsParaCalculadora = await Promise.all(items.map(async (item, index) => {
      const precioBase = item.preciounitario !== null ? parseFloat(item.preciounitario) : 0;
      const precioOferta = item.precioofertaunitario !== null
        ? parseFloat(item.precioofertaunitario)
        : null;
      const tamanoValor = item.tamano_valor !== null ? parseInt(item.tamano_valor, 10) : 0;
      const masterInfo = masterVariantsMap.get(item.productoid);
      const stockActual = masterInfo && typeof masterInfo.stock === "number" ? masterInfo.stock : 0;

      // CRITICAL: Log stock calculation for each item

      // 🚀 FIFO ALLOCATION: Calcular disponibilidad real considerando pedidos anteriores
      const fifoAllocation = await SmartStockService.calculateAllocationStatus({
        varianteId: item.varianteid,
        cantidadRequerida: item.cantidad,
        orderDate: orderDate,
        adminId: req.user?.adminId || null,
        tenantId: tenant_id,
        pedidoId: null,
        piezasPorPaquete: tamanoValor
      });


      // Usar el resultado FIFO para crear el split
      const multiploBackorder = multiploPorKey.get(
        `${item.proveedorid_default || 0}:${item.tipoproductoid || 0}`
      ) || 1;

      // Calcular backorder ajustado según regla de empaque
      let cantidadBackorderAjustada = fifoAllocation.cantidadBackorder;
      if (fifoAllocation.cantidadBackorder > 0 && multiploBackorder > 1) {
        const piezasPendientes = fifoAllocation.cantidadBackorder * tamanoValor;
        const piezasBackorderAjustadas = Math.ceil(piezasPendientes / multiploBackorder) * multiploBackorder;
        cantidadBackorderAjustada = Math.ceil(piezasBackorderAjustadas / tamanoValor);
      }

      const split = {
        cantidadSurtida: fifoAllocation.cantidadSurtible,
        cantidadPendiente: fifoAllocation.cantidadBackorder,
        cantidadBackorderAjustada: cantidadBackorderAjustada,
        cantidadTotalCobrar: item.cantidad,
        ajusteAplicado: cantidadBackorderAjustada !== fifoAllocation.cantidadBackorder,
        reglaBackorder: multiploBackorder > 1 ? "PAQUETE" : "UNITARIO",
        fifoInfo: fifoAllocation
      };

      return {
        ...item,
        precioBase,
        precioOferta,
        piezasPorPaquete: tamanoValor,
        cantidad: split.cantidadTotalCobrar,
        split,
        stockActual,
        masterInfo
      };
    }));

    // Calcular total SIN cupón primero (para validaciones)
    const calculoSinCupon = calcularTotalPedido({
      items: itemsParaCalculadora,
      cupon: null,
      aplicarDescuentoEnDetalles: false
    });

    const montoTotal = calculoSinCupon.totalFinal;

    // PROTECCIÓN FINANCIERA: Validar si el cliente envió un total y comparar
    const totalClienteEnviado = req.body.montoTotal ? parseFloat(req.body.montoTotal) : null;
    if (totalClienteEnviado !== null) {
      const validacion = validarConsistenciaTotales(totalClienteEnviado, montoTotal, 0.50);
      
      if (!validacion.esConsistente) {
        logger.error('Discrepancia financiera detectada en pedido', {
          totalCalculado: validacion.total2,
          totalEnviado: validacion.total1,
          diferencia: validacion.diferencia,
          clienteId,
          tenantId: tenant_id,
          requestId: req.requestId
        });
        
        // NUEVO: Rechazar pedido si la diferencia es significativa (>$0.50)
        await client.query("ROLLBACK");
        transactionStarted = false;
        removeUploadedComprobante();
        return res.status(409).json({
          success: false,
          message: "El total del carrito ha cambiado. Por favor, revisa tu carrito y vuelve a intentar.",
          data: {
            totalEsperado: validacion.total1,
            totalActual: validacion.total2,
            diferencia: validacion.diferencia,
            razon: "Los precios o el stock han cambiado desde que agregaste los productos."
          }
        });
      }
    }

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

      // NUEVO: Usar función centralizada para calcular descuento Y prorratear en items
      const cuponData = {
        cuponId: cupon.cuponid,
        codigo: cupon.codigo,
        tipoDescuento: (cupon.tipo_descuento || "PORCENTAJE").toUpperCase(),
        valor: parseFloat(cupon.valor || 0)
      };

      const calculoConCupon = calcularTotalPedido({
        items: itemsParaCalculadora,
        cupon: cuponData,
        aplicarDescuentoEnDetalles: true // CRÍTICO: Prorratear descuento
      });

      montoDescuento = calculoConCupon.montoDescuento;
      montoTotalFinal = calculoConCupon.totalFinal;
      cuponId = cupon.cuponid;

      // Actualizar items con precios prorrateados
      itemsParaCalculadora.forEach((item, index) => {
        const itemCalculado = calculoConCupon.items[index];
        item.precioPaqueteConDescuento = itemCalculado.precioPaqueteConDescuento;
        item.subtotalConDescuento = itemCalculado.subtotalConDescuento;
        item.descuentoAplicado = itemCalculado.descuentoAplicado;
      });


      await client.query(
        "UPDATE cupones SET usos_actuales = usos_actuales + 1 WHERE cuponid = $1",
        [cuponId]
      );
    } else {
      // Sin cupón: mantener precios originales
      itemsParaCalculadora.forEach(item => {
        const precioUnitario = item.precioOferta || item.precioBase;
        item.precioPaqueteConDescuento = precioUnitario * item.piezasPorPaquete;
        item.subtotalConDescuento = item.subtotal;
        item.descuentoAplicado = 0;
      });
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
          SELECT credito_id, limite_credito, saldo_deudor, dias_credito
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

      const diasRaw = Number.parseInt(creditoRow.dias_credito, 10);
      diasGracia =
        !Number.isNaN(diasRaw) && diasRaw > 0 ? diasRaw : 30;

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
    // NUEVO: Estado inicial será PENDIENTE, luego se recalculará basado en detalles
    let pedidoEstatus = ESTADOS_PEDIDO.PENDIENTE;
    let pedidoPagado = false;

    // Lógica de pago según método de pago
    // NOTA: El estado se recalculará después de insertar los detalles basándose en stock/backorder
    if (metodoPago === "mercadopago") {
      pedidoPagado = false;
      pedidoTransaccionId = null;
      pedidoComprobanteUrl = null;
    } else if (metodoPago === "transferencia") {
      // Si se subió comprobante, el pedido está pagado
      if (comprobanteUrl) {
        pedidoPagado = true;
        pedidoComprobanteUrl = comprobanteUrl;
      } else {
        pedidoPagado = false;
        pedidoComprobanteUrl = null;
      }
    } else if (metodoPago === "contra_entrega") {
      pedidoPagado = false;
      pedidoTransaccionId = null;
      pedidoComprobanteUrl = null;
    } else if (metodoPagoEsCredito) {
      pedidoPagado = false;
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
             WHEN $6 THEN (CURRENT_DATE + ($8 * INTERVAL '1 day'))::TIMESTAMP + INTERVAL '23 hours 59 minutes 59 seconds'
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
      // NUEVA LÓGICA: Reservar el crédito inmediatamente (actualizar saldo_deudor)
      // pero NO crear registro en cuentas_por_cobrar.
      // El registro CXC se creará cuando el admin confirme la remisión.
      if (!info) return null;

      const saldoAnterior = parseFloat(info.saldoActual || 0);
      const montoReservar = parseFloat(montoTotalFinal);
      const nuevoSaldo = parseFloat((saldoAnterior + montoReservar).toFixed(2));

      // Actualizar saldo deudor para reservar el crédito
      await client.query(
        `UPDATE cliente_creditos
         SET saldo_deudor = $1, ultima_actualizacion = NOW()
         WHERE credito_id = $2`,
        [nuevoSaldo, info.creditoId]
      );

      // Registrar movimiento de RESERVA (no es cargo aún)
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
         VALUES ($1, 'RESERVA', $2, $3, $4, $5, $6)`,
        [
          info.creditoId,
          montoReservar.toFixed(2),
          `PED-${pedidoId}`,
          `Reserva de crédito por pedido #${pedidoId} (pendiente de confirmación)`,
          nuevoSaldo.toFixed(2),
          tenant_id
        ]
      );


      return {
        creditoId: info.creditoId,
        saldoAnterior: saldoAnterior,
        saldoActual: nuevoSaldo,
        montoReservado: montoReservar,
        creditoReservado: true,
        cxcPendiente: true,
      };
    }

    await registrarPedido();

    // 7. Crear los detalles del pedido y actualizar inventario
    const detallesPedido = [];
    const backordersGenerados = [];
    const itemsConBackorder = []; // Acumular items para procesamiento agrupado
    let pedidoTieneBackorder = false;
    
    // NUEVO: Iterar sobre itemsParaCalculadora que ya tiene precios prorrateados
    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      const item = items[itemIndex];
      const itemCalculado = itemsParaCalculadora[itemIndex];
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

      // NUEVO: Usar precios del itemCalculado (ya incluye prorrateo de descuento)
      const precioBase = itemCalculado.precioBase;
      const precioOferta = itemCalculado.precioOferta;
      const precioUnitario = precioOferta || precioBase;
      
      // CRÍTICO: Usar precio CON descuento prorrateado
      const precioPorPaquete = itemCalculado.precioPaqueteConDescuento || (precioUnitario * tamanoValor);
      const precioPorPaqueteSinDescuento = precioUnitario * tamanoValor;
      // Calcular cantidades requeridas y disponibles
      const cantidadRequerida = item.cantidad; // Paquetes que pide el cliente
      const masterInfo = masterVariantsMap.get(item.productoid);
      const stockActual =
        masterInfo && typeof masterInfo.stock === "number"
          ? masterInfo.stock
          : 0;

      // NUEVO: Reutilizar split ya calculado en itemCalculado
      const split = itemCalculado.split;

      // CRITICAL FIX: Validate and correct split BEFORE extracting to local variables
      // This prevents the bug where stock=0 but split returns cantidadSurtida > 0
      if (stockActual === 0 && split.cantidadSurtida > 0) {
        logger.error('Logic error: stock 0 pero cantidadSurtida > 0', {
          cantidadSurtida: split.cantidadSurtida,
          producto: item.nombreproducto,
          productoId: item.productoid,
          varianteId: item.varianteid,
          correccion: 'Forzando cantidadSurtida a 0',
          requestId: req.requestId,
          tenantId: tenant_id
        });
        split.cantidadSurtida = 0;
        split.cantidadBackorderAjustada = cantidadRequerida;
      }

      // CRITICAL FIX: Extract values AFTER validation to ensure consistency
      const cantidadSurtida = split.cantidadSurtida;
      const cantidadBackorder = split.cantidadBackorderAjustada;
      const piezasSurtidas = cantidadSurtida * tamanoValor;
      const piezasBackorder = cantidadBackorder * tamanoValor;


      const piezasSolicitadasOriginal = tamanoValor * cantidadRequerida;
      const piezasTotalesCobrar = tamanoValor * split.cantidadTotalCobrar;

      // NUEVO: Usar subtotales con descuento prorrateado
      const subtotalConDescuento = itemCalculado.subtotalConDescuento || 0;
      const subtotalSolicitado = parseFloat((precioPorPaquete * cantidadRequerida).toFixed(2));
      const subtotalSurtido = cantidadSurtida > 0
        ? parseFloat((precioPorPaquete * cantidadSurtida).toFixed(2))
        : 0;
      const subtotalBackorder = cantidadBackorder > 0
        ? parseFloat((precioPorPaquete * cantidadBackorder).toFixed(2))
        : 0;
      

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

      // CRITICAL FIX: Prevent duplicate inserts with explicit validation
      // Ensure that if stock is 0, we NEVER insert a surtido row
      const stockFinalValidation = masterInfo ? masterInfo.stock : 0;
      const puedeSerSurtido = stockFinalValidation > 0 && cantidadSurtida > 0 && piezasSurtidas <= stockFinalValidation;
      
      if (!puedeSerSurtido && cantidadSurtida > 0) {
        logger.error('Duplication prevented: stock insuficiente', {
          cantidadSurtida,
          stockDisponible: stockFinalValidation,
          piezasNecesarias: piezasSurtidas,
          accion: 'Saltando INSERT de surtido',
          requestId: req.requestId,
          tenantId: tenant_id
        });
      }

      // Insertar detalle surtido (SOLO si hay stock real disponible)
      // CRÍTICO: Usar precioPorPaquete CON descuento prorrateado
      if (puedeSerSurtido) {
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
            split.cantidadSurtida,
            precioPorPaquete, // Ya incluye descuento prorrateado
            piezasSurtidas,
            parseFloat((precioPorPaquete / tamanoValor).toFixed(2)), // PrecioUnitario con descuento
            tenant_id,
          ]
        );

        const detalleIdSurtido = detalleResult.rows[0].detalleid;

        detallesPedido.push({
          detalleId: detalleIdSurtido,
          varianteId: item.varianteid,
          productoId: item.productoid,
          nombreProducto: item.nombreproducto,
          tamanoId: item.tamanoid,
          cantidad: split.cantidadSurtida,
          esBackorder: false,
          cantidadSurtida: split.cantidadSurtida,
          cantidadBackorder: 0,
          piezasPorPaquete: tamanoValor,
          presentacion: item.tamano_etiqueta || null,
          precioUnitario,
          precioPorPaquete,
          piezasSolicitadas: piezasSolicitadasOriginal,
          piezasSurtidas: split.cantidadSurtida * tamanoValor,
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

        // ============================================
        // HARD-RESERVE: Reservar stock físicamente
        // ============================================
        // El stock NO se descuenta, pero SÍ se RESERVA para evitar race conditions
        // Stock físico permanece igual, pero cantidad_reservada aumenta
        // Fórmula: Stock Disponible = cantidad - cantidad_reservada
        
        const piezasRealmenteSurtidas = split.cantidadSurtida * tamanoValor;
        if (piezasRealmenteSurtidas > 0) {
              
          // Determinar admin_id para la reserva
          const adminIdReserva = req.user?.adminId || null;
          
          if (adminIdReserva) {
            // CASO 1: Cliente con admin asignado - reservar en stock específico
            const reservaResult = await client.query(
              `UPDATE stock_admin
               SET cantidad_reservada = cantidad_reservada + $1,
                   updated_at = NOW()
               WHERE variante_id = $2 
                 AND admin_id = $3 
                 AND tenant_id = $4
                 AND (cantidad - cantidad_reservada) >= $1
               RETURNING stockadminid, cantidad, cantidad_reservada`,
              [piezasRealmenteSurtidas, item.varianteid, adminIdReserva, tenant_id]
            );
            
            if (reservaResult.rows.length === 0) {
              throw new Error(`Stock insuficiente para reservar ${item.nombreproducto}. Otro pedido tomó el inventario.`);
            }
            
            const stockInfo = reservaResult.rows[0];
            
            // Registrar en log de auditoría
            await client.query(
              `INSERT INTO inventario_reservas_log (
                 stockadminid, variante_id, admin_id, pedido_id, detalle_id,
                 cantidad_reservada, accion, cantidad_antes, cantidad_despues,
                 usuario_id, tenant_id
               )
               VALUES ($1, $2, $3, $4, $5, $6, 'RESERVAR', $7, $8, $9, $10)`,
              [
                stockInfo.stockadminid,
                item.varianteid,
                adminIdReserva,
                pedidoId,
                detalleIdSurtido,
                piezasRealmenteSurtidas,
                stockInfo.cantidad_reservada - piezasRealmenteSurtidas,
                stockInfo.cantidad_reservada,
                clienteId,
                tenant_id
              ]
            );
          } else {
            // CASO 2: Cliente sin admin - usar allocation automática
            
            const allocationResult = await SmartStockService.allocateStockAutomatically({
              varianteId: item.varianteid,
              cantidadRequerida: piezasRealmenteSurtidas,
              tenantId: tenant_id,
              estrategia: 'DESC'
            });
            
            if (!allocationResult.success) {
              throw new Error(`Stock insuficiente para ${item.nombreproducto}: ${allocationResult.message}`);
            }
            
            // Aplicar reservas en cada admin asignado
            for (const allocation of allocationResult.allocations) {
              const reservaResult = await client.query(
                `UPDATE stock_admin
                 SET cantidad_reservada = cantidad_reservada + $1,
                     updated_at = NOW()
                 WHERE variante_id = $2 
                   AND admin_id = $3 
                   AND tenant_id = $4
                 RETURNING stockadminid, cantidad_reservada`,
                [allocation.cantidad, item.varianteid, allocation.adminId, tenant_id]
              );
              
              if (reservaResult.rows.length > 0) {
                const stockInfo = reservaResult.rows[0];
                
                // Registrar en log
                await client.query(
                  `INSERT INTO inventario_reservas_log (
                     stockadminid, variante_id, admin_id, pedido_id, detalle_id,
                     cantidad_reservada, accion, cantidad_antes, cantidad_despues,
                     usuario_id, tenant_id
                   )
                   VALUES ($1, $2, $3, $4, $5, $6, 'RESERVAR', $7, $8, $9, $10)`,
                  [
                    stockInfo.stockadminid,
                    item.varianteid,
                    allocation.adminId,
                    pedidoId,
                    detalleIdSurtido,
                    allocation.cantidad,
                    stockInfo.cantidad_reservada - allocation.cantidad,
                    stockInfo.cantidad_reservada,
                    clienteId,
                    tenant_id
                  ]
                );
              }
            }
          }
        }
      }

      // CRITICAL FIX: Insertar detalle backorder (SOLO si hay cantidad pendiente)
      // Asegurar que no duplicamos si ya se insertó como surtido
      // CRÍTICO: Usar precioPorPaquete CON descuento prorrateado
      // CRÍTICO: Usar cantidadRealBackorder (lo que pidió el cliente), NO split.cantidadBackorderAjustada (que es para OC de proveedor)
      const cantidadRealBackorder = cantidadRequerida - cantidadSurtida;
      const debeInsertarBackorder = cantidadRealBackorder > 0 && cantidadBackorder > 0;
      
      if (debeInsertarBackorder) {
        const piezasBackorderReal = cantidadRealBackorder * tamanoValor;
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
            cantidadRealBackorder, // FIX: Usar cantidad real del cliente, NO la ajustada para proveedor
            precioPorPaquete, // Ya incluye descuento prorrateado
            piezasBackorderReal, // FIX: Calcular piezas basado en cantidad real
            parseFloat((precioPorPaquete / tamanoValor).toFixed(2)), // PrecioUnitario con descuento
            tenant_id,
          ]
        );

        detallesPedido.push({
          detalleId: detalleBackorderResult.rows[0].detalleid,
          varianteId: item.varianteid,
          productoId: item.productoid,
          nombreProducto: item.nombreproducto,
          tamanoId: item.tamanoid,
          cantidad: cantidadRealBackorder, // FIX: Usar cantidad real del cliente
          esBackorder: true,
          cantidadSurtida: 0,
          cantidadBackorder: cantidadRealBackorder, // FIX: Usar cantidad real del cliente
          piezasPorPaquete: tamanoValor,
          presentacion: item.tamano_etiqueta || null,
          precioUnitario,
          precioPorPaquete,
          piezasSolicitadas: piezasSolicitadasOriginal,
          piezasSurtidas: 0,
          piezasBackorder: piezasBackorderReal, // FIX: Usar piezas reales calculadas
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
        tenant_id, // tenant_id - Aislamiento multi-tenant
        null // admin_creador_id (NULL para backorders de clientes - super admin los asignará)
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

    // NUEVO: Calcular estado correcto basado en los detalles del pedido
    // El estado será: Bajo pedido, Combinado, Completo, Surtido parcial, o Surtido completo
    const detallesParaCalculo = detallesPedido.map(d => ({
      cantidadpaquetes: d.cantidad,        // Cantidad total solicitada
      cantidadsurtida: d.cantidadSurtida,  // Cantidad ya surtida (0 para nuevos pedidos)
      esbackorder: d.esBackorder           // Si es backorder o tiene stock
    }));

    const estadoCalculado = calcularEstadoPedido(detallesParaCalculo);
    const estadoNormalizado = normalizarEstado(estadoCalculado);

    if (estadoNormalizado !== pedidoEstatus) {
      const updatePedidoResult = await client.query(
        "UPDATE Pedidos SET Estatus = $1 WHERE PedidoID = $2 RETURNING Estatus",
        [estadoNormalizado, pedidoId]
      );
      if (updatePedidoResult.rows.length > 0) {
        pedido.estatus = updatePedidoResult.rows[0].estatus;
      } else {
        pedido.estatus = estadoNormalizado;
      }
    } else {
      pedido.estatus = estadoNormalizado;
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
      const costoEnvio = 0; // El sistema no cobra envío por ahora
      const baseComision = montoTotalFinal - costoEnvio;
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
        logger.error('No se pudo enviar correo de recibo de pedido', {
          error: err.message,
          pedidoId: pedido.pedidoid
        });
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
        logger.error('No se pudo enviar alerta de nuevo pedido al admin', {
          error: err.message,
          pedidoId: pedido.pedidoid
        });
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
            logger.error('No se pudo enviar alerta de backorder al admin', {
              error: err.message,
              pedidoId: pedido.pedidoid
            });
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
        logger.error('No se pudo enviar notificación de nuevo pedido al agente', {
          error: err.message,
          pedidoId: pedido.pedidoid,
          agenteId: agente.agenteid
        });
      });
    }

    for (const varianteId of variantesAfectadas) {
      checkStockBajo(varianteId).catch((err) => {
        logger.error('Error verificando stock bajo para variante', {
          error: err.message,
          varianteId,
          pedidoId: pedido.pedidoid
        });
      });
    }
  } catch (error) {
    // Revertir transacción en caso de error
    if (transactionStarted) {
      await client.query("ROLLBACK");
      transactionStarted = false;
    }
    logger.error('Error al crear pedido', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id,
      clienteId: req.user?.id
    });
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
        a.CodigoAgente,
        ROW_NUMBER() OVER (ORDER BY p.FechaPedido ASC, p.PedidoID ASC) AS NumeroPedidoCliente
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
        // 🚨 CRITICAL FIX: Added DISTINCT ON to prevent duplicate rows from cat_tamanopaquetes JOIN
        const detallesQuery = `
        SELECT DISTINCT ON (dp.detalleid)
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
          pv.color_nombre,
          pv.color_hex,
          pr.nombreproducto,
          row_to_json(ct) AS tamano_info,
          COALESCE(imagen_variante.url_imagen, imagen_producto.url_imagen) AS imagenurl
        FROM detallesdelpedido dp
        LEFT JOIN producto_variantes pv ON dp.varianteid = pv.varianteid
        LEFT JOIN productos pr ON pv.productoid = pr.productoid
        LEFT JOIN cat_tamanopaquetes ct ON dp.tamanoid = ct.tamanoid AND ct.tenant_id = $2
        LEFT JOIN LATERAL (
          SELECT pvi.url_imagen
          FROM producto_variante_imagenes pvi
          WHERE pvi.varianteid = pv.varianteid
          ORDER BY pvi.orden ASC NULLS LAST, pvi.imagenid ASC
          LIMIT 1
        ) imagen_variante ON TRUE
        LEFT JOIN LATERAL (
          SELECT pi.url_imagen
          FROM producto_imagenes pi
          WHERE pi.productoid = pv.productoid
          ORDER BY pi.orden ASC NULLS LAST, pi.imagenid ASC
          LIMIT 1
        ) imagen_producto ON TRUE
        WHERE dp.pedidoid = $1
          AND (pr.tenant_id = $2 OR pr.tenant_id IS NULL)
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
            colorNombre: item.color_nombre || null,
            colorHex: item.color_hex || null,
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
          numeroPedidoCliente: parseInt(pedido.numeropedidocliente, 10),
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
    logger.error('Error al obtener pedidos', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id,
      clienteId: req.user?.id
    });
    res.status(500).json({
      success: false,
      message: "Error al obtener los pedidos"
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

    // 🚨 CRITICAL FIX: Added DISTINCT ON to prevent duplicate rows from cat_tamanopaquetes JOIN
    const detallesQuery = `
      SELECT DISTINCT ON (dp.detalleid)
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
        pv.color_nombre,
        pv.color_hex,
        pv.stock,
        prod.nombreproducto,
        row_to_json(t) AS tamano_info,
        COALESCE(imagen_variante.url_imagen, imagen_producto.url_imagen) AS url_imagen
      FROM detallesdelpedido dp
      INNER JOIN producto_variantes pv ON pv.varianteid = dp.varianteid
      INNER JOIN productos prod ON prod.productoid = pv.productoid
      LEFT JOIN cat_tamanopaquetes t ON t.tamanoid = dp.tamanoid AND t.tenant_id = $2
      LEFT JOIN LATERAL (
        SELECT pvi.url_imagen
        FROM producto_variante_imagenes pvi
        WHERE pvi.varianteid = pv.varianteid
        ORDER BY pvi.orden ASC NULLS LAST, pvi.imagenid ASC
        LIMIT 1
      ) imagen_variante ON TRUE
      LEFT JOIN LATERAL (
        SELECT pi.url_imagen
        FROM producto_imagenes pi
        WHERE pi.productoid = pv.productoid
        ORDER BY pi.orden ASC NULLS LAST, pi.imagenid ASC
        LIMIT 1
      ) imagen_producto ON TRUE
      WHERE dp.pedidoid = $1
        AND prod.tenant_id = $2
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
        colorNombre: item.color_nombre || null,
        colorHex: item.color_hex || null,
        stock: item.stock !== null ? parseInt(item.stock, 10) : 0,
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
    logger.error('Error al obtener pedido', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id,
      pedidoId: req.params.id
    });
    res.status(500).json({
      success: false,
      message: "Error al obtener el pedido"
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
    logger.error('Error al obtener datos de pago', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id,
      pedidoId: req.params.id
    });
    res.status(500).json({
      success: false,
      message: "Error al procesar la solicitud de pago"
    });
  }
};

/**
 * PUT /api/pedidos/:id/cancelar
 * Cancela un pedido del cliente con manejo de backorders en cascada
 * Solo se puede cancelar si el pedido no está confirmado, completado, cancelado o entregado
 */
const cancelarPedido = async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    const { id } = req.params;
    const { tenant_id } = req.tenant;
    const clienteId = req.user.id;

    await client.query('BEGIN');

    // Verificar que el pedido existe y pertenece al cliente
    const pedidoQuery = await client.query(
      `SELECT p.pedidoid, p.clienteid, p.estatus, p.es_credito, p.montototal, p.agenteid,
              c.nombre as cliente_nombre, c.email as cliente_email
       FROM pedidos p
       JOIN clientes c ON p.clienteid = c.clienteid
       WHERE p.pedidoid = $1 AND p.tenant_id = $2`,
      [id, tenant_id]
    );

    if (pedidoQuery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        success: false,
        error: 'Pedido no encontrado' 
      });
    }

    const pedido = pedidoQuery.rows[0];

    // Verificar que el pedido pertenece al cliente autenticado
    if (pedido.clienteid !== clienteId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ 
        success: false,
        error: 'No tienes permiso para cancelar este pedido' 
      });
    }

    // Verificar que el pedido puede ser cancelado
    const estatusNoCancelables = ['Confirmado', 'Completado', 'Cancelado', 'Entregado'];
    if (estatusNoCancelables.includes(pedido.estatus)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false,
        error: `No se puede cancelar un pedido con estatus "${pedido.estatus}"` 
      });
    }

    // Obtener detalles del pedido con información de backorders
    const detallesQuery = await client.query(
      `SELECT 
         dp.detalleid,
         dp.varianteid, 
         dp.piezastotales,
         dp.esbackorder,
         dp.cantidadbackorder,
         dp.cantidadsurtida,
         dp.cantidadpaquetes,
         pv.sku,
         pv.dimensiones,
         p.nombreproducto as producto_nombre
       FROM detallesdelpedido dp
       JOIN producto_variantes pv ON dp.varianteid = pv.varianteid
       JOIN productos p ON pv.productoid = p.productoid
       WHERE dp.pedidoid = $1 AND dp.tenant_id = $2`,
      [id, tenant_id]
    );

    // Contadores para el reporte
    let itemsEnStock = 0;
    let itemsEnBackorder = 0;
    let piezasRestauradas = 0;
    let backordersCancelados = 0;


    // ============================================
    // HARD-RESERVE: Liberar reservas al cancelar
    // ============================================
    // Obtener detalles del pedido para liberar reservas
    const detallesReservas = await client.query(
      `SELECT d.detalleid, d.varianteid, d.piezastotales, d.esbackorder,
              d.cantidad_surtida_remisiones
       FROM detallesdelpedido d
       WHERE d.pedidoid = $1 AND d.tenant_id = $2`,
      [id, tenant_id]
    );

    for (const detalle of detallesReservas.rows) {
      // Solo liberar si NO es backorder y NO ha sido surtido en remisiones
      if (!detalle.esbackorder && (detalle.cantidad_surtida_remisiones || 0) === 0) {
        const piezasALiberar = parseInt(detalle.piezastotales, 10);
        
        
        // Liberar de stock_admin
        const liberarResult = await client.query(
          `UPDATE stock_admin
           SET cantidad_reservada = GREATEST(0, cantidad_reservada - $1),
               updated_at = NOW()
           WHERE variante_id = $2 
             AND tenant_id = $3
             AND cantidad_reservada > 0
           RETURNING stockadminid, admin_id, cantidad_reservada`,
          [piezasALiberar, detalle.varianteid, tenant_id]
        );
        
        // Registrar en log de auditoría
        for (const row of liberarResult.rows) {
          await client.query(
            `INSERT INTO inventario_reservas_log (
               stockadminid, variante_id, admin_id, pedido_id, detalle_id,
               cantidad_reservada, accion, cantidad_antes, cantidad_despues,
               usuario_id, tenant_id
             )
             VALUES ($1, $2, $3, $4, $5, $6, 'CANCELAR', $7, $8, $9, $10)`,
            [
              row.stockadminid,
              detalle.varianteid,
              row.admin_id,
              id,
              detalle.detalleid,
              piezasALiberar,
              row.cantidad_reservada + piezasALiberar,
              row.cantidad_reservada,
              req.user?.id || null,
              tenant_id
            ]
          );
        }
        
      }
    }

    // Procesar cada ítem del pedido
    for (const detalle of detallesQuery.rows) {
      const { varianteid, piezastotales, esbackorder, cantidadbackorder, cantidadsurtida } = detalle;
      
      // Verificar que la variante existe antes de actualizar
      const varianteCheck = await client.query(
        `SELECT varianteid, stock FROM producto_variantes 
         WHERE varianteid = $1 AND tenant_id = $2
         FOR UPDATE`,
        [varianteid, tenant_id]
      );

      if (varianteCheck.rows.length === 0) {
        console.warn(`[Cancelar Pedido] Variante ${varianteid} no encontrada - omitiendo`);
        continue;
      }

      const stockActual = varianteCheck.rows[0].stock;

      if (esbackorder) {
        // Este ítem estaba en backorder
        itemsEnBackorder++;
        
        // Calcular cuántas piezas estaban realmente en backorder (no surtidas)
        const piezasBackorderPendientes = piezastotales - (cantidadsurtida || 0);
        
        if (piezasBackorderPendientes > 0) {
          backordersCancelados++;
        }

        // Si había piezas ya surtidas, restaurarlas al stock
        if (cantidadsurtida > 0) {
          await client.query(
            `UPDATE producto_variantes
             SET stock = stock + $1
             WHERE varianteid = $2 AND tenant_id = $3`,
            [cantidadsurtida, varianteid, tenant_id]
          );
          piezasRestauradas += cantidadsurtida;
        }

        // Actualizar el detalle para marcar backorder como cancelado
        await client.query(
          `UPDATE detallesdelpedido
           SET cantidadbackorder = 0,
               esbackorder = false
           WHERE detalleid = $1 AND tenant_id = $2`,
          [detalle.detalleid, tenant_id]
        );

      } else {
        // Este ítem estaba en stock normal
        itemsEnStock++;
        
        // Restaurar todas las piezas al stock
        await client.query(
          `UPDATE producto_variantes
           SET stock = stock + $1
           WHERE varianteid = $2 AND tenant_id = $3`,
          [piezastotales, varianteid, tenant_id]
        );
        
        piezasRestauradas += piezastotales;
      }
    }

    // Actualizar estatus del pedido a Cancelado
    await client.query(
      `UPDATE pedidos
       SET estatus = 'Cancelado',
           completamente_surtido = false,
           monto_backorder = 0
       WHERE pedidoid = $1 AND tenant_id = $2`,
      [id, tenant_id]
    );

    // CASCADA: Cancelar Órdenes de Compra asociadas a este pedido
    let ordenesCompraCanceladas = 0;
    try {
      // Buscar todas las OCs generadas por este pedido que estén en estatus PENDIENTE
      const ocQuery = await client.query(
        `SELECT ordencompraid, estatus, origenoc
         FROM ordenesdecompra
         WHERE pedido_origen_id = $1 
           AND tenant_id = $2
           AND estatus = 'Pendiente'
         FOR UPDATE`,
        [id, tenant_id]
      );

      if (ocQuery.rows.length > 0) {

        // Cancelar cada OC encontrada
        for (const oc of ocQuery.rows) {
          await client.query(
            `UPDATE ordenesdecompra
             SET estatus = 'Cancelada',
                 fechaentregaesperada = NULL
             WHERE ordencompraid = $1 AND tenant_id = $2`,
            [oc.ordencompraid, tenant_id]
          );

          ordenesCompraCanceladas++;
        }
      } else {
      }
    } catch (ocError) {
      logger.error('Error al cancelar OCs en cascada', {
        error: ocError.message,
        pedidoId: req.params.id,
        requestId: req.requestId
      });
      // No lanzar el error para no interrumpir la cancelación del pedido
      // El pedido se cancela de todas formas, pero se registra el error
    }

    // Si el pedido era a crédito y ya tenía cargo aplicado, revertirlo
    let montoRevertido = 0;
    if (pedido.es_credito) {
      // Buscar remisiones asociadas al pedido
      const remisionesQuery = await client.query(
        `SELECT remision_id
         FROM remisiones
         WHERE pedido_id = $1 AND tenant_id = $2`,
        [id, tenant_id]
      );

      if (remisionesQuery.rows.length > 0) {
        const remisionIds = remisionesQuery.rows.map(r => r.remision_id);

        // Verificar si hay CXC asociados a las remisiones
        const cxcQuery = await client.query(
          `SELECT SUM(monto) as total_cargado
           FROM cuentas_por_cobrar
           WHERE remision_id = ANY($1) AND tenant_id = $2`,
          [remisionIds, tenant_id]
        );

        const totalCargado = parseFloat(cxcQuery.rows[0]?.total_cargado || 0);

        if (totalCargado > 0) {
          montoRevertido = totalCargado;
          
          // Obtener información de crédito del cliente
          const creditoQuery = await client.query(
            `SELECT credito_id, saldo_deudor
             FROM cliente_creditos
             WHERE cliente_id = $1
             FOR UPDATE`,
            [pedido.clienteid]
          );

          if (creditoQuery.rows.length > 0) {
            const creditoInfo = creditoQuery.rows[0];
            const saldoActual = parseFloat(creditoInfo.saldo_deudor || 0);
            const nuevoSaldo = parseFloat((saldoActual - totalCargado).toFixed(2));

            // Actualizar saldo deudor (restar el cargo)
            await client.query(
              `UPDATE cliente_creditos
               SET saldo_deudor = $1, ultima_actualizacion = NOW()
               WHERE credito_id = $2`,
              [nuevoSaldo, creditoInfo.credito_id]
            );

            // Registrar movimiento de crédito (ABONO por cancelación)
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
               VALUES ($1, 'ABONO', $2, $3, $4, $5, $6)`,
              [
                creditoInfo.credito_id,
                totalCargado.toFixed(2),
                `PED-${id}`,
                `Abono por cancelación de pedido #${id}`,
                nuevoSaldo.toFixed(2),
                tenant_id
              ]
            );
          }

          // Marcar los CXC como cancelados
          await client.query(
            `UPDATE cuentas_por_cobrar
             SET descripcion = descripcion || ' (CANCELADO)'
             WHERE remision_id = ANY($1) AND tenant_id = $2`,
            [remisionIds, tenant_id]
          );
        }
      }
    }

    // Crear notificación para el administrador
    const notificacionTitulo = `Pedido #${id} cancelado por cliente`;
    const notificacionMensaje = `El cliente ${pedido.cliente_nombre} (${pedido.cliente_email}) ha cancelado el pedido #${id}.\n\n` +
      `📊 Resumen de cancelación:\n` +
      `• Ítems en stock: ${itemsEnStock}\n` +
      `• Ítems en backorder: ${itemsEnBackorder}\n` +
      `• Backorders cancelados: ${backordersCancelados}\n` +
      `• Piezas restauradas al inventario: ${piezasRestauradas}\n` +
      (ordenesCompraCanceladas > 0 ? `• Órdenes de Compra canceladas: ${ordenesCompraCanceladas}\n` : '') +
      (montoRevertido > 0 ? `• Crédito revertido: $${montoRevertido.toFixed(2)}\n` : '') +
      `\nEstatus anterior: ${pedido.estatus}`;

    // Obtener todos los administradores del tenant para notificarles
    const adminsQuery = await client.query(
      `SELECT adminid FROM administradores WHERE tenant_id = $1`,
      [tenant_id]
    );

    // Crear notificación para cada administrador
    for (const admin of adminsQuery.rows) {
      await client.query(
        `INSERT INTO notificaciones (
           administrador_id,
           tipo,
           titulo,
           mensaje,
           prioridad,
           metadata,
           tenant_id
         )
         VALUES ($1, 'pedido', $2, $3, 'alta', $4, $5)`,
        [
          admin.adminid,
          notificacionTitulo,
          notificacionMensaje,
          JSON.stringify({
            pedido_id: id,
            cliente_id: pedido.clienteid,
            monto_total: pedido.montototal,
            items_stock: itemsEnStock,
            items_backorder: itemsEnBackorder,
            backorders_cancelados: backordersCancelados,
            piezas_restauradas: piezasRestauradas,
            monto_revertido: montoRevertido,
            accion: 'cancelacion_pedido'
          }),
          tenant_id
        ]
      );
    }

    // 🚀 FIFO HOOK: Recalcular pedidos posteriores que ahora podrían tener stock disponible
    try {
      const FIFOAllocationService = require('../services/FIFOAllocationService');
      const recalcResult = await FIFOAllocationService.onPedidoCancelado({
        pedidoId: id,
        tenantId: tenant_id,
        client: client
      });
      
      if (recalcResult.success) {
      }
    } catch (fifoError) {
      console.warn('[Cancelar Pedido] ⚠️ Error en recálculo FIFO (no crítico):', fifoError.message);
      // No interrumpir la cancelación si falla el recálculo
    }

    await client.query('COMMIT');


    res.json({
      success: true,
      message: 'Pedido, backorders y órdenes de compra asociadas cancelados correctamente',
      detalles: {
        pedido_id: id,
        items_en_stock: itemsEnStock,
        items_en_backorder: itemsEnBackorder,
        backorders_cancelados: backordersCancelados,
        piezas_restauradas: piezasRestauradas,
        ordenes_compra_canceladas: ordenesCompraCanceladas,
        credito_revertido: montoRevertido > 0 ? `$${montoRevertido.toFixed(2)}` : null
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error crítico al cancelar pedido', {
      error: error.message,
      pedidoId: req.params.id,
      clienteId: req.user?.id,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    
    res.status(500).json({ 
      success: false,
      message: 'Error al cancelar pedido'
    });
  } finally {
    client.release();
  }
};

/**
 * Simulate the impact of marking an order as priority WITHOUT making changes
 * Returns which orders would be affected (moved to backorder)
 */
const simulatePriorityImpact = async (req, res) => {
  try {
    const { id } = req.params;
    const { tenant_id } = req.tenant;
    const pedidoId = parseInt(id, 10);

    if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
      return res.status(400).json({ message: "ID de pedido inválido" });
    }


    const result = await SmartStockService.simulatePriorityImpact(pedidoId, tenant_id);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: result.message || "Error al simular impacto",
        impactedOrders: []
      });
    }

    res.json({
      success: true,
      wouldBeVIP: result.wouldBeVIP,
      noImpact: result.noImpact,
      impactedOrders: result.impactedOrders,
      message: result.message
    });

  } catch (error) {
    logger.error('Error al simular impacto de prioridad', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error al simular el impacto de prioridad",
      impactedOrders: []
    });
  }
};

/**
 * Toggle priority flag for a specific order
 * When priority is enabled, the system will reallocate stock to prioritize this order
 */
const togglePrioridad = async (req, res) => {
  const client = await db.getClient();
  try {
    const { id } = req.params;
    const { tenant_id } = req.tenant;
    const pedidoId = parseInt(id, 10);

    if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
      return res.status(400).json({ message: "ID de pedido inválido" });
    }

    await client.query("BEGIN");

    // Get current order state
    const pedidoResult = await client.query(
      `SELECT pedidoid, es_prioritario, estatus, tenant_id
       FROM pedidos
       WHERE pedidoid = $1 AND tenant_id = $2`,
      [pedidoId, tenant_id]
    );

    if (pedidoResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Pedido no encontrado" });
    }

    const pedido = pedidoResult.rows[0];
    const nuevoEstado = !pedido.es_prioritario;

    // Only allow priority toggle for pending/approved/partially fulfilled orders
    const estatusPermitidos = ["Pendiente", "Aprobado", "Parcialmente Surtido"];
    if (!estatusPermitidos.includes(pedido.estatus)) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: `No se puede cambiar la prioridad de pedidos con estatus: ${pedido.estatus}`,
      });
    }

    // Toggle priority flag
    await client.query(
      `UPDATE pedidos 
       SET es_prioritario = $1
       WHERE pedidoid = $2 AND tenant_id = $3`,
      [nuevoEstado, pedidoId, tenant_id]
    );


    // Get all variants in this order for reallocation
    const variantesResult = await client.query(
      `SELECT DISTINCT pv.varianteid
       FROM detallesdelpedido ddp
       INNER JOIN producto_variantes pv ON ddp.varianteid = pv.varianteid
       WHERE ddp.pedidoid = $1`,
      [pedidoId]
    );

    const varianteIds = variantesResult.rows.map((r) => r.varianteid);

    await client.query("COMMIT");

    // Trigger reallocation for affected variants (async, don't wait)
    if (nuevoEstado && varianteIds.length > 0) {
      
      // Run reallocation asynchronously
      setImmediate(async () => {
        try {
          for (const varianteId of varianteIds) {
            await SmartStockService.reallocateStockForVariant(varianteId, tenant_id);
          }
        } catch (error) {
          logger.error('Error en reallocación de stock', {
            error: error.message,
            pedidoId,
            varianteId
          });
        }
      });
    }

    res.json({
      success: true,
      message: nuevoEstado
        ? "Pedido marcado como prioritario. El sistema reasignará el stock disponible."
        : "Prioridad removida. El pedido volverá al orden FIFO normal.",
      es_prioritario: nuevoEstado,
      pedidoid: pedidoId,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error('Error al cambiar prioridad', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id,
      pedidoId: req.params.id
    });
    res.status(500).json({
      success: false,
      message: "Error al cambiar la prioridad del pedido"
    });
  } finally {
    client.release();
  }
};

module.exports = {
  crearPedido,
  obtenerPedidos,
  obtenerPedidoPorId,
  obtenerDatosPago,
  cancelarPedido,
  simulatePriorityImpact,
  togglePrioridad,
};
