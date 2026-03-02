const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const db = require('../db');
const { getDomainForCookie } = require('../config/domainMapper');

const isProduction = process.env.NODE_ENV === 'production';

function createDynamicSessionMiddleware() {
  const baseSessionConfig = {
    store: new pgSession({
      pool: db.pool,
      tableName: 'session',
      createTableIfMissing: false,
      pruneSessionInterval: 60 * 15,
      errorLog: console.error.bind(console)
    }),
    secret: process.env.SESSION_SECRET || 'razoconnect-dev-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    name: 'xcore.sid',
    proxy: true,
    cookie: {
      secure: isProduction,
      httpOnly: true,
      sameSite: isProduction ? 'lax' : 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  };

  const sessionMiddleware = session(baseSessionConfig);

  return (req, res, next) => {
    const hostname = req.hostname;
    const cookieDomain = getDomainForCookie(hostname);
    
    // Solo configurar domain si getDomainForCookie retorna un valor válido
    // Si es undefined (IPs internas de Azure), no establecer domain
    if (cookieDomain) {
      req.sessionOptions = {
        ...baseSessionConfig,
        cookie: {
          ...baseSessionConfig.cookie,
          domain: cookieDomain
        }
      };
      
      console.log(`🍪 Cookie domain configurado: ${cookieDomain} (hostname: ${hostname})`);
    } else {
      console.log(`🍪 Cookie domain no establecido para hostname: ${hostname}`);
    }

    sessionMiddleware(req, res, next);
  };
}

module.exports = createDynamicSessionMiddleware;
