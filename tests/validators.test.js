/**
 * Tests para schemas de validación express-validator
 * Verifica que los schemas rechacen inputs inválidos correctamente
 */

const { validationResult } = require('express-validator');

// Helper para correr validators sin HTTP real
async function runValidators(validators, body = {}, params = {}) {
  const req = { body, params };
  for (const validator of validators) {
    await validator.run(req);
  }
  return validationResult(req);
}

const {
  loginAdminSchema,
  loginAgenteSchema,
  registroClienteSchema,
  crearAgenteSchema,
  crearOrdenCompraSchema,
  recibirInventarioSchema,
  ajusteInventarioSchema,
  abonoSchema,
} = require('../middlewares/validators/schemas');

// ============================================================
describe('loginAdminSchema', () => {
  it('rechaza email vacío', async () => {
    const result = await runValidators(loginAdminSchema, { email: '', password: 'password123' });
    expect(result.isEmpty()).toBe(false);
    expect(result.array().some(e => e.path === 'email')).toBe(true);
  });

  it('rechaza email con formato inválido', async () => {
    const result = await runValidators(loginAdminSchema, { email: 'no-es-email', password: 'password123' });
    expect(result.isEmpty()).toBe(false);
    expect(result.array().some(e => e.path === 'email')).toBe(true);
  });

  it('rechaza password vacío', async () => {
    const result = await runValidators(loginAdminSchema, { email: 'admin@test.com', password: '' });
    expect(result.isEmpty()).toBe(false);
    expect(result.array().some(e => e.path === 'password')).toBe(true);
  });

  it('rechaza password menor a 6 caracteres', async () => {
    const result = await runValidators(loginAdminSchema, { email: 'admin@test.com', password: '123' });
    expect(result.isEmpty()).toBe(false);
  });

  it('aprueba inputs válidos', async () => {
    const result = await runValidators(loginAdminSchema, { email: 'admin@test.com', password: 'password123' });
    expect(result.isEmpty()).toBe(true);
  });

  it('normaliza email (trim y lowercase)', async () => {
    const body = { email: '  Admin@Test.COM  ', password: 'password123' };
    const req = { body };
    for (const validator of loginAdminSchema) {
      await validator.run(req);
    }
    expect(req.body.email).toBe('admin@test.com');
  });
});

// ============================================================
describe('loginAgenteSchema', () => {
  it('rechaza email vacío', async () => {
    const result = await runValidators(loginAgenteSchema, { email: '', password: 'password123' });
    expect(result.isEmpty()).toBe(false);
    expect(result.array().some(e => e.path === 'email')).toBe(true);
  });

  it('rechaza email con formato inválido', async () => {
    const result = await runValidators(loginAgenteSchema, { email: 'invalid', password: 'password123' });
    expect(result.isEmpty()).toBe(false);
  });

  it('aprueba inputs válidos', async () => {
    const result = await runValidators(loginAgenteSchema, { email: 'agente@test.com', password: 'password123' });
    expect(result.isEmpty()).toBe(true);
  });
});

// ============================================================
describe('registroClienteSchema', () => {
  const validCliente = {
    nombre: 'Juan',
    apellido: 'Pérez',
    email: 'cliente@test.com',
    password: 'password123',
  };

  it('aprueba cliente válido', async () => {
    const result = await runValidators(registroClienteSchema, validCliente);
    expect(result.isEmpty()).toBe(true);
  });

  it('rechaza nombre vacío', async () => {
    const result = await runValidators(registroClienteSchema, { ...validCliente, nombre: '' });
    expect(result.isEmpty()).toBe(false);
    expect(result.array().some(e => e.path === 'nombre')).toBe(true);
  });

  it('rechaza nombre con caracteres no permitidos', async () => {
    const result = await runValidators(registroClienteSchema, { ...validCliente, nombre: 'Juan123' });
    expect(result.isEmpty()).toBe(false);
  });

  it('rechaza apellido vacío', async () => {
    const result = await runValidators(registroClienteSchema, { ...validCliente, apellido: '' });
    expect(result.isEmpty()).toBe(false);
  });

  it('rechaza email inválido', async () => {
    const result = await runValidators(registroClienteSchema, { ...validCliente, email: 'not-email' });
    expect(result.isEmpty()).toBe(false);
  });

  it('rechaza password menor a 6 caracteres', async () => {
    const result = await runValidators(registroClienteSchema, { ...validCliente, password: '12345' });
    expect(result.isEmpty()).toBe(false);
  });

  it('aprueba teléfono válido mexicano', async () => {
    const result = await runValidators(registroClienteSchema, { ...validCliente, telefono: '5512345678' });
    expect(result.isEmpty()).toBe(true);
  });

  it('rechaza teléfono con formato inválido', async () => {
    const result = await runValidators(registroClienteSchema, { ...validCliente, telefono: '123' });
    expect(result.isEmpty()).toBe(false);
  });
});

