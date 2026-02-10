# Guía Visual del Sistema de Prioridad VIP

## 🎯 ¿Qué es y para qué sirve?

El **Sistema de Prioridad VIP** te permite dar prioridad manual a pedidos urgentes de clientes importantes. Es como tener un "carril rápido" en el supermercado para clientes VIP.

### Problema que resuelve:
- **Antes:** Los pedidos se surtían SOLO por orden de llegada (FIFO)
- **Ahora:** Puedes decidir qué pedidos son más importantes y surtirlos primero

---

## 📍 ¿Dónde está el botón?

### 1. En la Lista de Pedidos (`admin-pedidos.html`)

**Ubicación:** Segunda columna de la tabla, llamada "Prioridad"

```
┌─────────────────────────────────────────────────────────────┐
│  #ID  │ Prioridad │ Cliente │ Fecha │ Total │ Estado │ ... │
├─────────────────────────────────────────────────────────────┤
│  #123 │    ⭐     │ Juan P. │ 10/02 │ $500  │ Pend.  │ ... │  ← Pedido VIP
│  #124 │    ☆      │ María G.│ 10/02 │ $300  │ Pend.  │ ... │  ← Pedido Normal
│  #125 │    ☆      │ Pedro L.│ 09/02 │ $800  │ Pend.  │ ... │  ← Pedido Normal
└─────────────────────────────────────────────────────────────┘
```

**Símbolos:**
- ⭐ **Estrella llena** = Pedido prioritario (VIP)
- ☆ **Estrella vacía** = Pedido normal (FIFO)
- ☆ **Estrella gris** = No se puede cambiar (pedido ya entregado/cancelado)

### 2. En el Detalle del Pedido (`admin-pedido-detalle.html`)

**Ubicación:** Junto al badge de estado, arriba a la derecha

```
┌──────────────────────────────────────────────────────┐
│  Pedido #123                                         │
│  10 de febrero, 2026                                 │
│                                                      │
│                        ┌──────────────┐  ┌─────────┐│
│                        │ ⭐ PRIORITARIO│  │Pendiente││
│                        └──────────────┘  └─────────┘│
│                                                      │
│  Monto total: $500.00                               │
└──────────────────────────────────────────────────────┘
```

---

## 🚀 ¿Cómo usar el sistema?

### Paso 1: Identificar el pedido urgente

1. Abre **Admin → Pedidos** (`admin-pedidos.html`)
2. Busca el pedido del cliente importante
3. Verifica que esté en estado: `Pendiente`, `Aprobado` o `Parcialmente Surtido`

### Paso 2: Marcar como prioritario

1. Haz clic en la **estrella vacía (☆)** en la columna "Prioridad"
2. El sistema **simulará automáticamente** el impacto (2-3 segundos)

#### Escenario A: Sin Conflictos ✅

Si hay stock suficiente, verás:

```
┌─────────────────────────────────────────────────────┐
│         ✅ Sin Conflictos de Inventario             │
│                                                     │
│  El Pedido #123 puede ser marcado como VIP sin     │
│  afectar a otros pedidos.                           │
│                                                     │
│  ✅ Stock suficiente: Hay inventario disponible    │
│  para surtir este pedido sin quitar stock de       │
│  pedidos existentes.                                │
│                                                     │
│  [ Cancelar ]  [ Sí, marcar como VIP ]            │
└─────────────────────────────────────────────────────┘
```

#### Escenario B: Conflicto Detectado ⚠️

Si otros pedidos serían afectados, verás una **tabla detallada**:

```
┌─────────────────────────────────────────────────────┐
│      ⚠️ Conflicto de Inventario Detectado          │
│                                                     │
│  Si marcas el Pedido #123 como VIP, los            │
│  siguientes 2 pedido(s) perderán su stock:         │
│                                                     │
│  ┌───────────────────────────────────────────────┐ │
│  │ Pedido │ Cliente  │ Actual │ Nuevo │ Items   │ │
│  ├───────────────────────────────────────────────┤ │
│  │ #100   │ Juan P.  │ ✅ Surt│ ❌ Back│ 2 items│ │
│  │ #102   │ María G. │ ✅ Surt│ ❌ Back│ 1 item │ │
│  └───────────────────────────────────────────────┘ │
│                                                     │
│  ⚠️ Advertencia: Esta acción redistribuirá el      │
│  stock disponible. Los pedidos afectados pasarán   │
│  a backorder hasta que haya más inventario.        │
│                                                     │
│  [ Cancelar ]  [ Sí, confirmar prioridad VIP ]    │
└─────────────────────────────────────────────────────┘
```

3. **Revisa cuidadosamente** la tabla de pedidos afectados
4. Si estás de acuerdo, haz clic en **"Sí, confirmar prioridad VIP"**
5. El sistema aplicará los cambios (2-3 segundos)
6. Verás un mensaje de éxito
7. La estrella cambiará a **⭐** (llena)

### Paso 3: Verificar el cambio

1. La tabla se recargará automáticamente
2. El pedido ahora mostrará **⭐** en la columna "Prioridad"
3. Si entras al detalle del pedido, verás el badge **"⭐ PRIORITARIO"**

---

## 🔄 ¿Qué pasa con los demás pedidos?

### Escenario de Ejemplo:

**Situación inicial:**
- Stock disponible: **50 piezas**
- Pedido #100 (hace 3 días): 50 piezas → **Surtido** ✅
- Pedido #105 (hoy): 50 piezas → **Backorder** ❌

**Acción:** Marcas Pedido #105 como VIP ⭐

