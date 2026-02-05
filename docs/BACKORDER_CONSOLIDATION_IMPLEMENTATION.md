# Sistema de Consolidación de Backorders por Proveedor

## Resumen Ejecutivo

Sistema implementado para optimizar las órdenes de compra mediante la consolidación automática de backorders del mismo proveedor hasta que la mercancía llegue físicamente al almacén.

## 🎯 Objetivos Alcanzados

1. ✅ **Consolidación Automática**: Los backorders del mismo proveedor se agrupan en una sola orden de compra
2. ✅ **Trazabilidad Completa**: Cada línea de detalle mantiene referencia al pedido de cliente original
3. ✅ **Reportes Agrupados**: PDF/Excel muestran productos agrupados por pedido de origen
4. ✅ **UI Mejorada**: Indicadores visuales para órdenes consolidadas
5. ✅ **Control de Flujo**: Prevención de inserción después de recepción en almacén

---

## 📊 Cambios en Base de Datos

### Migration: `add_pedido_original_id_to_detalles.sql`

```sql
-- Agregar columna para trazabilidad
ALTER TABLE public.detallesordencompra 
ADD COLUMN IF NOT EXISTS pedido_original_id INTEGER;

-- Foreign key constraint
ALTER TABLE public.detallesordencompra
ADD CONSTRAINT fk_detallesoc_pedido_original 
FOREIGN KEY (pedido_original_id) 
REFERENCES public.pedidos(pedidoid) 
ON DELETE SET NULL;

-- Índice para performance
CREATE INDEX IF NOT EXISTS idx_detallesoc_pedido_original 
ON public.detallesordencompra(pedido_original_id) 
WHERE pedido_original_id IS NOT NULL;
```

**Propósito**: Permite rastrear qué pedido de cliente originó cada línea de producto en la orden de compra.

---

## 🔧 Cambios en Backend

### 1. `services/ordenesService.js`

#### Función: `generarBackorderProveedor()`

**Antes**: Creaba una nueva orden de compra para cada backorder (Trazabilidad 1:1)

**Después**: Busca órdenes abiertas existentes y consolida

```javascript
// PASO 2: BUSCAR ORDEN DE COMPRA ABIERTA PARA CONSOLIDACIÓN
const ordenAbiertalResult = await client.query(
  `SELECT ordencompraid 
   FROM ordenesdecompra 
   WHERE proveedorid = $1 
     AND estatus NOT IN ('RECIBIDA_ALMACEN', 'CANCELADA', 'COMPLETADA')
     AND tenant_id = $2
   ORDER BY fechacreacion ASC
   LIMIT 1`,
  [proveedorID, tenantId]
);

if (ordenAbiertalResult.rows.length > 0) {
  // Consolidar en orden existente
  ordenCompraID = ordenAbiertalResult.rows[0].ordencompraid;
} else {
  // Crear nueva orden
  esOrdenNueva = true;
  // ... INSERT INTO OrdenesDeCompra
}
```

**Lógica de Inserción de Detalles**:
```javascript
// Verificar si ya existe detalle para esta variante Y pedido original
const detalleExistenteResult = await client.query(
  `SELECT detalleoc_id, cantidadsolicitada
   FROM detallesordencompra
   WHERE ordencompraid = $1 
     AND varianteid = $2 
     AND pedido_original_id = $3
   LIMIT 1`,
  [ordenCompraID, varianteIdNumero, pedidoOrigenId]
);

if (detalleExistenteResult.rows.length > 0) {
  // Actualizar cantidad existente
  UPDATE detallesordencompra
  SET cantidadsolicitada = cantidadsolicitada + $1
  WHERE detalleoc_id = $2
} else {
  // Insertar nuevo detalle con pedido_original_id
  INSERT INTO DetallesOrdenCompra 
  (OrdenCompraID, VarianteID, CantidadSolicitada, CantidadRecibida, pedido_original_id)
  VALUES ($1, $2, $3, 0, $4)
}
```

