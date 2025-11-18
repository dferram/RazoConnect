const DEFAULT_PREFIX = "AG";
const DEFAULT_PAD_LENGTH = 4;

async function generateCodigoAgente(db, options = {}) {
  const prefix = options.prefix || DEFAULT_PREFIX;
  const padLength = options.padLength || DEFAULT_PAD_LENGTH;

  const result = await db.query(
    `SELECT CodigoAgente
       FROM AgentesDeVentas
       WHERE CodigoAgente IS NOT NULL
       ORDER BY
         COALESCE(NULLIF(REGEXP_REPLACE(CodigoAgente, '\\D', '', 'g'), ''), '0')::bigint DESC,
         CodigoAgente DESC
       LIMIT 1`
  );

  let nextNumber = 1;

  if (result.rows.length > 0) {
    const lastCode = result.rows[0].codigoagente || "";
    const match = lastCode.match(/(\d+)/g);

    if (match && match.length > 0) {
      const numericPart = match[match.length - 1];
      const parsedNumber = Number.parseInt(numericPart, 10);
      if (Number.isInteger(parsedNumber)) {
        nextNumber = parsedNumber + 1;
      }
    }
  }

  const paddedNumber = String(nextNumber).padStart(padLength, "0");
  return `${prefix}${paddedNumber}`;
}

module.exports = {
  generateCodigoAgente,
};
