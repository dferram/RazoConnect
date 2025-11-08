const db = require('../db');
const { enviarEmail } = require('../services/emailService');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

/**
 * Login de administrador
 * POST /api/admin/login
 */
const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validar campos requeridos
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email y contraseña son requeridos'
      });
    }

    // Buscar administrador por email
    const result = await db.query(
      'SELECT * FROM Administradores WHERE Email = $1 AND Activo = TRUE',
      [email]
    );

    let cuenta = null;

    if (result.rows.length > 0) {
      const admin = result.rows[0];
      cuenta = {
        id: admin.adminid,
        email: admin.email,
        nombre: admin.nombre,
        apellido: admin.apellido || '',
        rol: admin.rol,
        passwordHash: admin.passwordhash,
        adminSource: 'admin',
        roles: Array.from(new Set(['admin', admin.rol].filter(Boolean)))
      };
    } else {
      const agenteResult = await db.query(
        `SELECT 
          AgenteID,
          Nombre,
          Apellido,
          Email,
          PasswordHash,
          CodigoAgente,
          Activo,
          EsAdmin,
          AdminRol
        FROM AgentesDeVentas
        WHERE Email = $1 AND Activo = TRUE`,
        [email]
      );

      if (agenteResult.rows.length > 0) {
        const agente = agenteResult.rows[0];
        const esAdmin = Boolean(agente.esadmin);

        if (esAdmin) {
          const adminRol = agente.adminrol || 'admin';
          cuenta = {
            id: agente.agenteid,
            email: agente.email,
            nombre: agente.nombre,
            apellido: agente.apellido || '',
            rol: adminRol,
            passwordHash: agente.passwordhash,
            adminSource: 'agent',
            codigoAgente: agente.codigoagente,
            roles: Array.from(new Set(['admin', adminRol, 'agente']))
          };
        }
      }
    }

    if (!cuenta) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }

    // Verificar contraseña
    const isPasswordValid = await bcrypt.compare(password, cuenta.passwordHash);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }

    const tokenPayload = {
      id: cuenta.id,
      email: cuenta.email,
      rol: cuenta.rol,
      tipo: 'admin',
      roles: cuenta.roles,
      adminSource: cuenta.adminSource
    };

    if (cuenta.adminSource === 'agent') {
      tokenPayload.agenteId = cuenta.id;
      if (cuenta.codigoAgente) {
        tokenPayload.codigoAgente = cuenta.codigoAgente;
      }
    }

    // Generar token JWT
    const token = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET,
      { expiresIn: '8h' } // Token válido por 8 horas
    );

    const nombreCompleto = [cuenta.nombre, cuenta.apellido].filter(Boolean).join(' ').trim() || cuenta.nombre;

    // Enviar respuesta
    res.json({
      success: true,
      message: 'Login exitoso',
      data: {
        token,
        admin: {
          adminId: cuenta.id,
          nombre: nombreCompleto,
          email: cuenta.email,
          rol: cuenta.rol,
          origen: cuenta.adminSource
        }
      }
    });

  } catch (error) {
    console.error('Error en login de admin:', error);
    res.status(500).json({
      success: false,
      message: 'Error en el servidor'
    });
  }
};

/**
 * Actualizar costo de envío de un pedido
 * PUT /api/admin/pedidos/:id/costo-envio
 */
const updateCostoEnvio = async (req, res) => {
  try {
    const pedidoId = parseInt(req.params.id);
    const { costoEnvio } = req.body;

    if (Number.isNaN(pedidoId)) {
      return res.status(400).json({
        success: false,
        message: 'ID de pedido inválido'
      });
    }

    if (costoEnvio === undefined || costoEnvio === null || costoEnvio === '') {
      return res.status(400).json({
        success: false,
        message: 'El costo de envío es requerido'
      });
    }

    const costoEnvioValue = parseFloat(costoEnvio);

    if (Number.isNaN(costoEnvioValue) || costoEnvioValue < 0) {
      return res.status(400).json({
        success: false,
        message: 'El costo de envío debe ser un número mayor o igual a 0'
      });
    }

    const result = await db.query(
      `UPDATE Pedidos
       SET CostoEnvio = $1
       WHERE PedidoID = $2
       RETURNING PedidoID, CostoEnvio` ,
      [costoEnvioValue, pedidoId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Pedido no encontrado'
      });
    }

    res.json({
      success: true,
      message: 'Costo de envío actualizado',
      data: {
        pedidoId: result.rows[0].pedidoid,
        costoEnvio: parseFloat(result.rows[0].costoenvio)
      }
    });

  } catch (error) {
    console.error('Error al actualizar costo de envío:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar el costo de envío'
    });
  }
};

/**
 * Obtener detalle de un cliente
 * GET /api/admin/clientes/:id
 */
const getClienteDetalle = async (req, res) => {
  try {
    const clienteId = parseInt(req.params.id, 10);

    if (!Number.isInteger(clienteId)) {
      return res.status(400).json({
        success: false,
        message: 'ClienteID inválido'
      });
    }

    const clienteQuery = `
      SELECT 
        ClienteID,
        Nombre,
        Apellido,
        Email,
        Telefono,
        Activo,
        FechaDeRegistro
      FROM Clientes
      WHERE ClienteID = $1
    `;

    const clienteResult = await db.query(clienteQuery, [clienteId]);

    if (clienteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cliente no encontrado'
      });
    }

    const cliente = clienteResult.rows[0];

    const pedidosQuery = `
      SELECT 
        PedidoID,
        FechaPedido,
        MontoTotal,
        Estatus,
        DireccionEnvioID,
        AgenteID
      FROM Pedidos
      WHERE ClienteID = $1
      ORDER BY FechaPedido DESC
    `;

    const pedidosResult = await db.query(pedidosQuery, [clienteId]);

    const direccionesQuery = `
      SELECT 
        DireccionID,
        Etiqueta,
        Receptor,
        Calle,
        NumeroExt,
        NumeroInt,
        Colonia,
        Ciudad,
        Estado,
        CodigoPostal,
        TelefonoContacto
      FROM Cliente_Direcciones
      WHERE ClienteID = $1
      ORDER BY DireccionID DESC
    `;

    const direccionesResult = await db.query(direccionesQuery, [clienteId]);

    res.json({
      success: true,
      data: {
        cliente: {
          clienteId: cliente.clienteid,
          nombre: cliente.nombre,
          apellido: cliente.apellido,
          email: cliente.email,
          telefono: cliente.telefono,
          activo: cliente.activo,
          fechaRegistro: cliente.fechaderegistro
        },
        pedidos: pedidosResult.rows.map(pedido => ({
          pedidoId: pedido.pedidoid,
          fechaPedido: pedido.fechapedido,
          montoTotal: pedido.montototal ? parseFloat(pedido.montototal) : 0,
          estatus: pedido.estatus,
          direccionEnvioId: pedido.direccionenvioid,
          agenteId: pedido.agenteid
        })),
        direcciones: direccionesResult.rows.map(direccion => ({
          direccionId: direccion.direccionid,
          etiqueta: direccion.etiqueta,
          receptor: direccion.receptor,
          calle: direccion.calle,
          numeroExt: direccion.numeroext,
          numeroInt: direccion.numeroint,
          colonia: direccion.colonia,
          ciudad: direccion.ciudad,
          estado: direccion.estado,
          codigoPostal: direccion.codigopostal,
          telefonoContacto: direccion.telefonocontacto
        }))
      }
    });

  } catch (error) {
    console.error('Error al obtener detalle del cliente:', error);
    res.status(500).json({
      success: false,
      message: 'Error en el servidor'
    });
  }
};

/**
 * Actualizar estado activo de un cliente
 * PUT /api/admin/clientes/:id/estado
 */
const actualizarEstadoCliente = async (req, res) => {
  try {
    const clienteId = parseInt(req.params.id, 10);
    const { activo } = req.body;

    if (!Number.isInteger(clienteId)) {
      return res.status(400).json({
        success: false,
        message: 'ClienteID inválido'
      });
    }

    if (typeof activo !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'El campo "activo" debe ser booleano'
      });
    }

    const result = await db.query(
      `UPDATE Clientes
       SET Activo = $1
       WHERE ClienteID = $2
       RETURNING ClienteID, Activo`,
      [activo, clienteId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cliente no encontrado'
      });
    }

    res.json({
      success: true,
      message: 'Estado del cliente actualizado correctamente',
      data: {
        clienteId: result.rows[0].clienteid,
        activo: result.rows[0].activo
      }
    });

  } catch (error) {
    console.error('Error al actualizar estado del cliente:', error);
    res.status(500).json({
      success: false,
      message: 'Error en el servidor'
    });
  }
};

/**
 * Obtener catálogo de medidas disponibles
 * GET /api/admin/medidas
 */
