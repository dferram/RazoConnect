# FIFO Allocation System - Casos de Uso y Validación

## 📋 Casos de Uso Críticos

### 1. Pedidos Existentes (Migración)

**Escenario:** Sistema ya tiene pedidos creados con la lógica antigua (sin FIFO).

**Problema:**
- Pedidos existentes pueden tener asignaciones incorrectas
- Múltiples pedidos reclamando el mismo stock
- Backorders que deberían ser surtidos (o viceversa)

**Solución:**
```bash
# Ejecutar recálculo masivo una sola vez después del deploy
POST /api/admin/fifo/recalcular
```

**Resultado Esperado:**
- Todos los pedidos activos se recalculan cronológicamente
- Los pedidos más antiguos mantienen prioridad
- Los pedidos más nuevos se ajustan a backorder si no hay stock

**Ejemplo:**
```
ANTES del recálculo:
- Pedido #100 (10:00 AM): 4 unidades → Surtido ✅
- Pedido #101 (10:05 AM): 4 unidades → Surtido ✅ (INCORRECTO)
- Stock real: 4 unidades

DESPUÉS del recálculo:
- Pedido #100 (10:00 AM): 4 unidades → Surtido ✅
- Pedido #101 (10:05 AM): 0 surtido, 4 backorder → Backorder ✅
- Stock real: 4 unidades
```

---

### 2. Cancelación de Pedido (Liberación de Stock)

**Escenario:** Cliente cancela un pedido que ya tenía stock asignado.

**Problema:**
- El stock se libera, pero los pedidos posteriores siguen en backorder
- Oportunidad perdida de surtir pedidos que estaban esperando

**Solución Implementada:**
- Hook automático en `cancelarPedido()` → `FIFOAllocationService.onPedidoCancelado()`
- Recalcula todos los pedidos posteriores a la fecha del pedido cancelado
- Actualiza automáticamente los que ahora pueden surtirse

**Flujo:**
```
1. Pedido #100 cancelado (tenía 4 unidades asignadas)
   ↓
2. Stock restaurado: +4 unidades
   ↓
3. Sistema busca pedidos posteriores con la misma variante
   ↓
4. Pedido #101 (estaba en backorder) → Recalcula con FIFO
   ↓
5. Pedido #101 ahora puede surtirse → Actualiza a "Surtido"
```

**Ejemplo Real:**
```javascript
// Estado ANTES de cancelar Pedido #100
Stock: 0 unidades
Pedido #100 (10:00 AM): 4 surtidas
Pedido #101 (10:05 AM): 0 surtidas, 4 backorder
Pedido #102 (10:10 AM): 0 surtidas, 2 backorder

// Cliente cancela Pedido #100
→ Stock restaurado: 4 unidades
→ Hook FIFO ejecutado automáticamente

// Estado DESPUÉS de cancelar Pedido #100
Stock: 0 unidades
Pedido #100 (10:00 AM): CANCELADO
Pedido #101 (10:05 AM): 4 surtidas, 0 backorder ✅ (ACTUALIZADO)
Pedido #102 (10:10 AM): 0 surtidas, 2 backorder (sin cambios)
```

---

### 3. Entrega de Pedido (Liberación de Compromiso)

**Escenario:** Admin marca un pedido como "Entregado" subiendo evidencia.

**Problema:**
- El pedido entregado ya no necesita el stock "reservado"
- Los backorders posteriores podrían surtirse si hay nuevo stock

**Solución Implementada:**
- Hook automático en `subirEvidenciaEntrega()` → `FIFOAllocationService.onPedidoEntregado()`
- Recalcula pedidos posteriores que estaban en backorder
- Actualiza si ahora pueden surtirse con stock disponible

**Flujo:**
```
1. Pedido #100 marcado como "Entregado"
   ↓
2. Sistema excluye este pedido de cálculos futuros (estatus = 'Entregado')
   ↓
3. Busca pedidos posteriores en backorder
   ↓
4. Recalcula con FIFO (sin contar el pedido entregado)
   ↓
5. Actualiza pedidos que ahora pueden surtirse
```

