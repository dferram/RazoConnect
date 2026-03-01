const db = require('../db');
const logger = require('../utils/logger');

/**
 * Editar items de una Orden de Compra (Pre-Recepción)
 * PUT /api/admin/orden-compra/:id/items
 * 
 * Permite agregar, eliminar o modificar productos mientras la OC esté en 'Generada' o 'Enviada'
 */
const editarItemsOrdenCompra = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const { id: ordenCompraId } = req.params;
    const { items, itemsEliminados } = req.body;
    const { tenant_id } = req.tenant;
    const userId = req.user.id;
    const userRole = req.user.rol;

    if (!ordenCompraId) {
      return res.status(400).json({
        success: false,
        message: 'ID de orden de compra requerido'
      });
    }

    await client.query('BEGIN');

    // Verificar que la OC existe y está en estatus editable
    let ocQuery = `
      SELECT oc.OrdenCompraID, oc.Estatus, oc.ProveedorID, oc.usuario_creador_id, oc.pedido_origen_id
      FROM OrdenesDeCompra oc
      WHERE oc.OrdenCompraID = $1 AND oc.tenant_id = $2
    `;
    const ocParams = [ordenCompraId, tenant_id];

    // REGLA: Admin solo puede editar sus propias órdenes
    if (userRole === 'admin') {
      ocQuery += ' AND oc.usuario_creador_id = $3';
      ocParams.push(userId);
    }

    const ocResult = await client.query(ocQuery, ocParams);

    if (ocResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Orden de compra no encontrada o no tienes permiso para editarla'
      });
    }

    const ordenCompra = ocResult.rows[0];
    const estatusActual = ordenCompra.estatus;

    // Validar que el estatus permite edición
    if (!['Generada', 'Enviada', 'Pendiente'].includes(estatusActual)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `No se puede editar una orden con estatus "${estatusActual}". Solo se permiten órdenes en estatus Generada, Enviada o Pendiente.`
      });
    }

    const backordersAfectados = [];
    const itemsAgregados = [];
    const itemsModificados = [];

    // PASO 1: Procesar items eliminados
    if (itemsEliminados && Array.isArray(itemsEliminados) && itemsEliminados.length > 0) {
      for (const detalleId of itemsEliminados) {
        // Obtener información del detalle antes de eliminarlo
        const detalleQuery = `
          SELECT 
            doc.DetalleOC_ID,
            doc.VarianteID,
            doc.CantidadSolicitada,
            doc.CantidadRecibida,
            pv.SKU,
            pr.NombreProducto
          FROM DetallesOrdenCompra doc
          INNER JOIN Producto_Variantes pv ON doc.VarianteID = pv.VarianteID
          INNER JOIN Productos pr ON pv.ProductoID = pr.ProductoID
          WHERE doc.DetalleOC_ID = $1 AND doc.OrdenCompraID = $2
        `;

        const detalleResult = await client.query(detalleQuery, [detalleId, ordenCompraId]);

        if (detalleResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({
            success: false,
            message: `Detalle ${detalleId} no encontrado en esta orden`
          });
        }

        const detalle = detalleResult.rows[0];

        // Verificar si ya se recibió inventario
        if (detalle.cantidadrecibida > 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: `No se puede eliminar "${detalle.nombreproducto}" porque ya se recibió inventario (${detalle.cantidadrecibida} paquetes)`
          });
        }

        // Verificar si este item está vinculado a un backorder de cliente
        const backorderQuery = `
          SELECT 
            dp.DetalleID,
            dp.PedidoID,
            dp.CantidadPaquetes,
            p.ClienteID,
            c.Nombre || ' ' || c.Apellido AS NombreCliente
          FROM DetallesDelPedido dp
          INNER JOIN Pedidos p ON dp.PedidoID = p.PedidoID
          INNER JOIN Clientes c ON p.ClienteID = c.ClienteID
          WHERE dp.VarianteID = $1 
            AND dp.EsBackorder = true 
            AND dp.BackorderSurtido = false
            AND p.tenant_id = $2
          LIMIT 1
        `;

        const backorderResult = await client.query(backorderQuery, [detalle.varianteid, tenant_id]);

        if (backorderResult.rows.length > 0) {
          const backorder = backorderResult.rows[0];
          backordersAfectados.push({
            detalleId: detalle.detalleoc_id,
            sku: detalle.sku,
            nombreProducto: detalle.nombreproducto,
            pedidoId: backorder.pedidoid,
            clienteId: backorder.clienteid,
            nombreCliente: backorder.nombrecliente,
            cantidadPaquetes: backorder.cantidadpaquetes
          });
        }

        // Eliminar el detalle
        await client.query(
          'DELETE FROM DetallesOrdenCompra WHERE DetalleOC_ID = $1',
          [detalleId]
        );
      }
    }

    // PASO 2: Procesar items nuevos o modificados
    if (items && Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        const { detalleId, varianteId, cantidadSolicitada, piezasPorPaquete, costoUnitario } = item;

        // Validaciones
        if (!varianteId || !cantidadSolicitada) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: 'Cada item debe tener varianteId y cantidadSolicitada'
          });
        }

        const cantidadParsed = parseInt(cantidadSolicitada, 10);
        if (!Number.isInteger(cantidadParsed) || cantidadParsed <= 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: 'La cantidad solicitada debe ser un número entero positivo'
          });
        }

        const piezasParsed = parseInt(piezasPorPaquete || 1, 10);
        if (!Number.isInteger(piezasParsed) || piezasParsed <= 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: 'Las piezas por paquete deben ser un número entero positivo'
          });
        }

        const costoParsed = parseFloat(costoUnitario || 0);
        if (!Number.isFinite(costoParsed) || costoParsed < 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: 'El costo unitario debe ser un número válido no negativo'
          });
        }

        // Verificar que la variante existe
        const varianteCheck = await client.query(
          `SELECT pv.VarianteID, pv.SKU, pr.NombreProducto, pr.tenant_id
           FROM Producto_Variantes pv
           INNER JOIN Productos pr ON pv.ProductoID = pr.ProductoID
           WHERE pv.VarianteID = $1 AND pr.tenant_id = $2`,
          [varianteId, tenant_id]
        );

        if (varianteCheck.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({
            success: false,
            message: `Variante ${varianteId} no encontrada`
          });
        }

        if (detalleId) {
          // ACTUALIZAR item existente
          const updateQuery = `
            UPDATE DetallesOrdenCompra
            SET CantidadSolicitada = $1,
                PiezasPorPaquete = $2,
                CostoUnitario = $3
            WHERE DetalleOC_ID = $4 AND OrdenCompraID = $5
            RETURNING DetalleOC_ID
          `;

          const updateResult = await client.query(updateQuery, [
            cantidadParsed,
            piezasParsed,
            costoParsed,
            detalleId,
            ordenCompraId
          ]);

          if (updateResult.rows.length > 0) {
            itemsModificados.push({
              detalleId: updateResult.rows[0].detalleoc_id,
              sku: varianteCheck.rows[0].sku,
              nombreProducto: varianteCheck.rows[0].nombreproducto
            });
          }
        } else {
          // INSERTAR nuevo item
          const insertQuery = `
            INSERT INTO DetallesOrdenCompra 
            (OrdenCompraID, VarianteID, CantidadSolicitada, PiezasPorPaquete, CostoUnitario, tenant_id)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING DetalleOC_ID
          `;

          const insertResult = await client.query(insertQuery, [
            ordenCompraId,
            varianteId,
            cantidadParsed,
            piezasParsed,
            costoParsed,
            tenant_id
          ]);

          itemsAgregados.push({
            detalleId: insertResult.rows[0].detalleoc_id,
            sku: varianteCheck.rows[0].sku,
            nombreProducto: varianteCheck.rows[0].nombreproducto
          });
        }
      }
    }

    // PASO 3: Recalcular el total de la OC
    const totalQuery = `
      SELECT COALESCE(SUM(CantidadSolicitada * PiezasPorPaquete * CostoUnitario), 0) AS total
      FROM DetallesOrdenCompra
      WHERE OrdenCompraID = $1
    `;

    const totalResult = await client.query(totalQuery, [ordenCompraId]);
    const nuevoTotal = parseFloat(totalResult.rows[0].total || 0).toFixed(2);

    await client.query(
      'UPDATE OrdenesDeCompra SET total = $1 WHERE OrdenCompraID = $2',
      [nuevoTotal, ordenCompraId]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Orden de compra actualizada exitosamente',
      data: {
        ordenCompraId,
        nuevoTotal: parseFloat(nuevoTotal),
        itemsAgregados,
        itemsModificados,
        itemsEliminados: itemsEliminados?.length || 0,
        backordersAfectados: backordersAfectados.length > 0 ? backordersAfectados : null,
        requiereDecisionBackorder: backordersAfectados.length > 0
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error al editar items de orden de compra:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: 'Error al editar la orden de compra'
    });
  } finally {
    client.release();
  }
};

