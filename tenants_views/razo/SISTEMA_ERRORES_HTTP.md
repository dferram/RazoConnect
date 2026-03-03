# Sistema Unificado de Manejo de Errores HTTP

## 📋 Resumen Ejecutivo

Sistema consistente de manejo de errores HTTP que redirige automáticamente a páginas de error personalizadas, tanto para navegación directa como para peticiones AJAX/fetch.

---

## 🎯 Páginas de Error Disponibles

| Código | Página | Emoji | Mensaje Principal | Acción del Botón |
|--------|--------|-------|-------------------|------------------|
| **401** | `401.html` | 🔒 | "Acceso no autorizado" | Iniciar sesión → `/login.html` |
| **403** | `403.html` | 🚫 | "Acceso denegado" | Volver al inicio (según rol) |
| **404** | `404.html` | 🦊 | "Página no encontrada" | Ir al inicio (según rol) |
| **429** | `429.html` | ⏱️ | "Demasiadas solicitudes" | Entendido → `history.back()` |
| **500** | `500.html` | ⚠️ | "Error del servidor" | Recargar página |
| **503** | `503.html` | 🔧 | "Servicio en mantenimiento" | Verificar estado (link externo) |

---

## 🔄 Flujo Unificado de Errores

### **Antes (Inconsistente)**
```
AJAX/fetch → ErrorHandler → SweetAlert modal → Usuario sigue en página
Navegación → Backend → Página HTML → Usuario ve error completo
```

### **Ahora (Consistente)**
```
AJAX/fetch → ErrorHandler → Redirige a página HTML
Navegación → Backend → Sirve página HTML
Resultado: SIEMPRE página de error completa
```

---

## 🛠️ Componentes del Sistema

### 1. **Frontend: `error-handler.js`**
**Ubicación:** `tenants_views/razo/js/utils/error-handler.js`

**Función:** Intercepta errores HTTP en peticiones fetch/AJAX y redirige a páginas de error.

```javascript
class ErrorHandler {
  setupGlobalErrorHandling() {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      
      // Interceptar errores y redirigir
      if (response.status === 401) this.handle401Error(args[0]);
      if (response.status === 403) this.handle403Error(args[0]);
      if (response.status === 429) this.handle429Error(args[0]);
      if (response.status === 500) this.handle500Error(args[0]);
      if (response.status === 503) this.handle503Error(args[0]);
      
      return response;
    };
  }
  
  handle401Error(url) {
    // Limpiar sesión
    localStorage.removeItem('razoconnect_admin');
    localStorage.removeItem('razoconnect_agente');
    localStorage.removeItem('razoconnect_cliente');
    localStorage.removeItem('razoconnect_permissions');
    
    // Redirigir
    window.location.href = '/401.html';
  }
  
  handle403Error(url) {
    window.location.href = '/403.html';
  }
  
  // ... otros handlers
}
```

**Características:**
- ✅ Intercepta `window.fetch` globalmente
- ✅ Limpia localStorage en errores 401
- ✅ Redirige con `setTimeout(100ms)` para evitar race conditions
- ✅ Logs en consola para debugging

---

### 2. **Backend: Middleware en `index.js`**
**Ubicación:** `index.js` líneas 454-485

**Función:** Sirve páginas de error cuando el backend detecta errores HTTP.

```javascript
app.use((err, req, res, next) => {
  const tenantFolder = req.tenant?.tema || 'razo';
  const errorPage = path.join(__dirname, "tenants_views", tenantFolder);
  
  if (err.status === 401 || res.statusCode === 401) {
    return res.status(401).sendFile(path.join(errorPage, "401.html"));
  }
  
  if (err.status === 403 || res.statusCode === 403) {
    return res.status(403).sendFile(path.join(errorPage, "403.html"));
  }
  
  if (err.status === 429 || res.statusCode === 429) {
    return res.status(429).sendFile(path.join(errorPage, "429.html"));
  }
  
  if (err.status === 503 || res.statusCode === 503) {
    return res.status(503).sendFile(path.join(errorPage, "503.html"));
  }
  
  if (err.status >= 500 || res.statusCode >= 500) {
    return res.status(500).sendFile(path.join(errorPage, "500.html"));
  }
  
  next(err);
});
```

**Características:**
- ✅ Multi-tenant: usa carpeta según `req.tenant.tema`
- ✅ Maneja tanto `err.status` como `res.statusCode`
- ✅ Fallback a `500.html` para errores 5xx no específicos

---

### 3. **Páginas HTML de Error**
**Ubicación:** `tenants_views/razo/[401-503].html`

**Diseño Consistente:**
- Gradiente naranja (`#FFF7ED` → `#FFEDD5`)
- Logo de RazoConnect
- Emoji animado (bounce)
- Mensaje principal en naranja (`#F97316`)
- Subtítulo con código de error
- Mensaje explicativo
- Botón de acción naranja
- Footer con copyright
- Partículas decorativas animadas

**Responsive:**
- Mobile: Emoji 80px, texto reducido
- Desktop: Emoji 120px, texto completo

---

## 📊 Escenarios de Uso

