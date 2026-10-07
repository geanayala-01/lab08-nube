const express = require('express');
const db = require('../config/db');
const { autenticar, permitirRoles } = require('../middleware/auth');
const { registrarEvento } = require('../utils/auditoria');

const router = express.Router();
router.use(autenticar);

const ROLES = ['admin', 'gerente', 'empleado', 'auditor'];

// Listar usuarios: Admin y Auditor (solo lectura). Nunca se envían hashes ni secretos MFA.
router.get('/', permitirRoles('admin', 'auditor'), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.email, u.nombre_completo, u.rol, u.proveedor, u.tienda_id, t.nombre AS tienda,
              u.intentos_fallidos, u.bloqueado_hasta, u.mfa_habilitado, u.creado_en
         FROM usuarios u LEFT JOIN tiendas t ON t.id = u.tienda_id
        ORDER BY u.id`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Gestionar rol y tienda: solo Admin
router.patch('/:id', permitirRoles('admin'), async (req, res, next) => {
  try {
    const { rol } = req.body;
    const tiendaId = req.body.tienda_id === null || req.body.tienda_id === '' ? null : req.body.tienda_id;

    if (rol !== undefined && !ROLES.includes(rol)) return res.status(400).json({ error: 'Rol inválido' });
    if (Number(req.params.id) === req.usuario.sub && rol && rol !== 'admin') {
      return res.status(400).json({ error: 'No puedes quitarte el rol de administrador a ti mismo' });
    }

    const { rows } = await db.query(
      `UPDATE usuarios
          SET rol = COALESCE($1, rol),
              tienda_id = CASE WHEN $2::boolean THEN $3::int ELSE tienda_id END
        WHERE id = $4
        RETURNING id, email, rol, tienda_id`,
      [rol ?? null, req.body.tienda_id !== undefined, tiendaId, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });

    await registrarEvento({
      usuarioId: req.usuario.sub, email: req.usuario.email, accion: 'USUARIO_MODIFICADO',
      detalle: `${rows[0].email}: rol=${rows[0].rol}, tienda=${rows[0].tienda_id}`, ip: req.ip,
    });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// Desbloquear cuenta: solo Admin
router.post('/:id/desbloquear', permitirRoles('admin'), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL
        WHERE id = $1 RETURNING id, email`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });

    await registrarEvento({
      usuarioId: req.usuario.sub, email: req.usuario.email, accion: 'USUARIO_DESBLOQUEADO',
      detalle: rows[0].email, ip: req.ip,
    });
    res.json({ mensaje: `Cuenta ${rows[0].email} desbloqueada` });
  } catch (err) {
    next(err);
  }
});

// Reiniciar MFA (si el usuario perdió su celular): solo Admin
router.post('/:id/reset-mfa', permitirRoles('admin'), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `UPDATE usuarios SET mfa_secret = NULL, mfa_habilitado = FALSE
        WHERE id = $1 RETURNING id, email`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });

    await registrarEvento({
      usuarioId: req.usuario.sub, email: req.usuario.email, accion: 'MFA_REINICIADO',
      detalle: rows[0].email, ip: req.ip,
    });
    res.json({ mensaje: `MFA de ${rows[0].email} reiniciado` });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
