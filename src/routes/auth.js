const express = require('express');
const bcrypt = require('bcryptjs');
const passport = require('passport');
const QRCode = require('qrcode');
const { authenticator } = require('otplib');

const db = require('../config/db');
const { validarPassword, validarEmail } = require('../utils/validators');
const { registrarEvento } = require('../utils/auditoria');
const { crearSesionMfa, emitirTokenAcceso } = require('../utils/tokens');
const { autenticar, autenticarMfaPendiente } = require('../middleware/auth');
const { proveedoresHabilitados } = require('../config/passport');

const router = express.Router();

const MAX_INTENTOS = Number(process.env.MAX_LOGIN_ATTEMPTS) || 5;
const MINUTOS_BLOQUEO = Number(process.env.LOCK_MINUTES) || 15;
const MAX_INTENTOS_MFA = Number(process.env.MAX_MFA_ATTEMPTS) || 3;

// Tolera ±30 s de desfase entre el reloj del servidor y el del celular
authenticator.options = { window: 1 };

// Hash ficticio para que un email inexistente tarde lo mismo que uno real
const HASH_FICTICIO = bcrypt.hashSync('no-existe-este-usuario', 12);

// =========================================================
// Parte 1: Registro
// =========================================================
router.post('/registro', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const nombre = String(req.body.nombre_completo || '').trim();
    const tiendaId = Number(req.body.tienda_id);
    const { password } = req.body;

    const errores = [];
    if (!validarEmail(email)) errores.push('Email inválido');
    if (nombre.length < 3) errores.push('El nombre completo es obligatorio');
    if (!Number.isInteger(tiendaId)) errores.push('Debe seleccionar una tienda');
    errores.push(...validarPassword(password));
    if (errores.length) return res.status(400).json({ error: 'Datos inválidos', detalles: errores });

    const tienda = await db.query('SELECT id FROM tiendas WHERE id = $1', [tiendaId]);
    if (!tienda.rows.length) return res.status(400).json({ error: 'La tienda seleccionada no existe' });

    const passwordHash = await bcrypt.hash(password, 12);

    // El rol NO se recibe del cliente: todo registro nuevo es "empleado".
    // Solo el Administrador puede cambiar roles.
    const { rows } = await db.query(
      `INSERT INTO usuarios (email, password_hash, nombre_completo, tienda_id, rol)
       VALUES ($1, $2, $3, $4, 'empleado')
       RETURNING id, email, nombre_completo, tienda_id, rol`,
      [email, passwordHash, nombre, tiendaId]
    );

    await registrarEvento({ usuarioId: rows[0].id, email, accion: 'REGISTRO', ip: req.ip });
    res.status(201).json({ mensaje: 'Usuario registrado correctamente', usuario: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'El email ya está registrado' });
    }
    next(err);
  }
});

