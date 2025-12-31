const db = require("../db");

/**
 * Validar un cupón (Endpoint público)
 * POST /api/cupones/validar
 */
const validarCupon = async (req, res) => {
  try {
    const { codigo, subtotal } = req.body;

    if (!codigo || typeof codigo !== "string") {
      return res.status(400).json({
        success: false,
        message: "El código del cupón es requerido",
      });
    }

    const subtotalNum = parseFloat(subtotal);
    if (!Number.isFinite(subtotalNum) || subtotalNum <= 0) {
      return res.status(400).json({
        success: false,
        message: "El subtotal debe ser un número válido mayor a 0",
      });
    }

    const codigoUpper = codigo.trim().toUpperCase();

    const cuponResult = await db.query(
      `SELECT 
        cuponid,
        codigo,
        descripcion,
        tipo_descuento,
        valor,
        fecha_inicio,
        fecha_fin,
        uso_maximo,
        usos_actuales,
        activo,
        monto_minimo_compra
      FROM cupones
      WHERE UPPER(codigo) = $1`,
      [codigoUpper]
    );

    if (cuponResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "El cupón no existe",
      });
    }

    const cupon = cuponResult.rows[0];

    if (!cupon.activo) {
      return res.status(400).json({
        success: false,
        message: "Este cupón ya no está activo",
      });
    }

    const ahora = new Date();
    const fechaInicio = cupon.fecha_inicio ? new Date(cupon.fecha_inicio) : null;
    const fechaFin = cupon.fecha_fin ? new Date(cupon.fecha_fin) : null;

    if (fechaInicio && ahora < fechaInicio) {
      return res.status(400).json({
        success: false,
        message: "Este cupón aún no está disponible",
      });
    }

    if (fechaFin && ahora > fechaFin) {
      return res.status(400).json({
        success: false,
        message: "Este cupón ya expiró",
      });
    }

    const usoMaximo = cupon.uso_maximo ? parseInt(cupon.uso_maximo, 10) : null;
    const usosActuales = parseInt(cupon.usos_actuales || 0, 10);

    if (usoMaximo !== null && usosActuales >= usoMaximo) {
      return res.status(400).json({
        success: false,
        message: "Este cupón ha alcanzado su límite de usos",
      });
    }

    const montoMinimo = parseFloat(cupon.monto_minimo_compra || 0);
    if (subtotalNum < montoMinimo) {
      return res.status(400).json({
        success: false,
        message: `Este cupón requiere una compra mínima de $${montoMinimo.toFixed(2)}`,
      });
    }

    let montoDescuento = 0;
    const tipoDescuento = (cupon.tipo_descuento || "PORCENTAJE").toUpperCase();
    const valor = parseFloat(cupon.valor || 0);

    if (tipoDescuento === "PORCENTAJE") {
      montoDescuento = (subtotalNum * valor) / 100;
    } else if (tipoDescuento === "FIJO") {
      montoDescuento = valor;
    }

    montoDescuento = Math.min(montoDescuento, subtotalNum);
    montoDescuento = parseFloat(montoDescuento.toFixed(2));

    const nuevoTotal = parseFloat((subtotalNum - montoDescuento).toFixed(2));

    return res.status(200).json({
      success: true,
      message: "Cupón válido",
      data: {
        cuponId: cupon.cuponid,
        codigo: cupon.codigo,
        descripcion: cupon.descripcion,
        tipoDescuento: tipoDescuento,
        valor: valor,
        montoDescuento: montoDescuento,
        subtotal: subtotalNum,
        nuevoTotal: nuevoTotal,
      },
    });
  } catch (error) {
    console.error("Error al validar cupón:", error);
    return res.status(500).json({
      success: false,
      message: "Error al validar el cupón",
    });
  }
};

/**
 * Listar todos los cupones (Admin)
 * GET /api/admin/cupones
 */
