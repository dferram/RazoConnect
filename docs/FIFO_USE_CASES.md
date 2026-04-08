# FIFO Allocation Use Cases

## Purpose

FIFO allocation makes sure the oldest order gets stock first.
This prevents two orders from consuming the same inventory and keeps backorders fair and predictable.

## When FIFO Must Recalculate

### 1. Migration of existing orders

If FIFO is introduced into a system that already has active orders, the platform must recalculate the current queue once after deployment.

Endpoint:
- `POST /api/admin/fifo/recalcular`

Expected result:
- older orders keep priority
- newer orders fall back to backorder when stock runs out

### 2. Order cancellation

When an order is canceled, stock is restored and later orders must be recalculated.

Why it matters:
- waiting orders may now be fulfillable
- released stock should not remain unused

### 3. Order delivery

When an order is marked delivered, it should stop affecting future FIFO calculations.

This lets later orders reuse any stock that is no longer committed.

### 4. Concurrent orders

If two customers place orders at almost the same time, the earlier timestamp wins.

That protects the platform from race conditions.

### 5. Manual stock updates

After a manual inventory increase, the affected variant should be recalculated so backorders can be fulfilled.

### 6. Partial fulfillment

If available stock is not enough for the full order, FIFO splits the line into:
- fulfilled quantity
- pending backorder quantity

### 7. Multi-admin inventory

When inventory is split across admins, FIFO must still honor the stock scope for the current admin context.

### 8. Conflict detection

The service should flag cases where a later order would steal stock from an earlier one if recalculation is skipped.

## Validation Rules

- The oldest order always has priority.
- Any stock-changing event should trigger a recalculation plan.
- Backorder states must match the calculated remaining quantity.
- Orders already canceled or delivered should not keep consuming FIFO priority.

## Testing Checklist

- Existing orders recalculate correctly after migration.
- Canceling an order restores stock and updates later orders.
- Delivered orders stop affecting allocation.
- Concurrent orders do not both claim the same stock.
- Manual stock additions can release waiting backorders.
- Partial fulfillment keeps the shipped and pending quantities consistent.

## Related Files

- Service: `services/FIFOAllocationService.js`
- Stock logic: `services/SmartStockService.js`
- Order flow: `controllers/pedidosController.js`

## Notes

This document is the business validation guide for FIFO behavior. Keep the algorithm itself in the service layer.