**Ejemplo Real:**
```javascript
// Estado ANTES de marcar Pedido #100 como Entregado
Stock: 6 unidades
Pedido #100 (10:00 AM): 4 surtidas (Confirmado)
Pedido #101 (10:05 AM): 2 surtidas, 0 backorder (Confirmado)
Pedido #102 (10:10 AM): 0 surtidas, 4 backorder (Pendiente)

// Admin marca Pedido #100 como "Entregado"
→ Hook FIFO ejecutado automáticamente

// Estado DESPUÉS de marcar como Entregado
Stock: 6 unidades
Pedido #100 (10:00 AM): ENTREGADO (ya no cuenta para FIFO)
Pedido #101 (10:05 AM): 2 surtidas, 0 backorder
Pedido #102 (10:10 AM): 4 surtidas, 0 backorder ✅ (ACTUALIZADO)
```

---

### 4. Pedidos Concurrentes (Race Condition)

**Escenario:** Dos clientes crean pedidos al mismo tiempo para el mismo producto.

**Problema:**
- Sin FIFO: Ambos podrían reclamar el mismo stock
- Con FIFO: El primero en llegar tiene prioridad

**Solución Implementada:**
- Cada pedido usa `new Date()` como `orderDate`
- La lógica FIFO compara `fechapedido` con precisión de milisegundos
- El pedido con `fechapedido` más antigua tiene prioridad absoluta

**Flujo:**
```
Cliente A (10:00:00.123): Crea pedido → orderDate = 2026-02-08 10:00:00.123
Cliente B (10:00:00.456): Crea pedido → orderDate = 2026-02-08 10:00:00.456

FIFO calcula:
- Pedido A: deudaPrevia = 0 (no hay pedidos anteriores)
- Pedido B: deudaPrevia = stock usado por Pedido A
```

**Ejemplo Real:**
```javascript
Stock: 4 unidades

// Cliente A (10:00:00.123)
Pedido #100: 4 unidades solicitadas
→ FIFO: stockDisponible = 4 - 0 = 4
→ Resultado: 4 surtidas ✅

// Cliente B (10:00:00.456) - 333ms después
Pedido #101: 4 unidades solicitadas
→ FIFO: stockDisponible = 4 - 4 (Pedido #100) = 0
→ Resultado: 0 surtidas, 4 backorder ✅
```

---

### 5. Actualización de Stock Manual

**Escenario:** Admin ajusta el stock manualmente (recepción de inventario, corrección, etc.).

**Problema:**
- Los pedidos en backorder no se actualizan automáticamente
- Oportunidad perdida de surtir pedidos

**Solución Recomendada:**
```bash
# Después de ajustar stock, ejecutar recálculo para la variante afectada
POST /api/admin/fifo/recalcular
```

**Alternativa Automática (Futura):**
- Agregar hook en `SmartStockService.adjustStock()`
- Detectar incrementos de stock
- Recalcular automáticamente pedidos en backorder

**Ejemplo:**
```javascript
// Estado ANTES de recibir inventario
Stock: 0 unidades
Pedido #100 (10:00 AM): 0 surtidas, 4 backorder
Pedido #101 (10:05 AM): 0 surtidas, 4 backorder

// Admin recibe 10 unidades de inventario
→ Stock: 10 unidades
→ Ejecutar: POST /api/admin/fifo/recalcular

// Estado DESPUÉS del recálculo
Stock: 2 unidades
Pedido #100 (10:00 AM): 4 surtidas, 0 backorder ✅
Pedido #101 (10:05 AM): 4 surtidas, 0 backorder ✅
```

---

### 6. Pedidos Parciales (Split Surtido/Backorder)

**Escenario:** Stock insuficiente para surtir completamente, pero suficiente para surtir parcialmente.

**Problema:**
- Determinar cuánto se surte y cuánto va a backorder
- Respetar la cola FIFO para pedidos posteriores

**Solución Implementada:**
- FIFO calcula `cantidadSurtible` y `cantidadBackorder` por separado
- El split respeta la regla de empaque del proveedor
- Los pedidos posteriores solo ven el stock restante

**Ejemplo:**
```javascript
Stock: 6 unidades
Regla de empaque: Unitario (multiplo = 1)

// Pedido #100 (10:00 AM): 4 unidades
→ FIFO: stockDisponible = 6 - 0 = 6
→ Resultado: 4 surtidas, 0 backorder ✅

// Pedido #101 (10:05 AM): 4 unidades
→ FIFO: stockDisponible = 6 - 4 = 2
→ Resultado: 2 surtidas, 2 backorder ⚠️ (PARCIAL)

// Pedido #102 (10:10 AM): 2 unidades
→ FIFO: stockDisponible = 6 - 6 = 0
→ Resultado: 0 surtidas, 2 backorder ✅
```

---