const listarCupones = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
        cuponid,
        codigo,
        descripcion,
        tipo_descuento,
        valor,
        fecha_inicio,
        fecha_fin,
        uso_maximo,
        usos_actuales,
        activo,
        monto_minimo_compra
      FROM cupones
      ORDER BY cuponid DESC`
    );

    return res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("Error al listar cupones:", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener los cupones",
    });
  }
};

/**
 * Obtener un cupón por ID (Admin)
 * GET /api/admin/cupones/:id
 */
const obtenerCupon = async (req, res) => {
  try {
    const cuponId = parseInt(req.params.id, 10);

    if (!Number.isInteger(cuponId) || cuponId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de cupón inválido",
      });
    }

    const result = await db.query(
      `SELECT 
        cuponid,
        codigo,
        descripcion,
        tipo_descuento,
        valor,
        fecha_inicio,
        fecha_fin,
        uso_maximo,
        usos_actuales,
        activo,
        monto_minimo_compra
      FROM cupones
      WHERE cuponid = $1`,
      [cuponId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Cupón no encontrado",
      });
    }

    return res.status(200).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error al obtener cupón:", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener el cupón",
    });
  }
};

/**
 * Crear un nuevo cupón (Admin)
 * POST /api/admin/cupones
 */
const crearCupon = async (req, res) => {
  try {
    const {
      codigo,
      descripcion,
      tipoDescuento,
      valor,
      fechaInicio,
      fechaFin,
      usoMaximo,
      montoMinimoCompra,
    } = req.body;

    if (!codigo || typeof codigo !== "string" || !codigo.trim()) {
      return res.status(400).json({
        success: false,
        message: "El código del cupón es requerido",
      });
    }

    const codigoUpper = codigo.trim().toUpperCase();

    const existeResult = await db.query(
      "SELECT cuponid FROM cupones WHERE UPPER(codigo) = $1",
      [codigoUpper]
    );

    if (existeResult.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Ya existe un cupón con ese código",
      });
    }

    const valorNum = parseFloat(valor);
    if (!Number.isFinite(valorNum) || valorNum <= 0) {
      return res.status(400).json({
        success: false,
        message: "El valor del descuento debe ser un número mayor a 0",
      });
    }

    const tipo = (tipoDescuento || "PORCENTAJE").toUpperCase();
    if (!["PORCENTAJE", "FIJO"].includes(tipo)) {
      return res.status(400).json({
        success: false,
        message: "El tipo de descuento debe ser PORCENTAJE o FIJO",
      });
    }

    if (tipo === "PORCENTAJE" && valorNum > 100) {
      return res.status(400).json({
        success: false,
        message: "El porcentaje de descuento no puede ser mayor a 100",
      });
    }

    const result = await db.query(
      `INSERT INTO cupones (
        codigo,
        descripcion,
        tipo_descuento,
        valor,
        fecha_inicio,
        fecha_fin,
        uso_maximo,
        monto_minimo_compra,
        activo
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
      RETURNING 
        cuponid,
        codigo,
        descripcion,
        tipo_descuento,
        valor,
        fecha_inicio,
        fecha_fin,
        uso_maximo,
        usos_actuales,
        activo,
        monto_minimo_compra`,
      [
        codigoUpper,
        descripcion || null,
        tipo,
        valorNum,
        fechaInicio || null,
        fechaFin || null,
        usoMaximo ? parseInt(usoMaximo, 10) : null,
        montoMinimoCompra ? parseFloat(montoMinimoCompra) : 0,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Cupón creado exitosamente",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error al crear cupón:", error);
    return res.status(500).json({
      success: false,
      message: "Error al crear el cupón",
    });
  }
};

/**
 * Actualizar un cupón (Admin)
 * PUT /api/admin/cupones/:id
 */
const actualizarCupon = async (req, res) => {
  try {
    const cuponId = parseInt(req.params.id, 10);

    if (!Number.isInteger(cuponId) || cuponId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de cupón inválido",
      });
    }

    const {
      codigo,
      descripcion,
      tipoDescuento,
      valor,
      fechaInicio,
      fechaFin,
      usoMaximo,
      montoMinimoCompra,
      activo,
    } = req.body;

    const existeResult = await db.query(
      "SELECT cuponid FROM cupones WHERE cuponid = $1",
      [cuponId]
    );

    if (existeResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Cupón no encontrado",
      });
    }

    if (codigo) {
      const codigoUpper = codigo.trim().toUpperCase();
      const duplicadoResult = await db.query(
        "SELECT cuponid FROM cupones WHERE UPPER(codigo) = $1 AND cuponid != $2",
        [codigoUpper, cuponId]
      );

      if (duplicadoResult.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Ya existe otro cupón con ese código",
        });
      }
    }

    if (valor !== undefined) {
      const valorNum = parseFloat(valor);
      if (!Number.isFinite(valorNum) || valorNum <= 0) {
        return res.status(400).json({
          success: false,
          message: "El valor del descuento debe ser un número mayor a 0",
        });
      }
    }

    if (tipoDescuento) {
      const tipo = tipoDescuento.toUpperCase();
      if (!["PORCENTAJE", "FIJO"].includes(tipo)) {
        return res.status(400).json({
          success: false,
          message: "El tipo de descuento debe ser PORCENTAJE o FIJO",
        });
      }
    }

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (codigo !== undefined) {
      updates.push(`codigo = $${paramCount++}`);
      values.push(codigo.trim().toUpperCase());
    }
    if (descripcion !== undefined) {
      updates.push(`descripcion = $${paramCount++}`);
      values.push(descripcion || null);
    }
    if (tipoDescuento !== undefined) {
      updates.push(`tipo_descuento = $${paramCount++}`);
      values.push(tipoDescuento.toUpperCase());
    }
    if (valor !== undefined) {
      updates.push(`valor = $${paramCount++}`);
      values.push(parseFloat(valor));
    }
    if (fechaInicio !== undefined) {
      updates.push(`fecha_inicio = $${paramCount++}`);
      values.push(fechaInicio || null);
    }
    if (fechaFin !== undefined) {
      updates.push(`fecha_fin = $${paramCount++}`);
      values.push(fechaFin || null);
    }
    if (usoMaximo !== undefined) {
      updates.push(`uso_maximo = $${paramCount++}`);
      values.push(usoMaximo ? parseInt(usoMaximo, 10) : null);
    }
    if (montoMinimoCompra !== undefined) {
      updates.push(`monto_minimo_compra = $${paramCount++}`);
      values.push(parseFloat(montoMinimoCompra || 0));
    }
    if (activo !== undefined) {
      updates.push(`activo = $${paramCount++}`);
      values.push(Boolean(activo));
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No se proporcionaron campos para actualizar",
      });
    }

    values.push(cuponId);

    const result = await db.query(
      `UPDATE cupones
      SET ${updates.join(", ")}
      WHERE cuponid = $${paramCount}
      RETURNING 
        cuponid,
        codigo,
        descripcion,
        tipo_descuento,
        valor,
        fecha_inicio,
        fecha_fin,
        uso_maximo,
        usos_actuales,
        activo,
        monto_minimo_compra`,
      values
    );

    return res.status(200).json({
      success: true,
      message: "Cupón actualizado exitosamente",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error al actualizar cupón:", error);
    return res.status(500).json({
      success: false,
      message: "Error al actualizar el cupón",
    });
  }
};

/**
 * Desactivar un cupón (Admin)
 * DELETE /api/admin/cupones/:id
 */
const desactivarCupon = async (req, res) => {
  try {
    const cuponId = parseInt(req.params.id, 10);

    if (!Number.isInteger(cuponId) || cuponId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de cupón inválido",
      });
    }

    const result = await db.query(
      `UPDATE cupones
      SET activo = false
      WHERE cuponid = $1
      RETURNING cuponid, codigo, activo`,
      [cuponId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Cupón no encontrado",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Cupón desactivado exitosamente",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error al desactivar cupón:", error);
    return res.status(500).json({
      success: false,
      message: "Error al desactivar el cupón",
    });
  }
};

module.exports = {
  validarCupon,
  listarCupones,
  obtenerCupon,
  crearCupon,
  actualizarCupon,
  desactivarCupon,
};
