# Sistema de Cancelación de Pedidos con Backorders en Cascada

## Resumen Ejecutivo

Se implementó un sistema robusto de cancelación de pedidos que maneja correctamente los backorders asociados, restaura el inventario de forma inteligente y notifica automáticamente a los administradores.

## Arquitectura de Backorders

### Modelo de Datos

El sistema NO utiliza una tabla separada de backorders. Los backorders se rastrean directamente en `detallesdelpedido`:

```sql
CREATE TABLE public.detallesdelpedido (
    detalleid integer NOT NULL,
    pedidoid integer NOT NULL,
    varianteid integer NOT NULL,
    cantidadpaquetes integer NOT NULL,
    piezastotales integer NOT NULL,
    esbackorder boolean DEFAULT false,           -- Marca si el ítem es backorder
    cantidadsurtida integer DEFAULT 0,           -- Piezas ya entregadas
    cantidadbackorder integer DEFAULT 0,         -- Piezas pendientes en backorder
    cantidad_surtida_remisiones integer DEFAULT 0
);
```

### Estados de un Ítem en Pedido

1. **Stock Normal**: `esbackorder = false`
   - Todo el inventario estaba disponible al crear el pedido
   - `piezastotales` se descuentan del stock inmediatamente

2. **Backorder Completo**: `esbackorder = true`, `cantidadsurtida = 0`
   - No había stock disponible al crear el pedido
   - `cantidadbackorder = piezastotales`
   - No se descuenta stock (no hay qué descontar)

3. **Backorder Parcial**: `esbackorder = true`, `cantidadsurtida > 0`
   - Se surtió parcialmente mediante remisiones
   - `cantidadsurtida` = piezas ya entregadas
   - `cantidadbackorder` = piezas aún pendientes

## Endpoint de Cancelación

### Ruta
```
PUT /api/pedidos/:id/cancelar
```

### Autenticación
- Requiere autenticación de cliente
- Solo el cliente propietario puede cancelar su pedido

### Restricciones de Cancelación

**Estatus NO Cancelables:**
- `Confirmado` - Ya fue procesado por el admin
- `Completado` - Ya fue entregado completamente
- `Cancelado` - Ya está cancelado
- `Entregado` - Ya fue entregado físicamente

**Estatus Cancelables:**
- `Pendiente` - Aún no confirmado
- `Aprobado` - Aprobado pero no confirmado
- `Parcialmente Surtido` - Con remisiones parciales

## Lógica de Cancelación en Cascada

### 1. Validación Inicial
```javascript
// Verificar pertenencia y permisos
SELECT p.pedidoid, p.clienteid, p.estatus, p.es_credito, p.montototal,
       c.nombre as cliente_nombre, c.email as cliente_email
FROM pedidos p
JOIN clientes c ON p.clienteid = c.clienteid
WHERE p.pedidoid = $1 AND p.tenant_id = $2
```

### 2. Análisis de Ítems

Para cada ítem en `detallesdelpedido`:

#### Caso A: Ítem en Stock Normal
```javascript
if (!esbackorder) {
  // Restaurar todas las piezas al inventario
  UPDATE producto_variantes
  SET stock = stock + piezastotales
  WHERE varianteid = $1
  
  itemsEnStock++;
  piezasRestauradas += piezastotales;
}
```

#### Caso B: Ítem en Backorder
```javascript
if (esbackorder) {
  // Calcular piezas pendientes
  const piezasBackorderPendientes = piezastotales - cantidadsurtida;
  
  if (piezasBackorderPendientes > 0) {
    backordersCancelados++;
  }
  
  // Si había piezas surtidas, restaurarlas
  if (cantidadsurtida > 0) {
    UPDATE producto_variantes
    SET stock = stock + cantidadsurtida
    WHERE varianteid = $1
    
    piezasRestauradas += cantidadsurtida;
  }
  
  // Limpiar flags de backorder
  UPDATE detallesdelpedido
  SET cantidadbackorder = 0,
      esbackorder = false
  WHERE detalleid = $1
  
  itemsEnBackorder++;
}
```

### 3. Actualización del Pedido
```sql
UPDATE pedidos
SET estatus = 'Cancelado',
    completamente_surtido = false,
    monto_backorder = 0
WHERE pedidoid = $1 AND tenant_id = $2
```

### 4. Reversión de Crédito (Si Aplica)

Si el pedido era a crédito Y ya tenía remisiones emitidas:

