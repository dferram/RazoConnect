# Sistema de 6 Estados de Pedidos - RazoConnect

## Introducción

Este documento explica el sistema de **6 estados dinámicos** que gestiona automáticamente el ciclo de vida de los pedidos basándose en **stock disponible en tiempo real** y **acciones manuales de almacén/finanzas**.

---

## Los 6 Estados

### 1. 🔴 BAJO PEDIDO
- **Condición**: NO hay stock disponible para NINGÚN producto
- **Base de cálculo**: `stock_admin.cantidad - stock_admin.cantidad_reservada < piezas_requeridas` (para TODOS)
- **Cuándo ocurre**: Al crear pedido O cuando stock se agota
- **Dinámico**: ✅ SÍ - Cambia si llega stock nuevo

**Ejemplo**:
```
Pedido: 100 unidades producto X
Stock actual: 0
Estado: 🔴 BAJO PEDIDO
```

---

### 2. 🟠 COMBINADO
- **Condición**: ALGUNOS productos tienen stock Y OTROS no
- **Base de cálculo**: `SOME (stock >= requerido) AND SOME (stock < requerido)`
- **Cuándo ocurre**: Al crear pedido O cuando cambia disponibilidad
- **Dinámico**: ✅ SÍ - Cambia si stock llega/se agota

**Ejemplo**:
```
Pedido: Producto A (50 unidades, stock=0) + Producto B (30 unidades, stock=40)
Estado: 🟠 COMBINADO
```

---

### 3. 🟡 COMPLETO
- **Condición**: Hay stock disponible para TODOS los productos
- **Base de cálculo**: `stock_admin.cantidad - stock_admin.cantidad_reservada >= piezas_requeridas` (para TODOS)
- **Cuándo ocurre**: Al crear pedido O cuando stock disponible es suficiente
- **Dinámico**: ✅ SÍ - Cambia si stock se agota

**Ejemplo**:
```
Pedido: 100 unidades producto X
Stock actual: 120
Estado: 🟡 COMPLETO
```

---

### 4. 🔵 LISTO PARA REMISIONAR
- **Condición**: Almacén marcó productos para surtir (`estado_producto = 'Surtido'`)
- **Base de cálculo**: `ANY detalle.estado_producto = 'Surtido' AND NO Facturados`
- **Cuándo ocurre**: Acción manual del almacén (marca para enviar)
- **Dinámico**: ❌ NO - Fijo hasta próxima acción

**Quién lo dispara**: 🏭 Personal de Almacén

**Cómo se logra**:
```sql
UPDATE detallesdelpedido 
SET estado_producto = 'Surtido', cantidadsurtida = cantidadpaquetes
WHERE pedidoid = X AND detalleid = Y
```

---

### 5. 🟠 SURTIDO PARCIAL
- **Condición**: Finanzas confirmó ALGUNOS productos (`estado_producto = 'Facturado'`), pero NO todos
- **Base de cálculo**: `0 < COUNT(estado_producto='Facturado') < total_productos`
- **Cuándo ocurre**: Acción manual de finanzas (confirma remisión parcial)
- **Dinámico**: ❌ NO - Fijo hasta siguiente confirmación

**Quién lo dispara**: 💰 Personal de Finanzas

**Cómo se logra**:
```sql
UPDATE detallesdelpedido 
SET estado_producto = 'Facturado'
WHERE remision_id IN (remisiones confirmadas)
```

---

### 6. 🟢 SURTIDO COMPLETO
- **Condición**: Finanzas confirmó TODOS los productos (`estado_producto = 'Facturado'`)
- **Base de cálculo**: `COUNT(estado_producto='Facturado') = total_productos`
- **Cuándo ocurre**: Acción manual de finanzas (confirma último grupo)
- **Dinámico**: ❌ NO - Terminal, pedido finalizado

**Quién lo dispara**: 💰 Personal de Finanzas

**Cómo se logra**:
```sql
UPDATE detallesdelpedido 
SET estado_producto = 'Facturado'
WHERE remision_id = (última remisión)
```

---

## Flujo Completo de Transiciones

