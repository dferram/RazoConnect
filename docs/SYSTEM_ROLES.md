# SYSTEM ROLES - Simplified Operating Model

## 8 Active Roles (April 2026)

### 1. super_admin
- Access: Full platform-wide access
- Stock scope: Full visibility and update authority
- admin_responsable_id: Not applicable
- Typical users: Platform operators

### 2. admin
- Access: Full tenant access except platform-level SaaS configuration
- Stock scope: Full visibility and update authority within tenant
- admin_responsable_id: Not required
- Typical users: Tenant owners and senior administrators

### 3. inventarios
- Access: Inventory operations, purchasing visibility, product lookup
- Stock scope: Assigned admin scope only
- admin_responsable_id: Required
- Key actions: Mark order picking complete, execute counts, perform adjustments

### 4. catalogo
- Access: Product content management
- Stock scope: Read-only stock context, no stock mutations
- admin_responsable_id: Not required
- Key actions: Product descriptions, images, SEO, content quality

### 5. finanzas
- Access: Finance, collections, credit, fulfillment confirmation
- Stock scope: Assigned admin scope for finance confirmation workflows
- admin_responsable_id: Required
- Key actions: Confirm fulfillment, manage receivables, collections tracking

### 6. compras
- Access: Purchase orders and supplier operations
- Stock scope: Assigned admin scope for receiving and purchasing
- admin_responsable_id: Required
- Key actions: Create PO, process receiving

### 7. agente
- Access: Sales execution and customer portfolio handling
- Stock scope: Assigned admin visibility scope
- admin_responsable_id: Required
- Key actions: Create orders, manage assigned accounts

### 8. cliente
- Access: Catalog and own orders only
- Stock scope: Customer-visible stock according to assigned operational rules
- admin_responsable_id: Not applicable

---

## admin_responsable_id Assignment Matrix

| Role | Requires admin_responsable_id | Mandatory | Can mutate stock |
|---|---|---|---|
| super_admin | No | No | No |
| admin | No | No | No |
| inventarios | Yes | Yes | Yes |
| catalogo | No | No | No |
| finanzas | Yes | Yes | Yes |
| compras | Yes | Yes | Yes |
| agente | Yes | Yes | No |

---

## Pending Operational Hardening

- Build UI for admin_responsable_id assignment
- Enforce role-assignment validation during admin onboarding
- Execute full role regression testing suite

---

## Governance Note

This document defines the operational role catalog used by workflow and authorization decisions.
Security architecture details are documented in docs/SECURITY.md.
