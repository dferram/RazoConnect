const db = require('../db');

/**
 * Servicio de Vencimiento Automático de Deudas
 * Actualiza el estatus de pedidos a crédito que han superado su fecha de vencimiento
 */

/**
 * Actualiza el estatus de todas las deudas vencidas
 * @returns {Promise<Object>} Resultado de la operación con estadísticas
 */
async function actualizarDeudasVencidas() {
    const client = await db.pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const resultado = await client.query(`
            SELECT actualizar_estatus_deuda_vencida() as cantidad_actualizada
        `);
        
        const cantidadActualizada = resultado.rows[0]?.cantidad_actualizada || 0;
        
        if (cantidadActualizada > 0) {
            console.log(`[CRON] Deudas actualizadas a VENCIDA: ${cantidadActualizada}`);
            
            const { rows: detalles } = await client.query(`
                SELECT 
                    p.pedidoid,
                    p.clienteid,
                    c.nombre || ' ' || c.apellido as cliente_nombre,
                    p.fecha_vencimiento,
                    CURRENT_DATE - p.fecha_vencimiento::date as dias_atraso,
                    COALESCE(p.saldo_pendiente, p.montototal) as saldo_pendiente
                FROM pedidos p
                INNER JOIN clientes c ON c.clienteid = p.clienteid
                WHERE p.estatus_deuda = 'VENCIDA'
                  AND p.fecha_vencimiento::date = CURRENT_DATE - INTERVAL '1 day'
                ORDER BY p.clienteid
            `);
            
            if (detalles.length > 0) {
                console.log('[CRON] Detalles de deudas recién vencidas:');
                detalles.forEach(d => {
                    console.log(`  - Pedido #${d.pedidoid} | Cliente: ${d.cliente_nombre} | Días atraso: ${d.dias_atraso} | Saldo: $${d.saldo_pendiente}`);
                });
            }
        } else {
            console.log('[CRON] No hay deudas nuevas para marcar como vencidas');
        }
        
        await client.query('COMMIT');
        
        return {
            success: true,
            cantidadActualizada,
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('[CRON] Error actualizando deudas vencidas:', error);
        
        return {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        };
    } finally {
        client.release();
    }
}

/**
 * Suspende clientes con deudas vencidas críticas (más de 30 días)
 * @returns {Promise<Object>} Resultado de la operación
 */
async function suspenderClientesMorosos() {
    const client = await db.pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const { rows } = await client.query(`
            WITH clientes_morosos AS (
                SELECT DISTINCT
                    p.clienteid,
                    MAX(CURRENT_DATE - p.fecha_vencimiento::date) as max_dias_atraso,
                    SUM(COALESCE(p.saldo_pendiente, p.montototal)) as deuda_total
                FROM pedidos p
                WHERE p.es_credito = true
                  AND p.pagado = false
                  AND p.fecha_vencimiento IS NOT NULL
                  AND CURRENT_DATE - p.fecha_vencimiento::date > 30
                GROUP BY p.clienteid
            )
            UPDATE cliente_creditos cc
            SET estado_credito = 'SUSPENDIDO',
                ultima_actualizacion = CURRENT_TIMESTAMP
            FROM clientes_morosos cm
            WHERE cc.cliente_id = cm.clienteid
              AND cc.estado_credito = 'ACTIVO'
            RETURNING cc.cliente_id, cm.max_dias_atraso, cm.deuda_total
        `);
        
        const cantidadSuspendidos = rows.length;
        
        if (cantidadSuspendidos > 0) {
            console.log(`[CRON] Clientes suspendidos por morosidad: ${cantidadSuspendidos}`);
            
            rows.forEach(r => {
                console.log(`  - Cliente ID: ${r.cliente_id} | Días atraso máx: ${r.max_dias_atraso} | Deuda total: $${r.deuda_total}`);
            });
        } else {
            console.log('[CRON] No hay clientes para suspender por morosidad');
        }
        
        await client.query('COMMIT');
        
        return {
            success: true,
            cantidadSuspendidos,
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('[CRON] Error suspendiendo clientes morosos:', error);
        
        return {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        };
    } finally {
        client.release();
    }
}

/**
 * Genera reporte de deudas por vencer en los próximos 7 días
 * @returns {Promise<Object>} Reporte de deudas próximas a vencer
 */
async function reporteDeudasPorVencer() {
    try {
        const { rows } = await db.query(`
            SELECT 
                p.pedidoid,
                p.clienteid,
                c.nombre || ' ' || c.apellido as cliente_nombre,
                c.email as cliente_email,
                p.fechapedido,
                p.fecha_vencimiento,
                COALESCE(p.saldo_pendiente, p.montototal) as saldo_pendiente,
                p.fecha_vencimiento::date - CURRENT_DATE as dias_restantes,
                cc.dias_gracia as dias_credito_cliente
            FROM pedidos p
            INNER JOIN clientes c ON c.clienteid = p.clienteid
            LEFT JOIN cliente_creditos cc ON cc.cliente_id = p.clienteid
            WHERE p.es_credito = true
              AND p.pagado = false
              AND p.fecha_vencimiento IS NOT NULL
              AND p.fecha_vencimiento::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
              AND p.estatus_deuda = 'PENDIENTE'
            ORDER BY p.fecha_vencimiento ASC
        `);
        
        if (rows.length > 0) {
            console.log(`[CRON] Deudas por vencer en los próximos 7 días: ${rows.length}`);
            rows.forEach(r => {
                console.log(`  - Pedido #${r.pedidoid} | Cliente: ${r.cliente_nombre} | Vence en: ${r.dias_restantes} días | Saldo: $${r.saldo_pendiente}`);
            });
        }
        
        return {
            success: true,
            cantidadDeudas: rows.length,
            deudas: rows,
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        console.error('[CRON] Error generando reporte de deudas por vencer:', error);
        
        return {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Ejecuta el mantenimiento diario completo de deudas
 */
async function mantenimientoDiarioDeudas() {
    console.log('\n========================================');
    console.log('[CRON] Iniciando mantenimiento diario de deudas');
    console.log(`[CRON] Fecha: ${new Date().toISOString()}`);
    console.log('========================================\n');
    
    const resultado1 = await actualizarDeudasVencidas();
    console.log('\n');
    
    const resultado2 = await suspenderClientesMorosos();
    console.log('\n');
    
    const resultado3 = await reporteDeudasPorVencer();
    console.log('\n');
    
    console.log('========================================');
    console.log('[CRON] Mantenimiento diario completado');
    console.log('========================================\n');
    
    return {
        actualizacionDeudas: resultado1,
        suspensionClientes: resultado2,
        reporteProximosVencimientos: resultado3
    };
}

module.exports = {
    actualizarDeudasVencidas,
    suspenderClientesMorosos,
    reporteDeudasPorVencer,
    mantenimientoDiarioDeudas
};
