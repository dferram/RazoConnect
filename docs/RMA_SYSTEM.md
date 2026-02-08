# SISTEMA RMA (RETURN MERCHANDISE AUTHORIZATION)

## IMPLEMENTACIÓN COMPLETADA

### 1. BASE DE DATOS
**Archivo:** `migrations/20260208_create_rma_system.sql`

**Tablas Creadas:**
- `devoluciones` - Solicitudes principales
- `devoluciones_detalles` - Items devueltos
- `evidencias_devolucion` - Fotos/documentos
- `inventario_mermas` - Stock dañado/no vendible
- `cliente_saldo_favor` - Wallet para pedidos pagados
- `cliente_saldo_favor_movimientos` - Historial de saldo

**Triggers Automáticos:**
- Validación de 30 días
- Validación de cantidades
- Cálculo automático de montos

### 2. BACKEND
**Archivo:** `controllers/devolucionesController.js`
**Rutas:** `routes/devoluciones.js`

**Endpoints Cliente:**
- `POST /api/cliente/devoluciones` - Crear solicitud
- `POST /api/cliente/devoluciones/:id/evidencias` - Subir fotos
- `GET /api/cliente/devoluciones` - Listar mis devoluciones
- `GET /api/cliente/devoluciones/:id` - Ver detalle

**Endpoints Admin:**
- `GET /api/admin/devoluciones` - Listar todas (con filtros)
- `POST /api/admin/devoluciones/:id/aprobar` - Aprobar
- `POST /api/admin/devoluciones/:id/rechazar` - Rechazar

### 3. FRONTEND

**Admin:**
- `admin-devoluciones.html` - Panel de gestión
- `js/admin-devoluciones.js` - Lógica

**Cliente:**
- `mis-devoluciones.html` - Historial
- `js/mis-devoluciones.js` - Visualización
- `js/solicitar-devolucion.js` - Crear solicitudes

### 4. FLUJO DE NEGOCIO

**Solicitud (Cliente):**
1. Validación de 30 días
2. Selección de productos
3. Especificar motivo y condición
4. Subir evidencias fotográficas

**Aprobación (Admin):**
Transacción atómica que ejecuta:
- **Inventario:** Reintegra a `stock_admin` (sellado) o registra en `inventario_mermas` (dañado)
- **Finanzas:**
  - Pedido a crédito: Nota de crédito en `cuentas_por_cobrar` + reduce `saldo_deudor`
  - Pedido pagado: Crea/actualiza `cliente_saldo_favor`
  - Pedido pendiente: Ajusta `monto_surtido` y `monto_backorder`

### 5. PASOS PARA ACTIVAR

**1. Ejecutar migración SQL:**
```bash
psql -U postgres -d razoconnect -f migrations/20260208_create_rma_system.sql
```

**2. Reiniciar servidor:**
```bash
npm start
```

**3. Acceder a interfaces:**
- Admin: `http://localhost:3000/admin-devoluciones.html`
- Cliente: `http://localhost:3000/mis-devoluciones.html`

### 6. TESTING RECOMENDADO

**Escenario 1: Pedido a Crédito**
- Crear devolución de $500
- Aprobar
- Verificar: `cuentas_por_cobrar` tiene ABONO, `saldo_deudor` reducido

**Escenario 2: Pedido Pagado**
- Crear devolución de $300
- Aprobar
- Verificar: `cliente_saldo_favor` creado/actualizado

**Escenario 3: Producto Dañado**
- Marcar condición como DANADO
- Aprobar
- Verificar: Registro en `inventario_mermas`, NO en `stock_admin`

**Escenario 4: Validación 30 días**
- Intentar devolver pedido > 30 días
- Verificar: Error 403 con mensaje claro

### 7. REGLAS DE NEGOCIO

✅ Solo pedidos Completados/Entregados/Parcial  
✅ Máximo 30 días desde fecha de pedido  
✅ No exceder cantidad comprada  
✅ Evidencias fotográficas obligatorias  
✅ Transacciones atómicas (todo o nada)  
✅ Emails automáticos de notificación  

### 8. ARCHIVOS MODIFICADOS

- `index.js` - Registro de rutas
- Nuevos: 7 archivos (controlador, rutas, 3 HTML, 3 JS)
