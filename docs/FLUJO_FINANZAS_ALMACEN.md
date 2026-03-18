# Flujo de Confirmación Finance-Warehouse

## Descripción General

Este documento describe el flujo de trabajo implementado para la confirmación de pedidos entre el departamento de Finanzas y el Almacén (Warehouse/Inventarios). Este flujo asegura que los movimientos de inventario y las cuentas por cobrar (CxC) solo se afecten después de la confirmación final de Finanzas.

## Fecha de Implementación
**Marzo 2026**

## Objetivos

1. **Separación de responsabilidades**: El almacén prepara/surte pedidos, Finanzas confirma y autoriza el impacto financiero
2. **Control de inventario**: El stock solo se descuenta cuando Finanzas confirma
3. **Control de CxC**: Las cuentas por cobrar solo se generan tras confirmación de Finanzas
4. **Ciclo de corrección**: Finanzas puede rechazar y regresar pedidos al almacén para corrección
5. **Prevención de errores**: No se permite facturación hasta confirmación completa

## Estados del Pedido/Remisión

### Estados de Pedidos

| Estado | Descripción | Quién lo establece | Siguiente acción |
|--------|-------------|-------------------|------------------|
| `Pendiente` | Pedido creado, esperando procesamiento | Sistema | Almacén marca como listo |
| `Confirmado` | Pedido confirmado por admin/agente | Admin/Agente | Almacén marca como listo |
| `Pendiente de confirmación` | Almacén terminó de surtir, esperando Finanzas | Almacén | Finanzas confirma/rechaza |
| `Revisión de almacén` | Rechazado por Finanzas, necesita corrección | Finanzas | Almacén corrige y reenvía |
| `Surtido` | Confirmado por Finanzas, stock descontado, CxC generado | Finanzas | Puede facturarse |
| `Completado` | Pedido completamente surtido | Sistema | Finalizado |

### Estados de Remisiones

| Estado | Descripción | Quién lo establece | Siguiente acción |
|--------|-------------|-------------------|------------------|
| `BORRADOR` | Remisión creada pero no emitida | Sistema | Emitir |
| `PENDIENTE_REVISION` | Remisión emitida, esperando verificación de almacén | Sistema | Almacén confirma |
| `PENDIENTE_CONFIRMACION_FINANZAS` | Almacén verificó, esperando confirmación de Finanzas | Almacén | Finanzas confirma/rechaza |
| `REVISION_ALMACEN` | Rechazada por Finanzas, necesita corrección | Finanzas | Almacén corrige |
| `SURTIDO` | Confirmada por Finanzas, stock descontado, CxC generado | Finanzas | Puede facturarse |
| `CANCELADA` | Remisión cancelada | Admin/Finanzas | Finalizado |

## Flujo de Trabajo Detallado

### Paso 1: Almacén Marca Pedido como Listo

**Endpoint**: `POST /api/admin/pedidos/:id/surtir`

**Roles permitidos**: `inventarios`, `gerente_operaciones`, `jefe_almacen`, `admin`, `super_admin`

**Acción**:
1. Almacén termina de preparar/surtir el pedido
2. Hace clic en botón "✅ Marcar Listo"
3. Sistema cambia estado a `Pendiente de confirmación`
4. **IMPORTANTE**: NO se afecta inventario ni CxC en este punto

**Validaciones**:
- Pedido debe estar en estado `Pendiente` o `Confirmado`
- Usuario debe tener rol de almacén

**Respuesta**:
```json
{
  "success": true,
  "message": "Pedido enviado a finanzas para confirmación. X producto(s) listo(s), Y en backorder. Stock NO afectado hasta confirmación de finanzas.",
  "data": {
    "pedidoId": 123,
    "estatus": "Pendiente de confirmación",
    "completamente_surtido": false,
    "productosSurtidos": 5,
    "productosBackorder": 2
  }
}
```

### Paso 2A: Finanzas Confirma el Pedido

**Endpoint**: `POST /api/admin/pedidos/:id/confirmar-surtido`

**Roles permitidos**: `finanzas`, `gerente_finanzas`, `secretaria`, `admin`, `super_admin`

**Acción**:
1. Finanzas revisa el pedido marcado como "Pendiente de confirmación"
2. Hace clic en botón "✅ Confirmar Surtido"
3. Sistema confirma con advertencia: "Esta acción reducirá el inventario, generará CxC (si aplica), marcará el pedido como Surtido y NO se puede deshacer"
4. Al confirmar:
   - **Descuenta stock** de `stock_admin` para cada item surtido
   - **Genera movimientos en Kardex** (tipo SALIDA)
   - **Genera CxC** si el pedido es a crédito
   - Cambia estado a `Surtido`
   - Registra en historial