// ============================================================
describe('crearAgenteSchema', () => {
  const validAgente = {
    nombre: 'Juan',
    apellido: 'Pérez',
    email: 'agente@test.com',
    password: 'password123',
  };

  it('aprueba agente válido', async () => {
    const result = await runValidators(crearAgenteSchema, validAgente);
    expect(result.isEmpty()).toBe(true);
  });

  it('rechaza email inválido', async () => {
    const result = await runValidators(crearAgenteSchema, { ...validAgente, email: 'not-email' });
    expect(result.isEmpty()).toBe(false);
  });

  it('rechaza password menor a 8 caracteres', async () => {
    const result = await runValidators(crearAgenteSchema, { ...validAgente, password: '1234567' });
    expect(result.isEmpty()).toBe(false);
  });

  it('rechaza comisión fuera de rango (negativa)', async () => {
    const result = await runValidators(crearAgenteSchema, { ...validAgente, porcentaje_comision: -5 });
    expect(result.isEmpty()).toBe(false);
  });

  it('rechaza comisión fuera de rango (mayor a 100)', async () => {
    const result = await runValidators(crearAgenteSchema, { ...validAgente, porcentaje_comision: 150 });
    expect(result.isEmpty()).toBe(false);
  });

  it('aprueba comisión válida', async () => {
    const result = await runValidators(crearAgenteSchema, { ...validAgente, porcentaje_comision: 10 });
    expect(result.isEmpty()).toBe(true);
  });
});

// ============================================================
describe('crearOrdenCompraSchema', () => {
  const validOrden = {
    proveedorId: 1,
    fechaEntregaEsperada: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0], // 7 días desde hoy
    productos: [{ varianteId: 1, cantidadSolicitada: 10 }],
  };

  it('aprueba orden válida', async () => {
    const result = await runValidators(crearOrdenCompraSchema, validOrden);
    expect(result.isEmpty()).toBe(true);
  });

  it('rechaza sin proveedor', async () => {
    const result = await runValidators(crearOrdenCompraSchema, { ...validOrden, proveedorId: null });
    expect(result.isEmpty()).toBe(false);
  });

  it('rechaza proveedorId negativo', async () => {
    const result = await runValidators(crearOrdenCompraSchema, { ...validOrden, proveedorId: -1 });
    expect(result.isEmpty()).toBe(false);
  });

  it('rechaza fecha en el pasado', async () => {
    const result = await runValidators(crearOrdenCompraSchema, { ...validOrden, fechaEntregaEsperada: '2020-01-01' });
    expect(result.isEmpty()).toBe(false);
  });

  it('rechaza fecha con formato inválido', async () => {
    const result = await runValidators(crearOrdenCompraSchema, { ...validOrden, fechaEntregaEsperada: 'invalid-date' });
    expect(result.isEmpty()).toBe(false);
  });

  it('rechaza array de productos vacío', async () => {
    const result = await runValidators(crearOrdenCompraSchema, { ...validOrden, productos: [] });
    expect(result.isEmpty()).toBe(false);
  });

  it('rechaza productos que no es array', async () => {
    const result = await runValidators(crearOrdenCompraSchema, { ...validOrden, productos: 'not-array' });
    expect(result.isEmpty()).toBe(false);
  });

  it('rechaza producto sin varianteId', async () => {
    const result = await runValidators(crearOrdenCompraSchema, {
      ...validOrden,
      productos: [{ cantidadSolicitada: 10 }],
    });
    expect(result.isEmpty()).toBe(false);
  });

  it('rechaza producto con cantidadSolicitada 0', async () => {
    const result = await runValidators(crearOrdenCompraSchema, {
      ...validOrden,
      productos: [{ varianteId: 1, cantidadSolicitada: 0 }],
    });
    expect(result.isEmpty()).toBe(false);
  });

  it('rechaza producto con cantidadSolicitada negativa', async () => {
    const result = await runValidators(crearOrdenCompraSchema, {
      ...validOrden,
      productos: [{ varianteId: 1, cantidadSolicitada: -5 }],
    });
    expect(result.isEmpty()).toBe(false);
  });

  it('aprueba producto con costoUnitario válido', async () => {
    const result = await runValidators(crearOrdenCompraSchema, {
      ...validOrden,
      productos: [{ varianteId: 1, cantidadSolicitada: 10, costoUnitario: 50.5 }],
    });
    expect(result.isEmpty()).toBe(true);
  });

  it('rechaza producto con costoUnitario negativo', async () => {
    const result = await runValidators(crearOrdenCompraSchema, {
      ...validOrden,
      productos: [{ varianteId: 1, cantidadSolicitada: 10, costoUnitario: -10 }],
    });
    expect(result.isEmpty()).toBe(false);
  });
});