// =========================================================
// Parte 1: Login con bloqueo tras 5 intentos fallidos
// =========================================================
router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    const { rows } = await db.query('SELECT * FROM usuarios WHERE email = $1', [email]);
    let usuario = rows[0];

    if (!usuario || !usuario.password_hash) {
      await bcrypt.compare(password, HASH_FICTICIO);
      await registrarEvento({ email, accion: 'LOGIN_FALLIDO', detalle: 'Usuario no existe o usa login social', ip: req.ip });
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // ¿Sigue bloqueado?
    if (usuario.bloqueado_hasta && new Date(usuario.bloqueado_hasta) > new Date()) {
      const minutos = Math.ceil((new Date(usuario.bloqueado_hasta) - new Date()) / 60000);
      await registrarEvento({ usuarioId: usuario.id, email, accion: 'LOGIN_BLOQUEADO', ip: req.ip });
      return res.status(423).json({
        error: `Cuenta bloqueada por demasiados intentos fallidos. Intenta en ${minutos} minuto(s).`,
        bloqueado: true,
        minutosRestantes: minutos,
      });
    }

    // El bloqueo ya expiró: se reinicia el contador
    if (usuario.bloqueado_hasta) {
      const r = await db.query(
        'UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = $1 RETURNING *',
        [usuario.id]
      );
      usuario = r.rows[0];
    }

    const passwordOk = await bcrypt.compare(password, usuario.password_hash);

    if (!passwordOk) {
      const r = await db.query(
        `UPDATE usuarios
            SET intentos_fallidos = intentos_fallidos + 1,
                bloqueado_hasta = CASE
                  WHEN intentos_fallidos + 1 >= $2 THEN NOW() + ($3 || ' minutes')::INTERVAL
                  ELSE NULL END
          WHERE id = $1
          RETURNING intentos_fallidos, bloqueado_hasta`,
        [usuario.id, MAX_INTENTOS, String(MINUTOS_BLOQUEO)]
      );
      const { intentos_fallidos: intentos, bloqueado_hasta: bloqueado } = r.rows[0];

      if (bloqueado) {
        await registrarEvento({
          usuarioId: usuario.id, email, accion: 'CUENTA_BLOQUEADA',
          detalle: `${intentos} intentos fallidos`, ip: req.ip,
        });
        return res.status(423).json({
          error: `Cuenta bloqueada por ${MINUTOS_BLOQUEO} minutos tras ${MAX_INTENTOS} intentos fallidos.`,
          bloqueado: true,
          minutosRestantes: MINUTOS_BLOQUEO,
        });
      }

      await registrarEvento({
        usuarioId: usuario.id, email, accion: 'LOGIN_FALLIDO',
        detalle: `Intento ${intentos} de ${MAX_INTENTOS}`, ip: req.ip,
      });
      return res.status(401).json({
        error: 'Credenciales inválidas',
        intentosRestantes: MAX_INTENTOS - intentos,
      });
    }

    // Contraseña correcta: se limpia el contador y se pasa al MFA
    await db.query('UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = $1', [usuario.id]);
    await registrarEvento({ usuarioId: usuario.id, email, accion: 'PASSWORD_OK', detalle: 'Pendiente de MFA', ip: req.ip });

    res.json(await crearSesionMfa(usuario));
  } catch (err) {
    next(err);
  }
});

// =========================================================
// Parte 2: MFA con TOTP (Google Authenticator)
// =========================================================
async function obtenerSesionMfaValida(sid, usuarioId) {
  const { rows } = await db.query(
    `SELECT * FROM mfa_sesiones
      WHERE id = $1 AND usuario_id = $2 AND usado = FALSE AND expira_en > NOW()`,
    [sid, usuarioId]
  );
  return rows[0];
}

// Genera el secreto TOTP y el QR para escanear (solo la primera vez)
router.get('/mfa/configurar', autenticarMfaPendiente, async (req, res, next) => {
  try {
    const sesion = await obtenerSesionMfaValida(req.usuario.sid, req.usuario.sub);
    if (!sesion) return res.status(401).json({ error: 'Sesión MFA inválida o expirada', reiniciar: true });

    const { rows } = await db.query('SELECT * FROM usuarios WHERE id = $1', [req.usuario.sub]);
    const usuario = rows[0];
    if (usuario.mfa_habilitado) return res.status(400).json({ error: 'El MFA ya está configurado' });

    let secreto = usuario.mfa_secret;
    if (!secreto) {
      secreto = authenticator.generateSecret();
      await db.query('UPDATE usuarios SET mfa_secret = $1 WHERE id = $2', [secreto, usuario.id]);
    }

    const otpauth = authenticator.keyuri(usuario.email, 'TechStore Inventario', secreto);
    const qr = await QRCode.toDataURL(otpauth);

    res.json({ qr, secreto });
  } catch (err) {
    next(err);
  }
});

