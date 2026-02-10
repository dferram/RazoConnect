# Sistema de Prioridad Manual (Priority Queue)

## Resumen Ejecutivo

El sistema de **Priority Queue** permite al administrador anular el orden FIFO estricto y dar prioridad manual a pedidos urgentes de clientes importantes. Esto resuelve el conflicto entre "Eficiencia Algorítmica" vs "Criterio de Negocio".

### Concepto: Carril VIP

- **Carril Normal (FIFO):** Los pedidos se procesan por orden de llegada (First In, First Out)
- **Carril VIP (Prioridad Manual):** El admin puede marcar pedidos como prioritarios para que "salten la fila"

### Efecto Dominó (Zero-Sum Game)

Si hay **10 piezas disponibles**:
- Pedido A (antiguo) tenía asignadas las 10 piezas → **Surtido**
- Admin marca Pedido B (nuevo) como **Prioritario**
- **Resultado:** Pedido B toma las 10 piezas → Pedido A pasa a **Backorder**

---

## Arquitectura Técnica

### 1. Base de Datos

**Migración:** `migrations/add_es_prioritario_to_pedidos.sql`

```sql
ALTER TABLE pedidos 
ADD COLUMN es_prioritario BOOLEAN DEFAULT FALSE;

CREATE INDEX idx_pedidos_prioridad 
ON pedidos(es_prioritario DESC, fechapedido ASC);

CREATE INDEX idx_pedidos_tenant_prioridad 
ON pedidos(tenant_id, es_prioritario DESC, fechapedido ASC);
```

**Índices Optimizados:**
- Orden de búsqueda: VIPs primero (DESC), luego FIFO (ASC)
- Filtrado por tenant para multi-tenancy

---

### 2. Backend

#### 2.1 Endpoint de Simulación (Nuevo)

**Ruta:** `POST /api/admin/pedidos/:id/simulate-priority`

**Archivo:** `controllers/pedidosController.js`

**Funcionalidad:**
- Ejecuta el algoritmo de reasignación en modo "dry-run" (sin modificar BD)
- Retorna qué pedidos serían afectados si se aplicara el cambio
- Permite al usuario tomar una decisión informada ANTES de aplicar cambios

**Respuesta (Sin impacto):**
```json
{
  "success": true,
  "wouldBeVIP": true,
  "noImpact": true,
  "impactedOrders": [],
  "message": "No hay impacto negativo en otros pedidos"
}
```

**Respuesta (Con impacto):**
```json
{
  "success": true,
  "wouldBeVIP": true,
  "noImpact": false,
  "impactedOrders": [
    {
      "pedidoId": 100,
      "clienteNombre": "Juan Pérez",
      "estadoAnterior": "Surtido",
      "estadoNuevo": "Backorder",
      "itemsAfectados": [
        {
          "producto": "Globos Metálicos",
          "dimensiones": "18 pulgadas",
          "piezas": 50
        }
      ]
    }
  ],
  "message": "1 pedido(s) pasarían a backorder"
}
```

#### 2.2 Endpoint de Toggle

**Ruta:** `POST /api/admin/pedidos/:id/toggle-priority`

**Archivo:** `controllers/pedidosController.js`

**Funcionalidad:**
- Cambia el flag `es_prioritario` del pedido
- Valida que el pedido esté en estado modificable (`Pendiente`, `Aprobado`, `Parcialmente Surtido`)
- Dispara reasignación automática de stock (async)

**Respuesta:**
```json
{
  "success": true,
  "message": "Pedido marcado como prioritario. El sistema reasignará el stock disponible.",
  "es_prioritario": true,
  "pedidoid": 123
}
```

#### 2.2 Lógica FIFO Modificada

**Archivo:** `services/SmartStockService.js`

**Función:** `calculateAllocationStatus()`

**Query Crítico:**
```sql
SELECT SUM(d.piezastotales) as deuda_previa
FROM detallesdelpedido d
INNER JOIN pedidos p ON p.pedidoid = d.pedidoid
WHERE d.varianteid = $1
  AND (
    -- VIP orders ALWAYS have priority
    (COALESCE(p.es_prioritario, false) = true)
    OR
    -- Non-VIP orders only count if older
    (COALESCE(p.es_prioritario, false) = false AND p.fechapedido < $2)
  )
  AND p.estatus NOT IN ('Cancelado', 'Entregado')
```

**Lógica:**
1. Pedidos VIP **siempre** están primero en la fila (sin importar fecha)
2. Pedidos normales se ordenan por fecha (FIFO tradicional)
3. El stock se asigna en ese orden

#### 2.3 Simulación de Impacto (Nuevo)

**Función:** `simulatePriorityImpact(pedidoId, tenantId)`

**Archivo:** `services/SmartStockService.js`