// ============================================================
describe('recibirInventarioSchema', () => {
  const validRecepcion = {
    ordenCompraId: 1,
    productos: [{ detalleId: 1, cantidadRecibidaAhora: 5 }],
  };

  it('aprueba recepción válida', async () => {
    const result = await runValidators(recibirInventarioSchema, validRecepcion);
    expect(result.isEmpty()).toBe(true);
  });

  it('rechaza sin ordenCompraId', async () => {
    const result = await runValidators(recibirInventarioSchema, { productos: validRecepcion.productos });
    expect(result.isEmpty()).toBe(false);
  });

  it('rechaza ordenCompraId negativo', async () => {
    const result = await runValidators(recibirInventarioSchema, { ...validRecepcion, ordenCompraId: -1 });
    expect(result.isEmpty()).toBe(false);
  });

  it('rechaza array de productos vacío', async () => {
    const result = await runValidators(recibirInventarioSchema, { ...validRecepcion, productos: [] });
    expect(result.isEmpty()).toBe(false);
  });

  it('rechaza producto sin detalleId', async () => {
    const result = await runValidators(recibirInventarioSchema, {
      ...validRecepcion,
      productos: [{ cantidadRecibidaAhora: 5 }],
    });
    expect(result.isEmpty()).toBe(false);
  });

  it('rechaza cantidad negativa', async () => {
    const result = await runValidators(recibirInventarioSchema, {
      ...validRecepcion,
      productos: [{ detalleId: 1, cantidadRecibidaAhora: -1 }],
    });
    expect(result.isEmpty()).toBe(false);
  });

  it('aprueba cantidad cero (recepción parcial)', async () => {
    const result = await runValidators(recibirInventarioSchema, {
      ...validRecepcion,
      productos: [{ detalleId: 1, cantidadRecibidaAhora: 0 }],
    });
    expect(result.isEmpty()).toBe(true);
  });
});

