const db = require('../db');

class InventoryAuditService {
  async calcularStockTeorico(varianteId, adminId, tenantId, fechaInicio = null, fechaFin = null) {
    const client = await db.pool.connect();
    try {
      let inventarioInicial = 0;
      let entradasOC = 0;
      let entradasBackorder = 0;
      let salidasVentas = 0;
      let mermas = 0;

      if (fechaInicio) {
        const resultInicial = await client.query(
          `SELECT COALESCE(cantidad, 0) as cantidad
           FROM inventarios_admin
           WHERE variante_id = $1 AND admin_id = $2 AND tenant_id = $3
           AND ultima_actualizacion < $4`,
          [varianteId, adminId, tenantId, fechaInicio]
        );
        inventarioInicial = resultInicial.rows[0]?.cantidad || 0;
      } else {
        const resultInicial = await client.query(
          `SELECT COALESCE(cantidad, 0) as cantidad
           FROM inventarios_admin
           WHERE variante_id = $1 AND admin_id = $2 AND tenant_id = $3`,
          [varianteId, adminId, tenantId]
        );
        inventarioInicial = resultInicial.rows[0]?.cantidad || 0;
      }

      const whereClause = fechaInicio && fechaFin 
        ? `AND fecha_recepcion BETWEEN $4 AND $5`
        : '';
      const params = fechaInicio && fechaFin
        ? [varianteId, adminId, tenantId, fechaInicio, fechaFin]
        : [varianteId, adminId, tenantId];

      const resultOC = await client.query(
        `SELECT COALESCE(SUM(doc.piezasrecibidas), 0) as total
         FROM detallesordencompra doc
         INNER JOIN ordenescompra oc ON doc.ordencompraid = oc.ordencompraid
         WHERE doc.varianteid = $1 
         AND oc.admin_id = $2 
         AND oc.tenant_id = $3
         AND oc.estatus = 'RECIBIDA'
         ${whereClause}`,
        params
      );
      entradasOC = parseInt(resultOC.rows[0]?.total || 0);

      const resultBackorder = await client.query(
        `SELECT COALESCE(SUM(dp.cantidadsurtida), 0) as total
         FROM detallesdelpedido dp
         INNER JOIN pedidos p ON dp.pedidoid = p.pedidoid
         WHERE dp.varianteid = $1
         AND p.admin_id = $2
         AND p.tenant_id = $3
         AND dp.esbackorder = true
         AND dp.cantidadsurtida > 0
         ${fechaInicio && fechaFin ? 'AND p.fechacreacion BETWEEN $4 AND $5' : ''}`,
        params
      );
      entradasBackorder = parseInt(resultBackorder.rows[0]?.total || 0);

      const resultVentas = await client.query(
        `SELECT COALESCE(SUM(dr.cantidad_piezas), 0) as total
         FROM detalle_remisiones dr
         INNER JOIN remisiones r ON dr.remision_id = r.remision_id
         WHERE dr.variante_id = $1
         AND r.admin_id = $2
         AND r.tenant_id = $3
         AND r.emitida = true
         ${fechaInicio && fechaFin ? 'AND r.fecha_emision BETWEEN $4 AND $5' : ''}`,
        params
      );
      salidasVentas = parseInt(resultVentas.rows[0]?.total || 0);

      const resultMermas = await client.query(
        `SELECT COALESCE(SUM(cantidad), 0) as total
         FROM ajustes_inventario
         WHERE variante_id = $1
         AND admin_id = $2
         AND tenant_id = $3
         AND tipo_ajuste = 'MERMA'
         ${fechaInicio && fechaFin ? 'AND fecha_ajuste BETWEEN $4 AND $5' : ''}`,
        params
      );
      mermas = parseInt(resultMermas.rows[0]?.total || 0);

      const stockTeorico = inventarioInicial + entradasOC + entradasBackorder - salidasVentas - mermas;

      return {
        varianteId,
        inventarioInicial,
        entradasOC,
        entradasBackorder,
        salidasVentas,
        mermas,
        stockTeorico: Math.max(0, stockTeorico),
        desglose: {
          inventarioInicial,
          entradas: entradasOC + entradasBackorder,
          salidas: salidasVentas + mermas
        }
      };
    } finally {
      client.release();
    }
  }

