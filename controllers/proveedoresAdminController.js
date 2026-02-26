/**
 * PROVEEDORES ADMIN CONTROLLER
 * 
 * Controlador especializado para la gestión de proveedores.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * CARACTERÍSTICAS:
 * - Gestión completa de proveedores (CRUD)
 * - Gestión de reglas de empaque
 * - Solicitudes pendientes de aprobación
 * - Información fiscal y bancaria
 * 
 * @module controllers/proveedoresAdminController
 * @author RazoConnect Team
 * @date 2026-02-26
 */

const db = require('../db');

/**
 * Obtener todos los proveedores
 * 
 * @route GET /api/admin/proveedores
 */
const getAllProveedores = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;

    const query = `
      SELECT DISTINCT ON (proveedorid)
        proveedorid,
        nombreempresa,
        contactonombre,
        email,
        telefono,
        razonsocial,
        rfc,
        regimenfiscal,
        calle,
        colonia,
        codigopostal,
        ciudad,
        estado,
        nombrerepresentanteventas,
        celularventas,
        emailventas,
        nombrecontactocobranza,
        telefonocobranza,
        emailcobranza,
        banco,
        numerocuenta,
        clabe,
        referenciapago,
        diascredito,
        limitecredito,
        descuentofinanciero,
        minimocompra,
        aceptadevoluciones
      FROM proveedores
      WHERE tenant_id = $1
      ORDER BY proveedorid, nombreempresa ASC
    `;

    const result = await db.query(query, [tenant_id]);
    const proveedores = result.rows;

    res.json({
      success: true,
      message: "Proveedores obtenidos exitosamente",
      data: {
        proveedores,
        total: proveedores.length,
      },
    });
  } catch (error) {
    console.error("Error al obtener proveedores:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener proveedores",
      error: error.message
    });
  }
};

/**
 * Obtener proveedor por ID
 * 
 * @route GET /api/admin/proveedores/:id
 */
const getProveedorById = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;
    const proveedorId = Number.parseInt(req.params.id, 10);

    if (!Number.isInteger(proveedorId) || proveedorId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de proveedor inválido",
      });
    }

    const result = await db.query(
      `SELECT * FROM proveedores WHERE proveedorid = $1 AND tenant_id = $2`,
      [proveedorId, tenant_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Proveedor no encontrado",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error al obtener proveedor:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener proveedor",
      error: error.message,
    });
  }
};

/**
 * Crear un nuevo proveedor
 * 
 * @route POST /api/admin/proveedores
 */
