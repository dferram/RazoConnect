const {
  normalizarTexto,
  generarPrefijo
} = require('../../../utils/skuGenerator');

describe('skuGenerator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('normalizarTexto', () => {
    it('debe quitar acentos y convertir a mayúsculas', () => {
      expect(normalizarTexto('Camión')).toBe('CAMION');
    });

    it('debe quitar acentos de la letra é', () => {
      expect(normalizarTexto('café')).toBe('CAFE');
    });

    it('debe convertir a mayúsculas texto normal', () => {
      expect(normalizarTexto('playera')).toBe('PLAYERA');
    });
  });

  describe('generarPrefijo', () => {
    it('debe generar prefijo de 3 letras para palabra normal', () => {
      expect(generarPrefijo('Playera')).toBe('PLA');
    });

    it('debe rellenar con X hasta 3 caracteres para palabras cortas', () => {
      expect(generarPrefijo('AB')).toBe('ABX');
    });

    it('debe lanzar Error para texto sin letras', () => {
      expect(() => {
        generarPrefijo('123');
      }).toThrow('El nombre del producto debe contener al menos una letra');
    });

    it('debe manejar texto con acentos correctamente', () => {
      expect(generarPrefijo('Camión')).toBe('CAM');
    });

    it('debe ignorar espacios y caracteres especiales', () => {
      expect(generarPrefijo('123 ABC 456')).toBe('ABC');
    });
  });
});
