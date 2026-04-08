# Purchase Order Management and Anomaly Tracking

## Purpose

This workflow lets operations edit a purchase order before receiving stock and track any anomalies found during receiving.

It covers two things:
- pre-receipt purchase order editing
- discrepancy tracking for shortages, damages, and extra items

## What It Enables

### Purchase order editing before receiving

While the purchase order is still open, an admin can:
- add products
- edit quantities
- change package sizes
- change unit cost
- remove items that are no longer needed

If the removed item is linked to a backorder, the system must ask what to do with that backorder.

### Receiving anomalies

When the delivered quantity does not match the expected quantity, the system records the discrepancy as:
- shortage / shrinkage
- excess / bonus
- other documented reason

## Data Tracking

The workflow stores tracking data on `detallesordencompra` and records inventory adjustments in `ajustes_inventario`.

Useful fields include:
- discrepancy reason
- discrepancy type
- closure flag for shortages
- receiving admin
- received quantity
- linked backorder status

## Security Rules

- Super admins can edit any purchase order.
- Regular admins can edit only the purchase orders they created.
- Only open orders can be edited.
- Received items cannot be changed.
- Anomaly registration requires admin-level permissions.

## Operational Flow

1. The admin opens the purchase order detail screen.
2. The system checks whether the order is still editable.
3. The admin changes the order or receives stock.
4. The system detects any mismatch.
5. The admin records the reason for the mismatch.
6. The system stores the adjustment and updates the order state.

## Typical Reporting Needs

The system should support:
- anomalies by purchase order
- shortages by month
- excess stock by supplier
- backorders affected by order editing

## Related Files

- Controller: `controllers/comprasController.js`
- Routes: `routes/compras.js`
- Frontend: `tenants_views/razo/admin-orden-compra-detalle.html`
- Tracking helper: `tenants_views/razo/js/anomaly-tracking.js`

## Notes

This document is the business overview. Keep the SQL, validations, and UI details in the implementation files.
