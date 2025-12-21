(function () {
  "use strict";

  const state = {
    loading: false,
  };

  const elements = {};

  document.addEventListener("DOMContentLoaded", () => {
    cacheElements();
    bindEvents();
    loadDatosBancarios();
  });

  function cacheElements() {
    elements.form = document.getElementById("formDatosAgente");
    elements.btnSubmit = document.getElementById("btnSubmitForm");
    elements.btnGuardarTop = document.getElementById("btnGuardarDatos");
    elements.inputs = {
      banco: document.getElementById("inputBanco"),
      titular: document.getElementById("inputTitular"),
      cuenta: document.getElementById("inputCuenta"),
      clabe: document.getElementById("inputClabe"),
    };
    elements.preview = {
      banco: document.getElementById("previewBanco"),
      titular: document.getElementById("previewTitular"),
      cuenta: document.getElementById("previewCuenta"),
      clabe: document.getElementById("previewClabe"),
    };
    elements.spinner = elements.btnSubmit?.querySelector(".spinner-border");
    elements.submitLabel = elements.btnSubmit?.querySelector(".label-text");
  }

  function bindEvents() {
    if (elements.form) {
      elements.form.addEventListener("submit", handleSubmit);
      elements.form.addEventListener("reset", () => {
        setTimeout(updatePreview, 50);
      });
    }

    const numericInputs = [elements.inputs.cuenta, elements.inputs.clabe];
    numericInputs.forEach((input) => {
      input?.addEventListener("input", (event) => {
        const value = (event.target.value || "").replace(/[^0-9]/g, "");
        event.target.value = value;
        updatePreview();
      });
    });

    Object.values(elements.inputs).forEach((input) => {
      input?.addEventListener("input", updatePreview);
    });

    if (elements.btnGuardarTop && elements.form) {
      elements.btnGuardarTop.addEventListener("click", () => {
        elements.form.requestSubmit();
      });
    }
  }

  async function loadDatosBancarios() {
    try {
      setLoading(true);
      const response = await API.apiCall("/agentes/mis-datos-bancarios", {
        method: "GET",
      });

      if (!response.ok) {
        throw new Error(
          response.data?.message || "No se pudieron obtener tus datos bancarios"
        );
      }

      const info = response.data?.data || response.data?.banco || response.data;
      if (info) {
        elements.inputs.banco.value = info.banco || "";
        elements.inputs.titular.value = info.titular || info.nombre_titular || "";
        elements.inputs.cuenta.value = info.numeroCuenta || info.numero_cuenta || "";
        elements.inputs.clabe.value = info.clabe || "";
      }

      updatePreview();
    } catch (error) {
      console.error("Error cargando datos bancarios del agente:", error);
      Swal.fire({
        icon: "warning",
        title: "Sin datos guardados",
        text:
          error.message ||
          "Aún no tienes datos capturados. Completa el formulario y guarda tus cambios.",
        confirmButtonColor: "#F97316",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (state.loading) return;

    const payload = {
      banco: elements.inputs.banco.value.trim(),
      titular: elements.inputs.titular.value.trim(),
      numeroCuenta: elements.inputs.cuenta.value.trim(),
      clabe: elements.inputs.clabe.value.trim(),
    };

    const errors = validatePayload(payload);
    if (errors.length) {
      Swal.fire({
        icon: "error",
        title: "Revisa tu información",
        html: `<ul style="text-align:left; margin:0; padding-left:1.25rem;">${errors
          .map((err) => `<li>${err}</li>`)
          .join("")}</ul>`,
        confirmButtonColor: "#F97316",
      });
      return;
    }

    try {
      setLoading(true);
      Swal.fire({
        title: "Guardando datos",
        text: "Por favor espera...",
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      const response = await API.apiCall("/agentes/mis-datos-bancarios", {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(
          response.data?.message || "No fue posible guardar la información"
        );
      }

      Swal.fire({
        icon: "success",
        title: "Datos actualizados",
        text: "La cuenta visible para tus clientes ha sido actualizada",
        confirmButtonColor: "#22c55e",
      });

      updatePreview();
    } catch (error) {
      console.error("Error guardando datos bancarios del agente:", error);
      Swal.fire({
        icon: "error",
        title: "No se pudo guardar",
        text: error.message || "Intenta nuevamente en unos minutos",
        confirmButtonColor: "#F97316",
      });
    } finally {
      setLoading(false);
    }
  }

  function validatePayload(payload) {
    const errors = [];
    if (!payload.banco) errors.push("El campo Banco es obligatorio");
    if (!payload.titular) errors.push("Captura el nombre del titular");
    if (!payload.numeroCuenta) {
      errors.push("El número de cuenta es obligatorio");
    } else if (!/^[0-9]{6,20}$/.test(payload.numeroCuenta)) {
      errors.push("El número de cuenta debe contener solo dígitos (6-20)");
    }
    if (!payload.clabe) {
      errors.push("La CLABE es obligatoria");
    } else if (!/^[0-9]{18}$/.test(payload.clabe)) {
      errors.push("La CLABE debe contener exactamente 18 dígitos");
    }
    return errors;
  }

  function setLoading(isLoading) {
    state.loading = isLoading;
    if (elements.btnSubmit) {
      elements.btnSubmit.disabled = isLoading;
    }
    if (elements.btnGuardarTop) {
      elements.btnGuardarTop.disabled = isLoading;
    }
    if (elements.spinner) {
      elements.spinner.style.display = isLoading ? "inline-block" : "none";
    }
    if (elements.submitLabel) {
      elements.submitLabel.style.display = isLoading ? "none" : "inline";
    }
  }

  function updatePreview() {
    elements.preview.banco.textContent = elements.inputs.banco.value.trim() || "—";
    elements.preview.titular.textContent =
      elements.inputs.titular.value.trim() || "—";
    elements.preview.cuenta.textContent =
      formatCuenta(elements.inputs.cuenta.value.trim()) || "—";
    elements.preview.clabe.textContent = formatClabe(
      elements.inputs.clabe.value.trim()
    );
  }

  function formatCuenta(value) {
    if (!value) return "";
    return value.replace(/(\d{4})(?=\d)/g, "$1 ");
  }

  function formatClabe(value) {
    if (!value) return "—";
    return value.replace(/(\d{4})(?=\d)/g, "$1 ");
  }
})();
