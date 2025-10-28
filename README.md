# RazoConnect - Sistema E-Commerce

Sistema de e-commerce desarrollado con Node.js, Express y PostgreSQL.

## 🚀 Características

- API RESTful con Express
- Base de datos PostgreSQL
- Autenticación con JWT
- Encriptación de contraseñas con Bcrypt
- CORS habilitado

## 📋 Requisitos Previos

- Node.js (v14 o superior)
- PostgreSQL (v12 o superior)
- npm o yarn

## 🔧 Instalación

1. **Clonar el repositorio**
   ```bash
   git clone <url-del-repositorio>
   cd "Proyecto Pedidos"
   ```

2. **Instalar dependencias**
   ```bash
   npm install
   ```

3. **Configurar variables de entorno**
   - Copiar el archivo `.env.example` a `.env`
   - Editar `.env` con tus credenciales de base de datos

4. **Crear la base de datos**
   ```sql
   CREATE DATABASE razoconnect;
   ```

5. **Ejecutar el script de base de datos**
   - Ejecutar el archivo `BD V01.sql` en PostgreSQL

## 🚀 Ejecución

### Modo Desarrollo
```bash
npm run dev
```

### Modo Producción
```bash
npm start
```

El servidor estará disponible en: `http://localhost:3000`

### 🎯 Inicio Rápido para Administrador

1. **Crear administrador inicial:**
   ```bash
   node insert-admin.js
   ```
   Esto creará un administrador con:
   - Email: `admin@razoconnect.com`
   - Password: `Admin123!`

2. **Acceder al panel:**
   - Ir a: `http://localhost:3000/login.html`
   - Ingresar credenciales de admin
   - El sistema detectará automáticamente que eres admin
   - Redirigirá a: `http://localhost:3000/admin-dashboard.html`

3. **Explorar funcionalidades:**
   - Dashboard con estadísticas
   - Gestión de pedidos
   - Crear productos
   - Ajustar inventario
   - Gestionar agentes
   - Pagar comisiones

## 📚 Endpoints Disponibles

### Endpoints de Prueba

- **GET** `/api` - Endpoint de bienvenida
- **GET** `/api/health` - Verificar estado del servidor y base de datos

### Endpoints de Autenticación

- **POST** `/api/registro/cliente` - Registrar nuevo cliente
  ```json
  {
    "Nombre": "Juan",
    "Apellido": "Pérez",
    "Email": "juan@example.com",
    "Password": "password123",
    "Telefono": "5551234567"
  }
  ```

- **POST** `/api/registro/agente` - Registrar nuevo agente de ventas
  ```json
  {
    "Nombre": "María",
    "Apellido": "González",
    "Email": "maria@razoconnect.com",
    "Password": "agente123",
    "CodigoAgente": "AG001"
  }
  ```

- **POST** `/api/login` - Iniciar sesión (cliente o agente)
  ```json
  {
    "Email": "juan@example.com",
    "Password": "password123"
  }
  ```

**📖 Ver documentación completa en:** [API_AUTH_DOCS.md](./API_AUTH_DOCS.md)

## 📁 Estructura del Proyecto

