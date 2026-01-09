const db = require('../db');

/**
 * Servicio centralizado de auditoría con capacidad de diff tracking
 * Registra todos los cambios en log_movimientos con detalle completo
 */

/**
 * Compara dos objetos y retorna solo los campos que cambiaron
 * @param {Object} datosAnteriores - Estado anterior del registro
 * @param {Object} datosNuevos - Estado nuevo del registro
 * @returns {Object} Objeto con los campos que cambiaron en formato { campo: { antes: valor, ahora: valor } }
 */
function generarDiff(datosAnteriores, datosNuevos) {
  const cambios = {};
  
  // Obtener todas las claves únicas de ambos objetos
  const todasLasClaves = new Set([
    ...Object.keys(datosAnteriores || {}),
    ...Object.keys(datosNuevos || {})
  ]);

  for (const clave of todasLasClaves) {
    const valorAnterior = datosAnteriores?.[clave];
    const valorNuevo = datosNuevos?.[clave];

    // Comparación profunda para detectar cambios
    if (JSON.stringify(valorAnterior) !== JSON.stringify(valorNuevo)) {
      cambios[clave] = {
        antes: valorAnterior !== undefined ? valorAnterior : null,
        ahora: valorNuevo !== undefined ? valorNuevo : null
      };
    }
  }

  return cambios;
}

/**
 * Registra una acción en la bitácora de movimientos
 * @param {Object} params - Parámetros de la auditoría
 * @param {number} params.usuarioId - ID del usuario que realiza la acción
 * @param {string} params.nombreUsuario - Nombre del usuario
 * @param {string} params.rol - Rol del usuario (admin, agente, etc.)
 * @param {string} params.accion - Tipo de acción: CREAR, EDITAR, ELIMINAR, LOGIN, OTRO
 * @param {string} params.entidad - Nombre de la entidad afectada (Producto, Variante, etc.)
 * @param {number} params.entidadId - ID del registro afectado
 * @param {Object} params.detalles - Objeto JSON con información adicional
 * @param {string} params.ip - Dirección IP del usuario
 * @param {number} params.tenantId - ID del tenant
 * @returns {Promise<Object>} Registro de log creado
 */
