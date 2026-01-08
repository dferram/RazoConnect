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

  const subtotalElement = document.getElementById("summarySubtotal");
  const subtotalText = subtotalElement.textContent.replace(/[$,]/g, "");
  const subtotal = parseFloat(subtotalText);

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
  const descuentoRow = document.getElementById("descuento-row");
  const summaryDescuento = document.getElementById("summaryDescuento");
  const summaryTotal = document.getElementById("summaryTotal");

  descuentoRow.style.display = "flex";
  summaryDescuento.textContent = `-$${dataCupon.montoDescuento.toFixed(2)}`;
  summaryTotal.textContent = `$${dataCupon.nuevoTotal.toFixed(2)}`;
}

function limpiarCupon() {
  cuponAplicado = null;

  const cuponInput = document.getElementById("cupon-input");
  const btnAplicar = document.getElementById("btn-aplicar-cupon");
  const descuentoRow = document.getElementById("descuento-row");
  const cuponMensaje = document.getElementById("cupon-mensaje");
  const summarySubtotal = document.getElementById("summarySubtotal");
  const summaryTotal = document.getElementById("summaryTotal");

  cuponInput.value = "";
  cuponInput.disabled = false;
  descuentoRow.style.display = "none";
  cuponMensaje.style.display = "none";

  const subtotalText = summarySubtotal.textContent;
  summaryTotal.textContent = subtotalText;

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
