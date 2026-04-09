/**
 * CLIENTES ADMIN CONTROLLER
 * 
 * Controlador especializado para la gestión de clientes.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * CARACTERÍSTICAS:
 * - Gestión completa de clientes (CRUD)
 * - Gestión de crédito de clientes
 * - Activación/desactivación de clientes
 * - Consulta de información de crédito
 * 
 * @module controllers/clientesAdminController
 * @author RazoConnect Team
 * @date 2026-02-26
 */

const db = require('../db');
const logger = require('../utils/logger');

/**
 * Obtener todos los clientes
 * 
 * @route GET /api/admin/clientes
 */
const getAllClientes = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;

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
      WHERE c.tenant_id = $1
      GROUP BY c.ClienteID
      ORDER BY c.FechaDeRegistro DESC`,
      [tenant_id]
    );

    res.json({
      success: true,
      data: {
        clientes: result.rows.map((row) => ({
          clienteId: row.clienteid,
          nombre: row.nombre,
          apellido: row.apellido,
          email: row.email,
          telefono: row.telefono,
          activo: row.activo,
          fechaRegistro: row.fechaderegistro,
          totalPedidos: parseInt(row.totalpedidos),
          montoTotalCompras: parseFloat(row.montototalcompras),
        })),
      },
    });
  } catch (error) {
    logger.error('Error al obtener clientes:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * Obtener detalle de un cliente
 * 
 * @route GET /api/admin/clientes/:id
 */
const getClienteDetalle = async (req, res) => {
  try {
    const clienteId = parseInt(req.params.id, 10);

    if (!Number.isInteger(clienteId) || clienteId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de cliente inválido",
      });
    }

    const { tenant_id } = req.tenant;

    // Get deterministic admin_id for this client based on their estado
    const estadosHelper = require('../utils/estadosHelper');
    const adminIdForClient = await estadosHelper.getAdminByClienteEstado(clienteId, tenant_id);

    const clienteResult = await db.query(
      `SELECT
        c.*,
        COUNT(DISTINCT p.pedidoid) as total_pedidos,
        COALESCE(SUM(p.montototal), 0) as monto_total_compras,
        cc.limite_credito,
        cc.saldo_deudor,
        cc.dias_gracia,
        cc.estado_credito,
        e.nombre as estado_nombre
      FROM clientes c
      LEFT JOIN pedidos p ON c.clienteid = p.clienteid AND p.tenant_id = $2
      LEFT JOIN cliente_creditos cc ON c.clienteid = cc.cliente_id
        AND cc.tenant_id = $2
        AND cc.admin_id = $3
      LEFT JOIN estados e ON c.estado_id = e.estadoid
      WHERE c.clienteid = $1 AND c.tenant_id = $2
      GROUP BY c.clienteid, cc.limite_credito, cc.saldo_deudor, cc.dias_gracia, cc.estado_credito, e.nombre`,
      [clienteId, tenant_id, adminIdForClient]
    );

    if (clienteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Cliente no encontrado",
      });
    }

    const cliente = clienteResult.rows[0];

    const pedidosResult = await db.query(
      `SELECT 
        pedidoid,
        fechapedido,
        montototal,
        estatus,
        direccionenvioid
      FROM pedidos
      WHERE clienteid = $1 AND tenant_id = $2
      ORDER BY fechapedido DESC
      LIMIT 50`,
      [clienteId, tenant_id]
    );

    const direccionesResult = await db.query(
      `SELECT 
        direccionid,
        receptor,
        calle,
        numeroext,
        numeroint,
        colonia,
        ciudad,
        estadoid,
        codigopostal,
        telefonocontacto,
        etiqueta
      FROM cliente_direcciones
      WHERE clienteid = $1 AND tenant_id = $2
      ORDER BY direccionid DESC`,
      [clienteId, tenant_id]
    );

    res.json({
      success: true,
      data: {
        clienteId: cliente.clienteid,
        nombre: cliente.nombre,
        apellido: cliente.apellido,
        email: cliente.email,
        telefono: cliente.telefono,
        activo: cliente.activo,
        estado_id: cliente.estado_id,
        estado_nombre: cliente.estado_nombre,
        fechaRegistro: cliente.fechaderegistro,
        totalPedidos: parseInt(cliente.total_pedidos),
        montoTotalCompras: parseFloat(cliente.monto_total_compras),
        credito: {
          limiteCredito: cliente.limite_credito ? parseFloat(cliente.limite_credito) : 0,
          saldoDeudor: cliente.saldo_deudor ? parseFloat(cliente.saldo_deudor) : 0,
          diasGracia: cliente.dias_gracia || 0,
          activo: cliente.estado_credito === 'ACTIVO',
        },
        pedidos: pedidosResult.rows.map(p => ({
          pedidoId: p.pedidoid,
          fechaPedido: p.fechapedido,
          montoTotal: parseFloat(p.montototal),
          estatus: p.estatus,
          direccionEnvioId: p.direccionenvioid
        })),
        direcciones: direccionesResult.rows.map(d => ({
          direccionId: d.direccionid,
          receptor: d.receptor,
          calle: d.calle,
          numeroExt: d.numeroext,
          numeroInt: d.numeroint,
          colonia: d.colonia,
          ciudad: d.ciudad,
          estadoId: d.estadoid,
          codigoPostal: d.codigopostal,
          telefonoContacto: d.telefonocontacto,
          etiqueta: d.etiqueta
        }))
      },
    });
  } catch (error) {
    logger.error('Error al obtener detalle del cliente:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * Actualizar estado activo de un cliente
 * 
 * @route PUT /api/admin/clientes/:id/estado
 */
const actualizarEstadoCliente = async (req, res) => {
  try {
    const clienteId = parseInt(req.params.id, 10);
    const { activo } = req.body;

    if (!Number.isInteger(clienteId) || clienteId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de cliente inválido",
      });
    }

    if (typeof activo !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: "El campo 'activo' debe ser un booleano",
      });
    }

    const { tenant_id } = req.tenant;

    const result = await db.query(
      `UPDATE clientes 
       SET activo = $1 
       WHERE clienteid = $2 AND tenant_id = $3
       RETURNING clienteid, nombre, apellido, activo`,
      [activo, clienteId, tenant_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Cliente no encontrado",
      });
    }

    console.log(`✅ [CLIENTE] Estado actualizado: Cliente ${clienteId} → ${activo ? 'Activo' : 'Inactivo'}`);

    res.json({
      success: true,
      message: `Cliente ${activo ? 'activado' : 'desactivado'} exitosamente`,
      data: {
        clienteId: result.rows[0].clienteid,
        nombre: result.rows[0].nombre,
        apellido: result.rows[0].apellido,
        activo: result.rows[0].activo,
      },
    });
  } catch (error) {
    logger.error('Error al actualizar estado del cliente:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * Actualizar configuración de crédito de un cliente
 * 
 * @route PUT /api/admin/clientes/:id/credito
 */
const actualizarCreditoCliente = async (req, res) => {
  try {
    const clienteId = parseInt(req.params.id, 10);
    const { limiteCredito, diasGracia, activo } = req.body;
    const adminId = req.user?.admin_responsable_id ?? req.user?.adminid;

    if (!Number.isInteger(clienteId) || clienteId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de cliente inválido",
      });
    }

    const { tenant_id } = req.tenant;

    // Verificar que el cliente existe
    const clienteCheck = await db.query(
      "SELECT clienteid FROM clientes WHERE clienteid = $1 AND tenant_id = $2",
      [clienteId, tenant_id]
    );

    if (clienteCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Cliente no encontrado",
      });
    }

    // Upsert en cliente_creditos - ⚠️ CRITICAL: Include admin_id
    const estadoCredito = activo !== undefined ? (activo ? 'ACTIVO' : 'INACTIVO') : 'ACTIVO';
    const result = await db.query(
      `INSERT INTO cliente_creditos (cliente_id, limite_credito, dias_gracia, estado_credito, tenant_id, admin_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (cliente_id, tenant_id, admin_id)
       DO UPDATE SET
         limite_credito = $2,
         dias_gracia = $3,
         estado_credito = $4,
         ultima_actualizacion = NOW()
       RETURNING *`,
      [
        clienteId,
        limiteCredito || 0,
        diasGracia || 0,
        estadoCredito,
        tenant_id,
        adminId
      ]
    );

    console.log(`✅ [CRÉDITO] Configuración actualizada: Cliente ${clienteId}`);

    res.json({
      success: true,
      message: "Configuración de crédito actualizada exitosamente",
      data: {
        clienteId: result.rows[0].cliente_id,
        limiteCredito: parseFloat(result.rows[0].limite_credito),
        saldoDeudor: parseFloat(result.rows[0].saldo_deudor || 0),
        diasGracia: result.rows[0].dias_gracia,
        activo: result.rows[0].estado_credito === 'ACTIVO',
      },
    });
  } catch (error) {
    logger.error('Error al actualizar crédito del cliente:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * Obtener información de crédito de un cliente
 * 
 * @route GET /api/admin/clientes/:id/credito
 */
const getClienteCreditoInfo = async (req, res) => {
  try {
    const clienteId = parseInt(req.params.id, 10);
    const { tenant_id } = req.tenant;
    const estadosHelper = require('../utils/estadosHelper');

    if (!Number.isInteger(clienteId) || clienteId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de cliente inválido",
      });
    }

    // Get admin_id for this client
    const adminIdForClient = await estadosHelper.getAdminByClienteEstado(clienteId, tenant_id);

    const result = await db.query(
      `SELECT
        cc.*,
        c.nombre,
        c.apellido,
        c.email
      FROM cliente_creditos cc
      INNER JOIN clientes c ON cc.cliente_id = c.clienteid
      WHERE cc.cliente_id = $1 AND cc.tenant_id = $2 AND cc.admin_id = $3`,
      [clienteId, tenant_id, adminIdForClient]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Cliente no tiene línea de crédito asignada",
      });
    }

    const credito = result.rows[0];
    const limiteCredito = parseFloat(credito.limite_credito || 0);
    const saldoDeudor = parseFloat(credito.saldo_deudor || 0);
    const creditoDisponible = limiteCredito - saldoDeudor;

    res.json({
      success: true,
      data: {
        clienteId: credito.cliente_id,
        nombre: credito.nombre,
        apellido: credito.apellido,
        email: credito.email,
        limiteCredito,
        saldoDeudor,
        diasGracia: credito.dias_gracia,
        activo: credito.estado_credito === 'ACTIVO',
        creditoDisponible: creditoDisponible > 0 ? creditoDisponible : 0,
        ultimaActualizacion: credito.ultima_actualizacion,
      },
    });
  } catch (error) {
    logger.error('Error al obtener información de crédito:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

module.exports = {
  getAllClientes,
  getClienteDetalle,
  actualizarEstadoCliente,
  actualizarCreditoCliente,
  getClienteCreditoInfo
};
