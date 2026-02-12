const { pool } = require('../db');

/**
 * Agrupar múltiples órdenes de compra del mismo proveedor
 * POST /api/admin/ordenes-compra/agrupar
 */
const agruparOrdenes = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { ordenIds, nombreGrupo, notas } = req.body;
    const adminId = req.user.id;
    const { tenant_id } = req.tenant;

    if (!ordenIds || !Array.isArray(ordenIds) || ordenIds.length < 2) {
      return res.status(400).json({
        message: 'Debes seleccionar al menos 2 órdenes para agrupar'
      });
    }

    await client.query('BEGIN');

    const validacionQuery = `
      SELECT 
        COUNT(DISTINCT proveedorid) as proveedores_distintos,
        MIN(proveedorid) as proveedor_id,
        COUNT(*) as total_ordenes,
        ARRAY_AGG(ordencompraid) as ordenes_encontradas
      FROM ordenesdecompra
      WHERE ordencompraid = ANY($1::int[])
        AND tenant_id = $2
        AND estatus IN ('Borrador', 'Pendiente')
        AND grupo_id IS NULL
    `;

    const validacion = await client.query(validacionQuery, [ordenIds, tenant_id]);
    const { proveedores_distintos, proveedor_id, total_ordenes, ordenes_encontradas } = validacion.rows[0];

    if (parseInt(proveedores_distintos) > 1) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'Las órdenes seleccionadas pertenecen a diferentes proveedores. Solo puedes agrupar órdenes del mismo proveedor.'
      });
    }

    if (parseInt(total_ordenes) !== ordenIds.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'Algunas órdenes no existen, ya están agrupadas o no están en estado válido para agrupar'
      });
    }

    const insertGrupoQuery = `
      INSERT INTO ordenes_grupos (
        proveedorid,
        admin_creador_id,
        tenant_id,
        estatus,
        nombre_grupo,
        notas
      ) VALUES ($1, $2, $3, 'borrador', $4, $5)
      RETURNING grupoid, proveedorid, estatus, created_at
    `;

    const grupoResult = await client.query(insertGrupoQuery, [
      proveedor_id,
      adminId,
      tenant_id,
      nombreGrupo || `Grupo ${new Date().toLocaleDateString('es-MX')}`,
      notas || null
    ]);

    const grupo = grupoResult.rows[0];

    const updateOrdenesQuery = `
      UPDATE ordenesdecompra
      SET grupo_id = $1
      WHERE ordencompraid = ANY($2::int[])
        AND tenant_id = $3
      RETURNING ordencompraid
    `;

    const updateResult = await client.query(updateOrdenesQuery, [
      grupo.grupoid,
      ordenIds,
      tenant_id
    ]);

    await client.query('COMMIT');

    console.log(`✅ [GRUPO CREADO] Grupo ID ${grupo.grupoid} con ${updateResult.rowCount} órdenes`);

    res.status(201).json({
      message: 'Grupo de órdenes creado exitosamente',
      grupo: {
        grupoid: grupo.grupoid,
        proveedorid: grupo.proveedorid,
        estatus: grupo.estatus,
        ordenesAgrupadas: updateResult.rowCount,
        created_at: grupo.created_at
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [ERROR] Error al agrupar órdenes:', error);
    res.status(500).json({
      message: 'Error al agrupar órdenes de compra',
      error: error.message
    });
  } finally {
    client.release();
  }
};

/**
 * Obtener detalles de un grupo de órdenes
 * GET /api/admin/ordenes-compra/grupos/:id
 */
const getGrupoDetalle = async (req, res) => {
  try {
    const { id } = req.params;
    const { tenant_id } = req.tenant;

    const grupoQuery = `
      SELECT 
        og.grupoid,
        og.proveedorid,
        og.admin_creador_id,
        og.estatus,
        og.nombre_grupo,
        og.notas,
        og.created_at,
        og.updated_at,
        p.nombreempresa as proveedor_nombre,
        p.contactonombre as proveedor_contacto,
        p.telefono as proveedor_telefono,
        p.email as proveedor_email,
        a.nombre as admin_nombre
      FROM ordenes_grupos og
      LEFT JOIN proveedores p ON og.proveedorid = p.proveedorid
      LEFT JOIN administradores a ON og.admin_creador_id = a.adminid
      WHERE og.grupoid = $1 AND og.tenant_id = $2
    `;

    const grupoResult = await pool.query(grupoQuery, [id, tenant_id]);

    if (grupoResult.rows.length === 0) {
      return res.status(404).json({
        message: 'Grupo no encontrado'
      });
    }

    const grupo = grupoResult.rows[0];

    const ordenesQuery = `
      SELECT 
        oc.ordencompraid,
        oc.fechacreacion,
        oc.fechaentregaesperada,
        oc.estatus as orden_estatus,
        oc.origenoc,
        oc.total,
        oc.usuario_creador_id,
        oc.admin_creador_id,
        a.nombre as admin_creador_nombre,
        au.nombre as usuario_creador_nombre
      FROM ordenesdecompra oc
      LEFT JOIN administradores a ON oc.admin_creador_id = a.adminid
      LEFT JOIN administradores au ON oc.usuario_creador_id = au.adminid
      WHERE oc.grupo_id = $1 AND oc.tenant_id = $2
      ORDER BY oc.fechacreacion ASC
    `;

    const ordenesResult = await pool.query(ordenesQuery, [id, tenant_id]);

    const detallesPromises = ordenesResult.rows.map(async (orden) => {
      const detallesQuery = `
        SELECT 
          doc.detalleoc_id,
          doc.varianteid,
          doc.cantidadsolicitada,
          doc.cantidadrecibida,
          doc.costounitario,
          pv.productoid,
          p.nombre as producto_nombre,
          p.sku,
          p.imagen_url,
          pv.dimensionesfisicas,
          pv.color,
          doc.piezasporpaquete,
          doc.cantidadsolicitada * doc.piezasporpaquete as total_piezas
        FROM detallesordencompra doc
        LEFT JOIN producto_variantes pv ON doc.varianteid = pv.varianteid
        LEFT JOIN productos p ON pv.productoid = p.productoid
        WHERE doc.ordencompraid = $1
        ORDER BY p.nombre ASC
      `;

      const detallesResult = await pool.query(detallesQuery, [orden.ordencompraid]);

      return {
        ...orden,
        detalles: detallesResult.rows
      };
    });

    const ordenesConDetalles = await Promise.all(detallesPromises);

    const totalGeneral = ordenesConDetalles.reduce((sum, orden) => sum + parseFloat(orden.total || 0), 0);
    const totalPaquetes = ordenesConDetalles.reduce((sum, orden) => {
      return sum + orden.detalles.reduce((s, d) => s + parseInt(d.cantidadpaquetes || 0), 0);
    }, 0);
    const totalPiezas = ordenesConDetalles.reduce((sum, orden) => {
      return sum + orden.detalles.reduce((s, d) => {
        return s + (parseInt(d.cantidadpaquetes || 0) * parseInt(d.piezasporpaquete || 1));
      }, 0);
    }, 0);

    res.json({
      grupo: {
        ...grupo,
        totalOrdenes: ordenesConDetalles.length,
        totalGeneral: parseFloat(totalGeneral.toFixed(2)),
        totalPaquetes,
        totalPiezas
      },
      ordenes: ordenesConDetalles
    });

  } catch (error) {
    console.error('❌ [ERROR] Error al obtener grupo:', error);
    res.status(500).json({
      message: 'Error al obtener detalles del grupo',
      error: error.message
    });
  }
};

/**
 * Obtener lista de todos los grupos
 * GET /api/admin/ordenes-compra/grupos
 */
const getAllGrupos = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;
    const { estatus } = req.query;

    let query = `
      SELECT 
        og.grupoid,
        og.proveedorid,
        og.estatus,
        og.nombre_grupo,
        og.created_at,
        p.nombreempresa as proveedor_nombre,
        a.nombre as admin_nombre,
        COUNT(oc.ordencompraid) as total_ordenes,
        COALESCE(SUM(oc.total), 0) as total_general
      FROM ordenes_grupos og
      LEFT JOIN proveedores p ON og.proveedorid = p.proveedorid
      LEFT JOIN administradores a ON og.admin_creador_id = a.adminid
      LEFT JOIN ordenesdecompra oc ON og.grupoid = oc.grupo_id AND oc.tenant_id = $1
      WHERE og.tenant_id = $1
    `;

    const params = [tenant_id];

    if (estatus) {
      query += ` AND og.estatus = $2`;
      params.push(estatus);
    }

    query += `
      GROUP BY og.grupoid, og.proveedorid, og.estatus, og.nombre_grupo, 
               og.created_at, p.nombreempresa, a.nombre
      ORDER BY og.created_at DESC
    `;

    const result = await pool.query(query, params);

    res.json({
      grupos: result.rows.map(g => ({
        ...g,
        total_general: parseFloat(g.total_general || 0)
      }))
    });

  } catch (error) {
    console.error('❌ [ERROR] Error al obtener grupos:', error);
    res.status(500).json({
      message: 'Error al obtener grupos',
      error: error.message
    });
  }
};

