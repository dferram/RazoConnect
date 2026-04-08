# Responsible Admin Assignment

## Purpose

The responsible admin system assigns operational users to a parent admin.

That assignment controls which stock and data each user can see and modify.

## Roles That Need a Responsible Admin

- inventarios
- catalogo
- finanzas
- compras
- agente

## Roles That Do Not Need It

- super_admin
- admin
- cliente

## Data Model

The assignment is stored in the `administradores` table.

Key field:
- `admin_responsable_id`

Example:
- a finance user can point to the main admin for the tenant
- all scoped operations are then resolved through that admin

## How It Works

1. A user logs in with an operational role.
2. The system reads `admin_responsable_id`.
3. Stock services resolve the correct admin scope.
4. Order and finance flows use that scope for all reads and writes.

## Common Use Cases

### One store, one admin

All operational users point to the same responsible admin.

### Multiple branches

Each group of operational users points to the admin for that branch.

## Migration Flow

1. Add `admin_responsable_id` if it does not exist.
2. Assign all operational users.
3. Copy or map stock into `stock_admin`.
4. Verify that users only see their scoped data.

## Operational Rules

- Do not leave operational users without a responsible admin.
- Use the same assignment for stock and receivables resolution.
- Keep the mapping stable once the user starts working operational data.

## Related Files

- Role catalog: `docs/SYSTEM_ROLES.md`
- Stock model: `docs/INVENTORY_MODEL_OVERVIEW.md`
- Stock resolution service: `services/SmartStockService.js`

## Notes

This document explains the assignment model in business terms. Keep the SQL and helper logic in the implementation files.
