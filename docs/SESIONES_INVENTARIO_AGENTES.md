# Sistema de Sesiones de Inventario con Control de Acceso por Agentes

## 📋 Resumen

Se ha implementado un sistema completo de gestión de sesiones de inventario con asignación de agentes y control de acceso estricto. Los administradores pueden crear sesiones y asignar agentes específicos, quienes serán los únicos con acceso a esas sesiones.

---

## 🗄️ Base de Datos

### Nueva Tabla: `sesiones_inventario`

```sql
CREATE TABLE public.sesiones_inventario (
    sesion_id SERIAL PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    descripcion TEXT,
    fecha_inicio TIMESTAMP NOT NULL DEFAULT NOW(),
    fecha_fin TIMESTAMP,
    estatus VARCHAR(50) NOT NULL DEFAULT 'ACTIVA' 
        CHECK (estatus IN ('ACTIVA', 'PAUSADA', 'FINALIZADA', 'CANCELADA')),
    agente_asignado_id INTEGER REFERENCES agentesdeventas(agenteid) ON DELETE SET NULL,
    admin_creador_id INTEGER NOT NULL REFERENCES administradores(adminid) ON DELETE RESTRICT,
    tenant_id INTEGER NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT NOW(),
    fecha_actualizacion TIMESTAMP NOT NULL DEFAULT NOW(),
    notas TEXT,
    CONSTRAINT sesiones_inventario_tenant_nombre_unique UNIQUE (tenant_id, nombre, fecha_inicio)
);
```

### Índices Creados

- `idx_sesiones_inventario_tenant` - Para consultas por tenant
- `idx_sesiones_inventario_agente` - Para consultas por agente asignado
- `idx_sesiones_inventario_estatus` - Para filtros por estatus

### Trigger Automático

- `trigger_update_sesiones_inventario_timestamp` - Actualiza `fecha_actualizacion` automáticamente

---

## 🔧 Backend

### Archivo: `controllers/inventarioController.js`

#### Funciones Implementadas

1. **`crearSesionInventario(req, res)`**
   - Solo administradores pueden crear sesiones
   - Valida nombre obligatorio
   - Registra el admin creador y tenant_id
   - Retorna la sesión creada con `sesion_id`

2. **`listarSesionesInventario(req, res)`**
   - **Control de Acceso Crítico:**
     - **Admin:** Ve todas las sesiones del tenant
     - **Agente:** Solo ve sesiones donde `agente_asignado_id = su ID`
   - Soporta filtros por estatus
   - Paginación incluida (default: 20 por página)
   - Retorna información del agente asignado y admin creador

3. **`obtenerSesionInventario(req, res)`**
   - Obtiene detalle de una sesión específica
   - **Validación de Seguridad 403:**
     - Si un agente intenta acceder a una sesión no asignada, retorna `403 Forbidden`
   - Retorna información completa incluyendo agente y admin

4. **`asignarAgenteASesion(req, res)`**
   - Solo administradores pueden asignar agentes
   - Valida que la sesión y el agente existan y pertenezcan al tenant
   - Valida que el agente esté activo
   - Actualiza `agente_asignado_id` en la sesión
   - Retorna información del agente asignado

5. **`obtenerAgentesDisponibles(req, res)`**
   - Solo administradores pueden ver la lista
   - Retorna agentes activos del tenant
   - Ordenados por nombre y apellido

6. **`actualizarEstatusSesion(req, res)`**
   - Solo administradores pueden actualizar estatus
   - Valida estatus válidos: ACTIVA, PAUSADA, FINALIZADA, CANCELADA
   - Actualiza `fecha_fin` automáticamente cuando se marca como FINALIZADA

---

### Archivo: `routes/inventario.js`

#### Endpoints Implementados

| Método | Ruta | Middleware | Descripción |
|--------|------|------------|-------------|
| POST | `/api/inventario/sesiones` | `authenticate`, `authorizeAdmin` | Crear nueva sesión |
| GET | `/api/inventario/sesiones` | `authenticate` | Listar sesiones (con control de acceso) |
| GET | `/api/inventario/sesiones/:sesionId` | `authenticate` | Obtener detalle de sesión (validación 403) |
| PUT | `/api/inventario/sesiones/:sesionId/asignar-agente` | `authenticate`, `authorizeAdmin` | Asignar agente a sesión |
| GET | `/api/inventario/agentes-disponibles` | `authenticate`, `authorizeAdmin` | Obtener lista de agentes |
| PUT | `/api/inventario/sesiones/:sesionId/estatus` | `authenticate`, `authorizeAdmin` | Actualizar estatus de sesión |

---

