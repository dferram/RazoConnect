/**
 * 🔧 INTEGRACIÓN DE SISTEMA DE SECUENCIALES EN REMISIONES
 * 
 * Modificación del controller de remisiones para usar el nuevo sistema
 * de IDs secuenciales controlados
 */

const RemisionSequenceManager = require('../utils/remisionSequenceManager');

// Crear instancia del manager
const sequenceManager = new RemisionSequenceManager();

/**
 * 🔢 MODIFICACIÓN: Obtener folio usando sistema de secuenciales
 * En lugar de usar generar_folio_remision(), usamos el nuevo sistema controlado
 */
async function obtenerFolioSecuencial(tenant_id, client) {
  try {
    // Intentar obtener siguiente número del sistema de secuenciales
    const resultado = await sequenceManager.obtenerSiguienteNumero(tenant_id);
    
    if (resultado.success) {
      return {
        success: true,
        folio: resultado.siguiente_numero,
        metodo: 'SECUENCIAL_CONTROLADO'
      };
    } else {
      // Si no hay secuencia configurada, registrar intento fallido y usar fallback
      logger.warn('⚠️ [REMISIÓN] Secuencia no configurada, usando fallback', {
        tenant_id,
        error: resultado.error
      });
      
      // Registrar intento fallido
      await client.query(`
        INSERT INTO remision_intentos_fallidos
        (tenant_id, numero_intentado, tipo_error, detalles)
        VALUES ($1, NULL, 'SECUENCIA_NO_INICIALIZADA', $2)
      `, [tenant_id, resultado.error]);
      
      // Fallback: usar método antiguo
      const fallbackResult = await client.query(
        'SELECT generar_folio_remision($1) AS folio',
        [tenant_id]
      );
      
      return {
        success: true,
        folio: fallbackResult.rows[0].folio,
        metodo: 'FALLBACK_ANTIGUO',
        advertencia: 'Sistema de secuenciales no configurado, usando método antiguo'
      };
    }
  } catch (error) {
    logger.error('❌ [REMISIÓN] Error obteniendo folio secuencial', {
      tenant_id,
      error: error.message
    });
    
    // Fallback a método antiguo
    const fallbackResult = await client.query(
      'SELECT generar_folio_remision($1) AS folio',
      [tenant_id]
    );
    
    return {
      success: true,
      folio: fallbackResult.rows[0].folio,
      metodo: 'FALLBACK_ERROR',
      error: error.message
    };
  }
}

/**
 * 🔢 MODIFICACIÓN: Validar folio antes de usarlo
 * Función para validar que un folio no exista antes de asignarlo
 */
async function validarFolioDisponible(tenant_id, folio, client) {
  try {
    const existeFolio = await client.query(`
      SELECT remision_id, folio, estado
      FROM remisiones
      WHERE tenant_id = $1 AND folio::text = $2::text
      LIMIT 1
    `, [tenant_id, folio.toString()]);
    
    if (existeFolio.rows.length > 0) {
      const existente = existeFolio.rows[0];
      logger.error('❌ [REMISIÓN] Folio ya existe', {
        tenant_id,
        folio_intentado: folio,
        remision_existente: {
          id: existente.remision_id,
          folio: existente.folio,
          estado: existente.estado
        }
      });
      
      return {
        disponible: false,
        error: 'El folio ya existe',
        remision_existente: existente
      };
    }
    
    return {
      disponible: true,
      folio: folio
    };
  } catch (error) {
    logger.error('❌ [REMISIÓN] Error validando folio', {
      tenant_id,
      folio,
      error: error.message
    });
    
    return {
      disponible: false,
      error: 'Error validando folio: ' + error.message
    };
  }
}

/**
 * 🔢 NUEVA FUNCIÓN: Generar remisión con control de folio
 * Versión modificada de generarRemision que usa el sistema de secuenciales
 */
