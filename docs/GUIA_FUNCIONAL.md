# Guía Funcional del Sistema

## Tabla de Contenidos

1. [Roles del Sistema](#roles-del-sistema)
2. [Flujos de Negocio Principales](#flujos-de-negocio-principales)
3. [Módulo de Ventas](#módulo-de-ventas)
4. [Módulo de Inventario](#módulo-de-inventario)
5. [Módulo de Créditos](#módulo-de-créditos)
6. [Módulo de Comisiones](#módulo-de-comisiones)
7. [Módulo de Reportes](#módulo-de-reportes)
8. [Casos de Uso Detallados](#casos-de-uso-detallados)

## Roles del Sistema

### 1. Super Administrador (Developer)

**Descripción**: Usuario con acceso completo al sistema, puede gestionar múltiples tenants y tiene permisos globales.

**Acceso**:
- Panel: `/developer`
- Credenciales: Tabla `developers` (sin tenant_id)

**Permisos y Funcionalidades**:
- Crear y gestionar tenants (clientes del SaaS)
- Configurar dominios personalizados
- Activar/suspender servicios de tenants
- Acceso a todos los datos de todos los tenants
- Gestión de configuración global del sistema
- Monitoreo de salud del sistema

**Casos de Uso**:
1. **Crear Nuevo Tenant**
   - Acceder a `/developer/tenants`
   - Completar formulario con nombre, dominio y tema
   - El sistema crea entrada en tabla `tenants`
   - Configurar DNS del dominio para apuntar a Azure

2. **Suspender Servicio de Tenant**
   - Acceder a panel de tenants
   - Cambiar `is_active` a `false`
   - Los usuarios del tenant son redirigidos a `/suspended`

### 2. Administrador de Tenant

**Descripción**: Usuario con control completo sobre su tenant específico, gestiona productos, inventario, pedidos y usuarios.

**Acceso**:
- Panel: `/admin-dashboard.html`
- Credenciales: Tabla `administradores` (con tenant_id)
- Login: `/login-admin.html`

**Permisos y Funcionalidades**:

#### Gestión de Productos
- Crear, editar y eliminar productos
- Gestionar variantes (tamaños, colores, dimensiones)
- Configurar precios y descuentos
- Asignar categorías y proveedores
- Cargar imágenes (Cloudinary)
- Configurar packs disponibles para venta

#### Gestión de Inventario
- Recibir órdenes de compra
- Registrar entradas y salidas de inventario
- Realizar ajustes de inventario
- Consultar existencias por producto/variante
- Generar alertas de stock bajo
- Auditoría de movimientos de inventario

#### Gestión de Pedidos
- Visualizar todos los pedidos del tenant
- Cambiar estados de pedidos (Pendiente, Surtido, Enviado, Entregado)
- Generar remisiones
- Procesar backorders
- Cancelar pedidos
- Exportar pedidos a Excel

#### Gestión de Clientes
- Ver listado de clientes registrados
- Editar información de clientes
- Gestionar límites de crédito
- Asignar agentes de venta
- Consultar historial de compras
- Activar/desactivar clientes

#### Gestión de Agentes
- Crear y editar agentes de venta
- Asignar carteras de clientes
- Configurar esquemas de comisiones
- Consultar métricas de rendimiento
- Aprobar o rechazar comisiones

#### Cuentas por Cobrar (CXC)
- Consultar saldos pendientes por cliente
- Registrar pagos recibidos
- Generar estados de cuenta
- Configurar plazos de crédito
- Alertas de vencimientos

#### Cuentas por Pagar (CXP)
- Registrar facturas de proveedores
- Programar pagos
- Consultar saldos por proveedor
- Generar reportes de CXP

#### Reportes
- Ventas por período
- Inventario valorizado
- Comisiones de agentes
- Análisis de clientes
- Productos más vendidos
- Exportación a Excel

**Casos de Uso Principales**:

1. **Agregar Nuevo Producto**
   - Acceder a `/admin-agregar-producto.html`
   - Completar información básica (nombre, SKU, descripción)
   - Seleccionar proveedor y categoría
   - Configurar regla de empaque
   - Agregar variantes con dimensiones y precios
   - Seleccionar packs disponibles para venta
   - Cargar imágenes del producto
   - Guardar producto

2. **Recibir Orden de Compra**
   - Acceder a `/admin-recibir-inventario.html`
   - Seleccionar orden de compra pendiente
   - Validar productos y cantidades recibidas
   - Confirmar recepción
   - El sistema actualiza inventario automáticamente
   - Genera entrada de inventario

3. **Procesar Pedido de Cliente**
   - Acceder a `/admin-pedidos.html`
   - Visualizar pedidos pendientes
   - Revisar detalles del pedido
   - Cambiar estado a "Surtido"
   - Generar remisión
   - Marcar como "Enviado" o "Entregado"

### 3. Agente de Ventas

**Descripción**: Personal de ventas con acceso a su cartera de clientes y métricas de comisiones.

**Acceso**:
- Panel: `/agente-dashboard.html`
- Credenciales: Tabla `agentesdeventas` (sin tenant_id, pueden trabajar para múltiples tenants)
- Login: `/login-admin.html` (mismo endpoint, diferente rol)

**Permisos y Funcionalidades**:

#### Dashboard
- Ventas del mes
- Comisiones acumuladas (pagadas y pendientes)
- Clientes activos en cartera
- Últimos pedidos

#### Cartera de Clientes
- Ver clientes asignados
- Consultar historial de compras por cliente
- Ver límites de crédito
- Contactar clientes

#### Pedidos
- Visualizar pedidos de sus clientes
- Consultar estados de pedidos
- Ver detalles de productos vendidos

#### Comisiones
- Consultar comisiones generadas
- Ver comisiones pagadas vs pendientes
- Filtrar por período
- Exportar reporte de comisiones

**Casos de Uso Principales**:

1. **Consultar Comisiones del Mes**
   - Acceder a `/agente-comisiones.html`
   - Ver tabla de comisiones con:
     - Pedido asociado
     - Cliente
     - Monto de venta
     - Porcentaje de comisión
     - Monto de comisión
     - Estado (Pendiente/Pagado)
   - Ver totales: Pagado vs Pendiente

2. **Revisar Cartera de Clientes**
   - Acceder a `/agente-cartera.html`
   - Ver listado de clientes asignados
   - Consultar última compra de cada cliente
   - Ver total de compras por cliente
   - Identificar clientes inactivos

### 4. Cliente

**Descripción**: Usuario final que realiza compras en el e-commerce.

**Acceso**:
- Catálogo: `/catalogo.html` o `/index.html`
- Credenciales: Tabla `clientes` (con tenant_id)
- Login: `/login.html`

**Permisos y Funcionalidades**:

#### Catálogo
- Navegar productos por categoría
- Filtrar por marca (proveedor)
- Filtrar por tipo de producto
- Buscar productos por nombre/SKU
- Ver detalles de producto
- Seleccionar variantes y packs

#### Carrito de Compras
- Agregar productos al carrito
- Seleccionar cantidad de packs
- Modificar cantidades
- Eliminar productos
- Ver subtotal y total
- Aplicar cupones de descuento

#### Checkout
- Seleccionar dirección de envío
- Agregar nueva dirección
- Revisar resumen de pedido
- Confirmar compra
- Recibir confirmación por email

#### Cuenta
- Ver historial de pedidos
- Consultar estado de pedidos
- Gestionar direcciones de envío
- Actualizar información personal
- Ver límite de crédito disponible

#### Crédito
- Consultar línea de crédito
- Ver saldo disponible
- Solicitar ampliación de crédito
- Ver historial de pagos

**Casos de Uso Principales**:

1. **Realizar Compra**
   - Navegar catálogo
   - Agregar productos al carrito
   - Ir a `/carrito.html`
   - Seleccionar dirección de envío
   - Aplicar cupón (opcional)
   - Confirmar pedido
   - Recibir confirmación

2. **Consultar Estado de Pedido**
   - Acceder a `/cuenta-pedidos.html`
   - Ver listado de pedidos
   - Click en pedido específico
   - Ver detalles: productos, cantidades, estado, fecha estimada

## Flujos de Negocio Principales

### Flujo 1: Ciclo Completo de Venta

```
1. CLIENTE: Navega catálogo
   ↓
2. CLIENTE: Agrega productos al carrito
   ↓
3. CLIENTE: Realiza checkout
   ↓
4. SISTEMA: Valida stock disponible
   ↓
5. SISTEMA: Valida crédito del cliente (si aplica)
   ↓
6. SISTEMA: Crea pedido con estado "Pendiente"
   ↓
7. SISTEMA: Descuenta stock de inventario
   ↓
8. SISTEMA: Envía email de confirmación al cliente
   ↓
9. SISTEMA: Notifica al admin del nuevo pedido
   ↓
10. ADMIN: Revisa pedido en panel
    ↓
11. ADMIN: Surte pedido (empaca productos)
    ↓
12. ADMIN: Cambia estado a "Surtido"
    ↓
13. ADMIN: Genera remisión
    ↓
14. ADMIN: Cambia estado a "Enviado"
    ↓
15. SISTEMA: Notifica al cliente del envío
    ↓
16. ADMIN: Confirma entrega (estado "Entregado")
    ↓
17. SISTEMA: Genera comisión para agente (si aplica)
    ↓
18. SISTEMA: Registra en CXC (si es crédito)
```

### Flujo 2: Gestión de Inventario

```
1. ADMIN: Crea orden de compra a proveedor
   ↓
2. ADMIN: Especifica productos y cantidades
   ↓
3. SISTEMA: Guarda OC con estado "Pendiente"
   ↓
4. PROVEEDOR: Entrega mercancía (fuera del sistema)
   ↓
5. ADMIN: Accede a "Recibir Inventario"
   ↓
6. ADMIN: Selecciona OC pendiente
   ↓
7. ADMIN: Confirma cantidades recibidas
   ↓
8. SISTEMA: Valida regla de empaque
   ↓
9. SISTEMA: Actualiza inventario (suma cantidades)
   ↓
10. SISTEMA: Cambia estado OC a "Recibida"
    ↓
11. SISTEMA: Genera entrada de inventario
    ↓
12. SISTEMA: Registra en auditoría de inventario
    ↓
13. SISTEMA: Actualiza CXP (si aplica)
```

### Flujo 3: Gestión de Crédito

```
1. CLIENTE: Se registra en el sistema
   ↓
2. ADMIN: Revisa solicitud de crédito
   ↓
3. ADMIN: Analiza historial y referencias
   ↓
4. ADMIN: Aprueba línea de crédito
   ↓
5. ADMIN: Configura límite de crédito
   ↓
6. ADMIN: Configura plazo de pago (días)
   ↓
7. SISTEMA: Activa crédito para cliente
   ↓
8. CLIENTE: Realiza compras a crédito
   ↓
9. SISTEMA: Valida límite disponible en cada compra
   ↓
10. SISTEMA: Descuenta del límite al confirmar pedido
    ↓
11. SISTEMA: Registra en CXC con fecha de vencimiento
    ↓
12. SISTEMA: Envía alertas de vencimiento próximo
    ↓
13. CLIENTE: Realiza pago
    ↓
14. ADMIN: Registra pago en sistema
    ↓
15. SISTEMA: Libera límite de crédito
    ↓
16. SISTEMA: Actualiza saldo en CXC
```

### Flujo 4: Sistema de Comisiones

```
1. ADMIN: Configura esquema de comisiones por agente
   ↓
2. ADMIN: Define porcentaje de comisión
   ↓
3. ADMIN: Asigna cartera de clientes al agente
   ↓
4. CLIENTE: Realiza compra (cliente asignado al agente)
   ↓
5. SISTEMA: Procesa pedido normalmente
   ↓
6. ADMIN: Cambia estado de pedido a "Entregado"
   ↓
7. SISTEMA: Calcula comisión (monto_pedido * porcentaje)
   ↓
8. SISTEMA: Registra comisión con estado "Pendiente"
   ↓
9. AGENTE: Consulta comisiones en su panel
   ↓
10. ADMIN: Revisa comisiones pendientes
    ↓
11. ADMIN: Aprueba pago de comisiones
    ↓
12. ADMIN: Cambia estado a "Pagado"
    ↓
13. SISTEMA: Actualiza totales del agente
```

## Módulo de Ventas

### Características del Catálogo

#### Sistema de Variantes
Cada producto puede tener múltiples variantes basadas en:
- **Dimensiones físicas**: Ej. 10x10, 20x20, 30x30
- **Medida**: Unidad de medida (cm, pulgadas, etc.)
- **Precio unitario**: Precio específico por variante
- **Stock independiente**: Cada variante tiene su propio inventario

#### Sistema de Packs
Los productos se venden en packs configurables:
- **Pack de 1**: Venta unitaria
- **Pack de 6**: Caja de 6 unidades
- **Pack de 12**: Caja de 12 unidades
- **Pack de 24**: Caja de 24 unidades

**Reglas de Negocio**:
- El admin configura qué packs están disponibles por producto
- El cliente solo puede comprar en los packs habilitados
- El precio se calcula: `precio_unitario * tamaño_pack * cantidad`
- El stock se descuenta en unidades individuales

**Ejemplo**:
```
Producto: Globo Metálico Corazón
Variante: 20x20 cm - $15.00 c/u
Packs disponibles: 1, 6, 12

Cliente compra:
- 2 packs de 6 unidades
- Cálculo: $15.00 * 6 * 2 = $180.00
- Stock descontado: 12 unidades
```

### Carrito de Compras

#### Funcionalidades
- Persistencia en base de datos (tabla `carrito_items`)
- Validación de stock en tiempo real
- Cálculo automático de subtotales
- Aplicación de cupones de descuento
- Validación de límite de crédito

#### Validaciones Críticas
1. **Stock Disponible**: Antes de agregar al carrito
2. **Límite de Crédito**: En el checkout
3. **Productos Activos**: Solo productos habilitados
4. **Variantes Válidas**: Verificar que la variante existe
5. **Packs Permitidos**: Solo packs configurados

### Sistema de Cupones

#### Tipos de Cupones
- **Porcentaje**: Descuento del X% sobre el total
- **Monto Fijo**: Descuento de $X pesos

#### Configuración
- Código único por cupón
- Fecha de inicio y fin de vigencia
- Límite de usos (opcional)
- Monto mínimo de compra (opcional)
- Productos específicos o todos

#### Validaciones
- Cupón activo y vigente
- No exceder límite de usos
- Cumplir monto mínimo
- Aplicable a productos en carrito

## Módulo de Inventario

### Conceptos Clave

#### Reglas de Empaque
Cada producto está asociado a una regla de empaque que define:
- **Proveedor**: De quién se compra
- **Tipo de Producto**: Categoría de empaque
- **Cantidad de Empaque**: Múltiplo en que se recibe

**Ejemplo**:
```
Producto: Globo Látex 12"
Regla de Empaque:
  - Proveedor: Qualatex
  - Tipo: Globos Látex
  - Cantidad Empaque: 100

Esto significa que al recibir inventario, 
debe ser en múltiplos de 100 unidades.
```

#### Órdenes de Compra (OC)

**Flujo de Creación**:
1. Admin crea OC desde `/admin-crear-oc.html`
2. Selecciona proveedor
3. Agrega productos con cantidades
4. Sistema valida reglas de empaque
5. Guarda OC con estado "Pendiente"

**Flujo de Recepción**:
1. Admin accede a `/admin-recibir-inventario.html`
2. Selecciona OC pendiente
3. Sistema muestra productos esperados
4. Admin confirma cantidades recibidas
5. Sistema valida múltiplos de empaque
6. Actualiza inventario
7. Cambia estado OC a "Recibida"

#### Movimientos de Inventario

**Tipos de Movimientos**:
- **Entrada**: Recepción de OC, devoluciones de cliente
- **Salida**: Venta a cliente, merma, donación
- **Ajuste**: Corrección de inventario (positivo o negativo)

**Auditoría**:
Cada movimiento registra:
- Usuario que realizó el movimiento
- Fecha y hora
- Tipo de movimiento
- Cantidad anterior
- Cantidad nueva
- Motivo (opcional)

### Alertas de Stock

El sistema genera alertas cuando:
- Stock < Stock Mínimo configurado
- Producto sin stock (0 unidades)
- Variante sin stock pero producto activo

## Módulo de Créditos

### Configuración de Crédito

#### Parámetros por Cliente
- **Límite de Crédito**: Monto máximo que puede deber
- **Plazo de Pago**: Días para pagar (ej. 30, 60, 90 días)
- **Crédito Activo**: Booleano para habilitar/deshabilitar
- **Saldo Actual**: Monto que debe actualmente

#### Cálculo de Disponible
```javascript
credito_disponible = limite_credito - saldo_actual
```

### Validación en Compra

**Antes de Confirmar Pedido**:
1. Verificar que cliente tiene crédito activo
2. Calcular total del pedido
3. Validar: `total_pedido <= credito_disponible`
4. Si pasa: Procesar pedido y actualizar saldo
5. Si falla: Rechazar con mensaje de crédito insuficiente

### Cuentas por Cobrar (CXC)

#### Registro de Deuda
Al confirmar pedido a crédito:
```sql
INSERT INTO cxc (
  tenant_id,
  clienteid,
  pedidoid,
  monto,
  fecha_vencimiento,
  estado
) VALUES (
  $tenant_id,
  $clienteid,
  $pedidoid,
  $total_pedido,
  CURRENT_DATE + INTERVAL '$plazo_dias days',
  'Pendiente'
);
```

#### Estados de CXC
- **Pendiente**: Deuda activa sin vencer
- **Vencida**: Pasó la fecha de vencimiento
- **Pagada**: Cliente realizó el pago
- **Parcial**: Pago parcial realizado

#### Registro de Pagos
```sql
UPDATE cxc 
SET estado = 'Pagada',
    fecha_pago = CURRENT_DATE,
    monto_pagado = $monto
WHERE cxcid = $id AND tenant_id = $tenant_id;

-- Liberar crédito
UPDATE clientes
SET saldo_credito = saldo_credito - $monto
WHERE clienteid = $clienteid AND tenant_id = $tenant_id;
```

### Alertas de Vencimiento

El sistema ejecuta un cron job diario que:
1. Identifica deudas próximas a vencer (7 días antes)
2. Identifica deudas vencidas
3. Envía emails de recordatorio a clientes
4. Notifica a admins de deudas vencidas
5. Puede bloquear crédito si excede días de mora

## Módulo de Comisiones

### Configuración de Agentes

#### Esquema de Comisiones
```sql
CREATE TABLE agentesdeventas (
  agenteid SERIAL PRIMARY KEY,
  nombre VARCHAR(255),
  email VARCHAR(255),
  porcentaje_comision NUMERIC(5,2), -- Ej: 5.00 = 5%
  activo BOOLEAN DEFAULT TRUE
);
```

#### Asignación de Cartera
```sql
UPDATE clientes
SET agenteid = $agente_id
WHERE clienteid = $cliente_id AND tenant_id = $tenant_id;
```

### Cálculo de Comisiones

**Trigger al Cambiar Estado de Pedido a "Entregado"**:
```javascript
// controllers/pedidosController.js
if (nuevoEstado === 'Entregado') {
  // Obtener cliente del pedido
  const cliente = await db.query(
    'SELECT agenteid FROM clientes WHERE clienteid = $1',
    [pedido.clienteid]
  );
  
  if (cliente.agenteid) {
    // Obtener porcentaje de comisión del agente
    const agente = await db.query(
      'SELECT porcentaje_comision FROM agentesdeventas WHERE agenteid = $1',
      [cliente.agenteid]
    );
    
    // Calcular comisión
    const monto_comision = pedido.total * (agente.porcentaje_comision / 100);
    
    // Registrar comisión
    await db.query(
      `INSERT INTO comisiones (agenteid, pedidoid, monto_venta, porcentaje, monto_comision, estado)
       VALUES ($1, $2, $3, $4, $5, 'Pendiente')`,
      [cliente.agenteid, pedido.pedidoid, pedido.total, agente.porcentaje_comision, monto_comision]
    );
  }
}
```

### Consulta de Comisiones

**Endpoint para Agentes**:
```javascript
// GET /api/agente/comisiones
router.get('/comisiones', authenticate, authorize(['agente']), async (req, res) => {
  const { userId } = req.user;
  
  const result = await db.query(
    `SELECT c.*, p.pedidoid, p.fecha, cl.nombre as cliente_nombre
     FROM comisiones c
     JOIN pedidos p ON c.pedidoid = p.pedidoid
     JOIN clientes cl ON p.clienteid = cl.clienteid
     WHERE c.agenteid = $1
     ORDER BY c.fecha DESC`,
    [userId]
  );
  
  res.json(result.rows);
});
```

### Pago de Comisiones

**Flujo de Aprobación**:
1. Admin accede a módulo de comisiones
2. Filtra comisiones pendientes
3. Selecciona comisiones a pagar
4. Confirma pago
5. Sistema cambia estado a "Pagado"
6. Registra fecha de pago

## Módulo de Reportes

### Reportes Disponibles

#### 1. Reporte de Ventas
**Filtros**:
- Rango de fechas
- Cliente específico
- Agente específico
- Estado de pedido

**Datos Mostrados**:
- Total de ventas
- Número de pedidos
- Ticket promedio
- Productos más vendidos
- Ventas por día/semana/mes

**Exportación**: Excel con formato

#### 2. Reporte de Inventario
**Datos**:
- Productos con stock
- Productos sin stock
- Productos con stock bajo
- Valor total del inventario
- Movimientos de inventario por período

**Cálculo de Valor**:
```sql
SELECT 
  p.nombre,
  pv.dimensiones,
  i.cantidad,
  pv.preciounitario,
  (i.cantidad * pv.preciounitario) as valor_total
FROM inventario i
JOIN producto_variantes pv ON i.varianteid = pv.varianteid
JOIN productos p ON pv.productoid = p.productoid
WHERE p.tenant_id = $tenant_id;
```

#### 3. Reporte de Comisiones
**Filtros**:
- Agente específico
- Rango de fechas
- Estado (Pendiente/Pagado)

**Datos**:
- Total de comisiones generadas
- Total pagado
- Total pendiente
- Comisiones por agente
- Detalle por pedido

#### 4. Reporte de CXC
**Datos**:
- Saldo total por cobrar
- Deudas vencidas
- Deudas por vencer
- Clientes con mayor deuda
- Historial de pagos

#### 5. Reporte de CXP
**Datos**:
- Saldo total por pagar
- Pagos pendientes por proveedor
- Próximos vencimientos
- Historial de pagos a proveedores

### Exportación a Excel

El sistema usa la librería `exceljs` para generar reportes:

```javascript
const ExcelJS = require('exceljs');

async function exportarVentas(data) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Ventas');
  
  // Definir columnas
  worksheet.columns = [
    { header: 'Pedido', key: 'pedidoid', width: 10 },
    { header: 'Fecha', key: 'fecha', width: 15 },
    { header: 'Cliente', key: 'cliente', width: 30 },
    { header: 'Total', key: 'total', width: 15 }
  ];
  
  // Agregar datos
  worksheet.addRows(data);
  
  // Aplicar formato
  worksheet.getRow(1).font = { bold: true };
  
  // Generar buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}
```

## Casos de Uso Detallados

### Caso 1: Cliente Realiza Primera Compra

**Precondiciones**:
- Cliente registrado en el sistema
- Productos disponibles en catálogo
- Stock suficiente

**Flujo**:
1. Cliente accede a `catalogo.html`
2. Navega por categorías o busca producto
3. Click en producto para ver detalles
4. Selecciona variante (tamaño)
5. Selecciona pack (1, 6, 12, etc.)
6. Ingresa cantidad de packs
7. Click en "Agregar al Carrito"
8. Sistema valida stock disponible
9. Sistema agrega a `carrito_items` en BD
10. Cliente ve badge actualizado en carrito
11. Cliente continúa comprando o va a carrito
12. En carrito, revisa productos
13. Aplica cupón (opcional)
14. Click en "Proceder al Pago"
15. Selecciona dirección de envío
16. Revisa resumen de pedido
17. Click en "Confirmar Pedido"
18. Sistema valida stock nuevamente
19. Sistema valida crédito (si aplica)
20. Sistema crea pedido en BD
21. Sistema descuenta stock
22. Sistema vacía carrito
23. Sistema envía email de confirmación
24. Cliente ve mensaje de éxito con número de pedido

**Postcondiciones**:
- Pedido creado con estado "Pendiente"
- Stock actualizado
- Email enviado
- Notificación para admin

### Caso 2: Admin Recibe Inventario

**Precondiciones**:
- Orden de compra creada y pendiente
- Mercancía recibida físicamente

**Flujo**:
1. Admin accede a `/admin-recibir-inventario.html`
2. Sistema carga órdenes pendientes
3. Admin selecciona OC a recibir
4. Sistema muestra productos de la OC
5. Para cada producto:
   - Admin confirma cantidad recibida
   - Sistema valida múltiplo de empaque
   - Si no es múltiplo, muestra error
6. Admin confirma recepción total
7. Sistema inicia transacción en BD
8. Para cada producto:
   - Actualiza tabla `inventario`
   - Registra movimiento en auditoría
9. Cambia estado de OC a "Recibida"
10. Registra en CXP (si aplica)
11. Sistema confirma recepción exitosa
12. Admin ve inventario actualizado

**Postcondiciones**:
- Inventario actualizado
- OC marcada como recibida
- Auditoría registrada
- CXP actualizada

### Caso 3: Agente Consulta Comisiones

**Precondiciones**:
- Agente autenticado
- Tiene clientes asignados
- Existen ventas de sus clientes

**Flujo**:
1. Agente accede a `/agente-comisiones.html`
2. Sistema carga comisiones del agente
3. Muestra tabla con:
   - Pedido
   - Cliente
   - Fecha
   - Monto de venta
   - Porcentaje
   - Monto de comisión
   - Estado (Pendiente/Pagado)
4. Muestra totales:
   - Total Pagado
   - Total Pendiente
5. Agente puede filtrar por fecha
6. Agente puede exportar a Excel
7. Sistema genera archivo Excel
8. Agente descarga reporte

**Postcondiciones**:
- Agente tiene visibilidad de sus comisiones
- Puede hacer seguimiento de pagos

### Caso 4: Admin Gestiona Crédito de Cliente

**Precondiciones**:
- Cliente registrado
- Admin con permisos

**Flujo Inicial (Activar Crédito)**:
1. Admin accede a `/admin-clientes.html`
2. Busca cliente específico
3. Click en "Editar"
4. Activa checkbox "Crédito Activo"
5. Ingresa límite de crédito: $50,000
6. Ingresa plazo de pago: 30 días
7. Guarda cambios
8. Sistema actualiza tabla `clientes`
9. Cliente ahora puede comprar a crédito

**Flujo de Compra a Crédito**:
1. Cliente realiza compra por $5,000
2. En checkout, sistema detecta crédito activo
3. Valida: $5,000 <= $50,000 (disponible) ✓
4. Procesa pedido
5. Actualiza saldo: $50,000 - $5,000 = $45,000
6. Registra en CXC con vencimiento en 30 días

**Flujo de Pago**:
1. Cliente realiza pago de $5,000
2. Admin accede a módulo CXC
3. Busca deuda del cliente
4. Click en "Registrar Pago"
5. Ingresa monto: $5,000
6. Confirma pago
7. Sistema actualiza CXC a "Pagada"
8. Libera crédito: $45,000 + $5,000 = $50,000

**Postcondiciones**:
- Cliente tiene crédito disponible nuevamente
- Historial de pagos actualizado

## Conclusión

El sistema RazoConnect proporciona una solución completa para la gestión de operaciones B2B, integrando:
- E-commerce con catálogo personalizable
- Gestión de inventario con trazabilidad
- Sistema de créditos y cobranza
- Comisiones automatizadas para agentes
- Reportes y análisis de negocio

Cada módulo está diseñado para optimizar procesos específicos del negocio, reduciendo errores manuales y proporcionando visibilidad en tiempo real de las operaciones.
