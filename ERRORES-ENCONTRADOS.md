# 🐛 Errores Encontrados en Nombres de Tablas y Columnas

## ❌ Errores Identificados

### 1. **Tabla de Direcciones**
- **Usado en código:** `Direcciones_Envio`
- **Nombre real en BD:** `Cliente_Direcciones`
- **Archivos afectados:** `adminController.js`

### 2. **Tabla de Detalles de Pedido**
- **Usado en código:** `Detalle_Pedidos`
- **Nombre real en BD:** `DetallesDelPedido`
- **Archivos afectados:** `adminController.js`

### 3. **Tabla de Comisiones**
- **Usado en código:** `Comisiones_Agentes`
- **Nombre real en BD:** `Comisiones`
- **Archivos afectados:** `adminController.js`

### 4. **Columnas de Comisiones**
- **FechaGeneracion** (usado) → **FechaCalculo** (real)
- **FechaPago** → **NO EXISTE** en la tabla real
- **Archivos afectados:** `adminController.js`

### 5. **Tabla de Agentes (YA CORREGIDO)**
- **Usado:** `Agentes`
- **Real:** `AgentesDeVentas`

### 6. **Columna Password en Agentes (YA CORREGIDO)**
- **Usado:** `Password`
- **Real:** `PasswordHash`

### 7. **Columna Nombre en Productos (YA CORREGIDO)**
- **Usado:** `Nombre`
- **Real:** `NombreProducto`

---

## ✅ TODAS LAS CORRECCIONES COMPLETADAS

- [x] Reemplazar `Direcciones_Envio` por `Cliente_Direcciones` ✅
- [x] Reemplazar `Detalle_Pedidos` por `DetallesDelPedido` ✅
- [x] Reemplazar `Comisiones_Agentes` por `Comisiones` ✅
- [x] Reemplazar `FechaGeneracion` por `FechaCalculo` ✅
- [x] Eliminar referencias a `FechaPago` (no existe) ✅
- [x] Verificar que todos los controladores usen nombres correctos ✅

## 📝 Funciones Corregidas en adminController.js

1. ✅ **getDashboardStats** - Tabla Comisiones
2. ✅ **getAllPedidos** - Tablas: Cliente_Direcciones, DetallesDelPedido, AgentesDeVentas
3. ✅ **getAllAgentes** - Tabla Comisiones
4. ✅ **getAgenteDetalle** - Tabla Comisiones, columna FechaCalculo
5. ✅ **getAllComisiones** - Tabla Comisiones, AgentesDeVentas, columna FechaCalculo
6. ✅ **pagarComision** - Tabla Comisiones, eliminada columna FechaPago
7. ✅ **getPedidoDetalle** - Tablas: AgentesDeVentas, Cliente_Direcciones, DetallesDelPedido

## ⚠️ Nota sobre FechaPago

La columna `FechaPago` NO existe en la tabla `Comisiones`. 
El estatus se marca como 'Pagada' pero no se registra una fecha específica.
Si necesitas registrar la fecha de pago, deberías:
1. Agregar la columna a la tabla: `ALTER TABLE Comisiones ADD COLUMN FechaPago TIMESTAMP;`
2. Actualizar el código para incluirla

---

## 📊 Estructura Real de Tablas Principales

### Cliente_Direcciones
```sql
DireccionID, ClienteID, Etiqueta, Receptor, Calle, NumeroExterior, 
NumeroInterior, Colonia, Ciudad, Estado, CodigoPostal, Referencias, 
TelefonoContacto
```

### DetallesDelPedido
```sql
DetalleID, PedidoID, ProductoID, CantidadPaquetes, 
PrecioPorPaquete, PiezasTotales
```

### Comisiones
```sql
ComisionID, PedidoID, AgenteID, MontoComision, 
FechaCalculo, Estatus
```