```
RazoConnect/
├── index.js                    # Archivo principal del servidor
├── db.js                       # Configuración de PostgreSQL
├── package.json                # Dependencias del proyecto
├── .env                        # Variables de entorno (no versionar)
├── .env.example                # Ejemplo de variables de entorno
├── .gitignore                  # Archivos ignorados por git
├── README.md                   # Documentación completa
├── insert-admin.js             # Script para crear admin inicial
│
├── routes/
│   ├── auth.js                 # Rutas de autenticación
│   ├── admin.js                # Rutas del panel admin
│   ├── productos.js            # Rutas de productos
│   ├── carrito.js              # Rutas del carrito
│   ├── direcciones.js          # Rutas de direcciones
│   └── pedidos.js              # Rutas de pedidos
│
├── controllers/
│   ├── authController.js       # Controlador de autenticación
│   ├── adminController.js      # Controlador admin (16 funciones)
│   ├── productosController.js  # Controlador de productos
│   ├── carritoController.js    # Controlador del carrito
│   ├── direccionesController.js# Controlador de direcciones
│   └── pedidosController.js    # Controlador de pedidos
│
├── middlewares/
│   └── authMiddleware.js       # JWT + authorize admin
│
├── public/                     # Archivos estáticos
│   ├── index.html              # Landing page
│   ├── login.html              # Login unificado (cliente/admin)
│   ├── registro.html           # Registro de clientes
│   ├── catalogo.html           # Catálogo de productos
│   ├── carrito.html            # Carrito de compras
│   ├── checkout.html           # Proceso de pago
│   ├── dashboard.html          # Dashboard del cliente
│   ├── pedido-confirmado.html  # Confirmación de pedido
│   │
│   ├── admin-login.html        # Login admin (opcional)
│   ├── admin-dashboard.html    # Dashboard admin
│   ├── admin-pedidos.html      # Gestión de pedidos
│   ├── admin-agregar-producto.html # Crear productos
│   ├── admin-inventario.html   # Gestión de inventario
│   ├── admin-agentes.html      # Gestión de agentes
│   ├── admin-agente-detalle.html # Detalle de agente
│   ├── admin-comisiones.html   # Gestión de comisiones
│   │
│   ├── css/
│   │   ├── styles.css          # Estilos principales
│   │   └── admin.css           # Estilos del panel admin
│   │
│   └── js/
│       └── api.js              # Funciones de API
│
└── BD V01.sql                  # Script de base de datos
```

## 🔐 Seguridad

- Las contraseñas se encriptan con Bcrypt
- Autenticación mediante JWT
- Variables sensibles en archivo `.env`
- CORS configurado

## 🛠️ Tecnologías

- **Node.js** - Entorno de ejecución
- **Express** - Framework web
- **PostgreSQL** - Base de datos
- **pg** - Cliente PostgreSQL para Node.js
- **bcrypt** - Encriptación de contraseñas
- **jsonwebtoken** - Autenticación JWT
- **cors** - Manejo de CORS
- **dotenv** - Variables de entorno

## 🆕 Nuevas Funcionalidades Implementadas

### 🔐 Login Unificado (Cliente y Administrador)
**URL:** `http://localhost:3000/login.html`

El sistema ahora cuenta con un **login inteligente** que detecta automáticamente si el usuario es un cliente o un administrador:

**Flujo de Autenticación:**
1. Usuario ingresa email y contraseña
2. Sistema intenta login como **Cliente**
   - ✅ Si es exitoso → Redirige a `/catalogo.html`
3. Si falla, intenta login como **Administrador**
   - ✅ Si es exitoso → Redirige a `/admin-dashboard.html`
4. Si ambos fallan → Muestra "Credenciales inválidas"

**Credenciales de Administrador:**
```
Email: admin@razoconnect.com
Password: Admin123!
```

**Tokens Separados:**
- Clientes: `razoconnect_token` y `razoconnect_user`
- Admins: `razoconnect_admin_token` y `razoconnect_admin`

---

### 📊 Panel de Administrador Completo

#### 1. Dashboard (`/admin-dashboard.html`)
**Endpoint:** `GET /api/admin/dashboard-stats`

**Estadísticas en Tiempo Real:**
- 📦 Total de pedidos
- 💰 Ingresos totales
- 👥 Clientes activos
- 💼 Agentes activos
- ⚠️ Pedidos pendientes
- 💵 Comisiones pendientes
- 📉 Productos con stock bajo (≤5)

**Características:**
- Cards con iconos y colores
- Actualización automática
- Alerta si hay productos con stock bajo
- Tabla de pedidos recientes

---

#### 2. Gestión de Pedidos (`/admin-pedidos.html`)
**Endpoints:**
- `GET /api/admin/pedidos` - Listar todos los pedidos
- `PUT /api/admin/pedidos/:id` - Cambiar estatus

**Funcionalidades:**
- ✅ Lista completa de pedidos con información del cliente
- ✅ Filtro por estatus (Pendiente, Confirmado, Enviado, Entregado, Cancelado)
- ✅ Modal para cambiar estatus
- ✅ Badges de colores según estado
- ✅ Información de agente (si aplica)

