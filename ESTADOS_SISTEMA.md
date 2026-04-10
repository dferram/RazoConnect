# 📋 ESTRUCTURA DE ESTADOS DEL SISTEMA - RazoConnect

## ⚡ ESTADOS DE PEDIDOS

### 🔄 DINÁMICOS (Auto-recalculables)
Estos estados cambian automáticamente cuando hay cambios en stock o productos

- **Bajo pedido** - Al menos un producto está en backorder
- **Combinado** - Mezcla de productos: algunos en stock, otros en backorder
- **Completo** - Todos los productos tienen stock disponible

### 📌 SEMIFIJO
Fijado por inventarios, pero puede regresar a estado dinámico cuando finanzas actúa

- **Listo para remisionar** 
  - Inventarios confirma que los productos están preparados
  - IMPORTANTE: Después de que finanzas confirma, regresa a estados dinámicos
  - NO es final, puede cambiar

### 🔴 FINAL (Inmutable)
Una vez alcanzado, no puede cambiar

- **Surtido completo** - Pedido completamente facturado y no puede regresar a otro estado

---

## 📦 ESTADOS DE PRODUCTOS (detallesdelpedido.estado_producto)

### 🔄 DINÁMICO (Auto-recalculable)
Cambia automáticamente según disponibilidad de stock

- **Bajo pedido** - Stock insuficiente para la cantidad solicitada
- **Con stock** - Stock disponible (cantidad >= piezastotales)

### 📌 SEMIFIJO
Confirmado manualmente por inventarios, pero puede cambiar después de finanzas

- **Surtido** 
  - Inventarios confirma que el producto fue preparado/surtido
  - IMPORTANTE: Es semifijo, puede regresar a dinámicos si finanzas deshace la acción

### 🔴 FINAL (Inmutable)
Confirmado por finanzas, nunca cambia

- **Facturado** - Finanzas confirmó la venta, producto facturado

---

## 💰 REGLA CRÍTICA: GENERACIÓN DE CXC

**CXC se genera SOLO cuando finanzas confirma (estado = "Facturado"), NO antes**

### Flujo Correcto:
```
1. Producto en "Con stock" o "Surtido"
   → Sin CXC aún

2. Finanzas confirma → Producto cambia a "Facturado"
   → ✅ GENERAR CXC por ese producto

3. IMPORTANTE: Puede haber MÚLTIPLES CXC por el mismo pedido
   Si un pedido tiene 3 productos:
   - Producto 1 → Facturado (CXC generado)
   - Producto 2 → Facturado (CXC generado)
   - Producto 3 → Surtido (Sin CXC - esperando finanzas)
   
   Resultado: 2 CXCs por 1 pedido, una por cada producto que finanzas confirmó
```

---

## 🔗 REFERENCIA RÁPIDA: TRANSICIONES DE ESTADO

### Pedido
```
Tríada Dinámica ←→ Listo para remisionar ←→ Surtido completo
│
├─ Bajo pedido → (stock disponible) → Combinado → (falta stock) → Bajo pedido
├─ Combinado → (todo stock) → Completo
└─ Completo → (falta stock) → Combinado
                               ↓
                    (inventarios confirma)
                    Listo para remisionar
                               ↓
                    (finanzas confirma)
                    Regresa a Dinámicos
                    (o Surtido completo si está 100% facturado)
```

### Producto
```
Dinámico: Bajo pedido ←→ Con stock
              ↓
    (inventarios confirma)
              ↓
           Surtido
              ↓
    (finanzas confirma)
              ↓
         Facturado (FINAL)
```

---

## ✅ VALIDACIÓN DE CÓDIGO

Todo el código debe:

1. **estatusValidos para PEDIDOS:**
   ```javascript
   'Bajo pedido', 'Combinado', 'Completo', 
   'Listo para remisionar', 'Surtido completo'
   ```

2. **estatusValidos para PRODUCTOS:**
   ```javascript
   'Bajo pedido', 'Con stock', 'Surtido', 'Facturado'
   ```

3. **CXC se genera cuando:**
   - `estado_producto = 'Facturado'` (confirmado por finanzas)
   - NO cuando es 'Surtido' (confirmado por inventarios)
   - NO cuando es 'Bajo pedido' o 'Con stock' (sin confirmar)

4. **Cambios automáticos:**
   - Triggers en `stock_admin` recalculan `detallesdelpedido.estado_producto`
   - Triggers en `detallesdelpedido` recalculan `pedidos.estatus`
   - Cambios manuales por inventarios/finanzas van en tablas separadas

---

## 📍 Ubicaciones en Código

- **Controllers:** `/controllers/pedidosStatusController.js` (valida estatusValidos)
- **Services:** `/services/pedidoEstadoSincronizadorService.js` (lógica de recalc)
- **Migrations:** `/migrations/011-015_*.sql` (triggers y funciones)

---

**ÚLTIMA ACTUALIZACIÓN:** 2026-04-10
**RESPONSABLE DE MANTENER:** Fernando Ramírez
