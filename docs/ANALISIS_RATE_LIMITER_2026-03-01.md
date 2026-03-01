# ANÁLISIS COMPLETO DEL RATE LIMITER
**Fecha:** 2026-03-01  
**Archivo:** `middlewares/rateLimiter.js`  
**Estado:** ✅ CONFIGURADO CON AZURE REDIS

---

## 📊 CONFIGURACIÓN DE RATE LIMITERS

### 1. Global Limiter (Todas las rutas /api)
**Límite:** 300 peticiones / 15 minutos  
**Ventana:** 15 minutos (900,000 ms)  
**Prefix Redis:** `rl:global:`  
**Uso:** Protección general de la API

**Cálculo:**
- **Por minuto:** ~20 peticiones
- **Por segundo:** ~0.33 peticiones
- **Por hora:** ~1,200 peticiones

---

### 2. Auth Limiter (Login/Autenticación)
**Límite:** 10 peticiones / 15 minutos  
**Ventana:** 15 minutos  
**Prefix Redis:** `rl:auth:`  
**Uso:** Prevenir fuerza bruta en login

**Características:**
- ✅ `skipSuccessfulRequests: true` - NO penaliza logins exitosos
- ✅ Solo cuenta intentos fallidos
- ⚠️ Muy estricto: 10 intentos en 15 minutos

**Cálculo:**
- **Por minuto:** ~0.67 intentos
- **Por hora:** ~40 intentos fallidos

---

### 3. Tenant Rate Limiter (Por tenant)
**Límite:** 100 peticiones / 15 minutos  
**Ventana:** 15 minutos  
**Prefix Redis:** `rl:tenant:{tenantId}:`  
**Uso:** Evitar que un tenant abusivo afecte a otros

**Cálculo:**
- **Por minuto:** ~6.67 peticiones
- **Por segundo:** ~0.11 peticiones
- **Por hora:** ~400 peticiones

---

### 4. Heavy Operation Limiter (PDFs, Reportes)
**Límite:** 20 peticiones / 1 hora  
**Ventana:** 60 minutos  
**Prefix Redis:** `rl:heavy:{tenantId}:`  
**Uso:** Operaciones costosas (generación de PDFs, reportes)

**Cálculo:**
- **Por minuto:** ~0.33 peticiones
- **Por hora:** 20 peticiones

---

### 5. Admin Limiter (Panel administrativo)
**Límite:** 200 peticiones / 15 minutos  
**Ventana:** 15 minutos  
**Prefix Redis:** `rl:admin:`  
**Uso:** Endpoints administrativos

**Cálculo:**
- **Por minuto:** ~13.33 peticiones
- **Por segundo:** ~0.22 peticiones
- **Por hora:** ~800 peticiones

---

### 6. API Limiter (Legacy)
**Límite:** 100 peticiones / 15 minutos  
**Ventana:** 15 minutos  
**Prefix Redis:** `rl:api:`  
**Uso:** Compatibilidad con código legacy

---

### 7. Checkout Limiter (Carrito/Compras)
**Límite:** 30 peticiones / 10 minutos  
**Ventana:** 10 minutos  
**Prefix Redis:** `rl:checkout:`  
**Uso:** Operaciones de carrito

**Cálculo:**
- **Por minuto:** 3 peticiones
- **Por hora:** ~180 peticiones

---

### 8. Register Limiter (Registro de usuarios)
**Límite:** 3 peticiones / 1 hora  
**Ventana:** 60 minutos  
**Prefix Redis:** `rl:register:`  
**Uso:** Prevenir spam de registros

---

### 9. Password Reset Limiter (Recuperación de contraseña)
**Límite:** 3 peticiones / 1 hora  
**Ventana:** 60 minutos  
**Prefix Redis:** `rl:password:`  
**Uso:** Prevenir abuso de recuperación de contraseña

---

## 🔍 ANÁLISIS DE CAPACIDAD

### Escenario: Usuario Normal (Cliente)

**Límites Aplicables:**
1. **Global:** 300 req/15min
2. **Tenant:** 100 req/15min
3. **Checkout:** 30 req/10min

**Límite Efectivo:** El más restrictivo es **Tenant (100 req/15min)**

**Uso Típico:**
- Navegar catálogo: ~2-3 req/min
- Ver producto: ~1 req
- Agregar al carrito: ~1 req
- Checkout: ~5-10 req

**Capacidad Real:** Un usuario puede hacer ~100 peticiones en 15 minutos, suficiente para:
- Ver ~50 productos
- Agregar ~20 items al carrito
- Completar ~10 checkouts

---

### Escenario: Administrador

**Límites Aplicables:**
1. **Global:** 300 req/15min
2. **Admin:** 200 req/15min

**Límite Efectivo:** **Admin (200 req/15min)**

**Uso Típico:**
- Dashboard: ~10 req/min
- Gestión de pedidos: ~5 req/min
- Reportes: ~2 req/min

**Capacidad Real:** ~200 peticiones en 15 minutos = ~13 req/min

---