// Verifica el código de 6 dígitos (máximo 3 intentos por sesión)
router.post('/mfa/verificar', autenticarMfaPendiente, async (req, res, next) => {
  try {
    const sesion = await obtenerSesionMfaValida(req.usuario.sid, req.usuario.sub);
    if (!sesion) {
      return res.status(401).json({ error: 'Sesión MFA inválida o expirada. Vuelve a iniciar sesión.', reiniciar: true });
    }

    const { rows } = await db.query('SELECT * FROM usuarios WHERE id = $1', [req.usuario.sub]);
    const usuario = rows[0];
    if (!usuario.mfa_secret) return res.status(400).json({ error: 'Primero debes configurar el MFA' });

    const codigo = String(req.body.codigo || '').trim();
    const codigoOk = /^\d{6}$/.test(codigo) && authenticator.check(codigo, usuario.mfa_secret);

    if (!codigoOk) {
      const r = await db.query(
        `UPDATE mfa_sesiones
            SET intentos = intentos + 1,
                usado = (intentos + 1 >= $2)
          WHERE id = $1
          RETURNING intentos, usado`,
        [sesion.id, MAX_INTENTOS_MFA]
      );
      const { intentos, usado } = r.rows[0];

      if (usado) {
        await registrarEvento({
          usuarioId: usuario.id, email: usuario.email, accion: 'MFA_BLOQUEADO',
          detalle: `${intentos} códigos incorrectos`, ip: req.ip,
        });
        return res.status(401).json({
          error: `Superaste los ${MAX_INTENTOS_MFA} intentos de MFA. Vuelve a iniciar sesión.`,
          reiniciar: true,
        });
      }

      await registrarEvento({
        usuarioId: usuario.id, email: usuario.email, accion: 'MFA_FALLIDO',
        detalle: `Intento ${intentos} de ${MAX_INTENTOS_MFA}`, ip: req.ip,
      });
      return res.status(401).json({
        error: 'Código MFA incorrecto',
        intentosRestantes: MAX_INTENTOS_MFA - intentos,
      });
    }

    // Código correcto: se cierra la sesión MFA y se entrega el JWT completo
    await db.query('UPDATE mfa_sesiones SET usado = TRUE WHERE id = $1', [sesion.id]);
    if (!usuario.mfa_habilitado) {
      await db.query('UPDATE usuarios SET mfa_habilitado = TRUE WHERE id = $1', [usuario.id]);
    }
    await registrarEvento({ usuarioId: usuario.id, email: usuario.email, accion: 'LOGIN_EXITOSO', detalle: 'MFA verificado', ip: req.ip });

    res.json({
      mensaje: 'Acceso concedido',
      token: emitirTokenAcceso(usuario),
    });
  } catch (err) {
    next(err);
  }
});

// =========================================================
// Login con redes sociales (Google y GitHub)
// =========================================================
router.get('/proveedores', (req, res) => res.json(proveedoresHabilitados));

function iniciarSocial(proveedor, scope) {
  return (req, res, next) => {
    if (!proveedoresHabilitados[proveedor]) {
      return res.redirect('/?error=' + encodeURIComponent(`El login con ${proveedor} no está configurado`));
    }
    passport.authenticate(proveedor, { scope, session: false })(req, res, next);
  };
}

function callbackSocial(proveedor) {
  return (req, res, next) => {
    passport.authenticate(proveedor, { session: false }, async (err, usuario) => {
      try {
        if (err || !usuario) {
          const mensaje = err?.esperado ? err.message : `No se pudo iniciar sesión con ${proveedor}`;
          if (err && !err.esperado) console.error(err);
          await registrarEvento({ accion: 'LOGIN_SOCIAL_FALLIDO', detalle: proveedor, ip: req.ip });
          return res.redirect('/?error=' + encodeURIComponent(mensaje));
        }

        await registrarEvento({
          usuarioId: usuario.id, email: usuario.email, accion: 'LOGIN_SOCIAL_OK',
          detalle: `${proveedor} - pendiente de MFA`, ip: req.ip,
        });

        // También pasa por MFA. El token va en el fragmento (#), que no se envía al servidor ni queda en logs.
        const r = await crearSesionMfa(usuario);
        res.redirect(`/mfa.html#token=${r.tempToken}&configurar=${r.configurarMfa ? 1 : 0}`);
      } catch (e) {
        next(e);
      }
    })(req, res, next);
  };
}

router.get('/google', iniciarSocial('google', ['profile', 'email']));
router.get('/google/callback', callbackSocial('google'));
router.get('/github', iniciarSocial('github', ['user:email']));
router.get('/github/callback', callbackSocial('github'));

// =========================================================
// Usuario actual
// =========================================================
router.get('/yo', autenticar, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.email, u.nombre_completo, u.rol, u.proveedor, u.tienda_id,
              t.nombre AS tienda, u.mfa_habilitado
         FROM usuarios u LEFT JOIN tiendas t ON t.id = u.tienda_id
        WHERE u.id = $1`,
      [req.usuario.sub]
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
