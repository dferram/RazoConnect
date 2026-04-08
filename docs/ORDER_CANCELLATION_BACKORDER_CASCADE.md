# Order Cancellation with Backorder Cascade

## Purpose

This flow lets a customer cancel an order while preserving consistency across inventory, backorders, receivables, and notifications.

## Cancellation Endpoint

- PUT /api/pedidos/:id/cancelar

## Allowed States

- Pendiente
- Aprobado
- Parcialmente Surtido

## Non-Allowed States

- Confirmado
- Completado
- Cancelado
- Entregado

## Cancellation Effects

1. Validates tenant, ownership, and status.
2. Restores normal-stock quantities.
3. Restores only shipped quantity for partial backorders.
4. Clears pending backorder state where applicable.
5. Updates order status to Cancelado.
6. Reverses receivables/credit impact if financial records exist.
7. Sends high-priority admin notification.

## Operational Rules

- Never cancel by manual direct stock edits.
- Run cancellation in a transaction.
- Keep full traceability for stock and credit movements.

## Related Files

- controllers/pedidosController.js
- docs/INVENTORY_MODEL_OVERVIEW.md
- docs/FINANCE_WAREHOUSE.md
- docs/FIFO_USE_CASES.md

## Notes

This is a business and operations guide. Technical SQL and edge-case implementation should remain in code.