### **Escenario 1: Usuario intenta eliminar un producto sin permiso**
```
1. Usuario en /admin-productos.html
2. Click en "Eliminar producto"
3. fetch('/api/admin/productos/123', { method: 'DELETE' })
4. Backend responde 403
5. ErrorHandler intercepta
6. Redirige a /403.html
7. Usuario ve página de error 403
8. Click en "Volver al inicio" → /admin-dashboard.html
```

### **Escenario 2: Token expirado durante navegación**
```
1. Usuario navega a /admin-finanzas.html
2. Backend verifica token en middleware
3. Token expirado → responde 401
4. Middleware sirve 401.html
5. Usuario ve página de error 401
6. Click en "Iniciar sesión" → /login.html
```

### **Escenario 3: Rate limiting activado**
```
1. Usuario hace múltiples requests rápidos
2. Backend activa rate limiting
3. Responde 429
4. ErrorHandler intercepta (si es fetch) O middleware sirve (si es navegación)
5. Usuario ve página de error 429
6. Click en "Entendido" → vuelve a página anterior
```

### **Escenario 4: Error del servidor**
```
1. Usuario hace una acción
2. Backend tiene error interno
3. Responde 500
4. ErrorHandler intercepta O middleware sirve
5. Usuario ve página de error 500
6. Click en "Recargar página" → recarga la página actual
```

---

## 🔐 Integración con Sistema de Permisos

### **Verificación Preventiva**
Antes de hacer una petición, puedes verificar permisos:

```javascript
// Verificar permiso antes de ejecutar
await window.ErrorHandler.checkPermissionAndExecute(
  'productos',      // módulo
  'eliminar',       // acción
  async () => {     // callback si tiene permiso
    const response = await fetch('/api/admin/productos/123', {
      method: 'DELETE'
    });
    // ... manejar respuesta
  },
  () => {           // callback si NO tiene permiso (opcional)
    console.log('Permiso denegado');
  }
);
```

Si no tiene permiso, automáticamente redirige a `/403.html`.

---

## 🎨 Personalización por Tenant

El sistema es multi-tenant. Cada tenant puede tener sus propias páginas de error:

```
tenants_views/
├── razo/
│   ├── 401.html
│   ├── 403.html
│   ├── 404.html
│   ├── 429.html
│   ├── 500.html
│   └── 503.html
├── otro_tenant/
│   ├── 401.html
│   └── ... (mismas páginas)
```

El middleware automáticamente sirve las páginas del tenant correcto según `req.tenant.tema`.

---

## 🧪 Testing

### **Probar 404**
```
http://localhost:8080/pagina-que-no-existe
http://localhost:8080/noexiste.html
```

### **Probar 401**
```javascript
// En consola del navegador
fetch('/api/admin/pedidos', {
  headers: { 'Authorization': 'Bearer token-invalido' }
});
```

### **Probar 403**
```javascript
// Intentar acción sin permisos
fetch('/api/admin/productos/1', { method: 'DELETE' });
```

### **Probar 500**
```
// Provocar error en backend (ej: endpoint que lanza error)
```

---

## 📝 Logs y Debugging

Todos los errores se registran en consola:

```
⚠️ [401] Token inválido o expirado
⚠️ [403] Acceso denegado a: /api/admin/productos/123
⚠️ [404] Archivo no encontrado: pagina-falsa.html
⚠️ [429] Demasiadas solicitudes a: /api/admin/pedidos
❌ [500] Error del servidor en: /api/admin/reportes
❌ [503] Servicio no disponible: /api/admin/inventario
```

---

## ✅ Ventajas del Sistema Unificado

1. **Consistencia Total**
   - Mismo comportamiento para AJAX y navegación
   - Misma UX en todos los errores

2. **Mejor UX**
   - Páginas completas en lugar de modales
   - Mensajes claros y accionables
   - Botones contextuales según el error

3. **Seguridad**
   - Limpieza automática de sesión en 401
   - No expone información sensible
   - Redirecciones seguras

4. **Mantenibilidad**
   - Código centralizado
   - Fácil de modificar
   - Sin dependencias externas (no CDN)

5. **Multi-tenant**
   - Cada tenant puede personalizar sus páginas
   - Branding consistente

6. **SEO y Accesibilidad**
   - Status codes correctos (401, 403, 404, etc.)
   - HTML semántico
   - Sin JavaScript requerido para mostrar error

---

## 🚀 Próximos Pasos Opcionales

1. **Analytics de Errores**
   - Registrar errores en base de datos
   - Dashboard de errores más comunes

2. **Personalización Avanzada**
   - Mensajes específicos según módulo
   - Sugerencias de acción según contexto

3. **Internacionalización**
   - Páginas de error en múltiples idiomas
   - Detección automática de idioma

4. **Rate Limiting Inteligente**
   - Mostrar tiempo de espera en 429.html
   - Contador regresivo antes de permitir retry

---

## 📚 Referencias

- **Páginas de Error:** `tenants_views/razo/[401-503].html`
- **Error Handler:** `tenants_views/razo/js/utils/error-handler.js`
- **Middleware Backend:** `index.js` líneas 454-485
- **Sistema de Permisos:** `tenants_views/razo/js/utils/permissions-manager.js`
- **Tests Frontend:** `tests/frontend/permissions-system.test.js`
- **Tests Backend:** `tests/roles/*.test.js`

---

**Última actualización:** 3 de marzo de 2026  
**Versión:** 1.0.0  
**Estado:** ✅ Producción
