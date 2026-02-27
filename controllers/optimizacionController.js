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

/**
 * Obtener sugerencias de optimización para consolidación de órdenes
 * GET /api/admin/sugerencias-optimizacion
 */
async function getSugerenciasOptimizacion(req, res) {
  try {
    const { tenant_id } = req.tenant;
    const userId = req.user.id;
    const userRol = req.user.rol;

    const adminId = userRol === 'admin' ? userId : null;

    console.log(`🔍 [Optimization] Detectando oportunidades de consolidación para tenant ${tenant_id}${adminId ? ` (Admin ${adminId})` : ''}`);

    const resultado = await OptimizationService.detectConsolidationOpportunities(tenant_id, adminId);

    console.log(`✅ [Optimization] ${resultado.resumen.totalOportunidades} oportunidades detectadas`);
    console.log(`   💰 Ahorro potencial: ${resultado.resumen.ahorroTotalPiezas} piezas`);
    console.log(`   📦 Órdenes afectadas: ${resultado.resumen.ordenesAfectadas}`);

    res.json({
      success: true,
      data: resultado
    });

  } catch (error) {
    console.error('❌ [Optimization] Error obteniendo sugerencias:', error);
    res.status(500).json({
      success: false,
      message: 'Error al detectar oportunidades de optimización',
      error: error.message
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

    console.log(`🚀 [Optimization] Creando grupo optimizado con ${ordenesIds.length} órdenes`);

    const resultado = await OptimizationService.createConsolidatedGroup(
      tenant_id,
      ordenesIds,
      userId
    );

    console.log(`✅ [Optimization] Grupo ${resultado.grupoId} creado exitosamente`);

    res.json({
      success: true,
      message: `Grupo optimizado creado con ${resultado.ordenesAgrupadas} órdenes`,
      data: resultado
    });

  } catch (error) {
    console.error('❌ [Optimization] Error creando grupo optimizado:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear grupo optimizado',
      error: error.message
    });
  }
}

module.exports = {
  getSugerenciasOptimizacion,
  crearGrupoOptimizado
};
