# Public Endpoints

## Purpose

This document defines unauthenticated or conditionally authenticated public API surfaces.

## Main Endpoints

- GET /api/public/estados
- GET /api/public/landing-content
- GET /api/public/landing-items
- GET /api/estados-all

## Conditional Access

- /api/public/landing-content supports preview mode.
- Preview mode requires authentication.

## Operational Rules

- Public endpoints must remain read-only.
- Tenant context must still be applied where relevant.
- Public responses should avoid exposing internal identifiers unnecessarily.

## Related Files

- routes/public.js
- controllers/direccionesController.js
- controllers/estadosController.js
- controllers/landingEditorController.js
