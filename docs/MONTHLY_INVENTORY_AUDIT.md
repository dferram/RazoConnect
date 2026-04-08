# Monthly Inventory Audit

## Purpose

This module supports monthly stock reconciliation between what the system expects and what the warehouse physically counts.

The process is designed to be objective, auditable, and hard to manipulate.

## How It Works

### 1. Theoretical stock calculation

The system calculates expected stock using this formula:

`Theoretical Stock = Opening Stock + Purchase Order Receipts + Completed Backorders - Confirmed Sales - Shrinkage`

### 2. Blind counting

Warehouse staff enter:
- SKU
- physical count

They do not see the theoretical stock while counting.

### 3. Traffic-light review

| Color | Meaning | Action |
|---|---|---|
| Green | No difference | No action |
| Yellow | Small difference | Optional comment |
| Red | Significant difference | Comment required |

### 4. Economic impact

The module estimates the value of every discrepancy so finance and inventory teams can prioritize the largest gaps first.

### 5. Controlled close

Only a super admin can close and synchronize a completed audit session.

That close action:
- writes the final inventory adjustments
- updates the real stock record
- marks the session as closed and irreversible

## Data Model

The workflow uses these tables:
- `toma_inventario_sesiones`: audit session header
- `toma_inventario_conteos`: individual counts
- `auditoria_comentarios`: justification comments
- `ajustes_inventario`: historical stock adjustments

## Main Endpoints

Session management:
- `POST /api/admin/auditoria/sesiones`
- `GET /api/admin/auditoria/sesiones`
- `GET /api/admin/auditoria/sesiones/:sesionId`

Audit actions:
- create a blind count
- add a comment for a significant difference
- review reconciliation results
- close the session

## Operational Rules

- Differences above the red threshold require a comment.
- The final close should only happen after review.
- Closed sessions should not be edited.
- Every adjustment must remain traceable to a session and user.

## Related Files

- Service layer: `services/inventoryAuditService.js`
- Controller: `controllers/auditController.js`
- Routes: `routes/admin.js`
- Frontend: `tenants_views/razo/admin-auditoria-mensual.html`

## Notes

This document is a readable business overview. Keep implementation details in code and migrations, not duplicated here.

#### `POST /api/admin/auditoria/sesiones/:sesionId/conteos`
Registrar conteo físico de un producto.

**Request:**
```json
{
  "sku": "PROD-001",
  "cantidadFisica": 50,
  "comentario": "Opcional: justificación si hay diferencia"
}
```

**Response:**
```json
{
  "mensaje": "Conteo registrado exitosamente",
  "conteo": {
    "conteoid": 1,
    "conteo_a": 50,
    "usuario_a_id": 1,
    "estatus_fila": "PENDIENTE_A"
  },
  "stockTeorico": 48,
  "diferencia": 2
}
```

---

### Reconciliación

#### `GET /api/admin/auditoria/sesiones/:sesionId/reconciliacion`
Obtener tabla de reconciliación completa con semáforos.

**Response:**
```json
{
  "conteos": [
    {
      "conteoId": 1,
      "varianteId": 10,
      "sku": "PROD-001",
      "productoNombre": "Producto Ejemplo",
      "dimensiones": "10x10",
      "stockTeorico": 48,
      "cantidadFisica": 50,
      "diferencia": 2,
      "impactoEconomico": 20.00,
      "costoUnitario": 10.00,
      "precioUnitario": 15.00,
      "semaforo": "amarillo",
      "requiereComentario": false,
      "comentario": null,
      "estatusAplicacion": "PENDIENTE",
      "desglose": {
        "inventarioInicial": 40,
        "entradas": 10,
        "salidas": 2
      }
    }
  ],
  "resumen": {
    "totalProductos": 15,
    "totalConciliados": 10,
    "totalConDiferencia": 5,
    "impactoEconomicoTotal": 150.50,
    "porSemaforo": {
      "verde": 10,
      "amarillo": 3,
      "rojo": 2
    },
    "requierenComentario": 2
  }
}
```

---

### Comentarios

#### `POST /api/admin/auditoria/conteos/:conteoId/comentario`
Agregar comentario de justificación.

