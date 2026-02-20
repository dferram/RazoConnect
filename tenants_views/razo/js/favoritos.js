const FavoritosManager = {
  favoritos: new Set(),
  initialized: false,

  async init() {
    if (this.initialized) return;
    
    try {
      const response = await fetch('/api/favoritos', {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        this.favoritos = new Set(data.favoritos.map(f => f.varianteId));
        this.initialized = true;
        console.log('✅ [FAVORITOS] Inicializado con', this.favoritos.size, 'favoritos');
      }
    } catch (error) {
      console.error('❌ [FAVORITOS] Error al inicializar:', error);
    }
  },

  async toggle(varianteId) {
    try {
      const response = await fetch('/api/favoritos/toggle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
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
      console.error('❌ [FAVORITOS] Error al toggle:', error);
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

  renderIcon(varianteId, container) {
    if (!container) return;

    const esFav = this.esFavorito(varianteId);
    
    const icon = document.createElement('button');
    icon.className = 'btn-favorito';
    icon.setAttribute('data-variante-id', varianteId);
    icon.innerHTML = esFav 
      ? '<i class="bi bi-heart-fill"></i>' 
      : '<i class="bi bi-heart"></i>';
    icon.title = esFav ? 'Quitar de favoritos' : 'Agregar a favoritos';

    icon.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const result = await this.toggle(varianteId);
      
      if (result.success) {
        icon.innerHTML = result.esFavorito 
          ? '<i class="bi bi-heart-fill"></i>' 
          : '<i class="bi bi-heart"></i>';
        icon.title = result.esFavorito ? 'Quitar de favoritos' : 'Agregar a favoritos';
      }
    });

    container.appendChild(icon);
  },

  async updateBadge() {
    try {
      const response = await fetch('/api/favoritos/notificaciones/count', {
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
      console.error('❌ [FAVORITOS] Error al actualizar badge:', error);
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
