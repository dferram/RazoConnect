-- =====================================================
-- MIGRACIÓN: Agregar tenant_id a todas las vistas
-- Fecha: 2026-02-18
-- Propósito: Garantizar aislamiento por tenant en vistas
-- =====================================================

-- 1. Recrear v_resumen_bancario_proveedores con tenant_id
DROP VIEW IF EXISTS public.v_resumen_bancario_proveedores CASCADE;

CREATE VIEW public.v_resumen_bancario_proveedores AS
SELECT 
  p.proveedorid,
  p.nombreempresa,
  p.tenant_id,
  SUM(COALESCE(cxp.monto_total, 0::numeric)) AS deuda_total_historica,
  SUM(COALESCE(cxp.monto_total, 0::numeric) - COALESCE(cxp.monto_pagado, 0::numeric)) AS saldo_pendiente_pago,
  COUNT(cxp.cxp_id) FILTER (WHERE cxp.estatus <> 'PAGADO'::public.estatus_cxp_enum AND cxp.estatus <> 'CANCELADO'::public.estatus_cxp_enum) AS facturas_vivas
FROM public.proveedores p
LEFT JOIN public.cuentas_por_pagar cxp ON p.proveedorid = cxp.proveedor_id AND p.tenant_id = cxp.tenant_id
GROUP BY p.proveedorid, p.nombreempresa, p.tenant_id;

COMMENT ON VIEW public.v_resumen_bancario_proveedores IS 'Resumen financiero de proveedores con aislamiento por tenant';

-- 2. Recrear vista_cxc_con_vencimiento con tenant_id
DROP VIEW IF EXISTS public.vista_cxc_con_vencimiento CASCADE;

CREATE VIEW public.vista_cxc_con_vencimiento AS
SELECT 
  p.pedidoid,
  p.clienteid,
  p.tenant_id,
  c.nombre || ' ' || c.apellido AS cliente_nombre,
  c.email AS cliente_email,
  p.fechapedido,
  p.fecha_vencimiento,
  p.montototal,
  COALESCE(p.saldo_pendiente, p.montototal) AS saldo_pendiente,
  p.estatus_deuda,
  CASE
    WHEN p.fecha_vencimiento IS NULL THEN 0
    WHEN p.fecha_vencimiento::date > CURRENT_DATE THEN 0
    ELSE CURRENT_DATE - p.fecha_vencimiento::date
  END AS dias_atraso_real,
  cc.dias_gracia AS dias_credito_cliente,
  CASE
    WHEN p.fecha_vencimiento IS NULL THEN 'Sin vencimiento'
    WHEN p.fecha_vencimiento::date >= CURRENT_DATE THEN 'Al corriente'
    WHEN CURRENT_DATE - p.fecha_vencimiento::date <= 30 THEN 'Vencido 1-30 días'
    WHEN CURRENT_DATE - p.fecha_vencimiento::date <= 60 THEN 'Vencido 31-60 días'
    WHEN CURRENT_DATE - p.fecha_vencimiento::date <= 90 THEN 'Vencido 61-90 días'
    ELSE 'Vencido +90 días'
  END AS categoria_aging
FROM public.pedidos p
JOIN public.clientes c ON c.clienteid = p.clienteid AND c.tenant_id = p.tenant_id
LEFT JOIN public.cliente_creditos cc ON cc.cliente_id = p.clienteid AND cc.tenant_id = p.tenant_id
WHERE p.es_credito = true 
  AND p.pagado = false 
  AND COALESCE(p.saldo_pendiente, p.montototal) > 0
  AND p.estatus NOT IN ('Cancelado', 'Rechazado');

COMMENT ON VIEW public.vista_cxc_con_vencimiento IS 'Cuentas por cobrar con análisis de vencimiento y aging, aislado por tenant';

-- 3. Verificar que v_remisiones_completas ya tiene tenant_id (solo agregar comentario)
COMMENT ON VIEW public.v_remisiones_completas IS 'Vista consolidada de remisiones con información de pedido, cliente y agente (incluye tenant_id)';

-- 4. Verificar que v_movimientos_inventario_detalle ya tiene tenant_id (solo agregar comentario)
COMMENT ON VIEW public.v_movimientos_inventario_detalle IS 'Vista desnormalizada para reportes de auditoría con información completa de movimientos (incluye tenant_id)';

-- 5. Recrear estadisticas_notificaciones con tenant_id
DROP VIEW IF EXISTS public.estadisticas_notificaciones CASCADE;

CREATE VIEW public.estadisticas_notificaciones AS
SELECT 
  c.clienteid,
  c.nombre,
  c.tenant_id,
  COUNT(*) AS total_notificaciones,
  COUNT(*) FILTER (WHERE n.leido = false) AS no_leidas,
  COUNT(*) FILTER (WHERE n.leido = true) AS leidas,
  MAX(n.fechacreacion) AS ultima_notificacion
FROM public.clientes c
LEFT JOIN public.notificaciones n ON c.clienteid = n.clienteid AND c.tenant_id = n.tenant_id
GROUP BY c.clienteid, c.nombre, c.tenant_id;

COMMENT ON VIEW public.estadisticas_notificaciones IS 'Estadísticas de notificaciones por cliente con aislamiento por tenant';

-- =====================================================
-- VERIFICACIÓN: Confirmar que todas las vistas tienen tenant_id
-- =====================================================

-- Ejecutar esta consulta para verificar las columnas de cada vista:
-- SELECT table_name, column_name 
-- FROM information_schema.columns 
-- WHERE table_schema = 'public' 
--   AND table_name LIKE 'v_%' OR table_name LIKE 'vista_%'
-- ORDER BY table_name, ordinal_position;
