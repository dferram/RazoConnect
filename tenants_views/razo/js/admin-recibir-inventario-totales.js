/**
 * Update session totals with proper formatting
 * Calculates and displays: Total Pieces, Cost Total, Sales Total
 */
function actualizarTotalesSesion() {
  if (!window.sesionRecepcion || !Array.isArray(window.sesionRecepcion) || window.sesionRecepcion.length === 0) {
    // Reset totals if no session data
    const lblTotalPiezas = document.getElementById('lbl-total-piezas');
    const lblTotalSesion = document.getElementById('lbl-total-sesion');
    const lblTotalVenta = document.getElementById('lbl-total-venta');
    
    if (lblTotalPiezas) lblTotalPiezas.textContent = '0 pzas';
    if (lblTotalSesion) lblTotalSesion.textContent = '$0.00';
    if (lblTotalVenta) lblTotalVenta.textContent = '$0.00';
    return;
  }

  let totalPiezas = 0;
  let totalCosto = 0;
  let totalVenta = 0;

  // Calculate totals from session data
  window.sesionRecepcion.forEach(item => {
    const cantidadPiezas = parseInt(item.cantidadPiezas || item.cantidad, 10) || 0;  // ← Compatibilidad con datos antiguos
    const costoUnitario = parseFloat(item.costoUnitario || item.costounitario || 0);
    
    // Get item info for sales price
    const itemInfo = Array.isArray(state.items) ? state.items.find(x => String(x.detalleId) === String(item.detalleId)) : null;
    const precioVenta = itemInfo?.precioofertaunitario || itemInfo?.preciounitario || 0;
    
    totalPiezas += cantidadPiezas;
    totalCosto += cantidadPiezas * costoUnitario;
    totalVenta += cantidadPiezas * precioVenta;
  });

  // Update HTML with formatted values
  const lblTotalPiezas = document.getElementById('lbl-total-piezas');
  const lblTotalSesion = document.getElementById('lbl-total-sesion');
  const lblTotalVenta = document.getElementById('lbl-total-venta');

  if (lblTotalPiezas) {
    lblTotalPiezas.textContent = `${totalPiezas.toLocaleString('es-MX')} pzas`;
  }

  if (lblTotalSesion) {
    lblTotalSesion.textContent = `$${totalCosto.toLocaleString('es-MX', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    })}`;
  }

  if (lblTotalVenta) {
    lblTotalVenta.textContent = `$${totalVenta.toLocaleString('es-MX', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    })}`;
  }
}

// Expose function globally
window.actualizarTotalesSesion = actualizarTotalesSesion;

// Call on page load if session data exists
document.addEventListener('DOMContentLoaded', () => {
  // Wait a bit for other scripts to load
  setTimeout(() => {
    if (window.sesionRecepcion && window.sesionRecepcion.length > 0) {
      actualizarTotalesSesion();
    }
  }, 500);
});
