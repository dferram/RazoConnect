# Staff and Developer Surfaces

## Purpose

This document describes internal operational surfaces for staff roles and developer administration.

## Staff Scope

Representative endpoints:
- /api/staff/notificaciones
- /api/staff/notificaciones/unread-count
- /api/staff/notificaciones/marcar-todas-leidas
- /api/staff/numcuenta (GET, PUT)

Access model:
- Authenticated staff only
- Role-based authorization per endpoint

## Developer Scope

Representative endpoints:
- /developer/login (GET, POST)
- /developer/logout
- /developer/dashboard
- /developer/tenants
- /developer/tenants/toggle
- /developer/api/tenants
- /developer/api/tenants/:id
- /developer/api/tenants/create

Access model:
- Developer guard middleware
- Internal-only operational usage

## Operational Rules

- Treat developer endpoints as privileged internal interfaces.
- Apply strict auth and rate limiting for developer login.
- Keep staff operations constrained to assigned role capabilities.

## Related Files

- routes/staff.js
- routes/developer.js
- middlewares/roleMiddleware.js
- middlewares/developerGuard.js
