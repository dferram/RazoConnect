# RMA System

## Purpose

The RMA flow handles returns and adjustments while preserving inventory and financial traceability.

## Core Flow

1. Return request is created.
2. Eligibility and order context are validated.
3. Physical return is received and inspected.
4. Inventory and financial records are adjusted.
5. RMA status is finalized and logged.

## Rules

- Every RMA must reference tenant and order context.
- Inventory adjustments must be auditable.
- Financial effects must match approved return scope.

## Key Outputs

- Updated inventory movement records
- Updated receivables/credit where applicable
- Operational traceability for support and finance

## Related Files

- controllers/devolucionesController.js
- routes/devoluciones.js
- docs/INVENTORY_MODEL_OVERVIEW.md
- docs/FINANCE_WAREHOUSE.md