const getMedidas = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT MedidaID, Nombre, Abreviatura
       FROM Medidas
       ORDER BY Nombre`
    );

    res.json({
      success: true,
      data: {
        medidas: result.rows.map(row => ({
          medidaId: row.medidaid,
          nombre: row.nombre,
          abreviatura: row.abreviatura
        }))
      }
    });

  } catch (error) {
    console.error('Error al obtener medidas:', error);
    res.status(500).json({
      success: false,
      message: 'Error en el servidor'
    });
  }
};

/**
 * Verificar token de admin
 * GET /api/admin/verify
 */
const verifyAdmin = async (req, res) => {
  try {
    // El middleware ya validó el token y agregó req.user
    const adminId = req.user.id;

    let adminInfo = null;

    if (req.user.adminSource === 'agent') {
      const agentResult = await db.query(
        `SELECT 
          AgenteID,
          Nombre,
          Apellido,
          Email,
          CodigoAgente,
          AdminRol
        FROM AgentesDeVentas
        WHERE AgenteID = $1 AND Activo = TRUE`,
        [adminId]
      );

      if (agentResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Administrador no encontrado'
        });
      }

      const agente = agentResult.rows[0];
      const nombreCompleto = [agente.nombre, agente.apellido].filter(Boolean).join(' ').trim() || agente.nombre;

      adminInfo = {
        adminId: agente.agenteid,
        nombre: nombreCompleto,
        email: agente.email,
        rol: agente.adminrol || req.user.rol,
        origen: 'agent',
        codigoAgente: agente.codigoagente || req.user.codigoAgente || null
      };
    } else {
      const result = await db.query(
        'SELECT AdminID, Nombre, Apellido, Email, Rol FROM Administradores WHERE AdminID = $1 AND Activo = TRUE',
        [adminId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Administrador no encontrado'
        });
      }

      const admin = result.rows[0];
      const nombreCompleto = [admin.nombre, admin.apellido].filter(Boolean).join(' ').trim() || admin.nombre;

      adminInfo = {
        adminId: admin.adminid,
        nombre: nombreCompleto,
        email: admin.email,
        rol: admin.rol,
        origen: 'admin'
      };
    }

    res.json({
      success: true,
      data: {
        admin: adminInfo
      }
    });

  } catch (error) {
    console.error('Error al verificar admin:', error);
    res.status(500).json({
      success: false,
      message: 'Error en el servidor'
    });
  }
};

/**
 * Obtener perfil del admin
 * GET /api/admin/profile
 */
const getAdminProfile = async (req, res) => {
  try {
    const adminId = req.user.id;

    let adminData = null;

    if (req.user.adminSource === 'agent') {
      const agentResult = await db.query(
        `SELECT 
          AgenteID,
          Nombre,
          Apellido,
          Email,
          CodigoAgente,
          AdminRol,
          FechaCreacion
        FROM AgentesDeVentas
        WHERE AgenteID = $1 AND Activo = TRUE`,
        [adminId]
      );

      if (agentResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Administrador no encontrado'
        });
      }

      const agente = agentResult.rows[0];
      const nombreCompleto = [agente.nombre, agente.apellido].filter(Boolean).join(' ').trim() || agente.nombre;

      adminData = {
        adminId: agente.agenteid,
        nombre: nombreCompleto,
        email: agente.email,
        rol: agente.adminrol || req.user.rol,
        fechaCreacion: agente.fechacreacion,
        origen: 'agent',
        codigoAgente: agente.codigoagente || req.user.codigoAgente || null
      };
    } else {
      const result = await db.query(
        `SELECT 
          AdminID, 
          Nombre, 
          Apellido,
          Email, 
          Rol, 
          FechaCreacion
        FROM Administradores 
        WHERE AdminID = $1 AND Activo = TRUE`,
        [adminId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Administrador no encontrado'
        });
      }

      const admin = result.rows[0];
      const nombreCompleto = [admin.nombre, admin.apellido].filter(Boolean).join(' ').trim() || admin.nombre;

      adminData = {
        adminId: admin.adminid,
        nombre: nombreCompleto,
        email: admin.email,
        rol: admin.rol,
        fechaCreacion: admin.fechacreacion,
        origen: 'admin'
      };
    }

    res.json({
      success: true,
      data: adminData
    });

  } catch (error) {
    console.error('Error al obtener perfil de admin:', error);
    res.status(500).json({
      success: false,
      message: 'Error en el servidor'
    });
  }
};

/**
 * Renovar token de admin
 * POST /api/admin/refresh-token
 */
const refreshAdminToken = async (req, res) => {
  try {
    // El middleware authenticate ya verificó el token actual
    const adminId = req.user.id;
    const email = req.user.email;
    const tipo = req.user.tipo;

    // Verificar que el admin aún existe
    const result = await db.query(
      `SELECT AdminID FROM Administradores WHERE AdminID = $1`,
      [adminId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Administrador no encontrado'
      });
    }

    // Generar un nuevo token con el mismo payload
    const { generateToken } = require('../utils/jwtHelper');
    const newToken = generateToken({
      userId: adminId,
      tipo: tipo,
      rol: req.user.rol,
      email: email
    });

    console.log('🔄 Token de admin renovado:', { adminId, email });

    res.json({
      success: true,
      message: 'Token renovado exitosamente',
      data: {
        token: newToken
      }
    });

  } catch (error) {
    console.error('Error refreshing admin token:', error);
    res.status(500).json({
      success: false,
      message: 'Error al renovar token'
    });
  }
};

/**
 * Obtener estadísticas del dashboard
 * GET /api/admin/dashboard-stats
 */
const getDashboardStats = async (req, res) => {
  try {
    // Pedidos pendientes
    const pedidosPendientes = await db.query(
      `SELECT COUNT(*) as total FROM Pedidos WHERE Estatus = 'Pendiente'`
    );

    // Total de comisiones pendientes
    const comisionesPendientes = await db.query(
      `SELECT COALESCE(SUM(MontoComision), 0) as total 
       FROM Comisiones 
       WHERE Estatus = 'Pendiente'`
    );

    // Variantes con stock bajo (<=5 paquetes)
    const productosStockBajo = await db.query(
      `SELECT COUNT(*) AS total
       FROM Producto_Variantes
       WHERE COALESCE(Stock, 0) <= 5`
    );

    // Total de pedidos (para estadística general)
    const totalPedidos = await db.query(
      `SELECT COUNT(*) as total FROM Pedidos`
    );

    // Ingresos totales
    const ingresosTotales = await db.query(
      `SELECT COALESCE(SUM(MontoTotal), 0) as total FROM Pedidos`
    );

    // Clientes totales (tabla Clientes no tiene columna Activo)
    const clientesActivos = await db.query(
      `SELECT COUNT(*) as total FROM Clientes`
    );

    // Agentes activos
    const agentesActivos = await db.query(
      `SELECT COUNT(*) as total FROM AgentesDeVentas WHERE Activo = TRUE`
    );

    res.json({
      success: true,
      data: {
        pedidosPendientes: parseInt(pedidosPendientes.rows[0].total),
        comisionesPendientes: parseFloat(comisionesPendientes.rows[0].total),
        productosStockBajo: parseInt(productosStockBajo.rows[0].total),
        totalPedidos: parseInt(totalPedidos.rows[0].total),
        ingresosTotales: parseFloat(ingresosTotales.rows[0].total),
        clientesActivos: parseInt(clientesActivos.rows[0].total),
        agentesActivos: parseInt(agentesActivos.rows[0].total)
      }
    });

  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    res.status(500).json({
      success: false,
      message: 'Error en el servidor'
    });
  }
};

/**
 * Obtener todos los pedidos (para administración)
 * GET /api/admin/pedidos
 */
const getAllPedidos = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
        p.PedidoID,
        p.ClienteID,
        c.Nombre || ' ' || c.Apellido as ClienteNombre,
        c.Email as ClienteEmail,
        p.FechaPedido,
        p.MontoTotal,
        p.CostoEnvio,
        p.Estatus,
        p.DireccionEnvioID,
        d.Calle || ', ' || d.Ciudad || ', ' || d.Estado as DireccionCompleta,
        p.AgenteID,
        CASE 
          WHEN a.AgenteID IS NOT NULL THEN a.Nombre || ' ' || a.Apellido 
          ELSE NULL 
        END as AgenteNombre,
        (SELECT COUNT(*) FROM DetallesDelPedido dp WHERE dp.PedidoID = p.PedidoID) as TotalItems
      FROM Pedidos p
      INNER JOIN Clientes c ON p.ClienteID = c.ClienteID
      LEFT JOIN Cliente_Direcciones d ON p.DireccionEnvioID = d.DireccionID
      LEFT JOIN AgentesDeVentas a ON p.AgenteID = a.AgenteID
      ORDER BY p.FechaPedido DESC`
    );

    res.json({
      success: true,
      data: {
        pedidos: result.rows.map(row => ({
          pedidoId: row.pedidoid,
          clienteId: row.clienteid,
          clienteNombre: row.clientenombre,
          clienteEmail: row.clienteemail,
          fechaPedido: row.fechapedido,
          montoTotal: parseFloat(row.montototal),
          costoEnvio: row.costoenvio !== null ? parseFloat(row.costoenvio) : null,
          estatus: row.estatus,
          direccionEnvioId: row.direccionenvioid,
          direccionCompleta: row.direccioncompleta,
          agenteId: row.agenteid,
          agenteNombre: row.agentenombre,
          totalItems: parseInt(row.totalitems)
        }))
      }
    });

  } catch (error) {
    console.error('Error al obtener pedidos:', error);
    res.status(500).json({
      success: false,
      message: 'Error en el servidor'
    });
  }
};

/**
 * Actualizar estatus de un pedido
 * PUT /api/admin/pedidos/:id
 */
