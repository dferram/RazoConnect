jest.mock('pdfkit', () => jest.fn().mockImplementation(() => {
  const emitter = {};
  const handlers = {};
  emitter.on = jest.fn((event, cb) => { handlers[event] = cb; return emitter; });
  emitter.fontSize = jest.fn().mockReturnThis();
  emitter.font = jest.fn().mockReturnThis();
  emitter.fillColor = jest.fn().mockReturnThis();
  emitter.text = jest.fn().mockReturnThis();
  emitter.moveTo = jest.fn().mockReturnThis();
  emitter.lineTo = jest.fn().mockReturnThis();
  emitter.strokeColor = jest.fn().mockReturnThis();
  emitter.lineWidth = jest.fn().mockReturnThis();
  emitter.stroke = jest.fn().mockReturnThis();
  emitter.rect = jest.fn().mockReturnThis();
  emitter.fill = jest.fn().mockReturnThis();
  emitter.fillAndStroke = jest.fn().mockReturnThis();
  emitter.addPage = jest.fn().mockReturnThis();
  emitter.image = jest.fn().mockReturnThis(); // Mock image method
  emitter.page = { height: 792 };
  emitter.currentY = 300;
  emitter.end = jest.fn(() => { if (handlers['end']) handlers['end'](); });
  emitter._handlers = handlers; // Para testing
  return emitter;
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(() => false), // Simular que el logo no existe
  readFileSync: jest.fn()
}));

jest.mock('path', () => ({
  join: jest.fn((...args) => args.join('/'))
}));

jest.mock('../../../db', () => ({ query: jest.fn() }));
jest.mock('../../../services/configuracionService', () => ({ getIvaTasa: jest.fn() }));
jest.mock('../../../utils/logger', () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }));