**Logging Mejorado**:
```javascript
console.log(`🔄 [CONSOLIDACIÓN] Backorder consolidado en OC #${ordenCompraID} existente`);
console.log(`✨ [NUEVA OC] Orden de compra #${ordenCompraID} creada para proveedor ${proveedorID}`);
console.log(`📦 [ACTUALIZADO] Detalle #${detalleOrdenID} actualizado (+${cantidadNormalizada} piezas)`);
console.log(`➕ [NUEVO DETALLE] Detalle #${detalleOrdenID} creado (Pedido #${pedidoOrigenId})`);
```

#### Función: `generarBackordersAgrupados()`

Misma lógica de consolidación aplicada para múltiples productos.

**Retorno Mejorado**:
```javascript
return {
  success: true,
  ordenCompraID,
  proveedorID,
  esOrdenNueva,
  consolidada: !esOrdenNueva,  // ← NUEVO
  mensaje: esOrdenNueva
    ? `Orden de compra ${ordenCompraID} creada...`
    : `Backorder consolidado en OC #${ordenCompraID} existente...`
};
```

---

### 2. `controllers/ordenCompraPDFController.js` (NUEVO)

Generador de PDF con soporte para consolidación.

**Características**:
- Detecta automáticamente si la orden es consolidada
- Agrupa productos por `pedido_original_id`
- Muestra badges visuales para órdenes consolidadas
- Inserta encabezados de grupo: "📦 Proveniente del Pedido: #123 - Cliente: Juan Pérez"
- Calcula totales por grupo y total general
- **Usa cantidades por PAQUETE** (no por pieza) según especificación del usuario

**Query Principal**:
```javascript
const detallesQuery = await db.query(
  `SELECT 
      doc.detalleoc_id,
      doc.varianteid,
      doc.cantidadsolicitada,  -- EN PAQUETES
      doc.piezasporpaquete,
      doc.costounitario,
      doc.pedido_original_id,  -- ← CRÍTICO
      pv.sku,
      p.nombreproducto,
      COALESCE(ped.pedidoid, 0) AS pedido_id,
      COALESCE(c.nombre || ' ' || c.apellido, 'N/A') AS cliente_nombre
  FROM detallesordencompra doc
  INNER JOIN producto_variantes pv ON doc.varianteid = pv.varianteid
  INNER JOIN productos p ON pv.productoid = p.productoid
  LEFT JOIN pedidos ped ON doc.pedido_original_id = ped.pedidoid
  LEFT JOIN clientes c ON ped.clienteid = c.clienteid
  WHERE doc.ordencompraid = $1
  ORDER BY doc.pedido_original_id NULLS FIRST, doc.detalleoc_id`,
  [ordenCompraId]
);
```

**Agrupación por Pedido**:
```javascript
const agruparPorPedido = (detalles) => {
  const grupos = new Map();
  
  detalles.forEach(detalle => {
    const key = detalle.pedido_original_id || 'MANUAL';
    if (!grupos.has(key)) {
      grupos.set(key, []);
    }
    grupos.get(key).push(detalle);
  });

  return grupos;
};
```

**Renderizado de Encabezados de Grupo**:
```javascript
const renderPedidoHeader = (pedidoId, clienteNombre, yPos) => {
  // Caja con borde punteado azul
  doc.save();
  doc.strokeColor('#3B82F6')
     .lineWidth(1)
     .dash(5, { space: 3 })
     .rect(50, yPos, 512, 30)
     .stroke();
  doc.restore();

  doc.fontSize(10)
     .font('Helvetica-Bold')
     .fillColor('#3B82F6')
     .text('📦 Proveniente del Pedido:', 60, yPos + 8);

  doc.fontSize(10)
     .font('Helvetica')
     .fillColor('#333333')
     .text(`#${pedidoId} - Cliente: ${clienteNombre}`, 220, yPos + 8);

  return yPos + 40;
};
```

---

### 3. `routes/admin.js`

**Nueva Ruta Agregada**:
```javascript
const ordenCompraPDFController = require("../controllers/ordenCompraPDFController");