**⚠️ Lógica Crítica al Confirmar Pedido:**
Cuando se cambia un pedido a **"Confirmado"**, el sistema automáticamente:
1. Verifica stock disponible de cada producto
2. Reduce `Stock` en tabla `Productos`
3. Crea registro en `Log_Inventario`:
   - TipoMovimiento: `'Salida'`
   - Cantidad: Paquetes del pedido
   - Motivo: `"Pedido #X confirmado"`
   - UsuarioID: AdminID del usuario que confirmó
4. Todo en una **transacción atómica** (ROLLBACK si falla)

**Validaciones:**
- No permite confirmar si no hay stock suficiente
- No permite confirmar dos veces el mismo pedido
- Muestra mensaje de error específico con stock actual

---

#### 3. Gestión de Catálogo e Inventario

##### A) Agregar Producto (`/admin-agregar-producto.html`)
**Endpoint:** `POST /api/admin/productos`

**Formulario Completo:**
- SKU (único)
- Nombre del producto
- Descripción
- Costo unitario (MXN)
- Piezas por paquete
- Precio por paquete (MXN)
- Stock inicial
- Categoría (selector dinámico)
- URL de imagen

**Características Especiales:**
- ✅ **Cálculo automático de margen de ganancia:**
  - Costo total = Costo unitario × Piezas por paquete
  - Ganancia = Precio de paquete - Costo total
  - Margen % = (Ganancia / Precio) × 100
  - Actualización en tiempo real
- ✅ Validación de SKU único
- ✅ Registro automático en `Log_Inventario` (stock inicial)

**Ejemplo de Registro en Log:**
```sql
INSERT INTO Log_Inventario (ProductoID, TipoMovimiento, Cantidad, Motivo, UsuarioID)
VALUES (1, 'Entrada', 100, 'Stock inicial del producto', 1)
```

##### B) Gestión de Inventario (`/admin-inventario.html`)
**Endpoints:**
- `GET /api/admin/productos` - Listar productos
- `POST /api/admin/inventario/ajuste` - Ajustar stock

**Tabla de Productos:**
- SKU
- Nombre y categoría
- Precio por paquete
- Piezas por paquete
- **Stock actual** (destacado en naranja)
- Estado con badges:
  - 🟢 Verde: Stock normal
  - 🟡 Amarillo: Stock bajo (≤5)
  - 🔴 Rojo: Sin stock (0)

**Modal de Ajuste de Inventario:**

Campos:
- Tipo de ajuste: **Entrada** ➕ o **Salida** ➖
- Cantidad (paquetes)
- Motivo del ajuste:
  - Recepción de Almacén
  - Ajuste de Inventario
  - Devolución de Cliente
  - Producto Dañado
  - Merma
  - Otro (campo libre)

**Ejemplo de Uso:**
```json
{
  "productoId": 5,
  "cantidadCambio": 50,  // Positivo = Entrada, Negativo = Salida
  "motivo": "Recepción de Almacén"
}
```

**Proceso de Ajuste:**
1. Valida que el producto existe
2. Calcula nuevo stock
3. Valida que no sea negativo
4. Actualiza `Productos.Stock`
5. Determina `TipoMovimiento`:
   - `cantidadCambio > 0` → `'Entrada'`
   - `cantidadCambio < 0` → `'Salida'`
6. Crea registro en `Log_Inventario` con AdminID
7. Todo en transacción atómica

**Búsqueda:**
- Filtro en tiempo real por nombre o SKU
- Sin necesidad de recargar la página

---

#### 4. Gestión de Agentes y Comisiones

##### A) Gestión de Agentes (`/admin-agentes.html`)
**Endpoints:**
- `GET /api/admin/agentes` - Listar agentes con estadísticas
- `POST /api/admin/agentes` - Crear nuevo agente
- `PUT /api/admin/agentes/:id/desactivar` - Desactivar agente (soft delete)

**Formulario de Creación:**
```json
{
  "nombre": "Juan",
  "apellido": "Pérez",
  "email": "juan@ejemplo.com",
  "password": "password123",
  "codigoAgente": "AG001",
  "telefono": "5551234567"
}
```