/**
 * Cancelar backorder vinculado a un item de OC eliminado
 * POST /api/admin/orden-compra/cancelar-backorder
 */
const cancelarBackorderVinculado = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const { pedidoId, detalleId, motivo } = req.body;
    const { tenant_id } = req.tenant;
    const userId = req.user.id;

    if (!pedidoId || !detalleId) {
      return res.status(400).json({
        success: false,
        message: 'pedidoId y detalleId son requeridos'
      });
    }

    await client.query('BEGIN');

    // Verificar que el detalle existe y es backorder
    const detalleCheck = await client.query(
      `SELECT dp.DetalleID, dp.VarianteID, dp.CantidadPaquetes, dp.EsBackorder, p.tenant_id
       FROM DetallesDelPedido dp
       INNER JOIN Pedidos p ON dp.PedidoID = p.PedidoID
       WHERE dp.DetalleID = $1 AND dp.PedidoID = $2 AND p.tenant_id = $3`,
      [detalleId, pedidoId, tenant_id]
    );

    if (detalleCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Detalle de pedido no encontrado'
      });
    }

    const detalle = detalleCheck.rows[0];

    if (!detalle.esbackorder) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Este detalle no es un backorder'
      });
    }

    // Marcar el backorder como cancelado
    await client.query(
      `UPDATE DetallesDelPedido 
       SET BackorderSurtido = true,
           CantidadSurtida = 0
       WHERE DetalleID = $1`,
      [detalleId]
    );

    // Registrar en log de inventario
    await client.query(
      `INSERT INTO Log_Inventario 
       (VarianteID, CantidadCambiado, NuevoStock, Motivo, UsuarioID, tenant_id)
       VALUES ($1, 0, 0, $2, $3, $4)`,
      [
        detalle.varianteid,
        `Backorder cancelado - Pedido #${pedidoId} - Motivo: ${motivo || 'Item eliminado de OC'}`,
        userId,
        tenant_id
      ]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Backorder cancelado exitosamente'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error al cancelar backorder:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: 'Error al cancelar el backorder'
    });
  } finally {
    client.release();
  }
};