async function generarRemisionConSecuencial(req, res) {
  const client = await pool.connect();
  
  try {
    const { pedido_id, items_a_surtir, notas, emitir_inmediatamente = true } = req.body;
    const { tenant_id } = req.tenant;

    // Validaciones básicas
    if (!pedido_id || !items_a_surtir || !Array.isArray(items_a_surtir) || items_a_surtir.length === 0) {
      return res.status(400).json({ 
        error: 'Datos inválidos. Se requiere pedido_id y items_a_surtir (array no vacío)' 
      });
    }

    await client.query('BEGIN');

    // Validar estado del pedido (código existente)
    const pedidoQuery = await client.query(
      `SELECT p.pedidoid, p.clienteid, p.agenteid, p.direccionenvioid, p.fechapedido, p.montototal, p.estatus, 
              p.costoenvio, p.es_credito, p.fecha_vencimiento, p.pagado, p.transaccion_id, p.comprobante_url, 
              p.metodo_pago, p.cupon_id, p.monto_descuento, p.saldo_pendiente, p.url_evidencia_entrega, 
              p.primera_remision_confirmada_id
       FROM pedidos p
       WHERE p.pedidoid = $1 AND p.tenant_id = $2
       FOR UPDATE`,
      [pedido_id, tenant_id]
    );

    if (pedidoQuery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    const pedido = pedidoQuery.rows[0];

    // 🔢 NUEVO: Obtener folio usando sistema de secuenciales
    const folioResult = await obtenerFolioSecuencial(tenant_id, client);
    
    if (!folioResult.success) {
      await client.query('ROLLBACK');
      return res.status(500).json({
        error: 'Error generando folio de remisión',
        detalles: folioResult.error
      });
    }

    // 🔢 NUEVO: Validar que el folio no exista (doble verificación)
    const validacionFolio = await validarFolioDisponible(tenant_id, folioResult.folio, client);
    
    if (!validacionFolio.disponible) {
      await client.query('ROLLBACK');
      
      // Registrar intento fallido
      await client.query(`
        INSERT INTO remision_intentos_fallidos
        (tenant_id, numero_intentado, tipo_error, detalles_error)
        VALUES ($1, $2, 'DUPLICADO', $3)
      `, [tenant_id, folioResult.folio, JSON.stringify(validacionFolio.remision_existente)]);
      
      return res.status(400).json({
        error: 'El folio generado ya existe',
        folio_intentado: folioResult.folio,
        conflicto_con: validacionFolio.remision_existente,
        metodo_usado: folioResult.metodo
      });
    }

    const folio = folioResult.folio;

    // Resto del código existente (sin cambios)
    // ... (validaciones, cálculos, inserción de detalles, etc.)

    // 5. Insertar remisión con el folio validado
    const estadoInicial = emitir_inmediatamente ? 'PENDIENTE_CONFIRMACION_FINANZAS' : 'BORRADOR';
    
    const remisionInsert = await client.query(
      `INSERT INTO remisiones 
       (pedido_id, cliente_id, agente_id, folio, total_remision, estado, notas, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING remision_id, folio, fecha_emision, estado`,
      [
        pedido_id,
        pedido.clienteid,
        pedido.agenteid,
        folio,
        totalRemision.toFixed(2),
        estadoInicial,
        notas || null,
        tenant_id
      ]
    );

    const remision = remisionInsert.rows[0];

    // Log de éxito con información del método usado
    logger.info('🔢 [REMISIÓN] Remisión generada con folio controlado', {
      tenant_id,
      pedido_id,
      remision_id: remision.remision_id,
      folio: remision.folio,
      metodo: folioResult.metodo,
      emitir_inmediatamente,
      requestId: req.requestId
    });

    // Si hay advertencia, incluirla en la respuesta
    const respuesta = {
      success: true,
      message: `Remisión ${folio} generada exitosamente`,
      remision: {
        remision_id: remision.remision_id,
        folio: remision.folio,
        fecha_emision: remision.fecha_emision,
        total_remision: totalRemision.toFixed(2),
        estado: remision.estado,
        metodo_folio: folioResult.metodo
      }
    };

    if (folioResult.advertencia) {
      respuesta.advertencia = folioResult.advertencia;
    }

    await client.query('COMMIT');
    res.status(201).json(respuesta);

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error generando remisión con secuencial', {
      tenant_id: req.tenant?.tenant_id,
      body: req.body,
      error: error.message,
      requestId: req.requestId
    });
    
    res.status(500).json({ 
      error: 'Error generando remisión', 
      detalles: error.message 
    });
  } finally {
    client.release();
  }
}

module.exports = {
  obtenerFolioSecuencial,
  validarFolioDisponible,
  generarRemisionConSecuencial
};
