# Instructional Banners Implementation Guide

## Overview
Sistema de banners informativos que aparecen en cada página del panel de administrador y agente. Los banners se muestran cada vez que se carga la página y pueden cerrarse temporalmente con un botón "×".

## Características
- ✅ **Reaparecen en cada carga**: Los banners siempre se muestran al entrar a una página (sin persistencia en localStorage)
- ✅ **Botón de cierre**: Cada banner tiene un botón "×" para ocultarlo durante la sesión actual
- ✅ **Diseño consistente**: Fondo amarillo (#fef3c7) con borde naranja (#F97316)
- ✅ **Instrucciones específicas**: Cada página tiene un mensaje personalizado sobre su funcionalidad

## Archivos Creados/Modificados

### 1. CSS Styles
**Archivo**: `tenants_views/razo/css/admin.css`
- Clase `.instructional-banner`: Contenedor principal del banner
- Clase `.instructional-banner-close`: Botón de cierre con hover effect
- Estilos responsive y consistentes con el diseño del sistema

### 2. JavaScript Helper
**Archivo**: `tenants_views/razo/js/instructional-banner.js`
- Maneja el evento de cierre del banner
- Se ejecuta automáticamente al cargar el DOM
- No usa localStorage (banners siempre reaparecen)

### 3. Estructura HTML del Banner
```html
<div id="instructionalBanner" class="instructional-banner">
  <p>
    💡 <strong>Título de la Página:</strong> Descripción de la funcionalidad...
  </p>
  <button class="instructional-banner-close" title="Cerrar">
    ×
  </button>
</div>
```

## Páginas Implementadas

### ✅ Admin Pages (12/49)
1. **admin-dashboard.html** - Panel de Control
2. **admin-pedidos.html** - Gestión de Pedidos
3. **admin-inventario.html** - Gestión de Inventario
4. **admin-ordenes-compra.html** - Órdenes de Compra (Backorders)
5. **admin-recibir-inventario.html** - Recepción de Inventario
6. **admin-clientes.html** - Gestión de Clientes
7. **admin-proveedores.html** - Gestión de Proveedores
8. **admin-cupones.html** - Gestión de Cupones
9. **admin-agentes.html** - Gestión de Agentes
10. **admin-comisiones.html** - Gestión de Comisiones
11. **admin-remisiones.html** - Gestión de Remisiones
12. **admin-reportes.html** - Reportes de Ventas

### ✅ Agent Pages (4/8)
1. **agente-dashboard.html** - Panel del Agente
2. **agente-pedidos.html** - Mis Pedidos
3. **agente-cartera.html** - Mi Cartera de Clientes
4. **agente-comisiones.html** - Mis Comisiones

### ⏳ Pending Admin Pages (37)
- admin-agente-detalle.html
- admin-agregar-producto.html
- admin-ajuste-inventario.html
- admin-aprobaciones.html
- admin-auditoria-mensual.html
- admin-bitacora.html
- admin-catalogo-visual.html
- admin-categorias.html
- admin-cliente-cxc.html
- admin-cliente-detalle.html
- admin-crear-oc.html
- admin-cuentaspagadas.html
- admin-cuentaspagar.html
- admin-cxc.html
- admin-devoluciones.html
- admin-editor-landing.html
- admin-edocuenta-detalle.html
- admin-edocuenta.html
- admin-grupos-ordenes.html
- admin-historial-ajustes.html
- admin-inventario-detalle.html
- admin-inventario-reportes.html
- admin-landing-editor.html
- admin-movimientos-conciliacion.html
- admin-movimientos.html
- admin-nuevo-admin.html
- admin-numcuenta.html
- admin-orden-agrupada-detalle.html
- admin-orden-compra-detalle.html
- admin-pedido-detalle.html
- admin-producto-editar.html
- admin-productos-oc.html
- admin-proveedor-detalle.html
- admin-recepcion-oc.html
- admin-toma-inventario.html
- admin-validar-pagos.html

### ⏳ Pending Agent Pages (4)
- agente-cxc.html
- agente-numcuenta.html
- agente-pedido-detalle.html
- agente-toma-inventario.html

## Mensajes de Instrucción por Página

### Admin Pages
| Página | Mensaje |
|--------|---------|
| Dashboard | Panel de Control: Aquí puedes ver un resumen general de tu negocio... |
| Pedidos | Gestión de Pedidos: Visualiza y administra todos los pedidos de tus clientes... |
| Inventario | Gestión de Inventario: Consulta el stock disponible de todos tus productos... |
| Órdenes de Compra | Órdenes de Compra (Backorders): Aquí aparecen las órdenes generadas automáticamente... |
| Recibir Inventario | Recepción de Inventario: Registra la llegada de productos de tus proveedores... |
| Clientes | Gestión de Clientes: Administra tu base de clientes... |
| Proveedores | Gestión de Proveedores: Administra tu catálogo de proveedores... |
| Cupones | Gestión de Cupones: Crea y administra códigos promocionales... |
| Agentes | Gestión de Agentes: Administra tu equipo de ventas... |
| Comisiones | Gestión de Comisiones: Administra las comisiones de tus agentes... |
| Remisiones | Gestión de Remisiones: Visualiza y administra todas las remisiones generadas... |
| Reportes | Reportes de Ventas: Genera reportes detallados de tus ventas por período... |

### Agent Pages
| Página | Mensaje |
|--------|---------|
| Dashboard | Panel del Agente: Bienvenido a tu panel de control... |
| Pedidos | Mis Pedidos: Visualiza todos los pedidos de tus clientes asignados... |
| Cartera | Mi Cartera de Clientes: Administra los clientes vinculados a ti... |
| Comisiones | Mis Comisiones: Revisa el historial completo de tus comisiones... |

## Cómo Agregar un Banner a una Nueva Página

### Paso 1: Agregar el HTML del Banner
Después del `<div id="admin-header-container"></div>` y dentro de `<div class="admin-content">`:

```html
<div class="admin-content">
  <!-- Instructional Banner -->
  <div id="instructionalBanner" class="instructional-banner">
    <p>
      💡 <strong>Título:</strong> Descripción de la funcionalidad de esta página...
    </p>
    <button class="instructional-banner-close" title="Cerrar">
      ×
    </button>
  </div>

  <!-- Resto del contenido -->
</div>
```

### Paso 2: Incluir el Script (si no está ya incluido)
Antes del cierre de `</body>`:

```html
<script src="js/instructional-banner.js"></script>
```

### Paso 3: Verificar que el CSS está cargado
Asegúrate de que la página incluye:

```html
<link rel="stylesheet" href="css/admin.css" />
```

## Comportamiento del Banner

1. **Al cargar la página**: El banner aparece automáticamente
2. **Al hacer clic en "×"**: El banner se oculta (`display: none`)
3. **Al recargar la página**: El banner vuelve a aparecer (comportamiento deseado)
4. **Al cambiar de página**: Cada página muestra su propio banner con instrucciones específicas

## Notas Técnicas

- Los banners NO usan `localStorage` para persistir el estado de cierre
- Esto es intencional: queremos que los administradores y agentes siempre vean las instrucciones al entrar a una página
- El JavaScript es auto-ejecutable (IIFE) y no requiere inicialización manual
- Los estilos CSS son globales y se aplican automáticamente a cualquier elemento con `id="instructionalBanner"`

## Próximos Pasos

1. ✅ Completar implementación en las 37 páginas admin restantes
2. ✅ Completar implementación en las 4 páginas agent restantes
3. ✅ Verificar que todas las páginas incluyen `instructional-banner.js`
4. ✅ Realizar pruebas de funcionalidad (cierre y reaparición)
5. ✅ Documentar mensajes específicos para cada página restante

## Testing Checklist

- [ ] Verificar que el banner aparece en todas las páginas
- [ ] Verificar que el botón "×" oculta el banner
- [ ] Verificar que el banner reaparece al recargar la página
- [ ] Verificar que el diseño es consistente en todas las páginas
- [ ] Verificar que los mensajes son claros y útiles
- [ ] Verificar responsive design en móviles

## Mantenimiento

Para actualizar el mensaje de un banner:
1. Localizar la página HTML correspondiente
2. Buscar `<div id="instructionalBanner"`
3. Editar el contenido del `<p>` con el nuevo mensaje
4. Mantener el formato: `💡 <strong>Título:</strong> Descripción...`