const updatePedidoEstatus = async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    const pedidoId = parseInt(req.params.id);
    const { estatus } = req.body;

    // Validar estatus
    const estatusValidos = ['Pendiente', 'Confirmado', 'Enviado', 'Entregado', 'Cancelado'];
    if (!estatusValidos.includes(estatus)) {
      return res.status(400).json({
        success: false,
        message: 'Estatus inválido'
      });
    }

    await client.query('BEGIN');

    // Obtener datos del pedido
    const pedidoResult = await client.query(
      'SELECT * FROM Pedidos WHERE PedidoID = $1',
      [pedidoId]
    );

    if (pedidoResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Pedido no encontrado'
      });
    }

    const pedido = pedidoResult.rows[0];
    const estatusAnterior = pedido.estatus;

    // Si el estatus cambia a 'Confirmado', reducir stock y crear log
    if (estatus === 'Confirmado' && estatusAnterior !== 'Confirmado') {
      // Obtener los detalles del pedido con sus variantes
      const detallesResult = await client.query(
        `SELECT 
          dp.DetalleID,
          dp.VarianteID,
          dp.CantidadPaquetes,
          pv.Stock,
          pv.ProductoID,
          pv.SKU,
          pr.NombreProducto
        FROM DetallesDelPedido dp
        INNER JOIN Producto_Variantes pv ON dp.VarianteID = pv.VarianteID
        INNER JOIN Productos pr ON pv.ProductoID = pr.ProductoID
        WHERE dp.PedidoID = $1`,
        [pedidoId]
      );

      // Reducir stock de cada variante y crear log
      for (const detalle of detallesResult.rows) {
        const stockActual = detalle.stock ?? 0;
        const cantidadRequerida = detalle.cantidadpaquetes;

        if (stockActual < cantidadRequerida) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: `Stock insuficiente para la variante ${detalle.sku || detalle.varianteid}. Stock actual: ${stockActual}, requerido: ${cantidadRequerida}`
          });
        }

        const nuevoStock = stockActual - cantidadRequerida;

        await client.query(
          `UPDATE Producto_Variantes 
           SET Stock = $1 
           WHERE VarianteID = $2`,
          [nuevoStock, detalle.varianteid]
        );

        await client.query(
          `INSERT INTO Log_Inventario (VarianteID, CantidadCambiado, NuevoStock, Motivo, UsuarioID)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            detalle.varianteid,
            -cantidadRequerida,
            nuevoStock,
            `Pedido #${pedidoId} confirmado (${detalle.nombreproducto})`,
            req.user.id
          ]
        );
      }
    }

    // Actualizar el estatus del pedido
    await client.query(
      'UPDATE Pedidos SET Estatus = $1 WHERE PedidoID = $2',
      [estatus, pedidoId]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Pedido actualizado a ${estatus}`,
      data: {
        pedidoId,
        estatusAnterior,
        estatusNuevo: estatus
      }
    });

    try {
      const clienteInfo = await db.query(
        `SELECT c.Email, c.Nombre
         FROM Pedidos p
         INNER JOIN Clientes c ON c.ClienteID = p.ClienteID
         WHERE p.PedidoID = $1`,
        [pedidoId]
      );

      const emailCliente = clienteInfo.rows[0]?.email;
      const nombreCliente = clienteInfo.rows[0]?.nombre || '';

      if (emailCliente) {
        if (estatus === 'Confirmado') {
          const asunto = `Pedido #${pedidoId} confirmado`;
          const cuerpoHtml = `
            <div style="font-family: Arial, sans-serif; color: #111827;">
              <h2 style="color:#16a34a;">¡Tu pedido está confirmado!</h2>
              <p>Hola ${nombreCliente || 'cliente'},</p>
              <p>Hemos confirmado tu pedido <strong>#${pedidoId}</strong>. Nuestro equipo está preparando tu envío.</p>
              <p>Te avisaremos cuando salga a ruta.</p>
              <p style="margin-top: 1.5rem;">Equipo RazoConnect</p>
            </div>
          `;
          enviarEmail(emailCliente, asunto, cuerpoHtml).catch((err) => {
            console.error('No se pudo enviar correo de pedido confirmado:', err);
          });
        } else if (estatus === 'Enviado') {
          const asunto = `Tu pedido #${pedidoId} está en camino`;
          const cuerpoHtml = `
            <div style="font-family: Arial, sans-serif; color: #111827;">
              <h2 style="color:#0ea5e9;">¡Tu pedido está en camino!</h2>
              <p>Hola ${nombreCliente || 'cliente'},</p>
              <p>El pedido <strong>#${pedidoId}</strong> ya fue enviado y llegará muy pronto.</p>
              <p>Gracias por confiar en RazoConnect.</p>
              <p style="margin-top: 1.5rem;">Equipo RazoConnect</p>
            </div>
          `;
          enviarEmail(emailCliente, asunto, cuerpoHtml).catch((err) => {
            console.error('No se pudo enviar correo de pedido enviado:', err);
          });
        }
      }
    } catch (emailError) {
      console.error('Error al notificar al cliente sobre el estatus del pedido:', emailError);
    }

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al actualizar pedido:', error);
    res.status(500).json({
      success: false,
      message: 'Error en el servidor',
      error: error.message
    });
  } finally {
    client.release();
  }
};

/**
 * Crear un nuevo producto
 * POST /api/admin/productos
 */
const crearProducto = async (req, res) => {
  try {
    const { nombre, descripcion, categoriaId } = req.body;

    if (!nombre) {
      return res.status(400).json({
        success: false,
        message: 'El nombre del producto es obligatorio'
      });
    }

    const result = await db.query(
      `INSERT INTO Productos (NombreProducto, Descripcion, CategoriaID, Activo)
       VALUES ($1, $2, $3, TRUE)
       RETURNING ProductoID, NombreProducto, Descripcion, CategoriaID, Activo`,
      [
        nombre,
        descripcion || null,
        categoriaId || null
      ]
    );

    const producto = result.rows[0];

    res.status(201).json({
      success: true,
      message: 'Producto maestro creado exitosamente',
      data: {
        producto
      }
    });

  } catch (error) {
    console.error('Error al crear producto maestro:', error);
    res.status(500).json({
      success: false,
      message: 'Error en el servidor',
      error: error.message
    });
  }
};

/**
 * Crear una nueva variante para un producto maestro
 * POST /api/admin/variantes
 */
const crearVariante = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const {
      productoId,
      sku,
      dimensiones,
      piezasPorPaquete,
      costoUnitario,
      precioPaquete,
      stock,
      tipoProductoId,
      medidaId
    } = req.body;

    if (!productoId || !sku || !precioPaquete || !piezasPorPaquete) {
      return res.status(400).json({
        success: false,
        message: 'productoId, sku, piezasPorPaquete y precioPaquete son obligatorios'
      });
    }

    await client.query('BEGIN');

    const productoResult = await client.query(
      'SELECT ProductoID FROM Productos WHERE ProductoID = $1',
      [productoId]
    );

    if (productoResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Producto maestro no encontrado'
      });
    }

    const varianteResult = await client.query(
      `INSERT INTO Producto_Variantes (
        ProductoID, SKU, Dimensiones, PiezasPorPaquete, CostoUnitario,
        PrecioPaquete, Stock, TipoProductoID, MedidaID
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING VarianteID, ProductoID, SKU, Dimensiones, PiezasPorPaquete,
                CostoUnitario, PrecioPaquete, Stock, TipoProductoID, MedidaID`,
      [
        productoId,
        sku,
        dimensiones || null,
        piezasPorPaquete,
        costoUnitario !== undefined ? costoUnitario : null,
        precioPaquete,
        stock !== undefined ? stock : 0,
        tipoProductoId || null,
        medidaId || null
      ]
    );

    const variante = varianteResult.rows[0];

    if (stock && stock !== 0) {
      await client.query(
        `INSERT INTO Log_Inventario (VarianteID, CantidadCambiado, NuevoStock, Motivo, UsuarioID)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          variante.varianteid,
          stock,
          stock,
          'Stock inicial de variante',
          req.user.id
        ]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Variante creada exitosamente',
      data: {
        variante
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al crear variante:', error);
    res.status(500).json({
      success: false,
      message: 'Error en el servidor',
      error: error.message
    });
  } finally {
    client.release();
  }
};

/**
 * Ajustar inventario manualmente
 * POST /api/admin/inventario/ajuste
 */
const ajustarInventario = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const { varianteId, cantidadCambio, motivo } = req.body;

    if (!varianteId || cantidadCambio === undefined || !motivo) {
      return res.status(400).json({
        success: false,
        message: 'varianteId, cantidadCambio y motivo son requeridos'
      });
    }

    if (cantidadCambio === 0) {
      return res.status(400).json({
        success: false,
        message: 'La cantidad de cambio no puede ser cero'
      });
    }

    await client.query('BEGIN');

    const varianteResult = await client.query(
      `SELECT VarianteID, ProductoID, SKU, Stock
       FROM Producto_Variantes
       WHERE VarianteID = $1`,
      [varianteId]
    );

    if (varianteResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Variante no encontrada'
      });
    }

    const variante = varianteResult.rows[0];
    const stockActual = variante.stock || 0;
    const nuevoStock = stockActual + cantidadCambio;

    if (nuevoStock < 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Stock insuficiente. Stock actual: ${stockActual}, cambio solicitado: ${cantidadCambio}`
      });
    }

    await client.query(
      'UPDATE Producto_Variantes SET Stock = $1 WHERE VarianteID = $2',
      [nuevoStock, varianteId]
    );

    await client.query(
      `INSERT INTO Log_Inventario (VarianteID, CantidadCambiado, NuevoStock, Motivo, UsuarioID)
       VALUES ($1, $2, $3, $4, $5)`,
      [variante.varianteid, cantidadCambio, nuevoStock, motivo, req.user.id]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Inventario ajustado exitosamente',
      data: {
        varianteId: variante.varianteid,
        sku: variante.sku,
        stockAnterior: stockActual,
        cantidadCambio,
        stockNuevo: nuevoStock,
        motivo
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al ajustar inventario:', error);
    res.status(500).json({
      success: false,
      message: 'Error en el servidor',
      error: error.message
    });
  } finally {
    client.release();
  }
};

