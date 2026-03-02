/**
 * AJUSTES INVENTARIO FILTRADOS CONTROLLER
 * 
 * Controlador especializado para consultas filtradas de ajustes de inventario.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/ajustesInventarioFiltradosController
 * @author RazoConnect Team
 * @date 2026-02-27
 */

const db = require('../db');
const logger = require('../utils/logger');

/**
 * Obtener ajustes de inventario con filtros avanzados
 * GET /api/admin/ajustes-inventario/filtrados
 * 
 * Query params: fechaInicio, fechaFin, tipoOrigen, referencia, ordenCompraId, sesionAuditoriaId
 */
const getAjustesInventarioFiltrados = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;
    const where = [`li.tenant_id = $1`];
    const values = [tenant_id];

    // Filtro por rango de fechas
    const fechaInicioRaw = (req.query.fechaInicio || "").toString().trim();
    if (fechaInicioRaw) {
      values.push(fechaInicioRaw);
      where.push(`li.fecha >= $${values.length}::timestamp`);
    }

    const fechaFinRaw = (req.query.fechaFin || "").toString().trim();
    if (fechaFinRaw) {
      values.push(fechaFinRaw + ' 23:59:59');
      where.push(`li.fecha <= $${values.length}::timestamp`);
    }

    // Filtro por tipo de origen directo desde frontend
    const tipoOrigenRaw = (req.query.tipoOrigen || "").toString().trim().toUpperCase();
    const tiposOrigenValidos = [
      'ORDEN_COMPRA',      // Entradas de Almacén (recepciones de OC)
      'AUDITORIA',         // Sesiones de Auditoría (conteos físicos)
      'AJUSTE_MANUAL',     // Ajustes Manuales genéricos
      'MERMA',             // Mermas específicas
      'ADICION',           // Adiciones específicas
      'VENTA',             // Salidas por venta
      'DEVOLUCION',        // Devoluciones
      'SALIDA_PEDIDO'      // Salidas de almacén por pedidos surtidos
    ];
    
    // Mapeo de SALIDA_PEDIDO a VENTA (mismo tipo en DB)
    const tipoOrigenDB = tipoOrigenRaw === 'SALIDA_PEDIDO' ? 'VENTA' : tipoOrigenRaw;
    
    if (tipoOrigenRaw && tiposOrigenValidos.includes(tipoOrigenRaw)) {
      values.push(tipoOrigenDB);
      where.push(`li.tipo_origen = $${values.length}`);
    }

    // Filtro por referencia (búsqueda parcial en motivo)
    const referenciaRaw = (req.query.referencia || "").toString().trim();
    if (referenciaRaw) {
      values.push(`%${referenciaRaw}%`);
      where.push(`li.motivo ILIKE $${values.length}`);
    }

    // Filtro por orden de compra específica
    const ordenCompraIdRaw = req.query.ordenCompraId;
    if (ordenCompraIdRaw !== undefined && ordenCompraIdRaw !== null && ordenCompraIdRaw !== "") {
      const ordenCompraId = Number.parseInt(ordenCompraIdRaw, 10);
      if (Number.isInteger(ordenCompraId) && ordenCompraId > 0) {
        values.push(ordenCompraId);
        where.push(`li.orden_compra_id = $${values.length}`);
      }
    }

    // Filtro por sesión de auditoría específica
    const sesionIdRaw = req.query.sesionId;
    if (sesionIdRaw !== undefined && sesionIdRaw !== null && sesionIdRaw !== "") {
      const sesionId = Number.parseInt(sesionIdRaw, 10);
      if (Number.isInteger(sesionId) && sesionId > 0) {
        values.push(sesionId);
        where.push(`li.sesion_auditoria_id = $${values.length}`);
      }
    }

    // NOTA: log_inventario NO tiene columna pedido_id según schema
    // Los pedidos se rastrean mediante motivo que incluye "Pedido #XXX"
    
    const whereSql = `WHERE ${where.join(" AND ")}`;
    
    // Query unificada desde log_inventario con trazabilidad de origen
    const result = await db.query(
      `SELECT
         li.logid AS ajuste_id,
         li.varianteid AS variante_id,
         ABS(li.cantidadcambiado) AS cantidad,
         li.cantidadcambiado AS cantidad_delta,
         li.tipo_origen,
         li.orden_compra_id,
         li.sesion_auditoria_id,
         li.ajuste_id AS ajuste_manual_id,
         li.motivo,
         li.usuarioid AS usuario_id,
         li.fecha AS fecha_ajuste,
         pv.sku,
         pv.dimensiones,
         pv.piezasporpaquete,
         pv.stock,
         pv.preciounitario,
         pv.costounitario,
         pv.color_nombre,
         pv.color_hex,
         p.productoid,
         p.nombreproducto,
         COALESCE(a.nombre, 'Sistema') AS usuario_nombre,
         oc.ordencompraid AS oc_numero,
         oc.estatus AS oc_estatus,
         ts.nombre AS sesion_nombre,
         ts.estatus AS sesion_estatus,
         CASE 
           WHEN li.orden_compra_id IS NOT NULL THEN (
             SELECT CASE 
               WHEN COALESCE(SUM(doc.cantidadrecibida), 0) = 0 THEN 'Pendiente'
               WHEN COALESCE(SUM(doc.cantidadrecibida), 0) >= COALESCE(SUM(doc.cantidadsolicitada), 0) THEN 'Completa'
               ELSE 'Parcial'
             END
             FROM detallesordencompra doc
             WHERE doc.ordencompraid = li.orden_compra_id
           )
           ELSE NULL
         END AS estado_recepcion
       FROM log_inventario li
       INNER JOIN producto_variantes pv ON pv.varianteid = li.varianteid
       INNER JOIN productos p ON p.productoid = pv.productoid
       LEFT JOIN administradores a ON a.adminid = li.usuarioid
       LEFT JOIN ordenesdecompra oc ON oc.ordencompraid = li.orden_compra_id
       LEFT JOIN toma_inventario_sesiones ts ON ts.sesionid = li.sesion_auditoria_id
       ${whereSql}
       ORDER BY li.fecha DESC
       LIMIT 500`,
      values
    );

    const ajustes = (result.rows || []).map((r) => {
      const cantidad = Number.parseInt(r.cantidad, 10) || 0;
      const cantidadDelta = Number.parseInt(r.cantidad_delta, 10) || 0;
      const piezasPorPaquete = Number.parseInt(r.piezasporpaquete, 10) || 1;
      const precioUnitario = parseFloat(r.preciounitario) || 0;
      const costoUnitario = parseFloat(r.costounitario) || 0;
      const totalPiezas = cantidad * piezasPorPaquete;
      const valorTotal = totalPiezas * precioUnitario;

      // Determinar tipo de ajuste para UI (mapeo inverso)
      const tipoAjusteUI = r.tipo_origen === 'AUDITORIA' ? 'ENTRADA' : (r.tipo_origen || 'AJUSTE');

      // Construir referencia de origen
      let referenciaOrigen = '';
      if (r.orden_compra_id) {
        referenciaOrigen = `OC #${r.oc_numero || r.orden_compra_id}`;
      } else if (r.sesion_auditoria_id) {
        referenciaOrigen = `Sesión: ${r.sesion_nombre || `#${r.sesion_auditoria_id}`}`;
      } else if (r.ajuste_manual_id) {
        referenciaOrigen = `Ajuste #${r.ajuste_manual_id}`;
      } else if (r.motivo && r.motivo.includes('Pedido #')) {
        // Extraer número de pedido del motivo si existe
        const match = r.motivo.match(/Pedido #(\d+)/);
        if (match) {
          referenciaOrigen = `Pedido #${match[1]}`;
        }
      }

      return {
        ajusteId: r.ajuste_id,
        fecha: r.fecha_ajuste,
        varianteId: r.variante_id,
        productoId: r.productoid,
        productoNombre: r.nombreproducto,
        sku: r.sku,
        dimensiones: r.dimensiones,
        colorNombre: r.color_nombre,
        colorHex: r.color_hex,
        tipoAjuste: tipoAjusteUI,
        tipoOrigen: r.tipo_origen,
        cantidad,
        cantidadDelta,
        esEntrada: cantidadDelta > 0,
        esSalida: cantidadDelta < 0,
        piezasPorPaquete,
        totalPiezas,
        precioUnitario,
        costoUnitario,
        valorTotal,
        motivo: r.motivo || "",
        stockActual: Number.parseInt(r.stock, 10) || 0,
        usuarioId: r.usuario_id,
        usuarioNombre: r.usuario_nombre || 'Sistema',
        // Información de origen
        ordenCompraId: r.orden_compra_id,
        ordenCompraNumero: r.oc_numero,
        ordenCompraEstatus: r.oc_estatus,
        estadoRecepcion: r.estado_recepcion,
        sesionAuditoriaId: r.sesion_auditoria_id,
        sesionNombre: r.sesion_nombre,
        sesionEstatus: r.sesion_estatus,
        ajusteManualId: r.ajuste_manual_id,
        referenciaOrigen,
      };
    });

    // Calcular totales para conciliación
    const totalPiezas = ajustes.reduce((sum, a) => sum + a.totalPiezas, 0);
    const valorTotalizado = ajustes.reduce((sum, a) => sum + a.valorTotal, 0);
    // Calcular paquetes correctamente: piezas totales / piezas por paquete
    const totalPaquetes = ajustes.reduce((sum, a) => {
      const paquetes = a.piezasPorPaquete > 0 ? Math.floor(a.totalPiezas / a.piezasPorPaquete) : a.cantidad;
      return sum + paquetes;
    }, 0);

    // Agrupar por tipo para resumen
    const resumenPorTipo = ajustes.reduce((acc, a) => {
      if (!acc[a.tipoAjuste]) {
        acc[a.tipoAjuste] = { cantidad: 0, piezas: 0, valor: 0 };
      }
      acc[a.tipoAjuste].cantidad += a.cantidad;
      acc[a.tipoAjuste].piezas += a.totalPiezas;
      acc[a.tipoAjuste].valor += a.valorTotal;
      return acc;
    }, {});

    return res.status(200).json({
      success: true,
      data: {
        ajustes,
        total: ajustes.length,
        totales: {
          totalPaquetes,
          totalPiezas,
          valorTotalizado: parseFloat(valorTotalizado.toFixed(2)),
        },
        resumenPorTipo,
      },
    });
  } catch (error) {
    logger.error('Error al obtener ajustes de inventario filtrados:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "Error en el servidor"
    });
  }
};

