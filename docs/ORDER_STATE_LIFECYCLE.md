# Order State Lifecycle

## Purpose

This document explains the six-state order lifecycle used by RazoConnect.
The state is driven by real-time stock and by warehouse or finance actions.

## The Six States

### 1. Under Order

- No stock is available for any line in the order.
- The order will move out of this state automatically when stock arrives.

### 2. Mixed

- Some lines have stock and others do not.
- This state usually appears when stock is partially available.

### 3. Complete

- All lines have enough stock.
- The order is ready to continue to the warehouse flow.

### 4. Ready for Remission

- Warehouse has marked the order lines as ready to ship.
- This is a manual operational step.

### 5. Partially Shipped

- Finance has confirmed some lines, but not all.
- The order still has pending remissions.

### 6. Fully Shipped

- Finance has confirmed every line.
- The order is complete and no longer needs state changes.

## State Flow

1. The customer creates an order.
2. The system checks live stock.
3. The order starts in Under Order, Mixed, or Complete.
4. Warehouse marks the order ready to ship.
5. Finance confirms the remission.
6. The order ends as Partially Shipped or Fully Shipped.

## Recalculation Points

The order state is recalculated when:
- the order is created
- warehouse changes line status
- finance confirms a remission
- stock changes in a way that affects availability

## Operational Rules

- Dynamic states depend on current stock.
- Manual states depend on warehouse and finance actions.
- Finance confirmation is the final step that closes the shipping flow.

## Related Files

- State logic: `utils/pedidoStatus.js`
- Order flow: `controllers/pedidosController.js`
- Warehouse flow: `controllers/pedidosAdminController.js`
- Finance flow: `controllers/remisionesController.js`

## Notes

This document is a functional overview. Keep the detailed SQL and state evaluation logic in the codebase.
