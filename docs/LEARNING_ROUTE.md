---

#  ROADMAP COMPLETO DE APRENDIZAJE — RazoConnect
### De "lo uso" a "lo entiendo y lo explico"
#### Todo basado en código real de tu repo

---

## CÓMO LEER ESTE ROADMAP

Cada tema tiene:
- **Qué es** — explicación desde cero
- **Dónde está en tu código** — el archivo exacto
- **Qué debes poder explicar** — lo que te van a preguntar
- **Pregunta de entrevista** — la pregunta real

---

# MÓDULO 1 — BACKEND

## 1.1 — Node.js y el Event Loop

### Qué es
Node.js es el entorno que ejecuta tu JavaScript en el servidor. Lo especial es que es **single-threaded** — solo tiene un hilo de ejecución. Pero puede manejar miles de requests simultáneas gracias al **Event Loop**: un mecanismo que delega operaciones lentas (base de datos, archivos, red) al sistema operativo y sigue atendiendo otras requests mientras espera.

### Dónde está en tu código
Cada `async/await` en tus controllers es el Event Loop en acción:
```javascript name=controllers/authAdminController.js url=https://github.com/dferram/RazoConnect/blob/c15f0c5afb85dddae426b092e15a32f3e139f019/controllers/authAdminController.js#L204-L220
const accessToken = generateAccessToken({ ... });
const refreshToken = generateRefreshToken({ ... });
// Guardar refresh token en Redis (30 días)
await saveRefreshToken(cuenta.id, rolNormalizado, refreshToken, 30 * 24 * 60 * 60);
```
Mientras `saveRefreshToken` espera respuesta de Redis, Node atiende otra request. Eso es el Event Loop.

### Qué debes poder explicar
- Por qué Node puede manejar concurrencia siendo single-threaded
- Qué es el Call Stack, la Queue de callbacks y el Event Loop
- Qué significa que una operación es "bloqueante" y por qué debes evitarlas
- Por qué TODOS tus controllers son `async` — si fueran síncronos y tardaran 1 segundo, bloquearías el servidor entero

### Pregunta de entrevista
> *"Si hago un `for` de 10 millones de iteraciones dentro de un endpoint de Express, ¿qué pasa con las otras requests que llegan mientras tanto?"*
> **Respuesta:** Se bloquean todas. El Event Loop no puede procesar nada más porque el Call Stack está ocupado. Por eso las operaciones pesadas deben ser asíncronas o delegarse a worker threads.

---

## 1.2 — Express.js y el Middleware Pipeline

### Qué es
Express es el framework que convierte Node en un servidor web. Un **middleware** es simplemente una función que recibe `(req, res, next)` y puede: modificar el request, responder, o llamar a `next()` para pasar al siguiente middleware.

### Dónde está en tu código
Tu `index.js` es el pipeline completo. Este es el orden exacto que sigue CADA request:
```javascript name=index.js url=https://github.com/dferram/RazoConnect/blob/c15f0c5afb85dddae426b092e15a32f3e139f019/index.js#L53-L87
// 1. SecurityHeaders (OWASP)
app.use(securityHeaders);
// 2. CORS
app.use(cors(corsOptions));
// 3. JSON parsing
app.use(express.json({ limit: '10mb' }));
// 4. Input sanitization
app.use(sanitizeInputs);
// 5. SQL injection detection
app.use(preventSQLInjection);
// 6. Rate limiting global
app.use('/api', globalLimiter);
```

### Qué debes poder explicar
- Por qué el orden de `app.use()` importa — si pones `authenticate` antes de `tenantGuard`, el usuario no tiene tenant asignado cuando llega al auth
- Qué pasa si un middleware no llama `next()` ni responde — la request queda colgada para siempre
- Diferencia entre middleware de aplicación (`app.use`), de ruta (`router.use`) y de error (`(err, req, res, next)`)
- Por qué tienes `app.use(sanitizeInputs)` ANTES de las rutas — para que todos los inputs ya vengan limpios

### Pregunta de entrevista
> *"¿Por qué en tu index.js las rutas del developer están ANTES de tenantGuard?"*
> **Respuesta:** Porque el developer panel no pertenece a ningún tenant — es el super-admin de la plataforma. Si pasara por tenantGuard, intentaría resolver un tenant para `localhost/developer` y fallaría o redireccionaría.

---

## 1.3 — PostgreSQL y el Connection Pool

### Qué es
PostgreSQL es tu base de datos relacional. Un **connection pool** es un grupo de conexiones pre-establecidas a la DB que tu app reutiliza. Abrir una conexión nueva por cada request tomaría ~100ms y agotar los recursos del servidor.

### Dónde está en tu código
```javascript name=db.js url=https://github.com/dferram/RazoConnect/blob/c15f0c5afb85dddae426b092e15a32f3e139f019/db.js#L9-L22
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  max: 20,                    // máximo 20 conexiones simultáneas
  idleTimeoutMillis: 30000,   // cierra conexiones inactivas a los 30s
  connectionTimeoutMillis: 10000, // falla si no hay conexión en 10s
});
```

### Qué debes poder explicar
- Qué pasa cuando todas las 20 conexiones están ocupadas — las requests nuevas esperan en cola. Si la cola se llena, empiezan a fallar con timeout
- Por qué usas `db.query()` para la mayoría de operaciones, pero `db.getClient()` + `client.release()` cuando necesitas transacciones
- Qué es una **transacción** (`BEGIN/COMMIT/ROLLBACK`) y en qué partes de tu código las usas — inventario, créditos, pagos
- Por qué las queries parametrizadas (`$1, $2`) previenen SQL injection: porque el driver trata los parámetros como **datos**, nunca como **SQL ejecutable**

