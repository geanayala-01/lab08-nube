const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// Si la BD se reinicia (p. ej. docker compose restart), no se cae el servidor
pool.on('error', (err) => {
  console.error('Conexión inactiva con PostgreSQL perdida:', err.message);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
