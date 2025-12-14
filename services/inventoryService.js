function createServiceError(message, status = 500, code = "INVENTORY_SERVICE_ERROR") {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

async function registrarMovimiento(
  client,
  { varianteId, cantidadDelta, motivo, usuarioId, esExcepcion }
) {
  const id = Number.parseInt(varianteId, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw createServiceError("varianteId inválido", 400, "VARIANTE_ID_INVALIDO");
  }

  const delta = Number.parseInt(cantidadDelta, 10);
  if (!Number.isInteger(delta) || delta === 0) {
    throw createServiceError(
      "cantidadDelta inválida",
      400,
      "CANTIDAD_DELTA_INVALIDA"
    );
  }

  const motivoNormalizado = (motivo || "").toString().trim();
  if (!motivoNormalizado) {
    throw createServiceError("motivo es requerido", 400, "MOTIVO_REQUERIDO");
  }

  const userIdParsed = Number.parseInt(usuarioId, 10);
  const userId = Number.isInteger(userIdParsed) ? userIdParsed : null;

  const { rows } = await client.query(
    "SELECT stock FROM producto_variantes WHERE varianteid = $1 FOR UPDATE",
    [id]
  );

  if (!rows.length) {
    throw createServiceError("Variante no encontrada", 404, "VARIANTE_NO_ENCONTRADA");
  }

  const stockAnterior = Number.parseInt(rows[0].stock, 10) || 0;
  const stockNuevo = stockAnterior + delta;

  if (stockNuevo < 0) {
    throw createServiceError(
      `Stock insuficiente. Stock actual: ${stockAnterior}, cambio solicitado: ${delta}`,
      400,
      "STOCK_INSUFICIENTE"
    );
  }

  await client.query(
    "UPDATE producto_variantes SET stock = $1 WHERE varianteid = $2",
    [stockNuevo, id]
  );

  const excepcion = Boolean(esExcepcion);

  try {
    await client.query(
      "INSERT INTO log_inventario (varianteid, cantidadcambiado, nuevostock, motivo, usuarioid, es_excepcion) VALUES ($1, $2, $3, $4, $5, $6)",
      [id, delta, stockNuevo, motivoNormalizado, userId, excepcion]
    );
  } catch (error) {
    if (error && error.code === "42703") {
      await client.query(
        "INSERT INTO log_inventario (varianteid, cantidadcambiado, nuevostock, motivo, usuarioid) VALUES ($1, $2, $3, $4, $5)",
        [id, delta, stockNuevo, motivoNormalizado, userId]
      );
    } else {
      throw error;
    }
  }

  return { stockAnterior, stockNuevo };
}

module.exports = {
  registrarMovimiento,
};