**Request:**
```json
{
  "comentario": "Producto dañado durante transporte, se registró merma previamente"
}
```

**Response:**
```json
{
  "mensaje": "Comentario agregado exitosamente"
}
```

---

### Cierre y Sincronización

#### `POST /api/admin/auditoria/sesiones/:sesionId/cerrar`
Cerrar auditoría y sincronizar stock (Solo Super Admin).

**Response:**
```json
{
  "mensaje": "Auditoría cerrada y sincronizada exitosamente",
  "sesionId": 1,
  "ajustesRealizados": 15,
  "detalles": [
    {
      "varianteId": 10,
      "cantidadFisica": 50,
      "diferencia": 2
    }
  ]
}
```

**Errores:**
- `403`: Si el usuario no es Super Admin
- `400`: Si hay conteos rojos sin comentario

---

### Reportes

#### `GET /api/admin/auditoria/sesiones/:sesionId/reporte`
Generar reporte completo de auditoría.

**Response:**
```json
{
  "sesion": {
    "sesionid": 1,
    "nombre": "Auditoría Enero 2025",
    "fechainicio": "2025-01-20T17:00:00.000Z",
    "fechacierre": "2025-01-20T20:00:00.000Z",
    "estatus": "CERRADA",
    "usuario_creador_nombre": "Admin Principal"
  },
  "conteos": [...],
  "resumen": {
    "totalProductos": 15,
    "totalConciliados": 10,
    "totalConDiferencia": 5,
    "impactoEconomicoTotal": 150.50,
    "porSemaforo": {
      "verde": 10,
      "amarillo": 3,
      "rojo": 2
    }
  }
}
```

---

### Utilidades

#### `GET /api/admin/auditoria/stock-teorico/:sku`
Consultar stock teórico de un producto específico.

**Query Params:**
- `fechaInicio` (opcional): Fecha inicio del período
- `fechaFin` (opcional): Fecha fin del período

**Response:**
```json
{
  "sku": "PROD-001",
  "productoNombre": "Producto Ejemplo",
  "dimensiones": "10x10",
  "varianteId": 10,
  "inventarioInicial": 40,
  "entradasOC": 10,
  "entradasBackorder": 0,
  "salidasVentas": 2,
  "mermas": 0,
  "stockTeorico": 48,
  "desglose": {
    "inventarioInicial": 40,
    "entradas": 10,
    "salidas": 2
  }
}
```

---

#### `GET /api/admin/auditoria/stock-teorico-masivo`
Calcular stock teórico de todos los productos del admin.

**Query Params:**
- `fechaInicio` (opcional)
- `fechaFin` (opcional)

**Response:**
```json
{
  "productos": [
    {
      "varianteId": 10,
      "sku": "PROD-001",
      "productoNombre": "Producto Ejemplo",
      "dimensiones": "10x10",
      "costoUnitario": 10.00,
      "precioUnitario": 15.00,
      "inventarioInicial": 40,
      "entradasOC": 10,
      "entradasBackorder": 0,
      "salidasVentas": 2,
      "mermas": 0,
      "stockTeorico": 48,
      "desglose": {
        "inventarioInicial": 40,
        "entradas": 10,
        "salidas": 2
      }
    }
  ]
}
```

---

## 🔄 Flujo de Trabajo Completo

### Paso 1: Crear Sesión de Auditoría
1. Admin accede a `/admin-auditoria-mensual.html`
2. Click en **"Nueva Auditoría"**
3. Ingresa nombre descriptivo (ej: "Auditoría Enero 2025")
4. Sistema crea sesión con estatus `ABIERTA`

### Paso 2: Conteo Ciego
1. Personal ingresa **SKU** del producto
2. Ingresa **cantidad física** contada
3. Sistema registra conteo SIN mostrar stock teórico
4. Al enviar, sistema muestra:
   - Stock teórico calculado
   - Diferencia
   - Semáforo (verde/amarillo/rojo)

### Paso 3: Justificación de Diferencias
- Si semáforo **ROJO** (diferencia > 2):
  - Sistema solicita comentario obligatorio
  - Admin debe justificar la discrepancia
  - Ejemplos: "Producto dañado", "Error de registro previo", etc.

