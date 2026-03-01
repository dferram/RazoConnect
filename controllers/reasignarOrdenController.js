const db = require("../db");
const logger = require('../utils/logger');

/**
 * Reasignar orden de compra a otro administrador
 * PATCH /api/admin/ordenes-compra/:id/reasignar
 * Solo accesible para SuperAdmin
 */
const reasignarOrdenCompra = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const { id } = req.params;
    const { nuevoAdminId } = req.body;
    const userRole = req.user.rol;
    const { tenant_id } = req.tenant;

    // VALIDACIÓN 1: Solo super admin puede reasignar
    if (userRole !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: "Solo los super administradores pueden reasignar órdenes de compra"
      });
    }

    // VALIDACIÓN 2: Verificar que se proporcionó el nuevo admin
    if (!nuevoAdminId) {
      return res.status(400).json({
        success: false,
        message: "Debe proporcionar el ID del nuevo administrador"
      });
    }

    await client.query("BEGIN");

    // VALIDACIÓN 3: Verificar que la orden existe y obtener su estado
    const ordenCheck = await client.query(
      `SELECT 
        oc.OrdenCompraID,
        oc.Estatus,
        oc.admin_creador_id,
        a.nombre as AdminActual,
        COALESCE(SUM(doc.CantidadRecibida), 0) as TotalRecibido
       FROM OrdenesDeCompra oc
       LEFT JOIN DetallesOrdenCompra doc ON oc.OrdenCompraID = doc.OrdenCompraID
       LEFT JOIN Administradores a ON oc.admin_creador_id = a.adminid
       WHERE oc.OrdenCompraID = $1 AND oc.tenant_id = $2
       GROUP BY oc.OrdenCompraID, oc.Estatus, oc.admin_creador_id, a.nombre`,
      [id, tenant_id]
    );

    if (ordenCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Orden de compra no encontrada"
      });
    }

    const orden = ordenCheck.rows[0];

    // VALIDACIÓN 4: No permitir reasignación si ya se está recibiendo inventario
    if (parseInt(orden.totalrecibido) > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "No se puede reasignar esta orden porque ya se ha comenzado a recibir inventario. Las recepciones parciales o completas no pueden ser reasignadas.",
        detalles: {
          totalRecibido: parseInt(orden.totalrecibido),
          estatus: orden.estatus
        }
      });
    }

    // VALIDACIÓN 5: Verificar que el nuevo admin existe
    const nuevoAdminCheck = await client.query(
      `SELECT AdminID, nombre, rol 
       FROM Administradores 
       WHERE AdminID = $1 AND tenant_id = $2`,
      [nuevoAdminId, tenant_id]
    );

    if (nuevoAdminCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "El administrador destino no existe"
      });
    }

    const nuevoAdmin = nuevoAdminCheck.rows[0];

    // VALIDACIÓN 6: Verificar que no sea el mismo admin
    if (parseInt(orden.admin_creador_id) === parseInt(nuevoAdminId)) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "La orden ya está asignada a este administrador"
      });
    }

    // EJECUTAR REASIGNACIÓN
    await client.query(
      `UPDATE OrdenesDeCompra 
       SET admin_creador_id = $1 
       WHERE OrdenCompraID = $2 AND tenant_id = $3`,
      [nuevoAdminId, id, tenant_id]
    );

    // REGISTRAR EN LOG (opcional - para auditoría)
    await client.query(
      `INSERT INTO Log_Inventario 
       (VarianteID, CantidadCambiado, NuevoStock, Motivo, UsuarioID, tenant_id)
       VALUES (NULL, 0, 0, $1, $2, $3)`,
      [
        `REASIGNACIÓN OC #${id}: ${orden.adminactual || 'Sin asignar'} → ${nuevoAdmin.nombre}`,
        req.user.id,
        tenant_id
      ]
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      message: `Orden de compra #${id} reasignada exitosamente`,
      data: {
        ordenCompraId: parseInt(id),
        adminAnterior: {
          id: orden.admin_creador_id,
          nombre: orden.adminactual || 'Sin asignar'
        },
        adminNuevo: {
          id: parseInt(nuevoAdminId),
          nombre: nuevoAdmin.nombre,
          rol: nuevoAdmin.rol
        }
      }
    });

  } catch (error) {
    await client.query("ROLLBACK");
    logger.error('Error al reasignar orden de compra:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error al reasignar orden de compra"
    });
  } finally {
    client.release();
  }
};

module.exports = {
  reasignarOrdenCompra
};
