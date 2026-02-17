# 🔄 REFACTORIZACIÓN: Sistema de Conciliación de Inventario con Trazabilidad

## 📋 Resumen

Se implementó un sistema completo de **trazabilidad de origen** para movimientos de inventario, permitiendo rastrear exactamente cómo ingresó cada producto al sistema (orden de compra, auditoría, ajuste manual).

---

## 🎯 Problema Resuelto

**Antes:** No había forma de saber el origen de cada entrada de inventario. La tabla `log_inventario` solo tenía un campo `motivo` de texto libre.

**Ahora:** Cada movimiento de inventario registra:
- Tipo de origen (ORDEN_COMPRA, AUDITORIA, AJUSTE_MANUAL, MERMA, ADICION)
- ID de la orden de compra (si aplica)
- ID de la sesión de auditoría (si aplica)
- ID del ajuste manual (si aplica)

---

## 🗄️ Cambios en Base de Datos

### Migración SQL

**Archivo:** `migrations/add_origen_tracking_to_log_inventario.sql`

**Nuevas Columnas en `log_inventario`:**
```sql
- tipo_origen VARCHAR(50)
- orden_compra_id INTEGER (FK → OrdenesDeCompra)
- sesion_auditoria_id INTEGER (FK → toma_inventario_sesiones)
- ajuste_id INTEGER (FK → ajustes_inventario)
```

**Tipos de Origen Válidos:**
- `ORDEN_COMPRA` - Recepción de mercancía de proveedor
- `AUDITORIA` - Conteo físico / Inventario inicial
- `AJUSTE_MANUAL` - Corrección manual de inventario
- `MERMA` - Pérdida, daño o robo
- `ADICION` - Incremento manual de stock
- `VENTA` - Salida por venta a cliente
- `DEVOLUCION` - Devolución de cliente

### 🚀 Ejecutar Migración

```bash
# Conectar a Azure PostgreSQL
psql -h <host> -U <user> -d <database> -f migrations/add_origen_tracking_to_log_inventario.sql

# Verificar migración
psql -h <host> -U <user> -d <database> -c "SELECT tipo_origen, COUNT(*) FROM log_inventario GROUP BY tipo_origen;"
```

---

## 💻 Cambios en Backend

### 1. `services/inventoryService.js`

**Actualizado:** Función `registrarMovimiento()` ahora acepta parámetros de trazabilidad:

```javascript
await inventoryService.registrarMovimiento(client, {
  varianteId,
  cantidadDelta,
  motivo,
  usuarioId,
  esExcepcion,
  tenantId,
  userRole,
  // ✅ NUEVOS PARÁMETROS
  tipoOrigen: 'AUDITORIA',
  ordenCompraId: null,
  sesionAuditoriaId: 123,
  ajusteId: null
});
```

### 2. `controllers/inventoryAuditController.js`

**Actualizado:** Al aplicar sesiones de auditoría, ahora registra:

```javascript
tipoOrigen: 'AUDITORIA',
sesionAuditoriaId: sesionId
```

### 3. `controllers/adminController.js`

**Actualizado en 2 lugares:**

#### a) Recepción de Órdenes de Compra (línea ~1374)
```javascript
INSERT INTO log_inventario (
  ..., tipo_origen, orden_compra_id, tenant_id
) VALUES (
  ..., 'ORDEN_COMPRA', ordenCompraId, tenant_id
)
```

#### b) Endpoint de Conciliación (línea ~2966)
**Completamente refactorizado:**

**Antes:**
- Buscaba en `ajustes_inventario` (tabla incorrecta)
- No mostraba origen de movimientos
- Error de parámetros SQL

**Ahora:**
- Query unificada desde `log_inventario`
- JOIN con `OrdenesDeCompra` y `toma_inventario_sesiones`
- Muestra número de OC, nombre de sesión, estatus
- Filtros por tipo de origen, OC específica, sesión específica

**Response incluye:**
```javascript
{
  tipoOrigen: 'AUDITORIA',
  ordenCompraId: 45,
  ordenCompraNumero: 45,
  ordenCompraEstatus: 'Recibida',
  sesionAuditoriaId: 12,
  sesionNombre: 'Conteo Mensual Enero',
  sesionEstatus: 'APLICADA',
  referenciaOrigen: 'Sesión: Conteo Mensual Enero',
  esEntrada: true,
  esSalida: false,
  cantidadDelta: 50
}
```

---

## 🎨 Cambios en Frontend

### Página: `admin-movimientos-conciliacion.html`