  async calcularStockTeoricoMasivo(adminId, tenantId, fechaInicio = null, fechaFin = null) {
    const client = await db.pool.connect();
    try {
      const resultVariantes = await client.query(
        `SELECT DISTINCT ia.variante_id, pv.sku, p.nombre as producto_nombre,
                pv.dimensiones, pv.costounitario, pv.preciounitario
         FROM inventarios_admin ia
         INNER JOIN producto_variantes pv ON ia.variante_id = pv.varianteid
         INNER JOIN productos p ON pv.productoid = p.productoid
         WHERE ia.admin_id = $1 AND ia.tenant_id = $2
         ORDER BY p.nombre, pv.sku`,
        [adminId, tenantId]
      );

      const resultados = [];
      for (const row of resultVariantes.rows) {
        const stockTeorico = await this.calcularStockTeorico(
          row.variante_id,
          adminId,
          tenantId,
          fechaInicio,
          fechaFin
        );

        resultados.push({
          varianteId: row.variante_id,
          sku: row.sku,
          productoNombre: row.producto_nombre,
          dimensiones: row.dimensiones,
          costoUnitario: parseFloat(row.costounitario),
          precioUnitario: parseFloat(row.preciounitario),
          ...stockTeorico
        });
      }

      return resultados;
    } finally {
      client.release();
    }
  }

