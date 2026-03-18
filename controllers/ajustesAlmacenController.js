/**
 * AJUSTES ALMACÉN CONTROLLER
 * 
 * Controlador para gestionar ajustes de inventario relacionados con
 * entradas de almacén mal registradas y su reconciliación con cuentas por pagar.
 * 
 * @module controllers/ajustesAlmacenController
 * @author RazoConnect Team
 */

const db = require('../db');
const logger = require('../utils/logger');

/**
 * Obtener entradas de almacén registradas con posibles errores
 * GET /api/admin/ajustes-almacen/entradas-erroneas
 */
async function getEntradasErroneas(req, res) {
    const client = await db.pool.connect();
    const tenant_id = req.tenant?.tenant_id || 1;
    const { fechaInicio, fechaFin, proveedorId } = req.query;
    
    try {
        let whereConditions = ['oc.tenant_id = $1'];
        let queryParams = [tenant_id];
        let paramIndex = 2;
        
        if (fechaInicio) {
            queryParams.push(fechaInicio);
            whereConditions.push(`oc.fechaorden >= $${paramIndex}`);
            paramIndex++;
        }
        if (fechaFin) {
            queryParams.push(fechaFin);
            whereConditions.push(`oc.fechaorden <= $${paramIndex}`);
            paramIndex++;
        }
        if (proveedorId) {
            queryParams.push(parseInt(proveedorId));
            whereConditions.push(`oc.proveedorid = $${paramIndex}`);
            paramIndex++;
        }
        
        const whereClause = whereConditions.join(' AND ');
        
        const { rows } = await client.query(`
            SELECT 
                oc.ordencompraid,
                oc.fechaorden,
                oc.total,
                oc.estatus,
                p.nombreempresa as proveedor,
                p.proveedorid,
                COUNT(doc.detalleoc_id) as items_recibidos,
                COALESCE(cxp.monto_total, 0) as monto_cxp,
                COALESCE(cxp.monto_pagado, 0) as monto_pagado,
                cxp.cxp_id,
                cxp.estatus as estatus_cxp,
                CASE 
                    WHEN ABS(oc.total - COALESCE(cxp.monto_total, 0)) > 0.01 THEN true
                    ELSE false
                END as tiene_discrepancia
            FROM ordenesdecompra oc
            INNER JOIN proveedores p ON p.proveedorid = oc.proveedorid
            LEFT JOIN detallesordencompra doc ON doc.ordencompraid = oc.ordencompraid 
                AND doc.cantidadrecibida > 0
            LEFT JOIN cuentas_por_pagar cxp ON cxp.orden_compra_id = oc.ordencompraid
            WHERE ${whereClause}
                AND oc.estatus IN ('Completada', 'Parcial')
            GROUP BY oc.ordencompraid, oc.fechaorden, oc.total, oc.estatus, 
                     p.nombreempresa, p.proveedorid, cxp.monto_total, cxp.monto_pagado, 
                     cxp.cxp_id, cxp.estatus
            HAVING ABS(oc.total - COALESCE(cxp.monto_total, 0)) > 0.01
            ORDER BY oc.fechaorden DESC
        `, queryParams);
        
        res.json({
            success: true,
            data: rows
        });
        
    } catch (error) {
        logger.error('Error obteniendo entradas erróneas:', {
            error: error.message,
            requestId: req.requestId,
            tenantId: req.tenant?.tenant_id
        });
        res.status(500).json({
            success: false,
            message: 'Error al obtener entradas erróneas'
        });
    } finally {
        client.release();
    }
}

/**
 * Obtener detalles de una entrada de almacén para reconciliación
 * GET /api/admin/ajustes-almacen/entrada/:id/detalles
 */
async function getDetallesEntrada(req, res) {
    const client = await db.pool.connect();
    const tenant_id = req.tenant?.tenant_id || 1;
    const ordenCompraId = parseInt(req.params.id);
    
    try {
        const { rows } = await client.query(`
            SELECT 
                doc.detalleoc_id,
                doc.varianteid,
                doc.cantidadsolicitada,
                doc.cantidadrecibida,
                doc.piezasrecibidas,
                doc.piezasporpaquete,
                doc.costounitario,
                pv.sku,
                p.nombreproducto,
                pv.dimensiones,
                pv.color_nombre,
                (doc.piezasrecibidas * doc.costounitario) as subtotal
            FROM detallesordencompra doc
            INNER JOIN producto_variantes pv ON pv.varianteid = doc.varianteid
            INNER JOIN productos p ON p.productoid = pv.productoid
            WHERE doc.ordencompraid = $1
                AND doc.cantidadrecibida > 0
            ORDER BY p.nombreproducto
        `, [ordenCompraId]);
        
        res.json({
            success: true,
            data: rows
        });
        
    } catch (error) {
        logger.error('Error obteniendo detalles de entrada:', {
            error: error.message,
            requestId: req.requestId,
            tenantId: req.tenant?.tenant_id
        });
        res.status(500).json({
            success: false,
            message: 'Error al obtener detalles de entrada'
        });
    } finally {
        client.release();
    }
}

