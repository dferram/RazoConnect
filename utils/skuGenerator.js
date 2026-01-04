const db = require('../db');

/**
 * Normaliza texto removiendo acentos y caracteres especiales
 * @param {string} texto - Texto a normalizar
 * @returns {string} Texto normalizado
 */
function normalizarTexto(texto) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

/**
 * Genera un prefijo de 3 letras desde el nombre del producto
 * @param {string} nombreProducto - Nombre del producto
 * @returns {string} Prefijo de 3 letras en mayúsculas
 */
function generarPrefijo(nombreProducto) {
  const normalizado = normalizarTexto(nombreProducto);
  const soloLetras = normalizado.replace(/[^A-Z]/g, '');
  
  if (soloLetras.length === 0) {
    throw new Error('El nombre del producto debe contener al menos una letra');
  }
  
  return soloLetras.substring(0, 3).padEnd(3, 'X');
}

/**
 * Extrae el número consecutivo de un SKU
 * @param {string} sku - SKU en formato AAA-000
 * @returns {number} Número consecutivo extraído
 */
function extraerConsecutivo(sku) {
  const partes = sku.split('-');
  if (partes.length !== 2) return 0;
  
  const numero = parseInt(partes[1], 10);
  return isNaN(numero) ? 0 : numero;
}

/**
 * Genera un SKU único basado en el nombre del producto
 * @param {string} nombreProducto - Nombre del producto
 * @returns {Promise<string>} SKU único generado (formato: AAA-000)
 */
async function generarSkuUnico(nombreProducto) {
  try {
    if (!nombreProducto || typeof nombreProducto !== 'string') {
      throw new Error('El nombre del producto es requerido y debe ser un string');
    }

    const prefijo = generarPrefijo(nombreProducto);
    
    const query = `
      SELECT sku_maestro 
      FROM productos 
      WHERE sku_maestro LIKE $1
      ORDER BY sku_maestro DESC
    `;
    
    const result = await db.query(query, [`${prefijo}-%`]);
    
    let nuevoConsecutivo = 1;
    
    if (result.rows.length > 0) {
      const skusExistentes = result.rows.map(row => row.sku_maestro);
      const consecutivos = skusExistentes.map(sku => extraerConsecutivo(sku));
      const maxConsecutivo = Math.max(...consecutivos);
      nuevoConsecutivo = maxConsecutivo + 1;
    }
    
    const consecutivoFormateado = nuevoConsecutivo.toString().padStart(3, '0');
    const skuGenerado = `${prefijo}-${consecutivoFormateado}`;
    
    console.log(`✅ SKU generado: ${skuGenerado} para producto "${nombreProducto}"`);
    
    return skuGenerado;
    
  } catch (error) {
    console.error('❌ Error al generar SKU único:', error.message);
    throw new Error(`Error al generar SKU: ${error.message}`);
  }
}

/**
 * Verifica si un SKU ya existe en la base de datos
 * @param {string} sku - SKU a verificar
 * @returns {Promise<boolean>} true si existe, false si no
 */
async function skuExiste(sku) {
  try {
    const query = 'SELECT COUNT(*) as count FROM productos WHERE sku_maestro = $1';
    const result = await db.query(query, [sku]);
    return parseInt(result.rows[0].count, 10) > 0;
  } catch (error) {
    console.error('❌ Error al verificar existencia de SKU:', error.message);
    throw error;
  }
}

module.exports = {
  generarSkuUnico,
  skuExiste,
  generarPrefijo,
  normalizarTexto
};
