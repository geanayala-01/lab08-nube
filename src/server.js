require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const db = require('./config/db');
const { configurarPassport } = require('./config/passport');

const app = express();
const passport = configurarPassport();

app.use(helmet());
app.use(express.json({ limit: '10kb' }));

// La sesión solo se usa para guardar el "state" anti-CSRF del flujo OAuth
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 10 * 60 * 1000 },
  })
);
app.use(passport.initialize());

// Limita peticiones a login/registro/MFA para frenar ataques de fuerza bruta
const limiteAuth = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones, intenta más tarde' },
});
app.use(['/api/auth/login', '/api/auth/registro', '/api/auth/mfa'], limiteAuth);

// Rutas de la API
app.use('/api/auth', require('./routes/auth'));
app.use('/api/productos', require('./routes/productos'));
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/reportes', require('./routes/reportes'));

app.get('/api/tiendas', async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT id, nombre, ciudad FROM tiendas ORDER BY nombre');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// Frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// Manejo de errores: no se exponen detalles internos al cliente
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`TechStore corriendo en http://localhost:${PORT}`);
});
