# Functional Guide

## Purpose

This document provides a high-level operational view of the platform for business users, administrators, and support teams.
Detailed workflow rules live in the specialized documents under docs/.

## Primary Roles

- super_admin: platform-wide administration
- admin: tenant-level administration
- inventarios: warehouse and inventory operations
- catalogo: product content management
- finanzas: finance, collections, and fulfillment confirmation
- compras: purchase order processing
- agente: sales and customer portfolio operations
- cliente: catalog access and self-service ordering

## Core Business Areas

### Sales

- Browse products and variants
- Use configured pack sizes
- Validate stock during cart and checkout
- Apply coupons and discounts
- Track order status through the lifecycle

### Inventory

- Receive purchase orders
- Reconcile stock movements
- Audit stock discrepancies
- Process backorders and availability changes

### Credit

- Review credit limits and balances
- Validate available credit during checkout
- Track receivables and due dates
- Record payments and collections activity

### Commissions

- Calculate sales commissions when orders are completed
- Review agent performance
- Track pending and paid commission states

### Reporting

- Sales and order summaries
- Inventory and stock reports
- Credit and collections views
- Operational exports for management review

## Core Operational Flows

### Order Lifecycle

1. Customer places an order.
2. The system validates stock and credit rules.
3. Warehouse prepares the order.
4. Finance confirms fulfillment when required.
5. Stock is deducted and receivables are posted after confirmation.
6. The order moves to invoicing and completion.

### Inventory Replenishment

1. Purchasing creates a purchase order.
2. Goods are received against the expected order.
3. Inventory is updated.
4. Audit logs capture the movement.
5. Any stock shortfall can trigger backorder processing.

### Credit Approval and Recovery

1. Customer credit is validated before checkout.
2. Receivables are created only after approved fulfillment.
3. Payment entries reduce the outstanding balance.
4. Overdue accounts are tracked through operational reports.

## Where to Read Next

- Architecture and isolation: docs/MULTITENANCY.md
- Finance and warehouse approval flow: docs/FINANCE_WAREHOUSE.md
- Inventory model: docs/INVENTORY_MODEL_OVERVIEW.md
- Role catalog: docs/SYSTEM_ROLES.md
- Deployment guidance: docs/DEPLOYMENT_AND_TROUBLESHOOTING.md

## Notes

This guide is intentionally concise. It is meant to orient business and support readers before they move into the deeper implementation documentation.
