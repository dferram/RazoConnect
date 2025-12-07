# RazoConnect

RazoConnect es una plataforma de e-commerce orientada a la venta al mayoreo de cajas de fashion. Está diseñada para cubrir los flujos comerciales típicos de un negocio B2B/B2C mayorista: catálogo por paquetes, gestión de inventario con auditoría, procesamiento de pedidos, panel administrativo completo y un sistema de agentes con comisiones.

## Tabla de Contenidos
- [Propósito y Enfoque](#propósito-y-enfoque)
- [Características Principales](#características-principales)
- [Instalación y Configuración](#instalación-y-configuración)
- [Arquitectura del Backend](#arquitectura-del-backend)
- [Frontend](#frontend)
- [Endpoints API](#endpoints-api)
- [Seguridad](#seguridad)
- [Licencia](#licencia)

## Propósito y enfoque

- Proveer una API RESTful y una interfaz administrativa que permitan gestionar catálogo, stock, órdenes y comisiones de agentes.
- Facilitar operaciones mayoristas por paquetes (piezas por paquete, precio por paquete, control de stock en unidades de paquete).
- Mantener trazabilidad y auditoría de cambios de inventario y operaciones críticas mediante transacciones atómicas y logs.

## Características principales

- **API RESTful** construida con Node.js y Express
- **Persistencia** con PostgreSQL (modelo relacional)
- **Autenticación** basada en JWT con roles diferenciados (clientes, agentes, administradores)
- **Encriptación** segura de contraseñas con bcrypt
- **Gestión completa de inventario** con registro de movimientos (Log_Inventario)
- **Panel administrativo** con estadísticas en tiempo real, gestión de pedidos, productos, agentes y comisiones
- **Sistemas de validación** y reglas de negocio (unicidad de SKU, códigos de agente, stock no negativo)
- **Soporte para backorders** y recepción parcial/total de ordenes de compra
- **Endpoints orientados a auditoría** y operaciones atómicas (BEGIN/COMMIT/ROLLBACK)
- **Frontend responsive** con HTML, CSS y JavaScript vanilla

## Instalación y Configuración

### Requisitos Previos
- Node.js (v14 o superior)
- PostgreSQL (v12 o superior)
- npm o yarn

### Pasos de Instalación

1. **Clonar el repositorio**
```bash
git clone <repository-url>
cd RazoConnect
```

2. **Instalar dependencias**
```bash
npm install
```

3. **Configurar variables de entorno**

Crea un archivo `.env` en la raíz del proyecto con las siguientes variables:

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=razoconnect
DB_USER=postgres
DB_PASSWORD=tu_password

# JWT
JWT_SECRET=tu_secreto_jwt_seguro

# Email
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=tu_email@gmail.com
EMAIL_PASS=tu_password_de_app

# Frontend
FRONTEND_BASE_URL=http://localhost:3000

# Admin
SUPER_ADMIN_KEY=tu_clave_super_admin

# Server
PORT=3000
```

4. **Configurar la base de datos**

Ejecuta el script SQL para crear las tablas:
```bash
psql -U postgres -d razoconnect -f "BD V01.sql"
```

5. **Iniciar el servidor**

```bash
# Modo desarrollo (con nodemon)
npm run dev

# Modo producción
npm start
```

El servidor estará disponible en `http://localhost:3000`

### Scripts de Inicio

También puedes usar los scripts proporcionados:
- **Windows PowerShell**: `.\start.ps1`
- **Windows Batch**: `start.bat`

## Arquitectura del Backend

### Estructura del Proyecto

```
RazoConnect/
├── controllers/        # Lógica de negocio por dominio
│   ├── authController.js
│   ├── adminController.js
│   ├── productosController.js
│   ├── carritoController.js
│   ├── pedidosController.js
│   └── ...
├── routes/            # Definición de rutas
│   ├── auth.js
│   ├── admin.js
│   ├── productos.js
│   └── ...
├── middlewares/       # Middlewares de autenticación y autorización
│   └── auth.js
├── services/          # Servicios de utilidad
│   └── emailService.js
├── utils/             # Utilidades generales
│   └── jwtHelper.js
├── public/            # Frontend estático
├── db.js              # Configuración de PostgreSQL
├── index.js           # Punto de entrada del servidor
└── package.json
```

### Principales dominios y flujos de negocio

#### Usuarios
- **Clientes**: navegación de catálogo, carrito y proceso de pedido
- **Agentes**: registro de ventas que generan comisiones
- **Administradores**: control y operación del sistema (confirmar pedidos, ajustar inventario, pagar comisiones)

#### Catálogo y productos
- Productos con SKU, piezas por paquete, costo unitario, precio por paquete y stock
- Cálculo automático de margen y ganancia a nivel de paquete
- Variantes con medidas y tamaños disponibles

#### Pedidos
- Estados: Pendiente, Confirmado, Enviado, Entregado, Cancelado
- Confirmación de pedido: verificación de stock, decremento de inventario y registro en log en una transacción atómica
- Gestión de direcciones de envío normalizadas por estado

#### Inventario
- Ajustes con motivo y tipo (Entrada/Salida)
- Prevención de stock negativo y registro en Log_Inventario
- Recepción de órdenes de compra para cubrir backorders
- Auditoría completa de movimientos

#### Comisiones y agentes
- Registro de agentes con código único
- Métricas de ventas y comisiones acumuladas
- Flujo para marcar comisiones como pagadas
- Evitar pagos duplicados
- Dashboard de agente con estadísticas

#### Auditoría
- Log de movimientos de inventario con ProductoID, TipoMovimiento, Cantidad, Motivo, UsuarioID y timestamp
- Trazabilidad completa de operaciones críticas

### Reglas críticas y garantías

- Operaciones críticas (confirmar pedidos, ajustes de inventario) se ejecutan dentro de transacciones atómicas: se revierte todo si alguna parte falla
- Validaciones de negocio en backend: unicidad (SKU/email/código de agente), stock no negativo, estados válidos y permisos por rol
- Prevención de condiciones de carrera en la manipulación de stock (control de concurrencia a nivel de BD/restricciones según implementación)

## Frontend

El frontend es una aplicación web estática construida con HTML, CSS y JavaScript vanilla (sin frameworks). Se conecta a la API RESTful del backend.

### Estructura del Frontend

```
public/
├── css/
│   ├── styles.css          # Estilos globales
│   └── admin.css           # Estilos del panel admin
├── js/
│   ├── api.js              # Funciones de utilidad para API
│   ├── auth-guard-admin.js # Protección de rutas
│   ├── token-refresh.js    # Renovación de tokens
│   └── admin-reportes.js   # Lógica de reportes
├── index.html              # Página de bienvenida
├── login.html              # Login unificado
├── registro.html           # Registro de clientes
├── dashboard.html          # Catálogo de productos
├── producto-detalle.html   # Detalle de producto
├── carrito.html            # Carrito de compras
│
├── admin-dashboard.html        # Panel principal
├── admin-pedidos.html          # Gestión de pedidos
├── admin-clientes.html         # Lista de clientes
├── admin-cliente-detalle.html  # Perfil del cliente
├── admin-agentes.html          # Gestión de agentes
├── admin-agente-detalle.html   # Detalle del agente
├── admin-agregar-producto.html # Alta de productos
├── admin-inventario.html       # Kardex y ajustes
├── admin-comisiones.html       # Gestión de comisiones
├── admin-proveedores.html      # Gestión de proveedores
├── admin-crear-oc.html         # Creación de OC
├── admin-recibir-inventario.html # Recepción de inventario
└── admin-reportes.html         # Reportes financieros
```

### Características del Frontend

#### 🔐 Autenticación
- Login unificado para clientes y administradores
- Registro de clientes con validación en tiempo real
- Almacenamiento de JWT en localStorage
- Renovación automática de tokens para sesiones admin
- Protección de rutas mediante `auth-guard-admin.js`

#### 📦 Catálogo y Productos (Cliente)
- Dashboard con listado de productos disponibles
- Vista detallada de cada producto con galería de imágenes
- Selector de cantidad de paquetes con validación de stock
- Sistema de "Agregar al Carrito" integrado

#### 🛒 Carrito de Compras
- Vista del carrito con lista de productos agregados
- Cálculo automático de subtotales y total
- Información de piezas totales por producto
- Proceso de checkout con selección de dirección de envío

#### 🛠️ Panel Administrador
- **Dashboard**: Widgets de métricas clave (pedidos, ingresos, clientes, agentes, valor de inventario)
- **Gestión de Pedidos**: Tabla con filtros y modal de detalle completo
- **Clientes y Agentes**: Listados con funciones de activación/desactivación y dashboards individuales
- **Inventario**: Kardex completo, ajustes de stock y gestión de órdenes de compra
- **Reportes**: Rentabilidad, valuación de inventario y aging de backorders
- **Comisiones**: Gestión y pago de comisiones a agentes

#### 🎨 Componentes y Diseño
- Tarjetas de estadísticas con iconos degradados
- Estados vacíos estilizados (empty states) reutilizables
- Sistema de notificaciones toast personalizado
- Estados de loading para operaciones asíncronas
- Diseño responsive adaptable a dispositivos móviles

### API Helper (`js/api.js`)

El módulo `api.js` proporciona funciones de utilidad para todas las llamadas a la API:

**Autenticación:**
- `saveAuthData(token, userData)` - Guardar datos de sesión
- `getToken()` - Obtener token JWT
- `isAuthenticated()` - Verificar autenticación
- `clearAuthData()` - Limpiar sesión
- `requireAuth()` - Requerir autenticación (redirige si no está logueado)

**Llamadas API:**
- Productos: `API.getProductos()`, `API.getProductoById(id)`
- Carrito: `API.getCarrito()`, `API.agregarAlCarrito(productoId, cantidadPaquetes)`
- Pedidos: `API.crearPedido(direccionEnvioId)`
- Utilidades: `showToast(message, type)` para notificaciones

### Configuración API

Por defecto, el frontend se conecta a `http://localhost:3000/api`. Para cambiar la URL, edita `public/js/api.js` línea 2.

### Validaciones Implementadas

**Formularios:**
- Formato de email
- Contraseña (mínimo 6 caracteres)
- Confirmación de contraseña
- Campos requeridos
- Validación en tiempo real

**Carrito:**
- Validación de stock disponible
- Cantidad mínima (1 paquete)
- Actualización automática si producto ya está en carrito

### Flujo de Usuario

1. Usuario llega a `index.html` (página de bienvenida)
2. Se registra en `registro.html` o inicia sesión en `login.html`
3. Después del login exitoso, se redirige a `dashboard.html`
4. Explora el catálogo de productos
5. Hace clic en un producto para ver `producto-detalle.html`
6. Selecciona cantidad y agrega productos al carrito
7. Ve su carrito en `carrito.html` con todos los productos agregados
8. Procede a finalizar el pedido

## Endpoints API

### Salud y Prueba
- `GET /api` — bienvenida
- `GET /api/health` — estado del servidor y BD

### Autenticación
- `POST /api/registro/cliente` — registrar cliente
- `POST /api/registro/agente` — registrar agente
- `POST /api/login` — login (clientes/agentes/admins, con flujo que detecta rol)

### Administración (protegido, JWT admin)
- `GET /api/admin/dashboard-stats` — estadísticas del dashboard
- `GET /api/admin/pedidos` — listar pedidos
- `PUT /api/admin/pedidos/:id` — cambiar estatus (incluye lógica de confirmación)
- `POST /api/admin/productos` — crear producto
- `GET /api/admin/productos` — listar productos
- `POST /api/admin/inventario/ajuste` — ajustar stock con log
- `GET /api/admin/agentes` — listar agentes
- `POST /api/admin/agentes` — crear agente
- `GET /api/admin/comisiones` — listar comisiones
- `PUT /api/admin/comisiones/:id/pagar` — marcar comisión como pagada
- `GET /api/admin/reportes/rentabilidad` — reporte de rentabilidad
- `GET /api/admin/reportes/valuacion-inventario` — valuación de inventario
- `GET /api/admin/reportes/aging-backorders` — aging de backorders

### Productos (público/protegido según endpoint)
- `GET /api/productos` — listar productos
- `GET /api/productos/:id` — detalle de producto

### Carrito (protegido, JWT cliente)
- `GET /api/carrito` — obtener carrito
- `POST /api/carrito` — agregar producto al carrito
- `DELETE /api/carrito/:itemId` — eliminar item del carrito

### Pedidos (protegido, JWT cliente)
- `POST /api/pedidos` — crear pedido
- `GET /api/pedidos` — listar pedidos del cliente

### Agentes (protegido, JWT agente)
- `GET /api/agente/dashboard-stats` — estadísticas del agente
- `GET /api/agente/comisiones` — comisiones del agente
- `GET /api/agente/pedidos` — pedidos del agente

## Seguridad

### Backend
- Contraseñas hasheadas con bcrypt (configurable rounds)
- JWT para autenticación con tokens separados por rol para evitar confusiones entre sesión cliente y admin
- Variables sensibles gestionadas fuera del código fuente (por ejemplo: .env)
- CORS configurado según necesidades del frontend
- Registro de quién realizó cambios relevantes (UserID) en Log_Inventario para auditoría
- Validación de SUPER_ADMIN_KEY para registro de administradores

### Frontend
- JWT almacenado en localStorage con clave `razoconnect_token`
- Verificación de autenticación en rutas protegidas con `requireAuth()`
- Headers de autorización agregados automáticamente en llamadas API
- Tokens expirados redirigen automáticamente al login

## Tecnologías y dependencias principales

### Backend
- Node.js, Express
- PostgreSQL, módulo pg
- bcrypt (hashing de contraseñas)
- jsonwebtoken (gestión de JWT)
- cors, dotenv
- nodemailer (envío de emails)

### Frontend
- HTML5, CSS3, JavaScript vanilla
- Sin frameworks (sin build process)
- Compatible con todos los navegadores modernos

## Dashboard y experiencia administrativa

El panel de administración está diseñado para ofrecer:
- Estadísticas en tiempo real (pedidos totales, ingresos, clientes activos, agentes, productos con stock bajo, valor de inventario)
- Gestión granular de pedidos con validaciones y modales para cambios de estado
- Gestión completa del catálogo (creación con cálculo de margen y SKU único)
- Gestión de inventario con logs y motivos de ajuste
- Gestión de agentes y flujo de pago de comisiones con trazabilidad
- Reportes financieros (rentabilidad, valuación, aging de backorders)

## Estado del proyecto y prioridades

### Estado Actual
- Implementación completa de módulos principales (autenticación, catálogo, carrito, pedidos, inventario, agentes y comisiones)
- Panel administrativo funcional con reportes
- Dashboard de agentes con estadísticas y comisiones
- Sistema de backorders y órdenes de compra

### Prioridades sugeridas
- Generación de reportes en formatos (PDF/Excel)
- Integración de pasarelas de pago
- Tracking de envíos y estados logísticos
- Tests unitarios y de integración para las reglas críticas
- Preparación para despliegue en entornos productivos
- Optimización de consultas de base de datos

## Audiencia objetivo
- Equipos de operaciones y logística de comercios mayoristas
- Administradores que requieren control de inventario y trazabilidad
- Agentes comerciales que requieren registro de ventas y cobro de comisiones
- Clientes mayoristas que compran por paquetes

## Licencia y autoría
- **Licencia**: ISC
- **Desarrollado por**: Fernando Ramírez

---

Para más información o soporte, contacta al equipo de desarrollo.