**Proceso:**
1. **Obtener información del pedido objetivo**
2. **Si se está removiendo prioridad:** Retornar sin impacto (no afecta negativamente)
3. **Obtener todas las variantes del pedido**
4. **Para cada variante:**
   - Obtener stock físico disponible
   - Simular el orden de pedidos CON el pedido objetivo como VIP
   - Calcular qué pedidos perderían stock
5. **Retornar lista de pedidos afectados** con detalles de items

**Características:**
- ✅ **Dry-run:** NO modifica la base de datos
- ✅ **Detallado:** Muestra exactamente qué items de qué pedidos serían afectados
- ✅ **Rápido:** Ejecuta en memoria sin transacciones

**Logging:**
```
🔮 [SIMULATION] Simulando impacto para Pedido #123
🔮 [SIMULATION] 2 pedidos serían afectados
```

#### 2.4 Reasignación Automática

**Función:** `reallocateStockForVariant(varianteId, tenantId)`

**Proceso:**
1. **Obtener stock físico total** de la variante
2. **Listar todos los pedidos pendientes** ordenados por prioridad
3. **Algoritmo de reasignación:**
   - Recorrer pedidos en orden VIP → FIFO
   - Asignar stock disponible hasta agotarlo
   - Actualizar `esbackorder` en `detallesdelpedido`
4. **Actualizar estatus de pedidos:**
   - `Aprobado`: Todo surtido
   - `Parcialmente Surtido`: Algunos items en backorder
   - `Backorder`: Todo pendiente

**Logging:**
```
🔄 [REALLOCATION] Iniciando para Variante 456
📦 [REALLOCATION] Stock físico total: 100 piezas
📋 [REALLOCATION] 5 detalles de pedido a procesar
   🟢 Pedido #123 ⭐ VIP: Backorder → Surtido
   🔴 Pedido #120: Surtido → Backorder
✅ [REALLOCATION] Completada: 2 cambios en 2 pedidos
```

---

### 3. Frontend

#### 3.1 UI en Admin Pedidos

**Archivo:** `tenants_views/razo/admin-pedidos.html`

**Columna de Prioridad:**
- **Estrella llena (⭐):** Pedido prioritario
- **Estrella vacía (☆):** Pedido normal
- **Estrella gris (☆):** No se puede cambiar prioridad (estado no válido)

**Interacción:**
- Click en estrella → Modal de confirmación (SweetAlert2)
- Muestra advertencia sobre efecto dominó
- Confirmar → Llamada a API → Recarga tabla

**Estados Válidos para Toggle:**
- ✅ `Pendiente`
- ✅ `Aprobado`
- ✅ `Parcialmente Surtido`
- ❌ `Cancelado`, `Entregado`, `Enviado`

#### 3.2 Confirmación con SweetAlert

```javascript
Swal.fire({
  title: 'Marcar como Prioritario',
  html: `
    <p>¿Estás seguro de marcar como prioritario del Pedido #123?</p>
    <p style="background: #f5f5f5; padding: 1rem;">
      <strong>⚠️ Efecto:</strong> Este pedido se saltará la fila FIFO 
      y tomará prioridad sobre pedidos más antiguos. Si hay stock limitado, 
      otros pedidos podrían pasar a backorder.
    </p>
  `,
  icon: 'warning',
  confirmButtonText: 'Sí, marcar como VIP'
});
```

---

## Casos de Uso

### Caso 1: Cliente VIP con Pedido Urgente

**Escenario:**
- Stock disponible: 50 piezas
- Pedido #100 (hace 3 días): 50 piezas → **Surtido**
- Pedido #105 (hoy): 50 piezas, cliente importante → **Backorder**

**Acción del Admin:**
1. Marca Pedido #105 como prioritario (⭐)
2. Sistema recalcula asignación

**Resultado:**
- Pedido #105: **Backorder → Surtido** ✅
- Pedido #100: **Surtido → Backorder** ⚠️

### Caso 2: Múltiples Pedidos VIP

**Escenario:**
- Stock: 100 piezas
- Pedido #90 (VIP, hace 5 días): 40 piezas
- Pedido #95 (VIP, hace 2 días): 40 piezas
- Pedido #100 (Normal, hoy): 40 piezas

**Orden de Asignación:**
1. Pedido #90 (VIP más antiguo): 40 piezas → **Surtido**
2. Pedido #95 (VIP más reciente): 40 piezas → **Surtido**
3. Pedido #100 (Normal): 20 piezas → **Parcialmente Surtido** (20 backorder)

### Caso 3: Remover Prioridad

**Acción:**
- Admin hace click en estrella llena (⭐) → Estrella vacía (☆)
- Pedido vuelve al orden FIFO normal según su fecha

**Efecto:**
- Pedidos más antiguos pueden recuperar su stock asignado