### Pregunta de entrevista
> *"¿Qué pasa si en tu FIFOAllocationService haces `BEGIN` pero el servidor crashea antes del `COMMIT`?"*
> **Respuesta:** PostgreSQL automáticamente hace `ROLLBACK` de cualquier transacción sin `COMMIT` al cerrar la conexión. Es la **Atomicidad** de ACID — la operación es todo o nada.

---

## 1.4 — Arquitectura Multi-Tenant

### Qué es
Multi-tenancy es cuando una sola aplicación sirve a múltiples clientes (tenants) de forma aislada. Hay 3 modelos:
- **DB separada por tenant** — máximo aislamiento, caro de mantener
- **Schema separado por tenant** — aislamiento medio, complejo
- **Row-level (tu modelo)** — todas las tablas comparten filas, filtradas por `tenant_id`

### Dónde está en tu código
**Paso 1 — `tenantGuard` detecta el tenant por dominio:**
```javascript name=middlewares/tenantGuard.js url=https://github.com/dferram/RazoConnect/blob/c15f0c5afb85dddae426b092e15a32f3e139f019/middlewares/tenantGuard.js#L30-L52
async function tenantGuard(req, res, next) {
  // Lee req.hostname → busca en DB → inyecta req.tenant
  // Si tenant.is_active === false → redirige a /suspended
}
```

**Paso 2 — `validateUserTenant` previene cross-tenant:**
```javascript name=middlewares/validateUserTenant.js url=https://github.com/dferram/RazoConnect/blob/c15f0c5afb85dddae426b092e15a32f3e139f019/middlewares/validateUserTenant.js#L6-L23
function validateUserTenant(req, res, next) {
  if (req.user.tenant_id !== req.tenant.tenant_id) {
    // SECURITY ALERT: destruye sesión, 401
  }
}
```

**Paso 3 — Todas las queries filtran por `tenant_id`:**
```javascript name=controllers/authAdminController.js url=https://github.com/dferram/RazoConnect/blob/c15f0c5afb85dddae426b092e15a32f3e139f019/controllers/authAdminController.js#L204-L210
// Cada query incluye AND tenant_id = $X
'SELECT * FROM administradores WHERE adminid = $1 AND tenant_id = $2'
```

### Qué debes poder explicar
- El flujo completo de una request: dominio → `tenantGuard` → `req.tenant` → `authenticate` → `validateUserTenant` → controller con `req.tenant.tenant_id`
- Qué ataque previene `validateUserTenant` — si un admin del Tenant A consigue un token válido e intenta acceder al Tenant B, este middleware destruye su sesión
- Por qué elegiste row-level isolation — es más simple de mantener y escala bien para el tamaño actual
- Qué es `FORCE_TENANT_ID` en `.env` — es para desarrollo local, donde no tienes dominios configurados

### Pregunta de entrevista
> *"¿Qué pasaría si un developer olvidara el `WHERE tenant_id = $1` en una query dentro de un controller?"*
> **Respuesta:** Ese endpoint devolvería datos de TODOS los tenants. Por eso `validateUserTenant` es una capa adicional, pero la defensa principal es la disciplina de incluir `tenant_id` en cada query. En un sistema más maduro, esto se resolvería con Row Level Security en PostgreSQL directamente.

---

## 1.5 — JWT: Access Token + Refresh Token + JTI Blacklist

### Qué es
**JWT (JSON Web Token)** es un string con 3 partes separadas por puntos:
- **Header**: algoritmo de firma (`HS256`)
- **Payload**: datos (`id`, `rol`, `tenant_id`, `jti`, `exp`)
- **Signature**: HMAC del header+payload con tu `JWT_SECRET`

El servidor puede **verificar** un JWT sin consultar la DB — solo necesita el secret. Eso lo hace muy rápido, pero también imposible de invalidar antes de que expire... a menos que uses una blacklist.

### Dónde está en tu código
**Generación de tokens con JTI:**
```javascript name=utils/jwtHelper.js url=https://github.com/dferram/RazoConnect/blob/c15f0c5afb85dddae426b092e15a32f3e139f019/utils/jwtHelper.js#L39-L70
const generateAccessToken = (payload) => {
  return jwt.sign(
    { ...normalizedPayload, jti: crypto.randomUUID() }, // JTI único por token
    resolveJwtSecret(),
    { expiresIn: '1h' }
  );
};

const generateRefreshToken = (payload) => {
  return jwt.sign(normalizedPayload, resolveJwtRefreshSecret(), {
    expiresIn: '30d'
  });
};
```

**Blacklist en Redis durante logout:**
```javascript name=controllers/auth/tokenController.js url=https://github.com/dferram/RazoConnect/blob/c15f0c5afb85dddae426b092e15a32f3e139f019/controllers/auth/tokenController.js#L142-L172
const decoded = verifyAccessToken(accessToken);
if (decoded && decoded.jti) {
  const ttlRemaining = decoded.exp - Math.floor(Date.now() / 1000);
  await blacklistAccessToken(decoded.jti, ttlRemaining); // Guarda en Redis por el tiempo que le queda
}
```

**Verificación de blacklist en cada request:**
```javascript name=middlewares/authMiddleware.js url=https://github.com/dferram/RazoConnect/blob/c15f0c5afb85dddae426b092e15a32f3e139f019/middlewares/authMiddleware.js#L44-L74
if (decoded.jti) {
  const blacklisted = await isTokenBlacklisted(decoded.jti);
  if (blacklisted) return res.status(401).json({ message: 'Sesión inválida' });
}
```

**Renovación con Refresh Token:**
```javascript name=controllers/auth/tokenController.js url=https://github.com/dferram/RazoConnect/blob/c15f0c5afb85dddae426b092e15a32f3e139f019/controllers/auth/tokenController.js#L44-L77
// 1. Verifica firma del refresh token
// 2. Verifica que exista en Redis (no fue revocado)
// 3. Verifica que el usuario siga activo en DB
// 4. Genera nuevo access token
```

