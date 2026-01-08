function obtenerNombrePack(cantidad) {
  cantidad = parseInt(cantidad);

  // Caso especial para 1 (no queremos "Serie de 1")
  if (cantidad === 1) return "Pieza Individual";

  // Menos de 12 piezas -> Serie
  if (Number.isFinite(cantidad) && cantidad > 1 && cantidad < 12) {
    return `Serie de ${cantidad}`;
  }

  // 12 piezas o más -> Paquete
  return `Paquete de ${cantidad}`;
}
