<div align="center">

# RazoConnect

![Node.js](https://img.shields.io/badge/Node.js-v18+-339933?style=flat-square&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.18-000000?style=flat-square&logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-v17+-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Azure](https://img.shields.io/badge/Azure-App_Service-0078D4?style=flat-square&logo=microsoftazure&logoColor=white)
![License](https://img.shields.io/badge/License-Proprietary-red?style=flat-square)

B2B SaaS platform for multi-tenant e-commerce and inventory management. Built and maintained by [xCore](https://xcore.mx).

</div>

---

## Overview

RazoConnect is a multi-tenant SaaS platform that enables B2B commerce operations — catalog management, order processing, inventory control, credit lines, and agent commissions — from a single application instance. Each tenant operates in complete data isolation through a shared PostgreSQL database partitioned by `tenant_id`, with dedicated frontend views served per domain.

The system is deployed on Azure App Service and serves production traffic for multiple businesses simultaneously.

### Recent Updates (March 2026)

**Finance-Warehouse Confirmation Workflow**: Implemented a new approval flow where warehouse staff prepare orders and Finance department confirms before stock deduction and CxC generation. See [`docs/FLUJO_FINANZAS_ALMACEN.md`](docs/FLUJO_FINANZAS_ALMACEN.md) for complete documentation.

---

## Architecture

### System Layers

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT LAYER                            │
│          Vanilla JS · Bootstrap 5 · Per-tenant views        │
│            razo.com.mx          fashion.com.mx              │
└───────────────────────┬─────────────────────────────────────┘
                        │ HTTPS
┌───────────────────────▼─────────────────────────────────────┐
│                  MIDDLEWARE PIPELINE                        │
│  Helmet · CORS · Rate Limit (Redis) · Session · TenantGuard │
│              JWT Auth · Input Sanitization                  │
└───────────────────────┬─────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────┐
│                    ROUTE LAYER                              │
│         routes/admin.js · routes/clientes.js               │
│         routes/auth.js · routes/developer.js               │
└──────────┬──────────────────────────┬───────────────────────┘
           │                          │
┌──────────▼──────────┐  ┌────────────▼──────────────────────┐
│   CONTROLLER LAYER  │  │          SERVICE LAYER            │
│                     │  │                                   │
│  authAdminCtrl      │  │  SmartStockService   (FIFO alloc) │
│  pedidosAdminCtrl   │  │  KardexService       (movements)  │
│  clientesAdminCtrl  │  │  FIFOAllocationService            │
│  inventarioCtrl     │  │  OptimizationService              │
│  comisionesCtrl     │  │  creditAnalysisService            │
│  cxcAdminCtrl       │  │  inventoryAuditService            │
│  cxpController      │  │  emailService                     │
│  dashboardCtrl      │  │  loggerService                    │
│  bitacoraCtrl       │  │  notificacionesService            │
│  ...30+ controllers │  └───────────────┬───────────────────┘
└──────────┬──────────┘                  │
           └──────────────┬─────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                    DATA LAYER                               │
│         PostgreSQL (Azure) · Redis (sessions/cache)         │
│              pg pool · Parameterized queries                │
└─────────────────────────────────────────────────────────────┘
```

### Multi-Tenant Model

```
Incoming Request
       │
       ▼
┌─────────────────┐
│  TenantGuard    │  Resolves tenant from domain or FORCE_TENANT_ID
│  Middleware     │  Attaches req.tenant = { tenant_id, dominio, ... }
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  All queries    │  WHERE tenant_id = $1 enforced at controller level
│  filtered by    │  Cross-tenant access blocked at middleware + query
│  tenant_id      │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│           PostgreSQL                    │
│                                         │
│  ┌────────────┐    ┌────────────┐       │
│  │  Tenant A  │    │  Tenant B  │  ...  │
│  │  (razo)    │    │ (fashion)  │       │
│  │            │    │            │       │
│  │ pedidos    │    │ pedidos    │       │
│  │ clientes   │    │ clientes   │       │
│  │ productos  │    │ productos  │       │
│  └────────────┘    └────────────┘       │
│         Shared tables, isolated rows    │
└─────────────────────────────────────────┘
```

### Request Authentication Flow

```
POST /api/admin/login
         │
         ▼
┌────────────────────┐
│   TenantGuard      │  Validates domain → assigns tenant_id
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│  authAdminCtrl     │  Queries Administradores WHERE email=$1 AND tenant_id=$2
│  loginAdmin()      │  bcryptjs.compare(password, hash)
└────────┬───────────┘
         │
         ├── Invalid → 401
         │
         ▼
┌────────────────────┐
│  JWT Generation    │  generateAccessToken({ id, rol, tenant_id })
│                    │  generateRefreshToken → stored in Redis
└────────┬───────────┘
         │
         ▼
   Access Token (15min) + Refresh Token (30d) returned to client

─────────────────────────────────────────────────────
Subsequent requests:

Authorization: Bearer <access_token>
         │
         ▼
┌────────────────────┐
│  verifyToken       │  Decode JWT → attach req.user
│  middleware        │  validateUserTenant → check user.tenant_id === req.tenant.tenant_id
└────────┬───────────┘
         │
         ▼
   Controller receives req.user + req.tenant (fully validated)
```

### FIFO Inventory Allocation

```
New order arrives for Variant X (qty: 10)
         │
         ▼
┌────────────────────────────────────┐
│  SmartStockService                 │
│  calculateAllocationStatus()       │
│                                    │
│  1. Get physical stock for variant │
│  2. Get "debt" from prior orders   │
│     (older orders already claim    │
│      stock in FIFO order)          │
│  3. Subtract hard reserves         │
│  4. Remaining = available for this │
│     order                          │
└───────────────┬────────────────────┘
                │
        ┌───────┴────────┐
        │                │
        ▼                ▼
  available >= 10    available < 10
  estatus: surtido   estatus: backorder
                     cantidadBackorder = 10 - available
                          │
                          ▼
               Order stored with backorder flag.
               FIFOAllocationService hooks on:
                - onPedidoCancelado()  → stock freed → recalculate queue
                - onPedidoEntregado()  → stock freed → recalculate queue
```

---

## Stack

<div align="center">

| Layer | Technology |
|---|---|
| Runtime | Node.js v18+ |
| Framework | Express.js 4.18 |
| Database | PostgreSQL v17 (Azure Database) |
| Cache / Sessions | Redis (rate limiting, refresh tokens) + **Smart Fallback** (mock en desarrollo) |
| Authentication | JWT (access + refresh) + Passport.js (Google OAuth) |
| File Storage | Cloudinary |
| Payments | MercadoPago SDK |
| Email | Nodemailer (SMTP) |
| PDF Generation | PDFKit |
| Excel Export | ExcelJS |
| Scheduled Jobs | node-cron |
| Hosting | Azure App Service |
| Testing | Jest + Supertest |

</div>

---

## Project Structure

```
RazoConnect/
├── config/
│   ├── cloudinary.js          # Cloudinary SDK configuration
│   ├── domainMapper.js        # Domain → tenant_id resolution
│   └── passport.js            # Google OAuth strategy
│
├── controllers/
│   ├── admin/
│   │   ├── pagosController.js
│   │   └── pagosClientesController.js
│   ├── auth/
│   │   └── tokenController.js
│   ├── authAdminController.js
│   ├── pedidosAdminController.js
│   ├── clientesAdminController.js
│   ├── inventarioResumenController.js
│   ├── comisionesAdminController.js
│   ├── cxcAdminController.js
│   ├── cxpController.js
│   ├── dashboardAdminController.js
│   ├── bitacoraController.js
│   ├── fifoRecalculationController.js
│   └── ...30+ specialized controllers
│
├── services/
│   ├── SmartStockService.js       # FIFO stock allocation per admin
│   ├── FIFOAllocationService.js   # Backorder recalculation hooks
│   ├── KardexService.js           # Inventory movement ledger
│   ├── OptimizationService.js     # Purchase order consolidation
│   ├── inventoryAuditService.js   # Physical count reconciliation
│   ├── creditAnalysisService.js   # Credit risk scoring
│   ├── auditService.js            # Change request audit trail
│   ├── loggerService.js           # Action log (bitácora)
│   ├── emailService.js            # Templated email dispatch
│   └── notificacionesService.js   # In-app notifications
│
├── middlewares/
│   ├── tenantGuard.js             # Domain → tenant resolution
│   ├── authMiddleware.js          # JWT verification
│   ├── validateUserTenant.js      # Cross-tenant access prevention
│   ├── inputValidator.js          # XSS + prototype pollution sanitization
│   ├── rateLimiter.js             # Redis-backed distributed rate limiting
│   └── errorHandler.js
│
├── routes/
│   ├── admin.js
│   ├── clientes.js
│   ├── auth.js│   └── developer.js
│
├── tenants_views/
│   ├── razo/                      # Tenant A frontend (HTML/CSS/JS)
│   └── fashion/                   # Tenant B frontend (HTML/CSS/JS)
│
├── cron/                          # Scheduled jobs (sessions, alerts)
├── utils/                         # jwtHelper, validator, skuGenerator, etc.
├── docs/                          # Technical documentation
├── tests/                         # Jest test suites
├── db.js                          # PostgreSQL pool configuration
├── index.js                       # Application entry point
└── package.json
```

---

## Modules

### Sales

- Product catalog with variants (size, color, dimensions)
- Configurable pack system (unit, 6, 12, 24, etc.)
- Real-time stock validation at cart and checkout
- Coupon system (percentage and fixed discount, expiry, usage limits)
- Multi-address shipping per customer
- Order lifecycle: Pending → Surtido → Shipped → Delivered

### Inventory

- Purchase orders to suppliers with packaging rule enforcement
- Inventory reception and FIFO allocation to admin-level stock
- KardexService: immutable ledger of every stock movement
- Physical count reconciliation with traffic-light discrepancy system
- FIFOAllocationService: automatic backorder queue recalculation on cancellation or delivery

### Credit

- Configurable credit lines per customer
- Automatic credit limit validation at checkout
- Accounts receivable (CXC) with due-date tracking
- Credit risk scoring based on purchase history and payment behavior
- Overdue alerts via in-app notifications and email

### Agent Commissions

- Automatic commission calculation on order delivery
- Configurable commission rates per agent
- Agent dashboard with portfolio and sales metrics
- Commission approval and payment workflow

### Audit and Compliance

- `loggerService`: full audit trail of all administrative actions
- `auditService`: change request system with before/after snapshots
- `bitacoraController`: filterable log query API for compliance review
- Developer panel: cross-tenant platform administration

---

## Security

<div align="center">

| Layer | Mechanism |
|---|---|
| Transport | HTTPS enforced, Azure SSL certificates |
| Database connection | SSL with certificate validation (`DB_SSL=true`) |
| SQL injection | 100% parameterized queries (`$1, $2, ...`) |
| XSS | `sanitizeInputs` middleware strips dangerous patterns |
| Prototype pollution | `sanitizeObject` removes `__proto__` and `constructor` keys |
| Rate limiting | Redis-backed distributed limiter via `express-rate-limit` |
| Authentication | JWT access token (short-lived) + refresh token in Redis |
| Cross-tenant isolation | `validateUserTenant` middleware compares `req.user.tenant_id` to `req.tenant.tenant_id` |
| Headers | Helmet (CSP, HSTS, X-Frame-Options, X-Content-Type-Options) |
| CORS | Allowlist-based, configurable per environment |

</div>

---

## Environment Variables

```env
# Database
DB_USER=
DB_HOST=
DB_NAME=
DB_PASSWORD=
DB_PORT=5432
DB_SSL=true

# JWT
JWT_SECRET=
JWT_REFRESH_SECRET=
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d

# Redis
REDIS_URL=

# Session
SESSION_SECRET=

# Cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# MercadoPago
MERCADOPAGO_ACCESS_TOKEN=

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=

# Email (SMTP)
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=

# Application
NODE_ENV=production
FRONTEND_BASE_URL=https://yourdomain.com
PORT=3000

# Development only
FORCE_TENANT_ID=1
```

---

## Running Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

Test structure:

```
tests/
├── redis/                           # Redis Smart Fallback tests (82 tests)
│   ├── mock-client.test.js         # Mock client functionality (23 tests)
│   ├── fallback-system.test.js     # Fallback system integration (25 tests)
│   ├── rate-limiter.test.js        # Rate limiter with mock/real (16 tests)
│   ├── auth-integration.test.js    # Auth system integration (18 tests)
│   ├── jest.config.js              # Redis-specific Jest config
│   ├── setup.js                    # Test environment setup
│   └── README.md                   # Redis tests documentation
├── helpers/
│   ├── mockAuth.js                 # Token generation utilities
│   └── mockDb.js                   # Database mock factory
├── integration/
│   └── routes/
│       ├── auth.test.js
│       └── cupones.test.js
├── unit/
│   ├── middlewares/
│   │   ├── inputValidator.test.js
│   │   └── validateUserTenant.test.js
│   └── utils/
│       ├── jwtHelper.test.js
│       ├── validator.test.js
│       ├── skuGenerator.test.js
│       └── emailTemplates.test.js
└── setup.js
```

Current status: **168+ tests passing across 12+ suites.**

### Redis Smart Fallback Tests

```bash
# Run Redis tests specifically
npm test -- tests/redis/

# With coverage
npm test -- tests/redis/ --coverage
```

---

## Local Development

1. Clone the repository and install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in the required values. Set `FORCE_TENANT_ID=1` to bypass domain detection locally.

3. Ensure PostgreSQL and Redis are running and accessible.

4. Start the development server:

```bash
npm run dev
```

The application serves each tenant's frontend from `tenants_views/{tenant_folder}/` based on the resolved `tenant_id`.

---

## Documentation

Technical documentation is maintained in `docs/`:

| File | Contents |
|---|---|
| `ARQUITECTURA.md` | System architecture, middleware pipeline, data model |
| `ARCHITECTURE_AUDIT.md` | Engineering audit and refactoring decisions |
| `REDIS_SMART_FALLBACK.md` | **Redis Smart Fallback system - mock en desarrollo** |
| `TESTING_REDIS_FALLBACK.md` | **Guía completa de testing para Redis** |
| `FIFO_CASOS_DE_USO.md` | FIFO allocation logic and edge cases |
| `INVENTARIO_EXPLICACION.md` | Inventory system design |
| `AUDITORIA_MENSUAL_INVENTARIO.md` | Physical count reconciliation process |
| `CONCILIACION_INVENTARIO_REFACTOR.md` | Inventory reconciliation refactor notes |
| `SECURITY.md` | Security controls and threat model |

---

## License

Copyright (c) 2025–2026 xCore. All rights reserved.
