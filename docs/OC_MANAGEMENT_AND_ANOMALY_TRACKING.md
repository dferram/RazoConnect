# Sistema de Gestión Flexible de Órdenes de Compra y Tracking de Anomalías

## 📋 Resumen Ejecutivo

Este sistema implementa dos funcionalidades críticas para la gestión de inventario:

1. **Edición Pre-Recepción de Órdenes de Compra**: Permite modificar, agregar o eliminar productos de una OC antes de recibir el inventario
2. **Registro de Anomalías en Entrada de Almacén**: Tracking completo de mermas, excedentes y discrepancias con trazabilidad completa

## 🎯 Objetivos Cumplidos

### MISIÓN 1: Edición Pre-Recepción (Órdenes de Compra)

✅ **Frontend (admin-orden-compra-detalle.html)**
- Permite editar lista de productos mientras la OC esté en estatus 'Generada', 'Enviada' o 'Pendiente'
- Botones para eliminar filas y agregar productos manualmente
- Búsqueda en tiempo real de productos con autocompletado
- Validación de permisos por rol (admin solo puede editar sus propias OC)

✅ **Backend (comprasController.js)**
- Endpoint `PUT /api/admin/orden-compra/:id/items`
- Lógica crítica: Si se elimina un producto vinculado a backorder, pregunta al usuario si desea cancelar el backorder o dejarlo pendiente
- Recalcula automáticamente el `monto_total` de la OC tras cada edición
- Validaciones de integridad y permisos

### MISIÓN 2: Entrada a Almacén con Merma y Excedentes

✅ **Frontend (anomaly-tracking.js)**
- Detecta automáticamente discrepancias entre cantidad esperada y recibida
- Campo obligatorio de "Motivo de Discrepancia" cuando hay diferencias
- Catálogo de motivos predefinidos para mermas y excedentes

✅ **Lógica de Merma (Faltantes)**
- Permite marcar como "Cerrado por Merma" cuando el proveedor no enviará las piezas
- Registra admin_id, motivo y fecha de cierre
- Cancela automáticamente backorders vinculados para evitar pedidos "colgados"

✅ **Lógica de Extras (Bonificaciones)**
- Registra excedentes cuando se recibe más de lo pedido
- Afecta inventario por cantidad real recibida
- Registra motivo (ej: "Regalo del proveedor")

### MISIÓN 3: Trazabilidad y Auditoría

✅ **Tracking Completo**
- Cada merma o extra inserta fila en `ajustes_inventario`
- Detalla: Admin, Tipo (Ajuste Almacén), Motivo, ID_Orden_Compra
- Campos adicionales en `detallesordencompra` para tracking histórico

## 📁 Archivos Creados/Modificados

### Backend

1. **`migrations/add_anomaly_tracking_to_oc.sql`**
   - Agrega campos de tracking a `detallesordencompra`
   - Campos: `motivo_discrepancia`, `tipo_discrepancia`, `cerrado_por_merma`, `fecha_cierre_merma`, `admin_cierre_id`, `cantidad_excedente`, `backorder_cancelado`

2. **`controllers/comprasController.js`** (NUEVO)
   - `editarItemsOrdenCompra()`: Edición flexible de items de OC
   - `cancelarBackorderVinculado()`: Cancelación de backorders
   - `registrarAnomaliaEntrada()`: Registro de mermas/excedentes

3. **`routes/compras.js`** (NUEVO)
   - `PUT /api/admin/orden-compra/:id/items`
   - `POST /api/admin/orden-compra/cancelar-backorder`
   - `POST /api/admin/orden-compra/registrar-anomalia`

### Frontend

4. **`tenants_views/razo/admin-orden-compra-detalle.html`** (NUEVO)
   - Interfaz completa para edición de OC
   - Modales para agregar/editar productos
   - Alertas de backorders afectados

5. **`tenants_views/razo/js/admin-orden-compra-detalle.js`** (NUEVO)
   - Lógica de edición de OC
   - Gestión de backorders
   - Integración con API

6. **`tenants_views/razo/js/anomaly-tracking.js`** (NUEVO)
   - Clase `AnomalyTracker` para gestión de anomalías
   - Detección automática de discrepancias
   - Catálogo de motivos
   - Validaciones y reportes

## 🔧 Instalación

### 1. Ejecutar Migración de Base de Datos

```bash
psql -U ferram -d razoconnect -f migrations/add_anomaly_tracking_to_oc.sql
```

### 2. Registrar Rutas en index.js

Agregar después de las rutas existentes de admin:

```javascript
// Rutas de gestión de compras (OC flexible + anomalías)
const comprasRoutes = require('./routes/compras');
app.use('/api/admin', comprasRoutes);
```

### 3. Agregar Script en admin-recibir-inventario.html

Agregar antes del cierre de `</body>`:

```html
<script src="js/anomaly-tracking.js"></script>
```

### 4. Integrar AnomalyTracker en admin-recibir-inventario.js

