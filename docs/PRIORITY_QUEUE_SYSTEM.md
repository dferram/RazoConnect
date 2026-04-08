# Priority Queue System

## Purpose

This system allows administrators to prioritize selected orders ahead of standard FIFO order in controlled scenarios.

## Key Principles

- VIP priority can reorder allocation outcomes.
- Any priority change must remain auditable.
- Priority must not bypass stock integrity checks.

## Behavior

1. Admin marks an order as priority.
2. Allocation recalculation runs for impacted variants.
3. Affected orders may change between fulfilled and backorder states.
4. Changes are logged for traceability.

## Safety Rules

- Only allow priority changes for active order states.
- Block changes for terminal states (delivered or canceled).
- Always recalculate impacted stock commitments.

## Recommended Metrics

- Number of priority toggles per day
- Number of impacted orders per toggle
- Backorder delta after each recalculation

## Related Files

- services/FIFOAllocationService.js
- controllers/pedidosAdminController.js
- docs/FIFO_USE_CASES.md
- docs/INVENTORY_MODEL_OVERVIEW.md
