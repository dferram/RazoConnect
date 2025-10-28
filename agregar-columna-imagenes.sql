-- Script OPCIONAL para agregar soporte de imágenes a los productos
-- Solo ejecuta esto si quieres almacenar URLs de imágenes reales en el futuro

-- 1. Agregar columna ImagenURL a la tabla Productos
ALTER TABLE Productos
ADD COLUMN IF NOT EXISTS ImagenURL VARCHAR(500);

-- 2. Actualizar productos existentes con imágenes de ejemplo (opcional)
-- Descomenta las siguientes líneas si quieres agregar URLs de ejemplo

/*
UPDATE Productos SET ImagenURL = 'https://images.unsplash.com/photo-1485968579580-b6d095142e6e?w=400' WHERE SKU = 'CAJA-BLUSA-001';
UPDATE Productos SET ImagenURL = 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=400' WHERE SKU = 'CAJA-VESTIDO-001';
UPDATE Productos SET ImagenURL = 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=400' WHERE SKU = 'CAJA-CAMISA-H001';
UPDATE Productos SET ImagenURL = 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400' WHERE SKU = 'CAJA-PLAYERA-001';
UPDATE Productos SET ImagenURL = 'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=400' WHERE SKU = 'CAJA-BOLSA-001';
UPDATE Productos SET ImagenURL = 'https://images.unsplash.com/photo-1624222247344-550fb60583bb?w=400' WHERE SKU = 'CAJA-CINTURON-001';
UPDATE Productos SET ImagenURL = 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400' WHERE SKU = 'CAJA-TENIS-001';
UPDATE Productos SET ImagenURL = 'https://images.unsplash.com/photo-1603487742131-4160ec999306?w=400' WHERE SKU = 'CAJA-SANDALIAS-001';
UPDATE Productos SET ImagenURL = 'https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?w=400' WHERE SKU = 'CAJA-INFANTIL-001';
UPDATE Productos SET ImagenURL = 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=400' WHERE SKU = 'CAJA-JEANS-D001';
UPDATE Productos SET ImagenURL = 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=400' WHERE SKU = 'CAJA-JOYERIA-001';
UPDATE Productos SET ImagenURL = 'https://images.unsplash.com/photo-1591195853828-11db59a44f6b?w=400' WHERE SKU = 'CAJA-SHORTS-001';
UPDATE Productos SET ImagenURL = 'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=400' WHERE SKU = 'CAJA-PANTALON-H001';
UPDATE Productos SET ImagenURL = 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=400' WHERE SKU = 'CAJA-SUDADERA-001';
UPDATE Productos SET ImagenURL = 'https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=400' WHERE SKU = 'CAJA-LENTES-001';
*/

-- 3. Verificar que se agregó la columna
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'productos' 
AND column_name = 'imagenurl';

-- Instrucciones para usar:
-- 1. Ejecuta este script en pgAdmin o psql
-- 2. Descomenta las líneas UPDATE si quieres agregar URLs de imágenes
-- 3. Modifica el frontend (catalogo.html) para usar producto.imagenUrl
