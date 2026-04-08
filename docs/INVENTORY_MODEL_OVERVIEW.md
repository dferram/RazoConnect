# Inventory Model Overview

## Purpose

RazoConnect uses a role-aware inventory model that separates platform-wide visibility from tenant and admin-scoped operations.
This document explains the model at a high level and points readers to the detailed implementation notes where needed.

## Inventory Layers

### Legacy global stock

The product_variants.stock column exists for legacy and global visibility scenarios.
It is not the operational source of truth for daily warehouse or tenant flows.

### Operational stock

The active source of truth is stock_admin.
It stores stock by admin, variant, and tenant so that operational responsibility remains scoped and auditable.

## How Stock Is Used

The inventory service layer decides how stock is read and written based on role and context.
General behavior:

- super_admin can inspect platform-wide stock views
- admin works against tenant-owned stock scope
- inventarios and finanzas operate within their assigned admin scope
- agente and cliente typically read stock context but do not mutate it

## Main Inventory Operations

### Purchase order receiving

- Purchase orders are received into stock_admin.
- Received quantities are logged as inventory movements.
- Audit trails capture who performed the action and when.

### Order fulfillment

- Stock is checked before or during order preparation.
- Final inventory deduction occurs only after the required confirmation flow.
- Backorders are created when demand exceeds available stock.

### Adjustments and audits

- Manual adjustments are allowed only for authorized roles.
- Monthly and ad hoc audits compare physical stock with the system record.
- Discrepancies must be investigated and documented.

## Operational Rules

1. Never assume the legacy global column is the source of truth.
2. Always keep tenant and admin scope in mind when reading or changing stock.
3. Always preserve an audit trail for stock mutations.
4. Always use the service layer for inventory changes.

## Where to Read Next

- FIFO allocation and backorders: docs/FIFO_CASOS_DE_USO.md
- Finance and warehouse confirmation: docs/FINANCE_WAREHOUSE.md
- Monthly inventory audit: docs/AUDITORIA_MENSUAL_INVENTARIO.md
- Inventory reconciliation details: docs/CONCILIACION_INVENTARIO_REFACTOR.md

## Notes

This document is intentionally concise. It is meant to explain the model, not to duplicate service code or SQL implementation details.
