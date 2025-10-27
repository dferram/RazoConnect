# Guía de Pruebas - RazoConnect

Guía para probar los endpoints de autenticación del sistema RazoConnect.

## Configuración Previa

1. **Iniciar el servidor:**
   ```bash
   npm run dev
   ```

2. **Verificar que el servidor está corriendo:**
   - Abrir el navegador en: http://localhost:3000/api
   - Debería ver el mensaje de bienvenida

3. **Verificar conexión a la base de datos:**
   - Abrir el navegador en: http://localhost:3000/api/health
   - Debería ver status: "healthy" y database: "connected"

---

## Herramientas Recomendadas

- **Postman** - https://www.postman.com/downloads/
- **Thunder Client** (extensión de VSCode)
- **cURL** (línea de comandos)
- **Insomnia** - https://insomnia.rest/

---

## Flujo de Pruebas Recomendado

### 1. Registrar un Cliente

**Endpoint:** `POST http://localhost:3000/api/registro/cliente`

**Headers:**
```
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "Nombre": "Juan",
  "Apellido": "Pérez",
  "Email": "juan.perez@example.com",
  "Password": "password123",
  "Telefono": "5551234567"
}
```

**Resultado Esperado:**
- Status: 201 Created
- Deberías recibir los datos del cliente y un token JWT
- Copiar el token para usarlo en peticiones protegidas

---

### 2. Registrar un Agente de Ventas

**Endpoint:** `POST http://localhost:3000/api/registro/agente`

**Headers:**
```
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "Nombre": "María",
  "Apellido": "González",
  "Email": "maria.gonzalez@razoconnect.com",
  "Password": "agente123",
  "CodigoAgente": "AG001"
}
```

**Resultado Esperado:**
- Status: 201 Created
- Deberías recibir los datos del agente y un token JWT
- Copiar el token para usarlo en peticiones protegidas

---

### 3. Login como Cliente

**Endpoint:** `POST http://localhost:3000/api/login`

**Headers:**
```
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "Email": "juan.perez@example.com",
  "Password": "password123"
}
```

**Resultado Esperado:**
- Status: 200 OK
- Deberías recibir el rol: "cliente" y un token JWT

---

### 4. Login como Agente

**Endpoint:** `POST http://localhost:3000/api/login`

**Headers:**
```
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "Email": "maria.gonzalez@razoconnect.com",
  "Password": "agente123"
}
```

**Resultado Esperado:**
- Status: 200 OK
- Deberías recibir el rol: "agente" y un token JWT

---

## Casos de Error a Probar

### 1. Email Duplicado

Intenta registrar un cliente con el mismo email dos veces:

**Resultado Esperado:**
- Status: 400 Bad Request
- Mensaje: "El email ya está registrado"

---

### 2. Contraseña Corta

Intenta registrar con una contraseña de menos de 6 caracteres:

```json
{
  "Nombre": "Test",
  "Apellido": "User",
  "Email": "test@example.com",
  "Password": "123"
}
```

**Resultado Esperado:**
- Status: 400 Bad Request
- Mensaje de validación sobre la contraseña

---

### 3. Email Inválido

Intenta registrar con un email sin formato válido:

```json
{
  "Nombre": "Test",
  "Apellido": "User",
  "Email": "email-invalido",
  "Password": "password123"
}
```

**Resultado Esperado:**
- Status: 400 Bad Request
- Mensaje: "El email no es válido"

---

### 4. Credenciales Incorrectas

Intenta hacer login con contraseña incorrecta:

```json
{
  "Email": "juan.perez@example.com",
  "Password": "contraseña_incorrecta"
}
```

**Resultado Esperado:**
- Status: 401 Unauthorized
- Mensaje: "Credenciales inválidas"

---

### 5. Usuario No Existe

Intenta hacer login con un email que no existe:

```json
{
  "Email": "noexiste@example.com",
  "Password": "password123"
}
```

**Resultado Esperado:**
- Status: 401 Unauthorized
- Mensaje: "Credenciales inválidas"

---

## Verificación de Tokens JWT

### Cómo usar el token en peticiones protegidas

