---
trigger: always_on
---

# DB INTEGRITY RULE: SOURCE OF TRUTH (backup4.sql)

## Contexto
El esquema de la base de datos PostgreSQL está estrictamente definido en el archivo `backup7.sql`. Este archivo es la ÚNICA fuente de verdad para nombres de tablas, columnas, tipos de datos y relaciones.

## Instrucción Mandatoria
Antes de generar, modificar o sugerir cualquier código relacionado con el Backend (Controladores, Modelos, Consultas SQL o Servicios):

1.  **LECTURA OBLIGATORIA:** Debes leer y analizar el contenido de `backup7.sql` para validar el esquema actual.
2.  **VALIDACIÓN DE EXISTENCIA:** No asumas la existencia de tablas o columnas. Si no está en `backup7.sql`, no existe.
3.  **NOMENCLATURA EXACTA:** Usa los nombres de tablas y columnas exactamente como aparecen en el archivo (ej: si es `fechacreacion`, no uses `created_at` ni `fecha_creacion`).
4.  **TIPOS Y CONSTRAINTS:** Respeta los tipos de datos (Integer vs String) y las restricciones (Foreign Keys, NOT NULL, ENUMs) definidos en el dump.

## Manejo de Errores
Si el código solicitado implica una tabla o columna que no encuentras en `backup7.sql`:
- **DETENTE.**
- Informa al usuario que el elemento no existe en la definición actual.
- Propón la migración SQL necesaria para agregarlo antes de escribir el código JS/Node.