### Qué debes poder explicar
- Las 3 partes de un JWT y qué contiene cada una
- Por qué el payload es legible por cualquiera (base64, no encriptado) — nunca metas datos sensibles ahí
- Por qué el access token dura 1h y el refresh token 30 días — balance entre seguridad y UX
- El flujo completo de logout: blacklist JTI en Redis con TTL = tiempo restante del token
- Por qué Redis para la blacklist y no PostgreSQL — Redis tiene TTL nativo por key, es más rápido para operaciones de lectura frecuente
- Qué es `normalizePayload` — estandariza los campos porque tienes `userId`, `id`, `clienteId`, `adminId` en distintos lugares

### Pregunta de entrevista
> *"Si un usuario hace logout, ¿cómo garantizas que su token anterior ya no funcione si JWT es stateless por naturaleza?"*
> **Respuesta:** Guardamos el JTI (JWT ID único por token) en Redis con un TTL igual al tiempo restante de vida del token. En cada request autenticada, consultamos Redis para ver si ese JTI está en la blacklist. Es una excepción controlada al modelo stateless — solo persistes el mínimo necesario (el JTI, no el token completo).

---

## 1.6 — FIFO: Sistema de Inventario

### Qué es
**FIFO (First In, First Out)** aplicado a inventario significa: el primer pedido que llegó tiene derecho al stock antes que los que llegaron después. El problema que resuelve: sin FIFO, dos pedidos simultáneos pueden "reclamar" el mismo stock físico.

### Dónde está en tu código
**El algoritmo central en `SmartStockService`:**
```javascript name=services/SmartStockService.js url=https://github.com/dferram/RazoConnect/blob/c15f0c5afb85dddae426b092e15a32f3e139f019/services/SmartStockService.js#L555-L572
async function calculateAllocationStatus({ varianteId, cantidadRequerida, orderDate, adminId, tenantId }) {
  // PASO 1: Stock físico actual
  // PASO 2: "Deuda previa" — cuánto stock ya reclamaron pedidos ANTERIORES a orderDate
  // PASO 3: Stock disponible = físico - reservas - deuda previa
  // PASO 4: Si disponible >= requerido → surtido. Si no → backorder
}
```

**El hook de recálculo cuando se libera stock:**
```javascript name=services/FIFOAllocationService.js url=https://github.com/dferram/RazoConnect/blob/c15f0c5afb85dddae426b092e15a32f3e139f019/services/FIFOAllocationService.js#L84-L103
// Cuando se cancela o entrega un pedido → se libera stock
// → recalcularPedidosPosteriores() actualiza los backorders que ahora pueden surtirse
```

### Qué debes poder explicar
- El problema que FIFO resuelve: sin él, el último pedido en guardarse en DB puede "robar" stock que ya le pertenecía al primero
- Qué es la "deuda previa": la suma de stock que todos los pedidos **anteriores** a este ya reclamaron
- Por qué el recálculo automático existe: cuando se cancela el Pedido #1 que tenía stock, los Pedidos #2 y #3 en backorder deben recalcularse automáticamente
- Qué es un **backorder**: un pedido que no tiene stock suficiente ahora, pero seguirá en cola para cuando llegue

### Pregunta de entrevista
> *"Dos usuarios hacen pedido del mismo producto al mismo tiempo. Solo hay stock para uno. ¿Cómo garantiza tu sistema que no se venden las mismas unidades dos veces?"*
> **Respuesta:** `calculateAllocationStatus` calcula la "deuda previa" basándose en `orderDate`. El pedido con fecha anterior tiene prioridad. Si llegan "simultáneos", PostgreSQL serializa las escrituras y el que se guarda primero tiene `orderDate` menor, ganando el stock. El segundo queda en backorder.

---

## 1.7 — Servicios de Negocio

### Qué es
Un **Service** es una clase o módulo que encapsula lógica de negocio compleja que no pertenece al controller (que solo debería orquestar) ni al modelo (que solo es datos). Tus services son los más sofisticados de tu proyecto.

### Tus services y qué hace cada uno

| Service | Qué hace |
|---------|---------|
| `SmartStockService.js` | Calcula disponibilidad real de stock con lógica FIFO |
| `FIFOAllocationService.js` | Recalcula la cola de backorders cuando se libera stock |
| `KardexService.js` | Registra cada movimiento de inventario en un ledger inmutable |
| `creditAnalysisService.js` | Calcula el score de riesgo crediticio de un cliente |
| `auditService.js` | Guarda snapshots de antes/después de cada cambio |
| `emailService.js` | Envía emails con plantillas Handlebars |
| `notificacionesService.js` | Crea notificaciones in-app para clientes y admins |

### Qué debes poder explicar
- Por qué separas lógica en services en vez de ponerla en controllers — un controller gordo es difícil de testear y de reutilizar
- Qué es el **Kardex** en contabilidad: un registro cronológico e inmutable de entradas y salidas de inventario. Cada movimiento queda registrado y nunca se borra
- Qué es un **credit score** y cómo `creditAnalysisService` lo calcula — basado en historial de pagos, monto de compras, deuda actual

---

## 1.8 — Redis

### Qué es
Redis es una base de datos **in-memory** (en RAM), extremadamente rápida, que usas para datos que necesitas acceder muy frecuentemente y que no necesitan persistencia permanente.

### Dónde está en tu código — 3 usos distintos

```javascript name=config/redisClient.js url=https://github.com/dferram/RazoConnect/blob/c15f0c5afb85dddae426b092e15a32f3e139f019/config/redisClient.js#L173-L228
// USO 1: Refresh tokens (key: "refresh_token:admin:42" → valor: el token)
await client.setEx(`refresh_token:${rol}:${userId}`, ttl, refreshToken);

// USO 2: Blacklist de access tokens (key: "blacklist:jti-uuid" → valor: "1")
await client.setEx(`blacklist:${tokenId}`, safeTtl, '1');

// USO 3: Rate limiting distribuido (via rate-limit-redis)
// Cuenta requests por IP+tenant entre todas las instancias del servidor
```