```javascript
// Buscar remisiones asociadas
SELECT remision_id FROM remisiones
WHERE pedido_id = $1 AND tenant_id = $2

// Calcular total cargado
SELECT SUM(monto) as total_cargado
FROM cuentas_por_cobrar
WHERE remision_id = ANY($1)

// Revertir saldo deudor
UPDATE cliente_creditos
SET saldo_deudor = saldo_deudor - total_cargado
WHERE cliente_id = $1

// Registrar movimiento
INSERT INTO credito_movimientos (
  credito_id, tipo_movimiento, monto, referencia_id,
  descripcion, saldo_despues_movimiento
) VALUES (
  $1, 'ABONO', $2, 'PED-{id}',
  'Abono por cancelación de pedido #{id}', $3
)

// Marcar CXC como cancelados
UPDATE cuentas_por_cobrar
SET descripcion = descripcion || ' (CANCELADO)'
WHERE remision_id = ANY($1)
```

### 5. Notificación a Administradores

Se crea una notificación de **prioridad ALTA** para todos los administradores del tenant:

```javascript
INSERT INTO notificaciones (
  administrador_id,
  tipo,
  titulo,
  mensaje,
  prioridad,
  metadata,
  tenant_id
) VALUES (
  $1,
  'pedido',
  'Pedido #{id} cancelado por cliente',
  'El cliente {nombre} ({email}) ha cancelado el pedido #{id}...',
  'alta',
  {
    pedido_id: id,
    cliente_id: clienteId,
    monto_total: montoTotal,
    items_stock: itemsEnStock,
    items_backorder: itemsEnBackorder,
    backorders_cancelados: backordersCancelados,
    piezas_restauradas: piezasRestauradas,
    monto_revertido: montoRevertido,
    accion: 'cancelacion_pedido'
  },
  $2
)
```

#### Contenido de la Notificación
```
Título: Pedido #123 cancelado por cliente

Mensaje:
El cliente Juan Pérez (juan@example.com) ha cancelado el pedido #123.

📊 Resumen de cancelación:
• Ítems en stock: 3
• Ítems en backorder: 2
• Backorders cancelados: 2
• Piezas restauradas al inventario: 150
• Crédito revertido: $1,250.00

Estatus anterior: Parcialmente Surtido
```

## Respuesta del Endpoint

### Éxito (200 OK)
```json
{
  "success": true,
  "message": "Pedido y backorders asociados cancelados correctamente",
  "detalles": {
    "pedido_id": 123,
    "items_en_stock": 3,
    "items_en_backorder": 2,
    "backorders_cancelados": 2,
    "piezas_restauradas": 150,
    "credito_revertido": "$1,250.00"
  }
}
```

### Error: Pedido No Cancelable (400 Bad Request)
```json
{
  "success": false,
  "error": "No se puede cancelar un pedido con estatus \"Confirmado\""
}
```

### Error: Sin Permisos (403 Forbidden)
```json
{
  "success": false,
  "error": "No tienes permiso para cancelar este pedido"
}
```

### Error: No Encontrado (404 Not Found)
```json
{
  "success": false,
  "error": "Pedido no encontrado"
}
```

## Garantías de Integridad

### Transaccionalidad
- Toda la operación se ejecuta dentro de una transacción SQL (`BEGIN...COMMIT`)
- Si cualquier paso falla, se hace `ROLLBACK` completo
- Uso de `FOR UPDATE` para prevenir race conditions

### Logging Detallado
```javascript
console.log(`[Cancelar Pedido] Procesando ${n} ítems del pedido ${id}`);
console.log(`[Cancelar Pedido] Variante ${vid}: Backorder cancelado (${piezas} piezas pendientes)`);
console.log(`[Cancelar Pedido] Variante ${vid}: Stock restaurado=${piezas} piezas`);
console.log(`[Cancelar Pedido] Pedido ${id} cancelado exitosamente - Stock: ${s}, Backorder: ${b}, Cancelados: ${c}`);
```

### Manejo de Errores
- Validación de existencia de variantes antes de actualizar stock
- Warnings para variantes no encontradas (sin detener el proceso)
- Captura completa de errores con stack trace
- Códigos de error PostgreSQL preservados

## Casos de Uso

### Caso 1: Pedido 100% en Stock
**Escenario:**
- Pedido de 3 productos, todos disponibles
- Cliente cancela antes de confirmación

**Resultado:**
- 3 ítems en stock restaurados
- 0 backorders cancelados
- Stock completamente restaurado
- Notificación enviada al admin

### Caso 2: Pedido 100% en Backorder
**Escenario:**
- Pedido de 2 productos sin stock
- Cliente cancela mientras espera reabastecimiento

**Resultado:**
- 0 ítems en stock
- 2 backorders cancelados
- 0 piezas restauradas (no había stock que restaurar)
- Flags de backorder limpiados
- Notificación enviada al admin

### Caso 3: Pedido Mixto con Remisión Parcial
**Escenario:**
- Pedido de 5 productos: 3 en stock, 2 en backorder
- Admin emitió remisión con los 3 en stock
- 1 backorder se surtió parcialmente (50 de 100 piezas)
- Cliente cancela el resto

