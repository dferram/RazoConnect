const db = require('../db');
const logger = require('../utils/logger');
const PDFDocument = require('pdfkit');
const { format, startOfMonth, endOfMonth, subMonths } = require('date-fns');
const { es } = require('date-fns/locale');
const path = require('path');
const fs = require('fs');

/**
 * Obtiene el estado de cuenta mensual de un cliente (tipo banco)
 * @route GET /api/admin/cxc/estado-cuenta/:clienteId
 */
async function getEstadoCuentaMensual(req, res) {
    const { clienteId } = req.params;
    const { mes, anio } = req.query;
    const tenant_id = req.tenant?.tenant_id || 1;
    const adminId = req.user?.admin_responsable_id ?? req.user?.adminid;

    if (!clienteId) {
        return res.status(400).json({
            success: false,
            message: 'ID de cliente requerido'
        });
    }

    // Si no se proporciona mes/año, usar el mes actual
    const fechaConsulta = mes && anio 
        ? new Date(parseInt(anio), parseInt(mes) - 1, 1)
        : new Date();

    const fechaInicio = startOfMonth(fechaConsulta);
    const fechaFin = endOfMonth(fechaConsulta);

    const client = await db.pool.connect();

    try {
        // Información del cliente y crédito
        const { rows: [clienteInfo] } = await client.query(`
            SELECT
                c.clienteid,
                c.nombre,
                c.apellido,
                c.email,
                c.telefono,
                cc.credito_id,
                cc.limite_credito,
                cc.saldo_deudor,
                cc.estado_credito,
                cc.dias_gracia,
                cc.ultima_actualizacion
            FROM clientes c
            INNER JOIN cliente_creditos cc ON cc.cliente_id = c.clienteid
            INNER JOIN administrador_estados ae ON ae.estado_id = c.estado_id
            WHERE c.clienteid = $1
              AND c.tenant_id = $2
              AND ae.admin_id = $3
        `, [clienteId, tenant_id, adminId]);

        if (!clienteInfo) {
            return res.status(404).json({
                success: false,
                message: 'Cliente no encontrado o sin acceso'
            });
        }

        // Obtener saldo al inicio del mes (último movimiento antes del mes)
        const { rows: [saldoInicial] } = await client.query(`
            SELECT 
                COALESCE(saldo_despues_movimiento, 0) as saldo_inicial
            FROM credito_movimientos
            WHERE credito_id = $1
              AND fecha_movimiento < $2
            ORDER BY fecha_movimiento DESC, movimiento_id DESC
            LIMIT 1
        `, [clienteInfo.credito_id, fechaInicio]);

        const saldoInicialMes = parseFloat(saldoInicial?.saldo_inicial || 0);

        // Obtener todos los movimientos del mes
        const { rows: movimientos } = await client.query(`
            SELECT
                cm.movimiento_id,
                cm.tipo_movimiento,
                cm.monto,
                cm.referencia_id,
                cm.descripcion,
                cm.fecha_movimiento,
                cm.saldo_despues_movimiento,
                cm.remision_id,
                cm.pedido_id,
                cm.metodo_pago,
                cm.referencia,
                r.folio AS remision_folio,
                r.total_remision AS remision_monto,
                p.pedidoid AS pedido_numero,
                COALESCE(a.nombre, 'Sistema') AS registrado_por
            FROM credito_movimientos cm
            LEFT JOIN administradores a ON a.adminid = cm.admin_id
            LEFT JOIN remisiones r ON r.remision_id = cm.remision_id
            LEFT JOIN pedidos p ON p.pedidoid = cm.pedido_id
            WHERE cm.credito_id = $1
              AND cm.fecha_movimiento >= $2
              AND cm.fecha_movimiento <= $3
            ORDER BY cm.fecha_movimiento ASC, cm.movimiento_id ASC
        `, [clienteInfo.credito_id, fechaInicio, fechaFin]);

        // Calcular totales del mes
        const totales = movimientos.reduce((acc, mov) => {
            const monto = parseFloat(mov.monto);
            if (['CARGO', 'RESERVA'].includes(mov.tipo_movimiento)) {
                acc.totalCargos += monto;
            } else if (['ABONO', 'PAGO'].includes(mov.tipo_movimiento)) {
                acc.totalAbonos += monto;
            } else if (mov.tipo_movimiento === 'AJUSTE') {
                // Los ajustes pueden ser positivos o negativos
                if (monto > 0) {
                    acc.totalAbonos += monto;
                } else {
                    acc.totalCargos += Math.abs(monto);
                }
            }
            return acc;
        }, { totalCargos: 0, totalAbonos: 0 });

        // Obtener lista de meses disponibles (últimos 12 meses con movimientos)
        const { rows: mesesDisponibles } = await client.query(`
            SELECT DISTINCT
                EXTRACT(YEAR FROM fecha_movimiento)::integer AS anio,
                EXTRACT(MONTH FROM fecha_movimiento)::integer AS mes,
                TO_CHAR(fecha_movimiento, 'TMMonth YYYY') AS nombre_mes,
                COUNT(*) as cantidad_movimientos
            FROM credito_movimientos
            WHERE credito_id = $1
              AND fecha_movimiento >= $2
            GROUP BY EXTRACT(YEAR FROM fecha_movimiento), EXTRACT(MONTH FROM fecha_movimiento), TO_CHAR(fecha_movimiento, 'TMMonth YYYY')
            ORDER BY anio DESC, mes DESC
            LIMIT 12
        `, [clienteInfo.credito_id, subMonths(new Date(), 12)]);

        return res.json({
            success: true,
            data: {
                cliente: {
                    id: clienteInfo.clienteid,
                    nombre: `${clienteInfo.nombre} ${clienteInfo.apellido}`,
                    email: clienteInfo.email,
                    telefono: clienteInfo.telefono
                },
                credito: {
                    id: clienteInfo.credito_id,
                    limiteCredito: parseFloat(clienteInfo.limite_credito),
                    saldoActual: parseFloat(clienteInfo.saldo_deudor),
                    creditoDisponible: parseFloat(clienteInfo.limite_credito) - parseFloat(clienteInfo.saldo_deudor),
                    estadoCredito: clienteInfo.estado_credito,
                    diasGracia: clienteInfo.dias_gracia
                },
                periodo: {
                    mes: fechaConsulta.getMonth() + 1,
                    anio: fechaConsulta.getFullYear(),
                    nombreMes: format(fechaConsulta, 'MMMM yyyy', { locale: es }),
                    fechaInicio: format(fechaInicio, 'yyyy-MM-dd'),
                    fechaFin: format(fechaFin, 'yyyy-MM-dd')
                },
                saldos: {
                    saldoInicial: saldoInicialMes,
                    totalCargos: totales.totalCargos,
                    totalAbonos: totales.totalAbonos,
                    saldoFinal: parseFloat(clienteInfo.saldo_deudor)
                },
                movimientos: movimientos.map(mov => ({
                    id: mov.movimiento_id,
                    fecha: mov.fecha_movimiento,
                    tipo: mov.tipo_movimiento,
                    descripcion: mov.descripcion,
                    referencia: mov.referencia_id || mov.referencia,
                    cargo: ['CARGO', 'RESERVA'].includes(mov.tipo_movimiento) ? parseFloat(mov.monto) : null,
                    abono: ['ABONO', 'PAGO', 'AJUSTE'].includes(mov.tipo_movimiento) ? parseFloat(mov.monto) : null,
                    saldo: parseFloat(mov.saldo_despues_movimiento),
                    metodoPago: mov.metodo_pago,
                    remisionFolio: mov.remision_folio,
                    pedidoNumero: mov.pedido_numero,
                    registradoPor: mov.registrado_por
                })),
                mesesDisponibles: mesesDisponibles.map(m => ({
                    anio: m.anio,
                    mes: m.mes,
                    nombreMes: m.nombre_mes,
                    cantidadMovimientos: parseInt(m.cantidad_movimientos)
                }))
            }
        });

    } catch (error) {
        logger.error('Error obteniendo estado de cuenta mensual:', {
            error: error.message,
            requestId: req.requestId,
            tenantId: req.tenant?.tenant_id,
            clienteId
        });
        return res.status(500).json({
            success: false,
            message: 'Error al obtener el estado de cuenta'
        });
    } finally {
        client.release();
    }
}