/**
 * Obtener todos los productos (para gestión)
 * GET /api/admin/productos
 */
const getAllProductos = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
        p.ProductoID,
        p.NombreProducto,
        p.Descripcion,
        p.CategoriaID,
        COALESCE(SUM(v.Stock), 0) AS stock_total,
        COUNT(v.VarianteID) AS variantes_count,
        MIN(v.PrecioPaquete) FILTER (WHERE v.PrecioPaquete IS NOT NULL) AS precio_desde,
        JSONB_BUILD_OBJECT(
          'varianteId', v_top.VarianteID,
          'sku', v_top.SKU,
          'precioPaquete', v_top.PrecioPaquete,
          'piezasPorPaquete', v_top.PiezasPorPaquete,
          'stock', v_top.Stock,
          'dimensiones', v_top.Dimensiones,
          'medidaId', v_top.MedidaID
        ) AS variante_destacada,
        JSONB_AGG(
          JSONB_BUILD_OBJECT(
            'varianteId', v.VarianteID,
            'sku', v.SKU,
            'precioPaquete', v.PrecioPaquete,
            'piezasPorPaquete', v.PiezasPorPaquete,
            'stock', v.Stock,
            'dimensiones', v.Dimensiones,
            'medidaId', v.MedidaID
          )
        ) FILTER (WHERE v.VarianteID IS NOT NULL) AS variantes
      FROM Productos p
      LEFT JOIN Producto_Variantes v ON v.ProductoID = p.ProductoID
      LEFT JOIN LATERAL (
        SELECT v2.*
        FROM Producto_Variantes v2
        WHERE v2.ProductoID = p.ProductoID
        ORDER BY v2.Stock DESC NULLS LAST, v2.VarianteID ASC
        LIMIT 1
      ) v_top ON true
      GROUP BY p.ProductoID, p.NombreProducto, p.Descripcion, p.CategoriaID, v_top.VarianteID, v_top.SKU, v_top.PrecioPaquete, v_top.PiezasPorPaquete, v_top.Stock, v_top.Dimensiones, v_top.MedidaID
      ORDER BY p.ProductoID DESC`
    );

    const categorias = await db.query('SELECT CategoriaID, Nombre FROM Categorias');
    const categoriasMap = {};
    categorias.rows.forEach(cat => {
      categoriasMap[cat.categoriaid] = cat.nombre;
    });

    res.json({
      success: true,
      data: {
        productos: result.rows.map(row => {
          const varianteDestacada = row.variante_destacada && row.variante_destacada.varianteId ? {
            varianteId: row.variante_destacada.varianteId,
            sku: row.variante_destacada.sku,
            precioPaquete: row.variante_destacada.precioPaquete ? parseFloat(row.variante_destacada.precioPaquete) : null,
            piezasPorPaquete: row.variante_destacada.piezasPorPaquete,
            stock: row.variante_destacada.stock ?? 0,
            dimensiones: row.variante_destacada.dimensiones || null,
            medidaId: row.variante_destacada.medidaId || null
          } : null;

          const variantes = Array.isArray(row.variantes)
            ? row.variantes.map(variant => ({
                varianteId: variant.varianteId,
                sku: variant.sku,
                precioPaquete: variant.precioPaquete ? parseFloat(variant.precioPaquete) : null,
                piezasPorPaquete: variant.piezasPorPaquete,
                stock: variant.stock ?? 0,
                dimensiones: variant.dimensiones || null,
                medidaId: variant.medidaId || null
              }))
            : [];

          return {
            productoid: row.productoid,
            nombreproducto: row.nombreproducto,
            descripcion: row.descripcion,
            stockTotal: parseInt(row.stock_total, 10) || 0,
            variantesCount: parseInt(row.variantes_count, 10) || 0,
            precioDesde: row.precio_desde ? parseFloat(row.precio_desde) : null,
            categoriaNombre: categoriasMap[row.categoriaid] || 'Sin categoría',
            varianteDestacada,
            variantes
          };
        })
      }
    });

  } catch (error) {
    console.error('Error al obtener productos:', error);
    res.status(500).json({
      success: false,
      message: 'Error en el servidor'
    });
  }
};

/**
 * Obtener categorías disponibles
 * GET /api/admin/categorias
 */
const getCategorias = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
        c.CategoriaID,
        c.Nombre,
        c.Descripcion,
        c.ParentCategoriaID,
        p.Nombre AS ParentNombre
      FROM Categorias c
      LEFT JOIN Categorias p ON c.ParentCategoriaID = p.CategoriaID
      ORDER BY c.Nombre`
    );

    res.json({
      success: true,
      data: {
        categorias: result.rows.map(row => ({
          categoriaId: row.categoriaid,
          nombre: row.nombre,
          descripcion: row.descripcion,
          parentCategoriaId: row.parentcategoriaid,
          parentNombre: row.parentnombre || null
        }))
      }
    });

  } catch (error) {
    console.error('Error al obtener categorías:', error);
    res.status(500).json({
      success: false,
      message: 'Error en el servidor'
    });
  }
};

/**
 * Crear una nueva categoría
 * POST /api/admin/categorias
 */
const crearCategoria = async (req, res) => {
  try {
    const { nombre, descripcion, parentCategoriaId } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({
        success: false,
        message: 'El nombre de la categoría es requerido'
      });
    }

    let parentCategoria = null;

    if (parentCategoriaId !== undefined && parentCategoriaId !== null) {
      const parentResult = await db.query(
        'SELECT CategoriaID FROM Categorias WHERE CategoriaID = $1',
        [parentCategoriaId]
      );

      if (parentResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'La categoría padre especificada no existe'
        });
      }

      parentCategoria = parentCategoriaId;
    }

    const nombreNormalizado = nombre.trim();

    const existente = await db.query(
      'SELECT CategoriaID FROM Categorias WHERE LOWER(Nombre) = LOWER($1)',
      [nombreNormalizado]
    );

    if (existente.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Ya existe una categoría con ese nombre'
      });
    }

    const insertResult = await db.query(
      `INSERT INTO Categorias (Nombre, Descripcion, ParentCategoriaID)
       VALUES ($1, $2, $3)
       RETURNING CategoriaID, Nombre, Descripcion, ParentCategoriaID`,
      [nombreNormalizado, descripcion?.trim() || null, parentCategoria]
    );

    const categoria = insertResult.rows[0];

    res.status(201).json({
      success: true,
      message: 'Categoría creada exitosamente',
      data: {
        categoria: {
          categoriaId: categoria.categoriaid,
          nombre: categoria.nombre,
          descripcion: categoria.descripcion,
          parentCategoriaId: categoria.parentcategoriaid
        }
      }
    });

  } catch (error) {
    console.error('Error al crear categoría:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear la categoría'
    });
  }
};

/**
 * Actualizar una categoría existente
 * PUT /api/admin/categorias/:id
 */
const actualizarCategoria = async (req, res) => {
  try {
    const categoriaId = parseInt(req.params.id, 10);
    const { nombre, descripcion, parentCategoriaId } = req.body;

    if (Number.isNaN(categoriaId)) {
      return res.status(400).json({
        success: false,
        message: 'ID de categoría inválido'
      });
    }

    if (parentCategoriaId && Number(parentCategoriaId) === categoriaId) {
      return res.status(400).json({
        success: false,
        message: 'Una categoría no puede ser su propia categoría padre'
      });
    }

    const categoriaResult = await db.query(
      'SELECT CategoriaID FROM Categorias WHERE CategoriaID = $1',
      [categoriaId]
    );

    if (categoriaResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Categoría no encontrada'
      });
    }

    let parentCategoria = null;

    if (parentCategoriaId !== undefined && parentCategoriaId !== null) {
      const parentResult = await db.query(
        'SELECT CategoriaID FROM Categorias WHERE CategoriaID = $1',
        [parentCategoriaId]
      );

      if (parentResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'La categoría padre especificada no existe'
        });
      }

      parentCategoria = parentCategoriaId;
    }

    const nombreNormalizado = nombre?.trim();

    if (nombreNormalizado) {
      const existeNombre = await db.query(
        'SELECT CategoriaID FROM Categorias WHERE LOWER(Nombre) = LOWER($1) AND CategoriaID <> $2',
        [nombreNormalizado, categoriaId]
      );

      if (existeNombre.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'Ya existe otra categoría con ese nombre'
        });
      }
    }

    const updateResult = await db.query(
      `UPDATE Categorias
       SET Nombre = COALESCE($1, Nombre),
           Descripcion = $2,
           ParentCategoriaID = $3,
           FechaActualizacion = NOW()
       WHERE CategoriaID = $4
       RETURNING CategoriaID, Nombre, Descripcion, ParentCategoriaID`,
      [nombreNormalizado || null, descripcion?.trim() || null, parentCategoria, categoriaId]
    );

    const categoriaActualizada = updateResult.rows[0];

    res.json({
      success: true,
      message: 'Categoría actualizada correctamente',
      data: {
        categoria: {
          categoriaId: categoriaActualizada.categoriaid,
          nombre: categoriaActualizada.nombre,
          descripcion: categoriaActualizada.descripcion,
          parentCategoriaId: categoriaActualizada.parentcategoriaid
        }
      }
    });

  } catch (error) {
    console.error('Error al actualizar categoría:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar la categoría'
    });
  }
};

