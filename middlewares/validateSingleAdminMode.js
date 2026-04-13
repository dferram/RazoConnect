/**
 * Middleware: Validar Modo Admin Único
 *
 * Verifica que el tenant NO tenga usuarios con rol "finanzas"
 * Si existe ese rol, bloquea el acceso a endpoints de admin único
 *
 * @module middlewares/validateSingleAdminMode
 * @author RazoConnect Team
 * @date 2026-04-13
 */

const db = require('../db');
const logger = require('../utils/logger');

/**
 * Middleware que valida si el sistema está en modo Admin Único
 * Bloquea endpoints diseñados para admin único si existe rol "finanzas"
 *
 * Uso en rutas:
 * router.post('/ruta', authenticate, validateSingleAdminMode, controller)
 */
async function validateSingleAdminMode(req, res, next) {
  try {
    const { tenant_id } = req.tenant;

    if (!tenant_id) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID no encontrado en request'
      });
    }

    // Verificar si existen usuarios con rol "finanzas" en el tenant
    const result = await db.query(
      `SELECT COUNT(*) as count
       FROM administradores
       WHERE tenant_id = $1 AND rol = 'finanzas'`,
      [tenant_id]
    );

    const existeRolFinanzas = result.rows[0]?.count > 0;

    logger.info('🔍 [ValidarSingleAdminMode] Verificando modo del sistema:', {
      tenant_id,
      tieneRolFinanzas: existeRolFinanzas,
      modo: existeRolFinanzas ? 'Empresarial' : 'Admin Único'
    });

    if (existeRolFinanzas) {
      // ❌ Existe rol finanzas → Sistema en modo EMPRESARIAL
      logger.warn('⚠️ [ValidarSingleAdminMode] Intento de usar endpoint de admin único en modo empresarial:', {
        tenant_id,
        usuario: req.user?.id || req.user?.adminid,
        url: req.path
      });

      return res.status(403).json({
        success: false,
        message: 'Este endpoint solo está disponible en modo Admin Único.',
        detalle: 'Tu sistema tiene roles empresariales configurados (finanzas, inventarios separados). Usa el flujo de 3 pasos: Marcar → Confirmar → Facturar.',
        modo_actual: 'Empresarial'
      });
    }

    // ✅ No existe rol finanzas → Sistema en modo ADMIN ÚNICO
    logger.info('✅ [ValidarSingleAdminMode] Sistema en modo Admin Único - Permitiendo acceso:', {
      tenant_id,
      usuario: req.user?.id || req.user?.adminid
    });

    next();

  } catch (error) {
    logger.error('❌ Error en validateSingleAdminMode:', {
      error: error.message,
      stack: error.stack,
      tenant_id: req.tenant?.tenant_id
    });

    res.status(500).json({
      success: false,
      message: 'Error validando modo del sistema',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

module.exports = validateSingleAdminMode;
