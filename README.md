# RazoConnect

RazoConnect es una plataforma de e-commerce orientada a la venta al mayoreo de cajas de fashion. Está diseñada para cubrir los flujos comerciales típicos de un negocio B2B/B2C mayorista: catálogo por paquetes, gestión de inventario con auditoría, procesamiento de pedidos, panel administrativo completo y un sistema de agentes con comisiones.

Este README ofrece una descripción del proyecto, su arquitectura y las funcionalidades principales. No es un manual de instalación ni un tutorial.

## Propósito y enfoque
- Proveer una API RESTful y una interfaz administrativa que permitan gestionar catálogo, stock, órdenes y comisiones de agentes.
- Facilitar operaciones mayoristas por paquetes (piezas por paquete, precio por paquete, control de stock en unidades de paquete).
- Mantener trazabilidad y auditoría de cambios de inventario y operaciones críticas mediante transacciones atómicas y logs.

## Características principales
- API RESTful construida con Node.js y Express.
- Persistencia con PostgreSQL (modelo relacional).
- Autenticación basada en JWT con roles diferenciados (clientes, agentes, administradores).
- Encriptación segura de contraseñas con bcrypt.
- Gestión completa de inventario con registro de movimientos (Log_Inventario).
- Panel administrativo con estadísticas en tiempo real, gestión de pedidos, productos, agentes y comisiones.
- Sistemas de validación y reglas de negocio (unicidad de SKU, códigos de agente, stock no negativo).
- Soporte para backorders y recepción parcial/total de ordenes de compra.
- Endpoints orientados a auditoría y operaciones atómicas (BEGIN/COMMIT/ROLLBACK).

## Principales dominios y flujos de negocio
- Usuarios
  - Clientes: navegación de catálogo, carrito y proceso de pedido.
  - Agentes: registro de ventas que generan comisiones.
  - Administradores: control y operación del sistema (confirmar pedidos, ajustar inventario, pagar comisiones).
- Catálogo y productos
  - Productos con SKU, piezas por paquete, costo unitario, precio por paquete y stock.
  - Cálculo automático de margen y ganancia a nivel de paquete.
- Pedidos
  - Estados: Pendiente, Confirmado, Enviado, Entregado, Cancelado.
  - Confirmación de pedido: verificación de stock, decremento de inventario y registro en log en una transacción atómica.
- Inventario
  - Ajustes con motivo y tipo (Entrada/Salida), prevención de stock negativo y registro en Log_Inventario.
  - Recepción de órdenes de compra para cubrir backorders.
- Comisiones y agentes
  - Registro de agentes con código único, métricas de ventas y comisiones acumuladas.
  - Flujo para marcar comisiones como pagadas y evitar pagos duplicados.
- Auditoría
  - Log de movimientos de inventario con ProductoID, TipoMovimiento, Cantidad, Motivo, UsuarioID y timestamp.

## Endpoints (resumen de alto nivel)
- Salud y prueba
  - GET /api — bienvenida
  - GET /api/health — estado del servidor y BD
- Autenticación
  - POST /api/registro/cliente — registrar cliente
  - POST /api/registro/agente — registrar agente
  - POST /api/login — login (clientes/agentes/admins, con flujo que detecta rol)
- Administración (protegido, JWT admin)
  - GET /api/admin/dashboard-stats — estadísticas del dashboard
  - GET /api/admin/pedidos — listar pedidos
  - PUT /api/admin/pedidos/:id — cambiar estatus (incluye lógica de confirmación)
  - POST /api/admin/productos — crear producto
  - GET /api/admin/productos — listar productos
  - POST /api/admin/inventario/ajuste — ajustar stock con log
  - GET /api/admin/agentes — listar agentes
  - POST /api/admin/agentes — crear agente
  - GET /api/admin/comisiones — listar comisiones
  - PUT /api/admin/comisiones/:id/pagar — marcar comisión como pagada

(El proyecto contiene más endpoints y variantes; aquí se listan los puntos clave representativos.)

## Estructura conceptual del código
- index.js — punto de entrada del servidor y configuración de middlewares principales.
- db.js — conexión y utilidades de PostgreSQL.
- routes/ — definiciones de rutas por dominio (auth, admin, productos, carrito, direcciones, pedidos).
- controllers/ — implementaciones de la lógica por dominio (authController, adminController, productosController, etc.).
- middlewares/ — middlewares de autenticación y autorización (JWT + authorizeAdmin).
- public/ — páginas estáticas y recursos para el frontend (panel admin y vistas públicas).
- BD V01.sql — script con el esquema inicial y datos de soporte (tablas, índices, etc.).

## Reglas críticas y garantías
- Operaciones críticas (confirmar pedidos, ajustes de inventario) se ejecutan dentro de transacciones atómicas: se revierte todo si alguna parte falla.
- Validaciones de negocio en backend: unicidad (SKU/email/código de agente), stock no negativo, estados válidos y permisos por rol.
- Prevención de condiciones de carrera en la manipulación de stock (control de concurrencia a nivel de BD/restricciones según implementación).

## Seguridad
- Contraseñas hasheadas con bcrypt (configurable rounds).
- JWT para autenticación con tokens separados por rol para evitar confusiones entre sesión cliente y admin.
- Variables sensibles gestionadas fuera del código fuente (por ejemplo: .env).
- CORS configurado según necesidades del frontend.
- Registro de quién realizó cambios relevantes (UserID) en Log_Inventario para auditoría.

## Dashboard y experiencia administrativa
El panel de administración está diseñado para ofrecer:
- Estadísticas en tiempo real (pedidos totales, ingresos, clientes activos, agentes, productos con stock bajo).
- Gestión granular de pedidos con validaciones y modales para cambios de estado.
- Gestión completa del catálogo (creación con cálculo de margen y SKU único).
- Gestión de inventario con logs y motivos de ajuste.
- Gestión de agentes y flujo de pago de comisiones con trazabilidad.

## Estado del proyecto y prioridades
- Estado: Implementación completa de módulos principales (autenticación, catálogo, carrito, pedidos, inventario, agentes y comisiones), con panel administrativo funcional.
- Prioridades sugeridas:
  - Generación de reportes en formatos (PDF/Excel).
  - Integración de notificaciones por email.
  - Dashboard específico para agentes.
  - Tracking de envíos y estados logísticos.
  - Tests unitarios y de integración para las reglas críticas.
  - Preparación para despliegue en entornos productivos.

## Tecnologías y dependencias principales
- Node.js, Express
- PostgreSQL, módulo pg
- bcrypt (hashing de contraseñas)
- jsonwebtoken (gestión de JWT)
- cors, dotenv
- Frontend estático en HTML/CSS/JS para paneles y vistas públicas

## Audiencia objetivo
- Equipos de operaciones y logística de comercios mayoristas.
- Administradores que requieren control de inventario y trazabilidad.
- Agentes comerciales que requieren registro de ventas y cobro de comisiones.

## Licencia y autoría
- Licencia: ISC
- Proyecto desarrollado por Fernando Ramírez

---

Si necesitas que este documento incluya un glosario de entidades (tablas principales) o un diagrama lógico de la base de datos para acompañar la descripción, puedo generarlo como material de referencia.  
