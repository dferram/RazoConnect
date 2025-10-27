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
Proyecto Pedidos/
├── index.js                    # Archivo principal del servidor
├── db.js                       # Configuración de PostgreSQL
├── package.json                # Dependencias del proyecto
├── .env                        # Variables de entorno (no versionar)
├── .env.example                # Ejemplo de variables de entorno
├── .gitignore                  # Archivos ignorados por git
├── README.md                   # Documentación principal
├── API_AUTH_DOCS.md            # Documentación de API de autenticación
├── routes/
│   └── auth.js                 # Rutas de autenticación
├── controllers/
│   └── authController.js       # Controlador de autenticación
├── middlewares/
│   └── authMiddleware.js       # Middleware de autenticación JWT
├── utils/
│   ├── jwtHelper.js            # Utilidades para JWT
│   └── validator.js            # Validaciones de datos
└── models/                     # Modelos de datos (por crear)
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

## 📝 Próximos Pasos

1. ✅ Crear estructura de carpetas para routes, controllers, models
2. ✅ Implementar autenticación de usuarios (registro y login)
3. Crear endpoints para gestión de productos
4. Implementar gestión del carrito de compras
5. Implementar gestión de pedidos
6. Crear endpoints para direcciones de envío
7. Implementar panel de agentes (comisiones)
8. Añadir paginación y filtros
9. Añadir tests unitarios

## Descripción

RazoConnect es una plataforma web completa para la venta al mayoreo de cajas de fashion. Permite a los clientes comprar productos por paquetes, gestionar pedidos y a los agentes de ventas generar comisiones.

## 👥 Autor

Desarrollado por el equipo de RazoConnect

## 📄 Licencia

ISC
