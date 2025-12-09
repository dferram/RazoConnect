const CarritoService = (() => {
  const endpoint = "/carrito/agregar";

  async function agregarItem({
    productoId,
    varianteId,
    cantidad = 1,
  } = {}) {
    if (!productoId || !varianteId) {
      showToast("Faltan datos para agregar al carrito.", "warning");
      return;
    }

    try {
      const token = getEffectiveToken?.();
      if (!token) {
        requireAuth?.();
        throw new Error("Debes iniciar sesión para agregar productos.");
      }

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          productoId,
          varianteId,
          cantidad,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.success === false) {
        throw new Error(
          data?.message || "No fue posible agregar el producto al carrito."
        );
      }

      showToast("Producto agregado correctamente.", "success");

      if (typeof window.updateCartBadge === "function") {
        window.updateCartBadge();
      }

      return data;
    } catch (error) {
      console.error("Error agregando al carrito:", error);
      showToast(error.message || "Error al agregar al carrito.", "error");
      throw error;
    }
  }

  return {
    agregarItem,
  };
})();
