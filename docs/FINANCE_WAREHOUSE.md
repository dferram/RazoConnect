# Finance-Warehouse Confirmation Workflow

## Overview

This document defines the controlled order confirmation workflow between Warehouse and Finance. The objective is to ensure inventory deduction and Accounts Receivable (CxC) posting occur only after Finance approval.

Implementation period: March 2026

## Control Objectives

- Separation of duties between warehouse preparation and financial authorization
- Inventory protection by deferring stock deduction until finance confirmation
- Financial integrity by deferring CxC generation until final approval
- Closed-loop correction path for rejected picks
- Billing control to prevent invoicing before approved fulfillment

## Order States

| State | Description | Set by | Next action |
|---|---|---|---|
| Pending | Order created, awaiting processing | System | Warehouse marks ready |
| Confirmed | Order accepted by admin/agent | Admin/Agent | Warehouse marks ready |
| Pending Finance Confirmation | Warehouse completed picking | Warehouse | Finance approves or rejects |
| Warehouse Review | Rejected by finance, correction required | Finance | Warehouse corrects and resubmits |
| Fulfilled | Finance confirmed, stock deducted, CxC posted | Finance | Eligible for invoicing |
| Completed | Fulfillment cycle closed | System | Final state |

## Delivery Note (Remision) States

| State | Description | Set by | Next action |
|---|---|---|---|
| DRAFT | Delivery note created | System | Issue note |
| PENDING_WAREHOUSE_REVIEW | Issued and awaiting warehouse validation | System | Warehouse confirms |
| PENDING_FINANCE_CONFIRMATION | Warehouse validated | Warehouse | Finance approves or rejects |
| WAREHOUSE_REVIEW | Rejected by finance | Finance | Warehouse corrects |
| FULFILLED | Finance confirmed and posted | Finance | Eligible for invoicing |
| CANCELLED | Delivery note cancelled | Admin/Finance | Final state |

## Operating Flow

### Step 1 - Warehouse Marks Order Ready

Endpoint: POST /api/admin/pedidos/:id/surtir

Authorized roles:
- inventarios
- gerente_operaciones
- jefe_almacen
- admin
- super_admin

Expected behavior:
- Transition to Pending Finance Confirmation
- No inventory deduction at this stage
- No CxC creation at this stage

### Step 2A - Finance Confirms Fulfillment

Endpoint: POST /api/admin/pedidos/:id/confirmar-surtido

Authorized roles:
- finanzas
- gerente_finanzas
- secretaria
- admin
- super_admin

Expected behavior:
- Deduct stock from stock_admin for fulfilled lines
- Register outbound movements in Kardex
- Create CxC entries for credit orders
- Transition order to Fulfilled
- Persist audit trail

Transaction guarantee:
- If stock deduction or posting fails, transaction is rolled back

### Step 2B - Finance Rejects and Returns to Warehouse

Endpoint: POST /api/admin/pedidos/:id/rechazar-finanzas

Authorized roles:
- finanzas
- gerente_finanzas
- admin
- super_admin

Explicitly excluded role:
- secretaria

Expected behavior:
- Mandatory rejection comments
- Transition to Warehouse Review
- No stock mutation
- No CxC mutation

### Step 3 - Warehouse Corrects and Resubmits

Endpoint: POST /api/admin/pedidos/:id/surtir

Expected behavior:
- Warehouse addresses finance observations
- Transition back to Pending Finance Confirmation
- Cycle repeats until approved

## Invoicing Control Gate

Billing is allowed only when at least one linked delivery note is in FULFILLED state.

Mandatory checks before invoice generation:
- Confirm fulfilled remision count > 0
- Confirm order state is in approved billing states

Control outcome:
- Prevents long-running invoice processing failures caused by unapproved fulfillment

## UI Governance - Action Visibility by Role

### Warehouse Action Button

Visible to:
- inventarios
- gerente_operaciones
- jefe_almacen
- admin
- super_admin

Behavior by order state:
- Pending or Confirmed: Mark Ready (enabled)
- Pending Finance Confirmation: Waiting Finance (disabled)
- Warehouse Review: Correct and Resubmit (enabled)
- Fulfilled: Fulfilled (disabled)

### Finance Confirm Button

Visible to:
- finanzas
- gerente_finanzas
- secretaria
- admin
- super_admin

Behavior by order state:
- Pending Finance Confirmation: Confirm Fulfillment (enabled)
- Fulfilled: Confirmed (disabled)

### Finance Reject Button

Visible to:
- finanzas
- gerente_finanzas
- admin
- super_admin

Behavior by order state:
- Pending Finance Confirmation: Return to Warehouse (enabled)

## Security and Authorization Matrix

| Action | inventarios | finanzas | gerente_finanzas | secretaria | admin | super_admin |
|---|---|---|---|---|---|---|
| Mark order ready | Yes | No | No | No | Yes | Yes |
| Confirm fulfillment | No | Yes | Yes | Yes | Yes | Yes |
| Reject fulfillment | No | Yes | Yes | No | Yes | Yes |
| Correct and resubmit | Yes | No | No | No | Yes | Yes |
| Generate invoice | No | Yes | Yes | No | Yes | Yes |

Security controls enforced:
- Backend role validation per endpoint
- Frontend action visibility aligned with backend authorization
- State transition validation before each operation
- Atomic transactions with rollback on failure
- Audit logging for critical transitions

## Auditable Data Footprint

Primary entities affected:
- pedidos
- remisiones
- historial_remisiones
- inventario_reservas_log
- Kardex

Audit requirements:
- Capture who performed each transition
- Capture transition timestamp and prior state
- Preserve rejection observations and correction cycle history

## Troubleshooting

### Invoice cannot be generated

Likely cause:
- No linked remision in FULFILLED state

Checks:
- Verify remision state
- Verify finance confirmation trail

### Stock did not move

Likely cause:
- Order still pending finance approval

Checks:
- Verify order is in Pending Finance Confirmation
- Verify finance confirmation endpoint execution

### Rejection unavailable for user

Likely cause:
- Role does not include reject permission

Checks:
- Verify user role
- Confirm role matrix policy

## Governance Notes

Source references:
- controllers/remisionesController.js
- controllers/pedidosAdminController.js
- controllers/facturaController.js
- routes/remisiones.js
- routes/admin.js

This document is normative for finance-warehouse segregation and approval controls.