```javascript
// Al inicio del archivo
const anomalyTracker = new window.AnomalyTracker();

// En la función que procesa cantidades recibidas
function procesarCantidadRecibida(detalleId, cantidadEsperada, cantidadRecibida) {
  const discrepancia = anomalyTracker.detectarDiscrepancia(
    detalleId, 
    cantidadEsperada, 
    cantidadRecibida
  );
  
  if (discrepancia) {
    // Mostrar modal para capturar motivo
    await anomalyTracker.mostrarModalMotivo(
      detalleId, 
      productoNombre, 
      discrepancia
    );
  }
}

// Antes de enviar la recepción al backend
const validacion = anomalyTracker.validarDiscrepancias();
if (!validacion.valido) {
  Swal.fire('Error', 'Debes especificar el motivo de todas las discrepancias', 'error');
  return;
}

// Enviar anomalías al backend
await anomalyTracker.enviarAnomalias(ordenCompraId);
```

## 📊 Esquema de Base de Datos

### Tabla: detallesordencompra (Campos Nuevos)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `motivo_discrepancia` | TEXT | Razón de la discrepancia |
| `tipo_discrepancia` | VARCHAR(20) | MERMA, EXCEDENTE, NINGUNA |
| `cerrado_por_merma` | BOOLEAN | Si fue cerrado definitivamente |
| `fecha_cierre_merma` | TIMESTAMP | Fecha de cierre |
| `admin_cierre_id` | INTEGER | FK a administradores |
| `cantidad_excedente` | INTEGER | Cantidad adicional recibida |
| `backorder_cancelado` | BOOLEAN | Si se canceló el backorder |
| `fecha_cancelacion_backorder` | TIMESTAMP | Fecha de cancelación |

## 🔄 Flujos de Trabajo

### Flujo 1: Edición de OC Pre-Recepción

```
1. Admin accede a admin-orden-compra-detalle.html?id=123
2. Sistema verifica estatus de OC (debe ser Generada/Enviada/Pendiente)
3. Admin puede:
   a. Agregar productos (búsqueda en tiempo real)
   b. Editar cantidades, piezas por paquete, costo
   c. Eliminar productos
4. Si elimina producto con backorder:
   a. Sistema muestra alerta con pedidos afectados
   b. Admin decide: cancelar backorder o dejar pendiente
5. Sistema recalcula total de OC automáticamente
6. Cambios se guardan en BD con auditoría
```

### Flujo 2: Recepción con Anomalías

```
1. Admin recibe inventario en admin-recibir-inventario.html
2. Ingresa cantidad recibida para cada producto
3. Sistema detecta discrepancias automáticamente:
   - Si cantidadRecibida < cantidadEsperada → MERMA
   - Si cantidadRecibida > cantidadEsperada → EXCEDENTE
4. Modal obligatorio solicita:
   a. Motivo de la discrepancia (catálogo predefinido)
   b. Si es merma: opción de "Cerrar por merma definitiva"
5. Sistema registra en ajustes_inventario:
   - Tipo: MERMA o ENTRADA
   - Motivo detallado
   - Admin responsable
   - Fecha y hora
6. Si se cierra por merma:
   - Cancela backorders vinculados
   - Marca en detallesordencompra
7. Inventario se actualiza con cantidad real recibida
```

### Flujo 3: Cancelación de Backorder

```
1. Admin elimina producto de OC que tiene backorder vinculado
2. Sistema detecta backorder y muestra:
   - Pedido #123 - Cliente: Juan Pérez
   - Producto: Caja 20x20 (CAJ-001)
   - Cantidad: 50 paquetes
3. Admin elige:
   a. "Cancelar backorders" → Marca como surtido, cantidad = 0
   b. "Dejar pendientes" → Backorder queda para futura OC
4. Sistema registra decisión en log_inventario
5. Cliente recibe notificación si se cancela
```

## 🎨 Catálogo de Motivos

### Mermas (Faltantes)

- **PROVEEDOR_AGOTO**: Proveedor agotó stock
- **PRODUCTO_DANADO**: Producto dañado en tránsito
- **ERROR_ENVIO**: Error en el envío del proveedor
- **CALIDAD_RECHAZADA**: Producto rechazado por calidad
- **OTRO**: Otro motivo (requiere descripción)

### Excedentes (Bonificaciones)

- **BONIFICACION**: Bonificación del proveedor
- **ERROR_CONTEO**: Error en conteo inicial
- **PROMOCION**: Promoción especial
- **OTRO**: Otro motivo (requiere descripción)

## 🔐 Seguridad y Permisos

### Edición de OC

- **Super Admin**: Puede editar cualquier OC
- **Admin**: Solo puede editar OC que él mismo creó
- **Validación**: Estatus debe ser Generada/Enviada/Pendiente
- **Restricción**: No se pueden editar productos ya recibidos

### Registro de Anomalías

- **Requiere**: Rol de admin o super_admin
- **Auditoría**: Registra admin_id en cada anomalía
- **Trazabilidad**: Timestamp automático en todas las operaciones

