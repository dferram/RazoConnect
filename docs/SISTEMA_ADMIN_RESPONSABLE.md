# Sistema de Admin Responsable

## Descripción General

El sistema de **Admin Responsable** permite asignar usuarios de roles operativos a un admin principal. Esto determina a qué stock y datos tienen acceso cada usuario.

---

## Roles del Sistema

### Roles que NECESITAN admin_responsable_id:

- ✅ **inventarios** - Gestión de almacén
- ✅ **catalogo** - Gestión de productos
- ✅ **finanzas** - Gestión financiera
- ✅ **compras** - Gestión de compras
- ✅ **agente** - Ventas externas

### Roles que NO necesitan asignación:

- ❌ **super_admin** - Acceso total al sistema
- ❌ **admin** - Usa su propio ID como admin_responsable
- ❌ **cliente** - Usa admin asignado en tabla clientes

---

## Estructura de Base de Datos

### Tabla: `administradores`

```sql
ALTER TABLE administradores 
ADD COLUMN admin_responsable_id INTEGER REFERENCES administradores(adminid);
```

**Ejemplo de asignaciones**:
```
adminid | nombre           | email                  | rol         | admin_responsable_id
--------|------------------|------------------------|-------------|---------------------
4       | Alejandra        | ale@tienda.com         | admin       | NULL
10      | Demo Inventarios | inventarios@gmail.com  | inventarios | 4
11      | Demo Catalogo    | catalogo@gmail.com     | catalogo    | 4
12      | Demo Finanzas    | finanzas@gmail.com     | finanzas    | 4
13      | Demo Compras     | compras@gmail.com      | compras     | 4
14      | Demo Agente      | agente@gmail.com       | agente      | 4
```

---

## Funcionamiento

### 1. Asignación de Admin Responsable

Cada usuario operativo debe tener un `admin_responsable_id`:

```sql
-- Asignar usuario individual
UPDATE administradores 
SET admin_responsable_id = 4 
WHERE adminid = 12;

-- Asignar todos los usuarios operativos al mismo admin
UPDATE administradores 
SET admin_responsable_id = 4 
WHERE rol IN ('inventarios', 'catalogo', 'finanzas', 'compras', 'agente')
  AND activo = true;
```

### 2. Acceso a Stock por Rol

**SmartStockService** determina el `admin_id` según el rol:

```javascript
// Usuario finanzas ID 12 con admin_responsable_id = 4
const context = await determineUserContext({ 
  userId: 12, 
  userRole: ['finanzas'], 
  tenantId: 1 
});

// Resultado: { isAdmin: true, adminId: 4 }
// Accede a: stock_admin WHERE admin_id = 4
```

### 3. Flujo Completo

```
1. Usuario Inventarios (ID 10, admin_responsable_id = 4)
   └─> Marca productos como surtidos
   └─> Usa stock_admin WHERE admin_id = 4

2. Pedido pasa a "Pendiente de Confirmación"

3. Usuario Finanzas (ID 12, admin_responsable_id = 4)
   └─> Confirma el pedido
   └─> Reduce stock_admin WHERE admin_id = 4
   └─> Genera CXC
   └─> Pedido pasa a "Surtido"
```

---

## Scripts de Gestión

### 1. Ver Asignaciones Actuales

```bash
node scripts/asignar-admins-responsables.js
```

**Salida**:
```
📋 Usuarios que necesitan admin responsable:
ID: 10 | Demo Inventarios | inventarios | ✅ Admin 4
ID: 11 | Demo Catalogo    | catalogo    | ❌ Sin asignar
ID: 12 | Demo Finanzas    | finanzas    | ✅ Admin 4
ID: 13 | Demo Compras     | compras     | ❌ Sin asignar
ID: 14 | Demo Agente      | agente      | ✅ Admin 4
```

### 2. Distribuir Stock

```bash
node scripts/distribuir-stock-global-a-admins.js
```

---

## Casos de Uso

### Caso 1: Tienda Simple (1 Admin)