**Validaciones**:
- Pedido debe estar en estado `Pendiente de confirmación`
- Debe haber productos con stock disponible
- Si falla descuento de stock, se hace ROLLBACK completo

**Respuesta exitosa**:
```json
{
  "success": true,
  "message": "Pedido confirmado. Inventario reducido y CxC generado.",
  "data": {
    "pedidoId": 123,
    "estatus": "Surtido",
    "productosConfirmados": 5
  }
}
```

**Respuesta con error de stock**:
```json
{
  "success": false,
  "message": "Error al reducir inventario. No se pudo confirmar el pedido.",
  "errors": [
    {
      "sku": "SKU-123",
      "variante_id": 456,
      "error": "Stock insuficiente"
    }
  ]
}
```

### Paso 2B: Finanzas Rechaza el Pedido

**Endpoint**: `POST /api/admin/pedidos/:id/rechazar-finanzas`

**Roles permitidos**: `finanzas`, `gerente_finanzas`, `admin`, `super_admin` (NO secretaria)

**Acción**:
1. Finanzas detecta un error en el pedido
2. Hace clic en botón "↩️ Regresar a Almacén"
3. Sistema solicita observaciones obligatorias
4. Al confirmar:
   - Cambia estado a `Revisión de almacén`
   - Guarda observaciones de finanzas
   - **NO afecta stock ni CxC**
   - Notifica al almacén

**Request Body**:
```json
{
  "observaciones_finanzas": "Revisar cantidades del producto SKU-123, falta verificar stock del item X"
}
```

**Validaciones**:
- Pedido debe estar en estado `Pendiente de confirmación`
- Observaciones son obligatorias

**Respuesta**:
```json
{
  "success": true,
  "message": "Pedido regresado al almacén para corrección",
  "data": {
    "pedidoId": 123,
    "estatus": "Revisión de almacén",
    "observaciones_finanzas": "Revisar cantidades..."
  }
}
```

### Paso 3: Almacén Corrige y Reenvía

**Endpoint**: `POST /api/admin/pedidos/:id/surtir` (mismo endpoint)

**Acción**:
1. Almacén ve el pedido en estado `Revisión de almacén`
2. Lee las observaciones de Finanzas
3. Corrige el pedido según indicaciones
4. Hace clic en botón "⚠️ Corregir y Reenviar"
5. Sistema cambia estado nuevamente a `Pendiente de confirmación`
6. Finanzas puede revisar nuevamente

**Nota**: El ciclo puede repetirse hasta que Finanzas confirme

## Flujo de Remisiones (Similar)

### Confirmación de Almacén

**Endpoint**: `POST /api/remisiones/:id/confirmar-almacen`

**Roles permitidos**: `inventarios`, `admin`, `super_admin`

**Estados aceptados**: `PENDIENTE_REVISION`, `REVISION_ALMACEN`

**Acción**:
- Cambia estado a `PENDIENTE_CONFIRMACION_FINANZAS`
- Si viene de `REVISION_ALMACEN`, incluye observaciones previas de finanzas en notas
- Limpia campo `observaciones_finanzas` para nuevo ciclo

### Confirmación de Finanzas

**Endpoint**: `POST /api/remisiones/:id/confirmar-finanzas`

**Roles permitidos**: `finanzas`, `admin`, `super_admin`

**Estado requerido**: `PENDIENTE_CONFIRMACION_FINANZAS`

**Acción**:
1. Obtiene todos los items de la remisión
2. Para cada item surtido:
   - Descuenta stock de `stock_admin`
   - Registra en `inventario_reservas_log`
   - Registra movimiento en Kardex (SALIDA)
3. Si hay errores críticos (stock no encontrado), hace ROLLBACK
4. Genera CxC si es pedido a crédito
5. Cambia estado a `SURTIDO`

**Validación de errores**:
```javascript
// Si algún item no tiene stock o falla Kardex
if (itemsConError.length > 0) {
  await client.query('ROLLBACK');
  return res.status(500).json({
    success: false,
    message: 'Error al descontar stock. No se pudo confirmar la remisión.',
    errors: itemsConError
  });
}
```

### Rechazo de Finanzas

**Endpoint**: `POST /api/remisiones/:id/rechazar-finanzas`

**Roles permitidos**: `finanzas`, `admin`, `super_admin`