### 7. Inventario Distribuido (Multi-Admin)

**Escenario:** Diferentes admins manejan su propio stock local.

**Problema:**
- Cada admin debe tener su propia cola FIFO
- No mezclar pedidos de diferentes admins

**Solución Implementada:**
- FIFO filtra por `admin_responsable_id` en la consulta de deuda previa
- Cada admin tiene su cola FIFO independiente
- El stock se consulta de `stock_admin` por admin

**Ejemplo:**
```javascript
Stock Admin A: 4 unidades
Stock Admin B: 4 unidades

// Pedidos de Admin A
Pedido #100 (Admin A, 10:00 AM): 4 unidades → 4 surtidas ✅
Pedido #101 (Admin A, 10:05 AM): 4 unidades → 0 surtidas, 4 backorder ✅

// Pedidos de Admin B (cola independiente)
Pedido #102 (Admin B, 10:00 AM): 4 unidades → 4 surtidas ✅
Pedido #103 (Admin B, 10:05 AM): 4 unidades → 0 surtidas, 4 backorder ✅
```

---

### 8. Detección de Conflictos

**Escenario:** Validar que no haya inconsistencias en la asignación FIFO.

**Problema:**
- Detectar si múltiples pedidos reclaman más stock del disponible
- Identificar variantes con problemas

**Solución Implementada:**
```bash
GET /api/admin/fifo/conflictos
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Encontrados 2 conflictos de allocation",
  "data": {
    "conflictos": [
      {
        "varianteId": 456,
        "sku": "CAJ-001-20X20",
        "producto": "Caja de Regalo 20x20",
        "stockDisponible": 4,
        "piezasComprometidas": 12,
        "deficit": 8,
        "numPedidos": 3,
        "pedidosIds": [101, 102, 103],
        "fechasPedidos": ["2026-02-08T10:00:00", "2026-02-08T10:05:00", "2026-02-08T10:10:00"]
      }
    ]
  }
}
```

**Acción Recomendada:**
```bash
# Si se detectan conflictos, ejecutar recálculo masivo
POST /api/admin/fifo/recalcular
```

---

## 🔒 Garantías del Sistema

### Garantía Matemática Principal
```
Para cualquier variante en cualquier momento:
SUM(cantidadSurtida de pedidos activos) ≤ Stock Físico
```

### Garantías Secundarias

1. **Prioridad Cronológica:**
   - Los pedidos más antiguos SIEMPRE tienen prioridad
   - No se puede "saltar la cola"

2. **Consistencia Transaccional:**
   - Todas las operaciones usan `BEGIN/COMMIT`
   - Rollback automático en caso de error
   - Locks de fila previenen race conditions

3. **Recálculo Automático:**
   - Cancelación de pedido → Recalcula posteriores
   - Entrega de pedido → Recalcula posteriores
   - Sin intervención manual necesaria

4. **Aislamiento por Tenant:**
   - Cada tenant tiene su propia cola FIFO
   - No hay cross-contamination entre tenants

5. **Aislamiento por Admin:**
   - Cada admin tiene su cola FIFO independiente
   - Stock local manejado por separado

---

## 🧪 Plan de Pruebas

### Prueba 1: Migración de Pedidos Existentes
```bash
# 1. Crear pedidos con lógica antigua (simular)
# 2. Ejecutar recálculo masivo
POST /api/admin/fifo/recalcular

# 3. Verificar que no haya conflictos
GET /api/admin/fifo/conflictos

# 4. Validar que SUM(surtidos) ≤ Stock
```

### Prueba 2: Cancelación y Recálculo
```bash
# 1. Crear 3 pedidos con stock limitado
# 2. Cancelar el primero
# 3. Verificar que el segundo se actualice automáticamente
# 4. Revisar logs: "[FIFO] ✅ Recálculo FIFO completado"
```

### Prueba 3: Pedidos Concurrentes
```bash
# 1. Abrir 2 navegadores
# 2. Agregar mismo producto al carrito
# 3. Hacer checkout simultáneamente
# 4. Verificar que solo uno se surta completamente
```

### Prueba 4: Entrega y Liberación
```bash
# 1. Crear pedido y marcarlo como Confirmado
# 2. Crear segundo pedido (debería ir a backorder)
# 3. Marcar primero como Entregado
# 4. Verificar que el segundo se recalcule automáticamente
```

