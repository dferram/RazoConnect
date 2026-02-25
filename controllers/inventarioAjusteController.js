const pool = require('../db');
const SmartStockService = require('../services/SmartStockService');

const registrarAjusteInventario = async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { sku, tipo, cantidad, motivo, observaciones } = req.body;
        const userId = req.user?.id || req.user?.adminId || req.user?.userId;
        const userRoles = req.user?.roles || ['admin'];
        const { tenant_id } = req.tenant;
        const ipOrigen = req.ip || req.connection.remoteAddress;

        if (!sku || !tipo || !cantidad || !motivo) {
            return res.status(400).json({ 
                error: 'Faltan campos requeridos: sku, tipo, cantidad, motivo' 
            });
        }

        if (!['MERMA', 'ADICION'].includes(tipo)) {
            return res.status(400).json({ 
                error: 'Tipo inválido. Debe ser MERMA o ADICION' 
            });
        }

        const cantidadNum = parseInt(cantidad);
        if (isNaN(cantidadNum) || cantidadNum <= 0) {
            return res.status(400).json({ 
                error: 'La cantidad debe ser un número positivo' 
            });
        }

        await client.query('BEGIN');

        const varianteQuery = await client.query(
            `SELECT pv.varianteid, pv.sku, pv.dimensiones, p.nombreproducto, p.sku_maestro
             FROM producto_variantes pv
             INNER JOIN productos p ON pv.productoid = p.productoid
             WHERE pv.sku = $1 AND pv.tenant_id = $2 AND pv.activo = true`,
            [sku, tenant_id]
        );

        if (varianteQuery.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ 
                error: 'Producto no encontrado o inactivo' 
            });
        }

        const variante = varianteQuery.rows[0];
        const varianteId = variante.varianteid;

        // ✅ SMART STOCK: Obtener stock actual antes del ajuste
        let stockPrevio = 0;
        try {
            stockPrevio = await SmartStockService.getStock({
                varianteId,
                userId,
                userRole: userRoles,
                tenantId: tenant_id
            });
        } catch (stockError) {
            console.error('[InventarioAjusteController] Error al obtener stock:', stockError);
        }

        // Calcular cantidad de ajuste (MERMA = negativo, ADICION = positivo)
        const cantidadAjuste = tipo === 'MERMA' ? -cantidadNum : cantidadNum;

        // ✅ SMART STOCK: Aplicar ajuste usando SmartStockService
        let resultado;
        try {
            resultado = await SmartStockService.adjustStock({
                varianteId,
                cantidad: cantidadAjuste,
                userId,
                userRole: userRoles,
                tenantId: tenant_id,
                motivo: `${tipo}: ${motivo}`,
                client // ✅ Usar misma transacción
            });

            if (!resultado.success) {
                await client.query('ROLLBACK');
                return res.status(400).json({ 
                    error: resultado.message,
                    stockActual: stockPrevio
                });
            }
        } catch (stockError) {
            await client.query('ROLLBACK');
            console.error('❌ [SmartStock] Error al ajustar inventario:', stockError);
            return res.status(400).json({ 
                error: stockError.message || 'Error al ajustar el inventario',
                stockActual: stockPrevio
            });
        }

        const stockPosterior = resultado.newStock;

        // Registrar movimiento en tabla de auditoría
        const movimientoResult = await client.query(
            `INSERT INTO movimientos_inventario 
             (admin_id, variante_id, tenant_id, tipo, cantidad, stock_previo, stock_posterior, motivo, observaciones, ip_origen)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING movimiento_id, fecha_movimiento`,
            [userId, varianteId, tenant_id, tipo, cantidadNum, stockPrevio, stockPosterior, motivo, observaciones || null, ipOrigen]
        );

        const movimientoId = movimientoResult.rows[0].movimiento_id;
        const fechaMovimiento = movimientoResult.rows[0].fecha_movimiento;

        await client.query('COMMIT');

        const adminQuery = await client.query(
            'SELECT nombre, email FROM administradores WHERE adminid = $1',
            [userId]
        );
        const adminNombre = adminQuery.rows[0]?.nombre || 'Desconocido';

        console.log(`✅ [SmartStock] Ajuste registrado: ${tipo} de ${cantidadNum} unidades - Variante ${varianteId} (${stockPrevio} → ${stockPosterior})`);

        res.json({
            success: true,
            mensaje: `Ajuste de inventario registrado exitosamente`,
            movimiento: {
                movimientoId,
                tipo,
                cantidad: cantidadNum,
                stockPrevio,
                stockPosterior,
                motivo,
                fechaMovimiento,
                producto: {
                    sku: variante.sku,
                    nombre: variante.nombreproducto,
                    dimensiones: variante.dimensiones
                },
                registradoPor: adminNombre
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error en registrarAjusteInventario:', error);
        res.status(500).json({ 
            error: 'Error al registrar ajuste de inventario',
            detalle: error.message 
        });
    } finally {
        client.release();
    }
};

const obtenerHistorialMovimientos = async (req, res) => {
    try {
        const { tenant_id } = req.tenant;
        const { 
            fechaInicio, 
            fechaFin, 
            tipo, 
            motivo, 
            adminId, 
            sku,
            limite = 100,
            offset = 0
        } = req.query;

        // ✅ FILTRO ESTRICTO: Solo ajustes manuales (MERMA y ADICION)
        // Excluye CONTEO_INICIAL, ENTRADA_ALMACEN, RECEPCION_COMPRA, etc.
        // También excluye motivos que no estén en el catálogo oficial (como "Recepción OC #11")
        let whereConditions = [
            'mi.tenant_id = $1',
            "mi.tipo IN ('MERMA', 'ADICION')",  // ✅ FILTRO CRÍTICO
            "EXISTS (SELECT 1 FROM cat_motivos_ajuste cma WHERE cma.codigo = mi.motivo AND cma.activo = true)"  // ✅ Solo motivos válidos del catálogo
        ];
        let queryParams = [tenant_id];
        let paramCounter = 2;

        if (fechaInicio) {
            whereConditions.push(`mi.fecha_movimiento >= $${paramCounter}::timestamp`);
            queryParams.push(fechaInicio);
            paramCounter++;
        }

        if (fechaFin) {
            whereConditions.push(`mi.fecha_movimiento <= $${paramCounter}::timestamp`);
            queryParams.push(fechaFin);
            paramCounter++;
        }

        if (tipo && ['MERMA', 'ADICION'].includes(tipo)) {
            whereConditions.push(`mi.tipo = $${paramCounter}`);
            queryParams.push(tipo);
            paramCounter++;
        }

        if (motivo) {
            whereConditions.push(`mi.motivo = $${paramCounter}`);
            queryParams.push(motivo);
            paramCounter++;
        }

        if (adminId) {
            whereConditions.push(`mi.admin_id = $${paramCounter}`);
            queryParams.push(adminId);
            paramCounter++;
        }

        if (sku) {
            whereConditions.push(`pv.sku ILIKE $${paramCounter}`);
            queryParams.push(`%${sku}%`);
            paramCounter++;
        }

        const whereClause = whereConditions.join(' AND ');

        const countQuery = await pool.query(
            `SELECT COUNT(*) as total
             FROM movimientos_inventario mi
             INNER JOIN producto_variantes pv ON mi.variante_id = pv.varianteid
             WHERE ${whereClause}`,
            queryParams
        );

        const totalRegistros = parseInt(countQuery.rows[0].total);

        queryParams.push(parseInt(limite));
        queryParams.push(parseInt(offset));

        const movimientosQuery = await pool.query(
            `SELECT 
                mi.movimiento_id,
                mi.fecha_movimiento,
                mi.tipo,
                mi.cantidad,
                mi.stock_previo,
                mi.stock_posterior,
                mi.motivo,
                mi.observaciones,
                mi.ip_origen,
                a.nombre as admin_nombre,
                a.email as admin_email,
                pv.sku,
                pv.dimensiones,
                p.nombreproducto,
                p.sku_maestro,
                CASE 
                    WHEN mi.tipo = 'MERMA' THEN -mi.cantidad
                    WHEN mi.tipo = 'ADICION' THEN mi.cantidad
                END as impacto_cantidad
             FROM movimientos_inventario mi
             INNER JOIN administradores a ON mi.admin_id = a.adminid
             INNER JOIN producto_variantes pv ON mi.variante_id = pv.varianteid
             INNER JOIN productos p ON pv.productoid = p.productoid
             WHERE ${whereClause}
             ORDER BY mi.fecha_movimiento DESC
             LIMIT $${paramCounter} OFFSET $${paramCounter + 1}`,
            queryParams
        );

        res.json({
            success: true,
            movimientos: movimientosQuery.rows,
            paginacion: {
                total: totalRegistros,
                limite: parseInt(limite),
                offset: parseInt(offset),
                paginas: Math.ceil(totalRegistros / parseInt(limite))
            }
        });

    } catch (error) {
        console.error('❌ Error en obtenerHistorialMovimientos:', error);
        res.status(500).json({ 
            error: 'Error al obtener historial de movimientos',
            detalle: error.message 
        });
    }
};

const obtenerMotivosAjuste = async (req, res) => {
    try {
        const { tipo } = req.query;

        let whereClause = 'activo = true';
        const queryParams = [];

        if (tipo && ['MERMA', 'ADICION'].includes(tipo)) {
            whereClause += ` AND (tipo_aplicable = $1 OR tipo_aplicable = 'AMBOS')`;
            queryParams.push(tipo);
        }

        const motivosQuery = await pool.query(
            `SELECT motivo_id, codigo, descripcion, tipo_aplicable
             FROM cat_motivos_ajuste
             WHERE ${whereClause}
             ORDER BY orden_display, descripcion`,
            queryParams
        );

        res.json({
            success: true,
            motivos: motivosQuery.rows
        });

    } catch (error) {
        console.error('❌ Error en obtenerMotivosAjuste:', error);
        res.status(500).json({ 
            error: 'Error al obtener motivos de ajuste',
            detalle: error.message 
        });
    }
};

const obtenerEstadisticasAjustes = async (req, res) => {
    try {
        const { tenant_id } = req.tenant;
        const { fechaInicio, fechaFin } = req.query;

        // ✅ FILTRO ESTRICTO: Solo ajustes manuales del catálogo oficial
        let whereConditions = [
            'mi.tenant_id = $1',
            "EXISTS (SELECT 1 FROM cat_motivos_ajuste cma WHERE cma.codigo = mi.motivo AND cma.activo = true)"
        ];
        let queryParams = [tenant_id];
        let paramCounter = 2;

        if (fechaInicio) {
            whereConditions.push(`mi.fecha_movimiento >= $${paramCounter}::timestamp`);
            queryParams.push(fechaInicio);
            paramCounter++;
        }

        if (fechaFin) {
            whereConditions.push(`mi.fecha_movimiento <= $${paramCounter}::timestamp`);
            queryParams.push(fechaFin);
            paramCounter++;
        }

        const whereClause = whereConditions.join(' AND ');

        const estadisticasQuery = await pool.query(
            `SELECT 
                mi.tipo,
                COUNT(*) as total_movimientos,
                SUM(mi.cantidad) as total_unidades,
                COUNT(DISTINCT mi.admin_id) as admins_involucrados,
                COUNT(DISTINCT mi.variante_id) as productos_afectados
             FROM movimientos_inventario mi
             WHERE ${whereClause}
             GROUP BY mi.tipo`,
            queryParams
        );

        const topMotivosQuery = await pool.query(
            `SELECT 
                mi.motivo,
                mi.tipo,
                COUNT(*) as frecuencia,
                SUM(mi.cantidad) as total_unidades
             FROM movimientos_inventario mi
             WHERE ${whereClause}
             GROUP BY mi.motivo, mi.tipo
             ORDER BY frecuencia DESC
             LIMIT 10`,
            queryParams
        );

        const topAdminsQuery = await pool.query(
            `SELECT 
                a.nombre,
                a.email,
                COUNT(*) as total_ajustes,
                SUM(CASE WHEN mi.tipo = 'MERMA' THEN mi.cantidad ELSE 0 END) as total_mermas,
                SUM(CASE WHEN mi.tipo = 'ADICION' THEN mi.cantidad ELSE 0 END) as total_adiciones
             FROM movimientos_inventario mi
             INNER JOIN administradores a ON mi.admin_id = a.adminid
             WHERE ${whereClause}
             GROUP BY a.adminid, a.nombre, a.email
             ORDER BY total_ajustes DESC
             LIMIT 10`,
            queryParams
        );

        res.json({
            success: true,
            estadisticas: {
                porTipo: estadisticasQuery.rows,
                topMotivos: topMotivosQuery.rows,
                topAdmins: topAdminsQuery.rows
            }
        });

    } catch (error) {
        console.error('❌ Error en obtenerEstadisticasAjustes:', error);
        res.status(500).json({ 
            error: 'Error al obtener estadísticas de ajustes',
            detalle: error.message 
        });
    }
};

const buscarProductoPorSKU = async (req, res) => {
    try {
        const { sku } = req.query;
        const { tenant_id } = req.tenant;
        const adminId = req.user.adminId;

        if (!sku) {
            return res.status(400).json({ 
                error: 'El parámetro SKU es requerido' 
            });
        }

        const productoQuery = await pool.query(
            `SELECT 
                pv.varianteid,
                pv.sku,
                pv.dimensiones,
                pv.color_nombre,
                p.nombreproducto,
                p.sku_maestro,
                p.descripcion,
                c.nombre as nombrecategoria,
                COALESCE(ia.cantidad, 0) as stock_actual
             FROM producto_variantes pv
             INNER JOIN productos p ON pv.productoid = p.productoid
             LEFT JOIN categorias c ON p.categoriaid = c.categoriaid
             LEFT JOIN inventarios_admin ia ON pv.varianteid = ia.variante_id 
                AND ia.admin_id = $2 AND ia.tenant_id = $3
             WHERE pv.sku ILIKE $1 AND pv.tenant_id = $3 AND pv.activo = true
             LIMIT 10`,
            [`%${sku}%`, adminId, tenant_id]
        );

        if (productoQuery.rows.length === 0) {
            return res.status(404).json({ 
                error: 'No se encontraron productos con ese SKU' 
            });
        }

        res.json({
            success: true,
            productos: productoQuery.rows
        });

    } catch (error) {
        console.error('❌ Error en buscarProductoPorSKU:', error);
        res.status(500).json({ 
            error: 'Error al buscar producto',
            detalle: error.message 
        });
    }
};

/**
 * Buscar productos para autocompletado visual (SIN MOSTRAR STOCK - Seguridad Ciega)
 * Retorna solo productos maestros con imagen y categoría
 */
const buscarProductosAutocompletado = async (req, res) => {
    try {
        const { q } = req.query;
        const { tenant_id } = req.tenant;

        if (!q || q.trim().length < 2) {
            return res.json({
                success: true,
                productos: []
            });
        }

        const searchPattern = `%${q.trim()}%`;

        const query = `
            SELECT DISTINCT
                p.productoid,
                p.nombreproducto,
                p.sku_maestro,
                c.nombre as nombrecategoria,
                COALESCE(
                    (SELECT pi.url_imagen 
                     FROM producto_imagenes pi 
                     WHERE pi.productoid = p.productoid AND pi.tenant_id = $2
                     ORDER BY pi.orden ASC LIMIT 1),
                    '/images/placeholder-product.png'
                ) as imagen_url
            FROM productos p
            INNER JOIN categorias c ON p.categoriaid = c.categoriaid
            INNER JOIN producto_variantes pv ON pv.productoid = p.productoid
            WHERE p.tenant_id = $2
                AND pv.tenant_id = $2
                AND COALESCE(p.activo, TRUE) = TRUE
                AND COALESCE(pv.activo, TRUE) = TRUE
                AND (
                    p.nombreproducto ILIKE $1
                    OR p.sku_maestro ILIKE $1
                    OR c.nombre ILIKE $1
                )
            ORDER BY p.nombreproducto ASC
            LIMIT 10
        `;

        const result = await pool.query(query, [searchPattern, tenant_id]);

        console.log(`🔍 [AUTOCOMPLETADO] Búsqueda: "${q}" - Resultados: ${result.rows.length}`);

        res.json({
            success: true,
            productos: result.rows
        });

    } catch (error) {
        console.error('❌ Error en buscarProductosAutocompletado:', error);
        res.status(500).json({ 
            error: 'Error al buscar productos',
            detalle: error.message 
        });
    }
};

/**
 * Obtener variantes de un producto maestro (SIN MOSTRAR STOCK - Seguridad Ciega)
 * Para el modal de selección de variantes
 */
const getVariantesProducto = async (req, res) => {
    try {
        const { productoId } = req.params;
        const { tenant_id } = req.tenant;

        if (!productoId) {
            return res.status(400).json({ 
                error: 'El ID del producto es requerido' 
            });
        }

        const query = `
            SELECT 
                pv.varianteid,
                pv.sku,
                pv.dimensiones,
                pv.color_nombre,
                pv.color_hex,
                p.nombreproducto,
                COALESCE(
                    (SELECT pvi.url_imagen 
                     FROM producto_variante_imagenes pvi 
                     WHERE pvi.varianteid = pv.varianteid AND pvi.tenant_id = $2
                     ORDER BY pvi.orden ASC LIMIT 1),
                    (SELECT pi.url_imagen 
                     FROM producto_imagenes pi 
                     WHERE pi.productoid = p.productoid AND pi.tenant_id = $2
                     ORDER BY pi.orden ASC LIMIT 1)
                ) as imagen_url
            FROM producto_variantes pv
            INNER JOIN productos p ON pv.productoid = p.productoid
            WHERE p.productoid = $1 
                AND p.tenant_id = $2
                AND pv.tenant_id = $2
                AND COALESCE(pv.activo, TRUE) = TRUE
            ORDER BY pv.varianteid ASC
        `;

        const result = await pool.query(query, [productoId, tenant_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ 
                error: 'No se encontraron variantes para este producto' 
            });
        }

        console.log(`📦 [VARIANTES] Producto ID ${productoId} - ${result.rows.length} variantes encontradas`);

        res.json({
            success: true,
            variantes: result.rows
        });

    } catch (error) {
        console.error('❌ Error en getVariantesProducto:', error);
        res.status(500).json({ 
            error: 'Error al obtener variantes',
            detalle: error.message 
        });
    }
};

module.exports = {
    registrarAjusteInventario,
    obtenerHistorialMovimientos,
    obtenerMotivosAjuste,
    obtenerEstadisticasAjustes,
    buscarProductoPorSKU,
    buscarProductosAutocompletado,
    getVariantesProducto
};