/**
 * Obtiene el estado de cuenta del cliente autenticado (para portal de clientes)
 * @route GET /api/clientes/mi-estado-cuenta
 */
async function getEstadoCuentaCliente(req, res) {
    const clienteId = req.user?.clienteid;
    const { mes, anio } = req.query;
    const tenant_id = req.tenant?.tenant_id || 1;

    if (!clienteId) {
        return res.status(401).json({
            success: false,
            message: 'Cliente no autenticado'
        });
    }

    const fechaConsulta = mes && anio 
        ? new Date(parseInt(anio), parseInt(mes) - 1, 1)
        : new Date();

    const fechaInicio = startOfMonth(fechaConsulta);
    const fechaFin = endOfMonth(fechaConsulta);

    const client = await db.pool.connect();

    try {
        // Información del cliente y crédito
        const { rows: [clienteInfo] } = await client.query(`
            SELECT
                c.clienteid,
                c.nombre,
                c.apellido,
                c.email,
                c.telefono,
                cc.credito_id,
                cc.limite_credito,
                cc.saldo_deudor,
                cc.estado_credito,
                cc.dias_gracia
            FROM clientes c
            INNER JOIN cliente_creditos cc ON cc.cliente_id = c.clienteid
            WHERE c.clienteid = $1
              AND c.tenant_id = $2
        `, [clienteId, tenant_id]);

        if (!clienteInfo) {
            return res.status(404).json({
                success: false,
                message: 'Información de crédito no encontrada'
            });
        }

        // Saldo inicial del mes
        const { rows: [saldoInicial] } = await client.query(`
            SELECT 
                COALESCE(saldo_despues_movimiento, 0) as saldo_inicial
            FROM credito_movimientos
            WHERE credito_id = $1
              AND fecha_movimiento < $2
            ORDER BY fecha_movimiento DESC, movimiento_id DESC
            LIMIT 1
        `, [clienteInfo.credito_id, fechaInicio]);

        const saldoInicialMes = parseFloat(saldoInicial?.saldo_inicial || 0);

        // Movimientos del mes
        const { rows: movimientos } = await client.query(`
            SELECT
                cm.movimiento_id,
                cm.tipo_movimiento,
                cm.monto,
                cm.referencia_id,
                cm.descripcion,
                cm.fecha_movimiento,
                cm.saldo_despues_movimiento,
                cm.metodo_pago,
                r.folio AS remision_folio,
                p.pedidoid AS pedido_numero
            FROM credito_movimientos cm
            LEFT JOIN remisiones r ON r.remision_id = cm.remision_id
            LEFT JOIN pedidos p ON p.pedidoid = cm.pedido_id
            WHERE cm.credito_id = $1
              AND cm.fecha_movimiento >= $2
              AND cm.fecha_movimiento <= $3
            ORDER BY cm.fecha_movimiento ASC, cm.movimiento_id ASC
        `, [clienteInfo.credito_id, fechaInicio, fechaFin]);

        // Calcular totales
        const totales = movimientos.reduce((acc, mov) => {
            const monto = parseFloat(mov.monto);
            if (['CARGO', 'RESERVA'].includes(mov.tipo_movimiento)) {
                acc.totalCargos += monto;
            } else if (['ABONO', 'PAGO', 'AJUSTE'].includes(mov.tipo_movimiento)) {
                acc.totalAbonos += monto;
            }
            return acc;
        }, { totalCargos: 0, totalAbonos: 0 });

        // Meses disponibles
        const { rows: mesesDisponibles } = await client.query(`
            SELECT DISTINCT
                EXTRACT(YEAR FROM fecha_movimiento)::integer AS anio,
                EXTRACT(MONTH FROM fecha_movimiento)::integer AS mes,
                TO_CHAR(fecha_movimiento, 'TMMonth YYYY') AS nombre_mes
            FROM credito_movimientos
            WHERE credito_id = $1
              AND fecha_movimiento >= $2
            GROUP BY EXTRACT(YEAR FROM fecha_movimiento), EXTRACT(MONTH FROM fecha_movimiento), TO_CHAR(fecha_movimiento, 'TMMonth YYYY')
            ORDER BY anio DESC, mes DESC
            LIMIT 12
        `, [clienteInfo.credito_id, subMonths(new Date(), 12)]);

        return res.json({
            success: true,
            data: {
                cliente: {
                    nombre: `${clienteInfo.nombre} ${clienteInfo.apellido}`,
                    email: clienteInfo.email,
                    telefono: clienteInfo.telefono
                },
                credito: {
                    limiteCredito: parseFloat(clienteInfo.limite_credito),
                    saldoActual: parseFloat(clienteInfo.saldo_deudor),
                    creditoDisponible: parseFloat(clienteInfo.limite_credito) - parseFloat(clienteInfo.saldo_deudor),
                    estadoCredito: clienteInfo.estado_credito
                },
                periodo: {
                    mes: fechaConsulta.getMonth() + 1,
                    anio: fechaConsulta.getFullYear(),
                    nombreMes: format(fechaConsulta, 'MMMM yyyy', { locale: es })
                },
                saldos: {
                    saldoInicial: saldoInicialMes,
                    totalCargos: totales.totalCargos,
                    totalAbonos: totales.totalAbonos,
                    saldoFinal: parseFloat(clienteInfo.saldo_deudor)
                },
                movimientos: movimientos.map(mov => ({
                    id: mov.movimiento_id,
                    fecha: mov.fecha_movimiento,
                    tipo: mov.tipo_movimiento,
                    descripcion: mov.descripcion,
                    referencia: mov.referencia_id,
                    cargo: ['CARGO', 'RESERVA'].includes(mov.tipo_movimiento) ? parseFloat(mov.monto) : null,
                    abono: ['ABONO', 'PAGO', 'AJUSTE'].includes(mov.tipo_movimiento) ? parseFloat(mov.monto) : null,
                    saldo: parseFloat(mov.saldo_despues_movimiento),
                    metodoPago: mov.metodo_pago,
                    remisionFolio: mov.remision_folio,
                    pedidoNumero: mov.pedido_numero
                })),
                mesesDisponibles
            }
        });

    } catch (error) {
        logger.error('Error obteniendo estado de cuenta del cliente:', {
            error: error.message,
            requestId: req.requestId,
            tenantId: req.tenant?.tenant_id,
            clienteId
        });
        return res.status(500).json({
            success: false,
            message: 'Error al obtener el estado de cuenta'
        });
    } finally {
        client.release();
    }
}

