# API de Autenticación - RazoConnect

Documentación de los endpoints de autenticación del sistema RazoConnect.

## Base URL
```
http://localhost:3000/api
```

---

## Endpoints Disponibles

### 1. Registro de Cliente

Registra un nuevo cliente en el sistema.

**URL:** `POST /api/registro/cliente`

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "Nombre": "Juan",
  "Apellido": "Pérez",
  "Email": "juan.perez@example.com",
  "Password": "password123",
  "Telefono": "5551234567"
}
```

**Campos:**
- `Nombre` (requerido): Nombre del cliente
- `Apellido` (requerido): Apellido del cliente
- `Email` (requerido): Email único del cliente
- `Password` (requerido): Contraseña (mínimo 6 caracteres)
- `Telefono` (opcional): Teléfono de contacto

**Respuesta Exitosa (201):**
```json
{
  "success": true,
  "message": "Cliente registrado exitosamente",
  "data": {
    "cliente": {
      "clienteId": 1,
      "nombre": "Juan",
      "apellido": "Pérez",
      "email": "juan.perez@example.com",
      "telefono": "5551234567",
      "fechaDeRegistro": "2025-10-27T10:25:00.000Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Respuesta de Error (400):**
```json
{
  "success": false,
  "message": "El email ya está registrado"
}
```

---

### 2. Registro de Agente de Ventas

Registra un nuevo agente de ventas en el sistema.

**URL:** `POST /api/registro/agente`

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "Nombre": "María",
  "Apellido": "González",
  "Email": "maria.gonzalez@razoconnect.com",
  "Password": "agente123",
  "CodigoAgente": "AG001"
}
```

**Campos:**
- `Nombre` (requerido): Nombre del agente
- `Apellido` (requerido): Apellido del agente
- `Email` (requerido): Email único del agente
- `Password` (requerido): Contraseña (mínimo 6 caracteres)
- `CodigoAgente` (requerido): Código único del agente

**Respuesta Exitosa (201):**
```json
{
  "success": true,
  "message": "Agente registrado exitosamente",
  "data": {
    "agente": {
      "agenteId": 1,
      "nombre": "María",
      "apellido": "González",
      "email": "maria.gonzalez@razoconnect.com",
      "codigoAgente": "AG001",
      "activo": true
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Respuesta de Error (400):**
```json
{
  "success": false,
  "message": "El código de agente ya está registrado"
}
```

---

### 3. Login (Cliente o Agente)

Inicia sesión para clientes o agentes de ventas.

**URL:** `POST /api/login`

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "Email": "juan.perez@example.com",
  "Password": "password123"
}
```

**Campos:**
- `Email` (requerido): Email del usuario
- `Password` (requerido): Contraseña del usuario

**Respuesta Exitosa - Cliente (200):**
```json
{
  "success": true,
  "message": "Login exitoso",
  "data": {
    "rol": "cliente",
    "usuario": {
      "clienteId": 1,
      "nombre": "Juan",
      "apellido": "Pérez",
      "email": "juan.perez@example.com",
      "telefono": "5551234567"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Respuesta Exitosa - Agente (200):**
```json
{
  "success": true,
  "message": "Login exitoso",
  "data": {
    "rol": "agente",
    "usuario": {
      "agenteId": 1,
      "nombre": "María",
      "apellido": "González",
      "email": "maria.gonzalez@razoconnect.com",
      "codigoAgente": "AG001",
      "activo": true
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Respuesta de Error (401):**
```json
{
  "success": false,
  "message": "Credenciales inválidas"
}
```

**Respuesta de Error - Agente Inactivo (403):**
```json
{
  "success": false,
  "message": "La cuenta del agente está inactiva"
}
```

---

## Uso del Token JWT

Después de registrarse o iniciar sesión, recibirás un token JWT que debes incluir en las peticiones protegidas.

**Header de Autorización:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Contenido del Token:**
```json
{
  "userId": 1,
  "rol": "cliente",
  "email": "juan.perez@example.com",
  "iat": 1698408000,
  "exp": 1698494400
}
```

---

## Validaciones

### Email
- Debe tener formato válido (ej: usuario@dominio.com)
- Debe ser único en el sistema

### Password
- Mínimo 6 caracteres
- Se hashea con bcrypt antes de guardar

### Nombre y Apellido
- No pueden estar vacíos

### CodigoAgente (solo agentes)
- Requerido para agentes
- Debe ser único en el sistema

---

## Códigos de Error

| Código | Descripción |
|--------|-------------|
| 200 | OK - Solicitud exitosa |
| 201 | Created - Recurso creado exitosamente |
| 400 | Bad Request - Error de validación |
| 401 | Unauthorized - Credenciales inválidas |
| 403 | Forbidden - Sin permisos |
| 500 | Internal Server Error - Error del servidor |

---

## Ejemplos con cURL

### Registro de Cliente
```bash
curl -X POST http://localhost:3000/api/registro/cliente \
  -H "Content-Type: application/json" \
  -d '{
    "Nombre": "Juan",
    "Apellido": "Pérez",
    "Email": "juan.perez@example.com",
    "Password": "password123",
    "Telefono": "5551234567"
  }'
```

### Registro de Agente
```bash
curl -X POST http://localhost:3000/api/registro/agente \
  -H "Content-Type: application/json" \
  -d '{
    "Nombre": "María",
    "Apellido": "González",
    "Email": "maria.gonzalez@razoconnect.com",
    "Password": "agente123",
    "CodigoAgente": "AG001"
  }'
```

### Login
```bash
curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "Email": "juan.perez@example.com",
    "Password": "password123"
  }'
```

### Petición con Token
```bash
curl -X GET http://localhost:3000/api/recurso-protegido \
  -H "Authorization: Bearer TU_TOKEN_AQUI"
```

---

## Seguridad

- Las contraseñas se hashean con bcrypt (10 rounds por defecto)
- Los tokens JWT expiran en 24 horas (configurable)
- Los emails deben ser únicos
- Los códigos de agente deben ser únicos
- Las contraseñas nunca se devuelven en las respuestas

---

## Próximos Pasos

1. Implementar recuperación de contraseña
2. Agregar verificación de email
3. Implementar refresh tokens
4. Agregar autenticación de dos factores (2FA)
5. Implementar límite de intentos de login
