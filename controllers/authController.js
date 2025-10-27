const bcrypt = require('bcrypt');
const db = require('../db');
const { generateToken } = require('../utils/jwtHelper');
const { 
  validateClienteRegistro, 
  validateAgenteRegistro, 
  validateLogin 
} = require('../utils/validator');

/**
 * Registro de nuevo cliente
 * POST /api/registro/cliente
 */
const registroCliente = async (req, res) => {
  try {
    const { Nombre, Apellido, Email, Password, Telefono } = req.body;

    // Validar datos de entrada
    const validation = validateClienteRegistro({ Nombre, Apellido, Email, Password });
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: 'Error de validación',
        errors: validation.errors
      });
    }

    // Verificar si el email ya existe
    const emailExists = await db.query(
      'SELECT Email FROM Clientes WHERE Email = $1',
      [Email]
    );

    if (emailExists.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'El email ya está registrado'
      });
    }

    // Hashear la contraseña
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 10;
    const PasswordHash = await bcrypt.hash(Password, saltRounds);

    // Insertar nuevo cliente
    const result = await db.query(
      `INSERT INTO Clientes (Nombre, Apellido, Email, PasswordHash, Telefono)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ClienteID, Nombre, Apellido, Email, Telefono, FechaDeRegistro`,
      [Nombre, Apellido, Email, PasswordHash, Telefono || null]
    );

    const nuevoCliente = result.rows[0];

    // Generar token JWT
    const token = generateToken({
      userId: nuevoCliente.clienteid,
      rol: 'cliente',
      email: nuevoCliente.email
    });

    res.status(201).json({
      success: true,
      message: 'Cliente registrado exitosamente',
      data: {
        cliente: {
          clienteId: nuevoCliente.clienteid,
          nombre: nuevoCliente.nombre,
          apellido: nuevoCliente.apellido,
          email: nuevoCliente.email,
          telefono: nuevoCliente.telefono,
          fechaDeRegistro: nuevoCliente.fechaderegistro
        },
        token
      }
    });

  } catch (error) {
    console.error('Error en registro de cliente:', error);
    res.status(500).json({
      success: false,
      message: 'Error al registrar el cliente',
      error: error.message
    });
  }
};

/**
 * Registro de nuevo agente de ventas
 * POST /api/registro/agente
 */
const registroAgente = async (req, res) => {
  try {
    const { Nombre, Apellido, Email, Password, CodigoAgente } = req.body;

    // Validar datos de entrada
    const validation = validateAgenteRegistro({ Nombre, Apellido, Email, Password, CodigoAgente });
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: 'Error de validación',
        errors: validation.errors
      });
    }

    // Verificar si el email ya existe
    const emailExists = await db.query(
      'SELECT Email FROM AgentesDeVentas WHERE Email = $1',
      [Email]
    );

    if (emailExists.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'El email ya está registrado'
      });
    }

    // Verificar si el código de agente ya existe
    const codigoExists = await db.query(
      'SELECT CodigoAgente FROM AgentesDeVentas WHERE CodigoAgente = $1',
      [CodigoAgente]
    );

    if (codigoExists.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'El código de agente ya está registrado'
      });
    }

    // Hashear la contraseña
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 10;
    const PasswordHash = await bcrypt.hash(Password, saltRounds);

    // Insertar nuevo agente
    const result = await db.query(
      `INSERT INTO AgentesDeVentas (Nombre, Apellido, Email, PasswordHash, CodigoAgente, Activo)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING AgenteID, Nombre, Apellido, Email, CodigoAgente, Activo`,
      [Nombre, Apellido, Email, PasswordHash, CodigoAgente]
    );

    const nuevoAgente = result.rows[0];

    // Generar token JWT
    const token = generateToken({
      userId: nuevoAgente.agenteid,
      rol: 'agente',
      email: nuevoAgente.email,
      codigoAgente: nuevoAgente.codigoagente
    });

    res.status(201).json({
      success: true,
      message: 'Agente registrado exitosamente',
      data: {
        agente: {
          agenteId: nuevoAgente.agenteid,
          nombre: nuevoAgente.nombre,
          apellido: nuevoAgente.apellido,
          email: nuevoAgente.email,
          codigoAgente: nuevoAgente.codigoagente,
          activo: nuevoAgente.activo
        },
        token
      }
    });

  } catch (error) {
    console.error('Error en registro de agente:', error);
    res.status(500).json({
      success: false,
      message: 'Error al registrar el agente',
      error: error.message
    });
  }
};

/**
 * Login de usuario (cliente o agente)
 * POST /api/login
 */
const login = async (req, res) => {
  try {
    const { Email, Password } = req.body;

    // Validar datos de entrada
    const validation = validateLogin({ Email, Password });
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: 'Error de validación',
        errors: validation.errors
      });
    }

    // Buscar en la tabla de Clientes
    const clienteResult = await db.query(
      'SELECT ClienteID, Nombre, Apellido, Email, PasswordHash, Telefono FROM Clientes WHERE Email = $1',
      [Email]
    );

    if (clienteResult.rows.length > 0) {
      const cliente = clienteResult.rows[0];
      
      // Verificar contraseña
      const passwordMatch = await bcrypt.compare(Password, cliente.passwordhash);
      
      if (!passwordMatch) {
        return res.status(401).json({
          success: false,
          message: 'Credenciales inválidas'
        });
      }

      // Generar token JWT
      const token = generateToken({
        userId: cliente.clienteid,
        rol: 'cliente',
        email: cliente.email
      });

      return res.status(200).json({
        success: true,
        message: 'Login exitoso',
        data: {
          rol: 'cliente',
          usuario: {
            clienteId: cliente.clienteid,
            nombre: cliente.nombre,
            apellido: cliente.apellido,
            email: cliente.email,
            telefono: cliente.telefono
          },
          token
        }
      });
    }

    // Si no es cliente, buscar en la tabla de AgentesDeVentas
    const agenteResult = await db.query(
      'SELECT AgenteID, Nombre, Apellido, Email, PasswordHash, CodigoAgente, Activo FROM AgentesDeVentas WHERE Email = $1',
      [Email]
    );

    if (agenteResult.rows.length > 0) {
      const agente = agenteResult.rows[0];

      // Verificar si el agente está activo
      if (!agente.activo) {
        return res.status(403).json({
          success: false,
          message: 'La cuenta del agente está inactiva'
        });
      }
      
      // Verificar contraseña
      const passwordMatch = await bcrypt.compare(Password, agente.passwordhash);
      
      if (!passwordMatch) {
        return res.status(401).json({
          success: false,
          message: 'Credenciales inválidas'
        });
      }

      // Generar token JWT
      const token = generateToken({
        userId: agente.agenteid,
        rol: 'agente',
        email: agente.email,
        codigoAgente: agente.codigoagente
      });

      return res.status(200).json({
        success: true,
        message: 'Login exitoso',
        data: {
          rol: 'agente',
          usuario: {
            agenteId: agente.agenteid,
            nombre: agente.nombre,
            apellido: agente.apellido,
            email: agente.email,
            codigoAgente: agente.codigoagente,
            activo: agente.activo
          },
          token
        }
      });
    }

    // Si no se encontró ni como cliente ni como agente
    res.status(401).json({
      success: false,
      message: 'Credenciales inválidas'
    });

  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({
      success: false,
      message: 'Error al iniciar sesión',
      error: error.message
    });
  }
};

module.exports = {
  registroCliente,
  registroAgente,
  login
};
