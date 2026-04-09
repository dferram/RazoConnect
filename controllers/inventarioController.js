const ExcelJS = require('exceljs');
const logger = require('../utils/logger');
const db = require('../db');
const { format } = require('date-fns');
const SmartStockService = require('../services/SmartStockService');

/**
 * Exporta entradas de almacén a Excel y las marca como exportadas
 */
async function exportarEntradasAlmacen(req, res) {
    const client = await db.getClient();
    const tenant_id = req.tenant?.tenant_id || 1;

    try {
        await client.query('BEGIN');

        // 1. Obtener órdenes pendientes de exportar
        const { rows } = await client.query(`
            SELECT
                oc.ordenid,
                oc.fecha_recepcion,
                doc.sku,
                p.descripcion,
                doc.cantidad_recibida as paquetes_recibidos,
                doc.piezasporpaquete,
                doc.piezasrecibidas,
                doc.costo_unitario
            FROM ordenesdecompra oc
            INNER JOIN detallesordencompra doc ON doc.ordenid = oc.ordenid
            INNER JOIN productos p ON p.sku = doc.sku
            WHERE oc.estatus = 'RECIBIDO'
            AND oc.exportado_en IS NULL
            AND oc.tenant_id = $1
            ORDER BY oc.ordenid, doc.sku
        `, [tenant_id]);

        if (rows.length === 0) {
            return res.status(404).json({
                message: 'No hay entradas pendientes de exportar'
            });
        }

        // 2. Generar ID único para el reporte
        const reporteId = `ENT-${format(new Date(), 'yyyyMMddHHmmss')}`;

        // 3. Crear workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Entradas Almacén');

        // 4. Configurar columnas
        worksheet.columns = [
            { header: 'PEDIDO', key: 'pedido', width: 12 },
            { header: 'CODIGO', key: 'codigo', width: 15 },
            { header: 'DESCRIPCIÓN', key: 'descripcion', width: 40 },
            { header: 'CANTIDAD', key: 'cantidad', width: 12 },
            { header: 'PRECIO UNITARIO', key: 'precio', width: 15 },
            { header: 'TOTAL', key: 'total', width: 15 }
        ];

        // 5. Estilo del encabezado
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '217346' }
        };
        headerRow.alignment = { horizontal: 'center' };

        // 6. Agregar datos y fórmulas
        rows.forEach((record, index) => {
            const rowNumber = index + 2;
            worksheet.addRow({
                pedido: record.ordenid,
                codigo: record.sku,
                descripcion: record.descripcion,
                cantidad: record.paquetes_recibidos, // Paquetes, no piezas totales
                precio: record.costo_unitario
            });

            // Formato moneda
            worksheet.getCell(`E${rowNumber}`).numFmt = '$#,##0.00';
            worksheet.getCell(`F${rowNumber}`).numFmt = '$#,##0.00';

            // Fórmula total
            worksheet.getCell(`F${rowNumber}`).value = {
                formula: `D${rowNumber}*E${rowNumber}`
            };
        });

        // 7. Marcar órdenes como exportadas
        await client.query(`
            UPDATE ordenesdecompra
            SET exportado_en = NOW(),
                reporte_id = $1
            WHERE ordenid IN (
                SELECT DISTINCT ordenid
                FROM ordenesdecompra oc
                WHERE oc.estatus = 'RECIBIDO'
                AND oc.exportado_en IS NULL
                AND oc.tenant_id = $2
            )
            AND tenant_id = $2
        `, [reporteId, tenant_id]);

        // 8. Commit y generar archivo
        await client.query('COMMIT');
        const buffer = await workbook.xlsx.writeBuffer();

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=Entradas_Almacen_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
        res.send(buffer);

    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Error en exportación de entradas:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
        res.status(500).json({
            success: false,
            message: 'Error al generar el reporte de entradas'
        });
    } finally {
        client.release();
    }
}

/**
 * Obtiene órdenes pendientes con paginación
 */