/**
 * Eliminar una categoría
 * DELETE /api/admin/categorias/:id
 */
const eliminarCategoria = async (req, res) => {
  try {
    const categoriaId = parseInt(req.params.id, 10);

    if (Number.isNaN(categoriaId)) {
      return res.status(400).json({
        success: false,
        message: 'ID de categoría inválido'
      });
    }

    const categoriaResult = await db.query(
      'SELECT CategoriaID FROM Categorias WHERE CategoriaID = $1',
      [categoriaId]
    );

    if (categoriaResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Categoría no encontrada'
      });
    }

    // Verificar si la categoría tiene subcategorías
    const subcategoriasResult = await db.query(
      'SELECT COUNT(*) AS total FROM Categorias WHERE ParentCategoriaID = $1',
      [categoriaId]
    );

    if (parseInt(subcategoriasResult.rows[0].total, 10) > 0) {
      return res.status(400).json({
        success: false,
        message: 'No se puede eliminar la categoría porque tiene subcategorías asociadas'
      });
    }

    // Verificar si hay productos asociados a la categoría
    const productosAsociados = await db.query(
      'SELECT COUNT(*) AS total FROM Productos WHERE CategoriaID = $1',
      [categoriaId]
    );

    if (parseInt(productosAsociados.rows[0].total, 10) > 0) {
      return res.status(400).json({
        success: false,
        message: 'No se puede eliminar la categoría porque existen productos asociados'
      });
    }

    // Verificar si hay variantes usando productos de esta categoría
    const productosEnUso = await db.query(
      `SELECT COUNT(*) AS total
       FROM Producto_Variantes pv
       INNER JOIN Productos p ON pv.ProductoID = p.ProductoID
       WHERE p.CategoriaID = $1`,
      [categoriaId]
    );

    if (parseInt(productosEnUso.rows[0].total, 10) > 0) {
      return res.status(400).json({
        success: false,
        message: 'No se puede eliminar la categoría porque existen productos asociados'
      });
    }

    await db.query('DELETE FROM Categorias WHERE CategoriaID = $1', [categoriaId]);

    res.json({
      success: true,
      message: 'Categoría eliminada correctamente'
    });

  } catch (error) {
    console.error('Error al eliminar categoría:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar la categoría'
    });
  }
};

/**
 * Crear un nuevo agente
 * POST /api/admin/agentes
 */
const crearAgente = async (req, res) => {
  try {
    const { nombre, apellido, email, password, codigoAgente, telefono } = req.body;

    // Validaciones
    if (!nombre || !apellido || !email || !password || !codigoAgente) {
      return res.status(400).json({
        success: false,
        message: 'Todos los campos obligatorios deben ser proporcionados'
      });
    }

    // Verificar si el email ya existe
    const emailCheck = await db.query(
      'SELECT AgenteID FROM AgentesDeVentas WHERE Email = $1',
      [email]
    );

    if (emailCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'El email ya está registrado'
      });
    }

    // Verificar si el código de agente ya existe
    const codigoCheck = await db.query(
      'SELECT AgenteID FROM AgentesDeVentas WHERE CodigoAgente = $1',
      [codigoAgente]
    );

    if (codigoCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'El código de agente ya existe'
      });
    }

    // Hash de la contraseña
    const bcrypt = require('bcrypt');
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insertar el agente
    const result = await db.query(
      `INSERT INTO AgentesDeVentas 
        (Nombre, Apellido, Email, PasswordHash, CodigoAgente, Activo)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING AgenteID, Nombre, Apellido, Email, CodigoAgente`,
      [nombre, apellido, email, hashedPassword, codigoAgente]
    );

    const agente = result.rows[0];

    res.status(201).json({
      success: true,
      message: 'Agente creado exitosamente',
      data: {
        agenteId: agente.agenteid,
        nombre: agente.nombre,
        apellido: agente.apellido,
        email: agente.email,
        codigoAgente: agente.codigoagente
      }
    });

  } catch (error) {
    console.error('Error al crear agente:', error);
    res.status(500).json({
      success: false,
      message: 'Error en el servidor',
      error: error.message
    });
  }
};

/**
 * Obtener todos los agentes
 * GET /api/admin/agentes
 */
const getAllAgentes = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
        a.AgenteID,
        a.Nombre,
        a.Apellido,
        a.Email,
        a.CodigoAgente,
        a.Activo,
        COUNT(DISTINCT p.PedidoID) as TotalVentas,
        COALESCE(SUM(p.MontoTotal), 0) as MontoTotalVentas,
        COALESCE(SUM(c.MontoComision), 0) as ComisionesTotales
      FROM AgentesDeVentas a
      LEFT JOIN Pedidos p ON a.AgenteID = p.AgenteID
      LEFT JOIN Comisiones c ON a.AgenteID = c.AgenteID
      GROUP BY a.AgenteID
      ORDER BY a.AgenteID DESC`
    );

    res.json({
      success: true,
      data: {
        agentes: result.rows.map(row => ({
          agenteId: row.agenteid,
          nombre: row.nombre,
          apellido: row.apellido,
          email: row.email,
          codigoAgente: row.codigoagente,
          telefono: row.telefono,
          activo: row.activo,
          fechaCreacion: row.fechacreacion,
          totalVentas: parseInt(row.totalventas),
          montoTotalVentas: parseFloat(row.montototalventas),
          comisionesTotales: parseFloat(row.comisionestotales)
        }))
      }
    });

  } catch (error) {
    console.error('Error al obtener agentes:', error);
    res.status(500).json({
      success: false,
      message: 'Error en el servidor'
    });
  }
};

/**
 * Obtener detalles de un agente específico
 * GET /api/admin/agentes/:id
 */
const getAgenteDetalle = async (req, res) => {
  try {
    const agenteId = parseInt(req.params.id);

    // Obtener información del agente
    const agenteResult = await db.query(
      `SELECT 
        AgenteID, Nombre, Apellido, Email, CodigoAgente, Activo
      FROM AgentesDeVentas
      WHERE AgenteID = $1`,
      [agenteId]
    );

    if (agenteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Agente no encontrado'
      });
    }

    const agente = agenteResult.rows[0];

    // Obtener ventas del agente
    const ventasResult = await db.query(
      `SELECT 
        p.PedidoID,
        p.FechaPedido,
        p.MontoTotal,
        p.Estatus,
        c.Nombre || ' ' || c.Apellido as ClienteNombre
      FROM Pedidos p
      INNER JOIN Clientes c ON p.ClienteID = c.ClienteID
      WHERE p.AgenteID = $1
      ORDER BY p.FechaPedido DESC`,
      [agenteId]
    );

    // Obtener comisiones del agente
    const comisionesResult = await db.query(
      `SELECT 
        ComisionID,
        PedidoID,
        MontoComision,
        Estatus
      FROM Comisiones
      WHERE AgenteID = $1
      ORDER BY ComisionID DESC`,
      [agenteId]
    );

    res.json({
      success: true,
      data: {
        agente: {
          agenteId: agente.agenteid,
          nombre: agente.nombre,
          apellido: agente.apellido,
          email: agente.email,
          codigoAgente: agente.codigoagente,
          activo: agente.activo
        },
        ventas: ventasResult.rows.map(row => ({
          pedidoId: row.pedidoid,
          fechaPedido: row.fechapedido,
          montoTotal: parseFloat(row.montototal),
          estatus: row.estatus,
          clienteNombre: row.clientenombre
        })),
        comisiones: comisionesResult.rows.map(row => ({
          comisionId: row.comisionid,
          pedidoId: row.pedidoid,
          montoComision: parseFloat(row.montocomision),
          estatus: row.estatus
        }))
      }
    });

  } catch (error) {
    console.error('Error al obtener detalle de agente:', error);
    res.status(500).json({
      success: false,
      message: 'Error en el servidor'
    });
  }
};

/**
 * Desactivar un agente (soft delete)
 * PUT /api/admin/agentes/:id/desactivar
 */
const desactivarAgente = async (req, res) => {
  try {
    const agenteId = parseInt(req.params.id);

    const result = await db.query(
      `UPDATE AgentesDeVentas 
       SET Activo = FALSE 
       WHERE AgenteID = $1
       RETURNING AgenteID, Nombre, Apellido`,
      [agenteId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Agente no encontrado'
      });
    }

    const agente = result.rows[0];

    res.json({
      success: true,
      message: `Agente ${agente.nombre} ${agente.apellido} desactivado exitosamente`,
      data: {
        agenteId: agente.agenteid
      }
    });

  } catch (error) {
    console.error('Error al desactivar agente:', error);
    res.status(500).json({
      success: false,
      message: 'Error en el servidor'
    });
  }
};

/**
 * Obtener todas las comisiones
 * GET /api/admin/comisiones
 */
const getAllComisiones = async (req, res) => {
  try {
    const { estatus } = req.query;

    let query = `
      SELECT 
        c.ComisionID,
        c.PedidoID,
        c.AgenteID,
        a.Nombre || ' ' || a.Apellido as AgenteNombre,
        a.CodigoAgente,
        c.MontoComision,
        c.Estatus,
        c.FechaCalculo,
        NULL::timestamp AS FechaPago,
        p.MontoTotal as MontoVenta
      FROM Comisiones c
      INNER JOIN AgentesDeVentas a ON c.AgenteID = a.AgenteID
      INNER JOIN Pedidos p ON c.PedidoID = p.PedidoID
    `;

    const params = [];
    if (estatus) {
      query += ' WHERE c.Estatus = $1';
      params.push(estatus);
    }

    query += ' ORDER BY c.FechaCalculo DESC';

    const result = await db.query(query, params);

    res.json({
      success: true,
      data: {
        comisiones: result.rows.map(row => ({
          comisionId: row.comisionid,
          pedidoId: row.pedidoid,
          agenteId: row.agenteid,
          agenteNombre: row.agentenombre,
          codigoAgente: row.codigoagente,
          montoComision: parseFloat(row.montocomision),
          estatus: row.estatus,
          fechaCalculo: row.fechacalculo,
          fechaGeneracion: row.fechacalculo,
          fechaPago: row.fechapago,
          montoVenta: parseFloat(row.montoventa)
        }))
      }
    });

  } catch (error) {
    console.error('Error al obtener comisiones:', error);
    res.status(500).json({
      success: false,
      message: 'Error en el servidor'
    });
  }
};

/**
 * Pagar una comisión
 * PUT /api/admin/comisiones/:id/pagar
 */
const pagarComision = async (req, res) => {
  try {
    const comisionId = parseInt(req.params.id);

    // Verificar que la comisión existe y está pendiente
    const checkResult = await db.query(
      'SELECT * FROM Comisiones WHERE ComisionID = $1',
      [comisionId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Comisión no encontrada'
      });
    }

    const comision = checkResult.rows[0];

    if (comision.estatus === 'Pagada') {
      return res.status(400).json({
        success: false,
        message: 'Esta comisión ya ha sido pagada'
      });
    }

    // Actualizar el estatus a Pagada
    const result = await db.query(
      `UPDATE Comisiones 
       SET Estatus = 'Pagada'
       WHERE ComisionID = $1
       RETURNING *`,
      [comisionId]
    );

    const comisionActualizada = result.rows[0];

    res.json({
      success: true,
      message: 'Comisión marcada como pagada',
      data: {
        comisionId: comisionActualizada.comisionid,
        montoComision: parseFloat(comisionActualizada.montocomision),
        estatus: comisionActualizada.estatus
      }
    });

  } catch (error) {
    console.error('Error al pagar comisión:', error);
    res.status(500).json({
      success: false,
      message: 'Error en el servidor'
    });
  }
};

/**
 * Obtener todos los clientes
 * GET /api/admin/clientes
 */
const getAllClientes = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
        c.ClienteID,
        c.Nombre,
        c.Apellido,
        c.Email,
        c.Telefono,
        c.Activo,
        c.FechaDeRegistro,
        COUNT(DISTINCT p.PedidoID) AS TotalPedidos,
        COALESCE(SUM(p.MontoTotal), 0) AS MontoTotalCompras
      FROM Clientes c
      LEFT JOIN Pedidos p ON c.ClienteID = p.ClienteID
      GROUP BY c.ClienteID
      ORDER BY c.FechaDeRegistro DESC`
    );

    res.json({
      success: true,
      data: {
        clientes: result.rows.map(row => ({
          clienteId: row.clienteid,
          nombre: row.nombre,
          apellido: row.apellido,
          email: row.email,
          telefono: row.telefono,
          activo: row.activo,
          fechaRegistro: row.fechaderegistro,
          totalPedidos: parseInt(row.totalpedidos),
          montoTotalCompras: parseFloat(row.montototalcompras)
        }))
      }
    });

  } catch (error) {
    console.error('Error al obtener clientes:', error);
    res.status(500).json({
      success: false,
      message: 'Error en el servidor'
    });
  }
};

