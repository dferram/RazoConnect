/**
 * RECEPCIÓN ITEMS CONTROLLER
 * 
 * Controlador especializado para recepción individual de items de órdenes de compra.
 * Incluye funciones para recibir items uno por uno y cerrar sesiones de recepción.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/recepcionItemsController
 * @author RazoConnect Team
 * @date 2026-02-27
 */

const db = require('../db');

/**
 * Función auxiliar para crear o actualizar cuenta por pagar de una orden de compra
 * @private
 */
const upsertCuentaPorPagarForOC = async (client, ordenCompraId, usuarioId, tenantId) => {
  const ordenResult = await client.query(
    `SELECT oc.proveedorid, COALESCE(p.diascredito, 0) AS diascredito
     FROM ordenesdecompra oc
     INNER JOIN proveedores p ON p.proveedorid = oc.proveedorid
     WHERE oc.ordencompraid = $1`,
    [ordenCompraId]
  );

  if (!ordenResult.rows.length) {
    return null;
  }

  const proveedorId = Number.parseInt(ordenResult.rows[0].proveedorid, 10);
  const diasCredito = Number.parseInt(ordenResult.rows[0].diascredito, 10);
  const diasCreditoFinal = Number.isInteger(diasCredito) && diasCredito > 0 ? diasCredito : 0;

  const montoResult = await client.query(
    `SELECT COALESCE(
        SUM(
          COALESCE(
            NULLIF(doc.piezasrecibidas, 0),
            (doc.cantidadrecibida * COALESCE(NULLIF(doc.piezasporpaquete, 0), NULLIF(pv.piezasporpaquete, 0), 1))
          )
          * COALESCE(NULLIF(doc.costounitario, 0), pv.costounitario)
        ),
        0
      ) AS monto_total
     FROM detallesordencompra doc
     INNER JOIN producto_variantes pv ON pv.varianteid = doc.varianteid
     WHERE doc.ordencompraid = $1`,
    [ordenCompraId]
  );

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

  const totalOrden = Number.parseFloat(totalOrdenResult.rows[0]?.total_orden ?? 0) || 0;
  await client.query("UPDATE OrdenesDeCompra SET Total = $1 WHERE OrdenCompraID = $2 AND tenant_id = $3", [
    totalOrden,
    ordenCompraId,
    tenantId,
  ]);

  const montoTotal = Number.parseFloat(montoResult.rows[0]?.monto_total ?? 0) || 0;

  const vencResult = await client.query(
    "SELECT (CURRENT_DATE + ($1::int * INTERVAL '1 day'))::date AS fecha_vencimiento",
    [diasCreditoFinal]
  );
  const fechaVencimiento = vencResult.rows[0]?.fecha_vencimiento || null;

  const existing = await client.query(
    `SELECT cxp_id, monto_pagado
     FROM cuentas_por_pagar
     WHERE orden_compra_id = $1
     LIMIT 1
     FOR UPDATE`,
    [ordenCompraId]
  );

  if (!existing.rows.length) {
    const estatus = montoTotal > 0 ? "PENDIENTE" : "PENDIENTE";
    const insertRes = await client.query(
      `INSERT INTO cuentas_por_pagar
        (proveedor_id, orden_compra_id, fecha_vencimiento, monto_total, estatus, usuario_creador_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING cxp_id, proveedor_id, orden_compra_id, fecha_vencimiento, monto_total, monto_pagado, estatus`,
      [proveedorId, ordenCompraId, fechaVencimiento, montoTotal, estatus, usuarioId]
    );

    return insertRes.rows[0] || null;
  }

  const cxpId = Number.parseInt(existing.rows[0].cxp_id, 10);
  const montoPagado = Number.parseFloat(existing.rows[0].monto_pagado ?? 0) || 0;

  const estatus = (() => {
    if (montoTotal > 0 && montoPagado >= montoTotal) return "PAGADO";
    if (montoPagado > 0) return "PARCIAL";
    return "PENDIENTE";
  })();

  const updateRes = await client.query(
    `UPDATE cuentas_por_pagar
     SET proveedor_id = $1,
         fecha_vencimiento = $2,
         monto_total = $3,
         estatus = $4
     WHERE cxp_id = $5
     RETURNING cxp_id, proveedor_id, orden_compra_id, fecha_vencimiento, monto_total, monto_pagado, estatus`,
    [proveedorId, fechaVencimiento, montoTotal, estatus, cxpId]
  );

  return updateRes.rows[0] || null;
};