/**
 * Desagrupar órdenes (eliminar grupo)
 * DELETE /api/admin/ordenes-compra/grupos/:id
 */
const desagruparOrdenes = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const { tenant_id } = req.tenant;

    await client.query('BEGIN');

    const updateQuery = `
      UPDATE ordenesdecompra
      SET grupo_id = NULL
      WHERE grupo_id = $1 AND tenant_id = $2
      RETURNING ordencompraid
    `;

    const updateResult = await client.query(updateQuery, [id, tenant_id]);

    const deleteQuery = `
      DELETE FROM ordenes_grupos
      WHERE grupoid = $1 AND tenant_id = $2
      RETURNING grupoid
    `;

    const deleteResult = await client.query(deleteQuery, [id, tenant_id]);

    if (deleteResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        message: 'Grupo no encontrado'
      });
    }

    await client.query('COMMIT');

    console.log(`✅ [GRUPO ELIMINADO] Grupo ID ${id} - ${updateResult.rowCount} órdenes liberadas`);

    res.json({
      message: 'Grupo eliminado exitosamente',
      ordenesLiberadas: updateResult.rowCount
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [ERROR] Error al desagrupar:', error);
    res.status(500).json({
      message: 'Error al eliminar grupo',
      error: error.message
    });
  } finally {
    client.release();
  }
};

