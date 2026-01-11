# RazoConnect by xCore

![Node.js](https://img.shields.io/badge/Node.js-v18+-green.svg)
![Express](https://img.shields.io/badge/Express-4.18.2-blue.svg)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-v17+-blue.svg)
![Bootstrap](https://img.shields.io/badge/Bootstrap-5.0-purple.svg)
![Azure](https://img.shields.io/badge/Azure-Cloud-0078D4.svg)

Sistema SaaS Multi-Tenant de E-commerce y gestión de inventario B2B diseñado para optimizar operaciones comerciales con aislamiento completo de datos por cliente.

## Descripción

RazoConnect es una plataforma integral desarrollada por la empresa xCore que permite a múltiples empresas (tenants) gestionar sus operaciones de venta, inventario, créditos y comisiones desde una única instancia de la aplicación, manteniendo un aislamiento total de datos entre clientes.

### Características Destacadas

- **Multi-Tenant**: Una instancia sirve múltiples clientes con dominios personalizados
- **E-commerce B2B**: Catálogo de productos, carrito, checkout y seguimiento de pedidos
- **Gestión de Inventario**: Órdenes de compra, recepción, movimientos y auditoría
- **Sistema de Créditos**: Líneas de crédito, CXC, alertas de vencimiento
- **Comisiones Automatizadas**: Cálculo y seguimiento de comisiones para agentes
- **Reportes Avanzados**: Ventas, inventario, comisiones con exportación a Excel

## Documentación

La documentación completa del sistema está organizada en los siguientes documentos:

### 1. [Arquitectura del Sistema](docs/ARQUITECTURA.md)

Documentación técnica detallada sobre la arquitectura Multi-Tenant:

- Stack tecnológico completo (Node.js, Express, PostgreSQL, Azure)
- Arquitectura Multi-Tenant con base de datos compartida
- Modelo de datos y relaciones entre tablas
- Seguridad en múltiples capas (Tenant Guard, JWT, validación de sesiones)
- Flujo de autenticación y autorización
- Middleware pipeline y orden de ejecución
- Diagramas de arquitectura y flujo de datos
- Consideraciones de escalabilidad

Guía completa de funcionalidades y flujos de negocio:

- Roles del sistema: Super Admin, Admin, Agente, Cliente
- Flujos de negocio principales (ventas, inventario, créditos, comisiones)
- Módulo de Ventas: catálogo, carrito, checkout, cupones
- Módulo de Inventario: órdenes de compra, recepción, movimientos
- Módulo de Créditos: CXC, límites, validaciones
- Módulo de Comisiones: cálculo automático, reportes
- Casos de uso detallados paso a paso

**Ideal para**: Administradores, usuarios finales y analistas de negocio.

## Tecnologías

### Backend
- **Runtime**: Node.js v18+
- **Framework**: Express.js 4.18.2
- **Base de Datos**: PostgreSQL v17+ (Azure Database)
- **Autenticación**: JWT + Passport.js (Google OAuth)
- **Sesiones**: express-session + connect-pg-simple
- **Tareas Programadas**: node-cron

### Frontend
- **Lenguaje**: JavaScript Vanilla (ES6+)
- **Framework CSS**: Bootstrap 5
- **Arquitectura**: Component-Based con inyección dinámica

### Infraestructura
- **Hosting**: Azure App Service
- **Base de Datos**: Azure Database for PostgreSQL
- **CDN de Imágenes**: Cloudinary
- **CI/CD**: GitHub Actions
- **Email**: Nodemailer (SMTP)
- **Pagos**: MercadoPago SDK

## Arquitectura Multi-Tenant

RazoConnect implementa un modelo Multi-Tenant con base de datos compartida y aislamiento por columna `tenant_id`:

- Una única instancia de la aplicación sirve a múltiples clientes
- Una única base de datos PostgreSQL con aislamiento por `tenant_id`
- Cada tenant tiene su propio dominio personalizado (ej: `razo.com.mx`, `fashion.com.mx`)
- Seguridad en múltiples capas: Tenant Guard, JWT, validación de sesiones
- Archivos estáticos aislados por tenant (carpetas `tenants_views/razo` y `tenants_views/fashion`)

### Detección de Tenant

El sistema detecta el tenant activo mediante:

1. **Por Dominio (Producción)**: Detecta automáticamente el tenant basándose en el dominio de la petición
2. **Por Variable de Entorno (Desarrollo)**: Usa `FORCE_TENANT_ID` para desarrollo local

### Roles del Sistema

- **Super Admin (Developer)**: Acceso completo a todos los tenants, gestión de la plataforma
- **Admin (Administrador de Tenant)**: Control completo de su tenant específico
- **Agente de Ventas**: Acceso a cartera de clientes y comisiones
- **Cliente**: Acceso a catálogo, carrito y pedidos propios

## Estructura del Proyecto

```
RazoConnect/
├── config/              # Configuración (Passport, Cloudinary, Domain Mapper)
├── controllers/         # Lógica de negocio
│   ├── admin/          # Controladores de admin
│   └── clientes/       # Controladores de clientes
├── cron/               # Tareas programadas
├── docs/               # Documentación técnica
├── middlewares/        # Middlewares personalizados
├── routes/             # Definición de rutas
├── services/           # Servicios de negocio
├── tenants_views/      # Vistas por tenant
│   ├── razo/          # Tema Razo
│   └── fashion/       # Tema Fashion
├── utils/              # Utilidades
├── .env                # Variables de entorno (no versionado)
├── db.js               # Configuración de PostgreSQL
├── index.js            # Punto de entrada de la aplicación
└── package.json        # Dependencias
```

## Módulos Principales

### Gestión de Ventas
- Catálogo de productos con variantes (tamaños, colores, dimensiones)
- Sistema de packs configurables (venta por unidad, 6, 12, 24, etc.)
- Carrito de compras con validación de stock en tiempo real
- Sistema de cupones de descuento
- Checkout con múltiples direcciones de envío
- Seguimiento de pedidos con estados (Pendiente, Surtido, Enviado, Entregado)

### Gestión de Inventario
- Órdenes de compra a proveedores
- Recepción de inventario con validación de reglas de empaque
- Movimientos de inventario (entradas, salidas, ajustes)
- Auditoría completa de movimientos
- Alertas de stock bajo

### Sistema de Créditos
- Líneas de crédito configurables por cliente
- Validación automática de límites en cada compra
- Cuentas por cobrar (CXC) con fechas de vencimiento
- Alertas de deudas próximas a vencer
- Registro de pagos y liberación de crédito

### Comisiones de Agentes
- Cálculo automático de comisiones al entregar pedidos
- Esquemas de comisión configurables por agente
- Dashboard para agentes con métricas de ventas
- Gestión de cartera de clientes asignados
- Reportes de comisiones pagadas y pendientes

### Reportes y Análisis
- Reportes de ventas por período
- Inventario valorizado
- Análisis de clientes y productos más vendidos
- Comisiones de agentes
- Exportación a Excel con formato profesional

## Seguridad

El sistema implementa múltiples capas de seguridad:

1. **Tenant Guard**: Middleware que detecta y valida el tenant en cada petición
2. **Autenticación JWT**: Tokens con expiración de 7 días
3. **Validación de Tenant**: Verifica que usuarios autenticados pertenezcan al tenant correcto
4. **Aislamiento de Datos**: Todas las queries incluyen filtro por `tenant_id`
5. **Sesiones Persistentes**: Almacenadas en PostgreSQL con aislamiento por dominio
6. **HTTPS**: Forzado en producción con certificados SSL de Azure

### Tareas Automatizadas
El sistema ejecuta diariamente:
- Limpieza de sesiones expiradas
- Verificación de deudas vencidas
- Alertas de stock bajo
- Generación de reportes automáticos


## Licencia

Este proyecto está bajo la Licencia ISC y es desarrollado por xCore.
