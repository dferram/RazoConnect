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
    // Si no hay array de variantes pero sí conteos del backend, usar esos datos
    if ((!Array.isArray(variantes) || variantes.length === 0) && totalVariantes > 0) {
      const numColores = parseInt(coloresUnicos, 10) || 0;
      const numMedidas = parseInt(medidasUnicas, 10) || 0;

      // Generar resumen basado en conteos reales del backend
      if (numColores > 0 && numMedidas > 0) {
        return `${numColores} ${numColores === 1 ? 'Color' : 'Colores'} | ${numMedidas} ${numMedidas === 1 ? 'Medida' : 'Medidas'}`;
      } else if (numColores > 0) {
        return `${numColores} ${numColores === 1 ? 'Color disponible' : 'Colores disponibles'}`;
      } else if (numMedidas > 0) {
        return `${numMedidas} ${numMedidas === 1 ? 'Medida disponible' : 'Medidas disponibles'}`;
      }

      // Fallback: Si no hay conteos específicos pero hay totalVariantes,
      // asumir que hay colores y medidas disponibles
      if (totalVariantes === 1) {
        return 'Opción disponible';
      }
      return 'Colores y Medidas disponibles';
    }
    
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

    // Extraer valores únicos de colores y medidas
    const coloresUnicos = new Set();
    const medidasUnicas = new Set();

    variantes.forEach(variante => {
      const color = extraerColor(variante);
      const medida = extraerMedida(variante);

      if (color) {
        coloresUnicos.add(color);
      }
      if (medida) {
        medidasUnicas.add(medida);
      }
    });

    const numColores = coloresUnicos.size;
    const numMedidas = medidasUnicas.size;

    // Generar resumen según lo que tengamos
    if (numColores > 0 && numMedidas > 0) {
      return `${numColores} ${numColores === 1 ? 'Color' : 'Colores'} | ${numMedidas} ${numMedidas === 1 ? 'Medida' : 'Medidas'}`;
    } else if (numColores > 0) {
      return `${numColores} ${numColores === 1 ? 'Color disponible' : 'Colores disponibles'}`;
    } else if (numMedidas > 0) {
      return `${numMedidas} ${numMedidas === 1 ? 'Medida disponible' : 'Medidas disponibles'}`;
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