**Resultado automático:**
```
┌──────────────────────────────────────────────────────┐
│  Pedido #105 (VIP ⭐)                                │
│  Estado: Backorder → SURTIDO ✅                      │
│  Tomó: 50 piezas                                     │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  Pedido #100 (Normal ☆)                              │
│  Estado: Surtido → BACKORDER ⚠️                      │
│  Perdió: 50 piezas (cedidas al VIP)                 │
└──────────────────────────────────────────────────────┘
```

**Logs en consola del servidor:**
```
⭐ [PRIORIDAD] Pedido #105 - Prioridad ACTIVADA
🔄 [REALLOCATION] Iniciando para Variante 456
📦 [REALLOCATION] Stock físico total: 50 piezas
   🟢 Pedido #105 ⭐ VIP: Backorder → Surtido
   🔴 Pedido #100: Surtido → Backorder
✅ [REALLOCATION] Completada: 2 cambios en 2 pedidos
```

---

## 📊 ¿Cómo saber de dónde se tomó el stock?

### En el futuro (próxima actualización):

Cuando entres al detalle de un pedido VIP, verás una sección nueva:

```
┌──────────────────────────────────────────────────────┐
│  📊 Asignación de Stock                              │
│                                                      │
│  Este pedido fue surtido con stock de:              │
│                                                      │
│  • Admin Principal: 30 piezas                       │
│  • Admin Sucursal Norte: 20 piezas                  │
│                                                      │
│  Total asignado: 50 piezas                          │
└──────────────────────────────────────────────────────┘
```

### Por ahora:

Puedes revisar los logs del servidor (consola) para ver el detalle completo de la reasignación.

---

## 🎨 Filtros disponibles

En la página de pedidos, ahora tienes un nuevo filtro:

```
┌─────────────────────────────────────────────────────┐
│  Buscar por cliente: [_______________]              │
│  Filtrar por estatus: [Todos ▼]                     │
│  Filtrar por prioridad: [Todos ▼]  ← NUEVO         │
│                         • Todos                      │
│                         • ⭐ Solo VIP                │
│                         • ☆ Solo Normales           │
└─────────────────────────────────────────────────────┘
```

**Uso:**
- Selecciona **"⭐ Solo VIP"** para ver únicamente pedidos prioritarios
- Selecciona **"☆ Solo Normales"** para ver pedidos en orden FIFO normal

---

## ℹ️ Panel de Ayuda

En la parte superior de `admin-pedidos.html` verás un panel naranja:

```
┌─────────────────────────────────────────────────────┐
│  ⭐ Sistema de Prioridad VIP                    ℹ️  │
│                                                     │
│  ¿Qué hace? Permite dar prioridad manual a         │
│  pedidos urgentes de clientes importantes. Los     │
│  pedidos VIP (⭐) se surten primero, incluso si    │
│  hay pedidos más antiguos esperando.               │
│                                                     │
│  [Haz clic en ℹ️ para ver más detalles]           │
└─────────────────────────────────────────────────────┘
```

**Haz clic en el ícono ℹ️** para expandir la ayuda completa con instrucciones paso a paso.

---

## ⚠️ Reglas importantes

### ✅ Puedes cambiar prioridad cuando el pedido está:
- `Pendiente`
- `Aprobado`
- `Parcialmente Surtido`

### ❌ NO puedes cambiar prioridad cuando el pedido está:
- `Cancelado`
- `Entregado`
- `Enviado`

### 🔄 Para remover la prioridad:
1. Haz clic en la **estrella llena (⭐)**
2. Confirma la acción
3. El pedido volverá al orden FIFO normal según su fecha

---

## 🎯 Casos de uso reales

### Caso 1: Cliente VIP con pedido urgente
**Situación:** Cliente importante necesita su pedido HOY, pero hay pedidos más antiguos en espera.
**Solución:** Marca su pedido como VIP ⭐ y se surtirá primero.

### Caso 2: Evento especial
**Situación:** Cliente tiene un evento mañana y necesita decoraciones urgentes.
**Solución:** Marca el pedido como VIP ⭐ para garantizar entrega a tiempo.

### Caso 3: Cliente con alto volumen
**Situación:** Cliente mayorista hace pedido grande y tiene prioridad comercial.
**Solución:** Marca como VIP ⭐ para mantener la relación comercial.

---

## 🔍 Troubleshooting

### Problema: "No veo la estrella en la columna"
**Solución:** Recarga la página (F5). Si persiste, verifica que ejecutaste la migración SQL.

### Problema: "La estrella está gris y no puedo hacer clic"
**Solución:** El pedido está en un estado no modificable (Cancelado/Entregado). Solo puedes cambiar prioridad de pedidos activos.

### Problema: "Marqué como VIP pero sigue en backorder"
**Solución:** No hay stock físico disponible. El sistema solo redistribuye el stock existente, no lo crea.

### Problema: "No veo el badge PRIORITARIO en el detalle"
**Solución:** Recarga la página del detalle. El badge solo aparece si `es_prioritario = true` en la base de datos.

---

## 📞 Soporte

Si tienes dudas o problemas:
1. Revisa los logs del servidor (consola)
2. Consulta la documentación técnica: `docs/PRIORITY_QUEUE_SYSTEM.md`
3. Contacta al equipo de desarrollo

---

## 🎓 Resumen rápido

1. **Ubicación:** Columna "Prioridad" en tabla de pedidos
2. **Acción:** Clic en estrella vacía (☆) → Confirmar
3. **Efecto:** Pedido se surte primero, otros pueden pasar a backorder
4. **Filtro:** Usa "⭐ Solo VIP" para ver pedidos prioritarios
5. **Ayuda:** Panel naranja en la parte superior con ℹ️

**¡Listo! Ahora tienes el control total sobre qué pedidos se surten primero.** ⭐
