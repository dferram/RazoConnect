# Sistema de Inventario - Explicación Completa

## Estructura de Inventario en RazoConnect

### 📊 Dos Niveles de Inventario

El sistema maneja inventario en **DOS tablas diferentes**:

#### 1. `producto_variantes.stock` (LEGACY - DEPRECADO)
```sql
CREATE TABLE producto_variantes (
    varianteid INTEGER PRIMARY KEY,
    sku VARCHAR(50),
    stock INTEGER DEFAULT 0,  -- ⚠️ COLUMNA LEGACY - NO USAR
    ...
);
```

**Estado:** DEPRECADO
**Uso:** Solo para Super Admins que ven inventario global
**Comentario en DB:** `'COLUMNA LEGACY - No usar. El stock real está en stock_admin segregado por administrador.'`

#### 2. `stock_admin` (ACTUAL - EN USO)
```sql
CREATE TABLE stock_admin (
    stockadminid INTEGER PRIMARY KEY,
    admin_id INTEGER NOT NULL,           -- FK a Administradores
    variante_id INTEGER NOT NULL,        -- FK a producto_variantes
    tenant_id INTEGER NOT NULL,
    cantidad INTEGER DEFAULT 0 NOT NULL, -- Stock real del admin
    updated_at TIMESTAMP,
    created_at TIMESTAMP,
    CONSTRAINT stock_admin_cantidad_check CHECK (cantidad >= 0)
);
```

**Estado:** ACTIVO
**Uso:** Inventario distribuido por administrador
**Índice único:** `(admin_id, variante_id, tenant_id)`

---

## 🔄 Cómo Funciona la Resta/Adición de Inventario

### Servicio Central: `SmartStockService.js`

Este servicio encapsula TODA la lógica de inventario según el rol del usuario:

```javascript
// LECTURA DE STOCK
const stock = await SmartStockService.getStock({
  varianteId: 123,
  userId: 5,
  userRole: 'admin',
  tenantId: 1
});

// AJUSTE DE STOCK (suma o resta)
const resultado = await SmartStockService.adjustStock({
  varianteId: 123,
  cantidad: -10,  // Negativo = resta, Positivo = suma
  userId: 5,
  userRole: 'admin',
  tenantId: 1
});
```

### Lógica por Rol de Usuario

#### 🔴 Super Admin
- **Lee:** `producto_variantes.stock` (stock global)
- **Escribe:** `producto_variantes.stock`
- **Ve:** TODO el inventario del sistema
- **Puede:** Modificar stock global

#### 🟠 Admin Regular
- **Lee:** `stock_admin WHERE admin_id = userId`
- **Escribe:** `stock_admin WHERE admin_id = userId`
- **Ve:** SOLO su propio inventario
- **Puede:** Modificar solo su stock

#### 🟡 Agente de Ventas
- **Lee:** `stock_admin WHERE admin_id = admin_responsable_id`
- **Escribe:** NO (solo lectura)
- **Ve:** Stock de su admin responsable
- **Puede:** Solo consultar

#### 🟢 Cliente
- **Lee:** `stock_admin WHERE admin_id = cliente.admin_id` O suma de todos si no tiene admin
- **Escribe:** NO (solo lectura)
- **Ve:** Stock del admin asignado o agregado
- **Puede:** Solo consultar

---

## 🛠️ Operaciones de Inventario

### 1. Recepción de Orden de Compra
```javascript
// En adminController.js - recibirInventario()
const adminIdRegistro = adminCreadorId || usuarioRecibeId || adminId;

// Se incrementa el stock del admin que CREÓ la orden
await SmartStockService.adjustStock({
  varianteId,
  cantidad: +cantidadRecibida,  // POSITIVO = incremento
  userId: adminIdRegistro,
  userRole: ['admin'],
  tenantId
});
```

**Tabla afectada:** `stock_admin WHERE admin_id = adminIdRegistro`

### 2. Venta/Pedido
```javascript
// En pedidosController.js - crearPedido()
// Se descuenta del stock del admin que atiende al cliente
await SmartStockService.adjustStock({
  varianteId,
  cantidad: -piezasVendidas,  // NEGATIVO = decremento
  userId: adminId,
  userRole: ['admin'],
  tenantId
});
```

**Tabla afectada:** `stock_admin WHERE admin_id = adminId`