/**
 * Registrar anomalía en entrada de almacén (merma o excedente)
 * POST /api/admin/orden-compra/registrar-anomalia
 */
const registrarAnomaliaEntrada = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const { 
      detalleOcId, 
      tipoDiscrepancia, 
      motivoDiscrepancia, 
      cantidadReal,
      cerrarPorMerma 
    } = req.body;
    const { tenant_id } = req.tenant;
    const userId = req.user.id;

    if (!detalleOcId || !tipoDiscrepancia || !motivoDiscrepancia) {
      return res.status(400).json({
        success: false,
        message: 'detalleOcId, tipoDiscrepancia y motivoDiscrepancia son requeridos'
      });
    }

    if (!['MERMA', 'EXCEDENTE'].includes(tipoDiscrepancia)) {
      return res.status(400).json({
        success: false,
        message: 'tipoDiscrepancia debe ser MERMA o EXCEDENTE'
      });
    }

    await client.query('BEGIN');

    // Obtener información del detalle
    const detalleQuery = `
      SELECT 
        doc.DetalleOC_ID,
        doc.OrdenCompraID,
        doc.VarianteID,
        doc.CantidadSolicitada,
        doc.CantidadRecibida,
        doc.PiezasPorPaquete,
        pv.SKU,
        pr.NombreProducto
      FROM DetallesOrdenCompra doc
      INNER JOIN Producto_Variantes pv ON doc.VarianteID = pv.VarianteID
      INNER JOIN Productos pr ON pv.ProductoID = pr.ProductoID
      WHERE doc.DetalleOC_ID = $1
    `;

    const detalleResult = await client.query(detalleQuery, [detalleOcId]);

    if (detalleResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Detalle de orden de compra no encontrado'
      });
    }

    const detalle = detalleResult.rows[0];
    const cantidadEsperada = detalle.cantidadsolicitada - detalle.cantidadrecibida;

    // Actualizar el detalle con la anomalía
    const updateQuery = `
      UPDATE DetallesOrdenCompra
      SET motivo_discrepancia = $1,
          tipo_discrepancia = $2,
          cerrado_por_merma = $3,
          fecha_cierre_merma = $4,
          admin_cierre_id = $5,
          cantidad_excedente = $6
      WHERE DetalleOC_ID = $7
    `;

    const cantidadExcedente = tipoDiscrepancia === 'EXCEDENTE' 
      ? (cantidadReal - cantidadEsperada) 
      : 0;

    await client.query(updateQuery, [
      motivoDiscrepancia,
      tipoDiscrepancia,
      cerrarPorMerma || false,
      cerrarPorMerma ? new Date() : null,
      cerrarPorMerma ? userId : null,
      cantidadExcedente,
      detalleOcId
    ]);

    // Registrar en ajustes_inventario para trazabilidad
    const tipoAjuste = tipoDiscrepancia === 'MERMA' ? 'MERMA' : 'ENTRADA';
    const cantidadAjuste = Math.abs(cantidadReal - cantidadEsperada) * detalle.piezasporpaquete;

    await client.query(
      `INSERT INTO ajustes_inventario 
       (variante_id, admin_id, cantidad, tipo_ajuste, motivo, usuario_id, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        detalle.varianteid,
        userId,
        cantidadAjuste,
        tipoAjuste,
        `${tipoDiscrepancia} en OC #${detalle.ordencompraid} - ${motivoDiscrepancia}`,
        userId,
        tenant_id
      ]
    );

    // Si es merma y se cierra, cancelar backorders pendientes
    if (cerrarPorMerma && tipoDiscrepancia === 'MERMA') {
      await client.query(
        `UPDATE DetallesDelPedido dp
         SET BackorderSurtido = true,
             backorder_cancelado = true
         FROM Pedidos p
         WHERE dp.PedidoID = p.PedidoID
           AND dp.VarianteID = $1
           AND dp.EsBackorder = true
           AND dp.BackorderSurtido = false
           AND p.tenant_id = $2`,
        [detalle.varianteid, tenant_id]
      );
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Anomalía registrada exitosamente: ${tipoDiscrepancia}`,
      data: {
        detalleOcId,
        tipoDiscrepancia,
        cantidadEsperada,
        cantidadReal,
        diferencia: cantidadReal - cantidadEsperada,
        cerradoPorMerma: cerrarPorMerma || false
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error al registrar anomalía:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: 'Error al registrar la anomalía'
    });
  } finally {
    client.release();
  }
};

module.exports = {
  editarItemsOrdenCompra,
  cancelarBackorderVinculado,
  registrarAnomaliaEntrada
};