/**
 * Obtener detalle de un pedido
 * GET /api/admin/pedidos/:id/detalle
 */
const getPedidoDetalle = async (req, res) => {
  try {
    const pedidoId = parseInt(req.params.id);

    // Obtener información del pedido
    const pedidoResult = await db.query(
      `SELECT 
        p.*,
        c.Nombre as ClienteNombre,
        c.Apellido as ClienteApellido,
        c.Email as ClienteEmail,
        c.Telefono as ClienteTelefono,
        a.Nombre as AgenteNombre,
        a.Apellido as AgenteApellido,
        a.CodigoAgente,
        d.Calle,
        d.NumeroExt,
        d.NumeroInt,
        d.Colonia,
        d.Ciudad,
        d.Estado,
        d.CodigoPostal,
        d.TelefonoContacto as Referencias
      FROM Pedidos p
      INNER JOIN Clientes c ON p.ClienteID = c.ClienteID
      LEFT JOIN AgentesDeVentas a ON p.AgenteID = a.AgenteID
      LEFT JOIN Cliente_Direcciones d ON p.DireccionEnvioID = d.DireccionID
      WHERE p.PedidoID = $1`,
      [pedidoId]
    );

    if (pedidoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Pedido no encontrado'
      });
    }

    const pedido = pedidoResult.rows[0];

    // Obtener detalles de productos del pedido
    const detallesResult = await db.query(
      `SELECT 
        dp.DetalleID,
        dp.PedidoID,
        dp.VarianteID,
        dp.CantidadPaquetes,
        dp.PrecioPorPaquete,
        dp.PiezasTotales,
        dp.PrecioUnitario,
        COALESCE(
          dp.PrecioUnitario, 
          ROUND(dp.PrecioPorPaquete / NULLIF((dp.PiezasTotales / NULLIF(dp.CantidadPaquetes, 0)), 0), 2)
        ) as PrecioUnitarioCalculado,
        pv.SKU,
        pv.PiezasPorPaquete,
        pv.Dimensiones,
        pv.ProductoID,
        pr.NombreProducto
      FROM DetallesDelPedido dp
      INNER JOIN Producto_Variantes pv ON dp.VarianteID = pv.VarianteID
      INNER JOIN Productos pr ON pv.ProductoID = pr.ProductoID
      WHERE dp.PedidoID = $1`,
      [pedidoId]
    );

    res.json({
      success: true,
      data: {
        pedido: {
          pedidoId: pedido.pedidoid,
          fechaPedido: pedido.fechapedido,
          estatus: pedido.estatus,
          montoTotal: parseFloat(pedido.montototal),
          costoEnvio: pedido.costoenvio !== null ? parseFloat(pedido.costoenvio) : null,
          cliente: {
            nombre: `${pedido.clientenombre} ${pedido.clienteapellido}`,
            email: pedido.clienteemail,
            telefono: pedido.clientetelefono
          },
          agente: pedido.agentenombre ? {
            nombre: `${pedido.agentenombre} ${pedido.agenteapellido}`,
            codigo: pedido.codigoagente
          } : null,
          direccion: {
            calle: pedido.calle,
            numeroExterior: pedido.numeroext,
            numeroInterior: pedido.numeroint,
            colonia: pedido.colonia,
            ciudad: pedido.ciudad,
            estado: pedido.estado,
            codigoPostal: pedido.codigopostal,
            referencias: pedido.referencias
          }
        },
        productos: detallesResult.rows.map(row => ({
          detalleId: row.detalleid,
          productoId: row.productoid,
          varianteId: row.varianteid,
          nombre: row.nombreproducto,
          sku: row.sku,
          cantidadPaquetes: parseInt(row.cantidadpaquetes, 10),
          piezasPorPaquete: row.piezasporpaquete,
          precioPorPaquete: row.precioporpaquete ? parseFloat(row.precioporpaquete) : 0,
          precioUnitario: row.preciounitariocalculado ? parseFloat(row.preciounitariocalculado) : 0,
          piezasTotales: parseInt(row.piezastotales, 10),
          dimensiones: row.dimensiones || null,
          subtotal: row.precioporpaquete ? parseFloat((row.cantidadpaquetes || 0) * row.precioporpaquete) : 0
        }))
      }
    });

  } catch (error) {
    console.error('Error al obtener detalle del pedido:', error);
    res.status(500).json({
      success: false,
      message: 'Error en el servidor'
    });
  }
};

/**
 * ============================================
 * GESTIÓN DE PROVEEDORES
 * ============================================
 */

/**
 * Obtener todos los proveedores
 * GET /api/admin/proveedores
 */
const getAllProveedores = async (req, res) => {
  try {
    const query = `
      SELECT 
        ProveedorID,
        NombreEmpresa,
        ContactoNombre,
        Email,
        Telefono
      FROM Proveedores
      ORDER BY NombreEmpresa ASC
    `;

    const result = await db.query(query);

    res.json({
      success: true,
      message: 'Proveedores obtenidos exitosamente',
      data: {
        proveedores: result.rows,
        total: result.rows.length
      }
    });

  } catch (error) {
    console.error('Error al obtener proveedores:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener proveedores'
    });
  }
};

/**
 * Crear un nuevo proveedor
 * POST /api/admin/proveedores
 */
const crearProveedor = async (req, res) => {
  try {
    const { nombreEmpresa, contactoNombre, email, telefono } = req.body;

    // Validaciones
    if (!nombreEmpresa || nombreEmpresa.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'El nombre de la empresa es requerido'
      });
    }

    // Validar email si se proporciona
    if (email && email.trim() !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          message: 'El email no tiene un formato válido'
        });
      }
    }

    const query = `
      INSERT INTO Proveedores (NombreEmpresa, ContactoNombre, Email, Telefono)
      VALUES ($1, $2, $3, $4)
      RETURNING ProveedorID, NombreEmpresa, ContactoNombre, Email, Telefono
    `;

    const values = [
      nombreEmpresa.trim(),
      contactoNombre ? contactoNombre.trim() : null,
      email ? email.trim() : null,
      telefono ? telefono.trim() : null
    ];

    const result = await db.query(query, values);
    const nuevoProveedor = result.rows[0];

    console.log('✅ Proveedor creado:', nuevoProveedor);

    res.status(201).json({
      success: true,
      message: 'Proveedor creado exitosamente',
      data: {
        proveedor: nuevoProveedor
      }
    });

  } catch (error) {
    console.error('Error al crear proveedor:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear el proveedor'
    });
  }
};

