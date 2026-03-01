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
});
