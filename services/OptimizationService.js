const pool = require('../db');

class OptimizationService {
  async detectConsolidationOpportunities(tenantId, adminId = null) {
    const client = await pool.connect();
    
    try {
      const query = `
        WITH ordenes_pendientes AS (
          SELECT 
            oc.ordencompraid,
            oc.proveedorid,
            doc.detalleocid,
            doc.varianteid,
            doc.cantidad as cantidad_solicitada,
            p.productoid,
            p.nombre as producto_nombre,
            p.sku,
            pv.dimensionesfisicas,
            pre.cantidadempaque as pack_size,
            pre.reglaid,
            prov.nombreempresa as proveedor_nombre,
            oc.admin_creador_id,
            oc.fechacreacion,
            CEILING(doc.cantidad::numeric / NULLIF(pre.cantidadempaque, 0)) as paquetes_necesarios,
            CEILING(doc.cantidad::numeric / NULLIF(pre.cantidadempaque, 0)) * pre.cantidadempaque as piezas_a_comprar
          FROM ordenesdecompra oc
          INNER JOIN detallesordencompra doc ON oc.ordencompraid = doc.ordencompraid
          INNER JOIN producto_variantes pv ON doc.varianteid = pv.varianteid
          INNER JOIN productos p ON pv.productoid = p.productoid
          INNER JOIN proveedor_reglas_empaque pre ON p.reglaid = pre.reglaid
          INNER JOIN proveedores prov ON oc.proveedorid = prov.proveedorid
          WHERE oc.estatus IN ('Pendiente', 'Borrador')
            AND oc.tenant_id = $1
            ${adminId ? 'AND oc.admin_creador_id = $2' : ''}
            AND pre.cantidadempaque > 1
        ),
        agrupaciones AS (
          SELECT 
            proveedorid,
            proveedor_nombre,
            varianteid,
            productoid,
            producto_nombre,
            sku,
            dimensionesfisicas,
            pack_size,
            reglaid,
            COUNT(DISTINCT ordencompraid) as num_ordenes,
            SUM(cantidad_solicitada) as total_solicitado,
            SUM(piezas_a_comprar) as total_separado,
            CEILING(SUM(cantidad_solicitada)::numeric / NULLIF(pack_size, 0)) * pack_size as total_agrupado,
            json_agg(
              json_build_object(
                'ordenCompraId', ordencompraid,
                'detalleOcId', detalleocid,
                'cantidadSolicitada', cantidad_solicitada,
                'paquetesNecesarios', paquetes_necesarios,
                'piezasAComprar', piezas_a_comprar,
                'adminCreadorId', admin_creador_id,
                'fechaCreacion', fechacreacion
              ) ORDER BY fechacreacion
            ) as ordenes_detalle
          FROM ordenes_pendientes
          GROUP BY proveedorid, proveedor_nombre, varianteid, productoid, producto_nombre, sku, dimensionesfisicas, pack_size, reglaid
          HAVING COUNT(DISTINCT ordencompraid) > 1
        )
        SELECT 
          proveedorid,
          proveedor_nombre,
          varianteid,
          productoid,
          producto_nombre,
          sku,
          dimensionesfisicas,
          pack_size,
          reglaid,
          num_ordenes,
          total_solicitado,
          total_separado,
          total_agrupado,
          (total_separado - total_agrupado) as ahorro_piezas,
          ROUND(((total_separado - total_agrupado)::numeric / NULLIF(total_separado, 0)) * 100, 2) as porcentaje_ahorro,
          ordenes_detalle
        FROM agrupaciones
        WHERE total_separado > total_agrupado
        ORDER BY (total_separado - total_agrupado) DESC
      `;

      const params = adminId ? [tenantId, adminId] : [tenantId];
      const result = await client.query(query, params);

      const oportunidades = result.rows.map(row => ({
        proveedorId: row.proveedorid,
        proveedorNombre: row.proveedor_nombre,
        varianteId: row.varianteid,
        productoId: row.productoid,
        productoNombre: row.producto_nombre,
        sku: row.sku,
        dimensionesFisicas: row.dimensionesfisicas,
        packSize: row.pack_size,
        reglaId: row.reglaid,
        numOrdenes: row.num_ordenes,
        totalSolicitado: row.total_solicitado,
        totalSeparado: row.total_separado,
        totalAgrupado: row.total_agrupado,
        ahorroPiezas: row.ahorro_piezas,
        porcentajeAhorro: parseFloat(row.porcentaje_ahorro),
        ordenesDetalle: row.ordenes_detalle
      }));

      const resumen = {
        totalOportunidades: oportunidades.length,
        ahorroTotalPiezas: oportunidades.reduce((sum, op) => sum + op.ahorroPiezas, 0),
        ordenesAfectadas: oportunidades.reduce((sum, op) => sum + op.numOrdenes, 0)
      };

      return {
        resumen,
        oportunidades
      };

    } catch (error) {
      console.error('❌ [OptimizationService] Error detectando oportunidades:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async createConsolidatedGroup(tenantId, ordenesIds, adminCreadorId) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Validar que todas las órdenes sean del mismo proveedor
      const validacionQuery = `
        SELECT 
          COUNT(DISTINCT proveedorid) as proveedores_distintos,
          MIN(proveedorid) as proveedor_id,
          COUNT(*) as total_ordenes
        FROM ordenesdecompra
        WHERE ordencompraid = ANY($1::int[])
          AND tenant_id = $2
          AND estatus IN ('Borrador', 'Pendiente')
          AND grupo_id IS NULL
      `;

      const validacion = await client.query(validacionQuery, [ordenesIds, tenantId]);
      const { proveedores_distintos, proveedor_id, total_ordenes } = validacion.rows[0];

      if (parseInt(proveedores_distintos) > 1) {
        await client.query('ROLLBACK');
        throw new Error('Las órdenes seleccionadas pertenecen a diferentes proveedores');
      }

      if (parseInt(total_ordenes) !== ordenesIds.length) {
        await client.query('ROLLBACK');
        throw new Error('Algunas órdenes no existen, ya están agrupadas o no están en estado válido');
      }

      // Crear grupo usando la misma estructura que el sistema manual
      const grupoResult = await client.query(
        `INSERT INTO ordenes_grupos (
          proveedorid,
          admin_creador_id,
          tenant_id,
          estatus,
          nombre_grupo,
          notas
        ) VALUES ($1, $2, $3, 'borrador', $4, $5)
        RETURNING grupoid`,
        [
          proveedor_id,
          adminCreadorId,
          tenantId,
          `Grupo Optimizado - ${new Date().toLocaleDateString('es-MX')}`,
          'Grupo creado automáticamente por optimización de compras'
        ]
      );

      const grupoId = grupoResult.rows[0].grupoid;

      // Actualizar órdenes para asignarles el grupo_id (mantiene separación individual)
      const updateResult = await client.query(
        `UPDATE ordenesdecompra 
         SET grupo_id = $1
         WHERE ordencompraid = ANY($2::int[])
           AND tenant_id = $3
         RETURNING ordencompraid`,
        [grupoId, ordenesIds, tenantId]
      );

      await client.query('COMMIT');

      console.log(`✅ [OptimizationService] Grupo consolidado creado: ${grupoId} con ${updateResult.rowCount} órdenes`);
      console.log(`   📋 Órdenes agrupadas: ${ordenesIds.join(', ')}`);
      console.log(`   🏢 Proveedor ID: ${proveedor_id}`);

      return {
        grupoId,
        ordenesAgrupadas: updateResult.rowCount,
        proveedorId: proveedor_id
      };

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ [OptimizationService] Error creando grupo consolidado:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  calculateSavingsMetrics(oportunidad) {
    const {
      totalSolicitado,
      totalSeparado,
      totalAgrupado,
      packSize,
      numOrdenes
    } = oportunidad;

    const paquetesSeparados = Math.ceil(totalSeparado / packSize);
    const paquetesAgrupados = Math.ceil(totalAgrupado / packSize);
    const ahorroEnPaquetes = paquetesSeparados - paquetesAgrupados;

    return {
      piezasSolicitadas: totalSolicitado,
      piezasComprarSeparado: totalSeparado,
      piezasComprarAgrupado: totalAgrupado,
      ahorroPiezas: totalSeparado - totalAgrupado,
      paquetesSeparados,
      paquetesAgrupados,
      ahorroEnPaquetes,
      porcentajeAhorro: ((totalSeparado - totalAgrupado) / totalSeparado * 100).toFixed(2),
      ordenesInvolucradas: numOrdenes
    };
  }
}

module.exports = new OptimizationService();
