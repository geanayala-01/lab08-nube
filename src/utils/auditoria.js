const db = require('../config/db');

// Guarda un evento de seguridad. Nunca debe romper la petición si falla.
async function registrarEvento({ usuarioId = null, email = null, accion, detalle = null, ip = null }) {
  try {
    await db.query(
      'INSERT INTO auditoria (usuario_id, email, accion, detalle, ip) VALUES ($1, $2, $3, $4, $5)',
      [usuarioId, email, accion, detalle, ip]
    );
  } catch (err) {
    console.error('No se pudo registrar el evento de auditoría:', err.message);
  }
}

module.exports = { registrarEvento };
