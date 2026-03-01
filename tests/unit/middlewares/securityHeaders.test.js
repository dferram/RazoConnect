/**
 * Tests unitarios para middlewares/securityHeaders.js
 * Verifica configuración de cabeceras de seguridad HTTP según OWASP
 */

const { securityHeaders } = require('../../../middlewares/securityHeaders');

describe('securityHeaders middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = { headers: {} };
    res = {
      setHeader: jest.fn(),
      getHeader: jest.fn(),
      removeHeader: jest.fn()
    };
    next = jest.fn();
  });

  it('debe llamar next()', () => {
    securityHeaders(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('debe establecer X-Content-Type-Options: nosniff', () => {
    securityHeaders(req, res, next);
    expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
  });

  it('debe establecer X-Frame-Options', () => {
    securityHeaders(req, res, next);
    expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', expect.any(String));
  });

  it('debe establecer X-Frame-Options: SAMEORIGIN', () => {
    securityHeaders(req, res, next);
    expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'SAMEORIGIN');
  });

  it('debe establecer Content-Security-Policy', () => {
    securityHeaders(req, res, next);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Security-Policy',
      expect.stringContaining("default-src")
    );
  });

  it('debe establecer X-XSS-Protection', () => {
    securityHeaders(req, res, next);
    expect(res.setHeader).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
  });

  it('debe establecer Referrer-Policy', () => {
    securityHeaders(req, res, next);
    expect(res.setHeader).toHaveBeenCalledWith('Referrer-Policy', 'strict-origin-when-cross-origin');
  });

  it('debe establecer Permissions-Policy', () => {
    securityHeaders(req, res, next);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Permissions-Policy',
      expect.stringContaining('geolocation')
    );
  });

  it('debe remover X-Powered-By header', () => {
    securityHeaders(req, res, next);
    expect(res.removeHeader).toHaveBeenCalledWith('X-Powered-By');
  });

  it('debe establecer X-DNS-Prefetch-Control', () => {
    securityHeaders(req, res, next);
    expect(res.setHeader).toHaveBeenCalledWith('X-DNS-Prefetch-Control', 'off');
  });

  it('debe establecer X-Download-Options', () => {
    securityHeaders(req, res, next);
    expect(res.setHeader).toHaveBeenCalledWith('X-Download-Options', 'noopen');
  });

  it('debe establecer X-Permitted-Cross-Domain-Policies', () => {
    securityHeaders(req, res, next);
    expect(res.setHeader).toHaveBeenCalledWith('X-Permitted-Cross-Domain-Policies', 'none');
  });

  it('NO debe establecer HSTS en entorno de test (no producción)', () => {
    process.env.NODE_ENV = 'test';
    securityHeaders(req, res, next);
    const hstsCalled = res.setHeader.mock.calls.some(
      ([header]) => header === 'Strict-Transport-Security'
    );
    expect(hstsCalled).toBe(false);
  });

  it('debe establecer HSTS en producción', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    
    securityHeaders(req, res, next);
    
    expect(res.setHeader).toHaveBeenCalledWith(
      'Strict-Transport-Security',
      expect.stringContaining('max-age=31536000')
    );
    
    process.env.NODE_ENV = originalEnv;
  });

  it('CSP debe incluir directivas críticas', () => {
    securityHeaders(req, res, next);
    
    const cspCall = res.setHeader.mock.calls.find(
      ([header]) => header === 'Content-Security-Policy'
    );
    
    expect(cspCall).toBeDefined();
    const cspValue = cspCall[1];
    
    expect(cspValue).toContain("default-src 'self'");
    expect(cspValue).toContain("object-src 'none'");
    expect(cspValue).toContain("base-uri 'self'");
  });

  it('Permissions-Policy debe deshabilitar APIs no necesarias', () => {
    securityHeaders(req, res, next);
    
    const permissionsCall = res.setHeader.mock.calls.find(
      ([header]) => header === 'Permissions-Policy'
    );
    
    expect(permissionsCall).toBeDefined();
    const permissionsValue = permissionsCall[1];
    
    expect(permissionsValue).toContain('geolocation=()');
    expect(permissionsValue).toContain('microphone=()');
    expect(permissionsValue).toContain('camera=()');
  });
});