### Qué debes poder explicar
- Por qué Redis para rate limiting y no una variable en memoria — si tienes 2 instancias del servidor, cada una tiene su propio `Map()` de contadores. Con Redis, el contador es compartido entre todas las instancias
- Por qué los refresh tokens en Redis y no en PostgreSQL — acceso O(1) por key, TTL nativo, sin JOINs
- Qué es TTL (Time To Live) — un tiempo de expiración que Redis maneja automáticamente. Cuando expira, la key se borra sola. Por eso no tienes cron jobs limpiando blacklists

---

## 1.9 — Cron Jobs y Tareas Programadas

### Qué es
Un **cron job** es una tarea que se ejecuta automáticamente en intervalos definidos, sin que nadie la llame manualmente.

### Dónde está en tu código
```
cron/                    # Scheduled jobs
```
Usas `node-cron` para tareas como: limpiar sesiones expiradas, enviar alertas de stock bajo, notificaciones de vencimiento de crédito.

### Qué debes poder explicar
- Sintaxis de cron: `"0 0 * * *"` = medianoche todos los días
- Por qué en producción con múltiples instancias, los cron jobs pueden ejecutarse múltiples veces — solución: distributed locks con Redis
- Diferencia entre un cron job y un webhook — cron es push interno programado, webhook es push externo por evento

---

# MÓDULO 2 — SEGURIDAD

## 2.1 — bcrypt y Hashing de Passwords

### Qué es
**Hashing** es una operación de una sola vía — no puedes recuperar el password original desde el hash. **bcrypt** agrega un **salt** (dato aleatorio) al password antes de hashearlo, haciendo que el mismo password tenga un hash diferente cada vez.

### Dónde está en tu código
```javascript name=controllers/developerController.js url=https://github.com/dferram/RazoConnect/blob/c15f0c5afb85dddae426b092e15a32f3e139f019/controllers/developerController.js#L30-L50
const isValidPassword = await bcrypt.compare(password, developer.password_hash);
// bcrypt.compare es "timing-safe" — siempre tarda lo mismo, sin importar si el primer
// carácter coincide o no. Esto previene timing attacks.
```

### Qué debes poder explicar
- Diferencia entre hash, encrypt y encode — hash es irreversible, encrypt es reversible con key, encode es solo formato (base64)
- Qué es un **salt** y por qué evita **rainbow table attacks** — una rainbow table es una lista precalculada de `hash → password`. Con salt, el mismo "password123" tiene millones de hashes posibles
- Qué es un **timing attack** y por qué `bcrypt.compare` es timing-safe
- Por qué nunca almacenas el password, solo el hash

### Pregunta de entrevista
> *"¿Por qué usas bcryptjs y no `crypto.createHash('sha256')`?"*
> **Respuesta:** SHA256 es muy rápido — diseñado para ser rápido. bcrypt es intencionalmente lento (configurable con el factor de costo). Un atacante con GPUs puede calcular billones de SHA256/segundo, pero solo miles de bcrypt/segundo. La lentitud es una feature de seguridad.

---

## 2.2 — OWASP Top 10 aplicado a tu sistema

### Qué es
OWASP es la organización que publica las 10 vulnerabilidades web más críticas. Tu sistema tiene controles para todas las relevantes.

### Dónde está en tu código — mapeo completo

**A01 — Broken Access Control → `validateUserTenant` + `authorize()`**
```javascript name=middlewares/authMiddleware.js url=https://github.com/dferram/RazoConnect/blob/c15f0c5afb85dddae426b092e15a32f3e139f019/middlewares/authMiddleware.js#L212-L244
const authorize = (roles = []) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401)...
    const userRoles = getUserRoles(req);
    if (!userRoles.some(role => roles.includes(role))) return res.status(403)...
  };
};
```

**A03 — Injection → queries parametrizadas + `sanitizeInputs`**
```javascript
// NUNCA:  `SELECT * FROM users WHERE email = '${email}'`
// SIEMPRE: `SELECT * FROM users WHERE email = $1`, [email]
```

**A05 — Security Misconfiguration → `secretsValidator`**
```javascript name=utils/secretsValidator.js url=https://github.com/dferram/RazoConnect/blob/c15f0c5afb85dddae426b092e15a32f3e139f019/utils/secretsValidator.js#L1-L37
// Si falta JWT_SECRET, SESSION_SECRET, DB_HOST, etc. → el servidor no arranca
```

**A07 — Auth Failures → rate limiting en login**
- `authLimiter` en `POST /api/login`
- `registerLimiter` en `POST /api/registro/cliente`
- `passwordResetLimiter` en forgot-password

**A09 — Security Logging → Winston con requestId**
```javascript
logger.error('Token verification failed', { path: req.path, requestId: req.requestId });
```

### Qué debes poder explicar
- Diferencia entre 401 y 403: 401 = no estás autenticado (sin token o token inválido), 403 = estás autenticado pero no tienes permiso
- Qué es **SQL Injection** y por qué las queries parametrizadas la previenen completamente
- Qué es **XSS** (Cross-Site Scripting) y cómo tu `CSP header` + `sanitizeInputs` lo mitigan
- Qué es **CSRF** y por qué es una vulnerabilidad pendiente en tu sistema

---

## 2.3 — Rate Limiting distribuido

### Qué es
Rate limiting limita cuántas requests puede hacer un cliente en un período de tiempo. Sin él, un atacante puede hacer millones de intentos de login.

### Dónde están tus 4 limiters
```javascript
// Global: 300 req / 15min por IP (todas las rutas /api)
globalLimiter

// Auth: 5 intentos / 15min por IP (login)
authLimiter

// Tenant: 200 req / 15min por IP+tenant combinado
tenantRateLimiter

// Heavy: 20 req / hora por IP (PDFs, reportes, imágenes)
heavyOperationLimiter
```

