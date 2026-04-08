# Backorder Consolidation by Supplier

## Purpose

This workflow consolidates open backorders from the same supplier into a single active purchase order until goods are physically received.

## Key Behavior

- Reuse an open purchase order for the same supplier when available.
- Create a new purchase order only when no valid open order exists.
- Preserve pedido_original_id in each purchase-order line for traceability.
- Group lines by original order in PDF output.

## Main Route

- GET /api/admin/ordenes-compra/:id/pdf

## Operational Rules

- Consolidation applies only while purchase order status is open.
- Orders in RECEIVED/CLOSED/CANCELED states cannot accept new lines.
- Reports must preserve original order traceability.

## Related Files

- services/ordenesService.js
- controllers/ordenCompraPDFController.js
- docs/FINANCE_WAREHOUSE.md
- docs/INVENTORY_MODEL_OVERVIEW.md
- docs/FIFO_USE_CASES.md

## Notes

This document captures behavior and governance. Keep SQL, rendering, and controller details in implementation files.
