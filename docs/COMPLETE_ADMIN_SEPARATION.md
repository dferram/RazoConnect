# Admin Separation Architecture

## Purpose

This model ensures inventory and receivables are scoped by responsible administrator to prevent cross-admin data leakage.

## Core Model

1. Customer state maps to an admin in administrador_estados.
2. That mapping defines the operational scope for stock and receivables.
3. Tenant scope is enforced on top of admin scope.

## Stock Separation

- stock_admin is the operational source of truth.
- Admin users only see/manage rows in their scope.
- Customers read stock through their assigned admin context.

## Receivables Separation

- cliente_creditos inherits admin scope from customer mapping.
- cuentas_por_cobrar inherits admin scope from credit records.
- Collection and reporting stay isolated per admin.

## Operational Rules

- Never bypass admin scope in inventory or CxC queries.
- Keep mapping consistency when users/clients change state.
- Preserve auditability for state-to-admin assignments.

## Related Files

- docs/SYSTEM_ROLES.md
- docs/INVENTORY_MODEL_OVERVIEW.md
- docs/SECURITY.md

## Notes

This document defines the governance model only. Detailed SQL and flow internals should stay in implementation artifacts.
