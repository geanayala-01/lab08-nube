// Carga datos de prueba: tiendas, productos y un usuario por rol.
// Uso: npm run seed
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./config/db');

const tiendas = [
  { nombre: 'TechStore Lima Centro', ciudad: 'Lima' },
  { nombre: 'TechStore Arequipa', ciudad: 'Arequipa' },
  { nombre: 'TechStore Trujillo', ciudad: 'Trujillo' },
];

// Contraseñas de prueba (cumplen la política: 8+, mayúscula, número, especial)
const usuarios = [
  { email: 'admin@techstore.pe', password: 'Admin#2026', nombre: 'Ana Administradora', rol: 'admin', tienda: 'TechStore Lima Centro' },
  { email: 'gerente.lima@techstore.pe', password: 'Gerente#2026', nombre: 'Carlos Gerente Lima', rol: 'gerente', tienda: 'TechStore Lima Centro' },
  { email: 'gerente.arequipa@techstore.pe', password: 'Gerente#2026', nombre: 'María Gerente Arequipa', rol: 'gerente', tienda: 'TechStore Arequipa' },
  { email: 'ventas.lima@techstore.pe', password: 'Ventas#2026', nombre: 'Luis Ventas Lima', rol: 'empleado', tienda: 'TechStore Lima Centro' },
  { email: 'auditor@techstore.pe', password: 'Auditor#2026', nombre: 'Rosa Auditora', rol: 'auditor', tienda: null },
];

const productos = [
  { sku: 'LIM-LAP-001', nombre: 'Laptop Lenovo IdeaPad 5', precio: 2899.0, stock: 12, tienda: 'TechStore Lima Centro' },
  { sku: 'LIM-MON-002', nombre: 'Monitor LG 27" 4K', precio: 1349.9, stock: 8, tienda: 'TechStore Lima Centro' },
  { sku: 'LIM-MOU-003', nombre: 'Mouse Logitech MX Master 3S', precio: 389.0, stock: 25, tienda: 'TechStore Lima Centro' },
  { sku: 'LIM-AUD-004', nombre: 'Audífonos Sony WH-1000XM5', precio: 1199.0, stock: 3, tienda: 'TechStore Lima Centro' },
  { sku: 'AQP-CEL-001', nombre: 'Samsung Galaxy S25', precio: 3599.0, stock: 6, tienda: 'TechStore Arequipa' },
  { sku: 'AQP-TAB-002', nombre: 'iPad Air 11"', precio: 2999.0, stock: 4, tienda: 'TechStore Arequipa' },
  { sku: 'AQP-TEC-003', nombre: 'Teclado Keychron K2', precio: 429.0, stock: 15, tienda: 'TechStore Arequipa' },
  { sku: 'TRU-SSD-001', nombre: 'SSD Kingston NV2 1TB', precio: 259.0, stock: 30, tienda: 'TechStore Trujillo' },
  { sku: 'TRU-IMP-002', nombre: 'Impresora Epson EcoTank L3250', precio: 749.0, stock: 2, tienda: 'TechStore Trujillo' },
];

async function main() {
  const idTienda = {};
  for (const t of tiendas) {
    const { rows } = await db.query(
      `INSERT INTO tiendas (nombre, ciudad) VALUES ($1, $2)
       ON CONFLICT (nombre) DO UPDATE SET ciudad = EXCLUDED.ciudad
       RETURNING id`,
      [t.nombre, t.ciudad]
    );
    idTienda[t.nombre] = rows[0].id;
  }

  for (const u of usuarios) {
    const hash = await bcrypt.hash(u.password, 12);
    await db.query(
      `INSERT INTO usuarios (email, password_hash, nombre_completo, rol, tienda_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO NOTHING`,
      [u.email, hash, u.nombre, u.rol, u.tienda ? idTienda[u.tienda] : null]
    );
  }

  for (const p of productos) {
    await db.query(
      `INSERT INTO productos (sku, nombre, precio, stock, tienda_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (sku) DO NOTHING`,
      [p.sku, p.nombre, p.precio, p.stock, idTienda[p.tienda]]
    );
  }

  console.log('Datos de prueba cargados:');
  console.table(usuarios.map(({ email, password, rol }) => ({ email, password, rol })));
  await db.pool.end();
}

main().catch(async (err) => {
  console.error('Error al cargar datos:', err.message);
  await db.pool.end();
  process.exit(1);
});