**Características:**
- ✅ Hash bcrypt automático de contraseña (10 rounds)
- ✅ Validación de email único
- ✅ Validación de código de agente único
- ✅ Todos los campos obligatorios excepto teléfono

**Tabla de Agentes:**
Columnas:
- Nombre completo
- Email
- Código de agente
- **Total de ventas** (número de pedidos)
- **Monto total vendido**
- **Comisiones acumuladas**
- Estado (Activo/Inactivo)
- Acciones:
  - Botón "Ver Detalle"
  - Botón "Desactivar" (soft delete)

**Soft Delete:**
- Cambia `Activo = FALSE`
- No elimina físicamente el registro
- Preserva historial de ventas y comisiones
- Requiere confirmación del admin

##### B) Detalle de Agente (`/admin-agente-detalle.html?id=X`)
**Endpoint:** `GET /api/admin/agentes/:id`

**Información Mostrada:**

1. **Perfil del Agente:**
   - Nombre completo
   - Email
   - Código de agente
   - Teléfono
   - Estado (badge)
   - Fecha de creación

2. **Estadísticas:**
   - Total de ventas realizadas
   - Comisiones totales acumuladas

3. **Tabla de Ventas:**
   - #Pedido
   - Cliente que compró
   - Fecha de la venta
   - Monto total
   - Estado del pedido
   - Ordenada por fecha DESC

4. **Tabla de Comisiones:**
   - #Comisión
   - #Pedido relacionado
   - Monto de comisión
   - Estado (Pendiente/Pagada)
   - Fecha de generación
   - Fecha de pago (si aplica)
   - Ordenada por fecha DESC

**Navegación:**
- Botón "← Volver a Agentes" en el header
- Links a páginas relacionadas

##### C) Gestión de Comisiones (`/admin-comisiones.html`)
**Endpoints:**
- `GET /api/admin/comisiones?estatus=Pendiente` - Listar comisiones (con filtro)
- `PUT /api/admin/comisiones/:id/pagar` - Marcar comisión como pagada

**Estadísticas en Cards:**
- ⏳ Comisiones pendientes (cantidad)
- 💰 Monto total por pagar
- ✓ Comisiones pagadas (cantidad)
- 💵 Monto total pagado

**Filtro por Estatus:**
- Todos
- Pendiente (default)
- Pagada

**Tabla de Comisiones:**
Columnas:
- #Comisión
- Agente (nombre completo)
- Código de agente
- #Pedido relacionado
- Monto de la venta
- **Monto de la comisión** (verde, destacado)
- Estado (badge amarillo/verde)
- Fecha de generación
- Fecha de pago

**Acción de Pagar:**
1. Botón "Pagar" (verde) para comisiones pendientes
2. Confirmación: `"¿Pagar $1,000 a Juan Pérez?"`
3. Sistema verifica:
   - Comisión existe ✓
   - Estado es `'Pendiente'` ✓
4. Actualiza:
   ```sql
   UPDATE Comisiones_Agentes 
   SET Estatus = 'Pagada', 
       FechaPago = CURRENT_TIMESTAMP
   WHERE ComisionID = X
   ```
5. No permite pagar dos veces la misma comisión
6. Actualiza estadísticas automáticamente

---

### 📁 Estructura de Archivos del Panel Admin

```
public/
├── admin-login.html              # Login exclusivo admin (opcional ahora)
├── admin-dashboard.html          # Dashboard principal con stats
├── admin-pedidos.html            # Gestión de pedidos
├── admin-agregar-producto.html   # Formulario crear producto
├── admin-inventario.html         # Gestión de inventario
├── admin-agentes.html            # Gestión de agentes
├── admin-agente-detalle.html     # Detalle individual de agente
├── admin-comisiones.html         # Gestión de comisiones
└── css/
    └── admin.css                 # Estilos del panel admin

controllers/
└── adminController.js            # 16 funciones de admin

routes/
└── admin.js                      # Todas las rutas protegidas
```

---

### 🔒 Seguridad del Panel Admin

