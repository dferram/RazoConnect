const CarritoService = (() => {
  const GUEST_CART_KEY = 'guest_cart';

  // Requiere: varianteId (VarianteID), cantidad (Cantidad) y tamanoId (TamanoID)
  // para alinearse con carritoController.agregarAlCarrito.
  function getCarritoCache() {
    const keys = [
      "razoconnect_carrito",
      "razoconnect_cart",
      "razoconnect_cart_cache",
      "carrito",
    ];

    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return { key, items: parsed };
        }
        if (Array.isArray(parsed?.items)) {
          return { key, items: parsed.items };
        }
      } catch (_) {}
    }

    return { key: "razoconnect_cart_cache", items: [] };
  }

  function setCarritoCache(key, items) {
    try {
      localStorage.setItem(
        key,
        JSON.stringify(Array.isArray(items) ? items : [])
      );
    } catch (_) {}
  }

  function upsertCantidadEnCarrito(varianteId, tamanoId, cantidadAgregar) {
    const parsedVar = Number.parseInt(varianteId, 10);
    const parsedTam = Number.parseInt(tamanoId, 10);
    const parsedQty = Number.parseInt(cantidadAgregar, 10);

    if (
      !Number.isInteger(parsedVar) ||
      !Number.isInteger(parsedTam) ||
      !Number.isInteger(parsedQty) ||
      parsedQty <= 0
    ) {
      return;
    }

    const cache = getCarritoCache();
    const items = Array.isArray(cache.items) ? [...cache.items] : [];

    const idx = items.findIndex((it) => {
      const vId = Number.parseInt(
        it?.varianteId ?? it?.VarianteID ?? it?.varianteid,
        10
      );
      const tId = Number.parseInt(
        it?.tamanoId ?? it?.TamanoID ?? it?.tamanoid,
        10
      );
      return (
        Number.isInteger(vId) &&
        Number.isInteger(tId) &&
        vId === parsedVar &&
        tId === parsedTam
      );
    });

    if (idx >= 0) {
      const currentQty = Number.parseInt(
        items[idx]?.cantidad ?? items[idx]?.Cantidad ?? 0,
        10
      );
      const nextQty = (Number.isInteger(currentQty) ? currentQty : 0) + parsedQty;
      items[idx] = {
        ...items[idx],
        varianteId: parsedVar,
        tamanoId: parsedTam,
        cantidad: nextQty,
      };
    } else {
      items.push({
        varianteId: parsedVar,
        tamanoId: parsedTam,
        cantidad: parsedQty,
      });
    }

    setCarritoCache(cache.key, items);
  }

  function getGuestCart() {
    try {
      const cart = localStorage.getItem(GUEST_CART_KEY);
      return cart ? JSON.parse(cart) : [];
    } catch {
      return [];
    }
  }

  function saveGuestCart(items) {
    try {
      localStorage.setItem(GUEST_CART_KEY, JSON.stringify(items));
    } catch (error) {
      console.error('Error guardando carrito de invitado:', error);
    }
  }

  function addToGuestCart(varianteId, cantidad, tamanoId, productoData = {}) {
    const cart = getGuestCart();
    const existingIndex = cart.findIndex(
      item => item.varianteId === varianteId && item.tamanoId === tamanoId
    );

    if (existingIndex >= 0) {
      cart[existingIndex].cantidad += cantidad;
    } else {
      cart.push({
        varianteId,
        tamanoId,
        cantidad,
        productoData,
        addedAt: new Date().toISOString()
      });
    }

    saveGuestCart(cart);
    return cart;
  }

  async function agregarItem({ varianteId, cantidad = 1, tamanoId, productoData } = {}) {
    if (!varianteId || !tamanoId) {
      showToast(
        "Faltan datos para agregar al carrito (variante o presentación).",
        "warning"
      );
      return;
    }

    // Check if user is authenticated
    const token = typeof getToken === 'function' ? getToken() : localStorage.getItem('razoconnect_token');
    
    if (!token) {
      // Guest mode - save to localStorage
      try {
        addToGuestCart(varianteId, cantidad, tamanoId, productoData);
        showToast("Producto agregado al carrito. Inicia sesión para finalizar tu compra.", "success");
        
        if (typeof window.updateCartBadge === "function") {
          window.updateCartBadge();
        }
        
        return { success: true, guest: true };
      } catch (error) {
        console.error("Error agregando al carrito de invitado:", error);
        showToast("Error al agregar al carrito.", "error");
        throw error;
      }
    }

    // Authenticated mode - use API
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

      upsertCantidadEnCarrito(varianteId, tamanoId, cantidad);

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
    getGuestCart,
    saveGuestCart,
    clearGuestCart: () => localStorage.removeItem(GUEST_CART_KEY)
  };
})();