/**
 * Agregar más órdenes a un grupo existente
 * PUT /api/admin/ordenes-compra/grupos/:id/agregar-ordenes
 */
const agregarOrdenesAGrupo = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const { ordenIds } = req.body;
    const { tenant_id } = req.tenant;

    if (!ordenIds || !Array.isArray(ordenIds) || ordenIds.length === 0) {
      return res.status(400).json({
        message: 'Debes seleccionar al menos 1 orden para agregar'
      });
    }

    await client.query('BEGIN');

    // Verificar que el grupo existe
    const grupoQuery = `
      SELECT grupoid, proveedorid, estatus
      FROM ordenes_grupos
      WHERE grupoid = $1 AND tenant_id = $2
    `;
    const grupoResult = await client.query(grupoQuery, [id, tenant_id]);

    if (grupoResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        message: 'Grupo no encontrado'
      });
    }

    const grupo = grupoResult.rows[0];

    // Validar que las órdenes sean del mismo proveedor y estén disponibles
    const validacionQuery = `
      SELECT 
        COUNT(DISTINCT proveedorid) as proveedores_distintos,
        COUNT(*) as total_ordenes,
        ARRAY_AGG(ordencompraid) as ordenes_encontradas
      FROM ordenesdecompra
      WHERE ordencompraid = ANY($1::int[])
        AND tenant_id = $2
        AND proveedorid = $3
        AND estatus IN ('Borrador', 'Pendiente')
        AND grupo_id IS NULL
    `;

    const validacion = await client.query(validacionQuery, [ordenIds, tenant_id, grupo.proveedorid]);
    const { proveedores_distintos, total_ordenes, ordenes_encontradas } = validacion.rows[0];

    if (parseInt(proveedores_distintos) > 1 || parseInt(total_ordenes) === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'Las órdenes seleccionadas no pertenecen al mismo proveedor del grupo o no están disponibles para agrupar'
      });
    }

    if (parseInt(total_ordenes) !== ordenIds.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'Algunas órdenes no existen, ya están agrupadas o no están en estado válido'
      });
    }

    // Agregar las órdenes al grupo
    const updateQuery = `
      UPDATE ordenesdecompra
      SET grupo_id = $1
      WHERE ordencompraid = ANY($2::int[])
        AND tenant_id = $3
      RETURNING ordencompraid
    `;

    const updateResult = await client.query(updateQuery, [id, ordenIds, tenant_id]);

    await client.query('COMMIT');

    console.log(`✅ [GRUPO ACTUALIZADO] Grupo ID ${id} - ${updateResult.rowCount} órdenes agregadas`);

    res.json({
      message: 'Órdenes agregadas al grupo exitosamente',
      ordenesAgregadas: updateResult.rowCount
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [ERROR] Error al agregar órdenes al grupo:', error);
    res.status(500).json({
      message: 'Error al agregar órdenes al grupo',
      error: error.message
    });
  } finally {
    client.release();
  }
};

