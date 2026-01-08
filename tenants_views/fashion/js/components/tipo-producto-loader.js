/**
 * Maneja la lógica de carga y selección de tipos de producto
 * considerando las reglas específicas de empaque del proveedor
 */
(function() {
  "use strict";

  let __tiposProductoCache = [];
  let __reglasEmpaqueCache = {};
  
  async function cargarTiposProducto(proveedorId = null) {
    const select = document.getElementById("inputTipoProducto");
    if (!select) return;

    try {
      // Si no hay proveedor seleccionado, mostrar mensaje inicial
      if (!proveedorId) {
        select.innerHTML = '<option value="">Primero selecciona un proveedor</option>';
        return;
      }

      // 1. Cargar tipos genéricos para obtener nombres
      const response = await fetch(`${API_BASE_URL}/public/tipos-producto`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const tipos = data?.data?.tipos || [];
      __tiposProductoCache = tipos;

      // 2. Cargar reglas específicas del proveedor
      const reglasEmpaque = await cargarReglasEmpaque(proveedorId) || [];

      // 3. Verificar si el proveedor tiene reglas configuradas
      const tieneReglas = Array.isArray(reglasEmpaque) && reglasEmpaque.length > 0;

      select.innerHTML = '<option value="">-- Selecciona un tipo --</option>';

      if (!tieneReglas) {
        // No tiene reglas configuradas - mostrar tipos genéricos como fallback
        const optionSinReglas = document.createElement("option");
        optionSinReglas.value = "";
        optionSinReglas.textContent = "No se han configurado reglas para este proveedor";
        optionSinReglas.disabled = true;
        optionSinReglas.style.fontStyle = "italic";
        optionSinReglas.style.color = "#6b7280";
        select.appendChild(optionSinReglas);

        // Fallback: mostrar tipos genéricos
        tipos.forEach((tipo) => {
          const option = document.createElement("option");
          option.value = `gen_${tipo.tipoProductoId}`; // Prefijo para evitar colisiones
          option.textContent = tipo.nombre;
          
          // Dataset para mantener consistencia
          option.dataset.tipoId = tipo.tipoProductoId;
          option.dataset.piezas = 1; // Default para genéricos
          option.dataset.esGenerico = "true";
          
          select.appendChild(option);
        });
      } else {
        // Mostrar ÚNICAMENTE las reglas específicas del proveedor usando reglaid como value
        reglasEmpaque.forEach((regla) => {
          const option = document.createElement("option");
          
          // CRÍTICO: Usar reglaid como value único
          option.value = regla.reglaid;
          option.textContent = regla.nombre_regla;
          
          // Dataset con datos reales para el payload
          option.dataset.tipoId = regla.tipoproductoid;
          option.dataset.piezas = regla.cantidadempaque;
          option.dataset.esGenerico = "false";
          
          select.appendChild(option);
        });
      }

      // Destruir Choices.js anterior si existe
      if (select.choicesInstance) {
        select.choicesInstance.destroy();
        select.choicesInstance = null;
      }

      // Inicializar Choices.js si existe y hay reglas
      if (window.Choices && select && tieneReglas) {
        select.choicesInstance = new Choices(select, {
          searchEnabled: true,
          searchResultLimit: 100,
          shouldSort: false,
          allowHTML: false,
          removeItemButton: true,
          duplicateItemsAllowed: false,
          addItems: false, // No permitir agregar items cuando hay reglas específicas
        });
      }

    } catch (error) {
      console.error("Error cargando tipos de producto:", error);
      if (typeof showToast === "function") {
        showToast("No se pudieron cargar los tipos de producto", "error");
      }
    }
  }

  async function cargarReglasEmpaque(proveedorId) {
    if (!proveedorId) return [];

    // Verificar cache
    if (__reglasEmpaqueCache[proveedorId]) {
      return __reglasEmpaqueCache[proveedorId];
    }

    try {
      const response = await fetch(`${API_BASE_URL}/admin/proveedores/${proveedorId}/reglas`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("razoconnect_admin_token")}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || "Error obteniendo reglas");
      }

      // Nuevo formato: array de objetos con reglaid, tipoproductoid, etc.
      const reglas = Array.isArray(data.data.reglas) ? data.data.reglas : [];
      __reglasEmpaqueCache[proveedorId] = reglas;
      return reglas;

    } catch (error) {
      console.warn("Error cargando reglas de empaque:", error);
      return [];
    }
  }

  /**
   * Función helper para obtener datos del tipo de producto seleccionado desde dataset
   * @returns {Object|null} Objeto con tipoId, piezas y esGenerico, o null si no hay selección
   */
  function obtenerDatosTipoSeleccionado() {
    const selectTipo = document.getElementById("inputTipoProducto");
    if (!selectTipo || !selectTipo.value) return null;

    const selectedOption = selectTipo.options[selectTipo.selectedIndex];
    if (!selectedOption || !selectedOption.dataset) return null;

    return {
      tipoId: selectedOption.dataset.tipoId,
      piezas: parseInt(selectedOption.dataset.piezas, 10),
      esGenerico: selectedOption.dataset.esGenerico === "true",
      reglaid: selectedOption.value // Solo válido si no es genérico
    };
  }

  async function aplicarReglasEmpaque(proveedorId, tipoProductoId) {
    if (!proveedorId) return;

    // Obtener datos desde dataset del option seleccionado
    const datosSeleccion = obtenerDatosTipoSeleccionado();
    if (!datosSeleccion || !datosSeleccion.piezas) return;

    const cantidadInt = datosSeleccion.piezas;
    if (!Number.isInteger(cantidadInt) || cantidadInt <= 1) return;

    // Desmarcar venta individual si existe
    const ventaIndividualCheckbox = document.getElementById("tamano-unidad");
    if (ventaIndividualCheckbox && ventaIndividualCheckbox.checked) {
      ventaIndividualCheckbox.checked = false;
    }

    // Sugerir pack según regla
    if (typeof sugerirPack === "function") {
      sugerirPack(cantidadInt);
      if (typeof showToast === "function") {
        const tipoMensaje = datosSeleccion.esGenerico ? "tipo genérico" : "regla del proveedor";
        showToast(
          `Se aplicó ${tipoMensaje}: ${cantidadInt} piezas por paquete`,
          "info"
        );
      }
    }
  }

  function inicializarEventListeners() {
    const selectProveedor = document.getElementById("proveedor-producto");
    const selectTipo = document.getElementById("inputTipoProducto");
    
    if (!selectProveedor || !selectTipo) return;

    // Cuando cambia el proveedor
    selectProveedor.addEventListener("change", async (e) => {
      const proveedorId = e.target.value;
      // Recargar tipos de producto con las reglas del nuevo proveedor
      await cargarTiposProducto(proveedorId);
      // Si hay un tipo seleccionado, aplicar reglas
      const tipoId = selectTipo.value;
      if (proveedorId && tipoId) {
        await aplicarReglasEmpaque(proveedorId, tipoId);
      }
    });

    // Cuando cambia el tipo de producto
    selectTipo.addEventListener("change", async (e) => {
      const tipoId = e.target.value;
      const proveedorId = selectProveedor.value;
      if (proveedorId && tipoId) {
        await aplicarReglasEmpaque(proveedorId, tipoId);
      }
    });
  }

  // Inicialización cuando el DOM está listo
  document.addEventListener("DOMContentLoaded", () => {
    cargarTiposProducto();
    inicializarEventListeners();
  });

  // Exponer funciones que necesiten ser accedidas externamente
  window.TipoProductoLoader = {
    cargarTiposProducto,
    cargarReglasEmpaque,
    aplicarReglasEmpaque,
    obtenerDatosTipoSeleccionado
  };
})();
