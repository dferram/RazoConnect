# Notifications Model

## Purpose

This document defines notification operations for customer and staff channels.

## Customer Endpoints

- GET /api/notificaciones
- POST /api/notificaciones/:id/marcar-leida
- POST /api/notificaciones/marcar-todas-leidas
- DELETE /api/notificaciones/:id

## Staff Endpoints

- GET /api/staff/notificaciones
- GET /api/staff/notificaciones/unread-count
- POST /api/staff/notificaciones/marcar-todas-leidas

## Behavior

- Notifications are scoped by authenticated user identity.
- Read-state operations are idempotent and user-scoped.
- Staff access is role-restricted through role middleware.

## Operational Rules

- Notification records must remain tenant-scoped.
- Read/unread transitions must be attributable.
- Deletion should be explicit and user-authorized.

## Related Files

- routes/notificaciones.js
- routes/staff.js
- controllers/notificacionesController.js
- middlewares/authMiddleware.js
- middlewares/roleMiddleware.js