## 🎨 Frontend

### Archivo: `tenants_views/razo/admin-toma-inventario.html`

#### Cambios Implementados

1. **Nueva Sección: Agente Asignado**
   ```html
   <div id="agenteAsignadoBlock">
     <div>Agente Asignado</div>
     <div id="agenteAsignadoNombre">—</div>
     <button id="btnAsignarAgente" onclick="mostrarModalAsignarAgente()">
       Asignar Agente
     </button>
   </div>
   ```

2. **Modal de Selección de Agente (SweetAlert2)**
   - Diseño moderno con tarjetas seleccionables
   - Avatar con iniciales del agente
   - Información completa: nombre, email, código
   - Efecto hover y selección visual
   - Validación de selección obligatoria

3. **Flujo de Creación de Sesión**
   ```javascript
   // 1. Admin crea sesión
   crearSesion() → POST /api/inventario/sesiones
   
   // 2. Automáticamente se abre modal de asignación
   mostrarModalAsignarAgente()
   
   // 3. Admin selecciona agente
   asignarAgenteASesion(agenteId) → PUT /api/inventario/sesiones/:id/asignar-agente
   
   // 4. Confirmación y actualización de UI
   ```

4. **Funciones JavaScript Agregadas**

   - **`mostrarModalAsignarAgente()`**
     - Carga lista de agentes disponibles
     - Renderiza modal con SweetAlert2
     - Maneja selección interactiva
     - Valida selección antes de confirmar

   - **`asignarAgenteASesion(agenteId)`**
     - Envía petición PUT al backend
     - Actualiza UI con nombre del agente
     - Muestra confirmación de éxito
     - Cambia botón a "Reasignar Agente"

   - **`updateAgenteDisplay()`**
     - Actualiza display del agente al cambiar sesión
     - Muestra "Sin asignar" en rojo si no hay agente
     - Muestra nombre del agente en naranja si está asignado

   - **`fillSesionesSelect(sesiones, preferId)`**
     - Modificada para incluir nombre del agente en el select
     - Formato: `#ID — Nombre (ESTATUS) [Agente]`
     - Guarda nombre del agente en data-attribute

5. **Actualización de `loadSesiones()`**
   - Ahora usa endpoint `/api/inventario/sesiones`
   - Filtra por `estatus=ACTIVA`
   - Carga información del agente asignado

---

## 🔒 Seguridad y Control de Acceso

### Reglas de Negocio Implementadas

1. **Creación de Sesiones**
   - ✅ Solo administradores pueden crear sesiones
   - ✅ El admin creador queda registrado en `admin_creador_id`
   - ✅ Aislamiento por tenant automático

2. **Asignación de Agentes**
   - ✅ Solo administradores pueden asignar/reasignar agentes
   - ✅ Solo se pueden asignar agentes activos del mismo tenant
   - ✅ Un agente puede ser reasignado en cualquier momento

3. **Listado de Sesiones**
   - ✅ **Admin:** Ve todas las sesiones del tenant
   - ✅ **Agente:** Solo ve sesiones donde `agente_asignado_id = su ID`
   - ✅ Si un agente no tiene sesiones asignadas, la lista aparece vacía

4. **Acceso a Sesión Específica**
   - ✅ **Admin:** Puede acceder a cualquier sesión del tenant
   - ✅ **Agente:** Solo puede acceder a sesiones asignadas a él
   - ✅ **Validación 403:** Si un agente intenta acceder vía URL a una sesión no asignada, recibe error 403 Forbidden

5. **Actualización de Estatus**
   - ✅ Solo administradores pueden cambiar estatus
   - ✅ Estatus válidos: ACTIVA, PAUSADA, FINALIZADA, CANCELADA
   - ✅ Al marcar como FINALIZADA, se registra `fecha_fin` automáticamente

---

## 🎯 Flujo de Trabajo Completo

### Escenario: Admin crea sesión y asigna agente

```
1. Admin accede a admin-toma-inventario.html
   └─ Ve formulario "Nueva sesión"

2. Admin ingresa nombre: "Auditoría Sucursal Centro"
   └─ Click en "Crear"

3. Backend crea sesión
   └─ POST /api/inventario/sesiones
   └─ Retorna: { sesion_id: 123, nombre: "...", estatus: "ACTIVA" }

4. Frontend abre modal automáticamente
   └─ GET /api/inventario/agentes-disponibles
   └─ Muestra lista de agentes con avatares

5. Admin selecciona agente "José García"
   └─ Click en tarjeta del agente
   └─ Tarjeta se marca con borde naranja y check verde

6. Admin confirma "Asignar Agente"
   └─ PUT /api/inventario/sesiones/123/asignar-agente
   └─ Body: { agenteId: 2 }

7. Backend valida y asigna
   └─ Verifica que sesión y agente existan
   └─ Verifica que agente esté activo
   └─ UPDATE sesiones_inventario SET agente_asignado_id = 2

8. Frontend muestra confirmación
   └─ SweetAlert: "José García ha sido asignado exitosamente"
   └─ UI actualizada: "Agente Asignado: José García"
   └─ Botón cambia a "Reasignar Agente"

9. Agente José García ve la sesión
   └─ GET /api/inventario/sesiones
   └─ WHERE agente_asignado_id = 2
   └─ Retorna solo sesiones asignadas a él
```

