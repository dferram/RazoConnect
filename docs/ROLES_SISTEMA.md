# ROLES DEL SISTEMA - Simplificado

## 8 Roles Únicos (Abril 2026)

### 1. **super_admin** (Super Administrador)
- **Acceso**: TOTAL al sistema
- **Stock**: Ve todo, modifica todo
- **admin_responsable_id**: NO (No aplica)
- **Usuarios**: Fernando Ramírez, Fernando García

### 2. **admin** (Administrador)
- **Acceso**: Total EXCEPTO configuración SaaS
- **Stock**: Ve todo su tenant, modifica todo
- **admin_responsable_id**: NO (Es el dueño de su tenant)
- **Usuarios**: Alejandra Calderón, Lupita García, Maricela García

### 3. **inventarios** (Especialista de Inventarios)
- **Acceso**: Inventario, compras, ver productos
- **Stock**: SOLO del admin asignado
- **admin_responsable_id**: SÍ (REQUERIDO)
- **Acciones**: Marcar surtidos, hacer conteos, ajustes
- **Usuario Demo**: inventarios@gmail.com

### 4. **catalogo** (Especialista de Catálogo)
- **Acceso**: Productos (crear, editar, ver)
- **Stock**: NO toca stock (solo información)
- **admin_responsable_id**: NO (No necesita)
- **Acciones**: Editar descripciones, imágenes, SEO
- **Usuario Demo**: catalogo@gmail.com

### 5. **finanzas** (Especialista de Finanzas)
- **Acceso**: Finanzas, cobranza, crédito, surtidos
- **Stock**: SOLO del admin asignado (confirma surtidos)
- **admin_responsable_id**: SÍ (REQUERIDO)
- **Acciones**: Confirmar surtidos, ver CXC, cobranza
- **Usuario Demo**: finanzas@gmail.com

### 6. **compras** (Especialista de Compras)
- **Acceso**: Órdenes de compra, proveedores
- **Stock**: SOLO del admin asignado (recibe OC)
- **admin_responsable_id**: SÍ (REQUERIDO)
- **Acciones**: Crear OC, recibir inventario
- **Usuario Demo**: compras@gmail.com

### 7. **agente** (Agente de Ventas)
- **Acceso**: Crear pedidos, ver clientes asignados
- **Stock**: Ve SOLO del admin asignado
- **admin_responsable_id**: SÍ (REQUERIDO)
- **Acciones**: Crear pedidos, gestionar cartera
- **Usuario Demo**: agente@gmail.com

### 8. **cliente** (Cliente - En tabla clientes, no administradores)
- **Acceso**: Ver catálogo y sus pedidos
- **Stock**: Ve del admin de su estado
- **admin_responsable_id**: NO (Ve por estado)

---

## Matriz de Asignación admin_responsable_id

| Rol | ¿Necesita? | Obligatorio? | Afecta Stock |
|-----|-----------|------------|--------------|
| super_admin | ❌ | - | No |
| admin | ❌ | - | No |
| inventarios | ✅ | SÍ | SÍ |
| catalogo | ❌ | - | No |
| finanzas | ✅ | SÍ | SÍ |
| compras | ✅ | SÍ | SÍ |
| agente | ✅ | SÍ | No (solo ve) |

---

## Acciones Requeridas

- [x] Limpieza de tabla `roles_permisos` (7 roles solo) ✅
- [x] Actualizar CHECK constraint ✅
- [x] Actualizar SmartStockService.js ✅
- [ ] Crear UI para asignar admin_responsable_id
- [ ] Validar en adminAuthController que rol requiere asignación
- [ ] Testear todos los roles