### 3. Ajuste Manual de Inventario
```javascript
// En ajusteInventarioController.js
await SmartStockService.adjustStock({
  varianteId,
  cantidad: delta,  // Puede ser + o -
  userId: adminId,
  userRole: ['admin'],
  tenantId
});
```

**Tabla afectada:** `stock_admin WHERE admin_id = adminId`

### 4. Devolución
```javascript
// Se regresa al stock del admin
await SmartStockService.adjustStock({
  varianteId,
  cantidad: +piezasDevueltas,  // POSITIVO = incremento
  userId: adminId,
  userRole: ['admin'],
  tenantId
});
```

**Tabla afectada:** `stock_admin WHERE admin_id = adminId`

---

## ⚠️ PROBLEMA ACTUAL: ajustePedidosController.js

### ❌ Código INCORRECTO (Actual)
```javascript
// Línea 295 - ajustePedidosController.js
await client.query(
  `UPDATE producto_variantes SET stock = $1 WHERE varianteid = $2`,
  [nuevoStock, detalle.varianteid]
);
```

**Problemas:**
1. ❌ Modifica `producto_variantes.stock` (tabla legacy)
2. ❌ NO usa `SmartStockService`
3. ❌ NO respeta el inventario por administrador
4. ❌ Puede causar inconsistencias

### ✅ Código CORRECTO (Debe ser)
```javascript
// Usar SmartStockService
const resultado = await SmartStockService.adjustStock({
  varianteId: detalle.varianteid,
  cantidad: -diferenciaPiezas,  // Negativo porque se incrementó el pedido
  userId: req.user.userId,
  userRole: req.user.role,
  tenantId: tenant_id
});

if (!resultado.success) {
  await client.query("ROLLBACK");
  return res.status(400).json({
    success: false,
    message: `Stock insuficiente: ${resultado.message}`
  });
}
```

---

## 🔍 PROBLEMA: Stock Muestra 0 Cuando Sí Hay

### Causa Raíz
El endpoint `/admin/productos/buscar` usa `SmartStockService.getBulkStock()` que:
- Para **Admin regular**: Lee `stock_admin WHERE admin_id = userId`
- Si el admin NO tiene registro en `stock_admin` para esa variante, retorna 0

### Verificación
```sql
-- Ver stock de un admin específico
SELECT sa.cantidad, pv.stock as stock_legacy
FROM stock_admin sa
RIGHT JOIN producto_variantes pv ON pv.varianteid = sa.variante_id
WHERE sa.admin_id = 2  -- ID del admin
  AND pv.varianteid = 44;  -- ID de la variante

-- Si stock_admin.cantidad es NULL pero producto_variantes.stock > 0
-- Entonces el admin NO tiene inventario asignado
```

### Solución
El inventario debe estar en `stock_admin` para que los admins regulares lo vean.

---

## 📝 Sincronización de Stock

### Trigger Automático
```sql
CREATE TRIGGER trigger_sync_producto_variante_stock
AFTER INSERT OR UPDATE OR DELETE ON stock_admin
FOR EACH ROW
EXECUTE FUNCTION sync_producto_variante_stock();
```

**Función:**
```sql
-- Suma TODOS los stock_admin de una variante
SELECT SUM(cantidad) INTO v_total_stock
FROM stock_admin
WHERE variante_id = v_variante_id;

-- Actualiza el campo legacy
UPDATE producto_variantes
SET stock = v_total_stock
WHERE varianteid = v_variante_id;
```

**Propósito:** Mantener `producto_variantes.stock` sincronizado como suma de todos los `stock_admin.cantidad`

---

## 🎯 Resumen de Reglas

1. **NUNCA** modificar `producto_variantes.stock` directamente
2. **SIEMPRE** usar `SmartStockService.adjustStock()` para cambios
3. **SIEMPRE** usar `SmartStockService.getStock()` para lecturas
4. El trigger se encarga de sincronizar `producto_variantes.stock` automáticamente
5. Super Admins ven stock global, Admins ven solo su stock
6. El stock se asigna al admin que CREA la orden de compra, no al que la recibe

---

## 🔧 Archivos Clave

- `services/SmartStockService.js` - Servicio central de inventario
- `services/inventoryService.js` - Wrapper que usa SmartStockService
- `controllers/adminController.js` - Recepción de inventario
- `controllers/pedidosController.js` - Ventas y pedidos
- `controllers/ajustePedidosController.js` - ⚠️ NECESITA CORRECCIÓN
- `backup/backup.sql` - Líneas 5077-5086 (tabla stock_admin)
