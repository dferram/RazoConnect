# Monthly Inventory Audit

## Purpose

This module supports monthly stock reconciliation between system-expected stock and physically counted stock.

## How It Works

1. The system calculates theoretical stock for each variant.
2. Warehouse users perform blind counting by SKU and quantity.
3. Reconciliation marks differences with a traffic-light model.
4. Significant differences require justification comments.
5. A super admin can close and synchronize the session.

## Traffic-Light Rules

| Color | Meaning | Action |
|---|---|---|
| Green | No difference | No action |
| Yellow | Small difference | Optional comment |
| Red | Significant difference | Mandatory comment |

## Data Model

- toma_inventario_sesiones
- toma_inventario_conteos
- auditoria_comentarios
- ajustes_inventario

## Main Endpoints

- POST /api/admin/auditoria/sesiones
- GET /api/admin/auditoria/sesiones
- GET /api/admin/auditoria/sesiones/:sesionId
- POST /api/admin/auditoria/sesiones/:sesionId/conteos
- POST /api/admin/auditoria/conteos/:conteoId/comentario
- POST /api/admin/auditoria/sesiones/:sesionId/cerrar

## Operational Rules

- Red differences cannot be closed without comment.
- Closed sessions are immutable.
- Stock synchronization must stay traceable by user and session.

## Related Files

- services/inventoryAuditService.js
- controllers/auditController.js
- routes/admin.js
- tenants_views/razo/admin-auditoria-mensual.html

## Notes

This document is intentionally concise and operational. Detailed SQL and implementation logic belong in code and migrations.
