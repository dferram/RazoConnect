/**
 * URL Helper - Generación de URLs basadas en el dominio del tenant
 * Asegura que todas las URLs generadas usen el dominio correcto del tenant
 */

function getDomainFromRequest(req) {
  if (!req || !req.tenant) {
    return process.env.FRONTEND_BASE_URL || 'http://localhost:3000';
  }

  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  const domain = req.tenant.dominio || 'localhost:3000';
  
  return `${protocol}://${domain}`;
}

function generateAbsoluteUrl(req, path) {
  const baseDomain = getDomainFromRequest(req);
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  
  return `${baseDomain}${cleanPath}`;
}

function generateProductUrl(req, productId, variantId) {
  return generateAbsoluteUrl(req, `/producto-detalle.html?id=${productId}&variante=${variantId}`);
}

function generateOrderUrl(req, orderId) {
  return generateAbsoluteUrl(req, `/cliente-pedido-detalle.html?id=${orderId}`);
}

function generateResetPasswordUrl(req, token) {
  return generateAbsoluteUrl(req, `/reset-password.html?token=${token}`);
}

function generateImageUrl(req, cloudinaryUrl) {
  if (!cloudinaryUrl) return null;
  
  if (cloudinaryUrl.startsWith('http://') || cloudinaryUrl.startsWith('https://')) {
    return cloudinaryUrl;
  }
  
  return generateAbsoluteUrl(req, cloudinaryUrl);
}

function getTenantDomain(tenant) {
  if (!tenant || !tenant.dominio) {
    return 'localhost:3000';
  }
  
  return tenant.dominio;
}

module.exports = {
  getDomainFromRequest,
  generateAbsoluteUrl,
  generateProductUrl,
  generateOrderUrl,
  generateResetPasswordUrl,
  generateImageUrl,
  getTenantDomain
};