### Escenario: Agente intenta acceder a sesión no asignada

```
1. Agente intenta URL directa
   └─ /admin-toma-inventario.html?sesionId=999

2. Frontend carga sesión
   └─ GET /api/inventario/sesiones/999

3. Backend valida acceso
   └─ Verifica: sesion.agente_asignado_id === req.user.agenteId
   └─ Resultado: NO COINCIDE

4. Backend retorna 403 Forbidden
   └─ { success: false, message: "No tienes permiso..." }

5. Frontend muestra error
   └─ Toast: "No tienes permiso para acceder a esta sesión"
   └─ Sesión no se carga
```

---

## 📊 Ejemplos de Respuestas API

### POST /api/inventario/sesiones
```json
{
  "success": true,
  "message": "Sesión de inventario creada exitosamente",
  "data": {
    "sesion": {
      "sesion_id": 123,
      "nombre": "Auditoría Sucursal Centro",
      "descripcion": null,
      "fecha_inicio": "2026-01-28T15:50:00.000Z",
      "estatus": "ACTIVA",
      "fecha_creacion": "2026-01-28T15:50:00.000Z"
    }
  }
}
```

### GET /api/inventario/sesiones (Admin)
```json
{
  "success": true,
  "data": {
    "sesiones": [
      {
        "sesion_id": 123,
        "nombre": "Auditoría Sucursal Centro",
        "descripcion": null,
        "fecha_inicio": "2026-01-28T15:50:00.000Z",
        "fecha_fin": null,
        "estatus": "ACTIVA",
        "notas": null,
        "agente_asignado_id": 2,
        "agente_nombre": "José García",
        "agente_email": "jose@example.com",
        "admin_creador": "Alejandra Calderón"
      }
    ],
    "pagination": {
      "total": 1,
      "page": 1,
      "limit": 20,
      "totalPages": 1
    }
  }
}
```

### GET /api/inventario/sesiones (Agente sin sesiones)
```json
{
  "success": true,
  "data": {
    "sesiones": [],
    "pagination": {
      "total": 0,
      "page": 1,
      "limit": 20,
      "totalPages": 0
    }
  }
}
```

### PUT /api/inventario/sesiones/123/asignar-agente
```json
{
  "success": true,
  "message": "Agente José García asignado exitosamente a la sesión \"Auditoría Sucursal Centro\"",
  "data": {
    "sesionId": 123,
    "agenteId": 2,
    "agenteNombre": "José García",
    "agenteEmail": "jose@example.com"
  }
}
```

### GET /api/inventario/sesiones/999 (Agente no autorizado)
```json
{
  "success": false,
  "message": "No tienes permiso para acceder a esta sesión de inventario"
}
```

---

## 🚀 Instrucciones de Despliegue

### 1. Ejecutar Migración de Base de Datos

```bash
psql -U ferram -d razoconnect -f migrations/add_sesiones_inventario.sql
```

### 2. Verificar Tablas Creadas

```sql
-- Verificar tabla
SELECT * FROM sesiones_inventario LIMIT 1;

-- Verificar índices
\d sesiones_inventario
```

### 3. Reiniciar Servidor Node.js

```bash
# Detener servidor
Ctrl + C

# Iniciar servidor
npm start
```

### 4. Verificar Endpoints