### Paso 4: Revisión de Reconciliación
1. Click en **"Ver Reconciliación Completa"**
2. Tabla muestra todos los conteos con:
   - SKU, Producto, Dimensiones
   - Stock Teórico vs Físico
   - Diferencia e Impacto Económico
   - Semáforo y Comentarios
3. Opción de exportar a Excel/CSV

### Paso 5: Cierre y Sincronización (Solo Super Admin)
1. Verificar que todos los rojos tengan comentario
2. Click en **"Cerrar y Sincronizar"**
3. Sistema:
   - Actualiza `inventarios_admin.cantidad` con valores físicos
   - Genera ajustes de inventario automáticos
   - Marca sesión como `CERRADA`
   - Genera reporte final

---

## 🎨 Interfaz de Usuario

### Vista de Sesiones
- Tabla con historial de auditorías
- Filtros por estatus (ABIERTA/CERRADA)
- Botón para crear nueva sesión
- Acceso rápido a sesiones abiertas

### Vista de Conteo Ciego
- **Paso 1**: Formulario de conteo
  - Input SKU (auto-uppercase)
  - Input cantidad física
  - Botón "Registrar Conteo"
  
- **Paso 2**: Resultado inmediato
  - Comparación visual
  - Semáforo de alerta
  - Diferencia destacada

### Estadísticas en Tiempo Real
- Total productos contados
- Total conciliados (verde)
- Total con diferencia
- Impacto económico acumulado

### Tabla de Reconciliación
- Filtro de búsqueda por SKU/nombre
- Colores por semáforo
- Columnas ordenables
- Exportación a Excel

---

## 🔒 Seguridad y Permisos

### Roles y Accesos

| Acción | Admin | Super Admin |
|--------|-------|-------------|
| Crear sesión | ✅ | ✅ |
| Registrar conteos | ✅ | ✅ |
| Ver reconciliación | ✅ | ✅ |
| Agregar comentarios | ✅ | ✅ |
| **Cerrar y sincronizar** | ❌ | ✅ |

### Validaciones Backend
- Token JWT requerido en todos los endpoints
- Middleware `authenticate` + `authorizeAdmin`
- Endpoint de cierre usa `authorizeSuperAdmin`
- Validación de tenant_id en todas las queries

---

## 📊 Reportes y Exportación

### Reporte de Auditoría
Incluye:
- Información de la sesión
- Resumen ejecutivo
- Desglose por semáforo
- Impacto económico total
- Lista completa de conteos

### Exportación CSV
Columnas exportadas:
- SKU
- Producto
- Dimensiones
- Stock Teórico
- Stock Físico
- Diferencia
- Impacto Económico
- Semáforo
- Comentario

---

## 🚀 Instalación y Configuración

### 1. Ejecutar Migración de Base de Datos

```bash
psql -U ferram -d razoconnect -f migrations/20250120_audit_tables.sql
```

Esto creará:
- Tabla `auditoria_comentarios`
- Tabla `ajustes_inventario` (si no existe)
- Índices de rendimiento
- Constraints y FKs

### 2. Verificar Rutas
Las rutas ya están registradas en `routes/admin.js` (líneas 1280-1352).

### 3. Acceder al Módulo
- URL: `https://razo.com.mx/admin-auditoria-mensual.html`
- Menú: **Financiero → Auditoría Mensual**

---

## 🧪 Casos de Uso

### Caso 1: Auditoría Mensual Estándar
**Escenario**: Auditoría de fin de mes con 100 productos.

1. Crear sesión "Auditoría Enero 2025"
2. Personal cuenta físicamente 100 productos
3. Ingresan SKU y cantidad uno por uno
4. 85 productos concilian (verde)
5. 10 productos con diferencia mínima (amarillo)
6. 5 productos con diferencia alta (rojo) → requieren comentario
7. Super Admin revisa y cierra auditoría
8. Stock del sistema se actualiza automáticamente

**Resultado**: Inventario sincronizado con realidad física.

---

### Caso 2: Detección de Merma
**Escenario**: Producto con diferencia negativa significativa.

