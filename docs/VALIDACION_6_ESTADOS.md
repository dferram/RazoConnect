# Validación del Sistema de 6 Estados - RazoConnect

## 📋 Resumen de Cambios Implementados

### 1. ✅ Campo `estado_producto` Agregado a Inserciones
**Archivo**: `controllers/pedidosController.js` (líneas 1102-1130 y 1279-1310)

**Cambio**: Cuando se crea un detalle de pedido, ahora se asigna automáticamente un `estado_producto` inicial:
- `estado_producto = 'Con stock'` si `EsBackorder = FALSE`
- `estado_producto = 'Bajo pedido'` si `EsBackorder = TRUE`

**Impacto**: Los productos ya tienen estado desde que se crean, no NULL.

### 2. ✅ Lógica de Cálculo de Estado Mejorada
**Archivo**: `utils/pedidoStatus.js` (líneas 29-80)

**Función**: `calcularEstadoPedidoCorrect(client, pedidoId)`
- ✅ Verifica `estado_producto = 'Facturado'` (marca de finanzas)
- ✅ Verifica `estado_producto = 'Surtido'` (marca de almacén)
- ✅ Respeta `esBackorder` flag para estados iniciales

**Prioridad de Evaluación**:
1. PRIORIDAD 1: Si ALL `estado_producto = 'Facturado'` → **Surtido completo** 🟢
2. PRIORIDAD 2: Si SOME `estado_producto = 'Facturado'` → **Surtido parcial** 🟠
3. PRIORIDAD 3: Si AT LEAST ONE `estado_producto = 'Surtido'` → **Listo para remisionar** 🔵
4. PRIORIDAD 4: Si ALL `esBackorder = TRUE` → **Bajo pedido** 🔴
5. PRIORIDAD 5: Si ALL `esBackorder = FALSE` → **Completo** 🟡
6. PRIORIDAD 6: Si MIX → **Combinado** 🟠

### 3. ✅ Actualización Automática al Crear Pedido
**Archivo**: `controllers/pedidosController.js` (línea 1375-1381)

**Cambio**:
```javascript
// Usar calcularEstadoPedidoCorrect que accede a BD para estado_producto
const estadoResult = await calcularEstadoPedidoCorrect(client, pedidoId);
const estadoCalculado = estadoResult.nuevoEstado || estadoResult.estado;
const estadoNormalizado = normalizarEstado(estadoCalculado);
```

**Impacto**: Al crear un pedido, se calcula automáticamente si es:
- **Bajo pedido** (todos backorder)
- **Combinado** (mix)
- **Completo** (todos con stock)

### 4. ✅ Actualización al Marcar Surtidos (Almacén)
**Archivo**: `controllers/pedidosAdminController.js` (línea 790-808 + recalculation 920-935)

**Cambio**:
```javascript
// Despues marcar productos como estado_producto = 'Surtido':
const resultadoEstado = await calcularEstadoPedidoCorrect(client, pedidoId);
const nuevoEstatus = normalizarEstado(resultadoEstado.nuevoEstado || resultadoEstado.estado);
```

**Impacto**: Cuando almacén marca productos:
- Si hay `estado_producto = 'Surtido'` → cambia a **Listo para remisionar** 🔵
- O si hay `estado_producto = 'Facturado'` → respeta ese estado

### 5. ✅ Actualización al Confirmar Finanzas
**Archivo**: `controllers/remisionesController.js` (línea 1329 + recalculation 1352-1375)

**Cambio**:
```javascript
// Marcar productos como Facturado
UPDATE detallesdelpedido SET estado_producto = 'Facturado' WHERE...

// Recalcular estado
const resultadoEstado = await calcularEstadoPedidoCorrect(client || pool, remision.pedidoid);
const nuevoEstatus = normalizarEstado(resultadoEstado.nuevoEstado || resultadoEstado.estado);
```

**Impacto**: Cuando finanzas confirma:
- Si ALL `estado_producto = 'Facturado'` → **Surtido completo** 🟢
- Si SOME `estado_producto = 'Facturado'` → **Surtido parcial** 🟠

## 🧪 Validación de Cada Estado

### Estado 1: **Bajo pedido** 🔴
**Condición**: ALL productos have `esBackorder = true`
**Disparador**: Al crear pedido
**Verificación SQL**:
```sql
SELECT dp.*, p.estatus 
FROM pedidos p
JOIN detallesdelpedido dp ON p.pedidoid = dp.pedidoid
WHERE p.estatus = 'Bajo pedido'
AND dp.esbackorder = true;
-- Debería retornar TODOS los detalles con esbackorder = true
```

### Estado 2: **Combinado** 🟠
**Condición**: AT LEAST ONE con stock Y AT LEAST ONE backorder
**Disparador**: Al crear pedido
**Verificación SQL**:
```sql
SELECT p.pedidoid, p.estatus, COUNT(*) as items,
       SUM(CASE WHEN esbackorder THEN 1 ELSE 0 END) as backorder,
       SUM(CASE WHEN NOT esbackorder THEN 1 ELSE 0 END) as stock
FROM pedidos p
JOIN detallesdelpedido dp ON p.pedidoid = dp.pedidoid
WHERE p.estatus = 'Combinado'
GROUP BY p.pedidoid, p.estatus;
-- Debería mostrar ambos counts > 0
```

### Estado 3: **Completo** 🟡
**Condición**: ALL productos have `esBackorder = false`
**Disparador**: Al crear pedido
**Verificación SQL**:
```sql
SELECT p.pedidoid, p.estatus
FROM pedidos p
WHERE p.estatus = 'Completo'
AND NOT EXISTS (
  SELECT 1 FROM detallesdelpedido dp
  WHERE dp.pedidoid = p.pedidoid
  AND dp.esbackorder = true
);
-- Debería retornar todos con esbackorder = false
```

