# Allocation Traceability Fix

## Purpose

This fix ensures each fulfilled order line can be traced to the admin stock source used during allocation.

## Problem Solved

Without explicit traceability, it was difficult to audit which admin stock source fulfilled a specific order detail.

## Solution

- Record allocation traces per order detail and admin source.
- Preserve tenant and variant references in trace records.
- Keep reconciliation and support investigations deterministic.

## Validation Checklist

1. Create order with multi-source stock availability.
2. Confirm allocation trace records are created.
3. Verify totals match fulfilled quantity.
4. Verify records are tenant-scoped and queryable.

## Related Files

- services/SmartStockService.js
- controllers/pedidosController.js
- docs/INVENTORY_INTEGRITY_FIX.md
