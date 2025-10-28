-- Script para agregar la columna PrecioUnitario a la tabla DetallesDelPedido
-- Esta columna almacenará el precio por pieza individual (PrecioPorPaquete / PiezasPorPaquete)

-- Agregar la columna PrecioUnitario
ALTER TABLE DetallesDelPedido 
ADD COLUMN PrecioUnitario DECIMAL(10, 2);

-- Actualizar los registros existentes calculando el PrecioUnitario
-- PrecioUnitario = PrecioPorPaquete / (PiezasTotales / CantidadPaquetes)
UPDATE DetallesDelPedido dp
SET PrecioUnitario = ROUND(
    dp.PrecioPorPaquete / 
    NULLIF((dp.PiezasTotales / NULLIF(dp.CantidadPaquetes, 0)), 0), 
    2
)
WHERE dp.PrecioPorPaquete IS NOT NULL 
  AND dp.CantidadPaquetes > 0 
  AND dp.PiezasTotales > 0;

-- Verificar los datos actualizados
SELECT 
    DetalleID, 
    PedidoID, 
    ProductoID, 
    CantidadPaquetes,
    PrecioPorPaquete,
    PiezasTotales,
    PrecioUnitario,
    (PrecioPorPaquete / (PiezasTotales / CantidadPaquetes)) as PrecioUnitarioCalculado
FROM DetallesDelPedido
ORDER BY PedidoID DESC
LIMIT 10;
