# Sistema de Ajuste de Pedidos

## Descripción General

Sistema completo que permite al almacenista modificar pedidos confirmados, agregando o quitando productos mientras mantiene la integridad del inventario y los totales financieros.

## Características Principales

### ✅ Funcionalidades Implementadas

1. **Modificación de Productos Existentes**
   - Cambiar cantidades de productos en el pedido
   - Eliminar productos del pedido
   - Restaurar productos marcados para eliminar

2. **Agregar Nuevos Productos**
   - Búsqueda en tiempo real por SKU o nombre
   - Selección de variantes y presentaciones
   - Validación de stock disponible

3. **Sincronización Automática de Inventario**
   - Devolución de stock al eliminar productos
   - Descuento de stock al agregar productos
   - Registro completo en `log_inventario`

4. **Recálculo de Totales**
   - Actualización automática de `montototal`
   - Ajuste de `monto_backorder`
   - Preservación de `monto_surtido` (remisiones ya generadas)

5. **Auditoría Completa**
   - Registro en tabla `historial_pedidos`
   - Detalles JSON de todos los cambios
   - Tracking de montos anterior y nuevo

6. **Validaciones de Seguridad**
   - Advertencia para pedidos pagados por transferencia
   - Validación de stock antes de agregar/modificar
   - Transacciones atómicas (todo o nada)

---

## Arquitectura del Sistema

### Backend

#### Controlador: `ajustePedidosController.js`

**Endpoint:** `PUT /api/admin/pedidos/:id/ajustar`

**Autenticación:** Requiere token de admin (`authenticate` + `authorizeAdmin`)

**Payload:**
```json
{
  "itemsEliminar": [123, 456],
  "itemsModificar": [
    { "detalleId": 789, "cantidad": 5 }
  ],
  "itemsAgregar": [
    {
      "varianteId": 101,
      "tamanoId": 202,
      "cantidad": 3
    }
  ]
}
```

**Respuesta Exitosa:**
```json
{
  "success": true,
  "message": "Pedido #123 ajustado exitosamente",
  "data": {
    "pedido": { /* objeto pedido actualizado */ },
    "cambios": [
      {
        "tipo": "ELIMINADO",
        "producto": "Caja Decorativa",
        "sku": "CAJ-001",
        "cantidad": 2,
        "piezasDevueltas": 20,
        "subtotal": 150.00
      }
    ],
    "montoAnterior": 1500.00,
    "montoNuevo": 1350.00,
    "diferencia": -150.00
  }
}
```

#### Lógica de Transacción

```javascript
BEGIN TRANSACTION

1. Validar pedido existe y pertenece al tenant
2. Verificar si está pagado (advertencia)

// ELIMINAR PRODUCTOS
3. Para cada item a eliminar:
   - Obtener detalles del producto
   - Si NO es backorder:
     * Devolver stock a producto_variantes
     * Registrar en log_inventario (DEVOLUCION_AJUSTE)
   - Eliminar de detallesdelpedido
   - Restar subtotal del monto total

// MODIFICAR CANTIDADES
4. Para cada item a modificar:
   - Calcular diferencia de cantidad
   - Si incrementa:
     * Validar stock disponible
     * Descontar stock
     * Registrar en log_inventario (DESCUENTO_AJUSTE)
   - Si reduce:
     * Devolver stock
     * Registrar en log_inventario (DEVOLUCION_AJUSTE)
   - Actualizar detallesdelpedido
   - Ajustar subtotal

// AGREGAR PRODUCTOS
5. Para cada producto nuevo:
   - Validar stock disponible
   - Calcular precio (con ofertas si aplica)
   - Descontar stock
   - Registrar en log_inventario (DESCUENTO_AJUSTE)
   - Insertar en detallesdelpedido
   - Sumar subtotal al monto total

6. Actualizar pedidos:
   - montototal = nuevo total calculado
   - monto_backorder = montototal - monto_surtido

7. Registrar en historial_pedidos:
   - Acción: AJUSTE_MANUAL
   - Detalles JSON con todos los cambios
   - Montos anterior y nuevo

COMMIT TRANSACTION
```

---

### Frontend

#### Archivos Modificados/Creados

1. **`admin-pedidos.html`**
   - Botón "Ajustar Pedido" en tabla de pedidos
   - Modal completo con tres secciones:
     * Productos actuales (editar/eliminar)
     * Agregar productos (búsqueda + selección)
     * Resumen de cambios

2. **`js/admin-ajuste-pedidos.js`** (NUEVO)
   - Gestión del modal de ajuste
   - Búsqueda de productos en tiempo real
   - Renderizado dinámico de tablas
   - Aplicación de cambios vía API

3. **`routes/admin.js`**
   - Registro de ruta `PUT /admin/pedidos/:id/ajustar`

