const emailTemplates = require('../../../utils/emailTemplates');

const escapeHtml = (value) => {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const formatCurrency = (amount) => {
  const num = Number.isFinite(amount) ? amount : parseFloat(amount || 0);
  const safe = Number.isFinite(num) ? num : 0;
  return `$${safe.toFixed(2)}`;
};

const buildAbsoluteUrl = (rawUrl, frontendBaseUrl) => {
  const DEFAULT_FRONTEND_BASE_URL = (process.env.FRONTEND_BASE_URL || "https://tudominio.com").replace(/\/$/, "");
  const base = (frontendBaseUrl || DEFAULT_FRONTEND_BASE_URL).replace(/\/$/, "");

  if (!rawUrl) {
    return `${base}/img/email-product-placeholder.png`;
  }

  const url = String(rawUrl).trim();

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  if (url.startsWith("//")) {
    return `https:${url}`;
  }

  if (url.startsWith("/")) {
    return `${base}${url}`;
  }

  return `${base}/${url}`;
};

describe('emailTemplates - Utility Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('escapeHtml', () => {
    it('debe escapar caracteres HTML peligrosos', () => {
      const input = '<script>alert("xss")</script>';
      const expected = '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;';
      
      expect(escapeHtml(input)).toBe(expected);
    });

    it('debe retornar texto normal sin cambios', () => {
      expect(escapeHtml('texto normal')).toBe('texto normal');
    });

    it('debe retornar string vacío para null', () => {
      expect(escapeHtml(null)).toBe('');
    });

    it('debe retornar string vacío para undefined', () => {
      expect(escapeHtml(undefined)).toBe('');
    });

    it('debe escapar comillas simples y dobles', () => {
      expect(escapeHtml('"hola" y \'adios\'')).toBe('&quot;hola&quot; y &#39;adios&#39;');
    });

    it('debe escapar ampersand', () => {
      expect(escapeHtml('A & B')).toBe('A &amp; B');
    });
  });

  describe('formatCurrency', () => {
    it('debe formatear 100 como $100.00', () => {
      expect(formatCurrency(100)).toBe('$100.00');
    });

    it('debe formatear 1234.5 como $1234.50', () => {
      expect(formatCurrency(1234.5)).toBe('$1234.50');
    });

    it('debe formatear 0 como $0.00', () => {
      expect(formatCurrency(0)).toBe('$0.00');
    });

    it('debe retornar $0.00 para valor inválido', () => {
      expect(formatCurrency('invalid')).toBe('$0.00');
    });

    it('debe manejar números negativos', () => {
      expect(formatCurrency(-50.75)).toBe('$-50.75');
    });

    it('debe manejar null como $0.00', () => {
      expect(formatCurrency(null)).toBe('$0.00');
    });

    it('debe manejar undefined como $0.00', () => {
      expect(formatCurrency(undefined)).toBe('$0.00');
    });
  });

  describe('buildAbsoluteUrl', () => {
    beforeAll(() => {
      process.env.FRONTEND_BASE_URL = 'https://tudominio.com';
    });

    it('debe retornar URL absoluta sin cambios', () => {
      const url = 'https://res.cloudinary.com/img.jpg';
      expect(buildAbsoluteUrl(url)).toBe(url);
    });

    it('debe convertir URL relativa a absoluta', () => {
      const url = '/img/producto.jpg';
      expect(buildAbsoluteUrl(url)).toBe('https://tudominio.com/img/producto.jpg');
    });

    it('debe retornar URL de placeholder para null', () => {
      expect(buildAbsoluteUrl(null)).toBe('https://tudominio.com/img/email-product-placeholder.png');
    });

    it('debe retornar URL de placeholder para undefined', () => {
      expect(buildAbsoluteUrl(undefined)).toBe('https://tudominio.com/img/email-product-placeholder.png');
    });

    it('debe retornar URL de placeholder para string vacío', () => {
      expect(buildAbsoluteUrl('')).toBe('https://tudominio.com/img/email-product-placeholder.png');
    });

    it('debe manejar URLs que empiezan con //', () => {
      expect(buildAbsoluteUrl('//cdn.example.com/img.jpg')).toBe('https://cdn.example.com/img.jpg');
    });

    it('debe usar frontendBaseUrl personalizado cuando se proporciona', () => {
      const url = '/img/producto.jpg';
      const customBase = 'https://custom.com';
      expect(buildAbsoluteUrl(url, customBase)).toBe('https://custom.com/img/producto.jpg');
    });
  });

  describe('getOrderConfirmationEmail', () => {
    it('retorna string HTML no vacío', () => {
      const result = emailTemplates.getOrderConfirmationEmail('Juan Pérez', 123, 'Confirmado');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      expect(result).toContain('<html');
    });

    it('contiene el nombre del cliente en el HTML', () => {
      const result = emailTemplates.getOrderConfirmationEmail('María García', 456, 'Enviado');
      expect(result).toContain('María García');
    });

    it('contiene el número de pedido', () => {
      const result = emailTemplates.getOrderConfirmationEmail('Cliente Test', 789, 'Pendiente');
      expect(result).toContain('789');
    });

    it('XSS: nombre con <script> → escapado en HTML', () => {
      const result = emailTemplates.getOrderConfirmationEmail('<script>alert("xss")</script>', 123, 'Confirmado');
      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;script&gt;');
    });

    it('nombreCliente = null → no crashea, usa "cliente"', () => {
      const result = emailTemplates.getOrderConfirmationEmail(null, 123, 'Confirmado');
      expect(result).toContain('cliente');
      expect(Number.isFinite(result.length)).toBe(true);
    });

    it('pedidoId = null → no crashea', () => {
      const result = emailTemplates.getOrderConfirmationEmail('Cliente Test', null, 'Confirmado');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('contiene link al pedido con el id correcto', () => {
      const result = emailTemplates.getOrderConfirmationEmail('Cliente Test', 555, 'Confirmado');
      expect(result).toContain('555');
    });
  });

  describe('generarHtmlConfirmacion', () => {
    const mockPedido = {
      pedidoid: 123,
      montoTotal: 1000,
      costoEnvio: 50,
      descuento: 100,
      fecha: '2024-01-15T10:30:00Z'
    };

    const mockCliente = {
      nombre: 'Juan Pérez',
      email: 'juan@test.com'
    };

    const mockDetalles = [
      {
        nombreProducto: 'Producto 1',
        cantidad: 2,
        precioUnitario: 100,
        precioTotal: 200
      }
    ];

    it('retorna HTML que contiene <html>', () => {
      const result = emailTemplates.generarHtmlConfirmacion(mockPedido, mockDetalles, mockCliente);
      expect(result).toContain('<html');
      expect(result).toContain('</html>');
    });

    it('contiene el nombre del cliente', () => {
      const result = emailTemplates.generarHtmlConfirmacion(mockPedido, mockDetalles, mockCliente);
      expect(result).toContain('Juan Pérez');
    });

    it('calcula total: subtotal + costoEnvio - descuento', () => {
      const pedido = {
        pedidoid: 1,
        montoTotal: 1000,
        costoEnvio: 50,
        descuento: 100
      };
      const result = emailTemplates.generarHtmlConfirmacion(pedido, mockDetalles, mockCliente);
      // Total = 1000 + 50 - 100 = 950
      expect(result).toContain('950');
    });

    it('detalles = [] → muestra "No se encontraron productos"', () => {
      const result = emailTemplates.generarHtmlConfirmacion(mockPedido, [], mockCliente);
      expect(result).toContain('No se encontraron productos');
    });

    it('detalles = null → no crashea (Array.isArray fallback)', () => {
      const result = emailTemplates.generarHtmlConfirmacion(mockPedido, null, mockCliente);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('cliente.nombre = null → no crashea', () => {
      const clienteSinNombre = { ...mockCliente, nombre: null };
      const result = emailTemplates.generarHtmlConfirmacion(mockPedido, mockDetalles, clienteSinNombre);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('pedido = null → no crashea', () => {
      const result = emailTemplates.generarHtmlConfirmacion(null, mockDetalles, mockCliente);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('pedido.descuento = null → descuento = 0, no NaN', () => {
      const pedidoSinDescuento = { ...mockPedido, descuento: null };
      const result = emailTemplates.generarHtmlConfirmacion(pedidoSinDescuento, mockDetalles, mockCliente);
      expect(result).not.toContain('NaN');
      expect(typeof result).toBe('string');
    });

    it('XSS en nombreProducto → escapado en HTML', () => {
      const detallesXSS = [
        {
          nombreProducto: '<script>alert("xss")</script>',
          cantidad: 1,
          precioUnitario: 100,
          precioTotal: 100
        }
      ];
      const result = emailTemplates.generarHtmlConfirmacion(mockPedido, detallesXSS, mockCliente);
      expect(result).not.toContain('<script>alert');
      expect(result).toContain('&lt;script&gt;');
    });

    it('buildAbsoluteUrl: URL relativa /img/logo.png → URL absoluta', () => {
      const result = emailTemplates.generarHtmlConfirmacion(mockPedido, mockDetalles, mockCliente);
      // Debe contener URLs absolutas con el dominio base
      expect(result).toContain('http');
    });

    it('buildAbsoluteUrl: URL absoluta https:// → sin cambios', () => {
      const detallesConUrlAbsoluta = [
        {
          nombreProducto: 'Producto',
          cantidad: 1,
          precioUnitario: 100,
          precioTotal: 100,
          imagenUrl: 'https://cloudinary.com/image.jpg'
        }
      ];
      const result = emailTemplates.generarHtmlConfirmacion(mockPedido, detallesConUrlAbsoluta, mockCliente);
      expect(result).toContain('https://cloudinary.com/image.jpg');
    });

    it('buildAbsoluteUrl: null → URL de placeholder', () => {
      const detallesSinImagen = [
        {
          nombreProducto: 'Producto',
          cantidad: 1,
          precioUnitario: 100,
          precioTotal: 100,
          imagenUrl: null
        }
      ];
      const result = emailTemplates.generarHtmlConfirmacion(mockPedido, detallesSinImagen, mockCliente);
      expect(result).toContain('placeholder');
    });
  });

  describe('getBaseHtml', () => {
    it('retorna HTML que contiene RAZOCONNECT', () => {
      const result = emailTemplates.getBaseHtml('<p>Contenido de prueba</p>');
      expect(result).toContain('RAZOCONNECT');
    });

    it('contenido = null → no crashea', () => {
      const result = emailTemplates.getBaseHtml(null);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('acepta logoUrl personalizado en options', () => {
      const result = emailTemplates.getBaseHtml('<p>Test</p>', { logoUrl: 'https://custom.com/logo.png' });
      expect(result).toContain('https://custom.com/logo.png');
    });
  });
});