Cuando tengas endpoints protegidos, deberás incluir el token así:

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
```

### Decodificar el token

Puedes ver el contenido del token en: https://jwt.io/

Pega tu token y verás algo como:

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

## Scripts de Prueba SQL

### Verificar clientes registrados

```sql
SELECT ClienteID, Nombre, Apellido, Email, Telefono, FechaDeRegistro 
FROM Clientes;
```

### Verificar agentes registrados

```sql
SELECT AgenteID, Nombre, Apellido, Email, CodigoAgente, Activo 
FROM AgentesDeVentas;
```

### Limpiar datos de prueba

```sql
-- Eliminar todos los clientes
DELETE FROM Clientes;

-- Eliminar todos los agentes
DELETE FROM AgentesDeVentas;

-- Resetear secuencias (IDs)
ALTER SEQUENCE clientes_clienteid_seq RESTART WITH 1;
ALTER SEQUENCE agentesdeventas_agenteid_seq RESTART WITH 1;
```

---

## Colección Postman

Puedes importar esta colección JSON en Postman:

```json
{
  "info": {
    "name": "RazoConnect API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Auth",
      "item": [
        {
          "name": "Registro Cliente",
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "Content-Type",
                "value": "application/json"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"Nombre\": \"Juan\",\n  \"Apellido\": \"Pérez\",\n  \"Email\": \"juan.perez@example.com\",\n  \"Password\": \"password123\",\n  \"Telefono\": \"5551234567\"\n}"
            },
            "url": {
              "raw": "http://localhost:3000/api/registro/cliente",
              "protocol": "http",
              "host": ["localhost"],
              "port": "3000",
              "path": ["api", "registro", "cliente"]
            }
          }
        },
        {
          "name": "Registro Agente",
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "Content-Type",
                "value": "application/json"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"Nombre\": \"María\",\n  \"Apellido\": \"González\",\n  \"Email\": \"maria.gonzalez@razoconnect.com\",\n  \"Password\": \"agente123\",\n  \"CodigoAgente\": \"AG001\"\n}"
            },
            "url": {
              "raw": "http://localhost:3000/api/registro/agente",
              "protocol": "http",
              "host": ["localhost"],
              "port": "3000",
              "path": ["api", "registro", "agente"]
            }
          }
        },
        {
          "name": "Login",
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "Content-Type",
                "value": "application/json"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"Email\": \"juan.perez@example.com\",\n  \"Password\": \"password123\"\n}"
            },
            "url": {
              "raw": "http://localhost:3000/api/login",
              "protocol": "http",
              "host": ["localhost"],
              "port": "3000",
              "path": ["api", "login"]
            }
          }
        }
      ]
    }
  ]
}
```

---

## Checklist de Pruebas

- [ ] Servidor corriendo en puerto 3000
- [ ] Base de datos conectada (/api/health)
- [ ] Registro de cliente exitoso
- [ ] Registro de agente exitoso
- [ ] Login de cliente exitoso
- [ ] Login de agente exitoso
- [ ] Error: Email duplicado
- [ ] Error: Contraseña corta
- [ ] Error: Email inválido
- [ ] Error: Credenciales incorrectas
- [ ] Error: Usuario no existe
- [ ] Token JWT recibido y válido
- [ ] Datos correctos en la base de datos

---

## Solución de Problemas

### El servidor no inicia
- Verificar que las dependencias están instaladas: `npm install`
- Verificar que el puerto 3000 no esté ocupado
- Revisar el archivo `.env`

### Error de conexión a la base de datos
- Verificar que PostgreSQL está corriendo
- Verificar las credenciales en el archivo `.env`
- Verificar que la base de datos "razoconnect" existe
- Ejecutar el script `BD V01.sql`

### Los endpoints no responden
- Verificar la URL completa: `http://localhost:3000/api/...`
- Verificar que el Content-Type sea `application/json`
- Revisar la consola del servidor para errores

### Token inválido
- Verificar que el token se incluya en el header como: `Bearer TOKEN`
- Verificar que el token no haya expirado (24h por defecto)
- Verificar que el JWT_SECRET en `.env` sea correcto
