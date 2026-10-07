const jwt = require('jsonwebtoken');
const db = require('../config/db');

const MFA_TOKEN_MINUTOS = 5;

// Paso 1 del login: credenciales correctas -> sesión MFA + token temporal.
// El token temporal SOLO sirve para /api/auth/mfa/*, no da acceso al sistema.
async function crearSesionMfa(usuario) {
  const { rows } = await db.query(
    `INSERT INTO mfa_sesiones (usuario_id, expira_en)
     VALUES ($1, NOW() + INTERVAL '${MFA_TOKEN_MINUTOS} minutes')
     RETURNING id`,
    [usuario.id]
  );

  const tempToken = jwt.sign(
    { sub: usuario.id, sid: rows[0].id, tipo: 'mfa_pendiente' },
    process.env.JWT_SECRET,
    { expiresIn: `${MFA_TOKEN_MINUTOS}m` }
  );

  return {
    mfaRequerido: true,
    configurarMfa: !usuario.mfa_habilitado,
    tempToken,
  };
}

// Paso 2 del login: MFA correcto -> JWT completo con rol y tienda.
function emitirTokenAcceso(usuario) {
  return jwt.sign(
    {
      sub: usuario.id,
      email: usuario.email,
      nombre: usuario.nombre_completo,
      rol: usuario.rol,
      tienda_id: usuario.tienda_id,
      tipo: 'acceso',
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
  );
}

module.exports = { crearSesionMfa, emitirTokenAcceso };