  async crearSesionAuditoria(nombre, usuarioCreadorId, tenantId) {
    const client = await db.pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO toma_inventario_sesiones (nombre, usuario_creador_id, tenant_id, estatus)
         VALUES ($1, $2, $3, 'ABIERTA')
         RETURNING sesionid, nombre, fechainicio, estatus`,
        [nombre, usuarioCreadorId, tenantId]
      );

      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async obtenerSesionesAuditoria(tenantId, limit = 50) {
    const client = await db.pool.connect();
    try {
      const result = await client.query(
        `SELECT s.sesionid, s.nombre, s.fechainicio, s.fechacierre, s.estatus,
                a.nombre as usuario_creador_nombre,
                COUNT(c.conteoid) as total_conteos,
                COUNT(CASE WHEN c.estatus_aplicacion = 'APLICADO' THEN 1 END) as conteos_aplicados
         FROM toma_inventario_sesiones s
         LEFT JOIN administradores a ON s.usuario_creador_id = a.adminid
         LEFT JOIN toma_inventario_conteos c ON s.sesionid = c.sesionid
         WHERE s.tenant_id = $1
         GROUP BY s.sesionid, s.nombre, s.fechainicio, s.fechacierre, s.estatus, a.nombre
         ORDER BY s.fechainicio DESC
         LIMIT $2`,
        [tenantId, limit]
      );

      return result.rows;
    } finally {
      client.release();
    }
  }

  async registrarConteo(sesionId, varianteId, cantidadFisica, usuarioId, tenantId, comentario = null) {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      const sesionResult = await client.query(
        `SELECT estatus FROM toma_inventario_sesiones WHERE sesionid = $1 AND tenant_id = $2`,
        [sesionId, tenantId]
      );

      if (!sesionResult.rows[0] || sesionResult.rows[0].estatus !== 'ABIERTA') {
        throw new Error('La sesión de auditoría no está abierta');
      }

      const existingResult = await client.query(
        `SELECT conteoid, conteo_a, usuario_a_id FROM toma_inventario_conteos
         WHERE sesionid = $1 AND varianteid = $2 AND tenant_id = $3`,
        [sesionId, varianteId, tenantId]
      );

      let result;
      if (existingResult.rows.length === 0) {
        result = await client.query(
          `INSERT INTO toma_inventario_conteos 
           (sesionid, varianteid, conteo_a, usuario_a_id, tenant_id, estatus_fila)
           VALUES ($1, $2, $3, $4, $5, 'PENDIENTE_A')
           RETURNING conteoid, conteo_a, usuario_a_id, estatus_fila`,
          [sesionId, varianteId, cantidadFisica, usuarioId, tenantId]
        );
      } else {
        result = await client.query(
          `UPDATE toma_inventario_conteos
           SET conteo_a = $1, usuario_a_id = $2, estatus_fila = 'PENDIENTE_A'
           WHERE conteoid = $3
           RETURNING conteoid, conteo_a, usuario_a_id, estatus_fila`,
          [cantidadFisica, usuarioId, existingResult.rows[0].conteoid]
        );
      }

      if (comentario) {
        await client.query(
          `INSERT INTO auditoria_comentarios (conteo_id, comentario, usuario_id, tenant_id)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (conteo_id) DO UPDATE SET comentario = $2, usuario_id = $3`,
          [result.rows[0].conteoid, comentario, usuarioId, tenantId]
        );
      }

      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async obtenerConteosConReconciliacion(sesionId, adminId, tenantId) {
    const client = await db.pool.connect();
    try {
      const result = await client.query(
        `SELECT c.conteoid, c.varianteid, c.conteo_a as cantidad_fisica, c.estatus_aplicacion,
                pv.sku, p.nombre as producto_nombre, pv.dimensiones,
                pv.costounitario, pv.preciounitario,
                ia.cantidad as stock_actual,
                ac.comentario
         FROM toma_inventario_conteos c
         INNER JOIN producto_variantes pv ON c.varianteid = pv.varianteid
         INNER JOIN productos p ON pv.productoid = p.productoid
         LEFT JOIN inventarios_admin ia ON c.varianteid = ia.variante_id AND ia.admin_id = $2
         LEFT JOIN auditoria_comentarios ac ON c.conteoid = ac.conteo_id
         WHERE c.sesionid = $1 AND c.tenant_id = $3
         ORDER BY p.nombre, pv.sku`,
        [sesionId, adminId, tenantId]
      );

      const conteos = [];
      for (const row of result.rows) {
        const stockTeorico = await this.calcularStockTeorico(
          row.varianteid,
          adminId,
          tenantId
        );

        const cantidadFisica = row.cantidad_fisica || 0;
        const diferencia = cantidadFisica - stockTeorico.stockTeorico;
        const impactoEconomico = diferencia * parseFloat(row.costounitario);

        let semaforo = 'verde';
        if (Math.abs(diferencia) > 0 && Math.abs(diferencia) <= 2) {
          semaforo = 'amarillo';
        } else if (Math.abs(diferencia) > 2) {
          semaforo = 'rojo';
        }

        const requiereComentario = semaforo === 'rojo' && !row.comentario;

        conteos.push({
          conteoId: row.conteoid,
          varianteId: row.varianteid,
          sku: row.sku,
          productoNombre: row.producto_nombre,
          dimensiones: row.dimensiones,
          stockTeorico: stockTeorico.stockTeorico,
          cantidadFisica,
          diferencia,
          impactoEconomico: parseFloat(impactoEconomico.toFixed(2)),
          costoUnitario: parseFloat(row.costounitario),
          precioUnitario: parseFloat(row.preciounitario),
          semaforo,
          requiereComentario,
          comentario: row.comentario,
          estatusAplicacion: row.estatus_aplicacion,
          desglose: stockTeorico.desglose
        });
      }

      return conteos;
    } finally {
      client.release();
    }
  }

  async cerrarYSincronizarAuditoria(sesionId, adminId, tenantId, usuarioId) {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      const sesionResult = await client.query(
        `SELECT estatus FROM toma_inventario_sesiones WHERE sesionid = $1 AND tenant_id = $2`,
        [sesionId, tenantId]
      );

      if (!sesionResult.rows[0] || sesionResult.rows[0].estatus !== 'ABIERTA') {
        throw new Error('La sesión de auditoría no está abierta');
      }

      const conteosResult = await client.query(
        `SELECT c.conteoid, c.varianteid, c.conteo_a, ac.comentario
         FROM toma_inventario_conteos c
         LEFT JOIN auditoria_comentarios ac ON c.conteoid = ac.conteo_id
         WHERE c.sesionid = $1 AND c.tenant_id = $2 AND c.estatus_aplicacion = 'PENDIENTE'`,
        [sesionId, tenantId]
      );

      const conteos = await this.obtenerConteosConReconciliacion(sesionId, adminId, tenantId);
      
      for (const conteo of conteos) {
        if (conteo.requiereComentario) {
          throw new Error(`El conteo del SKU ${conteo.sku} requiere un comentario de justificación`);
        }
      }

      const ajustesRealizados = [];
      for (const row of conteosResult.rows) {
        const cantidadFisica = row.conteo_a;

        await client.query(
          `INSERT INTO inventarios_admin (admin_id, variante_id, cantidad, tenant_id, registrado_por)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (admin_id, variante_id, tenant_id)
           DO UPDATE SET cantidad = $3, ultima_actualizacion = CURRENT_TIMESTAMP, registrado_por = $5`,
          [adminId, row.varianteid, cantidadFisica, tenantId, usuarioId]
        );

        const stockAnterior = await client.query(
          `SELECT cantidad FROM inventarios_admin 
           WHERE admin_id = $1 AND variante_id = $2 AND tenant_id = $3`,
          [adminId, row.varianteid, tenantId]
        );

        const diferencia = cantidadFisica - (stockAnterior.rows[0]?.cantidad || 0);

        if (diferencia !== 0) {
          await client.query(
            `INSERT INTO ajustes_inventario 
             (variante_id, admin_id, cantidad, tipo_ajuste, motivo, usuario_id, tenant_id, sesion_auditoria_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              row.varianteid,
              adminId,
              Math.abs(diferencia),
              diferencia > 0 ? 'ENTRADA' : 'SALIDA',
              `Ajuste por auditoría mensual - Sesión ${sesionId}. ${row.comentario || ''}`,
              usuarioId,
              tenantId,
              sesionId
            ]
          );
        }

        await client.query(
          `UPDATE toma_inventario_conteos
           SET estatus_aplicacion = 'APLICADO', cantidad_final = $1
           WHERE conteoid = $2`,
          [cantidadFisica, row.conteoid]
        );

        ajustesRealizados.push({
          varianteId: row.varianteid,
          cantidadFisica,
          diferencia
        });
      }

      await client.query(
        `UPDATE toma_inventario_sesiones
         SET estatus = 'CERRADA', fechacierre = CURRENT_TIMESTAMP
         WHERE sesionid = $1`,
        [sesionId]
      );

      await client.query('COMMIT');

      return {
        sesionId,
        ajustesRealizados: ajustesRealizados.length,
        detalles: ajustesRealizados
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async generarReporteAuditoria(sesionId, adminId, tenantId) {
    const client = await db.pool.connect();
    try {
      const sesionResult = await client.query(
        `SELECT s.*, a.nombre as usuario_creador_nombre
         FROM toma_inventario_sesiones s
         LEFT JOIN administradores a ON s.usuario_creador_id = a.adminid
         WHERE s.sesionid = $1 AND s.tenant_id = $2`,
        [sesionId, tenantId]
      );

      if (!sesionResult.rows[0]) {
        throw new Error('Sesión de auditoría no encontrada');
      }

      const conteos = await this.obtenerConteosConReconciliacion(sesionId, adminId, tenantId);

      const resumen = {
        totalProductos: conteos.length,
        totalConciliados: conteos.filter(c => c.diferencia === 0).length,
        totalConDiferencia: conteos.filter(c => c.diferencia !== 0).length,
        impactoEconomicoTotal: conteos.reduce((sum, c) => sum + c.impactoEconomico, 0),
        porSemaforo: {
          verde: conteos.filter(c => c.semaforo === 'verde').length,
          amarillo: conteos.filter(c => c.semaforo === 'amarillo').length,
          rojo: conteos.filter(c => c.semaforo === 'rojo').length
        }
      };

      return {
        sesion: sesionResult.rows[0],
        conteos,
        resumen
      };
    } finally {
      client.release();
    }
  }
}

module.exports = new InventoryAuditService();
