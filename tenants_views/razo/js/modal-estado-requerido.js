/**
 * 🔒 MODAL REQUERIDO DE ESTADO
 * Script global que se ejecuta en TODAS las páginas del cliente
 * Si el cliente NO tiene estado asignado, muestra un modal forzoso
 * que SOLO se puede cerrar seleccionando un estado
 */

async function inicializarModalEstadoRequerido() {
  const userData = getUserData() || {};

  // Si ya tiene estado, no hacer nada
  if (userData.estadoId) {
    console.log(`✅ Cliente tiene estado: ${userData.estadoNombre}`);
    return;
  }

  console.warn(`⚠️ Cliente SIN estado asignado - Mostrando modal forzoso`);

  // Crear el modal dinámicamente
  const modal = document.createElement('div');
  modal.id = 'modalEstadoRequeridoGlobal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.7);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  modal.innerHTML = `
    <div style="background: white; border-radius: 1rem; padding: 2rem; max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.3); display: flex; flex-direction: column;">
      <h2 style="color: #F97316; margin-bottom: 1rem; font-size: 1.5rem;">🗺️ Selecciona tu Estado/Región</h2>
      <p style="color: #666; margin-bottom: 1.5rem; line-height: 1.6;">
        Para continuar usando RazoConnect, debes asignar el estado donde te encuentras.
        Esto determina qué productos disponibles verás en tu catálogo.
      </p>

      <form id="formSeleccionarEstadoGlobal" style="flex: 1; display: flex; flex-direction: column;">
        <div style="margin-bottom: 1.5rem;">
          <label for="selectEstadoGlobal" style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #333;">
            Estado/Región:
          </label>
          <select id="selectEstadoGlobal" required style="
            width: 100%;
            padding: 0.75rem;
            border: 2px solid #E5E7EB;
            border-radius: 0.5rem;
            font-size: 1rem;
            background: white;
            color: #333;
          ">
            <option value="">-- Selecciona tu estado --</option>
          </select>
        </div>

        <button type="submit" id="btnConfirmarEstadoGlobal" style="
          width: 100%;
          padding: 0.75rem;
          background: #F97316;
          color: white;
          border: none;
          border-radius: 0.5rem;
          font-weight: 600;
          cursor: pointer;
          font-size: 1rem;
          transition: opacity 0.3s;
          margin-top: auto;
        " onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
          <span id="btnConfirmarEstadoGlobalText">Confirmar</span>
          <i id="btnConfirmarEstadoGlobalSpinner" class="fas fa-spinner fa-spin" style="display: none; margin-left: 0.5rem;"></i>
        </button>
      </form>

      <!-- ⚠️ SIN BOTÓN DE CERRAR - Es modal forzoso -->
    </div>
  `;

  // Agregar al body
  document.body.appendChild(modal);

  const form = document.getElementById('formSeleccionarEstadoGlobal');
  const select = document.getElementById('selectEstadoGlobal');
  const btn = document.getElementById('btnConfirmarEstadoGlobal');
  const btnText = document.getElementById('btnConfirmarEstadoGlobalText');
  const btnSpinner = document.getElementById('btnConfirmarEstadoGlobalSpinner');

  // Cargar estados
  try {
    const response = await fetch('/api/public/estados-all', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      const estados = data.data || [];

      console.log(`✅ Estados cargados: ${estados.length}`);

      select.innerHTML = '<option value="">-- Selecciona tu estado --</option>';
      estados.forEach(estado => {
        const option = document.createElement('option');
        option.value = estado.estadoid;
        option.textContent = estado.nombre;
        select.appendChild(option);
      });

      if (estados.length === 0) {
        console.warn('⚠️ No hay estados disponibles');
      }
    } else {
      console.error(`❌ Error al cargar estados: ${response.status}`);
    }
  } catch (error) {
    console.error('❌ Error cargando estados:', error);
  }

  // Manejar envío
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const estadoId = select.value;
    if (!estadoId) {
      Swal.fire({
        icon: 'warning',
        title: 'Selecciona un estado',
        text: 'Debes seleccionar tu estado para continuar',
        confirmButtonColor: 'var(--primary-color)'
      });
      return;
    }

    btn.disabled = true;
    btnText.style.display = 'none';
    btnSpinner.style.display = 'inline';

    try {
      const token = localStorage.getItem('razoconnect_token');
      const response = await fetch('/api/cliente/asignar-estado', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          estadoId: parseInt(estadoId, 10)
        })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Estado asignado');

        // Actualizar localStorage
        const userData = getUserData() || {};
        userData.estadoId = parseInt(estadoId, 10);
        userData.estadoNombre = select.options[select.selectedIndex].text;
        localStorage.setItem('razoconnect_user', JSON.stringify(userData));

        // Remover modal
        modal.remove();

        // Mostrar éxito
        Swal.fire({
          icon: 'success',
          title: '¡Estado guardado!',
          text: `Tu estado es: ${userData.estadoNombre}`,
          confirmButtonColor: '#10b981',
          timer: 2000,
          timerProgressBar: true
        }).then(() => {
          location.reload();
        });
      } else {
        throw new Error('Error al asignar estado');
      }
    } catch (error) {
      console.error('❌ Error:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Error al asignar el estado. Intenta nuevamente.',
        confirmButtonColor: '#dc2626'
      });
    } finally {
      btn.disabled = false;
      btnText.style.display = 'inline';
      btnSpinner.style.display = 'none';
    }
  });

  console.log('✅ Modal de estado requerido inicializado');
}

// Ejecutar cuando carga la página (después de que getUserData esté disponible)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', inicializarModalEstadoRequerido);
} else {
  inicializarModalEstadoRequerido();
}
