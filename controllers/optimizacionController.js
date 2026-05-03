/**
 * OPTIMIZACIÓN CONTROLLER
 * 
 * Controlador especializado para sugerencias de optimización y creación de grupos consolidados.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/optimizacionController
 * @author RazoConnect Team
 * @date 2026-02-27
 */

const OptimizationService = require('../services/OptimizationService');
const logger = require('../utils/logger');

/**
 * Obtener sugerencias de optimización para consolidación de órdenes
 * GET /api/admin/sugerencias-optimizacion
 */
async function getSugerenciasOptimizacion(req, res) {
  try {
    const { tenant_id } = req.tenant;
    const userId = req.user.id;
    const userRol = req.user.rol;

    const adminId = (userRol === 'admin' || userRol === 'super_admin') ? userId : null;

    const resultado = await OptimizationService.detectConsolidationOpportunities(tenant_id, adminId);

    res.json({
      success: true,
      data: resultado
    });

  } catch (error) {
    logger.error('[getSugerenciasOptimizacion] Error:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: 'Error al detectar oportunidades de optimización'
    });
  }
}

/**
 * Crear grupo optimizado de órdenes consolidadas
 * POST /api/admin/crear-grupo-optimizado
 */
async function crearGrupoOptimizado(req, res) {
  try {
    const { tenant_id } = req.tenant;
    const userId = req.user.id;
    const { ordenesIds } = req.body;

    if (!ordenesIds || !Array.isArray(ordenesIds) || ordenesIds.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Se requieren al menos 2 órdenes para crear un grupo optimizado'
      });
    }

    const resultado = await OptimizationService.createConsolidatedGroup(
      tenant_id,
      ordenesIds,
      userId
    );

    res.json({
      success: true,
      message: `Grupo optimizado creado con ${resultado.ordenesAgrupadas} órdenes`,
      data: resultado
    });

  } catch (error) {
    logger.error('[crearGrupoOptimizado] Error:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: 'Error al crear grupo optimizado'
    });
  }
}

module.exports = {
  getSugerenciasOptimizacion,
  crearGrupoOptimizado
};