const crearProveedor = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const {
      nombreEmpresa,
      contactoNombre,
      email,
      telefono,
      razonSocial,
      rfc,
      regimenFiscal,
      calle,
      colonia,
      cp,
      ciudad,
      estado,
      nombreRepresentanteVentas,
      celularVentas,
      emailVentas,
      nombreContactoCobranza,
      telefonoCobranza,
      emailCobranza,
      banco,
      numeroCuenta,
      clabe,
      referenciaPago,
      diasCredito,
      limiteCredito,
      descuentoFinanciero,
      minimoCompra,
      aceptaDevoluciones,
    } = req.body;

    const { tenant_id } = req.tenant;

    if (!nombreEmpresa) {
      return res.status(400).json({
        success: false,
        message: "El nombre de la empresa es obligatorio",
      });
    }

    await client.query("BEGIN");

    const insertQuery = `
      INSERT INTO Proveedores (
        NombreEmpresa, ContactoNombre, Email, Telefono, RazonSocial, RFC, RegimenFiscal,
        Calle, Colonia, CodigoPostal, Ciudad, Estado,
        NombreRepresentanteVentas, CelularVentas, EmailVentas,
        NombreContactoCobranza, TelefonoCobranza, EmailCobranza,
        Banco, NumeroCuenta, CLABE, ReferenciaPago,
        DiasCredito, LimiteCredito, DescuentoFinanciero, MinimoCompra, AceptaDevoluciones,
        tenant_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
      RETURNING ProveedorID, NombreEmpresa
    `;

    const values = [
      nombreEmpresa,
      contactoNombre || null,
      email || null,
      telefono || null,
      razonSocial || null,
      rfc || null,
      regimenFiscal || null,
      calle || null,
      colonia || null,
      cp || null,
      ciudad || null,
      estado || null,
      nombreRepresentanteVentas || null,
      celularVentas || null,
      emailVentas || null,
      nombreContactoCobranza || null,
      telefonoCobranza || null,
      emailCobranza || null,
      banco || null,
      numeroCuenta || null,
      clabe || null,
      referenciaPago || null,
      diasCredito || 0,
      limiteCredito || 0,
      descuentoFinanciero || 0,
      minimoCompra || 0,
      aceptaDevoluciones !== undefined ? aceptaDevoluciones : true,
      tenant_id,
    ];

    const result = await client.query(insertQuery, values);

    await client.query("COMMIT");

    console.log(`✅ [PROVEEDOR] Creado: ${result.rows[0].nombreempresa} (ID: ${result.rows[0].proveedorid})`);

    res.status(201).json({
      success: true,
      message: "Proveedor creado exitosamente",
      data: {
        proveedorId: result.rows[0].proveedorid,
        nombreEmpresa: result.rows[0].nombreempresa,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al crear proveedor:", error);
    res.status(500).json({
      success: false,
      message: "Error al crear proveedor",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

/**
 * Actualizar un proveedor existente
 * 
 * @route PUT /api/admin/proveedores/:id
 */
const actualizarProveedor = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const proveedorId = Number.parseInt(req.params.id, 10);
    const { tenant_id } = req.tenant;

    if (!Number.isInteger(proveedorId) || proveedorId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de proveedor inválido",
      });
    }

    await client.query("BEGIN");

    const proveedorCheck = await client.query(
      "SELECT ProveedorID FROM Proveedores WHERE ProveedorID = $1 AND tenant_id = $2",
      [proveedorId, tenant_id]
    );

    if (proveedorCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Proveedor no encontrado",
      });
    }

    const {
      nombreEmpresa,
      contactoNombre,
      email,
      telefono,
      razonSocial,
      rfc,
      regimenFiscal,
      calle,
      colonia,
      cp,
      ciudad,
      estado,
      nombreRepresentanteVentas,
      celularVentas,
      emailVentas,
      nombreContactoCobranza,
      telefonoCobranza,
      emailCobranza,
      banco,
      numeroCuenta,
      clabe,
      referenciaPago,
      diasCredito,
      limiteCredito,
      descuentoFinanciero,
      minimoCompra,
      aceptaDevoluciones,
    } = req.body;

    const updateQuery = `
      UPDATE Proveedores
      SET
        NombreEmpresa = COALESCE($1, NombreEmpresa),
        ContactoNombre = COALESCE($2, ContactoNombre),
        Email = COALESCE($3, Email),
        Telefono = COALESCE($4, Telefono),
        RazonSocial = COALESCE($5, RazonSocial),
        RFC = COALESCE($6, RFC),
        RegimenFiscal = COALESCE($7, RegimenFiscal),
        Calle = COALESCE($8, Calle),
        Colonia = COALESCE($9, Colonia),
        CodigoPostal = COALESCE($10, CodigoPostal),
        Ciudad = COALESCE($11, Ciudad),
        Estado = COALESCE($12, Estado),
        NombreRepresentanteVentas = COALESCE($13, NombreRepresentanteVentas),
        CelularVentas = COALESCE($14, CelularVentas),
        EmailVentas = COALESCE($15, EmailVentas),
        NombreContactoCobranza = COALESCE($16, NombreContactoCobranza),
        TelefonoCobranza = COALESCE($17, TelefonoCobranza),
        EmailCobranza = COALESCE($18, EmailCobranza),
        Banco = COALESCE($19, Banco),
        NumeroCuenta = COALESCE($20, NumeroCuenta),
        CLABE = COALESCE($21, CLABE),
        ReferenciaPago = COALESCE($22, ReferenciaPago),
        DiasCredito = COALESCE($23, DiasCredito),
        LimiteCredito = COALESCE($24, LimiteCredito),
        DescuentoFinanciero = COALESCE($25, DescuentoFinanciero),
        MinimoCompra = COALESCE($26, MinimoCompra),
        AceptaDevoluciones = COALESCE($27, AceptaDevoluciones)
      WHERE ProveedorID = $28 AND tenant_id = $29
      RETURNING ProveedorID, NombreEmpresa
    `;

    const values = [
      nombreEmpresa,
      contactoNombre,
      email,
      telefono,
      razonSocial,
      rfc,
      regimenFiscal,
      calle,
      colonia,
      cp,
      ciudad,
      estado,
      nombreRepresentanteVentas,
      celularVentas,
      emailVentas,
      nombreContactoCobranza,
      telefonoCobranza,
      emailCobranza,
      banco,
      numeroCuenta,
      clabe,
      referenciaPago,
      diasCredito,
      limiteCredito,
      descuentoFinanciero,
      minimoCompra,
      aceptaDevoluciones,
      proveedorId,
      tenant_id,
    ];

    const result = await client.query(updateQuery, values);

    await client.query("COMMIT");

    console.log(`✅ [PROVEEDOR] Actualizado: ${result.rows[0].nombreempresa} (ID: ${proveedorId})`);

    res.json({
      success: true,
      message: "Proveedor actualizado exitosamente",
      data: {
        proveedorId: result.rows[0].proveedorid,
        nombreEmpresa: result.rows[0].nombreempresa,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al actualizar proveedor:", error);
    res.status(500).json({
      success: false,
      message: "Error al actualizar proveedor",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

module.exports = {
  getAllProveedores,
  getProveedorById,
  crearProveedor,
  actualizarProveedor
};