#### Flujo de Usuario

```
1. Admin abre "Gestión de Pedidos"
2. Click en "✏️ Ajustar Pedido"
3. Modal muestra productos actuales del pedido

OPCIÓN A: Modificar/Eliminar
- Cambiar cantidad en input numérico
- Click "🗑️ Eliminar" para marcar eliminación
- Click "↩️ Restaurar" para deshacer

OPCIÓN B: Agregar Productos
- Escribir en buscador (SKU o nombre)
- Resultados en tiempo real
- Click "+ Agregar" en producto deseado
- Ajustar cantidad en tabla de seleccionados

4. Revisar "Resumen de Cambios"
5. Click "Aplicar Ajustes"
6. Confirmación con SweetAlert2
7. Éxito: Modal se cierra, tabla se recarga
```

---

### Base de Datos

#### Tabla: `historial_pedidos`

```sql
CREATE TABLE public.historial_pedidos (
    historial_id SERIAL PRIMARY KEY,
    pedido_id INTEGER NOT NULL,
    accion VARCHAR(50) NOT NULL,
    detalles JSONB,
    monto_anterior NUMERIC(10,2),
    monto_nuevo NUMERIC(10,2),
    usuario_id INTEGER,
    fecha_cambio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    tenant_id INTEGER DEFAULT 1,
    CONSTRAINT fk_historial_pedido FOREIGN KEY (pedido_id) 
        REFERENCES pedidos(pedidoid) ON DELETE CASCADE,
    CONSTRAINT fk_historial_usuario FOREIGN KEY (usuario_id) 
        REFERENCES administradores(adminid) ON DELETE SET NULL
);
```

**Índices:**
- `idx_historial_pedidos_pedido_id` (pedido_id)
- `idx_historial_pedidos_fecha` (fecha_cambio DESC)
- `idx_historial_pedidos_tenant` (tenant_id)

**Ejemplo de registro:**
```json
{
  "historial_id": 1,
  "pedido_id": 123,
  "accion": "AJUSTE_MANUAL",
  "detalles": [
    {
      "tipo": "ELIMINADO",
      "producto": "Caja Premium",
      "sku": "CAJ-001",
      "cantidad": 2,
      "piezasDevueltas": 20,
      "subtotal": 150.00
    },
    {
      "tipo": "AGREGADO",
      "producto": "Caja Básica",
      "sku": "CAJ-002",
      "cantidad": 5,
      "piezasDescontadas": 50,
      "subtotal": 200.00
    }
  ],
  "monto_anterior": 1500.00,
  "monto_nuevo": 1550.00,
  "usuario_id": 1,
  "fecha_cambio": "2026-01-21 11:30:00",
  "tenant_id": 1
}
```

---

## Validaciones y Seguridad

### 1. Validación de Stock
```javascript
if (stockActual < piezasNecesarias) {
  return res.status(400).json({
    success: false,
    message: `Stock insuficiente para ${nombreProducto}. 
              Disponible: ${stockActual} piezas, 
              necesitas: ${piezasNecesarias}`
  });
}
```

### 2. Advertencia de Pedidos Pagados
```javascript
if (pedido.pagado && pedido.metodo_pago === 'transferencia') {
  return res.status(400).json({
    success: false,
    message: "⚠️ Este pedido ya fue pagado. Los ajustes generarán 
              un saldo a favor o requerirán pago adicional.",
    requiereConfirmacion: true
  });
}
```

### 3. Transacciones Atómicas
- Todo dentro de `BEGIN` / `COMMIT`
- Si cualquier operación falla: `ROLLBACK` automático
- Uso de `FOR UPDATE` para bloquear registros

### 4. Aislamiento por Tenant
- Todas las queries incluyen `WHERE tenant_id = $X`
- Validación de pertenencia de pedido al tenant

---

## Casos de Uso

### Caso 1: Cliente Solicita Cambio de Último Minuto

**Escenario:** Cliente pidió 10 cajas grandes, pero necesita 5 grandes + 10 medianas.

**Proceso:**
1. Almacenista abre el pedido
2. Modifica cantidad de cajas grandes: 10 → 5
3. Busca "cajas medianas" y agrega 10 unidades
4. Sistema valida stock disponible
5. Aplica cambios:
   - Devuelve 5 cajas grandes al inventario
   - Descuenta 10 cajas medianas del inventario
   - Recalcula total del pedido
6. Genera remisión con productos correctos

### Caso 2: Producto Descontinuado

**Escenario:** Un producto en el pedido ya no está disponible.

**Proceso:**
1. Almacenista elimina el producto descontinuado
2. Busca producto sustituto
3. Agrega producto sustituto con cantidad equivalente
4. Sistema ajusta totales automáticamente
5. Auditoría registra el cambio