async function registrarBitacora({
  usuarioId,
  nombreUsuario,
  rol,
  accion,
  entidad,
  entidadId,
  detalles,
  ip,
  tenantId
}) {
  try {
    // Validar acción permitida
    const accionesPermitidas = ['CREAR', 'EDITAR', 'ELIMINAR', 'LOGIN', 'OTRO'];
    if (!accionesPermitidas.includes(accion)) {
      throw new Error(`Acción inválida: ${accion}. Debe ser una de: ${accionesPermitidas.join(', ')}`);
    }

    const query = `
      INSERT INTO log_movimientos (
        usuarioid,
        nombreusuario,
        rol,
        accion,
        entidad,
        entidadid,
        detalles,
        ip,
        tenant_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const values = [
      usuarioId || null,
      nombreUsuario,
      rol || 'sistema',
      accion,
      entidad,
      entidadId || null,
      JSON.stringify(detalles || {}),
      ip || null,
      tenantId || 1
    ];

    const result = await db.query(query, values);
    return result.rows[0];
  } catch (error) {
    console.error('Error al registrar en bitácora:', error);
    // No lanzar error para no interrumpir la operación principal
    // Solo registrar el error en consola
    return null;
  }
}

/**
 * Registra la creación de un registro
 * @param {Object} params - Parámetros de auditoría
 * @param {Object} params.datos - Datos del registro creado
 * @returns {Promise<Object>} Log creado
 */
async function registrarCreacion({
  usuarioId,
  nombreUsuario,
  rol,
  entidad,
  entidadId,
  datos,
  ip,
  tenantId
}) {
  return registrarBitacora({
    usuarioId,
    nombreUsuario,
    rol,
    accion: 'CREAR',
    entidad,
    entidadId,
    detalles: {
      tipo: 'creacion',
      datos: datos
    },
    ip,
    tenantId
  });
}

/**
 * Registra la actualización de un registro con diff tracking
 * @param {Object} params - Parámetros de auditoría
 * @param {Object} params.datosAnteriores - Estado anterior del registro
 * @param {Object} params.datosNuevos - Estado nuevo del registro
 * @returns {Promise<Object>} Log creado
 */
async function registrarActualizacion({
  usuarioId,
  nombreUsuario,
  rol,
  entidad,
  entidadId,
  datosAnteriores,
  datosNuevos,
  ip,
  tenantId
}) {
  const cambios = generarDiff(datosAnteriores, datosNuevos);
  
  // Solo registrar si hubo cambios reales
  if (Object.keys(cambios).length === 0) {
    console.log('No se detectaron cambios, omitiendo log de auditoría');
    return null;
  }

  return registrarBitacora({
    usuarioId,
    nombreUsuario,
    rol,
    accion: 'EDITAR',
    entidad,
    entidadId,
    detalles: {
      tipo: 'actualizacion',
      cambios: cambios,
      resumen: `${Object.keys(cambios).length} campo(s) modificado(s): ${Object.keys(cambios).join(', ')}`
    },
    ip,
    tenantId
  });
}

/**
 * Registra la eliminación de un registro (snapshot completo)
 * @param {Object} params - Parámetros de auditoría
 * @param {Object} params.datosEliminados - Snapshot completo del registro eliminado
 * @returns {Promise<Object>} Log creado
 */
async function registrarEliminacion({
  usuarioId,
  nombreUsuario,
  rol,
  entidad,
  entidadId,
  datosEliminados,
  ip,
  tenantId
}) {
  return registrarBitacora({
    usuarioId,
    nombreUsuario,
    rol,
    accion: 'ELIMINAR',
    entidad,
    entidadId,
    detalles: {
      tipo: 'eliminacion',
      snapshot: datosEliminados,
      mensaje: 'Registro eliminado - snapshot completo guardado'
    },
    ip,
    tenantId
  });
}

/**
 * Obtiene el estado actual de un producto desde la base de datos
 * @param {number} productoId - ID del producto
 * @param {number} tenantId - ID del tenant
 * @returns {Promise<Object>} Datos actuales del producto
 */
async function obtenerEstadoProducto(productoId, tenantId) {
  const query = `
    SELECT 
      p.*,
      c.nombre as categoria_nombre,
      pre.tipoproductoid,
      tp.nombre as tipo_producto_nombre
    FROM productos p
    LEFT JOIN categorias c ON c.categoriaid = p.categoriaid
    LEFT JOIN proveedor_reglas_empaque pre ON pre.reglaid = p.reglaid
    LEFT JOIN tipoproducto tp ON tp.tipoproductoid = pre.tipoproductoid
    WHERE p.productoid = $1 AND p.tenant_id = $2
  `;
  
  const result = await db.query(query, [productoId, tenantId]);
  return result.rows[0] || null;
}

/**
 * Obtiene el estado actual de una variante desde la base de datos
 * @param {number} varianteId - ID de la variante
 * @returns {Promise<Object>} Datos actuales de la variante
 */
async function obtenerEstadoVariante(varianteId) {
  const query = `
    SELECT 
      pv.*,
      p.nombreproducto,
      p.sku_maestro
    FROM producto_variantes pv
    INNER JOIN productos p ON p.productoid = pv.productoid
    WHERE pv.varianteid = $1
  `;
  
  const result = await db.query(query, [varianteId]);
  return result.rows[0] || null;
}

/**
 * Registra múltiples operaciones en una transacción (útil para operaciones batch)
 * @param {Array} operaciones - Array de operaciones a registrar
 * @returns {Promise<Array>} Array de logs creados
 */
async function registrarOperacionesBatch(operaciones) {
  const logs = [];
  
  for (const operacion of operaciones) {
    let log = null;
    
    switch (operacion.tipo) {
      case 'CREAR':
        log = await registrarCreacion(operacion);
        break;
      case 'EDITAR':
        log = await registrarActualizacion(operacion);
        break;
      case 'ELIMINAR':
        log = await registrarEliminacion(operacion);
        break;
      default:
        log = await registrarBitacora(operacion);
    }
    
    if (log) {
      logs.push(log);
    }
  }
  
  return logs;
}

module.exports = {
  registrarBitacora,
  registrarCreacion,
  registrarActualizacion,
  registrarEliminacion,
  generarDiff,
  obtenerEstadoProducto,
  obtenerEstadoVariante,
  registrarOperacionesBatch
};