### Prueba 5: Validación de Conflictos
```bash
# 1. Ejecutar endpoint de conflictos
GET /api/admin/fifo/conflictos

# 2. Si hay conflictos, ejecutar recálculo
POST /api/admin/fifo/recalcular

# 3. Volver a validar (debería retornar 0 conflictos)
GET /api/admin/fifo/conflictos
```

---

## 📊 Monitoreo y Debugging

### Logs Importantes

**Creación de Pedido:**
```
🔍 [FIFO] Variante 456 - Stock físico: 4 piezas
📊 [FIFO] Deuda previa: 0 piezas (0 pedidos anteriores)
✅ [FIFO] Resultado: SURTIDO - Surtible: 4/4 paquetes
```

**Cancelación de Pedido:**
```
🔄 [FIFO] Hook: Pedido #100 cancelado - Recalculando pedidos posteriores
📦 Recalculando 2 variantes afectadas
✅ Pedido #101 actualizado: 0→4 surtido, 4→0 backorder
✅ Recálculo post-cancelación completado
```

**Entrega de Pedido:**
```
🔄 [FIFO] Hook: Pedido #100 entregado - Recalculando backorders posteriores
📦 Recalculando 1 variantes afectadas
✅ Recálculo post-entrega completado
```

### Queries de Diagnóstico

**Ver deuda previa de una variante:**
```sql
SELECT 
  p.pedidoid,
  p.fechapedido,
  d.cantidadpaquetes,
  d.piezastotales,
  d.esbackorder
FROM detallesdelpedido d
INNER JOIN pedidos p ON p.pedidoid = d.pedidoid
WHERE d.varianteid = 456
  AND p.estatus NOT IN ('Cancelado', 'Entregado')
  AND d.esbackorder = false
ORDER BY p.fechapedido ASC;
```

**Validar consistencia:**
```sql
SELECT 
  d.varianteid,
  SUM(d.cantidadsurtida) as total_surtido,
  (SELECT COALESCE(SUM(cantidad), 0) FROM stock_admin WHERE variante_id = d.varianteid) as stock_disponible
FROM detallesdelpedido d
INNER JOIN pedidos p ON p.pedidoid = d.pedidoid
WHERE p.estatus NOT IN ('Cancelado', 'Entregado')
  AND d.esbackorder = false
GROUP BY d.varianteid
HAVING SUM(d.cantidadsurtida) > (SELECT COALESCE(SUM(cantidad), 0) FROM stock_admin WHERE variante_id = d.varianteid);
```

---

## 🚨 Troubleshooting

### Problema: Pedidos no se recalculan después de cancelación

**Diagnóstico:**
```bash
# Revisar logs del servidor
grep "FIFO HOOK" server.log
```

**Solución:**
- Verificar que `FIFOAllocationService.js` esté en `services/`
- Verificar que no haya errores de sintaxis
- Ejecutar recálculo manual: `POST /api/admin/fifo/recalcular`

### Problema: Conflictos detectados después del recálculo

**Diagnóstico:**
```bash
GET /api/admin/fifo/conflictos
```

**Solución:**
- Revisar si hay pedidos con `fechapedido` NULL
- Verificar que `stock_admin` tenga datos correctos
- Ejecutar recálculo nuevamente

### Problema: Pedidos concurrentes se surten ambos

**Diagnóstico:**
- Revisar timestamps en `pedidos.fechapedido`
- Verificar que ambos tengan fechas diferentes

**Solución:**
- Asegurar que el servidor use `new Date()` en cada pedido
- Verificar que no haya cache de fecha
- Ejecutar recálculo manual

---

## 📝 Checklist de Implementación

- [x] Crear `SmartStockService.calculateAllocationStatus()`
- [x] Integrar FIFO en `pedidosController.crearPedido()`
- [x] Crear `FIFOAllocationService` con hooks
- [x] Integrar hook en `cancelarPedido()`
- [x] Integrar hook en `subirEvidenciaEntrega()`
- [x] Crear endpoint de recálculo masivo
- [x] Crear endpoint de recálculo individual
- [x] Crear endpoint de detección de conflictos
- [x] Agregar rutas en `routes/admin.js`
- [x] Documentar casos de uso
- [ ] **Ejecutar recálculo masivo en producción (CRÍTICO)**
- [ ] Validar que no haya conflictos
- [ ] Monitorear logs durante 24 horas
- [ ] Crear alertas automáticas para conflictos

---

**Última actualización:** 2026-02-08  
**Versión:** 1.0.0  
**Estado:** Listo para producción con recálculo masivo pendiente