### Qué debes poder explicar
- Por qué necesitas `rate-limit-redis` y no solo `express-rate-limit` — con múltiples instancias en Azure, cada instancia tiene su propio contador. Redis centraliza el estado
- Por qué el `heavyOperationLimiter` existe para PDFs y reportes — generar un PDF puede tardar 2-3 segundos y consumir mucha CPU. Sin límite, 50 requests simultáneas de PDF pueden tumbar el servidor
- Qué es un **brute force attack** y cómo lo previene `authLimiter`

---

## 2.4 — Security Headers

### Qué es
Los security headers son instrucciones que el servidor manda al navegador en cada response, diciéndole cómo comportarse para prevenir ataques.

### Los headers que implementaste manualmente
```
Content-Security-Policy (CSP)   → Solo ejecuta JS/CSS de dominios que tú apruebas
X-Frame-Options: DENY           → Previene clickjacking (tu página no puede cargarse en un iframe)
X-Content-Type-Options: nosniff → El navegador no "adivina" el tipo de archivo
Strict-Transport-Security (HSTS)→ Fuerza HTTPS, el navegador nunca intenta HTTP
Referrer-Policy                 → Controla qué URL se manda en el header Referer
```

### Qué debes poder explicar
- Qué es **clickjacking** — un atacante pone tu página en un iframe invisible sobre un botón falso. El usuario cree que hace click en algo inocente pero en realidad interactúa con tu app
- Por qué tu CSP es diferente al default de Helmet — MercadoPago necesita cargar scripts de `sdk.mercadopago.com`, y Google OAuth necesita `accounts.google.com`. Un CSP genérico los bloquearía
- Qué es **HSTS** — le dice al navegador "guarda que este dominio SOLO funciona con HTTPS por los próximos X segundos". Incluso si alguien escribe `http://`, el navegador redirige solo

---

## 2.5 — Google OAuth con Passport.js

### Qué es
OAuth 2.0 es un protocolo de autorización que permite a tu app pedirle a Google que autentique a un usuario sin que ese usuario te dé su password de Google.

### Dónde está en tu código
```javascript name=config/passport.js url=https://github.com/dferram/RazoConnect/blob/c15f0c5afb85dddae426b092e15a32f3e139f019/config/domainMapper.js
// config/passport.js — estrategia de Google OAuth
```
El flujo: usuario hace click → tu app redirige a Google → usuario aprueba → Google redirige a tu callback con un `code` → tu app intercambia el `code` por un `access_token` de Google → obtienes el perfil del usuario → creas o actualizas su cuenta en tu DB.

### Qué debes poder explicar
- El flujo de OAuth 2.0 en 4 pasos
- Por qué Passport.js — abstrae el flujo de OAuth para que no tengas que implementar el intercambio de tokens manualmente
- Diferencia entre autenticación (quién eres) y autorización (qué puedes hacer)
- Qué datos obtienes de Google y cuáles guardas en tu DB

---

# MÓDULO 3 — FRONTEND

## 3.1 — Vanilla JavaScript ES6+

### Qué es
ES6+ son las versiones modernas de JavaScript (2015 en adelante) con features como `const/let`, arrow functions, template literals, destructuring, `async/await`, módulos.

### Dónde está en tu código
Toda tu carpeta `tenants_views/` es Vanilla JS. El patrón IIFE que usas:
```javascript name=tenants_views/fashion/js/inicio-dynamic-content.js url=https://github.com/dferram/RazoConnect/blob/c15f0c5afb85dddae426b092e15a32f3e139f019/tenants_views/fashion/js/inicio-dynamic-content.js#L132-L188
(function() {
  // Todo el código aquí tiene su propio scope
  // Las variables no "contaminan" el scope global
  window.RazoDynamicContent = { ... }; // Solo expones lo necesario
})();
```

### Qué debes poder explicar
- Qué es **scope** — dónde vive una variable. `var` tiene scope de función, `let/const` tienen scope de bloque
- Qué es el **IIFE** y por qué lo usas — crea un scope privado. Sin él, todas las variables de todos tus scripts se mezclarían en el scope global (`window`)
- Qué es **destructuring** — `const { id, rol } = decoded`
- Qué es **optional chaining** — `req.user?.tenant_id` — no lanza error si `req.user` es null
- Qué es **nullish coalescing** — `tenant_id ?? 'default'` — usa el valor de la derecha solo si el de la izquierda es `null` o `undefined`

---

## 3.2 — Fetch API y comunicación con el backend

### Qué es
`fetch` es la API nativa del navegador para hacer requests HTTP. Es asíncrona y devuelve Promises.

### Dónde está en tu código
Tu `api-client.js` es el wrapper que usan todas las páginas:
```javascript
// Siempre agrega el token Authorization
// Siempre maneja errores de red
// Siempre parsea el JSON de respuesta
```

### Qué debes poder explicar
- Por qué `fetch` no lanza error en HTTP 404 o 500 — solo lanza error en errores de red (sin conexión, DNS failed). Para errores HTTP debes chequear `response.ok`
- Qué es **CORS** — un mecanismo del navegador que bloquea requests a dominios diferentes al que cargó la página. Tu backend configura los headers `Access-Control-Allow-Origin` para decirle al navegador qué dominios pueden hacer requests
- Cómo mandas el token JWT en cada request: `headers: { 'Authorization': 'Bearer ' + token }`
- Por qué el token está en `localStorage` y qué vulnerabilidad tiene — XSS puede robarlo. Por eso tienes CSP para mitigar XSS

---

## 3.3 — Bootstrap 5

### Qué es
Bootstrap es un framework CSS que te da componentes visuales pre-construidos (botones, cards, modales, grids) y un sistema de layout responsivo basado en 12 columnas.

