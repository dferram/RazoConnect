const GoogleStrategy = require("passport-google-oauth20").Strategy;
const db = require("../db");

const configurePassport = (passport) => {
  // ============================================================================
  // SERIALIZACIÓN Y DESERIALIZACIÓN DE USUARIOS
  // ============================================================================
  // CRÍTICO: Estas funciones permiten que Passport persista usuarios en sesión
  // Sin ellas, los usuarios son expulsados inmediatamente después del login
  
  passport.serializeUser((user, done) => {
    // Guardar identificador mínimo en sesión
    console.log('🔐 [Passport] Serializando usuario:', user);
    done(null, { 
      id: user.clienteId || user.adminId || user.agenteId || user.id,
      type: user.type || 'cliente',
      tenant_id: user.tenant_id
    });
  });

  passport.deserializeUser(async (sessionData, done) => {
    try {
      console.log('🔐 [Passport] Deserializando usuario:', sessionData);
      
      // Reconstruir objeto de usuario desde la base de datos
      let user = null;
      
      if (sessionData.type === 'admin') {
        const result = await db.query(
          'SELECT AdminID as id, Nombre, Email, Rol FROM Administradores WHERE AdminID = $1',
          [sessionData.id]
        );
        if (result.rows.length > 0) {
          user = { ...result.rows[0], type: 'admin', tenant_id: sessionData.tenant_id };
        }
      } else if (sessionData.type === 'agente') {
        const result = await db.query(
          'SELECT AgenteID as id, Nombre, Email FROM AgentesDeVentas WHERE AgenteID = $1',
          [sessionData.id]
        );
        if (result.rows.length > 0) {
          user = { ...result.rows[0], type: 'agente', tenant_id: sessionData.tenant_id };
        }
      } else {
        // Cliente por defecto (incluir Telefono para usuarios registrados solo con teléfono)
        const result = await db.query(
          'SELECT clienteid as id, nombre, apellido, email, telefono, avatar_url FROM clientes WHERE clienteid = $1',
          [sessionData.id]
        );
        if (result.rows.length > 0) {
          user = { ...result.rows[0], type: 'cliente', tenant_id: sessionData.tenant_id };
        }
      }
      
      done(null, user);
    } catch (error) {
      console.error('❌ [Passport] Error al deserializar usuario:', error);
      done(error, null);
    }
  });

  // ============================================================================
  // ESTRATEGIA DE GOOGLE OAUTH
  // ============================================================================
  
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
        passReqToCallback: true
      },
      async (req, accessToken, refreshToken, profile, done) => {
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

          const tenant_id = req.tenant?.tenant_id;
          if (!tenant_id) {
            return done(new Error("Tenant no identificado en Google OAuth"), null);
          }

          let cliente = null;

          let result = await db.query(
            `SELECT clienteid, nombre, apellido, email, google_id, avatar_url, tenant_id
             FROM clientes
             WHERE google_id = $1 AND tenant_id = $2`,
            [googleId, tenant_id]
          );

          if (result.rows.length > 0) {
            cliente = result.rows[0];

            if (avatarUrl && avatarUrl !== cliente.avatar_url) {
              await db.query(
                `UPDATE clientes SET avatar_url = $1 WHERE clienteid = $2 AND tenant_id = $3`,
                [avatarUrl, cliente.clienteid, tenant_id]
              );
              cliente.avatar_url = avatarUrl;
            }
          } else if (email) {
            result = await db.query(
              `SELECT clienteid, nombre, apellido, email, google_id, avatar_url, tenant_id
               FROM clientes
               WHERE email = $1 AND tenant_id = $2`,
              [email, tenant_id]
            );

            if (result.rows.length > 0) {
              cliente = result.rows[0];

              await db.query(
                `UPDATE clientes
                 SET google_id = $1,
                     avatar_url = COALESCE($2, avatar_url)
                 WHERE clienteid = $3 AND tenant_id = $4`,
                [googleId, avatarUrl || null, cliente.clienteid, tenant_id]
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
                `INSERT INTO clientes (nombre, apellido, email, passwordhash, google_id, avatar_url, tenant_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 RETURNING clienteid, nombre, apellido, email, google_id, avatar_url, tenant_id`,
                [nombre, apellido, email, null, googleId, avatarUrl || null, tenant_id]
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
            tenant_id: cliente.tenant_id,
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