**Actualizar tabla para mostrar:**
- Columna "Origen" con badge según tipo
- Referencia clickeable (OC #45, Sesión: Conteo Enero)
- Indicador visual de entrada/salida (↑ verde / ↓ rojo)

**Ejemplo de actualización en JS:**

```javascript
function renderizarTabla(ajustes) {
  ajustes.forEach(ajuste => {
    const origenBadge = obtenerBadgeOrigen(ajuste.tipoOrigen);
    const direccion = ajuste.esEntrada 
      ? '<span class="text-success">↑ Entrada</span>' 
      : '<span class="text-danger">↓ Salida</span>';
    
    const referencia = ajuste.referenciaOrigen 
      ? `<a href="#" onclick="verDetalle('${ajuste.tipoOrigen}', ${ajuste.ordenCompraId || ajuste.sesionAuditoriaId})">${ajuste.referenciaOrigen}</a>`
      : '-';
    
    // Agregar fila a tabla...
  });
}

function obtenerBadgeOrigen(tipo) {
  const badges = {
    'ORDEN_COMPRA': '<span class="badge bg-primary">OC</span>',
    'AUDITORIA': '<span class="badge bg-success">Auditoría</span>',
    'AJUSTE_MANUAL': '<span class="badge bg-warning">Ajuste</span>',
    'MERMA': '<span class="badge bg-danger">Merma</span>',
    'ADICION': '<span class="badge bg-info">Adición</span>'
  };
  return badges[tipo] || '<span class="badge bg-secondary">-</span>';
}
```

---

## ✅ Casos de Uso

### 1. Ver todos los productos que entraron por OC #45
```javascript
GET /api/admin/ajustes-inventario/filtrados?ordenCompraId=45
```

### 2. Ver todos los ajustes de la sesión de auditoría "Conteo Enero"
```javascript
GET /api/admin/ajustes-inventario/filtrados?sesionId=12
```

### 3. Ver todas las auditorías del mes
```javascript
GET /api/admin/ajustes-inventario/filtrados?tipoAjuste=ENTRADA&fechaInicio=2026-01-01&fechaFin=2026-01-31
```

### 4. Conciliar: ¿Cuánto inventario entró vs cuánto tengo?
```javascript
// Frontend calcula:
const totalEntradas = ajustes
  .filter(a => a.esEntrada)
  .reduce((sum, a) => sum + a.totalPiezas, 0);

const totalSalidas = ajustes
  .filter(a => a.esSalida)
  .reduce((sum, a) => sum + Math.abs(a.totalPiezas), 0);

const inventarioEsperado = totalEntradas - totalSalidas;
const inventarioReal = stockActual;
const diferencia = inventarioReal - inventarioEsperado;
```

---

## 📊 Beneficios

✅ **Trazabilidad Completa:** Cada pieza de inventario tiene un origen rastreable
✅ **Conciliación Precisa:** Puedes verificar que lo que entró coincide con lo que tienes
✅ **Auditoría Financiera:** Rastrear valor de inventario por fuente (OC, conteo, etc.)
✅ **Detección de Discrepancias:** Identificar rápidamente faltantes o sobrantes
✅ **Reportes Avanzados:** Generar reportes por proveedor, sesión, tipo de movimiento

---

## 🔧 Próximos Pasos

1. **Ejecutar migración SQL** en producción
2. **Actualizar frontend** para mostrar columna de origen
3. **Agregar filtros avanzados** (por proveedor, por agente que hizo conteo)
4. **Dashboard de conciliación** con gráficos de entradas vs salidas
5. **Alertas automáticas** cuando hay discrepancias > 5%

---

## 🐛 Troubleshooting

### Error: "column tipo_origen does not exist"
**Solución:** Ejecutar la migración SQL primero

### Error: "could not determine data type of parameter $1"
**Solución:** Ya corregido en la refactorización del endpoint

### No aparecen datos de auditorías antiguas
**Solución:** La migración actualiza registros existentes basándose en el campo `motivo`. Verificar con:
```sql
SELECT * FROM log_inventario WHERE motivo ILIKE '%Auditoría%' AND tipo_origen IS NULL;
```

---

## 📝 Archivos Modificados

1. ✅ `migrations/add_origen_tracking_to_log_inventario.sql` - NUEVO
2. ✅ `services/inventoryService.js` - Actualizado
3. ✅ `controllers/inventoryAuditController.js` - Actualizado
4. ✅ `controllers/adminController.js` - Refactorizado completamente
5. ⏳ `tenants_views/razo/js/admin-movimientos-conciliacion.js` - PENDIENTE
6. ⏳ `tenants_views/razo/admin-movimientos-conciliacion.html` - PENDIENTE

---

## 🎯 Resultado Final

**Página de Conciliación mostrará:**

| Fecha | SKU | Producto | Origen | Referencia | Cantidad | Piezas | Valor | Usuario |
|-------|-----|----------|--------|------------|----------|--------|-------|---------|
| 17/02 | SKU-001 | Producto A | 🟢 Auditoría | Sesión: Conteo Enero | ↑ 50 paq | 500 pzas | $5,000 | Fernando |
| 16/02 | SKU-002 | Producto B | 🔵 OC | OC #45 | ↑ 100 paq | 1,000 pzas | $10,000 | Sistema |
| 15/02 | SKU-001 | Producto A | 🟡 Ajuste | Ajuste #12 | ↑ 10 paq | 100 pzas | $1,000 | Admin |
| 14/02 | SKU-003 | Producto C | 🔴 Merma | - | ↓ 5 paq | 50 pzas | -$500 | Fernando |

**Totales de Conciliación:**
- Total Entradas: 160 paquetes (1,600 piezas) = $16,000
- Total Salidas: 5 paquetes (50 piezas) = -$500
- **Inventario Esperado: 155 paquetes (1,550 piezas) = $15,500**
