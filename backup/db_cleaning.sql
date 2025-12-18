-- 1. Desactivar triggers temporalmente para evitar errores de integridad
SET session_replication_role = 'replica';

TRUNCATE TABLE 
    -- TABLAS DE PRODUCTOS Y PROVEEDORES (NUEVO)
    public.producto_variante_imagenes,
    public.producto_tamanosdisponibles,
    public.producto_variantes,
    public.producto_imagenes,
    public.productos,
    public.medidas,
    public.proveedor_reglas_empaque,
    public.proveedores,

    -- TABLAS FINANCIERAS Y TRANSACCIONALES
    public.pagos_cxp,
    public.cuentas_por_pagar,
    public.cxp_etiquetas_asignadas,
    public.detallesordencompra,
    public.ordenesdecompra,
    public.detallesdelpedido,
    public.pedidos,
    public.itemsdelcarrito,
    public.carritodecompra,
    
    -- AUDITORÍA, LOGS Y SESIONES
    public.log_inventario,
    public.log_movimientos,
    public.log_eventosusuario,
    public.control_cambios,
    public.communicationlogs,
    public.notificaciones,
    public.toma_inventario_conteos,
    public.toma_inventario_sesiones,
    public.passwordresettokens
RESTART IDENTITY CASCADE;

-- 2. Reactivar triggers
SET session_replication_role = 'origin';