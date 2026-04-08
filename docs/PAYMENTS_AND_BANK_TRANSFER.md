# Payments and Bank Transfer

## Purpose

This document explains available customer payment methods and operational constraints.

## Main Endpoints

- POST /api/pagos/procesar-tarjeta
- GET /api/pagos/info-transferencia

## Current Behavior

- Card processing endpoint is feature-flagged and may be disabled.
- Bank transfer information endpoint is enabled for authenticated customers.
- Payment alternatives should be presented when card processing is disabled.

## Operational Rules

- Do not expose payment processing endpoints without authentication.
- Keep bank account data centrally managed and auditable.
- Ensure checkout UI reflects enabled or disabled payment methods.

## Related Files

- routes/pagos.js
- controllers/mercadoPagoController.js
- docs/MERCADO_PAGO_REACTIVATION.md
- docs/FINANCE_WAREHOUSE.md
