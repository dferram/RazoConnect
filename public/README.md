# RazoConnect - Frontend

Frontend web para la plataforma de venta de cajas de fashion al mayoreo.

## Estructura de Archivos

```
public/
├── css/
│   └── styles.css          # Estilos globales de la aplicación
├── js/
│   └── api.js              # Funciones de utilidad para llamadas API
├── index.html              # Página de bienvenida
├── login.html              # Inicio de sesión
├── registro.html           # Registro de clientes
├── dashboard.html          # Catálogo de productos
├── producto-detalle.html   # Detalle de producto con "Agregar al Carrito"
└── carrito.html            # Carrito de compras
```

## Características Implementadas

### 🔐 Autenticación
- **Login (`login.html`)**: Formulario de inicio de sesión que llama a `POST /api/login`
- **Registro (`registro.html`)**: Formulario de registro que llama a `POST /api/registro/cliente`
- Almacenamiento de JWT en `localStorage`
- Redirección automática al dashboard después de login/registro exitoso
- Validación en tiempo real de formularios

### 📦 Catálogo de Productos
- **Dashboard (`dashboard.html`)**: Lista todos los productos disponibles
  - Llama a `GET /api/productos`
  - Muestra imagen principal, precio, stock, categoría
  - Cards clicables que llevan al detalle

### 🔍 Detalle de Producto
- **Producto Detalle (`producto-detalle.html`)**: Vista completa del producto
  - Llama a `GET /api/productos/:id`
  - Galería de imágenes (principal + miniaturas)
  - Información completa (precio, dimensiones, stock, categoría)
  - Selector de cantidad de paquetes
  - **Botón "Agregar al Carrito"** que llama a `POST /api/carrito`
  - Validación de stock antes de agregar

### 🛒 Carrito de Compras
- **Carrito (`carrito.html`)**: Vista del carrito de compras
  - Llama a `GET /api/carrito` con JWT en headers
  - Lista de productos agregados con cantidades
  - Cálculo automático de subtotales y total
  - Información de piezas totales por producto
  - Resumen del pedido
  - Botón para proceder al checkout (pendiente implementación)

## API Helper (`js/api.js`)

### Funciones de Autenticación
```javascript
// Guardar datos de sesión
saveAuthData(token, userData)

// Obtener token JWT
getToken()

// Verificar si está autenticado
isAuthenticated()

// Limpiar sesión
clearAuthData()

// Requerir autenticación (redirige si no está logueado)
requireAuth()
```

### Llamadas API
```javascript
// Auth
API.login(email, password)
API.registroCliente(formData)

// Productos
API.getProductos()
API.getProductoById(id)

// Carrito
API.getCarrito()
API.agregarAlCarrito(productoId, cantidadPaquetes)

// Pedidos
API.crearPedido(direccionEnvioId, codigoAgente)
```

### Utilidades
```javascript
// Mostrar notificaciones toast
showToast(message, type) // types: 'success', 'error', 'warning', 'info'
```

## Flujo de Usuario

1. **Llegada**: Usuario llega a `index.html` (página de bienvenida)
2. **Registro/Login**: Se registra en `registro.html` o inicia sesión en `login.html`
3. **Dashboard**: Después del login exitoso, se redirige a `dashboard.html`
4. **Ver Productos**: Explora el catálogo de productos
5. **Detalle**: Hace clic en un producto para ver `producto-detalle.html`
6. **Agregar al Carrito**: Selecciona cantidad y agrega productos al carrito
7. **Carrito**: Ve su carrito en `carrito.html` con todos los productos agregados
8. **Checkout**: (Pendiente) Procede a finalizar el pedido

## Seguridad

- JWT se almacena en `localStorage` con clave `razoconnect_token`
- Todas las rutas protegidas verifican autenticación con `requireAuth()`
- Headers de autorización se agregan automáticamente en `apiCall()`
- Tokens expirados redirigen automáticamente al login

## Validaciones Implementadas

### Formularios
- ✅ Validación de formato de email
- ✅ Validación de contraseña (mínimo 6 caracteres)
- ✅ Confirmación de contraseña
- ✅ Campos requeridos
- ✅ Validación en tiempo real (blur/input events)

### Carrito
- ✅ Validación de stock disponible
- ✅ Cantidad mínima (1 paquete)
- ✅ Actualización automática si producto ya está en carrito

## Responsive Design

Todos los archivos HTML son responsive y se adaptan a dispositivos móviles:
- Grid responsivo para productos
- Layout adaptable para carrito
- Navegación mobile-friendly

## Configuración API

Por defecto, el frontend se conecta a:
```javascript
const API_BASE_URL = 'http://localhost:3000/api';
```

Para cambiar la URL de la API, edita `public/js/api.js` línea 2.

## Próximas Funcionalidades (Pendientes)

- [ ] Página de checkout completa
- [ ] Gestión de direcciones de envío
- [ ] Historial de pedidos
- [ ] Perfil de usuario
- [ ] Búsqueda y filtrado de productos
- [ ] Eliminar/actualizar items del carrito
- [ ] Sistema de categorías navegable

## Notas Técnicas

- Framework CSS: Custom (variables CSS, flexbox, grid)
- No requiere build process (vanilla HTML/CSS/JS)
- Compatible con todos los navegadores modernos
- Notificaciones toast personalizadas
- Estados de loading para todas las operaciones asíncronas