```
┌─────────────────────────────────────────────────────────┐
│ CREAR PEDIDO                                             │
│ Sistema verifica: stock_admin.cantidad - cantidad_reservada
└─────────────────────────────────────────────────────────┘
                           ↓
        ┌──────────────────┼──────────────────┐
        ↓                  ↓                   ↓
    🔴 BAJO PEDIDO    🟠 COMBINADO       🟡 COMPLETO
    (Todos sin       (Mix stock/         (Todos con
     stock)          backorder)           stock)
        ↓                  ↓                   ↓
        └──────────────────┼──────────────────┘
              ↓ [DINÁMICO: Puede cambiar si stock llega/se agota]
    
    Llega OC / Stock baja → Recalcula automáticamente
              ↓
        🏭 ING. ALMACÉN marca para surtir
        UPDATE estado_producto = 'Surtido'
              ↓
        🔵 LISTO PARA REMISIONAR
        (Esperando confirmación)
              ↓
        💰 FINANZAS confirma remisión
        UPDATE estado_producto = 'Facturado'
              ↓
        ┌─────────────────────────────────┐
        ↓                                   ↓
    🟠 SURTIDO PARCIAL           🟢 SURTIDO COMPLETO ✅
    (ALGUNOS confirmados)        (TODOS confirmados)
    (Hay más remisiones)         (Pedido finalizado)
        ↓
    Más remisiones → Regresa a 🔵
```

---

## Implementación Técnica

### Función Principal: `calcularEstadoPedidoCorrect(client, pedidoId)`

**Ubicación**: `utils/pedidoStatus.js` (líneas 29-80)

**Qué hace**:
1. Obtiene detalles del pedido con JOIN a `stock_admin` en TIEMPO REAL
2. Verifica `estado_producto` para estados 4-6 (acciones)
3. Verifica `stock_disponible = cantidad - cantidad_reservada` para estados 1-3 (dinámicos)
4. Retorna el estado correcto basado en prioridades

**Prioridades de evaluación**:
```
NIVEL 1: ¿Hay Facturados?
    ├─ Todos Facturados → 🟢 SURTIDO COMPLETO
    └─ Algunos Facturados → 🟠 SURTIDO PARCIAL

NIVEL 2: ¿Hay Surtidos?
    └─ Algunos Surtidos (NO Facturados) → 🔵 LISTO PARA REMISIONAR

NIVEL 3: Verificar stock ACTUAL
    ├─ Todo tiene stock → 🟡 COMPLETO
    ├─ Nada tiene stock → 🔴 BAJO PEDIDO
    └─ Mix → 🟠 COMBINADO
```

### Puntos de Recalculation

El estado se recalcula automáticamente en:

| Evento | Función | Archivo |
|--------|---------|---------|
| Crear pedido | `calcularEstadoPedidoCorrect()` | `pedidosController.js:1375` |
| Almacén marca surtidos | `calcularEstadoPedidoCorrect()` | `pedidosAdminController.js:920` |
| Finanzas confirma | `calcularEstadoPedidoCorrect()` | `remisionesController.js:1352` |

---

## Ejemplo Real: Ciclo Completo

```
═══════════════════════════════════════════════════════════════

DÍA 1: 08:00 - Cliente crea pedido
─────────────────────────────────────────────────────────────
- Pedido creado: 100 unidades Producto X
- Sistema verifica stock_admin WHERE product_id = X
- Stock disponible: 0 (Cantidad=0, reservada=0)
- RESULTADO: 🔴 BAJO PEDIDO (dinámico)

ESTADO BD:
  pedidos.estatus = '🔴 BAJO PEDIDO'
  detallesdelpedido.estado_producto = NULL

═══════════════════════════════════════════════════════════════

DÍA 2: 14:00 - Proveedor entrega OC
─────────────────────────────────────────────────────────────
- OC Registrada: +150 unidades Producto X
- UPDATE stock_admin SET cantidad = 150 WHERE product_id = X
- Stock disponible: 150 (Cantidad=150, reservada=0)

DÍA 2: 14:05 - Próxima operación (p.ej. listar pedidos)
- Sistema recalcula Estado
- Verifica stock_admin: 150 >= 100 ✓
- RESULTADO: 🟡 COMPLETO (cambió automáticamente! ✨)

ESTADO BD:
  pedidos.estatus = '🟡 COMPLETO'  ← CAMBIÓ SOLO
  detallesdelpedido.estado_producto = NULL

═══════════════════════════════════════════════════════════════

DÍA 3: 09:00 - Almacén marca para surtir
─────────────────────────────────────────────────────────────
Personal de Almacén:
  1. Abre pedido en sistema
  2. Marca "Surtir" 100 unidades
  3. Sistema ejecuta:
     UPDATE detallesdelpedido
     SET estado_producto = 'Surtido', cantidadsurtida = 100

- RESULTADO: 🔵 LISTO PARA REMISIONAR

ESTADO BD:
  pedidos.estatus = '🔵 LISTO PARA REMISIONAR'
  detallesdelpedido.estado_producto = 'Surtido'
  detallesdelpedido.cantidadsurtida = 100

═══════════════════════════════════════════════════════════════

DÍA 3: 16:00 - Finanzas CONFIRMA remisión
─────────────────────────────────────────────────────────────
Personal de Finanzas:
  1. Abre remisión en sistema
  2. Verifica dados
  3. Hace click "Confirmar"
  4. Sistema ejecuta:
     UPDATE detallesdelpedido
     SET estado_producto = 'Facturado'
     WHERE remision_id = Z

- Sistema verifica: COUNT(Facturado) = 1, Total = 1
- 1 = 1 → TODOS confirmados
- RESULTADO: 🟢 SURTIDO COMPLETO ✅

ESTADO BD:
  pedidos.estatus = '🟢 SURTIDO COMPLETO'
  detallesdelpedido.estado_producto = 'Facturado'
  
PEDIDO FINALIZADO

═══════════════════════════════════════════════════════════════
```