### Qué debes poder explicar
- Sistema de grid: `col-md-6` = en pantallas medianas, ocupa 6 de 12 columnas (la mitad)
- Cómo inicializar componentes JS de Bootstrap manualmente: `new bootstrap.Modal(document.getElementById('miModal'))`
- Qué son las **breakpoints**: `sm` (576px), `md` (768px), `lg` (992px), `xl` (1200px)
- Por qué tu app funciona en móvil sin CSS adicional — Bootstrap es mobile-first

---

## 3.4 — localStorage, sessionStorage y manejo de estado

### Qué es
Son mecanismos del navegador para guardar datos localmente. `localStorage` persiste entre sesiones, `sessionStorage` solo dura mientras la pestaña está abierta.

### Dónde está en tu código
```javascript name=tenants_views/razo/js/auth-manager.js url=https://github.com/dferram/RazoConnect/blob/c15f0c5afb85dddae426b092e15a32f3e139f019/tenants_views/razo/js/auth-manager.js#L186-L220
// Access token y refresh token guardados en localStorage
// Decodificación del JWT en el cliente (sin verificar firma)
const decodeToken = (token) => {
  const parts = token.split('.');
  const payload = JSON.parse(atob(parts[1])); // base64 decode del payload
  return payload;
};
```

### Qué debes poder explicar
- Por qué decodificas el JWT en el cliente sin verificar la firma — solo necesitas leer el payload (nombre del usuario, rol) para la UI. La verificación real la hace el servidor
- Por qué `atob(parts[1])` funciona — el payload de un JWT es solo base64, no está encriptado
- Diferencia entre `localStorage` y cookies — localStorage no se manda automáticamente en cada request, las cookies sí. Para tokens JWT en headers lo manejas manualmente

---

# MÓDULO 4 — TESTING

## 4.1 — Jest: Unit Testing

### Qué es
Jest es el framework de testing de JavaScript. Un **test unitario** prueba una sola función de forma aislada, sin DB, sin red, sin dependencias externas.

### Dónde está en tu código
```javascript name=tests/unit/utils/jwtHelper.test.js url=https://github.com/dferram/RazoConnect/blob/c15f0c5afb85dddae426b092e15a32f3e139f019/tests/unit/utils/jwtHelper.test.js#L1-L27
describe('jwtHelper', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret...'; // Setup
  });

  beforeEach(() => {
    jest.clearAllMocks(); // Limpia entre tests
  });

  it('debe retornar un string con 3 partes separadas por "."', () => {
    const token = generateToken({ userId: 1, rol: 'cliente' });
    expect(token.split('.')).toHaveLength(3); // Assertion
  });
});
```

### Qué debes poder explicar
- `describe` — agrupa tests relacionados bajo un nombre
- `it` / `test` — un caso de prueba individual
- `expect(...).toBe(...)` — la assertion: qué esperabas vs qué obtuviste
- `beforeAll` — se ejecuta UNA VEZ antes de todos los tests del `describe`
- `beforeEach` — se ejecuta ANTES de CADA test individual
- Por qué `jest.clearAllMocks()` en `beforeEach` — para que el estado de un mock no contamine al siguiente test
- Qué significa `it.todo('descripción')` — documenta un test que DEBE existir pero todavía no está implementado. Es deuda técnica visible

---

## 4.2 — Mocks: el concepto más importante de testing

### Qué es
Un **mock** es un reemplazo falso de una dependencia real. Cuando testeas un controller que consulta la DB, no quieres que el test dependa de que PostgreSQL esté corriendo.

### Dónde está en tu código
```javascript name=tests/helpers/mockDb.js url=https://github.com/dferram/RazoConnect/blob/c15f0c5afb85dddae426b092e15a32f3e139f019/tests/helpers/mockDb.js#L1-L11
const createMockDb = () => ({
  query: jest.fn(), // Función falsa que puedes configurar para devolver lo que quieras
  pool: {
    connect: jest.fn().mockResolvedValue({ query: jest.fn(), release: jest.fn() })
  }
});
```

```javascript name=tests/helpers/mockAuth.js url=https://github.com/dferram/RazoConnect/blob/c15f0c5afb85dddae426b092e15a32f3e139f019/tests/helpers/mockAuth.js#L1-L20
// mockAuth.js — genera tokens de test sin Redis ni DB real
const tokenFor = (payload) => generateToken(payload, '1h');
const mockCliente = (overrides = {}) => ({ userId: 1, rol: 'cliente', tenant_id: 1, ... });
```

### Qué debes poder explicar
- `jest.fn()` — crea una función vacía que registra cuántas veces fue llamada y con qué argumentos
- `jest.fn().mockResolvedValueOnce(data)` — la primera vez que se llama, devuelve `data`. Ideal para simular una query de DB
- `jest.mock('../db')` — reemplaza el módulo real con uno mockeado en TODO el archivo de test
- Por qué mockeas la DB — los tests deben ser **deterministas** (siempre dan el mismo resultado), **rápidos** (sin I/O real) e **independientes** (no dependen de estado externo)
- Diferencia entre mock, stub y spy — mock reemplaza completamente, stub solo define el return value, spy envuelve la función real para observarla

---

## 4.3 — Supertest: Integration Testing

### Qué es
**Supertest** te permite hacer requests HTTP reales a tu Express app sin levantar un servidor en un puerto. Prueba que tus rutas, middlewares y controllers trabajan juntos correctamente.

### Cómo funciona en tu proyecto
```javascript
// tests/integration/routes/auth.test.js
const request = require('supertest');
const app = require('../../index'); // Tu app Express

it('POST /api/login debe retornar 401 con credenciales inválidas', async () => {
  const response = await request(app)
    .post('/api/login')
    .send({ Email: 'fake@test.com', Password: 'wrong' })
    .expect(401);

  expect(response.body.success).toBe(false);
});
```