/**
 * Actualizar un proveedor existente
 * PUT /api/admin/proveedores/:id
 */
const actualizarProveedor = async (req, res) => {
  try {
    const proveedorId = parseInt(req.params.id);
    const { nombreEmpresa, contactoNombre, email, telefono } = req.body;

    // Validaciones
    if (!nombreEmpresa || nombreEmpresa.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'El nombre de la empresa es requerido'
      });
    }

    // Validar email si se proporciona
    if (email && email.trim() !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          message: 'El email no tiene un formato válido'
        });
      }
    }

    // Verificar que el proveedor existe
    const checkQuery = 'SELECT ProveedorID FROM Proveedores WHERE ProveedorID = $1';
    const checkResult = await db.query(checkQuery, [proveedorId]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Proveedor no encontrado'
      });
    }

    const query = `
      UPDATE Proveedores
      SET 
        NombreEmpresa = $1,
        ContactoNombre = $2,
        Email = $3,
        Telefono = $4
      WHERE ProveedorID = $5
      RETURNING ProveedorID, NombreEmpresa, ContactoNombre, Email, Telefono
    `;

    const values = [
      nombreEmpresa.trim(),
      contactoNombre ? contactoNombre.trim() : null,
      email ? email.trim() : null,
      telefono ? telefono.trim() : null,
      proveedorId
    ];

    const result = await db.query(query, values);
    const proveedorActualizado = result.rows[0];

    console.log('✅ Proveedor actualizado:', proveedorActualizado);

    res.json({
      success: true,
      message: 'Proveedor actualizado exitosamente',
      data: {
        proveedor: proveedorActualizado
      }
    });

  } catch (error) {
    console.error('Error al actualizar proveedor:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar el proveedor'
    });
  }
};

/**
 * ============================================
 * GESTIÓN DE ÓRDENES DE COMPRA
 * ============================================
 */

/**
 * Obtener todas las órdenes de compra (con filtro por estatus)
 * GET /api/admin/ordenes-compra
 */
const getAllOrdenesCompra = async (req, res) => {
  try {
    const { estatus } = req.query;

    let query = `
      SELECT 
        oc.OrdenCompraID,
        oc.ProveedorID,
        oc.FechaCreacion,
        oc.FechaEntregaEsperada,
        oc.Estatus,
        p.NombreEmpresa as ProveedorNombre,
        COUNT(doc.DetalleOC_ID) as TotalProductos
      FROM OrdenesDeCompra oc
      INNER JOIN Proveedores p ON oc.ProveedorID = p.ProveedorID
      LEFT JOIN DetallesOrdenCompra doc ON oc.OrdenCompraID = doc.OrdenCompraID
    `;

    const values = [];
    
    // Filtrar por estatus si se proporciona
    if (estatus) {
      if (estatus === 'Pendiente,Parcial') {
        query += ` WHERE oc.Estatus IN ('Pendiente', 'Parcial')`;
      } else {
        query += ` WHERE oc.Estatus = $1`;
        values.push(estatus);
      }
    }

    query += `
      GROUP BY oc.OrdenCompraID, oc.ProveedorID, oc.FechaCreacion, 
               oc.FechaEntregaEsperada, oc.Estatus, p.NombreEmpresa
      ORDER BY oc.FechaCreacion DESC
    `;

    const result = await db.query(query, values);

    res.json({
      success: true,
      message: 'Órdenes de compra obtenidas exitosamente',
      data: {
        ordenes: result.rows.map(row => ({
          ordenCompraId: row.ordencompraid,
          proveedorId: row.proveedorid,
          proveedorNombre: row.proveedornombre,
          fechaCreacion: row.fechacreacion,
          fechaEntregaEsperada: row.fechaentregaesperada,
          estatus: row.estatus,
          totalProductos: parseInt(row.totalproductos)
        })),
        total: result.rows.length
      }
    });

  } catch (error) {
    console.error('Error al obtener órdenes de compra:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener órdenes de compra'
    });
  }
};

/**
 * Obtener detalles de una orden de compra específica
 * GET /api/admin/ordenes-compra/:id/detalles
 */
const getDetallesOrdenCompra = async (req, res) => {
  try {
    const ordenCompraId = parseInt(req.params.id);

    // Obtener información de la orden
    const ordenQuery = `
      SELECT 
        oc.OrdenCompraID,
        oc.ProveedorID,
        oc.FechaCreacion,
        oc.FechaEntregaEsperada,
        oc.Estatus,
        p.NombreEmpresa as ProveedorNombre,
        p.ContactoNombre as ProveedorContacto
      FROM OrdenesDeCompra oc
      INNER JOIN Proveedores p ON oc.ProveedorID = p.ProveedorID
      WHERE oc.OrdenCompraID = $1
    `;

    const ordenResult = await db.query(ordenQuery, [ordenCompraId]);

    if (ordenResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Orden de compra no encontrada'
      });
    }

    const orden = ordenResult.rows[0];

    // Obtener detalles de productos
    const detallesQuery = `
      SELECT 
        doc.DetalleOC_ID,
        doc.OrdenCompraID,
        doc.VarianteID,
        doc.CantidadSolicitada,
        doc.CantidadRecibida,
        pv.ProductoID,
        pv.SKU,
        pv.Dimensiones,
        pv.MedidaID,
        COALESCE(pv.Stock, 0) AS StockVariante,
        pr.NombreProducto
      FROM DetallesOrdenCompra doc
      INNER JOIN Producto_Variantes pv ON doc.VarianteID = pv.VarianteID
      INNER JOIN Productos pr ON pv.ProductoID = pr.ProductoID
      WHERE doc.OrdenCompraID = $1
      ORDER BY pr.NombreProducto ASC
    `;

    const detallesResult = await db.query(detallesQuery, [ordenCompraId]);

    res.json({
      success: true,
      message: 'Detalles obtenidos exitosamente',
      data: {
        orden: {
          ordenCompraId: orden.ordencompraid,
          proveedorId: orden.proveedorid,
          proveedorNombre: orden.proveedornombre,
          proveedorContacto: orden.proveedorcontacto,
          fechaCreacion: orden.fechacreacion,
          fechaEntregaEsperada: orden.fechaentregaesperada,
          estatus: orden.estatus
        },
        detalles: detallesResult.rows.map(row => ({
          detalleId: row.detalleoc_id,
          ordenCompraId: row.ordencompraid,
          varianteId: row.varianteid,
          productoId: row.productoid,
          nombreProducto: row.nombreproducto,
          sku: row.sku,
          dimensiones: row.dimensiones,
          medidaId: row.medidaid,
          cantidadSolicitada: row.cantidadsolicitada,
          cantidadRecibida: row.cantidadrecibida,
          cantidadPendiente: row.cantidadsolicitada - row.cantidadrecibida,
          stockVariante: row.stockvariante
        }))
      }
    });

  } catch (error) {
    console.error('Error al obtener detalles de orden de compra:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener detalles de la orden de compra'
    });
  }
};

/**
 * Recibir inventario de una orden de compra
 * POST /api/admin/ordenes-compra/recibir
 */