/**
 * Cerrar sesión de recepción y marcar items no recibidos como cerrados por merma
 * POST /api/admin/ordenes-compra/:id/cerrar-sesion
 */
const cerrarSesionRecepcion = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const { id: ordenCompraId } = req.params;
    const { motivo } = req.body;
    const userId = req.user.id;
    const userRole = req.user.rol;
    const { tenant_id } = req.tenant;

    if (!ordenCompraId) {
      return res.status(400).json({
        success: false,
        message: "El ID de la orden de compra es requerido"
      });
    }

    await client.query("BEGIN");

    // Verificar que la orden existe y validar propiedad
    let ordenCheckQuery = "SELECT OrdenCompraID, Estatus, admin_creador_id FROM OrdenesDeCompra WHERE OrdenCompraID = $1 AND tenant_id = $2";
    let ordenCheckParams = [ordenCompraId, tenant_id];

    // REGLA DE VISIBILIDAD: Admin solo puede cerrar sesión de sus propias órdenes
    if (userRole === 'admin') {
      ordenCheckQuery += " AND admin_creador_id = $3";
      ordenCheckParams.push(userId);
    }

    const ordenCheck = await client.query(ordenCheckQuery, ordenCheckParams);

    if (ordenCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Orden de compra no encontrada o no tienes permiso para cerrar esta sesión"
      });
    }

    // Obtener todos los detalles pendientes (no completamente recibidos)
    const detallesPendientesQuery = `
      SELECT 
        DetalleOC_ID,
        VarianteID,
        CantidadSolicitada,
        CantidadRecibida,
        PiezasPorPaquete
      FROM DetallesOrdenCompra
      WHERE OrdenCompraID = $1 
        AND CantidadRecibida < CantidadSolicitada
        AND (cerrado_por_merma IS NULL OR cerrado_por_merma = false)
    `;

    const detallesPendientes = await client.query(detallesPendientesQuery, [ordenCompraId]);

    let itemsCerrados = 0;

    // Marcar cada detalle pendiente como cerrado por merma
    for (const detalle of detallesPendientes.rows) {
      await client.query(
        `UPDATE DetallesOrdenCompra 
         SET cerrado_por_merma = true,
             fecha_cierre_merma = CURRENT_TIMESTAMP,
             admin_cierre_id = $1,
             motivo_discrepancia = $2,
             tipo_discrepancia = 'MERMA'
         WHERE DetalleOC_ID = $3`,
        [userId, motivo || 'Sesión cerrada - Producto no recibido', detalle.detalleoc_id]
      );

      itemsCerrados++;
    }

    // Actualizar el estatus de la orden
    const estatusQuery = `
      SELECT 
        SUM(CantidadSolicitada) as TotalSolicitado,
        SUM(CantidadRecibida) as TotalRecibido
      FROM DetallesOrdenCompra
      WHERE OrdenCompraID = $1
    `;

    const estatusResult = await client.query(estatusQuery, [ordenCompraId]);
    const { totalsolicitado, totalrecibido } = estatusResult.rows[0];

    let nuevoEstatus;
    if (parseInt(totalrecibido) >= parseInt(totalsolicitado)) {
      nuevoEstatus = "Completada";
    } else if (parseInt(totalrecibido) > 0) {
      nuevoEstatus = "Parcial";
    } else {
      nuevoEstatus = "Cancelada";
    }

    await client.query(
      "UPDATE OrdenesDeCompra SET Estatus = $1 WHERE OrdenCompraID = $2 AND tenant_id = $3",
      [nuevoEstatus, ordenCompraId, tenant_id]
    );

    // Liberar la sesión si estaba bloqueada
    await client.query(
      `UPDATE OrdenesDeCompra 
       SET admin_trabajando_id = NULL,
           fecha_bloqueo = NULL,
           ultima_actividad = NULL
       WHERE OrdenCompraID = $1 AND tenant_id = $2`,
      [ordenCompraId, tenant_id]
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      message: `Sesión cerrada exitosamente. ${itemsCerrados} item(s) marcado(s) como no recibido(s).`,
      data: {
        ordenCompraId,
        nuevoEstatus,
        itemsCerrados,
        totalRecibido: parseInt(totalrecibido),
        totalSolicitado: parseInt(totalsolicitado)
      }
    });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al cerrar sesión de recepción:", error);
    res.status(500).json({
      success: false,
      message: "Error al cerrar la sesión de recepción"
    });
  } finally {
    client.release();
  }
};

