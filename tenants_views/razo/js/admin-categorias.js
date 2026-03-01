/**
 * GESTIÓN DE CATEGORÍAS - ADMIN
 * Maneja la creación, edición, eliminación y visualización de categorías
 */

(function() {
  'use strict';

  let categorias = [];
  let imagenSeleccionada = null;

  // Elementos del DOM
  const categoriaForm = document.getElementById('categoriaForm');
  const nombreInput = document.getElementById('nombre');
  const descripcionInput = document.getElementById('descripcion');
  const imagenInput = document.getElementById('imagenInput');
  const btnSelectImage = document.getElementById('btnSelectImage');
  const btnRemoveImage = document.getElementById('btnRemoveImage');
  const imagePreview = document.getElementById('imagePreview');
  const imagePreviewContainer = document.getElementById('imagePreviewContainer');
  const categoriasTableBody = document.getElementById('categoriasTableBody');
  const loadingState = document.getElementById('loadingState');
  const emptyState = document.getElementById('emptyState');
  const categoriasTable = document.getElementById('categoriasTable');

  // Inicializar
  document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    cargarCategorias();
  });

  function setupEventListeners() {
    // Formulario
    if (categoriaForm) {
      categoriaForm.addEventListener('submit', handleSubmit);
    }

    // Imagen
    if (btnSelectImage) {
      btnSelectImage.addEventListener('click', () => imagenInput?.click());
    }

    if (imagenInput) {
      imagenInput.addEventListener('change', handleImageSelect);
    }

    if (btnRemoveImage) {
      btnRemoveImage.addEventListener('click', removeImage);
    }
  }

  function handleImageSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Validar tamaño (5MB)
    if (file.size > 5 * 1024 * 1024) {
      Swal.fire({
        icon: 'error',
        title: 'Archivo muy grande',
        text: 'La imagen no debe superar 5MB',
      });
      return;
    }

    // Validar tipo
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      Swal.fire({
        icon: 'error',
        title: 'Formato inválido',
        text: 'Solo se permiten imágenes JPG, PNG o WEBP',
      });
      return;
    }

    imagenSeleccionada = file;

    // Mostrar preview
    const reader = new FileReader();
    reader.onload = (e) => {
      imagePreview.src = e.target.result;
      imagePreviewContainer.style.display = 'block';
      btnSelectImage.style.display = 'none';
    };
    reader.readAsDataURL(file);
  }

  function removeImage() {
    imagenSeleccionada = null;
    imagenInput.value = '';
    imagePreview.src = '';
    imagePreviewContainer.style.display = 'none';
    btnSelectImage.style.display = 'block';
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const nombre = nombreInput.value.trim();
    const descripcion = descripcionInput.value.trim();

    if (!nombre) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'El nombre es requerido',
      });
      return;
    }

    try {
      const formData = new FormData();
      formData.append('nombre', nombre);
      formData.append('descripcion', descripcion);
      
      if (imagenSeleccionada) {
        formData.append('imagen', imagenSeleccionada);
      }

      // Para FormData, usar fetch directo con token de AuthManager
      let result;
      const token = typeof window.AuthManager !== 'undefined' 
        ? AuthManager.getAccessToken('admin')
        : localStorage.getItem('razoconnect_admin_token');

      const response = await fetch('/api/admin/categorias', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await response.json();
      result = { ok: response.ok, data };

      if (result.ok && result.data.success) {
        Swal.fire({
          icon: 'success',
          title: 'Categoría creada',
          text: 'La categoría se ha creado exitosamente',
          timer: 2000,
        });

        categoriaForm.reset();
        removeImage();
        cargarCategorias();
      } else {
        throw new Error(result.data.message || 'Error al crear categoría');
      }
    } catch (error) {
      console.error('Error:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.message || 'Error al crear la categoría',
      });
    }
  }

  async function cargarCategorias() {
    try {
      if (loadingState) loadingState.style.display = 'flex';
      if (categoriasTable) categoriasTable.style.display = 'none';
      if (emptyState) emptyState.style.display = 'none';

      let result;
      
      // Usar AuthManager.apiCall si está disponible
      if (typeof window.AuthManager !== 'undefined' && typeof AuthManager.apiCall === 'function') {
        result = await AuthManager.apiCall('/admin/categorias', {
          method: 'GET',
        });
      } else {
        // Fallback a fetch directo
        const response = await fetch('/api/admin/categorias', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('razoconnect_admin_token')}`,
          },
        });
        const data = await response.json();
        result = { ok: response.ok, data };
      }

      if (loadingState) loadingState.style.display = 'none';

      if (result.ok && result.data.success) {
        // Backend retorna: { success: true, data: { categorias: [...] } }
        categorias = result.data.data?.categorias || [];
        console.log(`✅ [admin-categorias] Cargadas ${categorias.length} categorías`);
        renderCategorias();
      } else {
        throw new Error(result.data.message || 'Error al cargar categorías');
      }
    } catch (error) {
      console.error('Error cargando categorías:', error);
      if (loadingState) loadingState.style.display = 'none';
      if (emptyState) {
        emptyState.style.display = 'flex';
        const emptyText = emptyState.querySelector('.empty-state-text');
        if (emptyText) {
          emptyText.textContent = 'Error al cargar las categorías. Por favor, intenta nuevamente.';
        }
      }
    }
  }

  function renderCategorias() {
    if (!categoriasTableBody) return;

    categoriasTableBody.innerHTML = '';

    if (categorias.length === 0) {
      if (categoriasTable) categoriasTable.style.display = 'none';
      if (emptyState) emptyState.style.display = 'flex';
      return;
    }

    if (categoriasTable) categoriasTable.style.display = 'table';
    if (emptyState) emptyState.style.display = 'none';

    categorias.forEach(categoria => {
      const tr = document.createElement('tr');
      
      tr.innerHTML = `
        <td>${categoria.nombre || ''}</td>
        <td>${categoria.descripcion || '-'}</td>
        <td>
          ${categoria.imagenUrl 
            ? `<img src="${categoria.imagenUrl}" alt="${categoria.nombre}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px;">` 
            : '-'}
        </td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="window.editarCategoria(${categoria.categoriaId})">
            <i class="bi bi-pencil"></i> Editar
          </button>
          <button class="btn btn-sm btn-danger" onclick="window.eliminarCategoria(${categoria.categoriaId})">
            <i class="bi bi-trash"></i> Eliminar
          </button>
        </td>
      `;

      categoriasTableBody.appendChild(tr);
    });
  }

  // Exportar funciones globales
  window.editarCategoria = async (id) => {
    const categoria = categorias.find(c => c.categoriaId === id);
    if (!categoria) return;

    const { value: formValues } = await Swal.fire({
      title: 'Editar Categoría',
      html: `
        <input id="swal-nombre" class="swal2-input" placeholder="Nombre" value="${categoria.nombre || ''}">
        <textarea id="swal-descripcion" class="swal2-textarea" placeholder="Descripción">${categoria.descripcion || ''}</textarea>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      preConfirm: () => {
        return {
          nombre: document.getElementById('swal-nombre').value,
          descripcion: document.getElementById('swal-descripcion').value,
        };
      },
    });

    if (formValues) {
      try {
        let result;
        
        if (typeof window.AuthManager !== 'undefined' && typeof AuthManager.apiCall === 'function') {
          result = await AuthManager.apiCall(`/admin/categorias/${id}`, {
            method: 'PUT',
            body: formValues,
          });
        } else {
          const response = await fetch(`/api/admin/categorias/${id}`, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('razoconnect_admin_token')}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(formValues),
          });
          const data = await response.json();
          result = { ok: response.ok, data };
        }

        if (result.ok && result.data.success) {
          Swal.fire({
            icon: 'success',
            title: 'Categoría actualizada',
            timer: 2000,
          });
          cargarCategorias();
        } else {
          throw new Error(result.data.message || 'Error al actualizar');
        }
      } catch (error) {
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: error.message,
        });
      }
    }
  };

  window.eliminarCategoria = async (id) => {
    const result = await Swal.fire({
      title: '¿Eliminar categoría?',
      text: 'Esta acción no se puede deshacer',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    });

    if (result.isConfirmed) {
      try {
        let apiResult;
        
        if (typeof window.AuthManager !== 'undefined' && typeof AuthManager.apiCall === 'function') {
          apiResult = await AuthManager.apiCall(`/admin/categorias/${id}`, {
            method: 'DELETE',
          });
        } else {
          const response = await fetch(`/api/admin/categorias/${id}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('razoconnect_admin_token')}`,
            },
          });
          const data = await response.json();
          apiResult = { ok: response.ok, data };
        }

        if (apiResult.ok && apiResult.data.success) {
          Swal.fire({
            icon: 'success',
            title: 'Categoría eliminada',
            timer: 2000,
          });
          cargarCategorias();
        } else {
          throw new Error(apiResult.data.message || 'Error al eliminar');
        }
      } catch (error) {
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: error.message,
        });
      }
    }
  };
})();
