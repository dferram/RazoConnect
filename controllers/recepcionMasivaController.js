/**
 * RECEPCIÓN MASIVA CONTROLLER
 * 
 * Controlador especializado para recepción masiva de órdenes de compra.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/recepcionMasivaController
 * @author RazoConnect Team
 * @date 2026-02-27
 */

const db = require('../db');

const recepcionMasivaOrdenCompra = async (req, res) => {
  const client = await db.pool.connect();

  const assignCxpEtiqueta = async (cxpId, nombreLike) => {
    if (!Number.isInteger(cxpId) || cxpId <= 0) return;
    const query = `
      SELECT etiqueta_id
      FROM cat_cxp_etiquetas
      WHERE activo = true AND nombre ILIKE $1
      ORDER BY etiqueta_id ASC
      LIMIT 1
    `;

    const etiquetaRes = await client.query(query, [nombreLike]);
    if (!etiquetaRes.rows.length) return;

    const etiquetaId = Number.parseInt(etiquetaRes.rows[0].etiqueta_id, 10);
    if (!Number.isInteger(etiquetaId) || etiquetaId <= 0) return;

    await client.query(
      `INSERT INTO cxp_etiquetas_asignadas (cxp_id, etiqueta_id)
       VALUES ($1, $2)
       ON CONFLICT (cxp_id, etiqueta_id) DO NOTHING`,
      [cxpId, etiquetaId]
    );
  };

  try {
    const ordenCompraId = Number.parseInt(req.body?.ordenCompraId, 10);
    const referenciaProveedor = (req.body?.referenciaProveedor || "").toString().trim();
    const itemsRaw = req.body?.items;
    const usuarioRecibeId = Number.parseInt(req?.user?.id ?? req?.user?.userId, 10);

    if (!Number.isInteger(ordenCompraId) || ordenCompraId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ordenCompraId inválido",
      });
    }

    if (!referenciaProveedor) {
      return res.status(400).json({
        success: false,
        message: "referenciaProveedor es requerida",
      });
    }

    let items = [];
    try {
      items = typeof itemsRaw === "string" ? JSON.parse(itemsRaw) : itemsRaw;
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: "items inválido (JSON)",
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "items debe ser un arreglo con al menos 1 elemento",
      });
    }

    await client.query("BEGIN");

    const { tenant_id } = req.tenant;
    const userRole = req.user.rol;
    const userId = req.user.id;

    const ordenLock = await client.query(
      `SELECT oc.ordencompraid, oc.estatus, oc.proveedorid, oc.admin_creador_id, COALESCE(p.diascredito, 0) AS diascredito
       FROM ordenesdecompra oc
       INNER JOIN proveedores p ON p.proveedorid = oc.proveedorid
       WHERE oc.ordencompraid = $1
       FOR UPDATE`,
      [ordenCompraId]
    );

    if (!ordenLock.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Orden de compra no encontrada",
      });
    }

    const estatusActual = (ordenLock.rows[0].estatus || "").toString().trim();
    if (!["Pendiente", "Parcial"].includes(estatusActual)) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: `La orden no se puede recepcionar en estatus '${estatusActual || "(vacío)"}'`,
      });
    }

    const proveedorId = Number.parseInt(ordenLock.rows[0].proveedorid, 10);
    const diasCredito = Number.parseInt(ordenLock.rows[0].diascredito, 10);
    const diasCreditoFinal = Number.isInteger(diasCredito) && diasCredito > 0 ? diasCredito : 0;
    const vencResult = await client.query(
      "SELECT (CURRENT_DATE + ($1::int * INTERVAL '1 day'))::date AS fecha_vencimiento",
      [diasCreditoFinal]
    );
    const fechaVencimiento = vencResult.rows[0]?.fecha_vencimiento || null;

    const comprobanteUrl = req.file?.path ? req.file.path : null;

    const reglasEmpaqueRes = await client.query(
      `SELECT reglaid, tipoproductoid, cantidadempaque
       FROM proveedor_reglas_empaque
       WHERE proveedorid = $1`,
      [proveedorId]
    );
    const reglasEmpaqueByTipo = new Map();
    const reglasEmpaqueById = new Map();
    for (const r of reglasEmpaqueRes.rows || []) {
      const tipoProductoId = Number.parseInt(r.tipoproductoid, 10);
      const reglaid = Number.parseInt(r.reglaid, 10);
      const cantidadEmpaque = Number.parseInt(r.cantidadempaque, 10);
      if (!Number.isInteger(tipoProductoId) || tipoProductoId <= 0) continue;
      if (!Number.isInteger(reglaid) || reglaid <= 0) continue;
      if (!Number.isInteger(cantidadEmpaque) || cantidadEmpaque <= 0) continue;
      if (!reglasEmpaqueByTipo.has(tipoProductoId)) reglasEmpaqueByTipo.set(tipoProductoId, []);
      reglasEmpaqueByTipo.get(tipoProductoId).push({ reglaid, cantidadEmpaque });
      reglasEmpaqueById.set(reglaid, { tipoProductoId, cantidadEmpaque });
    }

    let montoTotalCentavos = 0;
    const productosActualizados = [];

    for (const raw of items) {
      const detalleId = Number.parseInt(raw?.detalleId, 10);
      const varianteIdReq = raw?.varianteId;
      const cantidadPaquetesRecibidos = Number.parseInt(
        raw?.cantidadPaquetes ?? raw?.cantidadpaquetes ?? raw?.paquetes ?? raw?.cantidadPaquete,
        10
      );
      const cantidadPiezasRecibidas = Number.parseInt(
        raw?.cantidadPiezas ?? raw?.cantidadpiezas ?? raw?.piezas ?? raw?.cantidad,
        10
      );
      const hasPaquetes = Number.isInteger(cantidadPaquetesRecibidos) && cantidadPaquetesRecibidos > 0;
      const hasPiezas = Number.isInteger(cantidadPiezasRecibidas) && cantidadPiezasRecibidas > 0;

      if (!Number.isInteger(detalleId) || detalleId <= 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "detalleId inválido en items",
        });
      }

      if (!hasPaquetes && !hasPiezas) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "cantidad inválida en items",
        });
      }

      const detalleResult = await client.query(
        `SELECT
           doc.detalleoc_id,
           doc.ordencompraid,
           doc.varianteid,
           doc.cantidadsolicitada,
           doc.piezasrecibidas,
           doc.piezasporpaquete,
           doc.costounitario,
           pv.sku,
           pv.stock AS stockvariante,
           pv.costounitario AS variante_costounitario,
           pv.piezasporpaquete AS variante_piezasporpaquete,
           pv.tipoproductoid,
           pr.nombreproducto
         FROM detallesordencompra doc
         INNER JOIN producto_variantes pv ON pv.varianteid = doc.varianteid
         INNER JOIN productos pr ON pr.productoid = pv.productoid
         WHERE doc.detalleoc_id = $1 AND doc.ordencompraid = $2
         FOR UPDATE`,
        [detalleId, ordenCompraId]
      );

      if (!detalleResult.rows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          message: `Detalle ${detalleId} no encontrado en esta orden`,
        });
      }

      const detalle = detalleResult.rows[0];
      const varianteId = Number.parseInt(detalle.varianteid, 10);
      if (
        varianteIdReq !== undefined &&
        varianteIdReq !== null &&
        varianteIdReq !== "" &&
        Number.isInteger(Number.parseInt(varianteIdReq, 10)) &&
        Number.parseInt(varianteIdReq, 10) !== varianteId
      ) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: `La variante no corresponde al detalle ${detalleId}`,
        });
      }

      const solicitado = Number.parseInt(detalle.cantidadsolicitada, 10) || 0;

      const piezasPorPaqueteSafe = (() => {
        const fromPayload = Number.parseInt(raw?.piezasPorPaquete ?? raw?.piezasporpaquete, 10);
        if (Number.isInteger(fromPayload) && fromPayload > 0) return fromPayload;

        const parsed = Number.parseInt(detalle.piezasporpaquete, 10);
        if (Number.isInteger(parsed) && parsed > 0) return parsed;
        const alt = Number.parseInt(detalle.variante_piezasporpaquete, 10);
        if (Number.isInteger(alt) && alt > 0) return alt;
        return 1;
      })();

      const piezasRecibidasAhora = hasPaquetes
        ? cantidadPaquetesRecibidos * piezasPorPaqueteSafe
        : cantidadPiezasRecibidas;

      if (!Number.isInteger(piezasRecibidasAhora) || piezasRecibidasAhora <= 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "Cantidad recibida inválida (piezas calculadas)",
        });
      }

      const paquetesRecibidosAhora = hasPaquetes
        ? cantidadPaquetesRecibidos
        : Math.floor(piezasRecibidasAhora / Math.max(piezasPorPaqueteSafe, 1));

      const solicitadoPzas = solicitado * piezasPorPaqueteSafe;
      const recibidoPzsActual = Number.parseInt(detalle.piezasrecibidas, 10) || 0;
      const nuevoRecibidoPzas = recibidoPzsActual + piezasRecibidasAhora;
      if (solicitadoPzas > 0 && nuevoRecibidoPzas > solicitadoPzas) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message:
            "La cantidad recibida excede lo solicitado para este renglón. Ajusta la cantidad o revisa el empaque seleccionado.",
        });
      }

      const montoTotalRenglon = Number.parseFloat(
        raw?.montoTotalRenglon ??
          raw?.monto_total_renglon ??
          raw?.montoTotal ??
          raw?.monto_total ??
          raw?.costoTotal ??
          raw?.costo_total ??
          raw?.subtotal,
        10
      );
      const montoTotalRenglonCentavos =
        Number.isFinite(montoTotalRenglon) && montoTotalRenglon > 0
          ? Math.round(montoTotalRenglon * 100)
          : null;

      const costoPaquete = Number.parseFloat(detalle.costounitario ?? 0) || 0;
      const costoVariante = Number.parseFloat(detalle.variante_costounitario ?? 0) || 0;
      const costoUnitarioRaw = Number.parseFloat(
        raw?.costoUnitario ?? raw?.costounitario ?? raw?.costo_unitario ?? raw?.precioUnitario
      );

      const costoUnitario = (() => {
        if (montoTotalRenglonCentavos !== null) {
          const unit = (montoTotalRenglonCentavos / Math.max(piezasRecibidasAhora, 1)) / 100;
          const safe = Number.parseFloat(unit.toFixed(2));
          return Number.isFinite(safe) && safe >= 0 ? safe : 0;
        }
        if (Number.isFinite(costoUnitarioRaw) && costoUnitarioRaw >= 0) return costoUnitarioRaw;
        if (Number.isFinite(costoPaquete) && costoPaquete > 0) return costoPaquete;
        if (Number.isFinite(costoVariante) && costoVariante > 0) return costoVariante;
        return 0;
      })();

      const costoUnitarioCentavos = Math.round((Number.parseFloat(costoUnitario) || 0) * 100);
      const subtotalCentavos =
        montoTotalRenglonCentavos !== null
          ? montoTotalRenglonCentavos
          : Math.round((piezasRecibidasAhora || 0) * costoUnitarioCentavos);
      montoTotalCentavos += subtotalCentavos;

      await client.query(
        `UPDATE detallesordencompra
         SET piezasrecibidas = COALESCE(piezasrecibidas, 0) + $1,
             piezasporpaquete = $4,
             costounitario = $5,
             cantidadrecibida = FLOOR(
               (COALESCE(piezasrecibidas, 0) + $1)
               / COALESCE(NULLIF($4, 0), 1)
             )::int
         WHERE detalleoc_id = $2 AND ordencompraid = $3`,
        [
          piezasRecibidasAhora,
          detalleId,
          ordenCompraId,
          piezasPorPaqueteSafe,
          Number.parseFloat((Number.parseFloat(costoUnitario) || 0).toFixed(2)),
        ]
      );

      const stockAnterior = Number.parseInt(detalle.stockvariante, 10) || 0;
      const stockUpdate = await client.query(
        `UPDATE producto_variantes
         SET stock = COALESCE(stock, 0) + $1
         WHERE varianteid = $2
         RETURNING stock`,
        [piezasRecibidasAhora, varianteId]
      );
      const nuevoStock = Number.parseInt(stockUpdate.rows[0]?.stock, 10);
      const nuevoStockSafe = Number.isInteger(nuevoStock)
        ? nuevoStock
        : stockAnterior + piezasRecibidasAhora;

      const adminCreadorId = ordenLock.rows[0].admin_creador_id;
      const adminIdRegistro = adminCreadorId || usuarioRecibeId || null;

      if (adminIdRegistro) {
        await client.query(
          `INSERT INTO stock_admin (admin_id, variante_id, cantidad, tenant_id, updated_at, created_at)
           VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT (admin_id, variante_id, tenant_id)
           DO UPDATE SET 
             cantidad = stock_admin.cantidad + $3,
             updated_at = CURRENT_TIMESTAMP`,
          [adminIdRegistro, varianteId, piezasRecibidasAhora, tenant_id]
        );
        
        console.log(`📦 [STOCK ASSIGNMENT] Inventario asignado al Admin ID ${adminIdRegistro} (OC #${ordenCompraId}, Recepción Masiva)`);

        try {
          const kardexService = require('../services/kardexService');
          await kardexService.registrarMovimiento({
            varianteId: varianteId,
            adminId: adminIdRegistro,
            tenantId: tenant_id,
            tipo: 'ADICION',
            cantidad: piezasRecibidasAhora,
            motivo: `Recepción OC #${ordenCompraId}`,
            referenciaTipo: 'ORDEN_COMPRA',
            referenciaId: `OC-${ordenCompraId}`,
            observaciones: `Recepción masiva - Lote: ${referenciaProveedor}. SKU: ${detalle.sku}`,
            ipOrigen: req.ip || req.connection?.remoteAddress
          }, client);
        } catch (kardexError) {
          console.error('⚠️ [KARDEX] Error al registrar movimiento de entrada:', kardexError.message);
        }
      }

      productosActualizados.push({
        detalleId,
        varianteId,
        sku: detalle.sku,
        nombreProducto: detalle.nombreproducto,
        cantidadRecibidaAhora: piezasRecibidasAhora,
        cantidadRecibidaTotal: nuevoRecibidoPzas,
        cantidadSolicitada: solicitadoPzas,
        cantidadPendiente: Math.max(solicitadoPzas - nuevoRecibidoPzas, 0),
        stockVariante: nuevoStockSafe,
      });
    }

    const montoFinal = Number.isFinite(montoTotalCentavos)
      ? Number.parseFloat((montoTotalCentavos / 100).toFixed(2))
      : 0;

    const totalOrdenResult = await client.query(
      `SELECT COALESCE(
          SUM(
            (doc.cantidadsolicitada * COALESCE(NULLIF(doc.piezasporpaquete, 0), NULLIF(pv.piezasporpaquete, 0), 1))
            * COALESCE(NULLIF(doc.costounitario, 0), pv.costounitario)
          ),
          0
        ) AS total_orden
       FROM detallesordencompra doc
       INNER JOIN producto_variantes pv ON pv.varianteid = doc.varianteid
       WHERE doc.ordencompraid = $1`,
      [ordenCompraId]
    );

    const montoOriginalOrden =
      Number.parseFloat(totalOrdenResult.rows[0]?.total_orden ?? 0) || 0;

    await client.query("UPDATE ordenesdecompra SET total = $1 WHERE ordencompraid = $2 AND tenant_id = $3", [
      montoOriginalOrden,
      ordenCompraId,
      req.tenant.tenant_id,
    ]);

    const cxpInsert = await client.query(
      `INSERT INTO cuentas_por_pagar
        (proveedor_id, orden_compra_id, fecha_vencimiento, monto_total, monto_pagado, estatus, referencia_factura, comprobante_pago, usuario_creador_id, monto_original)
       VALUES ($1, $2, $3, $4, 0.00, 'PENDIENTE', $5, $6, $7, $8)
       RETURNING cxp_id`,
      [
        proveedorId,
        ordenCompraId,
        fechaVencimiento,
        montoFinal,
        referenciaProveedor,
        comprobanteUrl,
        Number.isInteger(usuarioRecibeId) && usuarioRecibeId > 0 ? usuarioRecibeId : null,
        montoFinal,
      ]
    );

    const cxpId = Number.parseInt(cxpInsert.rows[0]?.cxp_id, 10);

    try {
      await assignCxpEtiqueta(cxpId, "%Mercanc%");
    } catch (e) {
      // ignore
    }
    try {
      await assignCxpEtiqueta(cxpId, "%Crédit%");
    } catch (e) {
      // ignore
    }
    try {
      await assignCxpEtiqueta(cxpId, "%Credit%");
    } catch (e) {
      // ignore
    }

    for (const producto of productosActualizados) {
      await client.query(
        `INSERT INTO log_inventario
         (varianteid, cantidadcambiado, nuevostock, motivo, usuarioid, es_excepcion, cxp_id, tipo_origen, orden_compra_id, tenant_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          producto.varianteId,
          producto.cantidadRecibidaAhora,
          producto.stockVariante,
          `Recepción OC #${ordenCompraId} (Lote: ${referenciaProveedor})`,
          Number.isInteger(usuarioRecibeId) && usuarioRecibeId > 0 ? usuarioRecibeId : null,
          false,
          Number.isInteger(cxpId) && cxpId > 0 ? cxpId : null,
          'ORDEN_COMPRA',
          ordenCompraId,
          tenant_id
        ]
      );
    }

    const faltantesResult = await client.query(
      `SELECT COUNT(*)::int AS faltantes
       FROM detallesordencompra doc
       INNER JOIN producto_variantes pv ON pv.varianteid = doc.varianteid
       WHERE doc.ordencompraid = $1
         AND COALESCE(doc.piezasrecibidas, 0)
           < (doc.cantidadsolicitada * COALESCE(NULLIF(doc.piezasporpaquete, 0), NULLIF(pv.piezasporpaquete, 0), 1))`,
      [ordenCompraId]
    );
    const faltantes = Number.parseInt(faltantesResult.rows[0]?.faltantes, 10) || 0;
    const nuevoEstatusOC = faltantes === 0 ? "Completada" : "Parcial";
    await client.query("UPDATE ordenesdecompra SET estatus = $1 WHERE ordencompraid = $2 AND tenant_id = $3", [
      nuevoEstatusOC,
      ordenCompraId,
      req.tenant.tenant_id,
    ]);

    await client.query("COMMIT");

    return res.json({
      success: true,
      message: "Recepción masiva procesada correctamente",
      data: {
        ordenCompraId,
        cxpId: Number.isInteger(cxpId) ? cxpId : null,
        estatusOC: nuevoEstatusOC,
        montoTotal: montoFinal,
        referenciaProveedor,
        comprobanteUrl,
        productosActualizados,
      },
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (e) {
      // ignore
    }
    console.error("Error en recepción masiva:", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "Error al procesar la recepción masiva",
    });
  } finally {
    client.release();
  }
};

module.exports = {
  recepcionMasivaOrdenCompra
};