// ============================================================
describe('ajusteInventarioSchema', () => {
  const validAjuste = {
    varianteId: 1,
    cantidad: 10,
    tipoMovimiento: 'ENTRADA',
    motivo: 'Ajuste por inventario físico',
  };

  it('aprueba ajuste válido', async () => {
    const result = await runValidators(ajusteInventarioSchema, validAjuste);
    expect(result.isEmpty()).toBe(true);
  });

  it('rechaza sin varianteId', async () => {
    const result = await runValidators(ajusteInventarioSchema, { ...validAjuste, varianteId: null });
    expect(result.isEmpty()).toBe(false);
  });

  it('rechaza varianteId negativo', async () => {
    const result = await runValidators(ajusteInventarioSchema, { ...validAjuste, varianteId: -1 });
    expect(result.isEmpty()).toBe(false);
  });

  it('rechaza tipoMovimiento inválido', async () => {
    const result = await runValidators(ajusteInventarioSchema, { ...validAjuste, tipoMovimiento: 'INVALIDO' });
    expect(result.isEmpty()).toBe(false);
  });

  it('aprueba tipoMovimiento SALIDA', async () => {
    const result = await runValidators(ajusteInventarioSchema, { ...validAjuste, tipoMovimiento: 'SALIDA' });
    expect(result.isEmpty()).toBe(true);
  });

  it('rechaza motivo vacío', async () => {
    const result = await runValidators(ajusteInventarioSchema, { ...validAjuste, motivo: '' });
    expect(result.isEmpty()).toBe(false);
  });

  it('rechaza motivo muy largo', async () => {
    const result = await runValidators(ajusteInventarioSchema, { ...validAjuste, motivo: 'a'.repeat(501) });
    expect(result.isEmpty()).toBe(false);
  });

  it('aprueba motivo de 500 caracteres', async () => {
    const result = await runValidators(ajusteInventarioSchema, { ...validAjuste, motivo: 'a'.repeat(500) });
    expect(result.isEmpty()).toBe(true);
  });
});

// ============================================================
describe('abonoSchema', () => {
  const validAbono = {
    monto: 100.50,
    metodoPago: 'efectivo',
  };

  it('aprueba abono válido', async () => {
    const result = await runValidators(abonoSchema, validAbono);
    expect(result.isEmpty()).toBe(true);
  });

  it('rechaza monto vacío', async () => {
    const result = await runValidators(abonoSchema, { metodoPago: 'efectivo' });
    expect(result.isEmpty()).toBe(false);
  });

  it('rechaza monto cero', async () => {
    const result = await runValidators(abonoSchema, { ...validAbono, monto: 0 });
    expect(result.isEmpty()).toBe(false);
  });

  it('rechaza monto negativo', async () => {
    const result = await runValidators(abonoSchema, { ...validAbono, monto: -50 });
    expect(result.isEmpty()).toBe(false);
  });

  it('aprueba monto mínimo (0.01)', async () => {
    const result = await runValidators(abonoSchema, { ...validAbono, monto: 0.01 });
    expect(result.isEmpty()).toBe(true);
  });

  it('rechaza metodoPago inválido', async () => {
    const result = await runValidators(abonoSchema, { ...validAbono, metodoPago: 'bitcoin' });
    expect(result.isEmpty()).toBe(false);
  });

  it('aprueba metodoPago transferencia', async () => {
    const result = await runValidators(abonoSchema, { ...validAbono, metodoPago: 'transferencia' });
    expect(result.isEmpty()).toBe(true);
  });

  it('aprueba metodoPago cheque', async () => {
    const result = await runValidators(abonoSchema, { ...validAbono, metodoPago: 'cheque' });
    expect(result.isEmpty()).toBe(true);
  });

  it('aprueba metodoPago tarjeta', async () => {
    const result = await runValidators(abonoSchema, { ...validAbono, metodoPago: 'tarjeta' });
    expect(result.isEmpty()).toBe(true);
  });

  it('aprueba sin referencia (opcional)', async () => {
    const result = await runValidators(abonoSchema, validAbono);
    expect(result.isEmpty()).toBe(true);
  });

  it('aprueba con referencia válida', async () => {
    const result = await runValidators(abonoSchema, { ...validAbono, referencia: 'REF-12345' });
    expect(result.isEmpty()).toBe(true);
  });

  it('rechaza referencia muy larga', async () => {
    const result = await runValidators(abonoSchema, { ...validAbono, referencia: 'a'.repeat(256) });
    expect(result.isEmpty()).toBe(false);
  });
});