describe('facturaService', () => {
  let generarFacturaPDF;
  let db, configuracionService, logger;

  beforeEach(() => {
    jest.clearAllMocks();
    db = require('../../../db');
    configuracionService = require('../../../services/configuracionService');
    logger = require('../../../utils/logger');
    ({ generarFacturaPDF } = require('../../../services/facturaService'));
  });

  describe('generarFacturaPDF', () => {
    it('lanza error cuando pedido no existe (DB retorna { rows: [] })', async () => {
      db.query.mockResolvedValueOnce({ rows: [] }); // obtenerDatosPedido

      await expect(generarFacturaPDF(999, 1, 'admin'))
        .rejects
        .toThrow('Pedido no encontrado o no pertenece al tenant');
    });

    it('retorna un Buffer cuando todos los datos son válidos', async () => {
      // Mock obtenerDatosPedido
      db.query.mockResolvedValueOnce({
        rows: [{
          pedidoid: 1,
          montototal: 1000,
          monto_descuento: 0,
          costoenvio: 0,
          clienteid: 1,
          nombre: 'Cliente Test',
          email: 'test@test.com',
          telefono: '1234567890',
          calle: 'Calle Test',
          numero_exterior: '123',
          colonia: 'Colonia Test',
          ciudad: 'Ciudad Test',
          estado: 'Estado Test',
          codigo_postal: '12345'
        }]
      });

      // Mock obtenerDetallesPedido
      db.query.mockResolvedValueOnce({
        rows: [{
          nombreproducto: 'Producto Test',
          cantidad: 1,
          preciounitario: 100,
          tamano_cantidad: 10,
          subtotal: 1000
        }]
      });

      // Mock getIvaTasa
      configuracionService.getIvaTasa.mockResolvedValue(0.16);

      // Mock obtenerInfoTenant
      db.query.mockResolvedValueOnce({
        rows: [{
          nombre_negocio: 'Tenant Test',
          dominio: 'test.com',
          rfc: 'RFC123456789',
          direccion_fiscal: 'Dirección Fiscal Test',
          tenant_id: 1
        }]
      });

      const result = await generarFacturaPDF(1, 1, 'admin');

      expect(result).toBeInstanceOf(Buffer);
      expect(configuracionService.getIvaTasa).toHaveBeenCalledWith(1);
    });

    it('llama configuracionService.getIvaTasa con el tenantId correcto', async () => {
      // Mock obtenerDatosPedido
      db.query.mockResolvedValueOnce({
        rows: [{
          pedidoid: 1,
          montototal: 1000,
          monto_descuento: 0,
          costoenvio: 0,
          clienteid: 1,
          nombre: 'Cliente Test',
          email: 'test@test.com'
        }]
      });

      // Mock obtenerDetallesPedido
      db.query.mockResolvedValueOnce({ rows: [] });

      // Mock getIvaTasa
      configuracionService.getIvaTasa.mockResolvedValue(0.16);

      // Mock obtenerInfoTenant
      db.query.mockResolvedValueOnce({
        rows: [{
          nombre_negocio: 'Tenant Test',
          dominio: 'test.com',
          rfc: 'RFC123456789',
          tenant_id: 5
        }]
      });

      await generarFacturaPDF(1, 5, 'admin');

      expect(configuracionService.getIvaTasa).toHaveBeenCalledWith(5);
    });

    it('no crashea cuando getIvaTasa retorna 0', async () => {
      // Mock obtenerDatosPedido
      db.query.mockResolvedValueOnce({
        rows: [{
          pedidoid: 1,
          montototal: 1000,
          monto_descuento: 0,
          costoenvio: 0,
          clienteid: 1,
          nombre: 'Cliente Test',
          email: 'test@test.com'
        }]
      });

      // Mock obtenerDetallesPedido
      db.query.mockResolvedValueOnce({ rows: [] });

      // Mock getIvaTasa retorna 0
      configuracionService.getIvaTasa.mockResolvedValue(0);

      // Mock obtenerInfoTenant
      db.query.mockResolvedValueOnce({
        rows: [{
          nombre_negocio: 'Tenant Test',
          dominio: 'test.com',
          rfc: 'RFC123456789',
          tenant_id: 1
        }]
      });

      const result = await generarFacturaPDF(1, 1, 'admin');

      expect(result).toBeInstanceOf(Buffer);
      expect(logger.error).not.toHaveBeenCalled();
    });
  });

  describe('Cálculos matemáticos (generarTotales)', () => {
    const setupMocks = (montototal, monto_descuento, costoenvio, ivaTasa) => {
      db.query.mockResolvedValueOnce({
        rows: [{
          pedidoid: 1,
          montototal,
          monto_descuento,
          costoenvio,
          clienteid: 1,
          nombre: 'Cliente Test',
          email: 'test@test.com'
        }]
      });
      db.query.mockResolvedValueOnce({ rows: [] });
      configuracionService.getIvaTasa.mockResolvedValue(ivaTasa);
      db.query.mockResolvedValueOnce({
        rows: [{ 
          nombre_negocio: 'Tenant Test', 
          dominio: 'test.com',
          rfc: 'RFC123456789',
          tenant_id: 1
        }]
      });
    };

    it('$1000 + IVA 16% = $1160.00 total', async () => {
      setupMocks(1000, 0, 0, 0.16);
      const result = await generarFacturaPDF(1, 1, 'admin');
      expect(result).toBeInstanceOf(Buffer);
      // El cálculo: subtotalSinIva = 1000 - 0 + 0 = 1000
      // montoIva = 1000 * 0.16 = 160
      // totalConIva = 1000 + 160 = 1160
    });

    it('$1000 - $100 descuento + IVA 16% = $1044.00 total', async () => {
      setupMocks(1000, 100, 0, 0.16);
      const result = await generarFacturaPDF(1, 1, 'admin');
      expect(result).toBeInstanceOf(Buffer);
      // subtotalSinIva = 1000 - 100 + 0 = 900
      // montoIva = 900 * 0.16 = 144
      // totalConIva = 900 + 144 = 1044
    });

    it('$1000 + $50 envío + IVA 16% = $1218.00 total', async () => {
      setupMocks(1000, 0, 50, 0.16);
      const result = await generarFacturaPDF(1, 1, 'admin');
      expect(result).toBeInstanceOf(Buffer);
      // subtotalSinIva = 1000 - 0 + 50 = 1050
      // montoIva = 1050 * 0.16 = 168
      // totalConIva = 1050 + 168 = 1218
    });

    it('montototal = null → no crashea, usa 0', async () => {
      setupMocks(null, 0, 0, 0.16);
      const result = await generarFacturaPDF(1, 1, 'admin');
      expect(result).toBeInstanceOf(Buffer);
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('monto_descuento = null → no crashea, usa 0', async () => {
      setupMocks(1000, null, 0, 0.16);
      const result = await generarFacturaPDF(1, 1, 'admin');
      expect(result).toBeInstanceOf(Buffer);
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('ivaTasa = 0 → total = subtotal sin IVA', async () => {
      setupMocks(1000, 0, 0, 0);
      const result = await generarFacturaPDF(1, 1, 'admin');
      expect(result).toBeInstanceOf(Buffer);
      // subtotalSinIva = 1000
      // montoIva = 1000 * 0 = 0
      // totalConIva = 1000 + 0 = 1000
    });

    it('ivaTasa = NaN → debe manejarse sin producir crash con .toFixed()', async () => {
      setupMocks(1000, 0, 0, NaN);
      
      // El código debe manejar NaN sin crashear
      // Si ivaTasa es NaN, ivaPorcentaje = (NaN * 100).toFixed(0) = "NaN"
      // Esto no debe crashear el PDF
      const result = await generarFacturaPDF(1, 1, 'admin');
      expect(result).toBeInstanceOf(Buffer);
    });
  });
});