async function getOrdenesPendientes(req, res) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const tenant_id = req.tenant?.tenant_id || 1;

    const client = await db.getClient();

    try {
        // Total de registros
        const { rows: [count] } = await client.query(`
            SELECT COUNT(*) as total
            FROM ordenesdecompra
            WHERE estatus = 'PENDIENTE'
            AND tenant_id = $1
        `, [tenant_id]);

        // Datos paginados
        const { rows: ordenes } = await client.query(`
            SELECT
                oc.ordenid,
                oc.fecha_creacion,
                oc.fecha_recepcion,
                oc.estatus,
                p.nombre as proveedor,
                COUNT(doc.detalleid) as total_items,
                SUM(doc.cantidad_solicitada) as total_piezas,
                SUM(doc.cantidad_solicitada * doc.costo_unitario) as valor_total
            FROM ordenesdecompra oc
            INNER JOIN proveedores p ON p.proveedorid = oc.proveedorid
            LEFT JOIN detallesordencompra doc ON doc.ordenid = oc.ordenid
            WHERE oc.estatus = 'PENDIENTE'
            AND oc.tenant_id = $1
            GROUP BY oc.ordenid, p.nombre
            ORDER BY oc.fecha_creacion DESC
            LIMIT $2 OFFSET $3
        `, [tenant_id, limit, offset]);

        const totalPages = Math.ceil(count.total / limit);

        res.json({
            data: ordenes,
            total: parseInt(count.total),
            pagina: page,
            totalPaginas: totalPages
        });

    } catch (error) {
        logger.error('Error al obtener órdenes:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
        res.status(500).json({
            success: false,
            message: 'Error al obtener órdenes pendientes'
        });
    } finally {
        client.release();
    }
}

/**
 * Crear nueva sesión de inventario
 */
