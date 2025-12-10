const GoogleStrategy = require("passport-google-oauth20").Strategy;
const db = require("../db");

const configurePassport = (passport) => {
  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientID || !clientSecret) {
    console.warn(
      "Google OAuth no está configurado correctamente: faltan GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET"
    );
    return;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID,
        clientSecret,
        callbackURL: "/api/auth/google/callback",
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const googleId = profile.id;
          const email =
            Array.isArray(profile.emails) && profile.emails.length
              ? profile.emails[0].value
              : null;
          const avatarUrl =
            Array.isArray(profile.photos) && profile.photos.length
              ? profile.photos[0].value
              : null;
          const givenName = profile.name && profile.name.givenName;
          const familyName = profile.name && profile.name.familyName;
          const displayName = profile.displayName;

          if (!googleId) {
            return done(new Error("Perfil de Google sin id"), null);
          }

          let cliente = null;

          let result = await db.query(
            `SELECT ClienteID, Nombre, Apellido, Email, google_id, avatar_url
             FROM clientes
             WHERE google_id = $1`,
            [googleId]
          );

          if (result.rows.length > 0) {
            cliente = result.rows[0];

            if (avatarUrl && avatarUrl !== cliente.avatar_url) {
              await db.query(
                `UPDATE clientes SET avatar_url = $1 WHERE ClienteID = $2`,
                [avatarUrl, cliente.clienteid]
              );
              cliente.avatar_url = avatarUrl;
            }
          } else if (email) {
            result = await db.query(
              `SELECT ClienteID, Nombre, Apellido, Email, google_id, avatar_url
               FROM clientes
               WHERE Email = $1`,
              [email]
            );

            if (result.rows.length > 0) {
              cliente = result.rows[0];

              await db.query(
                `UPDATE clientes
                 SET google_id = $1,
                     avatar_url = COALESCE($2, avatar_url)
                 WHERE ClienteID = $3`,
                [googleId, avatarUrl || null, cliente.clienteid]
              );

              cliente.google_id = googleId;
              if (avatarUrl) {
                cliente.avatar_url = avatarUrl;
              }
            } else {
              const nombre =
                givenName || (displayName && displayName.split(" ")[0]) || "Cliente";
              const apellido =
                familyName ||
                (displayName && displayName.split(" ").slice(1).join(" ")) ||
                "";

              const insert = await db.query(
                `INSERT INTO clientes (Nombre, Apellido, Email, PasswordHash, google_id, avatar_url)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING ClienteID, Nombre, Apellido, Email, google_id, avatar_url`,
                [nombre, apellido, email, null, googleId, avatarUrl || null]
              );

              cliente = insert.rows[0];
            }
          } else {
            return done(
              new Error("No se pudo obtener el email de la cuenta de Google"),
              null
            );
          }

          const payload = {
            clienteId: cliente.clienteid,
            nombre: cliente.nombre,
            apellido: cliente.apellido,
            email: cliente.email,
            avatarUrl: cliente.avatar_url || avatarUrl || null,
          };

          return done(null, payload);
        } catch (error) {
          console.error("Error en estrategia Google OAuth:", error);
          return done(error, null);
        }
      }
    )
  );
};

module.exports = configurePassport;