```sql
-- Admin principal
INSERT INTO administradores (nombre, email, rol) 
VALUES ('Alejandra', 'ale@tienda.com', 'admin');

-- Usuarios operativos
INSERT INTO administradores (nombre, email, rol, admin_responsable_id) 
VALUES 
  ('María', 'maria@tienda.com', 'finanzas', 4),
  ('Juan', 'juan@tienda.com', 'inventarios', 4),
  ('Pedro', 'pedro@tienda.com', 'catalogo', 4);
```

### Caso 2: Múltiples Sucursales

```sql
-- Admin Sucursal Norte
INSERT INTO administradores (nombre, email, rol) 
VALUES ('Admin Norte', 'norte@tienda.com', 'admin');

-- Admin Sucursal Sur  
INSERT INTO administradores (nombre, email, rol) 
VALUES ('Admin Sur', 'sur@tienda.com', 'admin');

-- Asignar usuarios a cada sucursal
UPDATE administradores SET admin_responsable_id = 5 WHERE adminid IN (10, 12); -- Norte
UPDATE administradores SET admin_responsable_id = 6 WHERE adminid IN (11, 13); -- Sur
```

---

## Migración de Sistema Existente

### Paso 1: Agregar Columna (Ya ejecutado)

```sql
ALTER TABLE administradores 
ADD COLUMN IF NOT EXISTS admin_responsable_id INTEGER REFERENCES administradores(adminid);
```

### Paso 2: Asignar Usuarios

```sql
-- Ver usuarios sin asignar
SELECT adminid, nombre, rol, admin_responsable_id 
FROM administradores 
WHERE rol IN ('inventarios', 'catalogo', 'finanzas', 'compras', 'agente')
  AND activo = true;

-- Asignar todos al admin principal (ID 4)
UPDATE administradores 
SET admin_responsable_id = 4 
WHERE rol IN ('inventarios', 'catalogo', 'finanzas', 'compras', 'agente')
  AND activo = true
  AND admin_responsable_id IS NULL;
```

### Paso 3: Distribuir Stock

```sql
-- Copiar stock global al admin 4
INSERT INTO stock_admin (admin_id, variante_id, tenant_id, cantidad)
SELECT 4, varianteid, 1, stock
FROM producto_variantes
WHERE stock > 0
ON CONFLICT (admin_id, variante_id, tenant_id) DO NOTHING;
```

### Paso 4: Verificar

```sql
-- Ver asignaciones
SELECT adminid, nombre, rol, admin_responsable_id 
FROM administradores 
WHERE rol IN ('inventarios', 'catalogo', 'finanzas', 'compras', 'agente');

-- Ver stock por admin
SELECT sa.admin_id, a.nombre, COUNT(*) as productos, SUM(sa.cantidad) as total_piezas
FROM stock_admin sa
JOIN administradores a ON sa.admin_id = a.adminid
GROUP BY sa.admin_id, a.nombre;
```

---

## Troubleshooting

### Error: "No hay stock disponible para decrementar"

**Causa**: No existe registro en `stock_admin` para el admin asignado.

**Solución**:
```sql
-- 1. Verificar admin asignado
SELECT admin_responsable_id FROM administradores WHERE adminid = 12;

-- 2. Verificar stock
SELECT * FROM stock_admin WHERE admin_id = 4 AND variante_id = 40;

-- 3. Crear stock si no existe
INSERT INTO stock_admin (admin_id, variante_id, tenant_id, cantidad)
VALUES (4, 40, 1, 48);
```

### Usuario sin admin asignado

**Síntoma**: Usuario operativo con `admin_responsable_id = NULL`

**Solución**:
```sql
UPDATE administradores 
SET admin_responsable_id = 4 
WHERE adminid = 12;
```

---

## Beneficios

✅ **Separación de inventarios** por admin/sucursal  
✅ **Control granular** de acceso a stock  
✅ **Trazabilidad** de operaciones por admin  
✅ **Escalabilidad** para múltiples sucursales  
✅ **Fallback inteligente** si no hay admin asignado  

---

## Resumen de Implementación

1. ✅ Columna `admin_responsable_id` agregada
2. ✅ SmartStockService actualizado para todos los roles
3. ✅ Scripts de gestión creados
4. ✅ Documentación completa
5. ⏳ Asignar usuarios existentes
6. ⏳ Distribuir stock inicial
