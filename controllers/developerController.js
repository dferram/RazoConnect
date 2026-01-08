const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function loginPage(req, res) {
  if (req.session && req.session.isDeveloper) {
    return res.redirect('/developer/dashboard');
  }
  res.sendFile('developer-login.html', { root: './public' });
}

async function login(req, res) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ 
        error: 'Credenciales incompletas',
        message: 'Username y password son requeridos' 
      });
    }

    const result = await pool.query(
      'SELECT dev_id, username, password_hash FROM developers WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ 
        error: 'Credenciales inválidas',
        message: 'Username o password incorrectos' 
      });
    }

    const developer = result.rows[0];
    const isValidPassword = await bcrypt.compare(password, developer.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ 
        error: 'Credenciales inválidas',
        message: 'Username o password incorrectos' 
      });
    }

    await pool.query(
      'UPDATE developers SET last_login = CURRENT_TIMESTAMP WHERE dev_id = $1',
      [developer.dev_id]
    );

    req.session.isDeveloper = true;
    req.session.developerId = developer.dev_id;
    req.session.developerUsername = developer.username;

    res.json({ 
      success: true,
      message: 'Login exitoso',
      redirect: '/developer/dashboard'
    });

  } catch (error) {
    console.error('Error en developer login:', error);
    res.status(500).json({ 
      error: 'Error del servidor',
      message: 'Error al procesar el login' 
    });
  }
}

async function logout(req, res) {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error al cerrar sesión:', err);
      return res.status(500).json({ error: 'Error al cerrar sesión' });
    }
    res.json({ success: true, redirect: '/developer/login' });
  });
}

async function dashboardPage(req, res) {
  res.sendFile('developer-dashboard.html', { root: './public' });
}

async function getTenants(req, res) {
  try {
    const result = await pool.query(
      'SELECT tenant_id, nombre_cliente, dominio, is_active, created_at FROM tenants ORDER BY created_at DESC'
    );

    res.json({ 
      success: true,
      tenants: result.rows 
    });

  } catch (error) {
    console.error('Error al obtener tenants:', error);
    res.status(500).json({ 
      error: 'Error del servidor',
      message: 'Error al obtener la lista de tenants' 
    });
  }
}

async function toggleTenantStatus(req, res) {
  try {
    const { tenantId } = req.body;

    if (!tenantId) {
      return res.status(400).json({ 
        error: 'Parámetro faltante',
        message: 'Se requiere tenantId' 
      });
    }

    const result = await pool.query(
      'UPDATE tenants SET is_active = NOT is_active WHERE tenant_id = $1 RETURNING tenant_id, nombre_cliente, is_active',
      [tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Tenant no encontrado',
        message: `No existe tenant con ID ${tenantId}` 
      });
    }

    const tenant = result.rows[0];
    const action = tenant.is_active ? 'activado' : 'bloqueado';

    console.log(`🔄 Tenant ${tenant.nombre_cliente} (ID: ${tenant.tenant_id}) ${action} por developer ${req.session.developerUsername}`);

    res.json({ 
      success: true,
      message: `Tenant ${action} exitosamente`,
      tenant: tenant
    });

  } catch (error) {
    console.error('Error al cambiar estado de tenant:', error);
    res.status(500).json({ 
      error: 'Error del servidor',
      message: 'Error al cambiar el estado del tenant' 
    });
  }
}

module.exports = {
  loginPage,
  login,
  logout,
  dashboardPage,
  getTenants,
  toggleTenantStatus
};
