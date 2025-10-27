const db = require('../db');

/**
 * Obtener todas las direcciones del cliente logueado
 * GET /api/direcciones
 */
const obtenerDirecciones = async (req, res) => {
  try {
    const clienteId = req.user.userId;

    const query = `
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

    const result = await db.query(query, [clienteId]);

    const direcciones = result.rows.map(row => ({
      direccionId: row.direccionid,
      etiqueta: row.etiqueta,
      receptor: row.receptor,
      calle: row.calle,
      numeroExt: row.numeroext,
      numeroInt: row.numeroint,
      colonia: row.colonia,
      ciudad: row.ciudad,
      estado: row.estado,
      codigoPostal: row.codigopostal,
      telefonoContacto: row.telefonocontacto
    }));

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
    const {
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
    } = req.body;

    // Validar campos requeridos
    if (!Receptor || !Calle || !Ciudad || !Estado || !CodigoPostal) {
      return res.status(400).json({
        success: false,
        message: 'Receptor, Calle, Ciudad, Estado y Código Postal son requeridos'
      });
    }

    const query = `
      INSERT INTO Cliente_Direcciones (
        ClienteID, Etiqueta, Receptor, Calle, NumeroExt, NumeroInt,
        Colonia, Ciudad, Estado, CodigoPostal, TelefonoContacto
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING DireccionID, Etiqueta, Receptor, Calle, NumeroExt, NumeroInt,
                Colonia, Ciudad, Estado, CodigoPostal, TelefonoContacto
    `;

    const result = await db.query(query, [
      clienteId,
      Etiqueta || null,
      Receptor,
      Calle,
      NumeroExt || null,
      NumeroInt || null,
      Colonia || null,
      Ciudad,
      Estado,
      CodigoPostal,
      TelefonoContacto || null
    ]);

    const direccion = result.rows[0];

    res.status(201).json({
      success: true,
      message: 'Dirección creada exitosamente',
      data: {
        direccion: {
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
  obtenerDirecciones,
  crearDireccion
};