### Qué debes poder explicar
- Diferencia entre test unitario e integración — unitario prueba una función en aislamiento, integración prueba el sistema completo (ruta → middleware → controller → respuesta)
- Por qué en tests de integración también mockeas la DB — para que el test no dependa de datos reales
- Cómo simulas un usuario autenticado en Supertest — generas un token de test con `mockAuth.tokenFor()` y lo mandas en el header `Authorization`
- Por qué Supertest no necesita `app.listen()` — llama directamente a la app como función, sin abrir un puerto TCP

---

## 4.4 — Cobertura de código

### Qué es
La **cobertura** (coverage) mide qué porcentaje del código fue ejecutado durante los tests.

### Cómo la corres en tu proyecto
```bash
npm run test:coverage
# Genera reporte en coverage/lcov-report/index.html
```

### Las 4 métricas que debes conocer
| Métrica | Qué mide |
|---------|---------|
| **Statements** | % de líneas de código ejecutadas |
| **Branches** | % de ramas `if/else` ejecutadas |
| **Functions** | % de funciones llamadas |
| **Lines** | Similar a statements |

La más importante es **Branches** — puedes tener 100% de statements y aun así nunca haber probado el `else` de un `if`.

### Pregunta de entrevista
> *"Tienes 86% de cobertura. ¿Eso significa que tu código es 86% correcto?"*
> **Respuesta:** No. Cobertura mide si el código fue ejecutado, no si funciona correctamente. Puedes tener 100% de cobertura y todos los asserts mal escritos. La cobertura es un indicador de qué código NO se ha probado, no una garantía de calidad.

---

# MÓDULO 5 — INFRAESTRUCTURA Y DevOps

## 5.1 — CI/CD con GitHub Actions

### Qué es
**CI/CD** (Continuous Integration / Continuous Deployment) es automatizar el proceso de verificar y desplegar código. Cada vez que haces push a `main`, una pipeline automática corre los tests y despliega a Azure si todo pasa.

### Dónde está en tu código
```yaml name=.github/workflows/main_razoconnect-api.yml url=https://github.com/dferram/RazoConnect/blob/c15f0c5afb85dddae426b092e15a32f3e139f019/docs/DEPLOYMENT_AND_TROUBLESHOOTING.md#L579-L616
# En cada push a main:
# 1. checkout del código
# 2. setup Node 18
# 3. npm install
# 4. npm test  ← GATE: si falla, no despliega
# 5. zip del proyecto
# 6. deploy a Azure Web App
```

### 🧠 Qué debes poder explicar
- Qué es un **job** y un **step** en GitHub Actions
- Por qué los tests van ANTES del deploy — es el "quality gate". Código roto nunca llega a producción
- Qué es `workflow_dispatch` — te permite correr la pipeline manualmente desde la UI de GitHub
- Qué es un **artifact** — el zip del proyecto que se pasa del job `build` al job `deploy`
- Por qué usas `ubuntu-latest` como runner — es un ambiente limpio y reproducible

---

## 5.2 — Azure App Service

### 📖 Qué es
Azure App Service es un PaaS (Platform as a Service) — Microsoft maneja el servidor, el OS, las actualizaciones. Tú solo subes tu código Node.js y él lo corre.

### 🔍 Archivos de configuración en tu repo
- `.deployment` — le dice a Azure cómo deployar
- `startup.sh` — script que corre al iniciar la instancia: `npm install --production && node index.js`
- `oryx.yml` — configuración del build system de Azure

### 🧠 Qué debes poder explicar
- Diferencia entre IaaS, PaaS y SaaS — IaaS = VM que tú administras, PaaS = plataforma administrada (Azure App Service), SaaS = software completo (tu producto para tus clientes)
- Por qué `trust proxy: 1` en Express es crítico en Azure — Azure termina el SSL en su load balancer. Sin `trust proxy`, `req.ip` devuelve la IP del load balancer, no del usuario real, rompiendo el rate limiting
- Qué son las **Application Settings** de Azure — variables de entorno que reemplazan a tu `.env` en producción. Nunca tienes el `.env` real en el servidor

---

## 5.3 — Winston: Logging estructurado

### Qué es
Winston es una librería de logging que escribe logs estructurados (JSON) en lugar de texto plano. Los logs JSON son parseables por herramientas de monitoreo como Azure Monitor o Datadog.

### Dónde está en tu código
```javascript
// En lugar de:
console.log('Error al procesar pedido ' + pedidoId);

// Usas:
logger.error('Error al procesar pedido', {
  pedidoId,
  requestId: req.requestId,  // Trazabilidad
  tenantId: req.tenant?.tenant_id,  // Contexto
  error: error.message
});
```

### Qué debes poder explicar
- Por qué JSON en logs — puedes filtrar por `tenantId`, `requestId`, hacer queries sobre los logs
- Qué es el `requestId` y por qué cada log lo incluye — si 1,000 requests llegan al mismo tiempo y algo falla, necesitas poder filtrar todos los logs de ESA request específica
- Niveles de log: `error > warn > info > debug` — en producción solo logueas `error` e `info`, en desarrollo también `debug`

---

## 5.4 — Conventional Commits

### Qué es
Un estándar de formato para mensajes de commits: `tipo(scope): descripción`.

### Dónde está en tu código
```javascript name=commitlint.config.js url=https://github.com/dferram/RazoConnect/blob/c15f0c5afb85dddae426b092e15a32f3e139f019/commitlint.config.js
// commitlint.config.js — rechaza commits que no siguen el formato
// Tipos: feat, fix, docs, test, refactor, chore, perf
```

### Qué debes poder explicar
- `feat:` — nueva funcionalidad (incrementa versión minor)
- `fix:` — corrección de bug (incrementa versión patch)
- `BREAKING CHANGE:` — cambio que rompe compatibilidad (incrementa versión major)
- Por qué esto importa — un `git log` con conventional commits es legible y permite generar changelogs automáticamente

