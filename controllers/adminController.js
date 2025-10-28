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
       FROM Comisiones_Agentes 
       WHERE Estatus = 'Pendiente'`
    );

    // Productos con stock bajo (<=5)
    const productosStockBajo = await db.query(
      `SELECT COUNT(*) as total FROM Productos WHERE Stock <= 5 AND Activo = TRUE`
    );

    // Total de pedidos (para estadística general)
    const totalPedidos = await db.query(
      `SELECT COUNT(*) as total FROM Pedidos`
    );

    // Ingresos totales
    const ingresosTotales = await db.query(
      `SELECT COALESCE(SUM(MontoTotal), 0) as total FROM Pedidos`
    );

    // Clientes activos
    const clientesActivos = await db.query(
      `SELECT COUNT(*) as total FROM Clientes WHERE Activo = TRUE`
    );

    // Agentes activos
    const agentesActivos = await db.query(
      `SELECT COUNT(*) as total FROM Agentes WHERE Activo = TRUE`
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
        cd.Calle || ', ' || cd.Ciudad || ', ' || cd.Estado as DireccionCompleta,
        p.AgenteID,
        CASE 
          WHEN a.AgenteID IS NOT NULL THEN a.Nombre || ' ' || a.Apellido 
          ELSE NULL 
        END as AgenteNombre,
        (SELECT COUNT(*) FROM Pedido_Detalles pd WHERE pd.PedidoID = p.PedidoID) as TotalItems
      FROM Pedidos p
      INNER JOIN Clientes c ON p.ClienteID = c.ClienteID
      INNER JOIN Cliente_Direcciones cd ON p.DireccionEnvioID = cd.DireccionID
      LEFT JOIN Agentes a ON p.AgenteID = a.AgenteID
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
        'SELECT * FROM Pedido_Detalles WHERE PedidoID = $1',
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
        await client.query(
          `UPDATE Productos 
           SET Stock = Stock - $1 
           WHERE ProductoID = $2`,
          [cantidadRequerida, detalle.productoid]
        );

        // Crear registro en Log_Inventario
        await client.query(
          `INSERT INTO Log_Inventario (ProductoID, TipoMovimiento, Cantidad, Motivo, UsuarioID)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            detalle.productoid,
            'Salida',
            cantidadRequerida,
            `Pedido #${pedidoId} confirmado`,
            req.user.id // AdminID del usuario autenticado
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
      `INSERT INTO Log_Inventario (ProductoID, TipoMovimiento, Cantidad, Motivo, UsuarioID)
       VALUES ($1, $2, $3, $4, $5)`,
      [producto.productoid, 'Entrada', stock, 'Stock inicial del producto', req.user.id]
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
      'SELECT ProductoID, SKU, Nombre, Stock FROM Productos WHERE ProductoID = $1',
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

    // Determinar tipo de movimiento
    const tipoMovimiento = cantidadCambio > 0 ? 'Entrada' : 'Salida';
    const cantidadAbsoluta = Math.abs(cantidadCambio);

    // Crear registro en log de inventario
    await client.query(
      `INSERT INTO Log_Inventario (ProductoID, TipoMovimiento, Cantidad, Motivo, UsuarioID)
       VALUES ($1, $2, $3, $4, $5)`,
      [productoId, tipoMovimiento, cantidadAbsoluta, motivo, req.user.id]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Inventario ajustado exitosamente',
      data: {
        productoId,
        sku: producto.sku,
        nombre: producto.nombre,
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
        p.Nombre,
        p.Descripcion,
        p.CostoUnitario,
        p.PiezasPorPaquete,
        p.PrecioPaquete,
        p.Stock,
        p.ImagenURL,
        p.Activo,
        p.FechaCreacion,
        c.Nombre as CategoriaNombre
      FROM Productos p
      LEFT JOIN Categorias c ON p.CategoriaID = c.CategoriaID
      ORDER BY p.FechaCreacion DESC`
    );

    res.json({
      success: true,
      data: {
        productos: result.rows.map(row => ({
          productoId: row.productoid,
          sku: row.sku,
          nombre: row.nombre,
          descripcion: row.descripcion,
          costoUnitario: parseFloat(row.costounitario),
          piezasPorPaquete: row.piezasporpaquete,
          precioPaquete: parseFloat(row.preciopaquete),
          stock: row.stock,
          imagenUrl: row.imagenurl,
          activo: row.activo,
          fechaCreacion: row.fechacreacion,
          categoriaNombre: row.categorianombre
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
      'SELECT AgenteID FROM Agentes WHERE Email = $1',
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
      'SELECT AgenteID FROM Agentes WHERE CodigoAgente = $1',
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
      `INSERT INTO Agentes 
        (Nombre, Apellido, Email, Password, CodigoAgente, Telefono, Activo)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       RETURNING AgenteID, Nombre, Apellido, Email, CodigoAgente`,
      [nombre, apellido, email, hashedPassword, codigoAgente, telefono || null]
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
        a.Telefono,
        a.Activo,
        a.FechaCreacion,
        COUNT(DISTINCT p.PedidoID) as TotalVentas,
        COALESCE(SUM(p.MontoTotal), 0) as MontoTotalVentas,
        COALESCE(SUM(c.MontoComision), 0) as ComisionesTotales
      FROM Agentes a
      LEFT JOIN Pedidos p ON a.AgenteID = p.AgenteID
      LEFT JOIN Comisiones_Agentes c ON a.AgenteID = c.AgenteID
      GROUP BY a.AgenteID
      ORDER BY a.FechaCreacion DESC`
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
        AgenteID, Nombre, Apellido, Email, CodigoAgente, Telefono, Activo, FechaCreacion
      FROM Agentes
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
        Estatus,
        FechaGeneracion,
        FechaPago
      FROM Comisiones_Agentes
      WHERE AgenteID = $1
      ORDER BY FechaGeneracion DESC`,
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
          telefono: agente.telefono,
          activo: agente.activo,
          fechaCreacion: agente.fechacreacion
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
          estatus: row.estatus,
          fechaGeneracion: row.fechageneracion,
          fechaPago: row.fechapago
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
      `UPDATE Agentes 
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
        c.FechaGeneracion,
        c.FechaPago,
        p.MontoTotal as MontoVenta
      FROM Comisiones_Agentes c
      INNER JOIN Agentes a ON c.AgenteID = a.AgenteID
      INNER JOIN Pedidos p ON c.PedidoID = p.PedidoID
    `;

    const params = [];
    if (estatus) {
      query += ' WHERE c.Estatus = $1';
      params.push(estatus);
    }

    query += ' ORDER BY c.FechaGeneracion DESC';

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
          fechaGeneracion: row.fechageneracion,
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
      'SELECT * FROM Comisiones_Agentes WHERE ComisionID = $1',
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

    // Actualizar el estatus a Pagada y registrar fecha de pago
    const result = await db.query(
      `UPDATE Comisiones_Agentes 
       SET Estatus = 'Pagada', FechaPago = CURRENT_TIMESTAMP
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
        fechaPago: comisionActualizada.fechapago
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
        d.NumeroExterior,
        d.NumeroInterior,
        d.Colonia,
        d.Ciudad,
        d.Estado,
        d.CodigoPostal,
        d.Referencias
      FROM Pedidos p
      INNER JOIN Clientes c ON p.ClienteID = c.ClienteID
      LEFT JOIN Agentes a ON p.AgenteID = a.AgenteID
      LEFT JOIN Direcciones_Envio d ON p.DireccionEnvioID = d.DireccionID
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
        pr.Nombre as ProductoNombre,
        pr.SKU,
        pr.PiezasPorPaquete
      FROM Detalle_Pedidos dp
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
            numeroExterior: pedido.numeroexterior,
            numeroInterior: pedido.numerointerior,
            colonia: pedido.colonia,
            ciudad: pedido.ciudad,
            estado: pedido.estado,
            codigoPostal: pedido.codigopostal,
            referencias: pedido.referencias
          }
        },
        productos: detallesResult.rows.map(row => ({
          productoId: row.productoid,
          nombre: row.productonombre,
          sku: row.sku,
          cantidadPaquetes: row.cantidadpaquetes,
          piezasPorPaquete: row.piezasporpaquete,
          precioUnitario: parseFloat(row.preciounitario),
          subtotal: parseFloat(row.subtotal)
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

module.exports = {
  loginAdmin,
  verifyAdmin,
  getAdminProfile,
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
  getAllClientes
};
