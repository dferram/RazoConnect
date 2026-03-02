/**
 * Tests para la lógica del badge de estatus en remisión PDF
 * Extrae la lógica como función pura para testing
 */

function calcularBadge(pedidoEstatus, stockActual, cantidadRequerida) {
  const hayStockSuficiente = stockActual >= cantidadRequerida;
  const estatusProcesado = ['surtido', 'enviado', 'entregado', 'confirmado'];
  const pedidoProcesado = pedidoEstatus
    ? estatusProcesado.includes(pedidoEstatus.toLowerCase().trim())
    : false;

  if (!hayStockSuficiente) return { color: '#DC2626', text: 'BAJO PEDIDO' };
  if (pedidoProcesado)     return { color: '#F97316', text: 'SURTIDO' };
  return                          { color: '#16A34A', text: 'CON STOCK' };
}

describe('Badge de estatus en remisión PDF', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Tests de la lógica CORRECTA
  it('estatus Surtido + stock suficiente → SURTIDO naranja', () => {
    const result = calcularBadge('Surtido', 100, 50);
    expect(result).toEqual({ color: '#F97316', text: 'SURTIDO' });
  });

  it('estatus surtido (lowercase) + stock suficiente → SURTIDO naranja', () => {
    const result = calcularBadge('surtido', 100, 50);
    expect(result).toEqual({ color: '#F97316', text: 'SURTIDO' });
  });

  it('estatus SURTIDO (uppercase) + stock suficiente → SURTIDO naranja', () => {
    const result = calcularBadge('SURTIDO', 100, 50);
    expect(result).toEqual({ color: '#F97316', text: 'SURTIDO' });
  });

  it('estatus Enviado + stock suficiente → SURTIDO naranja', () => {
    const result = calcularBadge('Enviado', 100, 50);
    expect(result).toEqual({ color: '#F97316', text: 'SURTIDO' });
  });

  it('estatus Entregado + stock suficiente → SURTIDO naranja', () => {
    const result = calcularBadge('Entregado', 100, 50);
    expect(result).toEqual({ color: '#F97316', text: 'SURTIDO' });
  });

  it('estatus confirmado + stock suficiente → SURTIDO naranja', () => {
    const result = calcularBadge('confirmado', 100, 50);
    expect(result).toEqual({ color: '#F97316', text: 'SURTIDO' });
  });

  it('estatus Pendiente + stock suficiente → CON STOCK verde', () => {
    const result = calcularBadge('Pendiente', 100, 50);
    expect(result).toEqual({ color: '#16A34A', text: 'CON STOCK' });
  });

  it('estatus Pendiente + stock insuficiente → BAJO PEDIDO rojo', () => {
    const result = calcularBadge('Pendiente', 30, 50);
    expect(result).toEqual({ color: '#DC2626', text: 'BAJO PEDIDO' });
  });

  it('estatus Surtido + stock insuficiente → BAJO PEDIDO (stock manda sobre estatus)', () => {
    const result = calcularBadge('Surtido', 30, 50);
    expect(result).toEqual({ color: '#DC2626', text: 'BAJO PEDIDO' });
  });

  it('estatus undefined + stock suficiente → CON STOCK (no crashea)', () => {
    const result = calcularBadge(undefined, 100, 50);
    expect(result).toEqual({ color: '#16A34A', text: 'CON STOCK' });
  });

  it('estatus null + stock suficiente → CON STOCK (no crashea)', () => {
    const result = calcularBadge(null, 100, 50);
    expect(result).toEqual({ color: '#16A34A', text: 'CON STOCK' });
  });

  it('estatus con espacios "  Surtido  " → SURTIDO (trim funciona)', () => {
    const result = calcularBadge('  Surtido  ', 100, 50);
    expect(result).toEqual({ color: '#F97316', text: 'SURTIDO' });
  });

  // Documenta el bug original
  describe('BUG original — lógica === "confirmado"', () => {
    function calcularBadgeBuggy(pedidoEstatus, stockActual, cantidadRequerida) {
      const hayStockSuficiente = stockActual >= cantidadRequerida;
      const pedidoConfirmado = pedidoEstatus && pedidoEstatus.toLowerCase() === 'confirmado';
      if (!hayStockSuficiente) return { color: '#DC2626', text: 'BAJO PEDIDO' };
      if (pedidoConfirmado)    return { color: '#F97316', text: 'SURTIDO' };
      return                          { color: '#16A34A', text: 'CON STOCK' };
    }

    it('BUG: estatus Surtido con lógica vieja → incorrectamente CON STOCK', () => {
      const result = calcularBadgeBuggy('Surtido', 100, 50);
      expect(result).toEqual({ color: '#16A34A', text: 'CON STOCK' });
      // Esto está MAL - debería ser SURTIDO naranja
    });

    it('BUG: estatus Enviado con lógica vieja → incorrectamente CON STOCK', () => {
      const result = calcularBadgeBuggy('Enviado', 100, 50);
      expect(result).toEqual({ color: '#16A34A', text: 'CON STOCK' });
      // Esto está MAL - debería ser SURTIDO naranja
    });

    it('Lógica vieja solo reconoce "confirmado" correctamente', () => {
      const result = calcularBadgeBuggy('confirmado', 100, 50);
      expect(result).toEqual({ color: '#F97316', text: 'SURTIDO' });
      // Este es el ÚNICO caso que funcionaba correctamente
    });
  });
});