**Autenticación:**
- JWT separado para admins
- Middleware `authenticate` verifica token válido
- Middleware `authorizeAdmin` verifica `tipo === 'admin'`
- Tokens almacenados en `localStorage`

**Validaciones Backend:**
- Campos requeridos
- Unicidad (SKU, email, código agente)
- Stock no negativo
- Estados válidos
- Permisos de rol

**Transacciones Atómicas:**
- Confirmar pedidos (reduce stock)
- Ajustar inventario
- Todo con BEGIN/COMMIT/ROLLBACK

**Auditoría:**
- Tabla `Log_Inventario` registra:
  - ProductoID
  - TipoMovimiento (Entrada/Salida)
  - Cantidad
  - Motivo
  - **UsuarioID** (AdminID que hizo el cambio)
  - FechaMovimiento (automático)

---

### 🎨 Diseño del Panel Admin

**Colores de la Marca:**
- Primario: `#FF6B35` (Naranja Razo)
- Secundario: `#00D9C0` (Turquesa)
- Fondo: `#F8F9FA`
- Texto: `#2D3748`

**Componentes:**
- Sidebar fijo con navegación
- Cards con iconos y colores
- Badges de estado
- Modales para acciones
- Tablas responsivas
- Spinners de carga
- Toast notifications

**Estados Visuales:**
```css
.admin-badge.success  /* Verde - Activo, Pagado, Normal */
.admin-badge.warning  /* Amarillo - Pendiente, Stock Bajo */
.admin-badge.danger   /* Rojo - Inactivo, Sin Stock */
.admin-badge.info     /* Azul - Información general */
```

---

### 🚀 URLs del Sistema Completo

#### Público
- `http://localhost:3000/` - Landing page
- `http://localhost:3000/login.html` - Login unificado (clientes y admins)
- `http://localhost:3000/registro.html` - Registro de clientes

#### Cliente (Requiere JWT Cliente)
- `http://localhost:3000/catalogo.html` - Catálogo de productos
- `http://localhost:3000/carrito.html` - Carrito de compras
- `http://localhost:3000/checkout.html` - Proceso de pago
- `http://localhost:3000/dashboard.html` - Dashboard del cliente

#### Administrador (Requiere JWT Admin)
- `http://localhost:3000/admin-dashboard.html` - Dashboard principal
- `http://localhost:3000/admin-pedidos.html` - Gestión de pedidos
- `http://localhost:3000/admin-agregar-producto.html` - Crear producto
- `http://localhost:3000/admin-inventario.html` - Gestión de inventario
- `http://localhost:3000/admin-agentes.html` - Gestión de agentes
- `http://localhost:3000/admin-agente-detalle.html?id=X` - Detalle de agente
- `http://localhost:3000/admin-comisiones.html` - Gestión de comisiones

---

## 📝 Tareas Completadas

1. ✅ Crear estructura de carpetas para routes, controllers, models
2. ✅ Implementar autenticación de usuarios (registro y login)
3. ✅ Crear endpoints para gestión de productos
4. ✅ Implementar gestión del carrito de compras
5. ✅ Implementar gestión de pedidos
6. ✅ Crear endpoints para direcciones de envío
7. ✅ Implementar panel de agentes (comisiones)
8. ✅ **Panel de administrador completo**
9. ✅ **Dashboard con estadísticas en tiempo real**
10. ✅ **Gestión de inventario con auditoría**
11. ✅ **Sistema de comisiones para agentes**
12. ✅ **Login unificado inteligente**

## 🔮 Próximos Pasos Sugeridos

1. Reportes en PDF/Excel
2. Notificaciones por email
3. Gestión de clientes desde admin
4. Dashboard de agente (ver sus propias ventas)
5. Tracking de envíos
6. Tests unitarios e integración
7. Deploy en producción

## Descripción

RazoConnect es una plataforma web completa para la venta al mayoreo de cajas de fashion. Permite a los clientes comprar productos por paquetes, gestionar pedidos y a los agentes de ventas generar comisiones. Incluye un panel de administración completo para gestión de pedidos, inventario, agentes y comisiones con sistema de auditoría integrado.

## 👥 Autor

Desarrollado por el equipo de RazoConnect

## 📄 Licencia

ISC
