# Inventory Reconciliation Traceability Refactor

## Purpose

This refactor adds a clear origin trail to every inventory movement so the team can answer one question quickly:

Where did this stock movement come from?

## Problem Solved

Before this refactor, inventory history was hard to interpret because movements were stored with a free-text reason only.

After this refactor, each movement can point to its real source:
- purchase order receipt
- audit session
- manual adjustment
- shrinkage
- stock addition
- sale
- customer return

## Database Changes

The `log_inventario` table now tracks:
- movement origin type
- related purchase order ID
- related audit session ID
- related manual adjustment ID

## Backend Changes

### Inventory service

`inventoryService.registrarMovimiento()` now accepts traceability fields so every movement can be linked back to its source.

### Audit controller

Audit applications now save the audit session ID as the origin of the movement.

### Admin controller

Purchase-order receipts and reconciliation queries now write and read origin data from the unified inventory log.

## Frontend Behavior

The inventory reconciliation screen can now show:
- the movement origin badge
- a reference to the source record
- an in/out indicator
- better filtering by origin

## Typical Queries

The refactor enables these common views:
- everything received from a specific purchase order
- everything applied from an audit session
- monthly movement summaries
- inventory entered versus inventory on hand

## Operational Benefits

- every movement becomes traceable
- reconciliation is easier to explain
- finance can review stock value by source
- auditors can follow the chain from source to stock

## Related Files

- `controllers/adminController.js`
- `services/inventoryService.js`
- `controllers/inventoryAuditController.js`
- `tenants_views/razo/admin-movimientos-conciliacion.html`

## Notes

Keep the detailed SQL and report formatting in code. This file is only the human-readable overview.