const recibirInventario = async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    const { ordenCompraId, productos, adminId } = req.body;

    // Validaciones
    if (!ordenCompraId) {
      return res.status(400).json({
        success: false,
        message: 'El ID de la orden de compra es requerido'
      });
    }

    if (!productos || !Array.isArray(productos) || productos.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Debe incluir al menos un producto para recibir'
      });
    }

    // Validar cada producto
    for (const producto of productos) {
      if (!producto.detalleId || producto.cantidadRecibidaAhora === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Cada producto debe tener detalleId y cantidadRecibidaAhora'
        });
      }

      if (producto.cantidadRecibidaAhora < 0) {
        return res.status(400).json({
          success: false,
          message: 'La cantidad recibida no puede ser negativa'
        });
      }
    }

    // Iniciar transacción
    await client.query('BEGIN');

    // Verificar que la orden existe
    const ordenCheck = await client.query(
      'SELECT OrdenCompraID, Estatus FROM OrdenesDeCompra WHERE OrdenCompraID = $1',
      [ordenCompraId]
    );

    if (ordenCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Orden de compra no encontrada'
      });
    }

    const productosActualizados = [];

    // Procesar cada producto
    for (const producto of productos) {
      const cantidadRecibida = parseInt(producto.cantidadRecibidaAhora, 10);

      if (cantidadRecibida === 0) {
        continue; // Saltar si no se recibió nada
      }

      // 1. Obtener información del detalle actual
      const detalleQuery = `
        SELECT 
          doc.DetalleOC_ID,
          doc.VarianteID,
          doc.CantidadSolicitada,
          doc.CantidadRecibida,
          pv.ProductoID,
          pv.SKU,
          pv.Dimensiones,
          pv.MedidaID,
          pv.Stock AS StockVariante,
          pr.NombreProducto
        FROM DetallesOrdenCompra doc
        INNER JOIN Producto_Variantes pv ON doc.VarianteID = pv.VarianteID
        INNER JOIN Productos pr ON pv.ProductoID = pr.ProductoID
        WHERE doc.DetalleOC_ID = $1 AND doc.OrdenCompraID = $2
      `;

      const detalleResult = await client.query(detalleQuery, [producto.detalleId, ordenCompraId]);

      if (detalleResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: `Detalle ${producto.detalleId} no encontrado en esta orden`
        });
      }

      const detalle = detalleResult.rows[0];
      const nuevaCantidadRecibida = detalle.cantidadrecibida + cantidadRecibida;

      // Validar que no se exceda la cantidad solicitada
      if (nuevaCantidadRecibida > detalle.cantidadsolicitada) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `No puede recibir más de lo solicitado para ${detalle.nombreproducto}. Solicitado: ${detalle.cantidadsolicitada}, Ya recibido: ${detalle.cantidadrecibida}`
        });
      }

      // 2. Actualizar CantidadRecibida en DetallesOrdenCompra
      await client.query(
        `UPDATE DetallesOrdenCompra 
         SET CantidadRecibida = CantidadRecibida + $1 
         WHERE DetalleOC_ID = $2`,
        [cantidadRecibida, producto.detalleId]
      );

      // 3. Actualizar Stock en la variante seleccionada
      const nuevoStockVariante = (detalle.stockvariante || 0) + cantidadRecibida;
      await client.query(
        `UPDATE Producto_Variantes 
         SET Stock = COALESCE(Stock, 0) + $1 
         WHERE VarianteID = $2`,
        [cantidadRecibida, detalle.varianteid]
      );

      // 4. Registrar movimiento en Log_Inventario
      await client.query(
        `INSERT INTO Log_Inventario 
         (VarianteID, CantidadCambiado, NuevoStock, Motivo, UsuarioID) 
         VALUES ($1, $2, $3, $4, $5)`,
        [
          detalle.varianteid,
          cantidadRecibida,
          nuevoStockVariante,
          `Recepción de OC #${ordenCompraId}`,
          adminId || null
        ]
      );

      productosActualizados.push({
        productoId: detalle.productoid,
        varianteId: detalle.varianteid,
        nombreProducto: detalle.nombreproducto,
        sku: detalle.sku,
        medidaId: detalle.medidaid,
        dimensiones: detalle.dimensiones,
        cantidadRecibidaAhora: cantidadRecibida,
        cantidadRecibidaTotal: nuevaCantidadRecibida,
        cantidadSolicitada: detalle.cantidadsolicitada,
        stockVariante: nuevoStockVariante
      });
    }

    // 5. Actualizar el Estatus de la OrdenDeCompra
    // Obtener suma total de solicitado vs recibido
    const estatusQuery = `
      SELECT 
        SUM(CantidadSolicitada) as TotalSolicitado,
        SUM(CantidadRecibida) as TotalRecibido
      FROM DetallesOrdenCompra
      WHERE OrdenCompraID = $1
    `;

    const estatusResult = await client.query(estatusQuery, [ordenCompraId]);
    const { totalsolicitado, totalrecibido } = estatusResult.rows[0];

    let nuevoEstatus;
    if (parseInt(totalrecibido) >= parseInt(totalsolicitado)) {
      nuevoEstatus = 'Completada';
    } else if (parseInt(totalrecibido) > 0) {
      nuevoEstatus = 'Parcial';
    } else {
      nuevoEstatus = 'Pendiente';
    }

    await client.query(
      'UPDATE OrdenesDeCompra SET Estatus = $1 WHERE OrdenCompraID = $2',
      [nuevoEstatus, ordenCompraId]
    );

    // Commit de la transacción
    await client.query('COMMIT');

    console.log('✅ Inventario recibido:', {
      ordenCompraId,
      productosActualizados: productosActualizados.length,
      nuevoEstatus
    });

    res.json({
      success: true,
      message: 'Inventario recibido exitosamente',
      data: {
        ordenCompraId,
        nuevoEstatus,
        productosActualizados,
        totalSolicitado: parseInt(totalsolicitado),
        totalRecibido: parseInt(totalrecibido)
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al recibir inventario:', error);
    res.status(500).json({
      success: false,
      message: 'Error al recibir el inventario'
    });
  } finally {
    client.release();
  }
};

/**
 * Crear una nueva orden de compra
 * POST /api/admin/ordenes-compra
 */
const crearOrdenCompra = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const { proveedorId, fechaEntregaEsperada, productos } = req.body;

    // Validaciones
    if (!proveedorId) {
      return res.status(400).json({
        success: false,
        message: 'El proveedor es requerido'
      });
    }

    if (!fechaEntregaEsperada) {
      return res.status(400).json({
        success: false,
        message: 'La fecha de entrega esperada es requerida'
      });
    }

    if (!productos || !Array.isArray(productos) || productos.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Debe incluir al menos un producto'
      });
    }

    // Validar cada producto
    for (const producto of productos) {
      if (!producto.varianteId || !producto.cantidadSolicitada) {
        return res.status(400).json({
          success: false,
          message: 'Cada producto debe tener varianteId y cantidadSolicitada'
        });
      }

      if (producto.cantidadSolicitada <= 0) {
        return res.status(400).json({
          success: false,
          message: 'La cantidad solicitada debe ser mayor a 0'
        });
      }
    }

    // Verificar que el proveedor existe
    const proveedorCheck = await client.query(
      'SELECT ProveedorID FROM Proveedores WHERE ProveedorID = $1',
      [proveedorId]
    );

    if (proveedorCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Proveedor no encontrado'
      });
    }

    // Iniciar transacción
    await client.query('BEGIN');

    // 1. Crear la orden de compra
    const ordenQuery = `
      INSERT INTO OrdenesDeCompra (ProveedorID, FechaEntregaEsperada, Estatus)
      VALUES ($1, $2, 'Pendiente')
      RETURNING OrdenCompraID, ProveedorID, FechaCreacion, FechaEntregaEsperada, Estatus
    `;

    const ordenResult = await client.query(ordenQuery, [
      proveedorId,
      fechaEntregaEsperada
    ]);

    const ordenCompra = ordenResult.rows[0];
    const ordenCompraId = ordenCompra.ordencompraid;

    // 2. Insertar los detalles de la orden (productos)
    const detallesInsertados = [];

    for (const producto of productos) {
      // Verificar que la variante existe
      const varianteResult = await client.query(
        `SELECT pv.VarianteID, pv.ProductoID, pv.SKU, pv.Dimensiones, pv.MedidaID, pr.NombreProducto
         FROM Producto_Variantes pv
         INNER JOIN Productos pr ON pv.ProductoID = pr.ProductoID
         WHERE pv.VarianteID = $1`,
        [producto.varianteId]
      );

      if (varianteResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: `Variante con ID ${producto.varianteId} no encontrada`
        });
      }

      const variante = varianteResult.rows[0];

      if (producto.productoId && producto.productoId !== variante.productoid) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'La variante seleccionada no pertenece al producto indicado'
        });
      }

      const detalleQuery = `
        INSERT INTO DetallesOrdenCompra (OrdenCompraID, VarianteID, CantidadSolicitada, CantidadRecibida)
        VALUES ($1, $2, $3, 0)
        RETURNING DetalleOC_ID, VarianteID, CantidadSolicitada, CantidadRecibida
      `;

      const detalleResult = await client.query(detalleQuery, [
        ordenCompraId,
        variante.varianteid,
        producto.cantidadSolicitada
      ]);

      detallesInsertados.push({
        detalleId: detalleResult.rows[0].detalleoc_id,
        varianteId: detalleResult.rows[0].varianteid,
        productoId: variante.productoid,
        nombreProducto: variante.nombreproducto,
        sku: variante.sku,
        medidaId: variante.medidaid,
        dimensiones: variante.dimensiones,
        cantidadSolicitada: detalleResult.rows[0].cantidadsolicitada,
        cantidadRecibida: detalleResult.rows[0].cantidadrecibida
      });
    }

    // Commit de la transacción
    await client.query('COMMIT');

    console.log('✅ Orden de compra creada:', {
      ordenCompraId,
      proveedorId,
      totalProductos: detallesInsertados.length
    });

    res.status(201).json({
      success: true,
      message: 'Orden de compra creada exitosamente',
      data: {
        ordenCompra: {
          ordenCompraId: ordenCompraId,
          proveedorId: ordenCompra.proveedorid,
          fechaCreacion: ordenCompra.fechacreacion,
          fechaEntregaEsperada: ordenCompra.fechaentregaesperada,
          estatus: ordenCompra.estatus
        },
        detalles: detallesInsertados
      }
    });

  } catch (error) {
    // Rollback en caso de error
    await client.query('ROLLBACK');
    console.error('Error al crear orden de compra:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear la orden de compra'
    });
  } finally {
    client.release();
  }
};

module.exports = {
  loginAdmin,
  verifyAdmin,
  getAdminProfile,
  refreshAdminToken,
  getDashboardStats,
  getAllPedidos,
  updateCostoEnvio,
  updatePedidoEstatus,
  getPedidoDetalle,
  crearProducto,
  ajustarInventario,
  getAllProductos,
  getCategorias,
  crearCategoria,
  actualizarCategoria,
  eliminarCategoria,
  getMedidas,
  crearVariante,
  crearAgente,
  getAllAgentes,
  getAgenteDetalle,
  desactivarAgente,
  getAllComisiones,
  pagarComision,
  getAllClientes,
  getClienteDetalle,
  actualizarEstadoCliente,
  getAllProveedores,
  crearProveedor,
  actualizarProveedor,
  getAllOrdenesCompra,
  getDetallesOrdenCompra,
  crearOrdenCompra,
  recibirInventario
};