### Escenario: Operaciones Pesadas (PDFs)

**Límite:** 20 req/hora

**Uso Típico:**
- Generar remisión PDF: 1 req
- Exportar reporte Excel: 1 req
- Generar orden de compra PDF: 1 req

**Capacidad Real:** Un usuario puede generar ~20 documentos por hora

---

## ⚠️ PROBLEMAS POTENCIALES

### 1. Tenant Limiter Muy Restrictivo
**Problema:** 100 req/15min puede ser insuficiente para tiendas con alto tráfico

**Escenario Crítico:**
- 10 usuarios simultáneos navegando
- Cada uno hace 10 req/min
- Total: 100 req/min → **Límite alcanzado en 1 minuto**

**Recomendación:** Aumentar a 500 req/15min para tenants activos

---

### 2. Auth Limiter Demasiado Estricto
**Problema:** 10 intentos/15min puede bloquear usuarios legítimos

**Escenario:**
- Usuario olvida contraseña
- Intenta 3 veces con contraseña incorrecta
- Intenta recuperar contraseña (3 intentos)
- Intenta login nuevamente (4 intentos)
- **Total: 10 intentos → BLOQUEADO**

**Recomendación:** Aumentar a 20 intentos/15min

---

### 3. Heavy Operation Limiter Puede Bloquear Trabajo Normal
**Problema:** 20 req/hora puede ser insuficiente para admins generando reportes

**Escenario:**
- Admin genera 10 remisiones en la mañana
- Genera 5 reportes de inventario
- Genera 5 órdenes de compra
- **Total: 20 → BLOQUEADO por 1 hora**

**Recomendación:** Aumentar a 50 req/hora o 100 req/hora

---

## 🔧 CONFIGURACIÓN DE AZURE REDIS

**Host:** `process.env.REDIS_HOST`  
**Port:** 6380 (TLS)  
**TLS:** ✅ Obligatorio para Azure  
**Password:** `process.env.REDIS_PASSWORD`

**Características:**
- ✅ Conexión TLS segura
- ✅ Manejo de errores sin crashear la app
- ✅ Reconexión automática
- ✅ Logging detallado de eventos

---

## 📈 RECOMENDACIONES DE AJUSTE

### Inmediatas

1. **Aumentar Tenant Limiter:**
```javascript
max: 500, // De 100 a 500
```

2. **Aumentar Auth Limiter:**
```javascript
max: 20, // De 10 a 20
```

3. **Aumentar Heavy Operation Limiter:**
```javascript
max: 50, // De 20 a 50
```

### Mediano Plazo

1. **Implementar Rate Limiting Dinámico:**
   - Límites diferentes por plan de tenant (básico, pro, enterprise)
   - Límites más altos para usuarios verificados

2. **Agregar Whitelist de IPs:**
   - IPs de oficina sin límite
   - IPs de servicios externos (webhooks)

3. **Implementar Burst Allowance:**
   - Permitir ráfagas cortas de tráfico
   - Ejemplo: 50 req en 1 minuto, luego 100 req/15min

---

## 🎯 LÍMITES RECOMENDADOS ACTUALIZADOS

| Limiter | Actual | Recomendado | Razón |
|---------|--------|-------------|-------|
| Global | 300/15min | 500/15min | Más capacidad general |
| Auth | 10/15min | 20/15min | Evitar bloqueos legítimos |
| Tenant | 100/15min | 500/15min | Soportar más tráfico |
| Heavy | 20/hora | 50/hora | Admins necesitan más reportes |
| Admin | 200/15min | 300/15min | Más operaciones admin |
| Checkout | 30/10min | 50/10min | Más flexibilidad en compras |

---

## 🔐 SEGURIDAD

**Protecciones Activas:**
- ✅ Prevención de fuerza bruta (authLimiter)
- ✅ Prevención de DDoS (globalLimiter)
- ✅ Aislamiento por tenant (tenantRateLimiter)
- ✅ Protección de operaciones costosas (heavyOperationLimiter)

**Headers de Respuesta:**
- `RateLimit-Limit`: Límite máximo
- `RateLimit-Remaining`: Peticiones restantes
- `RateLimit-Reset`: Timestamp de reset

**Respuesta 429 (Too Many Requests):**
```json
{
  "success": false,
  "error": "Demasiadas peticiones...",
  "retryAfter": "15 minutos"
}
```

---

## 📝 CONCLUSIONES

### Estado Actual
- ✅ Rate limiting funcional con Azure Redis
- ✅ Múltiples limiters para diferentes casos de uso
- ⚠️ Algunos límites demasiado restrictivos

### Capacidad Real
- **Usuario normal:** ~100 req/15min (suficiente para navegación)
- **Admin:** ~200 req/15min (puede ser insuficiente)
- **Operaciones pesadas:** 20/hora (muy restrictivo)

### Acción Requerida
1. Ajustar límites según recomendaciones
2. Monitorear logs de rate limiting
3. Implementar límites dinámicos por plan

---

**Responsable:** Cascade AI  
**Próxima Revisión:** 2026-03-15
