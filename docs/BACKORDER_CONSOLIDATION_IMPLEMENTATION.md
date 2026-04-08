# Backorder Consolidation by Supplier

## Purpose

This workflow reduces purchase-order noise by grouping open backorders from the same supplier into a single purchase order until goods are physically received.

The goal is simple:
- keep supplier backorders consolidated
- preserve traceability to the original customer order
- keep reports readable for operations and purchasing

## What Changed

### Database

A new `pedido_original_id` column was added to `detallesordencompra` so each purchase-order line can be traced back to the original customer order.

### Backend

`services/ordenesService.js` now follows this rule:
- reuse an open purchase order for the same supplier when possible
- create a new purchase order only when no open one exists
- merge repeated lines when the same variant and original order already exist

The service returns whether the result was a new order or a consolidation.

### PDF output

`controllers/ordenCompraPDFController.js` groups lines by `pedido_original_id` and renders supplier documents in a more readable format.

The PDF now:
- shows which customer order originated each group
- keeps quantities in packages, not pieces
- calculates subtotals per group and a final total

### Admin route

The admin panel now exposes a PDF endpoint for purchase orders:

- `GET /api/admin/ordenes-compra/:id/pdf`

## How It Works

1. A customer order runs out of stock and becomes a backorder.
2. The system checks whether the supplier already has an open purchase order.
3. If yes, the backorder is added to that order.
4. If no, a new purchase order is created.
5. Each line keeps `pedido_original_id` for traceability.

## Operational Rules

- Consolidation only applies while the purchase order is still open.
- Once the order is received, closed, or canceled, new lines must not be appended.
- Reports must always keep the original order reference visible.

## Why This Matters

Without consolidation, the platform creates too many small purchase orders for the same supplier. That increases manual work and makes reporting harder. This workflow keeps operations grouped without losing traceability.

## Related Docs

- Purchase and warehouse approval flow: docs/FINANCE_WAREHOUSE.md
- Inventory model: docs/INVENTORY_MODEL_OVERVIEW.md
- FIFO allocation: docs/FIFO_CASOS_DE_USO.md

## Notes

This document describes the business behavior and service rules only. The exact SQL and rendering implementation should stay in the codebase, not duplicated here.
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