**Resultado:**
- 3 ítems en stock (ya entregados, no se restauran)
- 2 ítems en backorder
- 1 backorder cancelado completamente
- 1 backorder cancelado parcialmente (50 piezas restauradas)
- Crédito revertido por las 50 piezas surtidas del backorder
- Notificación detallada al admin

### Caso 4: Pedido a Crédito con Remisiones
**Escenario:**
- Pedido a crédito de $5,000
- 2 remisiones emitidas: $3,000 y $1,500
- Cliente cancela antes de completar

**Resultado:**
- Stock restaurado según disponibilidad
- Saldo deudor reducido en $4,500
- 2 movimientos de crédito tipo ABONO
- CXC marcados como (CANCELADO)
- Notificación con monto revertido

## Métricas de Monitoreo

El sistema genera las siguientes métricas por cancelación:

1. **items_en_stock**: Cantidad de ítems que estaban en inventario normal
2. **items_en_backorder**: Cantidad de ítems que estaban en backorder
3. **backorders_cancelados**: Cantidad de backorders efectivamente cancelados
4. **piezas_restauradas**: Total de piezas devueltas al inventario
5. **monto_revertido**: Monto de crédito revertido (si aplica)

Estas métricas están disponibles en:
- Respuesta JSON del endpoint
- Metadata de la notificación al admin
- Logs del servidor

## Consideraciones de Seguridad

1. **Autenticación Obligatoria**: Solo clientes autenticados pueden cancelar
2. **Autorización por Propiedad**: Solo el cliente dueño puede cancelar su pedido
3. **Validación de Estatus**: Previene cancelación de pedidos ya procesados
4. **Transacciones Atómicas**: Garantiza consistencia de datos
5. **Bloqueos Optimistas**: `FOR UPDATE` previene condiciones de carrera
6. **Aislamiento por Tenant**: Todas las queries incluyen `tenant_id`

## Pruebas Recomendadas

### Test 1: Cancelación Simple
```bash
curl -X PUT http://localhost:3000/api/pedidos/123/cancelar \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json"
```

### Test 2: Verificar Restauración de Stock
```sql
-- Antes de cancelar
SELECT stock FROM producto_variantes WHERE varianteid = 456;

-- Después de cancelar
SELECT stock FROM producto_variantes WHERE varianteid = 456;
-- Debe incrementar en piezastotales
```

### Test 3: Verificar Notificación Admin
```sql
SELECT * FROM notificaciones
WHERE tipo = 'pedido'
  AND titulo LIKE '%cancelado por cliente%'
ORDER BY fechacreacion DESC
LIMIT 1;
```

### Test 4: Verificar Reversión de Crédito
```sql
SELECT saldo_deudor FROM cliente_creditos WHERE cliente_id = 789;

SELECT * FROM credito_movimientos
WHERE tipo_movimiento = 'ABONO'
  AND descripcion LIKE '%cancelación%'
ORDER BY fecha_movimiento DESC;
```

## Mantenimiento y Troubleshooting

### Logs Importantes
```bash
# Buscar cancelaciones en logs
grep "[Cancelar Pedido]" server.log

# Verificar errores de cancelación
grep "Error crítico" server.log | grep "Cancelar Pedido"
```

### Queries de Auditoría
```sql
-- Pedidos cancelados hoy
SELECT pedidoid, clienteid, montototal, estatus
FROM pedidos
WHERE estatus = 'Cancelado'
  AND DATE(fechapedido) = CURRENT_DATE;

-- Backorders cancelados (limpiados)
SELECT COUNT(*) as backorders_limpiados
FROM detallesdelpedido
WHERE esbackorder = false
  AND cantidadbackorder = 0
  AND pedidoid IN (
    SELECT pedidoid FROM pedidos WHERE estatus = 'Cancelado'
  );

-- Notificaciones de cancelación enviadas
SELECT COUNT(*) as notificaciones_enviadas
FROM notificaciones
WHERE tipo = 'pedido'
  AND titulo LIKE '%cancelado por cliente%'
  AND DATE(fechacreacion) = CURRENT_DATE;
```

## Changelog

### v1.0.0 (2026-01-19)
- ✅ Implementación inicial de cancelación en cascada
- ✅ Manejo inteligente de backorders (completos y parciales)
- ✅ Restauración diferenciada de stock vs backorder
- ✅ Reversión automática de cargos de crédito
- ✅ Sistema de notificaciones a administradores
- ✅ Métricas detalladas de cancelación
- ✅ Logging exhaustivo para auditoría
- ✅ Transacciones atómicas con manejo de errores

## Contacto y Soporte

Para reportar bugs o solicitar mejoras relacionadas con el sistema de cancelación de pedidos, contactar al equipo de desarrollo backend.