- Stock Teórico: 100 unidades
- Stock Físico: 85 unidades
- Diferencia: -15 unidades
- Semáforo: 🔴 ROJO
- Comentario requerido: "15 unidades dañadas por humedad en almacén"
- Impacto económico: -$150 (si costo = $10/unidad)

Al cerrar auditoría:
- Se crea ajuste de inventario tipo `MERMA`
- Stock se actualiza a 85 unidades
- Queda registro histórico de la merma

---

### Caso 3: Detección de Sobrante
**Escenario**: Producto con diferencia positiva.

- Stock Teórico: 50 unidades
- Stock Físico: 60 unidades
- Diferencia: +10 unidades
- Semáforo: 🔴 ROJO
- Comentario requerido: "Backorder no registrado correctamente en sistema"
- Impacto económico: +$100

Al cerrar auditoría:
- Se crea ajuste de inventario tipo `ENTRADA`
- Stock se actualiza a 60 unidades
- Se investiga el origen del error

---

## 🔧 Mantenimiento

### Limpieza de Sesiones Antiguas
Recomendación: Mantener sesiones de los últimos 12 meses.

```sql
-- Ver sesiones antiguas
SELECT sesionid, nombre, fechainicio, estatus
FROM toma_inventario_sesiones
WHERE fechainicio < NOW() - INTERVAL '12 months'
AND estatus = 'CERRADA';

-- Eliminar sesiones antiguas (CUIDADO: elimina conteos asociados)
-- Solo ejecutar si estás seguro
DELETE FROM toma_inventario_sesiones
WHERE fechainicio < NOW() - INTERVAL '12 months'
AND estatus = 'CERRADA';
```

### Monitoreo de Rendimiento
Índices críticos ya creados en migración:
- `idx_auditoria_comentarios_conteo`
- `idx_ajustes_inventario_variante`
- `idx_ajustes_inventario_admin`
- `idx_ajustes_inventario_fecha`

---

## 📈 Mejoras Futuras

### Fase 2 (Opcional)
- [ ] Generación de PDF del reporte de auditoría
- [ ] Notificaciones por email al cerrar auditoría
- [ ] Dashboard de tendencias de auditorías
- [ ] Comparación de auditorías mes a mes
- [ ] Alertas automáticas de productos con mermas recurrentes
- [ ] Integración con sistema de códigos de barras/QR
- [ ] App móvil para conteo en almacén

---

## 🐛 Troubleshooting

### Error: "Sesión no encontrada"
**Causa**: Sesión no existe o pertenece a otro tenant.
**Solución**: Verificar `sesionId` y `tenant_id`.

### Error: "SKU no encontrado"
**Causa**: SKU no existe en `producto_variantes`.
**Solución**: Verificar que el SKU esté registrado y sea del tenant correcto.

### Error: "Solo Super Admins pueden cerrar auditorías"
**Causa**: Usuario no tiene rol `super_admin`.
**Solución**: Verificar roles en JWT token o asignar rol super_admin.

### Error: "Producto requiere comentario"
**Causa**: Hay productos con semáforo rojo sin comentario.
**Solución**: Agregar comentarios de justificación antes de cerrar.

---

## 📞 Soporte

Para dudas o problemas con el módulo de auditoría:
1. Revisar esta documentación
2. Verificar logs del servidor (`console.error` en controladores)
3. Revisar tabla `ajustes_inventario` para histórico
4. Contactar al equipo de desarrollo

---

## ✅ Checklist de Implementación

- [x] Migración de base de datos ejecutada
- [x] Servicio de auditoría creado (`inventoryAuditService.js`)
- [x] Controlador de auditoría creado (`auditController.js`)
- [x] Rutas registradas en `routes/admin.js`
- [x] Interfaz HTML creada (`admin-auditoria-mensual.html`)
- [x] Lógica cliente creada (`admin-auditoria-mensual.js`)
- [x] Link agregado al sidebar admin
- [x] Documentación completa

---

**Versión**: 1.0.0  
**Fecha**: 20 de Enero de 2025  
**Autor**: RazoConnect Development Team
