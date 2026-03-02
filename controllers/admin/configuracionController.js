const logger = require('../../utils/logger');
const configuracionService = require('../../services/configuracionService');

async function getIvaConfig(req, res) {
  try {
    const { tenant_id } = req.tenant;

    const tasa = await configuracionService.getIvaTasa(tenant_id);
    const porcentaje = `${(tasa * 100).toFixed(0)}%`;

    res.json({
      success: true,
      data: {
        tasa,
        porcentaje
      }
    });

    logger.info(`[ConfiguracionController] IVA consultado: Tenant=${tenant_id}, Tasa=${tasa}`);

  } catch (error) {
    logger.error('[ConfiguracionController] Error al obtener configuración de IVA:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener la configuración de IVA',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

async function updateIvaConfig(req, res) {
  try {
    const { tenant_id } = req.tenant;
    const { id: adminId } = req.user;
    const { tasa } = req.body;

    if (tasa === undefined || tasa === null) {
      return res.status(400).json({
        success: false,
        message: 'El campo "tasa" es requerido'
      });
    }

    const tasaNum = parseFloat(tasa);

    if (isNaN(tasaNum) || tasaNum < 0 || tasaNum > 1) {
      return res.status(400).json({
        success: false,
        message: 'La tasa de IVA debe ser un número entre 0 y 1 (ej: 0.16 para 16%)'
      });
    }

    await configuracionService.setConfiguracion(
      tenant_id,
      'iva_tasa',
      tasaNum.toString(),
      adminId
    );

    const porcentaje = `${(tasaNum * 100).toFixed(0)}%`;

    res.json({
      success: true,
      message: 'Configuración de IVA actualizada correctamente',
      data: {
        tasa: tasaNum,
        porcentaje
      }
    });

    logger.info(`[ConfiguracionController] IVA actualizado: Tenant=${tenant_id}, Tasa=${tasaNum}, Admin=${adminId}`);

  } catch (error) {
    logger.error('[ConfiguracionController] Error al actualizar configuración de IVA:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar la configuración de IVA',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

module.exports = {
  getIvaConfig,
  updateIvaConfig
};
