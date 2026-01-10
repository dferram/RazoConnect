const db = require('../db');

const mapDireccionRow = (row) => ({
  direccionId: row.direccionid,
  etiqueta: row.etiqueta,
  receptor: row.receptor,
  calle: row.calle,
  numeroExt: row.numeroext,
  numeroInt: row.numeroint,
  colonia: row.colonia,
  ciudad: row.ciudad,
  estadoId: row.estadoid !== null ? parseInt(row.estadoid, 10) : null,
  estadoNombre: row.estadonombre || null,
  estado: row.estadonombre || null,
  codigoPostal: row.codigopostal,
  telefonoContacto: row.telefonocontacto
});

const obtenerEstados = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT EstadoID, Nombre, Abreviatura
       FROM Estados
       ORDER BY Nombre ASC`
    );

    const estados = result.rows.map(row => ({
      estadoId: row.estadoid,
      nombre: row.nombre,
      abreviatura: row.abreviatura
    }));

    res.status(200).json({
      success: true,
      message: 'Estados obtenidos exitosamente',
      data: {
        estados,
        total: estados.length
      }
    });
  } catch (error) {
    console.error('Error al obtener estados:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener los estados',
      error: error.message
    });
  }
};

/**
 * Obtener todas las direcciones del cliente logueado
 * GET /api/direcciones
 */
const obtenerDirecciones = async (req, res) => {
  try {
    const clienteId = req.user.userId;
    const tenant_id = req.tenant?.tenant_id || req.user?.tenantId || 1;

    const query = `
      SELECT 
        cd.DireccionID,
        cd.Etiqueta,
        cd.Receptor,
        cd.Calle,
        cd.NumeroExt,
        cd.NumeroInt,
        cd.Colonia,
        cd.Ciudad,
        cd.EstadoID,
        cd.CodigoPostal,
        cd.TelefonoContacto,
        e.Nombre AS EstadoNombre
      FROM Cliente_Direcciones cd
      LEFT JOIN Estados e ON cd.EstadoID = e.EstadoID
      INNER JOIN Clientes c ON cd.ClienteID = c.ClienteID
      WHERE cd.ClienteID = $1 AND c.tenant_id = $2
      ORDER BY cd.DireccionID DESC
    `;

    const result = await db.query(query, [clienteId, tenant_id]);

    const direcciones = result.rows.map(mapDireccionRow);

    res.status(200).json({
      success: true,
      message: 'Direcciones obtenidas exitosamente',
      data: {
        direcciones,
        total: direcciones.length
      }
    });

  } catch (error) {
    console.error('Error al obtener direcciones:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener las direcciones',
      error: error.message
    });
  }
};

/**
 * Crear una nueva dirección
 * POST /api/direcciones
 */
const crearDireccion = async (req, res) => {
  try {
    const clienteId = req.user.userId;
    const tenant_id = req.tenant?.tenant_id || req.user?.tenantId || 1;
    const {
      Etiqueta,
      Receptor,
      Calle,
      NumeroExt,
      NumeroInt,
      Colonia,
      Ciudad,
      EstadoID,
      CodigoPostal,
      TelefonoContacto
    } = req.body;

    // Validar campos requeridos
    const estadoId = parseInt(EstadoID, 10);

    if (!Receptor || !Calle || !Ciudad || Number.isNaN(estadoId) || !CodigoPostal) {
      return res.status(400).json({
        success: false,
        message: 'Receptor, Calle, Ciudad, EstadoID y Código Postal son requeridos'
      });
    }
    
    // CRÍTICO: Validar que el cliente pertenece al tenant
    const clienteCheck = await db.query(
      'SELECT ClienteID FROM Clientes WHERE ClienteID = $1 AND tenant_id = $2',
      [clienteId, tenant_id]
    );
    
    if (!clienteCheck.rows.length) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para crear direcciones para este cliente'
      });
    }

    const query = `
      INSERT INTO Cliente_Direcciones (
        ClienteID, Etiqueta, Receptor, Calle, NumeroExt, NumeroInt,
        Colonia, Ciudad, EstadoID, CodigoPostal, TelefonoContacto, tenant_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING DireccionID
    `;

    const insertResult = await db.query(query, [
      clienteId,
      Etiqueta || null,
      Receptor,
      Calle,
      NumeroExt || null,
      NumeroInt || null,
      Colonia || null,
      Ciudad,
      estadoId,
      CodigoPostal,
      TelefonoContacto || null,
      tenant_id
    ]);

    const direccionId = insertResult.rows[0].direccionid;

    const direccionResult = await db.query(
      `SELECT 
          cd.DireccionID,
          cd.Etiqueta,
          cd.Receptor,
          cd.Calle,
          cd.NumeroExt,
          cd.NumeroInt,
          cd.Colonia,
          cd.Ciudad,
          cd.EstadoID,
          cd.CodigoPostal,
          cd.TelefonoContacto,
          e.Nombre AS EstadoNombre
        FROM Cliente_Direcciones cd
        LEFT JOIN Estados e ON cd.EstadoID = e.EstadoID
        WHERE cd.DireccionID = $1`,
      [direccionId]
    );

    const direccion = direccionResult.rows[0];

    res.status(201).json({
      success: true,
      message: 'Dirección creada exitosamente',
      data: {
        direccion: {
          ...mapDireccionRow(direccion)
        }
      }
    });

  } catch (error) {
    console.error('Error al crear dirección:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear la dirección',
      error: error.message
    });
  }
};

module.exports = {
  obtenerEstados,
  obtenerDirecciones,
  crearDireccion
};
