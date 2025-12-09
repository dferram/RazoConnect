const CarritoService = (() => {
  // Requiere: varianteId (VarianteID), cantidad (Cantidad) y tamanoId (TamanoID)
  // para alinearse con carritoController.agregarAlCarrito.
  async function agregarItem({ varianteId, cantidad = 1, tamanoId } = {}) {
    if (!varianteId || !tamanoId) {
      showToast(
        "Faltan datos para agregar al carrito (variante o presentación).",
        "warning"
      );
      return;
    }

    try {
      // API.agregarAlCarrito ya envía { VarianteID, Cantidad, TamanoID }
      const response = await API.agregarAlCarrito(
        varianteId,
        cantidad,
        tamanoId
      );

      if (!response.ok || response.data?.success === false) {
        throw new Error(
          response.data?.message ||
            "No fue posible agregar el producto al carrito."
        );
      }

      showToast("Producto agregado correctamente.", "success");

      if (typeof window.updateCartBadge === "function") {
        window.updateCartBadge();
      }

      return response.data;
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