**Estado requerido**: `PENDIENTE_CONFIRMACION_FINANZAS`

**Request Body**:
```json
{
  "observaciones_finanzas": "Descripción del problema"
}
```

**Acción**:
- Cambia estado a `REVISION_ALMACEN`
- Guarda observaciones
- NO afecta stock ni CxC

## Facturación

### Validación de Facturación

**Endpoint**: `GET /api/facturas/:id/descargar`

**Validaciones agregadas**:

1. **Verificar remisiones confirmadas**:
```sql
SELECT COUNT(*) as total_surtido
FROM remisiones
WHERE pedido_id = $1 AND tenant_id = $2 AND estado = 'SURTIDO'
```

2. **Validar que existe al menos una remisión SURTIDO**:
```javascript
if (totalSurtido === 0) {
  return res.status(400).json({
    success: false,
    message: 'No se puede generar factura. El pedido debe tener al menos una remisión confirmada por finanzas (estado SURTIDO).'
  });
}
```

3. **Validar estado del pedido**:
- Estados permitidos: `Surtido`, `Completado`, `Enviado`, `Entregado`, `Parcial`

**Prevención del bug "Procesando"**:
- La factura solo se genera si hay confirmación de Finanzas
- Esto previene que la factura quede en estado "Procesando" indefinidamente

## Frontend - Visibilidad de Botones

### Botón "Surtir Pedido" (Almacén)

**Roles con acceso**: `inventarios`, `gerente_operaciones`, `jefe_almacen`, `admin`, `super_admin`

**Estados y apariencia**:

