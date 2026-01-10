/**
 * Form Data Binding Helper
 * Soluciona problemas de sincronización entre valores de BD y controles de formulario
 * Normaliza valores para evitar problemas de case-sensitivity y espacios
 */

(function() {
  'use strict';

  /**
   * Normaliza un string para comparación (trim + lowercase)
   * @param {string} value - Valor a normalizar
   * @returns {string} Valor normalizado
   */
  function normalizeValue(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim().toLowerCase();
  }

  /**
   * Establece el valor de un select, intentando múltiples estrategias
   * @param {HTMLSelectElement} selectElement - Elemento select
   * @param {string|number} targetValue - Valor a establecer
   * @param {Object} options - Opciones adicionales
   * @returns {boolean} True si se estableció correctamente
   */
  function setSelectValue(selectElement, targetValue, options = {}) {
    if (!selectElement) {
      console.warn('[FormBinding] Select element no encontrado');
      return false;
    }

    if (!targetValue) {
      selectElement.value = '';
      return true;
    }

    const normalizedTarget = normalizeValue(targetValue);
    
    // Estrategia 1: Intentar asignación directa
    try {
      selectElement.value = String(targetValue);
      if (selectElement.value === String(targetValue)) {
        console.log('[FormBinding] ✓ Valor asignado directamente:', targetValue);
        return true;
      }
    } catch (e) {
      console.warn('[FormBinding] Error en asignación directa:', e);
    }

    // Estrategia 2: Buscar por valor normalizado
    const options_array = Array.from(selectElement.options);
    for (let i = 0; i < options_array.length; i++) {
      const option = options_array[i];
      const normalizedOptionValue = normalizeValue(option.value);
      
      if (normalizedOptionValue === normalizedTarget) {
        selectElement.selectedIndex = i;
        console.log('[FormBinding] ✓ Valor encontrado por normalización:', option.value);
        return true;
      }
    }

    // Estrategia 3: Buscar por texto de la opción
    for (let i = 0; i < options_array.length; i++) {
      const option = options_array[i];
      const normalizedOptionText = normalizeValue(option.textContent);
      
      if (normalizedOptionText === normalizedTarget) {
        selectElement.selectedIndex = i;
        console.log('[FormBinding] ✓ Valor encontrado por texto:', option.textContent);
        return true;
      }
    }

    // Estrategia 4: Buscar por dataset (para selects con reglas)
    if (options.useDataset) {
      for (let i = 0; i < options_array.length; i++) {
        const option = options_array[i];
        const datasetValue = option.dataset[options.datasetKey || 'tipoId'];
        
        if (datasetValue && normalizeValue(datasetValue) === normalizedTarget) {
          selectElement.selectedIndex = i;
          console.log('[FormBinding] ✓ Valor encontrado por dataset:', datasetValue);
          return true;
        }
      }
    }

    console.warn('[FormBinding] ✗ No se pudo establecer valor:', targetValue);
    return false;
  }

  /**
   * Establece el valor de un select con Choices.js
   * @param {HTMLSelectElement} selectElement - Elemento select
   * @param {string|number} targetValue - Valor a establecer
   * @param {Object} options - Opciones adicionales
   * @returns {boolean} True si se estableció correctamente
   */
  function setChoicesValue(selectElement, targetValue, options = {}) {
    if (!selectElement) return false;

    const choicesInstance = selectElement.choicesInstance || selectElement._choices;
    
    if (!choicesInstance) {
      // No tiene Choices.js, usar método estándar
      return setSelectValue(selectElement, targetValue, options);
    }

    if (!targetValue) {
      try {
        choicesInstance.removeActiveItems();
        console.log('[FormBinding] ✓ Choices.js limpiado');
        return true;
      } catch (e) {
        console.warn('[FormBinding] Error limpiando Choices.js:', e);
        return false;
      }
    }

    const normalizedTarget = normalizeValue(targetValue);

    // Estrategia 1: setChoiceByValue directo
    try {
      choicesInstance.setChoiceByValue(String(targetValue));
      console.log('[FormBinding] ✓ Choices.js valor asignado directamente:', targetValue);
      return true;
    } catch (e) {
      console.warn('[FormBinding] Error en setChoiceByValue directo:', e);
    }

    // Estrategia 2: Buscar en choices disponibles
    try {
      const choices = choicesInstance._store?.choices || [];
      
      for (const choice of choices) {
        const normalizedChoiceValue = normalizeValue(choice.value);
        
        if (normalizedChoiceValue === normalizedTarget) {
          choicesInstance.setChoiceByValue(choice.value);
          console.log('[FormBinding] ✓ Choices.js valor encontrado por normalización:', choice.value);
          return true;
        }
      }

      // Buscar por label
      for (const choice of choices) {
        const normalizedChoiceLabel = normalizeValue(choice.label);
        
        if (normalizedChoiceLabel === normalizedTarget) {
          choicesInstance.setChoiceByValue(choice.value);
          console.log('[FormBinding] ✓ Choices.js valor encontrado por label:', choice.label);
          return true;
        }
      }
    } catch (e) {
      console.warn('[FormBinding] Error buscando en choices:', e);
    }

    // Estrategia 3: Fallback a método nativo
    console.warn('[FormBinding] Choices.js falló, intentando método nativo');
    return setSelectValue(selectElement, targetValue, options);
  }

  /**
   * Establece el valor de un radio button group
   * @param {string} radioName - Nombre del grupo de radio buttons
   * @param {string|number} targetValue - Valor a establecer
   * @returns {boolean} True si se estableció correctamente
   */
  function setRadioValue(radioName, targetValue) {
    if (!radioName || !targetValue) return false;

    const normalizedTarget = normalizeValue(targetValue);
    const radios = document.querySelectorAll(`input[type="radio"][name="${radioName}"]`);
    
    for (const radio of radios) {
      const normalizedRadioValue = normalizeValue(radio.value);
      
      if (normalizedRadioValue === normalizedTarget) {
        radio.checked = true;
        console.log('[FormBinding] ✓ Radio button seleccionado:', radio.value);
        return true;
      }
    }

    console.warn('[FormBinding] ✗ No se encontró radio button para:', targetValue);
    return false;
  }

  /**
   * Establece el valor de un checkbox
   * @param {HTMLInputElement} checkboxElement - Elemento checkbox
   * @param {boolean|string|number} targetValue - Valor a establecer
   * @returns {boolean} True si se estableció correctamente
   */
  function setCheckboxValue(checkboxElement, targetValue) {
    if (!checkboxElement) return false;

    // Normalizar a booleano
    let boolValue = false;
    if (typeof targetValue === 'boolean') {
      boolValue = targetValue;
    } else if (typeof targetValue === 'string') {
      const normalized = normalizeValue(targetValue);
      boolValue = normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'si';
    } else if (typeof targetValue === 'number') {
      boolValue = targetValue === 1;
    }

    checkboxElement.checked = boolValue;
    console.log('[FormBinding] ✓ Checkbox establecido:', boolValue);
    return true;
  }

  // Exponer API global
  window.FormDataBinding = {
    normalizeValue,
    setSelectValue,
    setChoicesValue,
    setRadioValue,
    setCheckboxValue
  };

  console.log('[FormBinding] ✓ Helper cargado correctamente');
})();
