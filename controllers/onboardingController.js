const db = require('../db');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');

async function crearTenant(req, res) {
  const client = await db.pool.connect();
  
  try {
    const {
      nombre_cliente,
      dominio,
      admin_nombre,
      admin_apellido,
      admin_email,
      admin_password,
      plan = 'basic'
    } = req.body;

    const camposFaltantes = [];
    if (!nombre_cliente?.trim()) camposFaltantes.push('nombre_cliente');
    if (!dominio?.trim()) camposFaltantes.push('dominio');
    if (!admin_nombre?.trim()) camposFaltantes.push('admin_nombre');
    if (!admin_apellido?.trim()) camposFaltantes.push('admin_apellido');
    if (!admin_email?.trim()) camposFaltantes.push('admin_email');
    if (!admin_password || admin_password.length < 8) camposFaltantes.push('admin_password (mínimo 8 caracteres)');

    if (camposFaltantes.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Campos requeridos faltantes o inválidos: ${camposFaltantes.join(', ')}` 
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(admin_email.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Formato de email inválido'
      });
    }

    const dominioLimpio = dominio.trim().toLowerCase();
    if (!/^[a-z0-9.-]+$/.test(dominioLimpio)) {
      return res.status(400).json({
        success: false,
        message: 'El dominio solo puede contener letras minúsculas, números, puntos y guiones'
      });
    }

    await client.query('BEGIN');

    const dominioCheck = await client.query(
      'SELECT tenant_id FROM tenants WHERE dominio = $1',
      [dominioLimpio]
    );
    if (dominioCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: `El dominio "${dominioLimpio}" ya está registrado` 
      });
    }

    const emailCheck = await client.query(
      'SELECT adminid FROM administradores WHERE email = $1',
      [admin_email.trim().toLowerCase()]
    );
    if (emailCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: `El email "${admin_email}" ya está registrado en el sistema` 
      });
    }

    const tenantResult = await client.query(
      `INSERT INTO tenants (nombre_cliente, dominio, is_active, created_at)
       VALUES ($1, $2, TRUE, CURRENT_TIMESTAMP)
       RETURNING tenant_id, nombre_cliente, dominio, is_active, created_at`,
      [nombre_cliente.trim(), dominioLimpio]
    );
    const tenant = tenantResult.rows[0];
    const tenantId = tenant.tenant_id;

    const bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS) || 10;
    const passwordHash = await bcrypt.hash(admin_password, bcryptRounds);

    const adminResult = await client.query(
      `INSERT INTO administradores 
         (nombre, apellido, email, passwordhash, rol, activo, tenant_id)
       VALUES ($1, $2, $3, $4, 'super_admin', TRUE, $5)
       RETURNING adminid, nombre, apellido, email, rol`,
      [
        admin_nombre.trim(),
        admin_apellido.trim(),
        admin_email.trim().toLowerCase(),
        passwordHash,
        tenantId
      ]
    );
    const admin = adminResult.rows[0];

    const landingDefaultSections = [
      { section: 'hero', key: 'title', value: nombre_cliente.trim() },
      { section: 'hero', key: 'subtitle', value: 'Bienvenido a nuestra tienda' },
      { section: 'general', key: 'primary_color', value: '#F97316' },
      { section: 'general', key: 'store_name', value: nombre_cliente.trim() },
    ];

    for (const item of landingDefaultSections) {
      await client.query(
        `INSERT INTO landing_page_config (section, key, value_published, tenant_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (section, key, tenant_id) DO NOTHING`,
        [item.section, item.key, item.value, tenantId]
      );
    }

    await client.query('COMMIT');

    logger.info('Nuevo tenant creado exitosamente', {
      tenantId,
      dominio: dominioLimpio,
      nombreCliente: nombre_cliente.trim(),
      creadoPor: req.session?.developerUsername || 'developer'
    });

    return res.status(201).json({
      success: true,
      message: `Tenant "${nombre_cliente.trim()}" creado exitosamente`,
      data: {
        tenant: {
          tenantId: tenant.tenant_id,
          nombreCliente: tenant.nombre_cliente,
          dominio: tenant.dominio,
          isActive: tenant.is_active,
          creadoEn: tenant.created_at,
          plan
        },
        adminCreado: {
          adminId: admin.adminid,
          nombre: admin.nombre,
          apellido: admin.apellido,
          email: admin.email,
          rol: admin.rol
        },
        siguientesPasos: [
          `1. Configura el DNS: apunta ${dominioLimpio} a tu servidor`,
          `2. El admin puede hacer login en: https://${dominioLimpio}/admin-login.html`,
          `3. Credenciales temporales enviadas a: ${admin.email}`,
          `4. Recomienda cambiar contraseña en el primer login` 
        ]
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error al crear nuevo tenant', {
      error: error.message,
      creadoPor: req.session?.developerUsername
    });
    return res.status(500).json({
      success: false,
      message: 'Error al crear el tenant. Verifica los logs del servidor.'
    });
  } finally {
    client.release();
  }
}

async function listarTenants(req, res) {
  try {
    const result = await db.query(
      `SELECT 
         t.tenant_id,
         t.nombre_cliente,
         t.dominio,
         t.is_active,
         t.created_at,
         COUNT(DISTINCT a.adminid) AS total_admins,
         COUNT(DISTINCT c.clienteid) AS total_clientes
       FROM tenants t
       LEFT JOIN administradores a ON a.tenant_id = t.tenant_id AND a.activo = TRUE
       LEFT JOIN clientes c ON c.tenant_id = t.tenant_id AND c.activo = TRUE
       GROUP BY t.tenant_id, t.nombre_cliente, t.dominio, t.is_active, t.created_at
       ORDER BY t.created_at DESC`,
      []
    );

    return res.json({
      success: true,
      data: result.rows.map(row => ({
        tenantId: row.tenant_id,
        nombreCliente: row.nombre_cliente,
        dominio: row.dominio,
        isActive: row.is_active,
        creadoEn: row.created_at,
        stats: {
          totalAdmins: parseInt(row.total_admins),
          totalClientes: parseInt(row.total_clientes)
        }
      }))
    });

  } catch (error) {
    logger.error('Error al listar tenants', { error: error.message });
    return res.status(500).json({
      success: false,
      message: 'Error al obtener la lista de tenants'
    });
  }
}

async function obtenerTenant(req, res) {
  try {
    const tenantId = parseInt(req.params.id, 10);
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
      return res.status(400).json({ success: false, message: 'ID de tenant inválido' });
    }

    const tenantResult = await db.query(
      `SELECT tenant_id, nombre_cliente, dominio, is_active, created_at
       FROM tenants WHERE tenant_id = $1`,
      [tenantId]
    );

    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Tenant no encontrado' });
    }

    const adminsResult = await db.query(
      `SELECT adminid, nombre, apellido, email, rol, activo
       FROM administradores WHERE tenant_id = $1 ORDER BY adminid ASC`,
      [tenantId]
    );

    const tenant = tenantResult.rows[0];
    return res.json({
      success: true,
      data: {
        tenantId: tenant.tenant_id,
        nombreCliente: tenant.nombre_cliente,
        dominio: tenant.dominio,
        isActive: tenant.is_active,
        creadoEn: tenant.created_at,
        administradores: adminsResult.rows
      }
    });

  } catch (error) {
    logger.error('Error al obtener detalle de tenant', { error: error.message });
    return res.status(500).json({
      success: false,
      message: 'Error al obtener el tenant'
    });
  }
}

module.exports = { crearTenant, listarTenants, obtenerTenant };
