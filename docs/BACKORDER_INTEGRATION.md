# Sistema de Backorder Automático - Documentación de Integración

## Descripción General

El sistema de backorder automático genera órdenes de compra al proveedor cuando un pedido requiere más inventario del que hay disponible. El stock se maneja en **piezas** y se calcula la disponibilidad en **paquetes** basándose en el tamaño del paquete seleccionado.

## Flujo Completo

### 1. Cliente Crea Pedido (Checkout)

**Endpoint:** `POST /api/pedidos`

**Ubicación:** `controllers/pedidosController.js` → función `crearPedido`

### 2. Cálculo de Stock por Producto

Para cada item en el carrito:

```javascript
// Entrada
const cantidadRequerida = item.cantidad;  // Paquetes solicitados
const tamanoValor = 10;                   // Ejemplo: 10 piezas por paquete
const stockActual = 35;                   // Piezas disponibles

// Cálculo
const piezasSolicitadas = 10 * 5 = 50;   // Total de piezas requeridas
const paquetesSurtibles = Math.floor(35 / 10) = 3;  // Solo podemos surtir 3 paquetes
const cantidadSurtida = Math.min(5, 3) = 3;          // Surtimos 3 paquetes
const cantidadBackorder = 5 - 3 = 2;                 // Faltan 2 paquetes

const piezasSurtidas = 3 * 10 = 30;      // Usamos 30 piezas del stock
const piezasFaltantes = 2 * 10 = 20;     // Faltan 20 piezas
```

### 3. Actualización de Stock

```javascript
// Stock ANTES: 35 piezas
// Se descuentan solo las piezas surtidas: 35 - 30 = 5
const nuevoStockVariante = Math.max(stockActual - piezasSurtidas, 0);

await client.query(
  "UPDATE producto_variantes SET Stock = $1 WHERE VarianteID = $2",
  [nuevoStockVariante, item.varianteid]
);
// Stock DESPUÉS: 5 piezas
```

### 4. Generación de Backorder (Si Aplica)

**Condición:** `if (cantidadBackorder > 0)`

```javascript
const resultadoBackorder = await generarBackorderProveedor(
  client, // Cliente de transacción
  item.productoid, // ID del producto
  item.varianteid, // ID de la variante
  cantidadBackorder, // Cantidad de PAQUETES faltantes (2)
  item.tamanoid // ID del tamaño (puede ser null)
);
```

### 5. Proceso Interno de `generarBackorderProveedor`

**Ubicación:** `services/ordenesService.js`

```javascript
// PASO 1: Identificar Proveedor
SELECT ProveedorID_Default FROM Productos WHERE ProductoID = 15;
// Resultado: ProveedorID = 5

// PASO 2: Buscar Orden Pendiente
SELECT OrdenCompraID FROM OrdenesDeCompra
WHERE ProveedorID = 5 AND Estatus = 'Pendiente'
ORDER BY FechaCreacion ASC LIMIT 1;
// Resultado: OrdenCompraID = 123 (o NULL si no existe)

// PASO 3: Crear o Reutilizar Orden
// Si NO existe:
INSERT INTO OrdenesDeCompra (ProveedorID, FechaEntregaEsperada, Estatus)
VALUES (5, NOW() + INTERVAL '14 days', 'Pendiente')
RETURNING OrdenCompraID;

// PASO 4: Agregar/Actualizar Detalle
// Si la variante ya está en la orden:
UPDATE DetallesOrdenCompra
SET CantidadSolicitada = CantidadSolicitada + 2  -- Incrementar
WHERE OrdenCompraID = 123 AND VarianteID = 42;

// Si NO está:
INSERT INTO DetallesOrdenCompra
(OrdenCompraID, ProductoID, VarianteID, CantidadSolicitada, CantidadRecibida, TamanoID)
VALUES (123, 15, 42, 2, 0, 3);  -- CantidadRecibida inicia en 0
```

### 6. Respuesta y Notificaciones

**Respuesta API:**

```json
{
  "success": true,
  "message": "Pedido creado exitosamente",
  "data": {
    "pedido": {
      "pedidoId": 789,
      "montoTotal": 850.0,
      "detalles": [
        {
          "nombreProducto": "Producto X",
          "cantidad": 5,
          "paquetesSurtidos": 3,
          "paquetesBackorder": 2,
          "piezasSurtidas": 30,
          "piezasFaltantes": 20
        }
      ],
      "backorders": [
        {
          "nombreProducto": "Producto X",
          "cantidadPaquetesFaltantes": 2,
          "cantidadPiezasFaltantes": 20,
          "ordenCompraId": 123,
          "proveedorId": 5,
          "esOrdenNueva": false
        }
      ]
    }
  }
}
```

**Emails Enviados:**

1. **Cliente:** Confirmación de pedido
2. **Admin:** Alerta de nuevo pedido
3. **Admin:** Alerta de backorder (si aplica)

   ```
   ⚠️ Alerta: Backorder generado para el pedido #789

   • Producto X (SKU: ABC123) — Faltante: 2 paquetes (20 piezas)
     OC #123 (Proveedor #5) [ACTUALIZADA]
   ```

4. **Agente:** Notificación de pedido de su cliente (si tiene agente)

## Ventajas del Sistema

### ✅ Manejo Inteligente de Stock

- **Sin sobre-venta**: Solo vende lo que hay disponible
- **Stock a 0**: El stock puede quedar en 0 si todo se surtió
- **Registro preciso**: Log de inventario con cantidades exactas

### ✅ Órdenes de Compra Consolidadas