```bash
# Test de creación (requiere token admin)
curl -X POST http://localhost:3000/api/inventario/sesiones \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Test Sesión"}'

# Test de listado
curl -X GET http://localhost:3000/api/inventario/sesiones \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 🧪 Testing Manual

### Caso de Prueba 1: Crear Sesión y Asignar Agente

1. Login como Admin
2. Ir a `/admin-toma-inventario.html`
3. Ingresar nombre: "Prueba Sesión 1"
4. Click "Crear"
5. Verificar que se abre modal con lista de agentes
6. Seleccionar un agente
7. Click "Asignar Agente"
8. Verificar mensaje de éxito
9. Verificar que aparece nombre del agente en la UI

### Caso de Prueba 2: Agente Ve Solo Sus Sesiones

1. Login como Agente (ej: José García)
2. Ir a `/admin-toma-inventario.html`
3. Abrir dropdown "Sesión activa"
4. Verificar que solo aparecen sesiones asignadas a José
5. Verificar que sesiones de otros agentes NO aparecen

### Caso de Prueba 3: Validación 403

1. Login como Agente A
2. Crear sesión y asignar a Agente B
3. Copiar URL con `?sesionId=X`
4. Logout y login como Agente A
5. Pegar URL directa
6. Verificar error 403 y mensaje de permiso denegado

### Caso de Prueba 4: Reasignar Agente

1. Login como Admin
2. Seleccionar sesión existente con agente asignado
3. Click "Reasignar Agente"
4. Seleccionar otro agente
5. Confirmar
6. Verificar que el nuevo agente aparece en la UI
7. Verificar que el agente anterior ya no ve la sesión

---

## 📝 Notas Importantes

### Compatibilidad con Sistema Existente

- ✅ No afecta funcionalidad existente de auditoría de inventario
- ✅ Compatible con endpoints legacy `/admin/auditoria-inventario/*`
- ✅ Puede coexistir con sistema antiguo durante migración
- ✅ Aislamiento por tenant garantizado

### Consideraciones de Performance

- Índices creados en columnas de búsqueda frecuente
- Paginación implementada para evitar carga masiva
- JOIN optimizado con LEFT JOIN para agentes (puede ser NULL)

### Seguridad

- ✅ Validación de permisos en cada endpoint
- ✅ Validación de tenant_id en todas las consultas
- ✅ Protección contra SQL injection (uso de parámetros)
- ✅ Validación de tipos de datos
- ✅ Error 403 explícito para accesos no autorizados

### Extensibilidad Futura

- Campo `descripcion` disponible para más detalles
- Campo `notas` para comentarios adicionales
- Trigger de actualización automática de timestamp
- Estatus extensible (agregar nuevos valores al CHECK)

---

## 🐛 Troubleshooting

### Problema: Modal no se abre al crear sesión

**Causa:** Error en carga de agentes
**Solución:** 
1. Verificar que existan agentes activos en la BD
2. Revisar console del navegador
3. Verificar endpoint `/api/inventario/agentes-disponibles`

### Problema: Agente ve todas las sesiones

**Causa:** Control de acceso no aplicado
**Solución:**
1. Verificar que el token incluya `roles: ['agente']`
2. Revisar logs del backend para ver query SQL
3. Verificar que `isAgent && !isAdmin` se evalúe correctamente

### Problema: Error 403 para admin

**Causa:** Token no incluye rol 'admin'
**Solución:**
1. Verificar estructura del token JWT
2. Asegurar que `req.user.roles` incluya 'admin'
3. Regenerar token si es necesario

### Problema: Sesión no aparece en dropdown

**Causa:** Estatus diferente a 'ACTIVA'
**Solución:**
1. Verificar estatus en BD: `SELECT estatus FROM sesiones_inventario WHERE sesion_id = X`
2. Cambiar filtro en frontend si se requieren otros estatus
3. Actualizar estatus: `UPDATE sesiones_inventario SET estatus = 'ACTIVA' WHERE sesion_id = X`

---

## 📚 Referencias

- **Tabla principal:** `sesiones_inventario`
- **Controlador:** `controllers/inventarioController.js`
- **Rutas:** `routes/inventario.js`
- **Frontend:** `tenants_views/razo/admin-toma-inventario.html`
- **Migración:** `migrations/add_sesiones_inventario.sql`

---

## ✅ Checklist de Implementación

- [x] Migración de base de datos creada
- [x] Tabla `sesiones_inventario` con todos los campos
- [x] Índices de performance creados
- [x] Trigger de actualización automática
- [x] Controlador con 6 funciones implementadas
- [x] Control de acceso por rol (admin/agente)
- [x] Validación 403 para accesos no autorizados
- [x] Rutas registradas en `index.js`
- [x] Frontend integrado en página existente
- [x] Modal de selección de agente con SweetAlert2
- [x] Display de agente asignado en UI
- [x] Botón de reasignación funcional
- [x] Actualización automática de UI
- [x] Aislamiento por tenant garantizado
- [x] Documentación completa

---

**Fecha de Implementación:** 28 de Enero, 2026  
**Versión:** 1.0.0  
**Desarrollador:** Cascade AI  
**Estado:** ✅ COMPLETADO Y LISTO PARA PRODUCCIÓN