### Estado 4: **Listo para remisionar** 🔵
**Condición**: Almacén marcó AT LEAST ONE producto (estado_producto = 'Surtido')
**Disparador**: Cuando almacén marca productos
**Verificación SQL**:
```sql
SELECT p.pedidoid, p.estatus, 
       COUNT(CASE WHEN dp.estado_producto = 'Surtido' THEN 1 END) as surtidos,
       COUNT(*) as total
FROM pedidos p
JOIN detallesdelpedido dp ON p.pedidoid = dp.pedidoid
WHERE p.estatus = 'Listo para remisionar'
GROUP BY p.pedidoid, p.estatus;
-- Debería mostrar surtidos > 0 Y no todos facturados
```

### Estado 5: **Surtido parcial** 🟠
**Condición**: Finanzas confirmó SOME productos (SOME estado_producto = 'Facturado')
**Disparador**: Cuando finanzas confirma remisión parcial
**Verificación SQL**:
```sql
SELECT p.pedidoid, p.estatus,
       COUNT(CASE WHEN dp.estado_producto = 'Facturado' THEN 1 END) as facturados,
       COUNT(*) as total
FROM pedidos p
JOIN detallesdelpedido dp ON p.pedidoid = dp.pedidoid
WHERE p.estatus = 'Surtido parcial'
GROUP BY p.pedidoid, p.estatus;
-- Debería mostrar: 0 < facturados < total
```

### Estado 6: **Surtido completo** 🟢
**Condición**: ALL productos confirmados (ALL estado_producto = 'Facturado')
**Disparador**: Cuando finanzas confirma último producto
**Verificación SQL**:
```sql
SELECT p.pedidoid, p.estatus,
       COUNT(CASE WHEN dp.estado_producto = 'Facturado' THEN 1 END) as facturados,
       COUNT(*) as total
FROM pedidos p
JOIN detallesdelpedido dp ON p.pedidoid = dp.pedidoid
WHERE p.estatus = 'Surtido completo'
GROUP BY p.pedidoid, p.estatus;
-- Debería mostrar: facturados = total (todos facturados)
```

## 🔄 Flujo Completo de Transición

```
CREAR PEDIDO
    ├─ TODO backorder → Bajo pedido
    ├─ TODO stock → Completo
    └─ MIX → Combinado

ALMACÉN MARCA PRODUCTOS (estado_producto = 'Surtido')
    ├─ Si no hay Facturados → Listo para remisionar
    └─ Si hay Facturados → Respeta ese estado

FINANZAS CONFIRMA (estado_producto = 'Facturado')
    ├─ UNO O VARIOS → Surtido parcial (si no todos)
    └─ TODOS → Surtido completo
```

## 📝 Checklist de Verificación

- [ ] **Setup DB**: Asegurar que `detallesdelpedido` tiene `estado_producto` column
- [ ] **Prueba CREATE**: Crear pedido con todos backorder → debe ser "Bajo pedido"
- [ ] **Prueba CREATE**: Crear pedido con todos stock → debe ser "Completo"
- [ ] **Prueba CREATE**: Crear pedido con MIX → debe ser "Combinado"
- [ ] **Prueba WAREHOUSE**: Marcar 1 producto → debe ir a "Listo para remisionar"
- [ ] **Prueba FINANCE**: Confirmar 1 remisión → debe ir a "Surtido parcial"
- [ ] **Prueba FINANCE**: Confirmar última remisión → debe ir a "Surtido completo"
- [ ] **Prueba LOGS**: Verificar que `calcularEstadoPedidoCorrect` se llama en cada transición
- [ ] **Prueba API**: Verificar que API devuelve estado correcto después de cada operación

## 🛠️ Troubleshooting

### Problema: Estado no cambia después de marcar surtidos
**Solución**: Verificar que `controllers/pedidosAdminController.js` hacia llamadas a `calcularEstadoPedidoCorrect` después del UPDATE de `estado_producto`

### Problema: Estado no cambia después de finanzas confirma
**Solución**: Verificar que `controllers/remisionesController.js` hace llamadas a `calcularEstadoPedidoCorrect` después del UPDATE de `estado_producto = 'Facturado'`

### Problema: Detalles sin `estado_producto`
**Solución**: Ejecutar migration para actualizar detalles existentes:
```sql
UPDATE detallesdelpedido
SET estado_producto = CASE 
  WHEN esbackorder THEN 'Bajo pedido'
  ELSE 'Con stock'
END
WHERE estado_producto IS NULL;
```

## 📊 Campos de Base de Datos

| Campo | Tabla | Tipo | Valores Válidos | Descripción |
|-------|-------|------|-----------------|-------------|
| `estado_producto` | `detallesdelpedido` | VARCHAR | 'Bajo pedido', 'Con stock', 'Surtido', 'Facturado' | Estado actual del producto en el detalle |
| `esbackorder` | `detallesdelpedido` | BOOLEAN | true/false | Flag inicial de si hay stock |
| `estatus` | `pedidos` | VARCHAR | Los 6 estados | Estado calculado del pedido completo |

## 🔗 Archivos Modificados
1. `controllers/pedidosController.js` - Agregó `estado_producto` en inserts + usa `calcularEstadoPedidoCorrect`
2. `controllers/pedidosAdminController.js` - Actualiza estado después de marcar surtidos
3. `controllers/remisionesController.js` - Actualiza estado después de confirmar finanzas
4. `utils/pedidoStatus.js` - Función `calcularEstadoPedidoCorrect` con lógica de 6 estados (ya existía)

---

**Última actualización**: 2026-02-28
**Status**: ✅ Implementado y listo para validación