/**
 * Genera PDF del estado de cuenta mensual con diseño Razo
 * @route GET /api/admin/cxc/estado-cuenta/:clienteId/pdf
 */
async function generarPDFEstadoCuenta(req, res) {
    const { clienteId } = req.params;
    const { mes, anio } = req.query;
    const tenant_id = req.tenant?.tenant_id || 1;
    const adminId = req.user?.admin_responsable_id ?? req.user?.adminid;

    const fechaConsulta = mes && anio 
        ? new Date(parseInt(anio), parseInt(mes) - 1, 1)
        : new Date();

    const fechaInicio = startOfMonth(fechaConsulta);
    const fechaFin = endOfMonth(fechaConsulta);

    const client = await db.pool.connect();

    try {
        // Obtener datos del estado de cuenta
        const { rows: [clienteInfo] } = await client.query(`
            SELECT
                c.clienteid,
                c.nombre,
                c.apellido,
                c.email,
                c.telefono,
                cc.credito_id,
                cc.limite_credito,
                cc.saldo_deudor,
                cc.estado_credito,
                cc.dias_gracia
            FROM clientes c
            INNER JOIN cliente_creditos cc ON cc.cliente_id = c.clienteid
            INNER JOIN administrador_estados ae ON ae.estado_id = c.estado_id
            WHERE c.clienteid = $1
              AND c.tenant_id = $2
              AND ae.admin_id = $3
        `, [clienteId, tenant_id, adminId]);

        if (!clienteInfo) {
            return res.status(404).json({
                success: false,
                message: 'Cliente no encontrado'
            });
        }

        const { rows: [saldoInicial] } = await client.query(`
            SELECT COALESCE(saldo_despues_movimiento, 0) as saldo_inicial
            FROM credito_movimientos
            WHERE credito_id = $1 AND fecha_movimiento < $2
            ORDER BY fecha_movimiento DESC, movimiento_id DESC
            LIMIT 1
        `, [clienteInfo.credito_id, fechaInicio]);

        const { rows: movimientos } = await client.query(`
            SELECT
                cm.movimiento_id,
                cm.tipo_movimiento,
                cm.monto,
                cm.referencia_id,
                cm.descripcion,
                cm.fecha_movimiento,
                cm.saldo_despues_movimiento,
                r.folio AS remision_folio
            FROM credito_movimientos cm
            LEFT JOIN remisiones r ON r.remision_id = cm.remision_id
            WHERE cm.credito_id = $1
              AND cm.fecha_movimiento >= $2
              AND cm.fecha_movimiento <= $3
            ORDER BY cm.fecha_movimiento ASC, cm.movimiento_id ASC
        `, [clienteInfo.credito_id, fechaInicio, fechaFin]);

        // Crear PDF
        const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Estado_Cuenta_${clienteInfo.nombre}_${format(fechaConsulta, 'yyyy-MM')}.pdf`);
        
        doc.pipe(res);

        // Logo (si existe)
        const logoPath = path.join(__dirname, '..', 'icon', 'Logo_Razo.png');
        if (fs.existsSync(logoPath)) {
            doc.image(logoPath, 50, 45, { width: 60 });
        }

        // Encabezado
        doc.fontSize(20).fillColor('#FF6B35').text('ESTADO DE CUENTA', 150, 50, { align: 'left' });
        doc.fontSize(10).fillColor('#000000').text(`Periodo: ${format(fechaConsulta, 'MMMM yyyy', { locale: es }).toUpperCase()}`, 150, 75);
        doc.fontSize(8).fillColor('#666666').text(`Generado: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 150, 90);

        // Información del cliente
        doc.fontSize(12).fillColor('#000000').text('INFORMACIÓN DEL CLIENTE', 50, 130);
        doc.fontSize(10)
            .text(`Cliente: ${clienteInfo.nombre} ${clienteInfo.apellido}`, 50, 150)
            .text(`ID: ${clienteInfo.clienteid}`, 50, 165)
            .text(`Email: ${clienteInfo.email || 'N/A'}`, 50, 180)
            .text(`Teléfono: ${clienteInfo.telefono || 'N/A'}`, 50, 195);

        // Resumen de crédito
        doc.fontSize(12).fillColor('#000000').text('RESUMEN DE CRÉDITO', 350, 130);
        doc.fontSize(10)
            .text(`Límite de Crédito: $${parseFloat(clienteInfo.limite_credito).toFixed(2)}`, 350, 150)
            .text(`Saldo Actual: $${parseFloat(clienteInfo.saldo_deudor).toFixed(2)}`, 350, 165)
            .text(`Crédito Disponible: $${(parseFloat(clienteInfo.limite_credito) - parseFloat(clienteInfo.saldo_deudor)).toFixed(2)}`, 350, 180)
            .text(`Estado: ${clienteInfo.estado_credito}`, 350, 195);

        // Línea separadora
        doc.moveTo(50, 220).lineTo(562, 220).stroke();

        // Saldo inicial
        const saldoInicialMes = parseFloat(saldoInicial?.saldo_inicial || 0);
        doc.fontSize(11).fillColor('#000000').text(`Saldo Inicial (${format(fechaInicio, 'dd/MM/yyyy')}): $${saldoInicialMes.toFixed(2)}`, 50, 235);

        // Tabla de movimientos
        let y = 260;
        doc.fontSize(9).fillColor('#FFFFFF');
        
        // Encabezado de tabla
        doc.rect(50, y, 512, 20).fill('#FF6B35');
        doc.fillColor('#FFFFFF')
            .text('FECHA', 55, y + 5, { width: 70 })
            .text('DESCRIPCIÓN', 130, y + 5, { width: 150 })
            .text('CARGO', 285, y + 5, { width: 70, align: 'right' })
            .text('ABONO', 360, y + 5, { width: 70, align: 'right' })
            .text('SALDO', 435, y + 5, { width: 70, align: 'right' });

        y += 25;

        // Movimientos
        let totalCargos = 0;
        let totalAbonos = 0;

        movimientos.forEach((mov, index) => {
            if (y > 700) {
                doc.addPage();
                y = 50;
            }

            const monto = parseFloat(mov.monto);
            const esCargo = ['CARGO', 'RESERVA'].includes(mov.tipo_movimiento);
            const esAbono = ['ABONO', 'PAGO', 'AJUSTE'].includes(mov.tipo_movimiento);

            if (esCargo) totalCargos += monto;
            if (esAbono) totalAbonos += monto;

            // Fila alternada
            if (index % 2 === 0) {
                doc.rect(50, y - 2, 512, 18).fill('#F9F9F9');
            }

            doc.fillColor('#000000').fontSize(8)
                .text(format(new Date(mov.fecha_movimiento), 'dd/MM/yyyy'), 55, y, { width: 70 })
                .text(mov.descripcion || mov.tipo_movimiento, 130, y, { width: 150 })
                .text(esCargo ? `$${monto.toFixed(2)}` : '-', 285, y, { width: 70, align: 'right' })
                .text(esAbono ? `$${monto.toFixed(2)}` : '-', 360, y, { width: 70, align: 'right' })
                .text(`$${parseFloat(mov.saldo_despues_movimiento).toFixed(2)}`, 435, y, { width: 70, align: 'right' });

            y += 18;
        });

        // Totales
        y += 10;
        doc.rect(50, y, 512, 2).fill('#FF6B35');
        y += 10;

        doc.fontSize(10).fillColor('#000000')
            .text('TOTALES DEL PERIODO:', 130, y, { width: 150 })
            .text(`$${totalCargos.toFixed(2)}`, 285, y, { width: 70, align: 'right' })
            .text(`$${totalAbonos.toFixed(2)}`, 360, y, { width: 70, align: 'right' })
            .text(`$${parseFloat(clienteInfo.saldo_deudor).toFixed(2)}`, 435, y, { width: 70, align: 'right' });

        // Pie de página
        doc.fontSize(8).fillColor('#666666')
            .text('Este documento es un estado de cuenta oficial de RazoConnect', 50, 750, { align: 'center' })
            .text('Para cualquier aclaración, contacte a su ejecutivo de cuenta', 50, 765, { align: 'center' });

        doc.end();

    } catch (error) {
        logger.error('Error generando PDF de estado de cuenta:', {
            error: error.message,
            requestId: req.requestId,
            tenantId: req.tenant?.tenant_id,
            clienteId
        });
        
        if (!res.headersSent) {
            return res.status(500).json({
                success: false,
                message: 'Error al generar el PDF'
            });
        }
    } finally {
        client.release();
    }
}