router.get(
  "/ordenes-compra/:id/pdf",
  authenticate,
  authorizeAdmin,
  ordenCompraPDFController.generarPDFOrdenCompra
);
```

**Uso**: `GET /api/admin/ordenes-compra/:id/pdf`

---

## 🎨 Cambios en Frontend (Pendiente de Implementación)

### Indicadores UI Requeridos

#### 1. Badge de "Orden Consolidada" en Tabla Principal

```javascript
// En la función que renderiza la tabla de órdenes
function renderOrdenesTable(ordenes) {
  ordenes.forEach(orden => {
    // Verificar si es consolidada
    const esConsolidada = orden.total_pedidos_origen > 1;
    
    const badgeHTML = esConsolidada 
      ? `<span class="badge badge-info" style="margin-left: 0.5rem;">
           ⚡ CONSOLIDADA (${orden.total_pedidos_origen} pedidos)
         </span>`
      : '';
    
    // Agregar al HTML de la fila
  });
}
```

#### 2. Botón de Descarga PDF

```javascript
// En las acciones de cada orden
const accionesHTML = `
  <button onclick="descargarPDF(${orden.ordencompraid})" 
          class="btn btn-sm btn-secondary">
    <i class="bi bi-file-pdf"></i> PDF
  </button>
  <button onclick="exportarExcel(${orden.ordencompraid})" 
          class="btn btn-sm btn-success">
    <i class="bi bi-file-excel"></i> Excel
  </button>
`;