/**
 * Recibir un item individual de una orden de compra
 * POST /api/admin/ordenes-compra/:id/recibir-item
 */
const recibirItemOrdenCompra = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const ordenCompraId = Number.parseInt(req.params.id, 10);
    const detalleId = Number.parseInt(req.body?.detalleId, 10);
    const varianteId = Number.parseInt(req.body?.varianteId, 10);
    const cantidadIngresada = Number.parseInt(req.body?.cantidadIngresada, 10);
    const usuarioRecibeId = Number.parseInt(req?.user?.id ?? req?.user?.userId, 10);

    if (!Number.isInteger(ordenCompraId) || ordenCompraId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de orden de compra inválido",
      });
    }
    if (!Number.isInteger(detalleId) || detalleId <= 0) {
      return res.status(400).json({
        success: false,
        message: "detalleId inválido",
      });
    }
    if (!Number.isInteger(varianteId) || varianteId <= 0) {
      return res.status(400).json({
        success: false,
        message: "varianteId inválido",
      });
    }
    if (!Number.isInteger(cantidadIngresada) || cantidadIngresada <= 0) {
      return res.status(400).json({
        success: false,
        message: "cantidadIngresada inválida",
      });
    }

    await client.query("BEGIN");

    const { tenant_id } = req.tenant;
    const ordenLock = await client.query(
      "SELECT OrdenCompraID, Estatus FROM OrdenesDeCompra WHERE OrdenCompraID = $1 AND tenant_id = $2 FOR UPDATE",
      [ordenCompraId, tenant_id]
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

    const detalleResult = await client.query(
      `SELECT 
         doc.DetalleOC_ID,
         doc.OrdenCompraID,
         doc.VarianteID,
         doc.CantidadSolicitada,
         doc.CantidadRecibida,
         doc.PiezasRecibidas,
         doc.PiezasPorPaquete,
         pv.ProductoID,
         pv.SKU,
         pv.Stock AS StockVariante,
         pr.NombreProducto
       FROM DetallesOrdenCompra doc
       INNER JOIN Producto_Variantes pv ON doc.VarianteID = pv.VarianteID
       INNER JOIN Productos pr ON pv.ProductoID = pr.ProductoID
       WHERE doc.DetalleOC_ID = $1 AND doc.OrdenCompraID = $2
       FOR UPDATE`,
      [detalleId, ordenCompraId]
    );

    if (!detalleResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Detalle no encontrado en esta orden",
      });
    }

    const detalle = detalleResult.rows[0];
    const varianteIdDb = Number.parseInt(detalle.varianteid, 10);
    if (varianteIdDb !== varianteId) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "La variante no corresponde al detalle indicado",
      });
    }

    const solicitado = Number.parseInt(detalle.cantidadsolicitada, 10) || 0;
    const piezasPorPaqueteSafe = (() => {
      const parsed = Number.parseInt(detalle.piezasporpaquete, 10);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
    })();

    const solicitadoPzas = solicitado * piezasPorPaqueteSafe;
    const recibidoPzsActual = Number.parseInt(detalle.piezasrecibidas, 10) || 0;
    const nuevoRecibidoPzas = recibidoPzsActual + cantidadIngresada;
    if (nuevoRecibidoPzas > solicitadoPzas) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: `No puede recibir más de lo solicitado para ${detalle.nombreproducto}. Solicitado: ${solicitadoPzas}, Ya recibido: ${recibidoPzsActual}`,
      });
    }

    await client.query(
      "UPDATE DetallesOrdenCompra SET PiezasRecibidas = COALESCE(PiezasRecibidas, 0) + $1 WHERE DetalleOC_ID = $2 AND OrdenCompraID = $3",
      [cantidadIngresada, detalleId, ordenCompraId]
    );

    const cantidadAumentar = cantidadIngresada;
    await client.query(
      "UPDATE Producto_Variantes SET Stock = COALESCE(Stock, 0) + $1 WHERE VarianteID = $2",
      [cantidadAumentar, varianteId]
    );

    const stockAnterior = Number.parseInt(detalle.stockvariante, 10) || 0;
    const nuevoStock = stockAnterior + cantidadAumentar;

    await client.query(
      `INSERT INTO Log_Inventario 
       (VarianteID, CantidadCambiado, NuevoStock, Motivo, UsuarioID, tenant_id) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        varianteId,
        cantidadAumentar,
        nuevoStock,
        `Recepción OC #${ordenCompraId}`,
        Number.isInteger(usuarioRecibeId) && usuarioRecibeId > 0 ? usuarioRecibeId : null,
        tenant_id,
      ]
    );

    const faltantesResult = await client.query(
      "SELECT COUNT(*)::int AS faltantes FROM DetallesOrdenCompra WHERE OrdenCompraID = $1 AND COALESCE(PiezasRecibidas, 0) < (CantidadSolicitada * COALESCE(NULLIF(PiezasPorPaquete, 0), 1))",
      [ordenCompraId]
    );

    const faltantes = Number.parseInt(faltantesResult.rows[0]?.faltantes, 10) || 0;
    const nuevoEstatusOC = faltantes === 0 ? "Completada" : "Parcial";

    await client.query(
      "UPDATE OrdenesDeCompra SET Estatus = $1 WHERE OrdenCompraID = $2 AND tenant_id = $3",
      [nuevoEstatusOC, ordenCompraId, tenant_id]
    );

    let cuentaPorPagar = null;
    if (["Parcial", "Completada"].includes(nuevoEstatusOC)) {
      const usuarioId =
        Number.isInteger(usuarioRecibeId) && usuarioRecibeId > 0 ? usuarioRecibeId : null;
      cuentaPorPagar = await upsertCuentaPorPagarForOC(client, ordenCompraId, usuarioId, tenant_id);
    }

    await client.query("COMMIT");

    return res.json({
      success: true,
      message: "Item recibido correctamente",
      data: {
        ordenCompraId,
        estatusOC: nuevoEstatusOC,
        cuentaPorPagar,
        item: {
          detalleId,
          varianteId,
          sku: detalle.sku,
          nombreProducto: detalle.nombreproducto,
          cantidadSolicitada: solicitadoPzas,
          cantidadRecibida: nuevoRecibidoPzas,
          cantidadPendiente: Math.max(solicitadoPzas - nuevoRecibidoPzas, 0),
          piezasPorPaquete: piezasPorPaqueteSafe,
          stockVariante: nuevoStock,
        },
      },
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (e) {
      // ignore
    }
    console.error("Error al recibir item de OC:", error);
    return res.status(500).json({
      success: false,
      message: "Error al recibir item de la orden de compra",
    });
  } finally {
    client.release();
  }
};

module.exports = {
  cerrarSesionRecepcion,
  recibirItemOrdenCompra
};
