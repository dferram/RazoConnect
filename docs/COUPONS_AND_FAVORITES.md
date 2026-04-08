# Coupons and Favorites

## Purpose

This document defines promotional and customer-engagement features used at checkout and product browsing stages.

## Coupons

Main endpoints:
- POST /api/cupones/validar
- GET /api/cupones/admin/cupones
- GET /api/cupones/admin/cupones/:id
- POST /api/cupones/admin/cupones
- PUT /api/cupones/admin/cupones/:id
- DELETE /api/cupones/admin/cupones/:id
- GET /api/cupones/agente/cupones/mis-cupones

Behavior:
- Coupon validation is available for purchase flow checks.
- Coupon management is role-restricted for admin surfaces.

## Favorites

Main endpoints:
- POST /api/favoritos/toggle
- GET /api/favoritos
- GET /api/favoritos/verificar/:varianteId
- GET /api/favoritos/notificaciones/count
- PUT /api/favoritos/notificaciones/marcar-leidas

Behavior:
- Favorites are customer-specific and authenticated.
- Restock notification counters are tied to favorite variants.

## Related Files

- routes/cupones.js
- routes/favoritos.js
- controllers/cuponesController.js
- controllers/favoritosController.js
