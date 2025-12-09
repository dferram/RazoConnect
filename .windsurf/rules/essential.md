---
trigger: always_on
---

# Reglas de Negocio Críticas (NO ROMPER)
1. Gestión de SKUs: NUNCA concatenar sufijos automáticos como "-UNIT", "-IND" o similares al SKU. El SKU debe guardarse y mostrarse exactamente como lo ingresa el usuario.
2. Nombres de Variantes: NUNCA usar "Unidad individual" como nombre de dimensión física. Si es venta unitaria, usar la medida real (ej. "10x10").
3. Packs: La lógica de venta se basa en "Packs Disponibles" (Whitelist) configurados por producto, no en prohibiciones complejas.