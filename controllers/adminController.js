const db = require('../db');
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

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }

    const admin = result.rows[0];

    // Verificar contraseña
    const isPasswordValid = await bcrypt.compare(password, admin.passwordhash);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }

    // Nota: La columna UltimoAcceso no existe en tu tabla, comentado por ahora
    // await db.query(
    //   'UPDATE Administradores SET UltimoAcceso = CURRENT_TIMESTAMP WHERE AdminID = $1',
    //   [admin.adminid]
    // );

    // Generar token JWT
    const token = jwt.sign(
      {
        id: admin.adminid,
        email: admin.email,
        rol: admin.rol,
        tipo: 'admin' // Identificador para diferenciar de tokens de clientes
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' } // Token válido por 8 horas
    );

    // Enviar respuesta
    res.json({
      success: true,
      message: 'Login exitoso',
      data: {
        token,
        admin: {
          adminId: admin.adminid,
          nombre: admin.nombre,
          email: admin.email,
          rol: admin.rol
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
 * Verificar token de admin
 * GET /api/admin/verify
 */
const verifyAdmin = async (req, res) => {
  try {
    // El middleware ya validó el token y agregó req.user
    const adminId = req.user.id;

    // Obtener datos actualizados del admin
    const result = await db.query(
      'SELECT AdminID, Nombre, Email, Rol FROM Administradores WHERE AdminID = $1 AND Activo = TRUE',
      [adminId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Administrador no encontrado'
      });
    }

    const admin = result.rows[0];

    res.json({
      success: true,
      data: {
        admin: {
          adminId: admin.adminid,
          nombre: admin.nombre,
          email: admin.email,
          rol: admin.rol
        }
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

    const result = await db.query(
      `SELECT 
        AdminID, 
        Nombre, 
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

    res.json({
      success: true,
      data: {
        adminId: admin.adminid,
        nombre: admin.nombre,
        email: admin.email,
        rol: admin.rol,
        fechaCreacion: admin.fechacreacion
      }
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
    const adminId = req.user.userId;
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

    // Productos con stock bajo (<=5)
    const productosStockBajo = await db.query(
      `SELECT COUNT(*) as total FROM Productos WHERE Stock <= 5`
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
      // Obtener los detalles del pedido
      const detallesResult = await client.query(
        'SELECT * FROM DetallesDelPedido WHERE PedidoID = $1',
        [pedidoId]
      );

      // Reducir stock de cada producto y crear log
      for (const detalle of detallesResult.rows) {
        // Verificar stock disponible
        const productoResult = await client.query(
          'SELECT Stock FROM Productos WHERE ProductoID = $1',
          [detalle.productoid]
        );

        if (productoResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: `Producto con ID ${detalle.productoid} no encontrado`
          });
        }

        const stockActual = productoResult.rows[0].stock;
        const cantidadRequerida = detalle.cantidadpaquetes;

        if (stockActual < cantidadRequerida) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: `Stock insuficiente para el producto ID ${detalle.productoid}. Stock actual: ${stockActual}, requerido: ${cantidadRequerida}`
          });
        }

        // Reducir stock
        const nuevoStock = stockActual - cantidadRequerida;
        await client.query(
          `UPDATE Productos 
           SET Stock = Stock - $1 
           WHERE ProductoID = $2`,
          [cantidadRequerida, detalle.productoid]
        );

        // Crear registro en Log_Inventario
        await client.query(
          `INSERT INTO Log_Inventario (ProductoID, CantidadCambiado, NuevoStock, Motivo, UsuarioID)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            detalle.productoid,
            -cantidadRequerida, // Negativo porque es una salida
            nuevoStock,
            `Pedido #${pedidoId} confirmado`,
            req.user.userId // AdminID del usuario autenticado
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
    const {
      sku,
      nombre,
      descripcion,
      costoUnitario,
      piezasPorPaquete,
      precioPaquete,
      stock,
      categoriaId,
      imagenUrl
    } = req.body;

    // Validaciones
    if (!sku || !nombre || !costoUnitario || !piezasPorPaquete || !precioPaquete || stock === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Todos los campos obligatorios deben ser proporcionados'
      });
    }

    // Verificar si el SKU ya existe
    const skuCheck = await db.query(
      'SELECT ProductoID FROM Productos WHERE SKU = $1',
      [sku]
    );

    if (skuCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'El SKU ya existe'
      });
    }

    // Insertar el producto
    const result = await db.query(
      `INSERT INTO Productos 
        (SKU, Nombre, Descripcion, CostoUnitario, PiezasPorPaquete, PrecioPaquete, Stock, CategoriaID, ImagenURL, Activo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)
       RETURNING *`,
      [sku, nombre, descripcion || null, costoUnitario, piezasPorPaquete, precioPaquete, stock, categoriaId || null, imagenUrl || null]
    );

    const producto = result.rows[0];

    // Registrar en log de inventario (entrada inicial)
    await db.query(
      `INSERT INTO Log_Inventario (ProductoID, CantidadCambiado, NuevoStock, Motivo, UsuarioID)
       VALUES ($1, $2, $3, $4, $5)`,
      [producto.productoid, stock, stock, 'Stock inicial del producto', req.user.userId]
    );

    res.status(201).json({
      success: true,
      message: 'Producto creado exitosamente',
      data: {
        productoId: producto.productoid,
        sku: producto.sku,
        nombre: producto.nombre,
        stock: producto.stock
      }
    });

  } catch (error) {
    console.error('Error al crear producto:', error);
    res.status(500).json({
      success: false,
      message: 'Error en el servidor',
      error: error.message
    });
  }
};

/**
 * Ajustar inventario manualmente
 * POST /api/admin/inventario/ajuste
 */
const ajustarInventario = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const { productoId, cantidadCambio, motivo } = req.body;

    // Validaciones
    if (!productoId || cantidadCambio === undefined || !motivo) {
      return res.status(400).json({
        success: false,
        message: 'ProductoID, cantidadCambio y motivo son requeridos'
      });
    }

    if (cantidadCambio === 0) {
      return res.status(400).json({
        success: false,
        message: 'La cantidad de cambio no puede ser cero'
      });
    }

    await client.query('BEGIN');

    // Verificar que el producto existe y obtener stock actual
    const productoResult = await client.query(
      'SELECT ProductoID, SKU, NombreProducto, Stock FROM Productos WHERE ProductoID = $1',
      [productoId]
    );

    if (productoResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Producto no encontrado'
      });
    }

    const producto = productoResult.rows[0];
    const stockActual = producto.stock;
    const nuevoStock = stockActual + cantidadCambio;

    // Validar que el stock no sea negativo
    if (nuevoStock < 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Stock insuficiente. Stock actual: ${stockActual}, cambio solicitado: ${cantidadCambio}`
      });
    }

    // Actualizar el stock
    await client.query(
      'UPDATE Productos SET Stock = Stock + $1 WHERE ProductoID = $2',
      [cantidadCambio, productoId]
    );

    // Crear registro en log de inventario
    await client.query(
      `INSERT INTO Log_Inventario (ProductoID, CantidadCambiado, NuevoStock, Motivo, UsuarioID)
       VALUES ($1, $2, $3, $4, $5)`,
      [productoId, cantidadCambio, nuevoStock, motivo, req.user.userId]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Inventario ajustado exitosamente',
      data: {
        productoId,
        sku: producto.sku,
        nombre: producto.nombreproducto,
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
        p.SKU,
        p.NombreProducto,
        p.Descripcion,
        p.CostoUnitario,
        p.PiezasPorPaquete,
        p.PrecioPaquete,
        p.Stock,
        p.CategoriaID
      FROM Productos p
      ORDER BY p.ProductoID DESC`
    );

    // Obtener categorías para mapear
    const categorias = await db.query('SELECT CategoriaID, Nombre FROM Categorias');
    const categoriasMap = {};
    categorias.rows.forEach(cat => {
      categoriasMap[cat.categoriaid] = cat.nombre;
    });

    res.json({
      success: true,
      data: {
        productos: result.rows.map(row => ({
          productoid: row.productoid,
          sku: row.sku,
          nombreproducto: row.nombreproducto,
          descripcion: row.descripcion,
          costounitario: parseFloat(row.costounitario),
          piezasporpaquete: row.piezasporpaquete,
          preciopaquete: parseFloat(row.preciopaquete),
          stockpaquetes: row.stock,
          categorianombre: categoriasMap[row.categoriaid] || 'Sin categoría'
        }))
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
      'SELECT CategoriaID, Nombre, Descripcion FROM Categorias ORDER BY Nombre'
    );

    res.json({
      success: true,
      data: {
        categorias: result.rows.map(row => ({
          categoriaId: row.categoriaid,
          nombre: row.nombre,
          descripcion: row.descripcion
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
        c.FechaCreacion,
        COUNT(DISTINCT p.PedidoID) as TotalPedidos,
        COALESCE(SUM(p.MontoTotal), 0) as MontoTotalCompras
      FROM Clientes c
      LEFT JOIN Pedidos p ON c.ClienteID = p.ClienteID
      GROUP BY c.ClienteID
      ORDER BY c.FechaCreacion DESC`
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
          fechaCreacion: row.fechacreacion,
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
        dp.*,
        pr.NombreProducto,
        pr.SKU,
        pr.PiezasPorPaquete,
        COALESCE(
          dp.PrecioUnitario, 
          ROUND(dp.PrecioPorPaquete / NULLIF((dp.PiezasTotales / NULLIF(dp.CantidadPaquetes, 0)), 0), 2)
        ) as PrecioUnitarioCalculado
      FROM DetallesDelPedido dp
      INNER JOIN Productos pr ON dp.ProductoID = pr.ProductoID
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
          productoId: row.productoid,
          nombre: row.nombreproducto,
          sku: row.sku,
          cantidadPaquetes: row.cantidadpaquetes,
          piezasPorPaquete: row.piezasporpaquete,
          precioPorPaquete: parseFloat(row.precioporpaquete),
          precioUnitario: parseFloat(row.preciounitariocalculado),
          piezasTotales: row.piezastotales,
          subtotal: parseFloat(row.cantidadpaquetes * row.precioporpaquete)
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
        doc.ProductoID,
        doc.CantidadSolicitada,
        doc.CantidadRecibida,
        pr.NombreProducto,
        pr.SKU,
        pr.StockPaquetes as StockActual
      FROM DetallesOrdenCompra doc
      INNER JOIN Productos pr ON doc.ProductoID = pr.ProductoID
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
          productoId: row.productoid,
          nombreProducto: row.nombreproducto,
          sku: row.sku,
          cantidadSolicitada: row.cantidadsolicitada,
          cantidadRecibida: row.cantidadrecibida,
          cantidadPendiente: row.cantidadsolicitada - row.cantidadrecibida,
          stockActual: row.stockactual
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
  const client = await db.getClient();
  
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
      const cantidadRecibida = parseInt(producto.cantidadRecibidaAhora);

      if (cantidadRecibida === 0) {
        continue; // Saltar si no se recibió nada
      }

      // 1. Obtener información del detalle actual
      const detalleQuery = `
        SELECT 
          doc.DetalleOC_ID,
          doc.ProductoID,
          doc.CantidadSolicitada,
          doc.CantidadRecibida,
          pr.NombreProducto,
          pr.StockPaquetes
        FROM DetallesOrdenCompra doc
        INNER JOIN Productos pr ON doc.ProductoID = pr.ProductoID
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

      // 3. Actualizar Stock en Productos
      const nuevoStock = detalle.stockpaquetes + cantidadRecibida;
      await client.query(
        `UPDATE Productos 
         SET StockPaquetes = StockPaquetes + $1 
         WHERE ProductoID = $2`,
        [cantidadRecibida, detalle.productoid]
      );

      // 4. Insertar en Log_Inventario
      await client.query(
        `INSERT INTO Log_Inventario 
         (ProductoID, CantidadCambiado, NuevoStock, Motivo, UsuarioID) 
         VALUES ($1, $2, $3, $4, $5)`,
        [
          detalle.productoid,
          cantidadRecibida,
          nuevoStock,
          `Recepción de OC #${ordenCompraId}`,
          adminId || null
        ]
      );

      productosActualizados.push({
        productoId: detalle.productoid,
        nombreProducto: detalle.nombreproducto,
        cantidadRecibidaAhora: cantidadRecibida,
        cantidadRecibidaTotal: nuevaCantidadRecibida,
        cantidadSolicitada: detalle.cantidadsolicitada,
        nuevoStock: nuevoStock
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
    // Rollback en caso de error
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
  const client = await db.getClient();
  
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
      if (!producto.productoId || !producto.cantidadSolicitada) {
        return res.status(400).json({
          success: false,
          message: 'Cada producto debe tener productoId y cantidadSolicitada'
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
      // Verificar que el producto existe
      const productoCheck = await client.query(
        'SELECT ProductoID, NombreProducto FROM Productos WHERE ProductoID = $1',
        [producto.productoId]
      );

      if (productoCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: `Producto con ID ${producto.productoId} no encontrado`
        });
      }

      // Insertar detalle
      const detalleQuery = `
        INSERT INTO DetallesOrdenCompra (OrdenCompraID, ProductoID, CantidadSolicitada, CantidadRecibida)
        VALUES ($1, $2, $3, 0)
        RETURNING DetalleOC_ID, ProductoID, CantidadSolicitada, CantidadRecibida
      `;

      const detalleResult = await client.query(detalleQuery, [
        ordenCompraId,
        producto.productoId,
        producto.cantidadSolicitada
      ]);

      detallesInsertados.push({
        ...detalleResult.rows[0],
        nombreProducto: productoCheck.rows[0].nombreproducto
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
        detalles: detallesInsertados.map(d => ({
          detalleId: d.detalleoc_id,
          productoId: d.productoid,
          nombreProducto: d.nombreProducto,
          cantidadSolicitada: d.cantidadsolicitada,
          cantidadRecibida: d.cantidadrecibida
        }))
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
  updatePedidoEstatus,
  getPedidoDetalle,
  crearProducto,
  ajustarInventario,
  getAllProductos,
  getCategorias,
  crearAgente,
  getAllAgentes,
  getAgenteDetalle,
  desactivarAgente,
  getAllComisiones,
  pagarComision,
  getAllClientes,
  getAllProveedores,
  crearProveedor,
  actualizarProveedor,
  getAllOrdenesCompra,
  getDetallesOrdenCompra,
  crearOrdenCompra,
  recibirInventario
};
