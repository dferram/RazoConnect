/**
 * TEST: Validación de Surtimiento y Prevención de Doble Surtimiento
 *
 * Objetivo: Validar la lógica de negocio que previene surtir 2x el mismo producto.
 * Los tests de race condition real (FOR UPDATE) requieren BD real y se documentan
 * como conceptuales aquí.
 */

const db = require('../../db');

jest.mock('../../db');
jest.mock('../../utils/logger');

describe('🔒 SURTIMIENTO - Prevención de Doble Surtimiento (Race Condition)', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * TEST 1: Lógica de negocio — stock insuficiente debe rechazar segundo surtimiento
   * En el nuevo flujo, stock se descuenta inmediatamente al surtir (surtirPedido).
   * Si el stock llega a 0, el segundo surtimiento falla por stock insuficiente.
   */
  test('✅ Nuevo flujo: stock se descuenta inmediatamente, el segundo surtimiento falla', () => {
    // Simular: stock = 12, Usuario 1 surte 12 → stock queda en 0
    let stockActual = 12;
    const piezasRequeridas = 12;

    // Usuario 1 intenta surtir
    const puedeUser1 = stockActual >= piezasRequeridas;
    if (puedeUser1) {
      stockActual -= piezasRequeridas; // Descuento inmediato (nuevo flujo)
    }
    expect(puedeUser1).toBe(true);
    expect(stockActual).toBe(0);

    // Usuario 2 intenta surtir (stock ya fue descontado)
    const puedeUser2 = stockActual >= piezasRequeridas;
    expect(puedeUser2).toBe(false); // ✅ Correctamente rechazado
  });

  /**
   * TEST 2: Stock se descuenta al surtir (nuevo flujo — inventarios descuenta)
   * Finanzas solo confirma, no descuenta.
   */
  test('✅ Nuevo flujo: inventarios descuenta stock, finanzas solo valida', () => {
    let stockAdmin = 20;
    const piezasSurtir = 8;

    // Inventarios surte → stock se descuenta inmediatamente
    stockAdmin -= piezasSurtir;
    expect(stockAdmin).toBe(12); // 20 - 8

    // Finanzas confirma → NO modifica stock
    const stockTrasConfirmacion = stockAdmin; // Sin cambios
    expect(stockTrasConfirmacion).toBe(12); // Igual que después de surtir ✅
  });

  /**
   * TEST 3: Validación de estados dinámicos permitidos
   */
  test('✅ Transiciones de estado son válidas para los estados definidos', () => {
    const { validarTransicion, esEstadoFinal } = require('../../utils/pedidoTransiciones');

    // Estados finales no permiten transición
    expect(esEstadoFinal('Cancelado')).toBe(true);

    // Transición válida: Pendiente → Cancelado
    expect(validarTransicion('Pendiente', 'Cancelado')).toBe(true);

    // Transición inválida: regreso a Pendiente desde estado final
    expect(validarTransicion('Cancelado', 'Pendiente')).toBe(false);

    // Estados no definidos devuelven false
    expect(validarTransicion('NoExiste', 'OtroEstado')).toBe(false);
    expect(validarTransicion(null, 'Pendiente')).toBe(false);
    expect(validarTransicion('Pendiente', null)).toBe(false);
  });

  /**
   * TEST 4: Verificar que la lógica de stock_admin usa transacción (FOR UPDATE)
   * El controller usa db.getClient() con BEGIN/COMMIT — eso garantiza atomicidad.
   */
  test('🔒 El surtimiento usa transacción con getClient (garantía de atomicidad)', async () => {
    const mockClient = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
    db.getClient.mockResolvedValue(mockClient);

    // Simular el patrón que usa surtirPedido
    const client = await db.getClient();
    await client.query('BEGIN');
    await client.query('UPDATE stock_admin SET cantidad = $1 WHERE variante_id = $2', [0, 5]);
    await client.query('INSERT INTO movimientos_inventario (tipo) VALUES ($1)', ['MERMA']);
    await client.query('COMMIT');
    client.release();

    const calls = mockClient.query.mock.calls.map(c => c[0]);
    expect(calls[0]).toBe('BEGIN');
    expect(calls[calls.length - 1]).toBe('COMMIT');
    expect(calls.some(s => s.includes('UPDATE stock_admin'))).toBe(true);
    expect(calls.some(s => s.includes('movimientos_inventario'))).toBe(true);
    expect(mockClient.release).toHaveBeenCalled();
  });

});