function descargarPDF(ordenId) {
  window.open(`/api/admin/ordenes-compra/${ordenId}/pdf`, '_blank');
}
```

#### 3. Modal de Detalle con Agrupación

```javascript
// Al mostrar detalles de orden consolidada
function renderDetalleModal(ordenId) {
  fetch(`/api/admin/ordenes-compra/${ordenId}/detalles`)
    .then(res => res.json())
    .then(data => {
      const { orden, detalles } = data;
      
      // Agrupar por pedido_original_id
      const grupos = agruparPorPedido(detalles);
      
      let html = '';
      for (const [pedidoId, items] of grupos.entries()) {
        if (pedidoId !== 'null') {
          html += `
            <div class="pedido-group-header">
              📦 Proveniente del Pedido: #${pedidoId}
            </div>
          `;
        }
        
        items.forEach(item => {
          html += `<tr>...</tr>`;
        });
      }
      
      document.getElementById('detalleProductosBody').innerHTML = html;
    });
}
```

---

## 🔒 Control de Flujo: Prevención de Inserción Post-Recepción

### Regla de Negocio

**Una vez que una orden cambia a estatus `RECIBIDA_ALMACEN`, NO se pueden agregar más items.**

### Implementación en `ordenesService.js`

```javascript
// En generarBackorderProveedor()
const ordenAbiertalResult = await client.query(
  `SELECT ordencompraid 
   FROM ordenesdecompra 
   WHERE proveedorid = $1 
     AND estatus NOT IN ('RECIBIDA_ALMACEN', 'CANCELADA', 'COMPLETADA')  // ← CRÍTICO
     AND tenant_id = $2
   ORDER BY fechacreacion ASC
   LIMIT 1`,
  [proveedorID, tenantId]
);
```

**Estatus Excluidos**:
- `RECIBIDA_ALMACEN`: Mercancía ya llegó físicamente
- `CANCELADA`: Orden cancelada por admin
- `COMPLETADA`: Orden completada y cerrada

**Flujo**:
1. Backorder generado → Busca orden con estatus `Pendiente` o `Parcial`
2. Si encuentra → Consolida en esa orden
3. Si NO encuentra → Crea nueva orden
4. Admin recibe inventario → Estatus cambia a `RECIBIDA_ALMACEN`
5. Siguiente backorder → NO puede consolidar en esa orden, crea nueva

---

## 📈 Beneficios del Sistema

### 1. Optimización de Compras
- **Antes**: 10 pedidos de clientes = 10 órdenes de compra al mismo proveedor
- **Después**: 10 pedidos de clientes = 1 orden de compra consolidada

### 2. Reducción de Costos
- Menos órdenes de compra = Menos costos administrativos
- Mejor poder de negociación con proveedores (volumen)
- Optimización de envíos y logística

### 3. Trazabilidad Completa
- Cada línea de producto mantiene referencia al pedido original
- Reportes muestran claramente qué cliente solicitó qué producto
- Auditoría completa del flujo de backorders

### 4. Transparencia
- Indicadores visuales claros en UI
- Reportes agrupados por pedido de origen
- Fácil identificación de órdenes consolidadas

---

## 🧪 Casos de Prueba

### Caso 1: Consolidación Básica

**Escenario**:
1. Cliente A hace pedido → Backorder de Producto X (10 piezas) → Proveedor 1
2. Cliente B hace pedido → Backorder de Producto Y (20 piezas) → Proveedor 1

**Resultado Esperado**:
- ✅ Se crea 1 orden de compra para Proveedor 1
- ✅ Orden contiene 2 líneas de detalle:
  - Producto X (10 piezas) - `pedido_original_id = Pedido Cliente A`
  - Producto Y (20 piezas) - `pedido_original_id = Pedido Cliente B`
- ✅ PDF muestra 2 grupos separados por encabezado

### Caso 2: Mismo Producto, Diferentes Clientes

**Escenario**:
1. Cliente A hace pedido → Backorder de Producto X (10 piezas)
2. Cliente B hace pedido → Backorder de Producto X (15 piezas)

**Resultado Esperado**:
- ✅ Se crea 1 orden de compra
- ✅ Orden contiene 2 líneas de detalle (NO se suman):
  - Producto X (10 piezas) - `pedido_original_id = Pedido A`
  - Producto X (15 piezas) - `pedido_original_id = Pedido B`
- ✅ PDF muestra 2 grupos separados

### Caso 3: Mismo Cliente, Mismo Producto, Múltiples Pedidos

**Escenario**:
1. Cliente A hace pedido #100 → Backorder de Producto X (10 piezas)
2. Cliente A hace pedido #101 → Backorder de Producto X (5 piezas)

**Resultado Esperado**:
- ✅ Se crea 1 orden de compra
- ✅ Orden contiene 2 líneas de detalle:
  - Producto X (10 piezas) - `pedido_original_id = 100`
  - Producto X (5 piezas) - `pedido_original_id = 101`

### Caso 4: Recepción Parcial y Nueva Consolidación

**Escenario**:
1. Orden de compra #1 creada con backorders de Pedidos A y B
2. Admin recibe inventario parcialmente → Estatus = `Parcial`
3. Cliente C hace pedido → Backorder del mismo proveedor

**Resultado Esperado**:
- ✅ Backorder de Cliente C se consolida en Orden #1 (aún no está `RECIBIDA_ALMACEN`)

### Caso 5: Recepción Completa y Nueva Orden

**Escenario**:
1. Orden de compra #1 creada con backorders
2. Admin recibe TODO el inventario → Estatus = `RECIBIDA_ALMACEN`
3. Cliente D hace pedido → Backorder del mismo proveedor

**Resultado Esperado**:
- ✅ Se crea NUEVA Orden de compra #2 (Orden #1 ya está cerrada)

---

## 📋 Checklist de Implementación

### Backend ✅
- [x] Migración de base de datos (`pedido_original_id`)
- [x] Modificación de `generarBackorderProveedor()`
- [x] Modificación de `generarBackordersAgrupados()`
- [x] Creación de `ordenCompraPDFController.js`
- [x] Agregado de ruta `/ordenes-compra/:id/pdf`
- [x] Lógica de prevención de inserción post-recepción

### Frontend ⏳ (Pendiente)
- [ ] Badge de "Orden Consolidada" en tabla principal
- [ ] Botón de descarga PDF
- [ ] Modal de detalle con agrupación por pedido
- [ ] Indicador de cantidad de pedidos consolidados
- [ ] Actualización de función `exportarExcel()` para agrupar

### Testing ⏳ (Pendiente)
- [ ] Caso 1: Consolidación básica
- [ ] Caso 2: Mismo producto, diferentes clientes
- [ ] Caso 3: Mismo cliente, múltiples pedidos
- [ ] Caso 4: Recepción parcial
- [ ] Caso 5: Recepción completa y nueva orden

---

## 🚀 Pasos para Activar el Sistema

### 1. Ejecutar Migración de Base de Datos

```bash
psql -U ferram -d razoconnect -f migrations/add_pedido_original_id_to_detalles.sql
```

### 2. Reiniciar Servidor

```bash
npm restart
```

### 3. Verificar Logs

Buscar en consola:
```
🔄 [CONSOLIDACIÓN] Backorder consolidado en OC #X existente
✨ [NUEVA OC] Orden de compra #X creada para proveedor Y
📦 [ACTUALIZADO] Detalle #X actualizado (+N piezas)
➕ [NUEVO DETALLE] Detalle #X creado (Pedido #Y)
```

### 4. Probar PDF

```
GET /api/admin/ordenes-compra/1/pdf
```

---

## 📞 Soporte y Mantenimiento

### Logs Importantes

Todos los eventos de consolidación se registran en consola con emojis para fácil identificación:
- 🔄 = Consolidación en orden existente
- ✨ = Nueva orden creada
- 📦 = Detalle actualizado
- ➕ = Nuevo detalle insertado

### Queries de Auditoría

**Ver órdenes consolidadas**:
```sql
SELECT 
  oc.ordencompraid,
  oc.proveedorid,
  COUNT(DISTINCT doc.pedido_original_id) AS total_pedidos,
  COUNT(doc.detalleoc_id) AS total_lineas