---

## 🆚 Dinámico vs Fijo

| Estado | Tipo | Base | Cuándo Cambia | Ejemplo |
|--------|------|------|---------------|---------|
| 🔴 BAJO PEDIDO | Dinámico | stock_admin actual | Cuando llega OC | Stock 0→100 = cambio auto |
| 🟠 COMBINADO | Dinámico | stock_admin actual | Cuando stock cambia | Mix se rebalancea |
| 🟡 COMPLETO | Dinámico | stock_admin actual | Cuando stock baja | Stock 100→0 = cambio auto |
| 🔵 LISTO PARA REMISIONAR | Fijo | Acción almacén | Solo cuando marca | Requiere click almacén |
| 🟠 SURTIDO PARCIAL | Fijo | Acción finanzas | Solo cuando confirma | Requiere click finanzas |
| 🟢 SURTIDO COMPLETO | Fijo | Acción finanzas | Solo cuando confirma | Requiere click finanzas |

---

## Checklist de Validación

### Pre-requisitos
- [ ] `detallesdelpedido.varianteid` tiene valores válidos
- [ ] `stock_admin.variante_id` coincide con `detallesdelpedido.varianteid`
- [ ] No hay huérfanos (LEFT JOIN retorna 0 NULLs)

### Pruebas de Estados Dinámicos
- [ ] TEST 1: Crear pedido sin stock → 🔴 BAJO PEDIDO
- [ ] TEST 2: Llega OC → Automáticamente 🟡 COMPLETO
- [ ] TEST 3: Stock se agota → Automáticamente 🔴 BAJO PEDIDO
- [ ] TEST 4: Crear pedido con mix → 🟠 COMBINADO
- [ ] TEST 5: Stock cambia → Recalcula correctamente

### Pruebas de Estados Fijos
- [ ] TEST 6: Marcar en almacén → 🔵 LISTO PARA REMISIONAR
- [ ] TEST 7: Confirmar en finanzas (partial) → 🟠 SURTIDO PARCIAL
- [ ] TEST 8: Confirmar en finanzas (complete) → 🟢 SURTIDO COMPLETO


## Preguntas Frecuentes

**P: ¿Qué pasa si no hay stock cuando se crea el pedido pero luego llega?**  
R: El pedido cambia automáticamente de 🔴 a 🟡 en la próxima operación que recalcule.

**P: ¿Por qué `estado_producto` es NULL?**  
R: Porque es dinámico. Solo se guarda cuando hay una acción real (almacén marca o finanzas confirma).

**P: ¿Qué pasaría si elimino un archivo de documentación viejo?**  
R: No importa, este documento es la fuente única de verdad.

**P: ¿Necesito cron job?**  
R: No es obligatorio, pero es recomendable si quieres que se recalcule cada X minutos (ej: cambios en stock que nadie detecte).

**P: ¿Puedo cambiar manualmente el estado?**  
R: No se recomienda. El sistema lo calcula automáticamente. Los únicos cambios manuales son a través de almacén/finanzas.

---

## Status

- **Estado**: LISTO PARA PRODUCCIÓN
- **Última actualización**: 2026-04-04
- **Versión**: 2.0 (Sistema Dinámico)

---