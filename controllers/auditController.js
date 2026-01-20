const inventoryAuditService = require('../services/inventoryAuditService');
const db = require('../db');

const crearSesionAuditoria = async (req, res) => {
  try {
    const { nombre } = req.body;
    const { tenant_id } = req.tenant;
    const adminId = req.user.adminId;

    if (!nombre || nombre.trim() === '') {
      return res.status(400).json({ error: 'El nombre de la sesión es requerido' });
    }

    const sesion = await inventoryAuditService.crearSesionAuditoria(
      nombre.trim(),
      adminId,
      tenant_id
    );

    res.status(201).json({
      mensaje: 'Sesión de auditoría creada exitosamente',
      sesion
    });
  } catch (error) {
    console.error('Error al crear sesión de auditoría:', error);
    res.status(500).json({ error: 'Error al crear sesión de auditoría' });
  }
};

const obtenerSesionesAuditoria = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;
    const limit = parseInt(req.query.limit) || 50;

    const sesiones = await inventoryAuditService.obtenerSesionesAuditoria(tenant_id, limit);

    res.json({ sesiones });
  } catch (error) {
    console.error('Error al obtener sesiones de auditoría:', error);
    res.status(500).json({ error: 'Error al obtener sesiones de auditoría' });
  }
};

const obtenerSesionDetalle = async (req, res) => {
  try {
    const { sesionId } = req.params;
    const { tenant_id } = req.tenant;
    const adminId = req.user.adminId;

    const client = await db.pool.connect();
    try {
      const sesionResult = await client.query(
        `SELECT s.*, a.nombre as usuario_creador_nombre
         FROM toma_inventario_sesiones s
         LEFT JOIN administradores a ON s.usuario_creador_id = a.adminid
         WHERE s.sesionid = $1 AND s.tenant_id = $2`,
        [sesionId, tenant_id]
      );

      if (!sesionResult.rows[0]) {
        return res.status(404).json({ error: 'Sesión no encontrada' });
      }

      const conteos = await inventoryAuditService.obtenerConteosConReconciliacion(
        sesionId,
        adminId,
        tenant_id
      );

      res.json({
        sesion: sesionResult.rows[0],
        conteos
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error al obtener detalle de sesión:', error);
    res.status(500).json({ error: 'Error al obtener detalle de sesión' });
  }
};

const registrarConteo = async (req, res) => {
  try {
    const { sesionId } = req.params;
    const { sku, cantidadFisica, comentario } = req.body;
    const { tenant_id } = req.tenant;
    const adminId = req.user.adminId;

    if (!sku || cantidadFisica === undefined || cantidadFisica === null) {
      return res.status(400).json({ error: 'SKU y cantidad física son requeridos' });
    }

    if (cantidadFisica < 0) {
      return res.status(400).json({ error: 'La cantidad física no puede ser negativa' });
    }

    const client = await db.pool.connect();
    try {
      const varianteResult = await client.query(
        `SELECT varianteid FROM producto_variantes 
         WHERE UPPER(sku) = UPPER($1) AND tenant_id = $2`,
        [sku.trim(), tenant_id]
      );

      if (!varianteResult.rows[0]) {
        return res.status(404).json({ error: `SKU "${sku}" no encontrado` });
      }

      const varianteId = varianteResult.rows[0].varianteid;

      const conteo = await inventoryAuditService.registrarConteo(
        sesionId,
        varianteId,
        parseInt(cantidadFisica),
        adminId,
        tenant_id,
        comentario
      );

      const stockTeorico = await inventoryAuditService.calcularStockTeorico(
        varianteId,
        adminId,
        tenant_id
      );

      res.json({
        mensaje: 'Conteo registrado exitosamente',
        conteo,
        stockTeorico: stockTeorico.stockTeorico,
        diferencia: parseInt(cantidadFisica) - stockTeorico.stockTeorico
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error al registrar conteo:', error);
    res.status(500).json({ error: error.message || 'Error al registrar conteo' });
  }
};

const obtenerStockTeorico = async (req, res) => {
  try {
    const { sku } = req.params;
    const { tenant_id } = req.tenant;
    const adminId = req.user.adminId;
    const { fechaInicio, fechaFin } = req.query;

    const client = await db.pool.connect();
    try {
      const varianteResult = await client.query(
        `SELECT pv.varianteid, pv.sku, p.nombre as producto_nombre, pv.dimensiones
         FROM producto_variantes pv
         INNER JOIN productos p ON pv.productoid = p.productoid
         WHERE UPPER(pv.sku) = UPPER($1) AND pv.tenant_id = $2`,
        [sku.trim(), tenant_id]
      );

      if (!varianteResult.rows[0]) {
        return res.status(404).json({ error: `SKU "${sku}" no encontrado` });
      }

      const variante = varianteResult.rows[0];

      const stockTeorico = await inventoryAuditService.calcularStockTeorico(
        variante.varianteid,
        adminId,
        tenant_id,
        fechaInicio || null,
        fechaFin || null
      );

      res.json({
        sku: variante.sku,
        productoNombre: variante.producto_nombre,
        dimensiones: variante.dimensiones,
        ...stockTeorico
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error al obtener stock teórico:', error);
    res.status(500).json({ error: 'Error al obtener stock teórico' });
  }
};

const obtenerReconciliacion = async (req, res) => {
  try {
    const { sesionId } = req.params;
    const { tenant_id } = req.tenant;
    const adminId = req.user.adminId;

    const conteos = await inventoryAuditService.obtenerConteosConReconciliacion(
      sesionId,
      adminId,
      tenant_id
    );

    const resumen = {
      totalProductos: conteos.length,
      totalConciliados: conteos.filter(c => c.diferencia === 0).length,
      totalConDiferencia: conteos.filter(c => c.diferencia !== 0).length,
      impactoEconomicoTotal: conteos.reduce((sum, c) => sum + c.impactoEconomico, 0),
      porSemaforo: {
        verde: conteos.filter(c => c.semaforo === 'verde').length,
        amarillo: conteos.filter(c => c.semaforo === 'amarillo').length,
        rojo: conteos.filter(c => c.semaforo === 'rojo').length
      },
      requierenComentario: conteos.filter(c => c.requiereComentario).length
    };

    res.json({
      conteos,
      resumen
    });
  } catch (error) {
    console.error('Error al obtener reconciliación:', error);
    res.status(500).json({ error: 'Error al obtener reconciliación' });
  }
};

const agregarComentario = async (req, res) => {
  try {
    const { conteoId } = req.params;
    const { comentario } = req.body;
    const { tenant_id } = req.tenant;
    const adminId = req.user.adminId;

    if (!comentario || comentario.trim() === '') {
      return res.status(400).json({ error: 'El comentario es requerido' });
    }

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      const conteoResult = await client.query(
        `SELECT sesionid FROM toma_inventario_conteos 
         WHERE conteoid = $1 AND tenant_id = $2`,
        [conteoId, tenant_id]
      );

      if (!conteoResult.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Conteo no encontrado' });
      }

      await client.query(
        `INSERT INTO auditoria_comentarios (conteo_id, comentario, usuario_id, tenant_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (conteo_id) DO UPDATE SET comentario = $2, usuario_id = $3, fecha_creacion = CURRENT_TIMESTAMP`,
        [conteoId, comentario.trim(), adminId, tenant_id]
      );

      await client.query('COMMIT');

      res.json({ mensaje: 'Comentario agregado exitosamente' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error al agregar comentario:', error);
    res.status(500).json({ error: 'Error al agregar comentario' });
  }
};

const cerrarYSincronizarAuditoria = async (req, res) => {
  try {
    const { sesionId } = req.params;
    const { tenant_id } = req.tenant;
    const adminId = req.user.adminId;

    const userRoles = req.user.roles || [];
    const isSuperAdmin = userRoles.includes('super_admin');

    if (!isSuperAdmin) {
      return res.status(403).json({ 
        error: 'Solo Super Admins pueden cerrar y sincronizar auditorías' 
      });
    }

    const resultado = await inventoryAuditService.cerrarYSincronizarAuditoria(
      sesionId,
      adminId,
      tenant_id,
      adminId
    );

    res.json({
      mensaje: 'Auditoría cerrada y sincronizada exitosamente',
      ...resultado
    });
  } catch (error) {
    console.error('Error al cerrar y sincronizar auditoría:', error);
    res.status(500).json({ error: error.message || 'Error al cerrar y sincronizar auditoría' });
  }
};

const generarReporteAuditoria = async (req, res) => {
  try {
    const { sesionId } = req.params;
    const { tenant_id } = req.tenant;
    const adminId = req.user.adminId;

    const reporte = await inventoryAuditService.generarReporteAuditoria(
      sesionId,
      adminId,
      tenant_id
    );

    res.json(reporte);
  } catch (error) {
    console.error('Error al generar reporte:', error);
    res.status(500).json({ error: error.message || 'Error al generar reporte' });
  }
};

const calcularStockTeoricoMasivo = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;
    const adminId = req.user.adminId;
    const { fechaInicio, fechaFin } = req.query;

    const resultados = await inventoryAuditService.calcularStockTeoricoMasivo(
      adminId,
      tenant_id,
      fechaInicio || null,
      fechaFin || null
    );

    res.json({ productos: resultados });
  } catch (error) {
    console.error('Error al calcular stock teórico masivo:', error);
    res.status(500).json({ error: 'Error al calcular stock teórico masivo' });
  }
};

module.exports = {
  crearSesionAuditoria,
  obtenerSesionesAuditoria,
  obtenerSesionDetalle,
  registrarConteo,
  obtenerStockTeorico,
  obtenerReconciliacion,
  agregarComentario,
  cerrarYSincronizarAuditoria,
  generarReporteAuditoria,
  calcularStockTeoricoMasivo
};
