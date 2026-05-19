/**
 * ============================================================================
 * PDF CONTROLLER - ESTADO DE CUENTA
 * ============================================================================
 * 
 * Propósito: Generar PDF de estado de cuenta mensual para clientes
 * 
 * @module controllers/pdf/pdfEstadoCuentaController
 * @author RazoConnect Team
 * @date 2026-05-19
 */

const PDFDocument = require('pdfkit');
const logger = require('../../utils/logger');
const db = require('../../db');

/**
 * Generar PDF de estado de cuenta mensual
 * GET /api/cliente/estado-cuenta/:mes/:anio/pdf
 */
async function generarPDFEstadoCuenta(req, res) {
    const { mes, anio } = req.params;
    const { tenant_id } = req.tenant;
    const clienteId = req.user?.userId ?? req.user?.id ?? req.user?.clienteId ?? req.user?.clienteid;
    const estadosHelper = require('../../utils/estadosHelper');

    try {
        const mesNum = parseInt(mes, 10);
        const anioNum = parseInt(anio, 10);

        if (!mesNum || mesNum < 1 || mesNum > 12 || !anioNum || anioNum < 2000) {
            return res.status(400).json({ error: 'Mes o año inválido' });
        }

        // Get admin_id for this client (deterministic from estado)
        const adminIdForClient = await estadosHelper.getAdminByClienteEstado(clienteId, tenant_id);

        const creditoQuery = await db.query(
            `SELECT credito_id, limite_credito, saldo_deudor
             FROM cliente_creditos
             WHERE cliente_id = $1
               AND tenant_id = $2
               AND admin_id = $3
               AND estado_credito = 'ACTIVO'
             LIMIT 1`,
            [clienteId, tenant_id, adminIdForClient]
        );

        if (creditoQuery.rows.length === 0) {
            return res.status(404).json({ error: 'No tienes una línea de crédito activa' });
        }

        const credito = creditoQuery.rows[0];
        const creditoId = credito.credito_id;

        const fechaInicio = new Date(anioNum, mesNum - 1, 1);
        const fechaFin = new Date(anioNum, mesNum, 0, 23, 59, 59);

        const saldoInicialQuery = await db.query(
            `SELECT COALESCE(
                (SELECT saldo_despues_movimiento 
                 FROM credito_movimientos 
                 WHERE credito_id = $1 AND tenant_id = $2 AND fecha_movimiento < $3
                 ORDER BY fecha_movimiento DESC, movimiento_id DESC
                 LIMIT 1
                ), 0
             ) as saldo_inicial`,
            [creditoId, tenant_id, fechaInicio]
        );
        const saldoInicial = parseFloat(saldoInicialQuery.rows[0]?.saldo_inicial || 0);

        const movimientosQuery = await db.query(
            `SELECT 
                movimiento_id, tipo_movimiento, monto, saldo_despues_movimiento,
                referencia_id, descripcion, fecha_movimiento
             FROM credito_movimientos
             WHERE credito_id = $1 AND tenant_id = $2 
               AND fecha_movimiento >= $3 AND fecha_movimiento <= $4
             ORDER BY fecha_movimiento ASC, movimiento_id ASC`,
            [creditoId, tenant_id, fechaInicio, fechaFin]
        );

        const movimientos = movimientosQuery.rows;
        const saldoFinal = movimientos.length > 0 
            ? parseFloat(movimientos[movimientos.length - 1].saldo_despues_movimiento || 0)
            : saldoInicial;

        const clienteQuery = await db.query(
            `SELECT c.nombre, c.apellido, c.email, c.telefono
             FROM clientes c
             WHERE c.clienteid = $1 AND c.tenant_id = $2`,
            [clienteId, tenant_id]
        );
        const cliente = clienteQuery.rows[0] || {};

        const tenantQuery = await db.query(
            `SELECT nombre_comercial, logo_url FROM tenants WHERE tenant_id = $1`,
            [tenant_id]
        );
        const tenant = tenantQuery.rows[0] || {};

        const mesesNombres = [
            'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
        ];

        const doc = new PDFDocument({ 
            size: 'LETTER',
            margins: { top: 50, bottom: 50, left: 50, right: 50 }
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="Estado-Cuenta-${mesesNombres[mesNum - 1]}-${anioNum}.pdf"`);

        doc.pipe(res);

        let yPosition = 50;

        doc.fontSize(20)
           .font('Helvetica-Bold')
           .fillColor('#F97316')
           .text(tenant.nombre_comercial || 'RazoConnect', 50, yPosition);

        yPosition += 30;

        doc.fontSize(16)
           .fillColor('#333333')
           .text('Estado de Cuenta', 50, yPosition);

        yPosition += 25;

        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#666666')
           .text(`Cliente: ${cliente.nombre || ''} ${cliente.apellido || ''}`, 50, yPosition);

        yPosition += 15;
        doc.text(`Periodo: ${mesesNombres[mesNum - 1]} ${anioNum}`, 50, yPosition);

        yPosition += 15;
        doc.text(`Fecha de emisión: ${new Date().toLocaleDateString('es-MX')}`, 50, yPosition);

        yPosition += 30;

        doc.fontSize(11)
           .font('Helvetica-Bold')
           .fillColor('#333333')
           .text('Resumen del Periodo', 50, yPosition);

        yPosition += 20;

        const boxY = yPosition;
        doc.roundedRect(50, boxY, 512, 60, 5)
           .fillAndStroke('#F5F1ED', '#E0E0E0');

        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#666666')
           .text('Saldo Inicial:', 60, boxY + 15);
        doc.font('Helvetica-Bold')
           .fillColor('#333333')
           .text(`$${saldoInicial.toFixed(2)}`, 200, boxY + 15);

        doc.font('Helvetica')
           .fillColor('#666666')
           .text('Saldo Final:', 60, boxY + 35);
        doc.font('Helvetica-Bold')
           .fillColor(saldoFinal > 0 ? '#DC2626' : '#16A34A')
           .text(`$${saldoFinal.toFixed(2)}`, 200, boxY + 35);

        doc.font('Helvetica')
           .fillColor('#666666')
           .text('Límite de Crédito:', 320, boxY + 15);
        doc.font('Helvetica-Bold')
           .fillColor('#333333')
           .text(`$${parseFloat(credito.limite_credito || 0).toFixed(2)}`, 450, boxY + 15);

        const disponible = Math.max(parseFloat(credito.limite_credito || 0) - saldoFinal, 0);
        doc.font('Helvetica')
           .fillColor('#666666')
           .text('Crédito Disponible:', 320, boxY + 35);
        doc.font('Helvetica-Bold')
           .fillColor('#16A34A')
           .text(`$${disponible.toFixed(2)}`, 450, boxY + 35);

        yPosition = boxY + 80;

        doc.fontSize(11)
           .font('Helvetica-Bold')
           .fillColor('#333333')
           .text('Movimientos del Periodo', 50, yPosition);

        yPosition += 25;

        if (movimientos.length === 0) {
            doc.fontSize(10)
               .font('Helvetica')
               .fillColor('#999999')
               .text('No hay movimientos en este periodo', 50, yPosition, { align: 'center', width: 512 });
        } else {
            const tableTop = yPosition;
            const colWidths = {
                fecha: 70,
                concepto: 180,
                referencia: 80,
                cargo: 70,
                abono: 70,
                saldo: 70
            };

            doc.fontSize(9)
               .font('Helvetica-Bold')
               .fillColor('#FFFFFF');

            doc.roundedRect(50, tableTop, 512, 20, 3)
               .fill('#333333');

            doc.text('Fecha', 55, tableTop + 6);
            doc.text('Concepto', 130, tableTop + 6);
            doc.text('Referencia', 315, tableTop + 6);
            doc.text('Cargo', 400, tableTop + 6);
            doc.text('Abono', 475, tableTop + 6);
            doc.text('Saldo', 545, tableTop + 6, { width: 50, align: 'right' });

            yPosition = tableTop + 25;

            movimientos.forEach((mov, index) => {
                if (yPosition > 710) {
                    doc.addPage();
                    yPosition = 50;
                }

                const rowBg = index % 2 === 0 ? '#FFFFFF' : '#F9FAFB';
                doc.rect(50, yPosition, 512, 30)
                   .fill(rowBg);

                const fecha = new Date(mov.fecha_movimiento);
                const fechaStr = fecha.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });

                doc.fontSize(8)
                   .font('Helvetica')
                   .fillColor('#333333')
                   .text(fechaStr, 55, yPosition + 8);

                const concepto = mov.descripcion || 'Movimiento';
                doc.text(concepto, 130, yPosition + 8, { width: 175, ellipsis: true });

                const referencia = mov.referencia_id || '-';
                doc.text(referencia, 315, yPosition + 8, { width: 75, ellipsis: true });

                const esCargo = mov.tipo_movimiento === 'CARGO';
                const monto = parseFloat(mov.monto || 0);

                if (esCargo) {
                    doc.roundedRect(395, yPosition + 5, 65, 18, 4)
                       .fillAndStroke('#F8D7DA', '#F8D7DA');
                    doc.fontSize(8)
                       .font('Helvetica-Bold')
                       .fillColor('#721C24')
                       .text(`$${monto.toFixed(2)}`, 400, yPosition + 9, { width: 60, align: 'center' });
                } else {
                    doc.roundedRect(470, yPosition + 5, 65, 18, 4)
                       .fillAndStroke('#D4EDDA', '#D4EDDA');
                    doc.fontSize(8)
                       .font('Helvetica-Bold')
                       .fillColor('#155724')
                       .text(`$${monto.toFixed(2)}`, 475, yPosition + 9, { width: 60, align: 'center' });
                }

                const saldo = parseFloat(mov.saldo_despues_movimiento || 0);
                doc.fontSize(8)
                   .font('Helvetica')
                   .fillColor('#333333')
                   .text(`$${saldo.toFixed(2)}`, 540, yPosition + 8, { width: 50, align: 'right' });

                yPosition += 30;
            });
        }

        yPosition += 20;

        if (yPosition > 700) {
            doc.addPage();
            yPosition = 50;
        }

        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('#999999')
           .text('Este documento es un estado de cuenta informativo. Para cualquier aclaración, contacte a su ejecutivo.', 50, yPosition, {
               width: 512,
               align: 'center'
           });

        yPosition += 15;
        doc.text('Gracias por su confianza.', 50, yPosition, {
            width: 512,
            align: 'center'
        });

        doc.end();

        logger.info('PDF Estado de Cuenta generado', {
            clienteId,
            mes: mesNum,
            anio: anioNum,
            requestId: req.requestId
        });

    } catch (error) {
        logger.error('Error generando PDF de estado de cuenta', {
            error: error.message,
            stack: error.stack,
            requestId: req.requestId,
            tenantId: req.tenant?.tenant_id
        });
        
        if (!res.headersSent) {
            res.status(500).json({ 
                success: false,
                message: 'Error al generar el PDF'
            });
        }
    }
}

module.exports = {
    generarPDFEstadoCuenta
};
