let categoriesSortable = null;
let brandsSortable = null;
let currentData = { categories: [], brands: [] };
let hasUnsavedChanges = false;
let currentImageMode = 'url';
let editingItemId = null;

document.addEventListener('DOMContentLoaded', () => {
  loadLandingConfig();
  setupImagePreview();
});

async function loadLandingConfig() {
  try {
    const response = await fetch('/api/admin/landing-config', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });

    if (!response.ok) throw new Error('Error al cargar configuración');

    const data = await response.json();
    currentData = data.data;

    renderItems('categories', currentData.categories);
    renderItems('brands', currentData.brands);

    initSortable();
  } catch (error) {
    console.error('Error:', error);
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'No se pudo cargar la configuración de la landing'
    });
  }
}

function renderItems(section, items) {
  const grid = document.getElementById(`${section}Grid`);

  if (!items || items.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <i class="bi bi-inbox"></i>
        <h3>No hay items configurados</h3>
        <p>Agrega tu primer item para comenzar</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = items.map((item, index) => `
    <div class="landing-item-card" data-id="${item.id}">
      <div style="position: relative;">
        <div class="item-order-badge">${index + 1}</div>
        <div class="drag-handle">
          <i class="bi bi-grip-vertical"></i>
        </div>
        <img src="${item.image}" alt="${item.name}" class="item-image" onerror="this.src='https://via.placeholder.com/400x200?text=Sin+Imagen'">
      </div>
      <div class="item-content">
        <div class="item-name">${item.name}</div>
        <div class="item-href"><i class="bi bi-link-45deg"></i> ${item.href}</div>
        ${item.description ? `<p style="color: #6b5d57; font-size: 0.875rem; margin-bottom: 1rem;">${item.description}</p>` : ''}
        <div class="item-actions">
          <button class="btn-edit" onclick="editItem('${section}', ${item.id})">
            <i class="bi bi-pencil"></i> Editar
          </button>
          <button class="btn-delete" onclick="deleteItem('${section}', ${item.id})">
            <i class="bi bi-trash"></i> Eliminar
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

function initSortable() {
  const categoriesGrid = document.getElementById('categoriesGrid');
  const brandsGrid = document.getElementById('brandsGrid');

  if (categoriesSortable) categoriesSortable.destroy();
  if (brandsSortable) brandsSortable.destroy();

  categoriesSortable = Sortable.create(categoriesGrid, {
    animation: 150,
    handle: '.drag-handle',
    ghostClass: 'sortable-ghost',
    dragClass: 'sortable-drag',
    onEnd: () => {
      hasUnsavedChanges = true;
      document.getElementById('saveOrderBtn').classList.add('show');
      updateOrderBadges('categories');
    }
  });

  brandsSortable = Sortable.create(brandsGrid, {
    animation: 150,
    handle: '.drag-handle',
    ghostClass: 'sortable-ghost',
    dragClass: 'sortable-drag',
    onEnd: () => {
      hasUnsavedChanges = true;
      document.getElementById('saveOrderBtn').classList.add('show');
      updateOrderBadges('brands');
    }
  });
}

function updateOrderBadges(section) {
  const grid = document.getElementById(`${section}Grid`);
  const cards = grid.querySelectorAll('.landing-item-card');
  
  cards.forEach((card, index) => {
    const badge = card.querySelector('.item-order-badge');
    if (badge) badge.textContent = index + 1;
  });
}

async function saveOrder() {
  const activeTab = document.querySelector('.nav-link.active').id.replace('-tab', '');
  const grid = document.getElementById(`${activeTab}Grid`);
  const cards = Array.from(grid.querySelectorAll('.landing-item-card'));

  const items = cards.map((card, index) => ({
    id: parseInt(card.dataset.id),
    orden: index
  }));

  try {
    const response = await fetch('/api/admin/landing-config/reorder', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({
        section: activeTab,
        items
      })
    });

    if (!response.ok) throw new Error('Error al guardar orden');

    hasUnsavedChanges = false;
    document.getElementById('saveOrderBtn').classList.remove('show');

    Swal.fire({
      icon: 'success',
      title: '¡Orden guardado!',
      text: 'El orden de los items se ha actualizado correctamente',
      timer: 2000,
      showConfirmButton: false
    });

    await loadLandingConfig();
  } catch (error) {
    console.error('Error:', error);
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'No se pudo guardar el orden'
    });
  }
}

function openAddModal(section) {
  editingItemId = null;
  document.getElementById('modalTitle').textContent = `Agregar ${section === 'categories' ? 'Categoría' : 'Marca'}`;
  document.getElementById('itemSection').value = section;
  document.getElementById('itemForm').reset();
  document.getElementById('itemId').value = '';
  document.getElementById('imagePreview').style.display = 'none';
  
  currentImageMode = 'url';
  document.getElementById('btnUrlOption').classList.add('active');
  document.getElementById('btnUploadOption').classList.remove('active');
  document.getElementById('urlInput').style.display = 'block';
  document.getElementById('uploadInput').style.display = 'none';

  const modal = new bootstrap.Modal(document.getElementById('itemModal'));
  modal.show();
}

function editItem(section, id) {
  const items = currentData[section];
  const item = items.find(i => i.id === id);

  if (!item) return;

  editingItemId = id;
  document.getElementById('modalTitle').textContent = `Editar ${section === 'categories' ? 'Categoría' : 'Marca'}`;
  document.getElementById('itemSection').value = section;
  document.getElementById('itemId').value = id;
  document.getElementById('itemName').value = item.name;
  document.getElementById('itemImageUrl').value = item.image;
  document.getElementById('itemHref').value = item.href;
  document.getElementById('itemDescription').value = item.description || '';

  const preview = document.getElementById('imagePreview');
  preview.src = item.image;
  preview.style.display = 'block';

  const modal = new bootstrap.Modal(document.getElementById('itemModal'));
  modal.show();
}

async function saveItem() {
  const form = document.getElementById('itemForm');
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const id = document.getElementById('itemId').value;
  const section = document.getElementById('itemSection').value;
  const name = document.getElementById('itemName').value;
  const href = document.getElementById('itemHref').value;
  const description = document.getElementById('itemDescription').value;

  let image = '';

  if (currentImageMode === 'url') {
    image = document.getElementById('itemImageUrl').value;
    if (!image) {
      Swal.fire({
        icon: 'warning',
        title: 'Imagen requerida',
        text: 'Por favor ingresa una URL de imagen'
      });
      return;
    }
  } else {
    const fileInput = document.getElementById('itemImageFile');
    if (fileInput.files.length > 0) {
      try {
        image = await uploadImageToCloudinary(fileInput.files[0]);
      } catch (error) {
        Swal.fire({
          icon: 'error',
          title: 'Error al subir imagen',
          text: error.message
        });
        return;
      }
    } else if (!id) {
      Swal.fire({
        icon: 'warning',
        title: 'Imagen requerida',
        text: 'Por favor selecciona una imagen'
      });
      return;
    }
  }

  const data = {
    section,
    name,
    image: image || document.getElementById('itemImageUrl').value,
    href,
    description
  };

  try {
    const url = id ? `/api/admin/landing-config/${id}` : '/api/admin/landing-config';
    const method = id ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) throw new Error('Error al guardar item');

    const result = await response.json();

    Swal.fire({
      icon: 'success',
      title: '¡Guardado!',
      text: result.message,
      timer: 2000,
      showConfirmButton: false
    });

    bootstrap.Modal.getInstance(document.getElementById('itemModal')).hide();
    await loadLandingConfig();
  } catch (error) {
    console.error('Error:', error);
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'No se pudo guardar el item'
    });
  }
}

async function deleteItem(section, id) {
  const result = await Swal.fire({
    title: '¿Estás seguro?',
    text: 'Esta acción no se puede deshacer',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#6b5d57',
    confirmButtonText: 'Sí, eliminar',
    cancelButtonText: 'Cancelar'
  });

  if (!result.isConfirmed) return;

  try {
    const response = await fetch(`/api/admin/landing-config/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });

    if (!response.ok) throw new Error('Error al eliminar item');

    Swal.fire({
      icon: 'success',
      title: '¡Eliminado!',
      text: 'El item ha sido eliminado correctamente',
      timer: 2000,
      showConfirmButton: false
    });

    await loadLandingConfig();
  } catch (error) {
    console.error('Error:', error);
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'No se pudo eliminar el item'
    });
  }
}