## 📈 Reportes y Auditoría

### Consulta de Anomalías por OC

```sql
SELECT 
  doc.detalleoc_id,
  pv.sku,
  pr.nombreproducto,
  doc.cantidadsolicitada,
  doc.cantidadrecibida,
  doc.tipo_discrepancia,
  doc.motivo_discrepancia,
  doc.cerrado_por_merma,
  a.nombre || ' ' || a.apellido AS admin_cierre,
  doc.fecha_cierre_merma
FROM detallesordencompra doc
INNER JOIN producto_variantes pv ON doc.varianteid = pv.varianteid
INNER JOIN productos pr ON pv.productoid = pr.productoid
LEFT JOIN administradores a ON doc.admin_cierre_id = a.adminid
WHERE doc.ordencompraid = $1
  AND doc.tipo_discrepancia IS NOT NULL
ORDER BY doc.detalleoc_id;
```

### Reporte de Mermas por Período

```sql
SELECT 
  DATE_TRUNC('month', doc.fecha_cierre_merma) AS mes,
  COUNT(*) AS total_mermas,
  SUM(doc.cantidadsolicitada - doc.cantidadrecibida) AS paquetes_faltantes,
  SUM((doc.cantidadsolicitada - doc.cantidadrecibida) * doc.piezasporpaquete) AS piezas_faltantes
FROM detallesordencompra doc
WHERE doc.tipo_discrepancia = 'MERMA'
  AND doc.fecha_cierre_merma BETWEEN $1 AND $2
GROUP BY mes
ORDER BY mes DESC;
```

## 🧪 Testing

### Test 1: Edición de OC

```javascript
// Agregar producto a OC
PUT /api/admin/orden-compra/123/items
{
  "items": [{
    "varianteId": 456,
    "cantidadSolicitada": 100,
    "piezasPorPaquete": 24,
    "costoUnitario": 15.50
  }]
}

// Respuesta esperada
{
  "success": true,
  "data": {
    "nuevoTotal": 37200.00,
    "itemsAgregados": [...]
  }
}
```

### Test 2: Eliminar Producto con Backorder

```javascript
// Eliminar producto
PUT /api/admin/orden-compra/123/items
{
  "itemsEliminados": [789]
}

// Respuesta esperada
{
  "success": true,
  "data": {
    "backordersAfectados": [{
      "pedidoId": 555,
      "clienteId": 123,
      "nombreCliente": "Juan Pérez",
      "cantidadPaquetes": 50
    }],
    "requiereDecisionBackorder": true
  }
}
```

### Test 3: Registrar Merma

```javascript
// Registrar merma
POST /api/admin/orden-compra/registrar-anomalia
{
  "detalleOcId": 789,
  "tipoDiscrepancia": "MERMA",
  "motivoDiscrepancia": "Proveedor agotó stock",
  "cantidadReal": 80,
  "cerrarPorMerma": true
}

// Respuesta esperada
{
  "success": true,
  "data": {
    "tipoDiscrepancia": "MERMA",
    "cantidadEsperada": 100,
    "cantidadReal": 80,
    "diferencia": -20,
    "cerradoPorMerma": true
  }
}
```

## 🚨 Troubleshooting

### Error: "No se puede editar una orden con estatus X"

**Causa**: La OC ya fue recibida o cancelada  
**Solución**: Solo se pueden editar OC en estatus Generada/Enviada/Pendiente

### Error: "No puede recibir más de lo solicitado"

**Causa**: Se intenta recibir más paquetes de los solicitados  
**Solución**: Primero editar la OC para aumentar la cantidad solicitada

### Error: "Debes especificar el motivo de todas las discrepancias"

**Causa**: Hay discrepancias sin motivo registrado  
**Solución**: Completar el modal de motivo para cada discrepancia detectada

## 📝 Notas Importantes

1. **Backorders**: Al eliminar un producto de OC, SIEMPRE verificar si hay backorders vinculados
2. **Mermas Cerradas**: Una vez cerrada una merma, NO se puede reabrir. Usar con precaución
3. **Auditoría**: Todos los cambios quedan registrados con timestamp y usuario responsable
4. **Recalculo Automático**: El total de la OC se recalcula automáticamente tras cada edición
5. **Permisos**: Los admins solo pueden editar sus propias OC (super_admin puede editar todas)

## 🔮 Mejoras Futuras

- [ ] Dashboard de anomalías con gráficas
- [ ] Exportación de reportes de mermas a Excel
- [ ] Notificaciones automáticas a clientes cuando se cancela backorder
- [ ] Integración con sistema de calidad para rechazos
- [ ] Historial de cambios en OC con diff visual
- [ ] API para proveedores para actualizar cantidades disponibles

## 📞 Soporte

Para dudas o problemas con el sistema:
- Revisar logs en `ajustes_inventario` y `log_inventario`
- Verificar permisos del usuario en `administradores`
- Consultar esta documentación para flujos correctos
