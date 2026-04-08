# Order Cancellation with Backorder Cascade

## Purpose

This flow lets a customer cancel an order while safely restoring stock, clearing backorders, and reversing financial impact when needed.

The main rule is simple: cancellation must leave inventory, credit, and notifications in a consistent state.

## Data Model

RazoConnect does not use a separate backorder table. Backorders are tracked directly in `detallesdelpedido`.

Important fields:
- `esbackorder`: marks the line as backordered
- `cantidadsurtida`: how many pieces were already shipped
- `cantidadbackorder`: how many pieces are still pending

## Cancellation Endpoint

- `PUT /api/pedidos/:id/cancelar`

Only the owning customer can cancel the order.

## Which Orders Can Be Canceled

Cancelable states:
- `Pendiente`
- `Aprobado`
- `Parcialmente Surtido`

Not cancelable:
- `Confirmado`
- `Completado`
- `Cancelado`
- `Entregado`

## What Happens on Cancel

1. The system verifies ownership, tenant, and current status.
2. Each order line is reviewed one by one.
3. Normal stock lines restore the full quantity to inventory.
4. Backorder lines restore only the quantity that was already shipped.
5. The order status changes to `Cancelado`.
6. If the order affected credit, receivables and balances are reversed.
7. Administrators receive a high-priority notification.

## Inventory Behavior

- Normal line: restore full quantity
- Partial backorder line: restore shipped quantity only
- Pure backorder line: no stock is restored because nothing was deducted yet

## Credit Behavior

If the canceled order already created receivables, the system:
- finds the linked remissions
- reverses the customer debt
- writes a credit movement for traceability
- marks related receivable records as canceled in the description

## Admin Notification

Admins receive a summary with:
- order ID
- customer name and email
- number of stock lines and backorder lines
- pieces restored to inventory
- credit reversed, if applicable

## Response Shape

Successful cancellation returns a summary payload with the order ID and the main restoration counters.

## Operational Rules

- Never cancel an order by directly editing inventory rows.
- Always process cancellation inside a transaction.
- Always preserve traceability for stock and credit changes.

## Related Docs

- Inventory model: docs/INVENTORY_MODEL_OVERVIEW.md
- Finance and warehouse flow: docs/FINANCE_WAREHOUSE.md
- Backorder allocation: docs/FIFO_CASOS_DE_USO.md

## Notes

This document explains the business behavior. The exact SQL and controller code should stay in the implementation files.
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
