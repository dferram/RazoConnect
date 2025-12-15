/*
 * SCRIPT DE LIMPIEZA PROFUNDA (REINICIO DE FÁBRICA)
 * -------------------------------------------------
 * Objetivo: Eliminar toda la data transaccional y de negocio (productos, clientes, pedidos)
 * para iniciar pruebas limpias con la nueva lógica de SKUs y Auditoría.
 *
 * MANTIENE:
 * - Administradores (Tus accesos)
 * - Estados (Catálogo del SAT/Sepomex)
 * - Tipos de Producto (Configuración base)
 * - Catálogo de Tamaños de Paquetes (Configuración base)
 * - Medidas (Configuración base)
 */

BEGIN;

-- TRUNCATE elimina los datos rápidamente y reinicia los IDs a 1 (RESTART IDENTITY).
-- CASCADE asegura que se borren las tablas dependientes automáticamente.

TRUNCATE TABLE
    -- 1. Transacciones y Movimientos (Lo más volátil)
    pedidos,
    detallesdelpedido,
    ordenesdecompra,
    detallesordencompra,
    carritodecompra,
    itemsdelcarrito,
    comisiones,
    
    -- 2. Sistema de Auditoría de Inventario (Lo nuevo)
    toma_inventario_sesiones,
    toma_inventario_conteos,
    
    -- 3. Catálogo de Negocio (Para regenerar con SKUs 25-FAS-CAJ...)
    productos,
    producto_variantes,
    producto_imagenes,
    producto_tamanosdisponibles,
    categorias,               -- Se borra para reestructurar limpio
    proveedores,              -- Se borra para probar la creación con aprobación
    proveedor_reglas_empaque,
    
    -- 4. Usuarios Externos (Para limpiar pruebas de 'Lupita' o clientes falsos)
    clientes,
    cliente_direcciones,
    agentesdeventas,          -- OJO: Si Lupita es vital, quita esta línea. (Recomendado borrar para probar creación)
    
    -- 5. Logs, Historial y Seguridad
    notificaciones,
    log_inventario,
    log_movimientos,
    log_eventosusuario,
    control_cambios,          -- Se limpia la bitácora vieja
    communicationlogs,
    passwordresettokens

RESTART IDENTITY CASCADE;

-- Confirmación visual
DO $$
BEGIN
    RAISE NOTICE 'Limpieza completada. El sistema está listo para operar como nuevo.';
    RAISE NOTICE 'Se han conservado los Administradores y Catálogos Base (Estados, Tipos, Medidas).';
END $$;

COMMIT;