### Caso 3: Error en Cantidad

**Escenario:** Cliente pidió 100 piezas pero quería 10 paquetes.

**Proceso:**
1. Almacenista modifica cantidad: 100 → 10
2. Sistema devuelve 90 paquetes al stock
3. Total del pedido se reduce proporcionalmente
4. Log de inventario registra la devolución

---

## Integración con Sistema de Remisiones

### Flujo Completo

```
PEDIDO CREADO
├─ montototal = $1,000
├─ monto_surtido = $0
└─ monto_backorder = $1,000

AJUSTE APLICADO (agregar $200)
├─ montototal = $1,200
├─ monto_surtido = $0 (sin cambios)
└─ monto_backorder = $1,200

REMISIÓN GENERADA ($800)
├─ montototal = $1,200 (sin cambios)
├─ monto_surtido = $800
└─ monto_backorder = $400

SEGUNDO AJUSTE (eliminar $100)
├─ montototal = $1,100
├─ monto_surtido = $800 (sin cambios)
└─ monto_backorder = $300

REMISIÓN FINAL ($300)
├─ montototal = $1,100 (sin cambios)
├─ monto_surtido = $1,100
└─ monto_backorder = $0
```

**Regla Crítica:** `monto_surtido` NUNCA se modifica en ajustes, solo en generación de remisiones.

---

## Mantenimiento y Troubleshooting

### Logs de Inventario

Todos los movimientos se registran en `log_inventario`:

```sql
SELECT 
  li.*,
  pv.sku,
  p.nombreproducto
FROM log_inventario li
INNER JOIN producto_variantes pv ON pv.varianteid = li.varianteid
INNER JOIN productos p ON p.productoid = pv.productoid
WHERE li.referencia LIKE 'AJUSTE-PED-%'
ORDER BY li.fecha_movimiento DESC;
```

### Auditoría de Cambios

Consultar historial de un pedido:

```sql
SELECT 
  hp.*,
  a.nombre AS admin_nombre
FROM historial_pedidos hp
LEFT JOIN administradores a ON a.adminid = hp.usuario_id
WHERE hp.pedido_id = 123
ORDER BY hp.fecha_cambio DESC;
```

### Validar Integridad

Verificar que `monto_surtido + monto_backorder = montototal`:

```sql
SELECT 
  pedidoid,
  montototal,
  monto_surtido,
  monto_backorder,
  (monto_surtido + monto_backorder) AS suma_calculada,
  CASE 
    WHEN ABS(montototal - (monto_surtido + monto_backorder)) > 0.01 
    THEN '❌ INCONSISTENTE'
    ELSE '✅ OK'
  END AS estado
FROM pedidos
WHERE es_credito = true;
```

---

## Consideraciones Importantes

### ⚠️ Pedidos con Remisiones Parciales

Si un pedido ya tiene remisiones generadas:
- `monto_surtido` > 0
- Los ajustes solo afectan `monto_backorder`
- El sistema NO modifica productos ya remisionados

### 💳 Pedidos a Crédito

- El ajuste NO afecta `cliente_creditos.saldo_deudor`
- El cargo se aplica cuando se genera la remisión
- `monto_backorder` refleja el saldo pendiente de remisionar

### 🔒 Seguridad

- Solo usuarios con rol `admin` pueden ajustar pedidos
- Todas las acciones quedan registradas con usuario_id
- Transacciones atómicas previenen inconsistencias

---

## Próximas Mejoras (Futuro)

1. **Notificación al Cliente**
   - Email automático cuando se ajusta su pedido
   - Detalle de cambios y nuevo total

2. **Aprobación de Cambios**
   - Workflow de aprobación para ajustes grandes
   - Límite de monto sin aprobación

3. **Reportes de Ajustes**
   - Dashboard con estadísticas de ajustes
   - Productos más modificados
   - Tendencias de cambios

4. **Integración con CXC**
   - Ajuste automático de cuentas por cobrar
   - Generación de notas de crédito/débito

---

## Migración

Para aplicar el sistema en producción:

```bash
# 1. Ejecutar migración de base de datos
psql -U usuario -d razoconnect -f migrations/create_historial_pedidos.sql

# 2. Verificar tabla creada
psql -U usuario -d razoconnect -c "\d historial_pedidos"

# 3. Reiniciar servidor Node.js
pm2 restart razoconnect-api

# 4. Verificar endpoint
curl -X PUT https://api.razoconnect.com/api/admin/pedidos/123/ajustar \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"itemsEliminar":[],"itemsModificar":[],"itemsAgregar":[]}'
```

---

## Soporte

Para dudas o problemas:
- Revisar logs en `log_inventario` y `historial_pedidos`
- Verificar integridad de montos con query de validación
- Contactar al equipo de desarrollo con el `pedido_id` afectado