---

# RESUMEN: SCORECARD DE DOMINIO

| Área | Tecnología | Nivel actual | Target entrevista |
|------|-----------|-------------|------------------|
| **Backend** | Node.js / Event Loop | 🟡 Usas, no explicas | 🟢 Explicar en 2 min |
| **Backend** | Express middleware pipeline | 🟡 Sabes el orden | 🟢 Explicar el por qué de cada paso |
| **Backend** | PostgreSQL + transacciones | 🟡 Escribes queries | 🟢 ACID, índices, EXPLAIN |
| **Backend** | Multi-tenancy row-level | 🟢 Lo implementaste | 🟢 Comparar los 3 modelos |
| **Backend** | FIFO + backorders | 🟡 Funciona | 🟢 Explicar race conditions |
| **Backend** | Redis: 3 casos de uso | 🟡 Lo configuraste | 🟢 Por qué Redis y no DB |
| **Seguridad** | JWT + JTI blacklist | 🟢 Implementado | 🟢 Explicar el flujo completo |
| **Seguridad** | bcrypt | 🟡 Lo usas | 🟢 Salt, timing-safe, por qué no SHA256 |
| **Seguridad** | OWASP Top 10 | 🟡 Parcial | 🟢 Mapear cada control a tu código |
| **Seguridad** | Rate limiting distribuido | 🟢 Implementado | 🟢 Por qué Redis es necesario |
| **Frontend** | Vanilla JS ES6+ / IIFE | 🟡 Lo escribes | 🟢 Scope, closures, async |
| **Frontend** | Fetch + CORS | 🟡 Lo usas | 🟢 Por qué CORS existe y quién lo configura |
| **Frontend** | Bootstrap 5 | 🟢 Lo usas bien | 🟢 Grid, breakpoints, componentes JS |
| **Testing** | Jest + mocks | 🟡 Tienes tests | 🟢 Por qué mockear, qué mide coverage |
| **Testing** | Supertest | 🟡 Tienes tests | 🟢 Diferencia unitario vs integración |
| **DevOps** | GitHub Actions CI/CD | 🟡 Funciona | 🟢 Explicar cada step y por qué |
| **DevOps** | Azure App Service | 🟡 Deployeas | 🟢 trust proxy, env vars, PaaS vs IaaS |
| **DevOps** | Winston + requestId | 🟢 Implementado | 🟢 Por qué logs estructurados |

---

## PLAN DE ESTUDIO — 8 SEMANAS

| Semana | Módulo | Tarea concreta |
|--------|--------|---------------|
| **1** | JWT completo (2.1 + 1.5) | Lee `jwtHelper.js`, `tokenController.js`, `redisClient.js` línea por línea. Explica el flujo de logout en voz alta sin ver el código |
| **2** | Node.js + Event Loop (1.1) | Busca en YouTube "Jake Archibald Event Loop talk". Luego explica por qué todos tus controllers son async |
| **3** | Multi-tenancy + middlewares (1.4 + 1.2) | Lee `tenantGuard.js`, `validateUserTenant.js`, `authMiddleware.js` completos. Dibuja el flujo en papel |
| **4** | PostgreSQL profundo (1.3) | Abre psql o pgAdmin, corre `EXPLAIN ANALYZE` en 3 queries de tu sistema. Aprende qué es un Sequential Scan vs Index Scan |
| **5** | FIFO + lógica de negocio (1.6) | Lee `SmartStockService.js` línea por línea. Explica `calculateAllocationStatus` en voz alta. Lee los tests unitarios de este service |
| **6** | Testing completo (Módulo 4) | Escribe 3 tests nuevos desde cero sin ayuda de IA. Uno unitario, uno de middleware, uno de integración |
| **7** | Seguridad OWASP (Módulo 2) | Para cada vulnerabilidad del OWASP Top 10, busca el control correspondiente en tu código. Prepara una respuesta de 1 minuto por cada una |
| **8** | DevOps + simulacro (Módulo 5) | Lee tu `main_razoconnect-api.yml` línea por línea. Haz un simulacro de entrevista completo respondiendo las 15 preguntas de abajo en voz alta |

---

##  LAS 15 PREGUNTAS QUE MÁS VAN A HACERTE

Practica responderlas en voz alta, sin notas, en máximo 2 minutos:

1. *"Explícame el Event Loop de Node.js y por qué importa para tu aplicación"*
2. *"¿Cómo funciona el pipeline de middlewares de tu app, de la primera línea al controller?"*
3. *"Si un usuario hace logout, ¿cómo garantizas que su JWT anterior ya no sirve?"*
4. *"Explícame tu arquitectura multi-tenant de principio a fin, sin código"*
5. *"¿Qué es una transacción en PostgreSQL y dónde la usas?"*
6. *"Dos pedidos simultáneos quieren el último producto en stock. ¿Qué pasa en tu sistema?"*
7. *"¿Por qué usas Redis para rate limiting y no un simple objeto en memoria?"*
8. *"¿Cuál es la diferencia entre hash y encrypt? ¿Por qué bcrypt y no SHA256?"*
9. *"¿Qué es CORS, quién lo configura y por qué existe?"*
10. *"¿Por qué mockeas la base de datos en tus tests?"*
11. *"Tienes 86% de cobertura. ¿Tu código es 86% correcto?"*
12. *"¿Qué es el Kardex y por qué es inmutable?"*
13. *"¿Cuál es la diferencia entre 401 y 403?"*
14. *"¿Qué es CI/CD y qué pasa si un test falla en tu pipeline?"*
15. *"¿Qué es FIFO aplicado a inventario y qué problema específico resuelve en RazoConnect?"*

---

**La diferencia entre 20 años con este proyecto y un Senior de 5 años no es el código — es la velocidad para articular por qué cada decisión existe. Ese músculo se entrena hablando, no leyendo.** 🎯