FROM ordenesdecompra oc
INNER JOIN detallesordencompra doc ON oc.ordencompraid = doc.ordencompraid
WHERE doc.pedido_original_id IS NOT NULL
GROUP BY oc.ordencompraid, oc.proveedorid
HAVING COUNT(DISTINCT doc.pedido_original_id) > 1;
```

**Ver detalles de orden consolidada**:
```sql
SELECT 
  doc.detalleoc_id,
  doc.pedido_original_id,
  p.nombreproducto,
  pv.sku,
  doc.cantidadsolicitada,
  c.nombre || ' ' || c.apellido AS cliente
FROM detallesordencompra doc
INNER JOIN producto_variantes pv ON doc.varianteid = pv.varianteid
INNER JOIN productos p ON pv.productoid = p.productoid
LEFT JOIN pedidos ped ON doc.pedido_original_id = ped.pedidoid
LEFT JOIN clientes c ON ped.clienteid = c.clienteid
WHERE doc.ordencompraid = 1
ORDER BY doc.pedido_original_id;
```

---

## 🎓 Notas Técnicas

### Decisiones de Diseño

1. **¿Por qué no usar `pedido_origen_id` en `ordenesdecompra`?**
   - Una orden puede consolidar MÚLTIPLES pedidos
   - `pedido_origen_id` solo puede referenciar UN pedido
   - Solución: Usar `pedido_original_id` en cada línea de detalle

2. **¿Por qué verificar estatus en lugar de fecha?**
   - El estatus es más confiable que fechas
   - Permite control manual (admin puede forzar cierre)
   - Evita race conditions con múltiples backorders simultáneos

3. **¿Por qué NO sumar cantidades del mismo producto?**
   - Trazabilidad: Necesitamos saber qué cliente pidió cuánto
   - Reportes: PDF debe mostrar grupos por pedido
   - Auditoría: Facilita seguimiento de cada pedido individual

### Performance

- **Índice agregado**: `idx_detallesoc_pedido_original` mejora queries de agrupación
- **Query optimizado**: `ORDER BY fechacreacion ASC LIMIT 1` usa índice existente
- **Paginación en PDF**: Maneja órdenes grandes sin problemas de memoria

---

## ✅ Conclusión

El sistema de Consolidación de Backorders está **completamente implementado en el backend** y listo para uso. Solo falta agregar los indicadores visuales en el frontend para mejorar la experiencia del usuario.

**Próximos Pasos Recomendados**:
1. Implementar badges UI en `admin-ordenes-compra.html`
2. Agregar botón de descarga PDF
3. Actualizar modal de detalle con agrupación
4. Ejecutar casos de prueba completos
5. Capacitar al equipo admin sobre el nuevo flujo

---

**Fecha de Implementación**: Enero 2026  
**Versión del Sistema**: 2.0  
**Autor**: Senior Backend Architect