function toggleImageInput(mode) {
  currentImageMode = mode;

  const btnUrl = document.getElementById('btnUrlOption');
  const btnUpload = document.getElementById('btnUploadOption');
  const urlInput = document.getElementById('urlInput');
  const uploadInput = document.getElementById('uploadInput');

  if (mode === 'url') {
    btnUrl.classList.add('active');
    btnUpload.classList.remove('active');
    urlInput.style.display = 'block';
    uploadInput.style.display = 'none';
  } else {
    btnUrl.classList.remove('active');
    btnUpload.classList.add('active');
    urlInput.style.display = 'none';
    uploadInput.style.display = 'block';
  }
}

function setupImagePreview() {
  const urlInput = document.getElementById('itemImageUrl');
  const fileInput = document.getElementById('itemImageFile');
  const preview = document.getElementById('imagePreview');

  urlInput.addEventListener('input', (e) => {
    const url = e.target.value;
    if (url) {
      preview.src = url;
      preview.style.display = 'block';
    } else {
      preview.style.display = 'none';
    }
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        preview.src = event.target.result;
        preview.style.display = 'block';
      };
      reader.readAsDataURL(file);
    }
  });
}

async function uploadImageToCloudinary(file) {
  try {
    const signatureResponse = await fetch('/api/admin/cloudinary/signature', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({
        folder: 'landing_config',
        upload_preset: 'razoconnect_products'
      })
    });

    if (!signatureResponse.ok) throw new Error('Error al obtener firma de Cloudinary');

    const { signature, timestamp, cloudName, apiKey, folder } = await signatureResponse.json();

    const formData = new FormData();
    formData.append('file', file);
    formData.append('signature', signature);
    formData.append('timestamp', timestamp);
    formData.append('api_key', apiKey);
    formData.append('folder', folder);

    const uploadResponse = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: formData
    });

    if (!uploadResponse.ok) throw new Error('Error al subir imagen a Cloudinary');

    const result = await uploadResponse.json();
    return result.secure_url;
  } catch (error) {
    console.error('Error subiendo imagen:', error);
    throw error;
  }
}

window.addEventListener('beforeunload', (e) => {
  if (hasUnsavedChanges) {
    e.preventDefault();
    e.returnValue = '';
  }
});