- **Reutiliza órdenes pendientes**: No crea múltiples OC al mismo proveedor
- **Actualiza cantidades**: Si el producto ya está solicitado, incrementa la cantidad
- **Organización**: Una orden por proveedor en estado pendiente

### ✅ Trazabilidad Completa

```javascript
// Log de Inventario
{
  varianteId: 42,
  cantidadCambiado: -30,  // Negativo = descuento
  nuevoStock: 5,
  motivo: "Venta Pedido #789"
}

// Detalles de la Orden de Compra
{
  ordenCompraId: 123,
  varianteId: 42,
  cantidadSolicitada: 12,  // 10 previas + 2 nuevas
  cantidadRecibida: 0
}
```

## Casos de Uso

### Caso 1: Stock Suficiente

```
Cliente pide: 5 paquetes (50 piezas)
Stock actual: 60 piezas
Resultado:
  - Se surten 5 paquetes (50 piezas)
  - Stock queda en 10 piezas
  - NO se genera backorder
```

### Caso 2: Stock Parcial

```
Cliente pide: 5 paquetes (50 piezas)
Stock actual: 35 piezas
Resultado:
  - Se surten 3 paquetes (30 piezas)
  - Stock queda en 5 piezas
  - SE genera backorder por 2 paquetes (20 piezas)
```

### Caso 3: Sin Stock

```
Cliente pide: 5 paquetes (50 piezas)
Stock actual: 0 piezas
Resultado:
  - Se surten 0 paquetes (0 piezas)
  - Stock queda en 0 piezas
  - SE genera backorder por 5 paquetes (50 piezas)
```

### Caso 4: Stock Insuficiente para un Paquete

```
Cliente pide: 5 paquetes (50 piezas, 10 por paquete)
Stock actual: 8 piezas
Resultado:
  - Se surten 0 paquetes (no hay suficiente para completar 1 paquete)
  - Stock queda en 8 piezas
  - SE genera backorder por 5 paquetes (50 piezas)
```

## Manejo de Errores

### Error: Producto sin Proveedor

```javascript
throw new Error(
  "El producto 15 no tiene un proveedor asignado. No se puede generar orden de compra."
);
```

**Solución:** Asignar un `ProveedorID_Default` en la tabla `Productos`.

### Error: Proveedor Inválido

Si el `ProveedorID_Default` no existe en la tabla `Proveedores`, la FK lo rechazará.

**Solución:** Asegurar integridad referencial.

## Configuración Requerida

### Variables de Entorno

```env
ADMIN_EMAIL=admin@razoconnect.com  # Para notificaciones de backorder
```

### Permisos de Base de Datos

El usuario de la aplicación necesita:

- `SELECT` en: `Productos`, `Producto_Variantes`, `OrdenesDeCompra`, `DetallesOrdenCompra`
- `INSERT` en: `OrdenesDeCompra`, `DetallesOrdenCompra`, `Log_Inventario`
- `UPDATE` en: `Producto_Variantes`, `DetallesOrdenCompra`

## Testing

**Script de prueba:** `services/test-backorder.js`

```bash
# Ejecutar prueba (hace ROLLBACK, no afecta BD)
node services/test-backorder.js

# Ver resultados esperados:
# ✅ Orden de compra creada/actualizada
# ✅ Detalle agregado con cantidades correctas
# ✅ Sin errores de FK o validación
```

## Monitoreo y Logs

### Logs de Consola

```
🔍 Verificando producto...
   ✅ Producto: Producto X
   ✅ Proveedor: Proveedor ABC

🚀 Ejecutando generarBackorderProveedor...
   ✅ Resultado exitoso: Orden #123 actualizada
```

### Queries de Monitoreo

```sql
-- Ver órdenes pendientes por proveedor
SELECT
  oc.OrdenCompraID,
  p.NombreProveedor,
  COUNT(doc.DetalleOC_ID) as TotalItems,
  SUM(doc.CantidadSolicitada) as TotalSolicitado,
  oc.FechaCreacion
FROM OrdenesDeCompra oc
INNER JOIN Proveedores p ON p.ProveedorID = oc.ProveedorID
LEFT JOIN DetallesOrdenCompra doc ON doc.OrdenCompraID = oc.OrdenCompraID
WHERE oc.Estatus = 'Pendiente'
GROUP BY oc.OrdenCompraID, p.NombreProveedor, oc.FechaCreacion
ORDER BY oc.FechaCreacion ASC;

-- Ver backorders generados hoy
SELECT
  pr.NombreProducto,
  pv.SKU,
  doc.CantidadSolicitada,
  doc.CantidadRecibida,
  oc.OrdenCompraID,
  prov.NombreProveedor
FROM DetallesOrdenCompra doc
INNER JOIN OrdenesDeCompra oc ON oc.OrdenCompraID = doc.OrdenCompraID
INNER JOIN Proveedores prov ON prov.ProveedorID = oc.ProveedorID
INNER JOIN Producto_Variantes pv ON pv.VarianteID = doc.VarianteID
INNER JOIN Productos pr ON pr.ProductoID = pv.ProductoID
WHERE oc.FechaCreacion::date = CURRENT_DATE
  AND oc.Estatus = 'Pendiente'
ORDER BY oc.FechaCreacion DESC;
```

## Próximas Mejoras

- [ ] Dashboard de órdenes de compra pendientes
- [ ] Notificaciones cuando llegue mercancía (CantidadRecibida > 0)
- [ ] Actualización automática de estado de pedido cuando se complete el backorder
- [ ] Reporte de backorders por proveedor
- [ ] API para marcar productos como recibidos
