/**
 * variant-summary-utils.js
 * Utilidad para generar resúmenes inteligentes de variantes de productos
 * para mejorar la UX del cliente en el storefront
 */

(function (window) {
  'use strict';

  /**
   * Genera un resumen inteligente de las variantes de un producto
   * @param {Array} variantes - Array de variantes del producto
   * @param {Number} totalVariantes - Número total de variantes (fallback si array vacío)
   * @param {Number} coloresUnicos - Número de colores únicos (del backend)
   * @param {Number} medidasUnicas - Número de medidas únicas (del backend)
   * @returns {string} - Resumen legible para el cliente
   */
  function generarResumenVariantes(variantes, totalVariantes, coloresUnicos, medidasUnicas) {
    // PRIORIDAD 1: Usar conteos del backend (coloresUnicos y medidasUnicas)
    // Estos valores vienen directamente de la base de datos y son más confiables
    const numColores = parseInt(coloresUnicos, 10) || 0;
    const numMedidas = parseInt(medidasUnicas, 10) || 0;
    const numTotal = parseInt(totalVariantes, 10) || 0;

    // Si tenemos conteos del backend, usarlos primero
    if (numColores > 0 || numMedidas > 0) {
      if (numColores > 0 && numMedidas > 0) {
        return `${numColores} ${numColores === 1 ? 'Color' : 'Colores'} | ${numMedidas} ${numMedidas === 1 ? 'Medida' : 'Medidas'}`;
      } else if (numColores > 0) {
        return `${numColores} ${numColores === 1 ? 'Color disponible' : 'Colores disponibles'}`;
      } else if (numMedidas > 0) {
        return `${numMedidas} ${numMedidas === 1 ? 'Medida disponible' : 'Medidas disponibles'}`;
      }
    }

    // PRIORIDAD 2: Si hay totalVariantes pero no conteos específicos
    if (numTotal > 0) {
      if (numTotal === 1) {
        return 'Opción disponible';
      }
      return `${numTotal} opciones disponibles`;
    }
    
    // PRIORIDAD 3: Intentar analizar el array de variantes si está disponible
    if (!Array.isArray(variantes) || variantes.length === 0) {
      return 'Sin opciones disponibles';
    }

    // Si solo hay una variante, mostrar su información específica
    if (variantes.length === 1) {
      const variante = variantes[0];
      const color = extraerColor(variante);
      const medida = extraerMedida(variante);

      if (color && medida) {
        return `${color} • ${medida}`;
      } else if (color) {
        return `Color: ${color}`;
      } else if (medida) {
        return `Medida: ${medida}`;
      }
      return 'Variante única';
    }

    // Extraer valores únicos de colores y medidas del array
    const coloresSet = new Set();
    const medidasSet = new Set();

    variantes.forEach(variante => {
      const color = extraerColor(variante);
      const medida = extraerMedida(variante);

      if (color) {
        coloresSet.add(color);
      }
      if (medida) {
        medidasSet.add(medida);
      }
    });

    const numColoresArray = coloresSet.size;
    const numMedidasArray = medidasSet.size;

    // Generar resumen según lo que tengamos
    if (numColoresArray > 0 && numMedidasArray > 0) {
      return `${numColoresArray} ${numColoresArray === 1 ? 'Color' : 'Colores'} | ${numMedidasArray} ${numMedidasArray === 1 ? 'Medida' : 'Medidas'}`;
    } else if (numColoresArray > 0) {
      return `${numColoresArray} ${numColoresArray === 1 ? 'Color disponible' : 'Colores disponibles'}`;
    } else if (numMedidasArray > 0) {
      return `${numMedidasArray} ${numMedidasArray === 1 ? 'Medida disponible' : 'Medidas disponibles'}`;
    }

    // Fallback: mostrar número de variantes
    return `${variantes.length} opciones disponibles`;
  }

  /**
   * Extrae el nombre del color de una variante
   * @param {Object} variante - Objeto variante
   * @returns {string|null} - Nombre del color o null
   */
  function extraerColor(variante) {
    if (!variante) return null;

    const posiblesClaves = [
      'colorNombre',
      'color_nombre',
      'ColorNombre',
      'Color_Nombre',
      'color',
      'Color'
    ];

    for (const clave of posiblesClaves) {
      const valor = variante[clave];
      if (valor !== null && valor !== undefined && String(valor).trim()) {
        return String(valor).trim();
      }
    }

    return null;
  }

  /**
   * Extrae la medida/dimensión de una variante
   * @param {Object} variante - Objeto variante
   * @returns {string|null} - Medida o null
   */
  function extraerMedida(variante) {
    if (!variante) return null;

    const posiblesClaves = [
      'dimensiones',
      'Dimensiones',
      'dimension',
      'Dimension',
      'medida',
      'Medida',
      'tamano',
      'Tamano',
      'tamaño',
      'Tamaño',
      'tamanoEtiqueta',
      'presentacion',
      'Presentacion'
    ];

    for (const clave of posiblesClaves) {
      const valor = variante[clave];
      if (valor !== null && valor !== undefined && String(valor).trim()) {
        return String(valor).trim();
      }
    }

    return null;
  }

  /**
   * Determina si un producto tiene múltiples colores
   * @param {Array} variantes - Array de variantes
   * @returns {boolean}
   */
  function tieneMultiplesColores(variantes) {
    if (!Array.isArray(variantes) || variantes.length <= 1) {
      return false;
    }

    const colores = new Set();
    variantes.forEach(v => {
      const color = extraerColor(v);
      if (color) colores.add(color);
    });

    return colores.size > 1;
  }

  /**
   * Determina si un producto tiene múltiples medidas
   * @param {Array} variantes - Array de variantes
   * @returns {boolean}
   */
  function tieneMultiplesMedidas(variantes) {
    if (!Array.isArray(variantes) || variantes.length <= 1) {
      return false;
    }

    const medidas = new Set();
    variantes.forEach(v => {
      const medida = extraerMedida(v);
      if (medida) medidas.add(medida);
    });

    return medidas.size > 1;
  }

  /**
   * Genera el label dinámico para el selector de variantes en la página de detalle
   * @param {Array} variantes - Array de variantes
   * @returns {string} - Label apropiado
   */
  function generarLabelSelector(variantes) {
    if (!Array.isArray(variantes) || variantes.length === 0) {
      return 'Selecciona la variante';
    }

    const tieneColores = tieneMultiplesColores(variantes);
    const tieneMedidas = tieneMultiplesMedidas(variantes);

    if (tieneColores && tieneMedidas) {
      return 'Selecciona Color y Medida';
    } else if (tieneColores) {
      return 'Selecciona el Color';
    } else if (tieneMedidas) {
      return 'Selecciona la Medida';
    }

    return 'Selecciona la variante';
  }

  // Exponer funciones al objeto global
  window.VariantSummaryUtils = {
    generarResumenVariantes,
    extraerColor,
    extraerMedida,
    tieneMultiplesColores,
    tieneMultiplesMedidas,
    generarLabelSelector
  };

})(window);