| Estado del Pedido | Texto del Botón | Color | Habilitado | Acción |
|-------------------|----------------|-------|------------|--------|
| `Pendiente` o `Confirmado` | ✅ Marcar Listo | Verde (#16a34a) | Sí | Enviar a Finanzas |
| `Pendiente de confirmación` | ⏳ Esperando Finanzas | Gris (#6c757d) | No | - |
| `Revisión de almacén` | ⚠️ Corregir y Reenviar | Naranja (#f59e0b) | Sí | Corregir y reenviar |
| `Surtido` | ✅ Pedido Surtido | Verde (#10b981) | No | - |

### Botón "Confirmar Surtido" (Finanzas)

**Roles con acceso**: `finanzas`, `gerente_finanzas`, `secretaria`, `admin`, `super_admin`

**Estados y apariencia**:

| Estado del Pedido | Texto del Botón | Color | Habilitado | Acción |
|-------------------|----------------|-------|------------|--------|
| `Pendiente de confirmación` | ✅ Confirmar Surtido | Azul (#0d6efd) | Sí | Confirmar y descontar stock |
| `Surtido` | ✅ Confirmado | Verde (#10b981) | No | - |
| Otros estados | (oculto) | - | - | - |

### Botón "Regresar a Almacén" (Finanzas)

**Roles con acceso**: `finanzas`, `gerente_finanzas`, `admin`, `super_admin` (NO secretaria)

**Estados y apariencia**:

| Estado del Pedido | Texto del Botón | Color | Habilitado | Acción |
|-------------------|----------------|-------|------------|--------|
| `Pendiente de confirmación` | ↩️ Regresar a Almacén | Naranja (#f59e0b) | Sí | Rechazar con observaciones |
| Otros estados | (oculto) | - | - | - |

## Casos de Uso

### Caso 1: Flujo Normal (Sin Rechazos)

1. Cliente hace pedido → Estado: `Pendiente`
2. Almacén surte productos → Clic en "Marcar Listo" → Estado: `Pendiente de confirmación`
3. Finanzas revisa → Clic en "Confirmar Surtido" → Estado: `Surtido`
   - Stock descontado ✓
   - CxC generado ✓
4. Admin genera factura → Factura generada exitosamente ✓

### Caso 2: Flujo con Rechazo y Corrección

1. Cliente hace pedido → Estado: `Pendiente`
2. Almacén surte productos → Clic en "Marcar Listo" → Estado: `Pendiente de confirmación`
3. Finanzas detecta error → Clic en "Regresar a Almacén" → Estado: `Revisión de almacén`
   - Observaciones: "Revisar cantidad de SKU-123"
4. Almacén ve observaciones → Corrige pedido → Clic en "Corregir y Reenviar" → Estado: `Pendiente de confirmación`
5. Finanzas revisa nuevamente → Clic en "Confirmar Surtido" → Estado: `Surtido`
   - Stock descontado ✓
   - CxC generado ✓
6. Admin genera factura → Factura generada exitosamente ✓

### Caso 3: Error en Descuento de Stock

1. Almacén marca como listo → Estado: `Pendiente de confirmación`
2. Finanzas intenta confirmar → Error: Stock no encontrado para variante X
3. Sistema hace ROLLBACK automático
4. Finanzas recibe error con detalles
5. Finanzas rechaza pedido con observaciones
6. Almacén corrige problema de stock
7. Ciclo se repite hasta éxito

## Auditoría y Trazabilidad

### Tablas Afectadas

1. **`pedidos`**:
   - `estatus`: Estado actual del pedido
   - `observaciones_finanzas`: Observaciones cuando se rechaza
   - `rechazado_por_finanzas`: ID del usuario que rechazó
   - `fecha_rechazo_finanzas`: Timestamp del rechazo

2. **`remisiones`**:
   - `estado`: Estado actual de la remisión
   - `observaciones_finanzas`: Observaciones de rechazo
   - `confirmado_por_almacen`: ID del usuario de almacén
   - `confirmado_por_finanzas`: ID del usuario de finanzas
   - `fecha_confirmacion_almacen`: Timestamp confirmación almacén
   - `fecha_emision_final`: Timestamp confirmación finanzas

3. **`historial_remisiones`**:
   - Registra todas las acciones: `CONFIRMACION_ALMACEN`, `CONFIRMACION_FINANZAS`, `RECHAZO_FINANZAS`

4. **`inventario_reservas_log`**:
   - Acción: `CONFIRMAR_FINANZAS`
   - Registra descuento de stock con usuario y timestamp

5. **`Kardex`**:
   - Tipo: `SALIDA`
   - Motivo: `VENTA`
   - Referencia: `REMISION`
   - Observaciones incluyen confirmación de finanzas

## Seguridad y Permisos

### Matriz de Permisos

| Acción | inventarios | finanzas | gerente_finanzas | secretaria | admin | super_admin |
|--------|-------------|----------|------------------|------------|-------|-------------|
| Marcar pedido listo | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ |
| Confirmar surtido | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Rechazar pedido | ✗ | ✓ | ✓ | ✗ | ✓ | ✓ |
| Corregir y reenviar | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ |
| Generar factura | ✗ | ✓ | ✓ | ✗ | ✓ | ✓ |

### Validaciones de Seguridad

1. **Backend valida roles** en cada endpoint usando middleware `authorizeRole`
2. **Frontend oculta botones** según rol del usuario
3. **Estados validados** antes de permitir transiciones
4. **Transacciones atómicas** con ROLLBACK en caso de error
5. **Logs de auditoría** para todas las acciones críticas

## Troubleshooting

### Problema: Factura no se genera

**Causa**: Pedido no tiene remisiones en estado `SURTIDO`

**Solución**: 
1. Verificar estado del pedido
2. Verificar que Finanzas haya confirmado
3. Revisar logs de confirmación

### Problema: Stock no se descuenta

**Causa**: Finanzas no ha confirmado el pedido

**Solución**:
1. Verificar que pedido esté en `Pendiente de confirmación`
2. Finanzas debe hacer clic en "Confirmar Surtido"
3. Verificar que no haya errores de stock

### Problema: No puedo rechazar pedido

**Causa**: Usuario no tiene permisos (ej: secretaria)

**Solución**:
1. Verificar rol del usuario
2. Solo `finanzas`, `gerente_finanzas`, `admin`, `super_admin` pueden rechazar

### Problema: Pedido en ciclo infinito de rechazo

**Causa**: Problema no resuelto en almacén

**Solución**:
1. Revisar observaciones de finanzas
2. Almacén debe corregir el problema específico
3. Verificar stock disponible antes de reenviar

## Mejoras Futuras

1. **Notificaciones automáticas**: Email/SMS cuando pedido es rechazado
2. **Dashboard de métricas**: Tasa de rechazo, tiempo promedio de confirmación
3. **Comentarios en tiempo real**: Chat entre Finanzas y Almacén
4. **Historial visual**: Timeline de estados del pedido
5. **Alertas de stock**: Prevenir rechazos por falta de inventario

## Referencias

- Código fuente: `controllers/remisionesController.js`
- Código fuente: `controllers/pedidosAdminController.js`
- Código fuente: `controllers/facturaController.js`
- Rutas: `routes/remisiones.js`
- Rutas: `routes/admin.js`
- Frontend: `tenants_views/razo/admin-pedido-detalle.html`