---

## Reglas de Negocio

### ✅ Garantías

1. **Transparencia Total:** El admin ve claramente qué pedidos son VIP (⭐)
2. **Auditoría:** Todos los cambios se loguean en consola con timestamps
3. **Consistencia:** La reasignación es atómica (transacción SQL)
4. **No Pérdida de Stock:** El stock físico NO cambia, solo su asignación

### ⚠️ Advertencias

1. **Efecto Dominó:** Priorizar un pedido puede afectar a otros
2. **No Reversible Automáticamente:** Si se genera remisión, el cambio es permanente
3. **Solo Admin:** Los clientes NO ven ni pueden solicitar prioridad

### 🚫 Restricciones

1. **Estados Bloqueados:** No se puede cambiar prioridad de pedidos `Cancelado` o `Entregado`
2. **Tenant Isolation:** La prioridad solo afecta pedidos del mismo tenant
3. **Stock Real:** La prioridad NO crea stock, solo lo redistribuye

---

## Testing

### Test 1: Prioridad Básica

```bash
# 1. Crear dos pedidos con stock limitado
POST /api/pedidos
{
  "items": [{ "varianteId": 1, "cantidad": 10 }]
}

# 2. Verificar que Pedido A está surtido, Pedido B en backorder
GET /api/admin/pedidos

# 3. Marcar Pedido B como prioritario
POST /api/admin/pedidos/B/toggle-priority

# 4. Verificar que Pedido B ahora está surtido, Pedido A en backorder
GET /api/admin/pedidos
```

### Test 2: Múltiples VIPs

```bash
# 1. Crear 3 pedidos VIP con fechas diferentes
# 2. Verificar que se respeta FIFO entre VIPs
# 3. Crear 1 pedido normal
# 4. Verificar que los VIPs tienen prioridad sobre el normal
```

### Test 3: Remover Prioridad

```bash
# 1. Marcar pedido como VIP
# 2. Verificar cambio de estatus
# 3. Remover prioridad (toggle nuevamente)
# 4. Verificar que vuelve a FIFO normal
```

---

## Monitoreo y Logs

### Logs Clave

```
⭐ [PRIORIDAD] Pedido #123 - Prioridad ACTIVADA
🔄 [REALLOCATION] Iniciando para Variante 456
📦 [REALLOCATION] Stock físico total: 100 piezas
   🟢 Pedido #123 ⭐ VIP: Backorder → Surtido
   🔴 Pedido #120: Surtido → Backorder
✅ [REALLOCATION] Completada: 2 cambios en 2 pedidos
```

### Queries de Auditoría

```sql
-- Ver todos los pedidos VIP activos
SELECT pedidoid, clienteid, fechapedido, estatus
FROM pedidos
WHERE es_prioritario = true
  AND estatus NOT IN ('Cancelado', 'Entregado')
ORDER BY fechapedido ASC;

-- Ver cambios de estatus por reasignación
SELECT p.pedidoid, p.es_prioritario, d.esbackorder, d.piezastotales
FROM pedidos p
INNER JOIN detallesdelpedido d ON d.pedidoid = p.pedidoid
WHERE p.es_prioritario = true
ORDER BY p.fechapedido ASC;
```

---

## Mejoras Futuras (Opcional)

### 1. Historial de Prioridad
- Tabla `pedido_prioridad_historial` para auditoría
- Registrar quién cambió la prioridad y cuándo

### 2. Niveles de Prioridad
- En lugar de boolean, usar `prioridad_nivel` (1-5)
- Permitir múltiples niveles VIP

### 3. Notificaciones
- Email automático cuando un pedido pierde stock por reasignación
- Dashboard de "Pedidos Afectados por Prioridad"

### 4. Reglas Automáticas
- Auto-priorizar pedidos de clientes con `cliente_tipo = 'VIP'`
- Auto-priorizar pedidos con `monto > $10,000`

---

## Soporte y Troubleshooting

### Problema: "No se puede cambiar prioridad"

**Causa:** El pedido está en estado `Cancelado` o `Entregado`

**Solución:** Solo se puede cambiar prioridad de pedidos activos

### Problema: "El stock no se reasignó"

**Causa:** La reasignación es asíncrona (no bloquea la UI)

**Solución:** Esperar 2-3 segundos y recargar la página

### Problema: "Pedido VIP sigue en backorder"

**Causa:** No hay stock físico disponible (ni siquiera para VIPs)

**Solución:** Verificar stock real en `stock_admin` o `producto_variantes`

---

## Conclusión

El sistema de **Priority Queue** da al administrador el "Botón Rojo" para tomar decisiones comerciales críticas, manteniendo la integridad del inventario y la transparencia total del proceso.

**Filosofía:** "La tecnología debe servir al negocio, no al revés."