async function crearSesionInventario(req, res) {
    const { nombre, descripcion, notas } = req.body;
    const { tenant_id } = req.tenant;
    const adminId = req.user?.admin_responsable_id ?? req.user?.id;
    const isAdmin = req.user.roles && req.user.roles.includes('admin');

    if (!isAdmin) {
        return res.status(403).json({
            success: false,
            message: 'Solo administradores pueden crear sesiones de inventario'
        });
    }

    if (!nombre || nombre.trim() === '') {
        return res.status(400).json({
            success: false,
            message: 'El nombre de la sesión es obligatorio'
        });
    }

    const client = await db.getClient();
    
    try {
        await client.query('BEGIN');

        const { rows } = await client.query(`
            INSERT INTO sesiones_inventario (
                nombre, 
                descripcion, 
                notas,
                admin_creador_id,
                tenant_id,
                estatus
            )
            VALUES ($1, $2, $3, $4, $5, 'ACTIVA')
            RETURNING sesion_id, nombre, descripcion, fecha_inicio, estatus, fecha_creacion
        `, [nombre.trim(), descripcion || null, notas || null, adminId, tenant_id]);

        await client.query('COMMIT');

        res.status(201).json({
            success: true,
            message: 'Sesión de inventario creada exitosamente',
            data: {
                sesion: rows[0]
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Error al crear sesión de inventario:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
        
        if (error.code === '23505') {
            return res.status(409).json({
                success: false,
                message: 'Ya existe una sesión con ese nombre en la misma fecha'
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Error al crear la sesión de inventario'
        });
    } finally {
        client.release();
    }
}

/**
 * Listar sesiones de inventario con control de acceso por rol
 */
async function listarSesionesInventario(req, res) {
    const { tenant_id } = req.tenant;
    const userId = req.user.id || req.user.userId;
    const userRoles = req.user.roles || [];
    
    // Determinar el rol del usuario
    const isSuperAdmin = userRoles.includes('superadmin') || userRoles.includes('super-admin');
    const isAdmin = userRoles.includes('admin');
    const isAgent = userRoles.includes('agente');

    const { estatus, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const client = await db.getClient();
    
    try {
        let whereClause = 'si.tenant_id = $1';
        let params = [tenant_id];
        let paramIndex = 2;

        // CONTROL DE ACCESO POR ROL:
        // 1. Super Admin: Ve TODAS las sesiones del tenant (sin filtro adicional)
        // 2. Admin regular: Solo ve las sesiones que él creó
        // 3. Agente: Solo ve las sesiones asignadas a él
        
        if (isAgent && !isAdmin && !isSuperAdmin) {
            // Agente: Solo sesiones asignadas a él
            whereClause += ` AND si.agente_asignado_id = $${paramIndex}`;
            params.push(userId);
            paramIndex++;
        } else if (isAdmin && !isSuperAdmin) {
            // Admin regular: Solo sesiones que él creó
            whereClause += ` AND si.admin_creador_id = $${paramIndex}`;
            params.push(userId);
            paramIndex++;
        }
        // Super Admin: No se agrega filtro adicional, ve todas las sesiones

        // Filtro por estatus
        if (estatus && ['ACTIVA', 'PAUSADA', 'FINALIZADA', 'CANCELADA'].includes(estatus.toUpperCase())) {
            whereClause += ` AND si.estatus = $${paramIndex}`;
            params.push(estatus.toUpperCase());
            paramIndex++;
        }

        // Contar total de registros
        const { rows: [countRow] } = await client.query(`
            SELECT COUNT(*) as total
            FROM sesiones_inventario si
            WHERE ${whereClause}
        `, params);

        // Obtener sesiones con información del agente y admin
        // MISIÓN 3: NULL Safety - manejar sesiones sin agente asignado (legadas)
        const { rows: sesiones } = await client.query(`
            SELECT 
                si.sesion_id,
                si.nombre,
                si.descripcion,
                si.fecha_inicio,
                si.fecha_fin,
                si.estatus,
                si.notas,
                si.fecha_creacion,
                si.fecha_actualizacion,
                si.agente_asignado_id,
                CASE 
                    WHEN si.agente_asignado_id IS NOT NULL AND a.agenteid IS NOT NULL
                    THEN a.nombre || ' ' || a.apellido
                    WHEN si.agente_asignado_id IS NULL
                    THEN 'Sin Asignar'
                    ELSE 'Agente No Disponible'
                END as agente_nombre,
                a.email as agente_email,
                COALESCE(adm.nombre || ' ' || adm.apellido, 'Admin Desconocido') as admin_creador
            FROM sesiones_inventario si
            LEFT JOIN agentesdeventas a ON si.agente_asignado_id = a.agenteid AND a.activo = true
            LEFT JOIN administradores adm ON si.admin_creador_id = adm.adminid
            WHERE ${whereClause}
            ORDER BY si.fecha_creacion DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `, [...params, parseInt(limit), offset]);

        const totalPages = Math.ceil(countRow.total / parseInt(limit));

        res.json({
            success: true,
            data: {
                sesiones,
                pagination: {
                    total: parseInt(countRow.total),
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages
                }
            }
        });

    } catch (error) {
        logger.error('Error al listar sesiones de inventario:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
        res.status(500).json({
            success: false,
            message: 'Error al obtener las sesiones de inventario'
        });
    } finally {
        client.release();
    }
}

/**
 * Obtener detalle de una sesión específica con validación de acceso
 */
async function obtenerSesionInventario(req, res) {
    const { sesionId } = req.params;
    const { tenant_id } = req.tenant;
    const userId = req.user.id || req.user.userId;
    const userRoles = req.user.roles || [];
    
    // Determinar el rol del usuario
    const isSuperAdmin = userRoles.includes('superadmin') || userRoles.includes('super-admin');
    const isAdmin = userRoles.includes('admin');
    const isAgent = userRoles.includes('agente');

    const client = await db.getClient();
    
    try {
        // MISIÓN 1: Usar tabla correcta toma_inventario_sesiones
        const { rows } = await client.query(`
            SELECT 
                si.sesionid as sesion_id,
                si.nombre,
                si.estatus,
                si.fechainicio as fecha_inicio,
                si.fechacierre as fecha_cierre,
                si.agente_asignado_id,
                si.usuario_creador_id,
                CASE 
                    WHEN si.agente_asignado_id IS NOT NULL AND a.agenteid IS NOT NULL
                    THEN a.nombre || ' ' || a.apellido
                    WHEN si.agente_asignado_id IS NULL
                    THEN 'Sin Asignar'
                    ELSE 'Agente No Disponible'
                END as agente_nombre,
                a.email as agente_email
            FROM toma_inventario_sesiones si
            LEFT JOIN agentesdeventas a ON si.agente_asignado_id = a.agenteid AND a.activo = true
            WHERE si.sesionid = $1 AND si.tenant_id = $2
        `, [sesionId, tenant_id]);

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Sesión de inventario no encontrada'
            });
        }

        const sesion = rows[0];

        // VALIDACIÓN DE SEGURIDAD POR ROL:
        // 1. Super Admin: Acceso total
        // 2. Admin regular: Solo sesiones que él creó
        // 3. Agente: Solo sesiones asignadas a él
        
        if (isSuperAdmin) {
            // Super Admin tiene acceso total, continuar
        } else if (isAdmin && sesion.usuario_creador_id !== userId) {
            // Admin regular intentando acceder a sesión que no creó
            return res.status(403).json({
                success: false,
                message: 'No tienes permiso para acceder a esta sesión de inventario'
            });
        } else if (isAgent && !isAdmin && sesion.agente_asignado_id !== userId) {
            // Agente intentando acceder a sesión no asignada a él
            return res.status(403).json({
                success: false,
                message: 'No tienes permiso para acceder a esta sesión de inventario'
            });
        }

        res.json({
            success: true,
            data: sesion
        });

    } catch (error) {
        logger.error('Error al obtener sesión de inventario:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
        res.status(500).json({
            success: false,
            message: 'Error al obtener la sesión de inventario'
        });
    } finally {
        client.release();
    }
}

/**
 * Asignar agente a una sesión de inventario
 */
async function asignarAgenteASesion(req, res) {
    const { sesionId } = req.params;
    const { agenteId } = req.body;
    const { tenant_id } = req.tenant;
    const isAdmin = req.user.roles && req.user.roles.includes('admin');

    if (!isAdmin) {
        return res.status(403).json({
            success: false,
            message: 'Solo administradores pueden asignar agentes'
        });
    }

    if (!agenteId) {
        return res.status(400).json({
            success: false,
            message: 'El ID del agente es obligatorio'
        });
    }

    const client = await db.getClient();
    
    try {
        await client.query('BEGIN');

        // Verificar que la sesión existe y pertenece al tenant
        const { rows: sesionRows } = await client.query(`
            SELECT sesion_id, nombre, estatus 
            FROM sesiones_inventario 
            WHERE sesion_id = $1 AND tenant_id = $2
        `, [sesionId, tenant_id]);

        if (sesionRows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                message: 'Sesión de inventario no encontrada'
            });
        }

        // Verificar que el agente existe, está activo y pertenece al tenant
        const { rows: agenteRows } = await client.query(`
            SELECT agenteid, nombre, apellido, email 
            FROM agentesdeventas 
            WHERE agenteid = $1 AND tenant_id = $2 AND activo = true
        `, [agenteId, tenant_id]);

        if (agenteRows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                message: 'Agente no encontrado o inactivo'
            });
        }

        const agente = agenteRows[0];
        const sesion = sesionRows[0];

        // Actualizar la sesión con el agente asignado
        await client.query(`
            UPDATE sesiones_inventario 
            SET agente_asignado_id = $1
            WHERE sesion_id = $2 AND tenant_id = $3
        `, [agenteId, sesionId, tenant_id]);

        await client.query('COMMIT');

        res.json({
            success: true,
            message: `Agente ${agente.nombre} ${agente.apellido} asignado exitosamente a la sesión "${sesion.nombre}"`,
            data: {
                sesionId: sesion.sesion_id,
                agenteId: agente.agenteid,
                agenteNombre: `${agente.nombre} ${agente.apellido}`,
                agenteEmail: agente.email
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Error al asignar agente a sesión:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
        res.status(500).json({
            success: false,
            message: 'Error al asignar el agente a la sesión'
        });
    } finally {
        client.release();
    }
}

/**
 * Obtener lista de agentes disponibles para asignación
 */
async function obtenerAgentesDisponibles(req, res) {
    const { tenant_id } = req.tenant;
    const isAdmin = req.user.roles && req.user.roles.includes('admin');

    if (!isAdmin) {
        return res.status(403).json({
            success: false,
            message: 'Solo administradores pueden ver la lista de agentes'
        });
    }

    const client = await db.getClient();
    
    try {
        const { rows: agentes } = await client.query(`
            SELECT 
                agenteid,
                nombre,
                apellido,
                email,
                telefono,
                codigoagente
            FROM agentesdeventas
            WHERE tenant_id = $1 AND activo = true
            ORDER BY nombre, apellido
        `, [tenant_id]);

        res.json({
            success: true,
            data: { agentes }
        });

    } catch (error) {
        logger.error('Error al obtener agentes disponibles:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
        res.status(500).json({
            success: false,
            message: 'Error al obtener la lista de agentes'
        });
    } finally {
        client.release();
    }
}

/**
 * Actualizar estatus de una sesión de inventario
 */
async function actualizarEstatusSesion(req, res) {
    const { sesionId } = req.params;
    const { estatus, notas } = req.body;
    const { tenant_id } = req.tenant;
    const isAdmin = req.user.roles && req.user.roles.includes('admin');

    if (!isAdmin) {
        return res.status(403).json({
            success: false,
            message: 'Solo administradores pueden actualizar el estatus de sesiones'
        });
    }

    const estatusValidos = ['ACTIVA', 'PAUSADA', 'FINALIZADA', 'CANCELADA'];
    if (!estatus || !estatusValidos.includes(estatus.toUpperCase())) {
        return res.status(400).json({
            success: false,
            message: `Estatus inválido. Debe ser uno de: ${estatusValidos.join(', ')}`
        });
    }

    const client = await db.getClient();
    
    try {
        await client.query('BEGIN');

        const updateFields = ['estatus = $1'];
        const params = [estatus.toUpperCase()];
        let paramIndex = 2;

        if (notas !== undefined) {
            updateFields.push(`notas = $${paramIndex}`);
            params.push(notas);
            paramIndex++;
        }

        if (estatus.toUpperCase() === 'FINALIZADA') {
            updateFields.push(`fecha_fin = NOW()`);
        }

        params.push(sesionId, tenant_id);

        const { rowCount } = await client.query(`
            UPDATE sesiones_inventario 
            SET ${updateFields.join(', ')}
            WHERE sesion_id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
        `, params);

        if (rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                message: 'Sesión de inventario no encontrada'
            });
        }

        await client.query('COMMIT');

        res.json({
            success: true,
            message: 'Estatus de la sesión actualizado exitosamente'
        });

    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Error al actualizar estatus de sesión:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
        res.status(500).json({
            success: false,
            message: 'Error al actualizar el estatus de la sesión'
        });
    } finally {
        client.release();
    }
}

/**
 * Obtener todo el inventario con stock > 0 para exportación a PDF
 */
async function obtenerInventarioParaPDF(req, res) {
    try {
        const tenant_id = req.tenant?.tenant_id || req.user?.tenantId || 1;
        const userId = req.user?.id || req.user?.userId;
        const userRoles = req.user?.roles || [];

        // ✅ SMART STOCK: Obtener variantes sin filtro de stock
        const query = `
            SELECT 
                pv.varianteid,
                pv.sku,
                p.nombreproducto,
                pv.dimensiones,
                COALESCE(pv.ubicacion_almacen, '') as ubicacion
            FROM producto_variantes pv
            INNER JOIN productos p ON p.productoid = pv.productoid
            WHERE p.tenant_id = $1
            ORDER BY p.nombreproducto ASC, pv.sku ASC
        `;

        const { rows } = await db.query(query, [tenant_id]);

        // ✅ SMART STOCK: Obtener stock dinámico según rol del usuario
        const varianteIds = rows.map(r => r.varianteid);
        let stockMap = new Map();

        if (varianteIds.length > 0 && userId) {
            try {
                stockMap = await SmartStockService.getBulkStock({
                    varianteIds,
                    userId,
                    userRole: userRoles,
                    tenantId: tenant_id,
                    estadoId: req.user?.estadoId || null
                });
                logger.info('Stock obtenido para variantes', {
                    count: varianteIds.length,
                    userId,
                    requestId: req.requestId,
                    tenantId: tenant_id
                });
            } catch (stockError) {
                logger.error('[InventarioController] Error al obtener stock dinámico:', {
      error: stockError.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
                // Fallback: retornar sin stock si falla
            }
        }

        // Filtrar solo variantes con stock > 0 y mapear con stock dinámico
        const inventarioConStock = rows
            .map(row => ({
                sku: row.sku || 'Sin SKU',
                producto: row.nombreproducto || 'Sin nombre',
                variante: row.dimensiones || 'Estándar',
                ubicacion: row.ubicacion || 'N/A',
                stock: stockMap.get(row.varianteid) || 0,
                varianteId: row.varianteid // Agregar ID para desglose
            }))
            .filter(item => item.stock > 0);

        // ✅ SMART STOCK: Si es Super Admin, agregar distribución de stock
        const isSuperAdmin = userRoles.some(r => 
            r === 'superadmin' || r === 'super-admin' || r === 'developer'
        );

        if (isSuperAdmin && inventarioConStock.length > 0) {
            // Obtener distribución de stock para cada variante
            for (const item of inventarioConStock) {
                try {
                    const breakdown = await SmartStockService.getGlobalStockBreakdown(
                        item.varianteId,
                        tenant_id
                    );

                    // Agregar campo stock_distribucion con el desglose
                    item.stock_distribucion = [
                        // Bodega Central (diferencia entre global y distribuido)
                        ...(breakdown.diferencia > 0 ? [{
                            nombre: 'Bodega Central',
                            cantidad: breakdown.diferencia,
                            tipo: 'bodega'
                        }] : []),
                        // Stock de cada admin
                        ...breakdown.stockPorAdmin.map(admin => ({
                            nombre: admin.adminNombre,
                            cantidad: admin.cantidad,
                            tipo: 'admin',
                            adminId: admin.adminId
                        }))
                    ];
                } catch (error) {
                    logger.error('[InventarioController] Error al obtener distribución para variante ${item.varianteId}:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
                    item.stock_distribucion = [];
                }
            }
            logger.info('Distribución de stock agregada para Super Admin', {
                requestId: req.requestId,
                tenantId: tenant_id
            });
        }

        logger.info('Inventario filtrado para PDF', {
            count: inventarioConStock.length,
            requestId: req.requestId,
            tenantId: tenant_id
        });

        return res.json({
            success: true,
            data: inventarioConStock,
            isSuperAdmin // Indicar al frontend si es Super Admin
        });
    } catch (error) {
        logger.error('Error al obtener inventario para PDF:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
        return res.status(500).json({
            success: false,
            message: 'Error al obtener inventario'
        });
    }
}

module.exports = {
    exportarEntradasAlmacen,
    getOrdenesPendientes,
    crearSesionInventario,
    listarSesionesInventario,
    obtenerSesionInventario,
    asignarAgenteASesion,
    obtenerAgentesDisponibles,
    actualizarEstatusSesion,
    obtenerInventarioParaPDF
};
