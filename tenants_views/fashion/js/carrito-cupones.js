const API_BASE = "/api";
let cuponAplicado = null;

document.addEventListener("DOMContentLoaded", () => {
  const btnAplicarCupon = document.getElementById("btn-aplicar-cupon");
  const cuponInput = document.getElementById("cupon-input");

  if (btnAplicarCupon) {
    btnAplicarCupon.addEventListener("click", aplicarCupon);
  }

  if (cuponInput) {
    cuponInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        aplicarCupon();
      }
    });
  }

  window.obtenerCuponAplicado = () => cuponAplicado;
  window.limpiarCupon = limpiarCupon;
});

async function aplicarCupon() {
  const cuponInput = document.getElementById("cupon-input");
  const btnAplicar = document.getElementById("btn-aplicar-cupon");
  const cuponMensaje = document.getElementById("cupon-mensaje");
  const codigo = cuponInput.value.trim();

  if (!codigo) {
    mostrarMensajeCupon("Por favor ingresa un código de cupón", "error");
    return;
  }

  // CRÍTICO: Usar carritoData.montoTotal como fuente de verdad
  // NO leer del DOM porque puede contener valores ya modificados
  const subtotal = window.getCarritoTotal ? window.getCarritoTotal() : 0;

  if (!subtotal || subtotal <= 0) {
    mostrarMensajeCupon("El carrito está vacío", "error");
    return;
  }

  btnAplicar.disabled = true;
  btnAplicar.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

  try {
    const response = await fetch(`${API_BASE}/cupones/validar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        codigo: codigo,
        subtotal: subtotal,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      mostrarMensajeCupon(data.message || "Cupón inválido", "error");
      btnAplicar.disabled = false;
      btnAplicar.textContent = "Aplicar";
      return;
    }

    cuponAplicado = {
      codigo: data.data.codigo,
      cuponId: data.data.cuponId,
      montoDescuento: data.data.montoDescuento,
      nuevoTotal: data.data.nuevoTotal,
    };

    actualizarResumenConDescuento(data.data);
    mostrarMensajeCupon(
      `✓ Cupón "${data.data.codigo}" aplicado correctamente`,
      "success"
    );

    cuponInput.disabled = true;
    btnAplicar.textContent = "Remover";
    btnAplicar.classList.remove("btn-outline-primary");
    btnAplicar.classList.add("btn-outline-danger");
    btnAplicar.disabled = false;
    btnAplicar.onclick = limpiarCupon;
  } catch (error) {
    console.error("Error al validar cupón:", error);
    mostrarMensajeCupon("Error al validar el cupón. Intenta de nuevo.", "error");
    btnAplicar.disabled = false;
    btnAplicar.textContent = "Aplicar";
  }
}

function actualizarResumenConDescuento(dataCupon) {
  const descuentoDesglose = document.getElementById("descuento-desglose");
  const precioOriginal = document.getElementById("precioOriginal");
  const descuentoPorcentaje = document.getElementById("descuentoPorcentaje");
  const montoAhorrado = document.getElementById("montoAhorrado");
  const summaryTotal = document.getElementById("summaryTotal");

  // Mostrar desglose visual
  if (descuentoDesglose) {
    descuentoDesglose.style.display = "block";
  }

  // Precio original (tachado)
  if (precioOriginal) {
    precioOriginal.textContent = `$${dataCupon.subtotal.toFixed(2)}`;
  }

  // Porcentaje de descuento
  if (descuentoPorcentaje) {
    if (dataCupon.tipoDescuento === "PORCENTAJE") {
      descuentoPorcentaje.textContent = `-${dataCupon.valor}%`;
    } else {
      // Si es descuento fijo, calcular el porcentaje equivalente
      const porcentajeEquivalente = ((dataCupon.montoDescuento / dataCupon.subtotal) * 100).toFixed(1);
      descuentoPorcentaje.textContent = `-${porcentajeEquivalente}% (Descuento fijo)`;
    }
  }

  // Monto ahorrado
  if (montoAhorrado) {
    montoAhorrado.textContent = `-$${dataCupon.montoDescuento.toFixed(2)}`;
  }

  // Total final en ROJO (color de oferta)
  if (summaryTotal) {
    summaryTotal.textContent = `$${dataCupon.nuevoTotal.toFixed(2)}`;
    summaryTotal.style.color = "#dc2626"; // Rojo de oferta
    summaryTotal.style.fontWeight = "700";
  }
}

function limpiarCupon() {
  cuponAplicado = null;

  const cuponInput = document.getElementById("cupon-input");
  const btnAplicar = document.getElementById("btn-aplicar-cupon");
  const descuentoDesglose = document.getElementById("descuento-desglose");
  const cuponMensaje = document.getElementById("cupon-mensaje");
  const summaryTotal = document.getElementById("summaryTotal");

  cuponInput.value = "";
  cuponInput.disabled = false;
  
  // Ocultar desglose de descuento
  if (descuentoDesglose) {
    descuentoDesglose.style.display = "none";
  }
  
  if (cuponMensaje) {
    cuponMensaje.style.display = "none";
  }

  // CRÍTICO: Usar getCarritoTotal() como fuente de verdad
  const subtotalReal = window.getCarritoTotal ? window.getCarritoTotal() : 0;
  
  // Restaurar total a color normal (negro)
  if (summaryTotal) {
    summaryTotal.textContent = `$${subtotalReal.toFixed(2)}`;
    summaryTotal.style.color = "#111827"; // Negro normal
    summaryTotal.style.fontWeight = "700";
  }

  btnAplicar.textContent = "Aplicar";
  btnAplicar.classList.remove("btn-outline-danger");
  btnAplicar.classList.add("btn-outline-primary");
  btnAplicar.onclick = aplicarCupon;
}

function mostrarMensajeCupon(mensaje, tipo) {
  const cuponMensaje = document.getElementById("cupon-mensaje");

  cuponMensaje.style.display = "block";
  cuponMensaje.textContent = mensaje;

  if (tipo === "success") {
    cuponMensaje.style.color = "#059669";
    cuponMensaje.style.fontWeight = "600";
  } else if (tipo === "error") {
    cuponMensaje.style.color = "#dc2626";
    cuponMensaje.style.fontWeight = "500";
  }
}