/**
 * Reconciliar entrada de almacén con cuenta por pagar
 * POST /api/admin/ajustes-almacen/reconciliar
 */
async function reconciliarEntrada(req, res) {
    const client = await db.pool.connect();
    const tenant_id = req.tenant?.tenant_id || 1;
    const userId = req.user?.id || req.user?.adminId;
    const { ordenCompraId, cxpId, ajustes, notas } = req.body;
    
    try {
        await client.query('BEGIN');
        
        // Verificar permisos (solo finanzas, compras, o superadmin)
        const userRole = req.user?.rol;
        if (!['superadmin', 'finanzas', 'compras', 'gerente_finanzas'].includes(userRole)) {
            await client.query('ROLLBACK');
            return res.status(403).json({
                success: false,
                message: 'No tienes permisos para realizar esta acción'
            });
        }
        
        // Obtener información de la orden
        const { rows: [orden] } = await client.query(`
            SELECT oc.*, p.nombreempresa as proveedor
            FROM ordenesdecompra oc
            INNER JOIN proveedores p ON p.proveedorid = oc.proveedorid
            WHERE oc.ordencompraid = $1 AND oc.tenant_id = $2
        `, [ordenCompraId, tenant_id]);
        
        if (!orden) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                message: 'Orden de compra no encontrada'
            });
        }
        
        // Recalcular total de la orden basado en lo realmente recibido
        const { rows: [totales] } = await client.query(`
            SELECT 
                COALESCE(SUM(doc.piezasrecibidas * doc.costounitario), 0) as total_recibido,
                COALESCE(SUM(doc.cantidadsolicitada * doc.piezasporpaquete * doc.costounitario), 0) as total_solicitado
            FROM detallesordencompra doc
            WHERE doc.ordencompraid = $1
        `, [ordenCompraId]);
        
        const totalRecibido = parseFloat(totales.total_recibido);
        
        // Actualizar el total de la orden
        await client.query(`
            UPDATE ordenesdecompra
            SET total = $1
            WHERE ordencompraid = $2 AND tenant_id = $3
        `, [totalRecibido, ordenCompraId, tenant_id]);
        
        // Actualizar o crear cuenta por pagar
        if (cxpId) {
            await client.query(`
                UPDATE cuentas_por_pagar
                SET monto_total = $1,
                    estatus = CASE 
                        WHEN monto_pagado >= $1 THEN 'PAGADO'
                        WHEN monto_pagado > 0 THEN 'PARCIAL'
                        ELSE 'PENDIENTE'
                    END
                WHERE cxp_id = $2 AND tenant_id = $3
            `, [totalRecibido, cxpId, tenant_id]);
        } else {
            // Crear nueva cuenta por pagar
            const diasCredito = parseInt(orden.diascredito) || 0;
            const fechaVencimiento = new Date();
            fechaVencimiento.setDate(fechaVencimiento.getDate() + diasCredito);
            
            await client.query(`
                INSERT INTO cuentas_por_pagar (
                    proveedor_id, orden_compra_id, fecha_emision, fecha_vencimiento,
                    monto_total, estatus, usuario_creador_id, tenant_id
                ) VALUES ($1, $2, CURRENT_DATE, $3, $4, 'PENDIENTE', $5, $6)
            `, [orden.proveedorid, ordenCompraId, fechaVencimiento, totalRecibido, userId, tenant_id]);
        }
        
        // Registrar en auditoría
        await client.query(`
            INSERT INTO auditoria_ajustes (
                tipo_ajuste, tabla_afectada, registro_id, usuario_id,
                valores_anteriores, valores_nuevos, notas, tenant_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
            'RECONCILIACION_ENTRADA',
            'ordenesdecompra',
            ordenCompraId,
            userId,
            JSON.stringify({ total_anterior: orden.total }),
            JSON.stringify({ total_nuevo: totalRecibido, ajustes }),
            notas || 'Reconciliación de entrada de almacén con CxP',
            tenant_id
        ]);
        
        await client.query('COMMIT');
        
        res.json({
            success: true,
            message: 'Entrada reconciliada exitosamente',
            data: {
                ordenCompraId,
                totalAnterior: parseFloat(orden.total),
                totalNuevo: totalRecibido,
                diferencia: totalRecibido - parseFloat(orden.total)
            }
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Error reconciliando entrada:', {
            error: error.message,
            requestId: req.requestId,
            tenantId: req.tenant?.tenant_id
        });
        res.status(500).json({
            success: false,
            message: 'Error al reconciliar entrada'
        });
    } finally {
        client.release();
    }
}

module.exports = {
    getEntradasErroneas,
    getDetallesEntrada,
    reconciliarEntrada
};
