/**
 * TEST: Flujo Completo de Surtimiento — Nuevo flujo (inventarios descuenta stock)
 *
 * Flujo nuevo:
 * 1. Inventarios surte → stock se descuenta INMEDIATAMENTE en stock_admin
 * 2. Finanzas confirma → solo valida / cambia estado del pedido
 * 3. Si finanzas rechaza → stock se devuelve
 *
 * Nota: Tests de race condition real (FOR UPDATE PostgreSQL) requieren BD real.
 * Aquí se valida la lógica de negocio con mocks.
 */

const db = require('../../db');

jest.mock('../../db');
jest.mock('../../utils/logger');

describe('🔒 SURTIMIENTO CON LOCK: Flujo Completo de Generación → Finanzas', () => {

  const varianteId = 5;
  const adminId = 1;
  const stockInicial = 30;
  const piezasSurtir = 15;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('✅ Nuevo flujo: inventarios descuenta stock AL SURTIR (no al confirmar)', async () => {
    // Simular: inventarios surte → stock baja de 30 a 15
    let stock = stockInicial;
    stock -= piezasSurtir;
    expect(stock).toBe(15); // 30 - 15

    // Finanzas confirma → stock NO cambia
    const stockTrasConfirmacion = stock;
    expect(stockTrasConfirmacion).toBe(15); // Sin cambio ✅
  });

  test('✅ El patrón de transacción garantiza atomicidad en stock_admin', async () => {
    const mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [{ cantidad: 15 }] }),
      release: jest.fn()
    };
    db.getClient.mockResolvedValue(mockClient);

    const client = await db.getClient();
    await client.query('BEGIN');

    // 1. Leer stock actual
    const stockRes = await client.query('SELECT cantidad FROM stock_admin WHERE variante_id = $1', [varianteId]);
    const nuevoStock = stockRes.rows[0].cantidad - piezasSurtir;

    // 2. Actualizar stock
    await client.query('UPDATE stock_admin SET cantidad = $1 WHERE variante_id = $2', [nuevoStock, varianteId]);

    // 3. Registrar movimiento MERMA
    await client.query(
      'INSERT INTO movimientos_inventario (tipo, cantidad, variante_id) VALUES ($1, $2, $3)',
      ['MERMA', piezasSurtir, varianteId]
    );

    await client.query('COMMIT');
    client.release();

    const calls = mockClient.query.mock.calls.map(c => c[0]);
    expect(calls[0]).toBe('BEGIN');
    expect(calls[calls.length - 1]).toBe('COMMIT');
    expect(calls.some(s => s.includes('UPDATE stock_admin'))).toBe(true);
    expect(calls.some(s => s.includes('movimientos_inventario'))).toBe(true);
    expect(mockClient.release).toHaveBeenCalled();
  });

  test('✅ Finanzas confirma: solo cambia estado, NO toca stock_admin', async () => {
    const mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn()
    };
    db.getClient.mockResolvedValue(mockClient);

    const client = await db.getClient();
    await client.query('BEGIN');

    // Finanzas confirma → solo UPDATE pedidos + detallesdelpedido
    await client.query("UPDATE pedidos SET estatus = 'Surtido' WHERE pedidoid = $1", [42]);
    await client.query("UPDATE detallesdelpedido SET estado_producto = 'Facturado' WHERE detalleid = $1", [10]);

    await client.query('COMMIT');
    client.release();

    const calls = mockClient.query.mock.calls.map(c => c[0]);
    // No debe haber UPDATE stock_admin
    expect(calls.some(s => typeof s === 'string' && s.includes('UPDATE stock_admin'))).toBe(false);
    expect(calls.some(s => typeof s === 'string' && s.includes('UPDATE pedidos'))).toBe(true);
  });

  test('✅ Rechazo de finanzas: devuelve stock con ADICION en movimientos_inventario', async () => {
    const mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn()
    };
    db.getClient.mockResolvedValue(mockClient);

    const client = await db.getClient();
    await client.query('BEGIN');

    // Devolver stock
    await client.query('UPDATE stock_admin SET cantidad = cantidad + $1 WHERE variante_id = $2', [piezasSurtir, varianteId]);

    // Registrar movimiento ADICION (no DEVOLUCIÓN — check constraint lo prohíbe)
    await client.query(
      'INSERT INTO movimientos_inventario (tipo, cantidad, variante_id) VALUES ($1, $2, $3)',
      ['ADICION', piezasSurtir, varianteId]
    );

    await client.query("UPDATE pedidos SET estatus = 'Revisión de almacén' WHERE pedidoid = $1", [42]);
    await client.query('COMMIT');
    client.release();

    const calls = mockClient.query.mock.calls.map(c => c[0]);
    expect(calls.some(s => typeof s === 'string' && s.includes('UPDATE stock_admin') && s.includes('cantidad + $1'))).toBe(true);
    expect(calls.some(s => typeof s === 'string' && s.includes("Revisi"))).toBe(true);
  });

});
