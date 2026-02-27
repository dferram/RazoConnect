/**
 * SESIONES RECEPCIÓN CONTROLLER
 * 
 * Controlador especializado para gestión de sesiones de recepción de inventario.
 * Implementa control de concurrencia para evitar conflictos cuando múltiples
 * administradores trabajan simultáneamente en la misma orden de compra.
 * 
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/sesionesRecepcionController
 * @author RazoConnect Team
 * @date 2026-02-27
 */

const db = require('../db');

/**
 * Bloquear sesión de recepción de orden de compra
 * POST /api/admin/ordenes-compra/:id/bloquear-sesion
 */
const bloquearSesionRecepcion = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;
    const userId = req.user?.id || req.user?.adminId;
    const ordenCompraId = parseInt(req.params.id, 10);

    if (!Number.isInteger(ordenCompraId) || ordenCompraId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'ID de orden de compra inválido'
      });
    }

    // Verificar si ya está bloqueada
    const checkQuery = `
      SELECT admin_trabajando_id, fecha_bloqueo, ultima_actividad,
             (SELECT nombre FROM administradores WHERE adminid = admin_trabajando_id) as admin_nombre
      FROM ordenesdecompra
      WHERE ordencompraid = $1 AND tenant_id = $2
    `;
    const checkResult = await db.query(checkQuery, [ordenCompraId, tenant_id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Orden de compra no encontrada'
      });
    }

    const orden = checkResult.rows[0];

    // Si ya está bloqueada por otro admin
    if (orden.admin_trabajando_id && orden.admin_trabajando_id !== userId) {
      return res.status(423).json({
        success: false,
        message: `Esta orden está siendo editada por ${orden.admin_nombre || 'otro administrador'}`,
        data: {
          bloqueadoPor: orden.admin_nombre,
          fechaBloqueo: orden.fecha_bloqueo,
          ultimaActividad: orden.ultima_actividad
        }
      });
    }

    // Bloquear la sesión
    const lockQuery = `
      UPDATE ordenesdecompra
      SET admin_trabajando_id = $1,
          fecha_bloqueo = CURRENT_TIMESTAMP,
          ultima_actividad = CURRENT_TIMESTAMP
      WHERE ordencompraid = $2 AND tenant_id = $3
      RETURNING admin_trabajando_id, fecha_bloqueo
    `;
    const lockResult = await db.query(lockQuery, [userId, ordenCompraId, tenant_id]);

    res.json({
      success: true,
      message: 'Sesión bloqueada exitosamente',
      data: {
        bloqueadoPor: userId,
        fechaBloqueo: lockResult.rows[0].fecha_bloqueo
      }
    });
  } catch (error) {
    console.error('Error al bloquear sesión:', error);
    res.status(500).json({
      success: false,
      message: 'Error al bloquear sesión de recepción'
    });
  }
};

/**
 * Desbloquear sesión de recepción
 * POST /api/admin/ordenes-compra/:id/desbloquear-sesion
 */
const desbloquearSesionRecepcion = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;
    const userId = req.user?.id || req.user?.adminId;
    const ordenCompraId = parseInt(req.params.id, 10);

    if (!Number.isInteger(ordenCompraId) || ordenCompraId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'ID de orden de compra inválido'
      });
    }

    const unlockQuery = `
      UPDATE ordenesdecompra
      SET admin_trabajando_id = NULL,
          fecha_bloqueo = NULL,
          ultima_actividad = NULL
      WHERE ordencompraid = $1 AND tenant_id = $2 AND admin_trabajando_id = $3
      RETURNING ordencompraid
    `;
    const result = await db.query(unlockQuery, [ordenCompraId, tenant_id, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No se pudo desbloquear la sesión (no existe o no eres el propietario)'
      });
    }

    res.json({
      success: true,
      message: 'Sesión desbloqueada exitosamente'
    });
  } catch (error) {
    console.error('Error al desbloquear sesión:', error);
    res.status(500).json({
      success: false,
      message: 'Error al desbloquear sesión'
    });
  }
};

/**
 * Verificar estado de bloqueo de sesión
 * GET /api/admin/ordenes-compra/:id/verificar-bloqueo
 */
const verificarBloqueoSesion = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;
    const userId = req.user?.id || req.user?.adminId;
    const ordenCompraId = parseInt(req.params.id, 10);

    if (!Number.isInteger(ordenCompraId) || ordenCompraId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'ID de orden de compra inválido'
      });
    }

    const query = `
      SELECT admin_trabajando_id, fecha_bloqueo, ultima_actividad,
             (SELECT nombre FROM administradores WHERE adminid = admin_trabajando_id) as admin_nombre,
             (SELECT rol FROM administradores WHERE adminid = admin_trabajando_id) as admin_rol
      FROM ordenesdecompra
      WHERE ordencompraid = $1 AND tenant_id = $2
    `;
    const result = await db.query(query, [ordenCompraId, tenant_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Orden de compra no encontrada'
      });
    }

    const orden = result.rows[0];
    const bloqueada = !!orden.admin_trabajando_id;
    const esPropietario = orden.admin_trabajando_id === userId;

    res.json({
      success: true,
      data: {
        bloqueada,
        bloqueadoPor: orden.admin_trabajando_id,
        nombreAdmin: orden.admin_nombre,
        rolAdmin: orden.admin_rol,
        fechaBloqueo: orden.fecha_bloqueo,
        ultimaActividad: orden.ultima_actividad,
        esPropietario,
        puedeEditar: !bloqueada || esPropietario
      }
    });
  } catch (error) {
    console.error('Error al verificar bloqueo:', error);
    res.status(500).json({
      success: false,
      message: 'Error al verificar estado de bloqueo'
    });
  }
};

