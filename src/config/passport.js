const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const db = require('./db');

// Busca el usuario por proveedor; si no existe lo crea con rol "empleado".
// El Administrador le asigna después la tienda y, si corresponde, otro rol.
async function buscarOCrearUsuarioSocial({ proveedor, proveedorId, email, nombre }) {
  const existente = await db.query(
    'SELECT * FROM usuarios WHERE proveedor = $1 AND proveedor_id = $2',
    [proveedor, proveedorId]
  );
  if (existente.rows.length) return existente.rows[0];

  const mismoEmail = await db.query('SELECT proveedor FROM usuarios WHERE email = $1', [email]);
  if (mismoEmail.rows.length) {
    const err = new Error(
      `Ese email ya está registrado con el método "${mismoEmail.rows[0].proveedor}"`
    );
    err.esperado = true;
    throw err;
  }

  const { rows } = await db.query(
    `INSERT INTO usuarios (email, nombre_completo, proveedor, proveedor_id, rol)
     VALUES ($1, $2, $3, $4, 'empleado')
     RETURNING *`,
    [email, nombre, proveedor, proveedorId]
  );
  return rows[0];
}

function verificar(proveedor) {
  return async (accessToken, refreshToken, profile, done) => {
    try {
      const email =
        profile.emails?.find((e) => e.primary)?.value ||
        profile.emails?.[0]?.value ||
        `${profile.username}@users.noreply.github.com`;

      const usuario = await buscarOCrearUsuarioSocial({
        proveedor,
        proveedorId: String(profile.id),
        email: email.toLowerCase(),
        nombre: profile.displayName || profile.username || email,
      });
      done(null, usuario);
    } catch (err) {
      done(err);
    }
  };
}

const proveedoresHabilitados = { google: false, github: false };

function configurarPassport() {
  const base = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL: `${base}/api/auth/google/callback`,
          state: true,
        },
        verificar('google')
      )
    );
    proveedoresHabilitados.google = true;
  }

  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    passport.use(
      new GitHubStrategy(
        {
          clientID: process.env.GITHUB_CLIENT_ID,
          clientSecret: process.env.GITHUB_CLIENT_SECRET,
          callbackURL: `${base}/api/auth/github/callback`,
          scope: ['user:email'],
          state: true,
        },
        verificar('github')
      )
    );
    proveedoresHabilitados.github = true;
  }

  return passport;
}

module.exports = { configurarPassport, proveedoresHabilitados };
