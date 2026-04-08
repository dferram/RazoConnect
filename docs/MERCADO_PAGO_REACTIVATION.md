# Mercado Pago Reactivation Guide

## Purpose

Mercado Pago is currently disabled in the platform.
This guide explains how to re-enable it safely when the team is ready to test or return to production.

## Current Disabled State

### Frontend

- the Mercado Pago payment card is visually disabled
- the option cannot be selected
- the UI warns the user that the method is unavailable

### Backend

- the payment endpoint is protected by a feature flag
- attempts to process Mercado Pago return an unavailable response

## How to Re-enable It

### 1. Enable the backend flag

Set the Mercado Pago flag to `true` in the payment route configuration.

### 2. Restore the payment card in checkout

Remove the disabled state from the Mercado Pago option in the cart page.

### 3. Remove the blocking JavaScript guard

Delete or comment the code that shows the unavailable warning and forces a different payment method.

### 4. Restore the default payment choice

Set Mercado Pago as the default checkout option if that is the intended production behavior.

### 5. Re-enable credit-payment UI if needed

If the credit screen also disables Mercado Pago, restore that card in the same way.

## Validation Steps

After re-enabling the feature, verify that:
- the payment card is selectable
- the backend endpoint accepts the payment flow
- the cart completes successfully
- the credit flow still works
- error handling behaves as expected

## Operational Rule

Do not re-enable the method in production until sandbox and end-to-end tests pass.

## Related Files

- `routes/pagos.js`
- `public/carrito.html`
- `public/mi_credito.html`

## Notes

This document is a recovery checklist, not a payment implementation guide.