/**
 * Obtener tipos de ajuste disponibles para filtros
 * GET /api/admin/ajustes-inventario/tipos
 * 
 * Retorna TODOS los tipos posibles de movimientos de inventario
 * basados en las formas REALES en que el inventario entra y sale del sistema.
 * 
 * FLUJOS DE INVENTARIO EN EL SISTEMA:
 * 
 * ENTRADAS (Incrementos de stock):
 * 1. Recepción de Órdenes de Compra → log_inventario (motivo: "Recepción OC #X")
 * 2. Conteo Inicial/Auditoría → ajustes_inventario (tipo_ajuste: 'ENTRADA', sesion_auditoria_id)
 * 3. Adición Manual → movimientos_inventario (tipo: 'ADICION')
 * 
 * SALIDAS (Decrementos de stock):
 * 4. Venta a Cliente → pedido_surtido_detalle (reduce stock al surtir pedido)
 * 5. Merma → movimientos_inventario (tipo: 'MERMA') o ajustes_inventario (tipo_ajuste: 'MERMA')
 * 
 * AJUSTES (Correcciones):
 * 6. Ajuste por Auditoría → ajustes_inventario (tipo_ajuste: 'AJUSTE')
 */
const getTiposAjusteInventario = async (req, res) => {
  try {
    // Definir SOLO los tipos de movimientos que realmente existen en el sistema
    const tiposMovimientos = [
      {
        value: 'ENTRADA',
        label: 'Conteo Inicial / Auditoría',
        descripcion: 'Entrada de inventario por conteo físico o auditoría',
        categoria: 'Entradas',
        tabla: 'ajustes_inventario'
      },
      {
        value: 'MERMA',
        label: 'Merma',
        descripcion: 'Pérdida, daño o robo de inventario',
        categoria: 'Salidas',
        tabla: 'movimientos_inventario / ajustes_inventario'
      },
      {
        value: 'AJUSTE',
        label: 'Ajuste por Auditoría',
        descripcion: 'Corrección de inventario basada en conteo físico',
        categoria: 'Ajustes',
        tabla: 'ajustes_inventario'
      },
      {
        value: 'ADICION',
        label: 'Adición Manual',
        descripcion: 'Incremento manual de stock por corrección',
        categoria: 'Entradas',
        tabla: 'movimientos_inventario'
      }
    ];

    // Retornar solo los valores para el dropdown (compatibilidad con frontend actual)
    const valores = tiposMovimientos.map(t => t.value);

    return res.status(200).json({
      success: true,
      data: valores,
      // Información adicional para futuras mejoras del frontend
      metadata: {
        tiposDetallados: tiposMovimientos,
        categorias: [...new Set(tiposMovimientos.map(t => t.categoria))],
        nota: 'Recepciones de OC y Ventas a Clientes se registran en log_inventario y pedido_surtido_detalle respectivamente'
      }
    });
  } catch (error) {
    logger.error('Error al obtener tipos de ajuste:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "Error en el servidor"
    });
  }
};

module.exports = {
  getAjustesInventarioFiltrados,
  getTiposAjusteInventario
};