/**
 * Reasignar sesión a otro admin (solo super admin)
 * POST /api/admin/ordenes-compra/:id/reasignar-sesion
 * Body: { nuevoAdminId }
 */
const reasignarSesion = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;
    const userRole = req.user?.rol || req.user?.roles?.[0];
    const ordenCompraId = parseInt(req.params.id, 10);
    const { nuevoAdminId } = req.body;

    // Solo super admin puede reasignar sesiones
    if (userRole !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Solo los super administradores pueden reasignar sesiones'
      });
    }

    if (!Number.isInteger(ordenCompraId) || ordenCompraId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'ID de orden de compra inválido'
      });
    }

    if (!Number.isInteger(nuevoAdminId) || nuevoAdminId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'ID de administrador inválido'
      });
    }

    // Verificar que el nuevo admin existe
    const adminCheck = await db.query(
      'SELECT adminid, nombre FROM administradores WHERE adminid = $1 AND tenant_id = $2',
      [nuevoAdminId, tenant_id]
    );

    if (adminCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Administrador no encontrado'
      });
    }

    // Reasignar la sesión
    const updateQuery = `
      UPDATE ordenesdecompra
      SET admin_trabajando_id = $1,
          fecha_bloqueo = CURRENT_TIMESTAMP,
          ultima_actividad = CURRENT_TIMESTAMP
      WHERE ordencompraid = $2 AND tenant_id = $3
      RETURNING ordencompraid
    `;
    const result = await db.query(updateQuery, [nuevoAdminId, ordenCompraId, tenant_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Orden de compra no encontrada'
      });
    }

    // Crear notificación para el admin asignado
    try {
      await db.query(
        `INSERT INTO notificaciones (
          administrador_id, tipo, titulo, mensaje, leida, 
          prioridad, url, metadata, tenant_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          nuevoAdminId,
          'sistema',
          'Sesión de Recepción Asignada',
          `Se te ha asignado la sesión de recepción de la Orden de Compra #${ordenCompraId}. Puedes continuar trabajando en ella.`,
          false,
          'alta',
          '/admin-recibir-inventario.html',
          JSON.stringify({ ordenCompraId, tipo: 'reasignacion_sesion' }),
          tenant_id
        ]
      );
      console.log(`✅ Notificación creada para admin ${nuevoAdminId} sobre reasignación de OC #${ordenCompraId}`);
    } catch (notifError) {
      console.error('Error creando notificación de reasignación:', notifError);
    }

    res.json({
      success: true,
      message: `Sesión reasignada a ${adminCheck.rows[0].nombre}`,
      data: {
        nuevoAdminId,
        nuevoAdminNombre: adminCheck.rows[0].nombre
      }
    });
  } catch (error) {
    console.error('Error al reasignar sesión:', error);
    res.status(500).json({
      success: false,
      message: 'Error al reasignar sesión'
    });
  }
};

/**
 * Forzar liberación de sesión (solo super admin)
 * POST /api/admin/ordenes-compra/:id/forzar-liberacion
 */
const forzarLiberacionSesion = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;
    const userRole = req.user?.rol || req.user?.roles?.[0];
    const ordenCompraId = parseInt(req.params.id, 10);

    // Solo super admin puede forzar liberación
    if (userRole !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Solo los super administradores pueden forzar la liberación de sesiones'
      });
    }

    if (!Number.isInteger(ordenCompraId) || ordenCompraId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'ID de orden de compra inválido'
      });
    }

    const unlockQuery = `
      UPDATE ordenesdecompra
      SET admin_trabajando_id = NULL,
          fecha_bloqueo = NULL,
          ultima_actividad = NULL
      WHERE ordencompraid = $1 AND tenant_id = $2
      RETURNING ordencompraid, admin_trabajando_id
    `;
    const result = await db.query(unlockQuery, [ordenCompraId, tenant_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Orden de compra no encontrada'
      });
    }

    res.json({
      success: true,
      message: 'Sesión liberada forzosamente por super administrador'
    });
  } catch (error) {
    console.error('Error al forzar liberación:', error);
    res.status(500).json({
      success: false,
      message: 'Error al forzar liberación de sesión'
    });
  }
};

module.exports = {
  bloquearSesionRecepcion,
  desbloquearSesionRecepcion,
  verificarBloqueoSesion,
  reasignarSesion,
  forzarLiberacionSesion
};
