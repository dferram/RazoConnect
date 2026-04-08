# Inventory Integrity Fix

## Purpose

This document summarizes the fixes applied to stop inventory mismatches and incorrect backorder states.

## Problems Fixed

### 1. Phantom stock in inventory filters

The inventory screen was showing products as available even when their real operational stock was zero.

Root cause:
- the query used the legacy `producto_variantes.stock` field
- the real source of truth is `inventarios_admin.cantidad`

Fix:
- the inventory filter now sums `inventarios_admin.cantidad`
- the list view and the detail view now match

### 2. Legacy stock synchronization

The legacy `producto_variantes.stock` column must mirror reality, but it should not be used as the operational source of truth.

Fix:
- a trigger keeps the legacy value synchronized whenever `inventarios_admin` changes
- the trigger supports INSERT, UPDATE, and DELETE

### 3. Incorrect backorder flags

Some historical order lines had inconsistent values, such as:
- `esbackorder = false` while pending quantity still existed
- `esbackorder = true` while shipped quantity was already recorded
- package counts that did not add up

Fix:
- an audit script checks for invalid combinations
- inconsistent historical data can be identified and corrected before it affects reporting

## Repair Workflow

1. Apply the stock sync trigger.
2. Run the historical sync script to repair legacy rows.
3. Run the backorder audit script.
4. Verify the inventory and order screens in production.

## Operational Rules

- Use `inventarios_admin.cantidad` as the source of truth.
- Treat `producto_variantes.stock` as a compatibility field only.
- Reconcile historical data before trusting legacy values.
- Backorder flags must always match shipped and pending quantities.

## Related Files

- Inventory query: `controllers/adminController.js`
- Sync script: `scripts/sync-inventory-stock.js`
- Backorder audit script: `scripts/audit-backorder-integrity.js`
- Trigger migration: `migrations/001_create_stock_sync_trigger.sql`

## Notes

This is a concise repair note. The detailed SQL and maintenance scripts should remain in the implementation files.