/**
 * Genera PDF del estado de cuenta para el cliente (portal de clientes)
 * @route GET /api/clientes/mi-estado-cuenta/pdf
 */
async function generarPDFEstadoCuentaCliente(req, res) {
    const clienteId = req.user?.clienteid;
    const { mes, anio } = req.query;
    const tenant_id = req.tenant?.tenant_id || 1;

    if (!clienteId) {
        return res.status(401).json({
            success: false,
            message: 'Cliente no autenticado'
        });
    }

    const fechaConsulta = mes && anio 
        ? new Date(parseInt(anio), parseInt(mes) - 1, 1)
        : new Date();

    const fechaInicio = startOfMonth(fechaConsulta);
    const fechaFin = endOfMonth(fechaConsulta);

    const client = await db.pool.connect();

    try {
        const { rows: [clienteInfo] } = await client.query(`
            SELECT
                c.clienteid,
                c.nombre,
                c.apellido,
                c.email,
                c.telefono,
                cc.credito_id,
                cc.limite_credito,
                cc.saldo_deudor,
                cc.estado_credito
            FROM clientes c
            INNER JOIN cliente_creditos cc ON cc.cliente_id = c.clienteid
            WHERE c.clienteid = $1 AND c.tenant_id = $2
        `, [clienteId, tenant_id]);

        if (!clienteInfo) {
            return res.status(404).json({
                success: false,
                message: 'Información de crédito no encontrada'
            });
        }

        const { rows: [saldoInicial] } = await client.query(`
            SELECT COALESCE(saldo_despues_movimiento, 0) as saldo_inicial
            FROM credito_movimientos
            WHERE credito_id = $1 AND fecha_movimiento < $2
            ORDER BY fecha_movimiento DESC, movimiento_id DESC
            LIMIT 1
        `, [clienteInfo.credito_id, fechaInicio]);

        const { rows: movimientos } = await client.query(`
            SELECT
                cm.tipo_movimiento,
                cm.monto,
                cm.descripcion,
                cm.fecha_movimiento,
                cm.saldo_despues_movimiento,
                r.folio AS remision_folio
            FROM credito_movimientos cm
            LEFT JOIN remisiones r ON r.remision_id = cm.remision_id
            WHERE cm.credito_id = $1
              AND cm.fecha_movimiento >= $2
              AND cm.fecha_movimiento <= $3
            ORDER BY cm.fecha_movimiento ASC
        `, [clienteInfo.credito_id, fechaInicio, fechaFin]);

        // Generar PDF (mismo código que arriba pero sin validación de admin)
        const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Mi_Estado_Cuenta_${format(fechaConsulta, 'yyyy-MM')}.pdf`);
        
        doc.pipe(res);

        const logoPath = path.join(__dirname, '..', 'icon', 'Logo_Razo.png');
        if (fs.existsSync(logoPath)) {
            doc.image(logoPath, 50, 45, { width: 60 });
        }

        doc.fontSize(20).fillColor('#FF6B35').text('ESTADO DE CUENTA', 150, 50, { align: 'left' });
        doc.fontSize(10).fillColor('#000000').text(`Periodo: ${format(fechaConsulta, 'MMMM yyyy', { locale: es }).toUpperCase()}`, 150, 75);
        doc.fontSize(8).fillColor('#666666').text(`Generado: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 150, 90);

        doc.fontSize(12).fillColor('#000000').text('INFORMACIÓN DEL CLIENTE', 50, 130);
        doc.fontSize(10)
            .text(`Cliente: ${clienteInfo.nombre} ${clienteInfo.apellido}`, 50, 150)
            .text(`Email: ${clienteInfo.email || 'N/A'}`, 50, 165)
            .text(`Teléfono: ${clienteInfo.telefono || 'N/A'}`, 50, 180);

        doc.fontSize(12).fillColor('#000000').text('RESUMEN DE CRÉDITO', 350, 130);
        doc.fontSize(10)
            .text(`Límite de Crédito: $${parseFloat(clienteInfo.limite_credito).toFixed(2)}`, 350, 150)
            .text(`Saldo Actual: $${parseFloat(clienteInfo.saldo_deudor).toFixed(2)}`, 350, 165)
            .text(`Crédito Disponible: $${(parseFloat(clienteInfo.limite_credito) - parseFloat(clienteInfo.saldo_deudor)).toFixed(2)}`, 350, 180);

        doc.moveTo(50, 210).lineTo(562, 210).stroke();

        const saldoInicialMes = parseFloat(saldoInicial?.saldo_inicial || 0);
        doc.fontSize(11).fillColor('#000000').text(`Saldo Inicial: $${saldoInicialMes.toFixed(2)}`, 50, 225);

        let y = 250;
        doc.fontSize(9).fillColor('#FFFFFF');
        doc.rect(50, y, 512, 20).fill('#FF6B35');
        doc.fillColor('#FFFFFF')
            .text('FECHA', 55, y + 5, { width: 70 })
            .text('DESCRIPCIÓN', 130, y + 5, { width: 150 })
            .text('CARGO', 285, y + 5, { width: 70, align: 'right' })
            .text('ABONO', 360, y + 5, { width: 70, align: 'right' })
            .text('SALDO', 435, y + 5, { width: 70, align: 'right' });

        y += 25;

        let totalCargos = 0;
        let totalAbonos = 0;

        movimientos.forEach((mov, index) => {
            if (y > 700) {
                doc.addPage();
                y = 50;
            }

            const monto = parseFloat(mov.monto);
            const esCargo = ['CARGO', 'RESERVA'].includes(mov.tipo_movimiento);
            const esAbono = ['ABONO', 'PAGO', 'AJUSTE'].includes(mov.tipo_movimiento);

            if (esCargo) totalCargos += monto;
            if (esAbono) totalAbonos += monto;

            if (index % 2 === 0) {
                doc.rect(50, y - 2, 512, 18).fill('#F9F9F9');
            }

            doc.fillColor('#000000').fontSize(8)
                .text(format(new Date(mov.fecha_movimiento), 'dd/MM/yyyy'), 55, y, { width: 70 })
                .text(mov.descripcion || mov.tipo_movimiento, 130, y, { width: 150 })
                .text(esCargo ? `$${monto.toFixed(2)}` : '-', 285, y, { width: 70, align: 'right' })
                .text(esAbono ? `$${monto.toFixed(2)}` : '-', 360, y, { width: 70, align: 'right' })
                .text(`$${parseFloat(mov.saldo_despues_movimiento).toFixed(2)}`, 435, y, { width: 70, align: 'right' });

            y += 18;
        });

        y += 10;
        doc.rect(50, y, 512, 2).fill('#FF6B35');
        y += 10;

        doc.fontSize(10).fillColor('#000000')
            .text('TOTALES:', 130, y, { width: 150 })
            .text(`$${totalCargos.toFixed(2)}`, 285, y, { width: 70, align: 'right' })
            .text(`$${totalAbonos.toFixed(2)}`, 360, y, { width: 70, align: 'right' })
            .text(`$${parseFloat(clienteInfo.saldo_deudor).toFixed(2)}`, 435, y, { width: 70, align: 'right' });

        doc.fontSize(8).fillColor('#666666')
            .text('Este documento es un estado de cuenta oficial de RazoConnect', 50, 750, { align: 'center' });

        doc.end();

    } catch (error) {
        logger.error('Error generando PDF estado de cuenta cliente:', {
            error: error.message,
            requestId: req.requestId,
            tenantId: req.tenant?.tenant_id,
            clienteId
        });
        
        if (!res.headersSent) {
            return res.status(500).json({
                success: false,
                message: 'Error al generar el PDF'
            });
        }
    } finally {
        client.release();
    }
}

module.exports = {
    getEstadoCuentaMensual,
    getEstadoCuentaCliente,
    generarPDFEstadoCuenta,
    generarPDFEstadoCuentaCliente
};
