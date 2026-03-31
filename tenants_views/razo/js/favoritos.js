const FavoritosManager = {
  favoritos: new Set(),
  initialized: false,

  getToken() {
    return localStorage.getItem('razoconnect_token');
  },

  getHeaders() {
    const token = this.getToken();
    const headers = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  },

  async init() {
    if (this.initialized) return;
    
    const token = this.getToken();
    if (!token) {
      console.log('[FAVORITOS] No hay token, usuario no autenticado');
      return;
    }
    
    try {
      const response = await fetch('/api/favoritos', {
        headers: this.getHeaders(),
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        this.favoritos = new Set(data.favoritos.map(f => f.varianteId));
        this.initialized = true;
        console.log('[FAVORITOS] Inicializado con', this.favoritos.size, 'favoritos');
      }
    } catch (error) {
      console.error('[FAVORITOS] Error al inicializar:', error);
    }
  },

  async toggleFromCatalog(productoId) {
    const token = this.getToken();
    if (!token) {
      Swal.fire({
        icon: 'info',
        title: 'Inicia sesión',
        text: 'Debes iniciar sesión para agregar productos a favoritos',
        confirmButtonColor: '#F97316',
        confirmButtonText: 'Ir a login'
      }).then((result) => {
        if (result.isConfirmed) {
          window.location.href = '/login.html';
        }
      });
      return { success: false };
    }

    // Abrir modal de selección de medida
    if (typeof window.abrirModalVariantes === 'function') {
      window.abrirModalVariantes(productoId, 'favorito');
      return { success: true, needsVariantSelection: true };
    } else {
      // Fallback: redirigir a producto-detalle
      window.location.href = `/producto-detalle.html?id=${productoId}`;
      return { success: false };
    }
  },

  async toggle(varianteId) {
    const token = this.getToken();
    if (!token) {
      Swal.fire({
        icon: 'info',
        title: 'Inicia sesión',
        text: 'Debes iniciar sesión para agregar productos a favoritos',
        confirmButtonColor: '#F97316',
        confirmButtonText: 'Ir a login'
      }).then((result) => {
        if (result.isConfirmed) {
          window.location.href = '/login.html';
        }
      });
      return { success: false };
    }

    try {
      const response = await fetch('/api/favoritos/toggle', {
        method: 'POST',
        headers: this.getHeaders(),
        credentials: 'include',
        body: JSON.stringify({ varianteId })
      });

      if (!response.ok) {
        if (response.status === 401) {
          Swal.fire({
            icon: 'info',
            title: 'Inicia sesión',
            text: 'Debes iniciar sesión para agregar productos a favoritos',
            confirmButtonColor: '#F97316',
            confirmButtonText: 'Ir a login'
          }).then((result) => {
            if (result.isConfirmed) {
              window.location.href = '/login.html';
            }
          });
          return { success: false };
        }
        throw new Error('Error al actualizar favorito');
      }

      const data = await response.json();

      if (data.action === 'added') {
        this.favoritos.add(varianteId);
        
        Swal.fire({
          icon: 'success',
          title: '¡Agregado a favoritos!',
          text: data.message,
          timer: 2000,
          showConfirmButton: false,
          toast: true,
          position: 'top-end'
        });
      } else {
        this.favoritos.delete(varianteId);
        
        Swal.fire({
          icon: 'info',
          title: 'Eliminado de favoritos',
          text: data.message,
          timer: 2000,
          showConfirmButton: false,
          toast: true,
          position: 'top-end'
        });
      }

      return { success: true, action: data.action, esFavorito: data.esFavorito };

    } catch (error) {
      console.error('[FAVORITOS] Error al toggle:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'No se pudo actualizar el favorito. Intenta de nuevo.',
        confirmButtonColor: '#F97316'
      });
      return { success: false };
    }
  },

  esFavorito(varianteId) {
    return this.favoritos.has(varianteId);
  },

  renderIcon(varianteId, container, productoId = null) {
    if (!container) return;

    const esFav = varianteId ? this.esFavorito(varianteId) : false;
    
    const icon = document.createElement('button');
    icon.className = 'btn-favorito-card';
    if (varianteId) {
      icon.setAttribute('data-variante-id', varianteId);
    }
    if (productoId) {
      icon.setAttribute('data-producto-id', productoId);
    }
    icon.innerHTML = esFav 
      ? '<i class="bi bi-heart-fill"></i>' 
      : '<i class="bi bi-heart"></i>';
    icon.title = esFav ? 'Quitar de favoritos' : 'Agregar a favoritos';

    icon.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Deshabilitar botón temporalmente
      icon.disabled = true;
      icon.style.opacity = '0.6';
      
      let result;
      
      // Si es desde catálogo (tiene productoId pero no varianteId específica)
      if (productoId && !varianteId) {
        result = await this.toggleFromCatalog(productoId);
      } else if (varianteId) {
        // Si es desde producto-detalle (tiene varianteId)
        result = await this.toggle(varianteId);
        
        if (result.success) {
          // Actualizar icono con animación
          const iconElement = icon.querySelector('i');
          iconElement.className = result.esFavorito 
            ? 'bi bi-heart-fill' 
            : 'bi bi-heart';
          icon.title = result.esFavorito ? 'Quitar de favoritos' : 'Agregar a favoritos';
        }
      }
      
      // Rehabilitar botón
      icon.disabled = false;
      icon.style.opacity = '1';
    });

    container.appendChild(icon);
  },

  async updateBadge() {
    const token = this.getToken();
    if (!token) return;

    try {
      const response = await fetch('/api/favoritos/notificaciones/count', {
        headers: this.getHeaders(),
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        const badge = document.getElementById('favoritos-badge');
        
        if (badge) {
          if (data.count > 0) {
            badge.textContent = data.count > 99 ? '99+' : data.count;
            badge.style.display = 'inline-block';
          } else {
            badge.style.display = 'none';
          }
        }
      }
    } catch (error) {
      console.error('[FAVORITOS] Error al actualizar badge:', error);
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  FavoritosManager.init();
  FavoritosManager.updateBadge();
  
  setInterval(() => {
    FavoritosManager.updateBadge();
  }, 30000);
});