/**
 * Obtener productos consolidados del grupo (para PDF de proveedor)
 * GET /api/admin/ordenes-compra/grupos/:id/consolidado
 */
const getGrupoConsolidado = async (req, res) => {
  try {
    const { id } = req.params;
    const { tenant_id } = req.tenant;

    const grupoQuery = `
      SELECT 
        og.grupoid,
        og.nombre_grupo,
        og.created_at,
        p.nombreempresa as proveedor_nombre,
        p.contactonombre as proveedor_contacto,
        p.telefono as proveedor_telefono,
        p.email as proveedor_email
      FROM ordenes_grupos og
      LEFT JOIN proveedores p ON og.proveedorid = p.proveedorid
      WHERE og.grupoid = $1 AND og.tenant_id = $2
    `;

    const grupoResult = await pool.query(grupoQuery, [id, tenant_id]);

    if (grupoResult.rows.length === 0) {
      return res.status(404).json({
        message: 'Grupo no encontrado'
      });
    }

    const grupo = grupoResult.rows[0];

    const productosQuery = `
      SELECT 
        p.productoid,
        p.nombre as producto_nombre,
        p.sku,
        pv.varianteid,
        pv.dimensionesfisicas,
        pv.color,
        doc.piezasporpaquete,
        SUM(doc.cantidadsolicitada) as total_paquetes,
        AVG(doc.costounitario) as costo_promedio,
        SUM(doc.cantidadsolicitada * doc.costounitario) as subtotal_total
      FROM ordenesdecompra oc
      INNER JOIN detallesordencompra doc ON oc.ordencompraid = doc.ordencompraid
      LEFT JOIN producto_variantes pv ON doc.varianteid = pv.varianteid
      LEFT JOIN productos p ON pv.productoid = p.productoid
      WHERE oc.grupo_id = $1 AND oc.tenant_id = $2
      GROUP BY p.productoid, p.nombre, p.sku, pv.varianteid, 
               pv.dimensionesfisicas, pv.color, doc.piezasporpaquete
      ORDER BY p.nombre ASC
    `;

    const productosResult = await pool.query(productosQuery, [id, tenant_id]);

    const productosConsolidados = productosResult.rows.map(prod => ({
      ...prod,
      total_paquetes: parseInt(prod.total_paquetes || 0),
      total_piezas: parseInt(prod.total_paquetes || 0) * parseInt(prod.piezasporpaquete || 1),
      costo_promedio: parseFloat(prod.costo_promedio || 0),
      subtotal_total: parseFloat(prod.subtotal_total || 0)
    }));

    const totalGeneral = productosConsolidados.reduce((sum, p) => sum + p.subtotal_total, 0);
    const totalPaquetes = productosConsolidados.reduce((sum, p) => sum + p.total_paquetes, 0);
    const totalPiezas = productosConsolidados.reduce((sum, p) => sum + p.total_piezas, 0);

    res.json({
      grupo,
      productos: productosConsolidados,
      totales: {
        totalGeneral: parseFloat(totalGeneral.toFixed(2)),
        totalPaquetes,
        totalPiezas
      }
    });

  } catch (error) {
    console.error('❌ [ERROR] Error al obtener consolidado:', error);
    res.status(500).json({
      message: 'Error al obtener productos consolidados',
      error: error.message
    });
  }
};

module.exports = {
  agruparOrdenes,
  getGrupoDetalle,
  getAllGrupos,
  desagruparOrdenes,
  agregarOrdenesAGrupo,
  getGrupoConsolidado
};
