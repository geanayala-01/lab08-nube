const express = require('express');
const db = require('../config/db');
const { autenticar, permitirRoles } = require('../middleware/auth');
const { registrarEvento } = require('../utils/auditoria');

const router = express.Router();
router.use(autenticar);

// Gerente y Empleado solo pueden modificar productos de SU tienda
async function verificarTiendaPropia(req, res, next) {
  try {
    const { rows } = await db.query('SELECT * FROM productos WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Producto no encontrado' });

    const producto = rows[0];
    const { rol, tienda_id: tiendaUsuario } = req.usuario;
    if (rol !== 'admin' && producto.tienda_id !== tiendaUsuario) {
      return res.status(403).json({ error: 'Acceso denegado: el producto pertenece a otra tienda' });
    }
    req.producto = producto;
    next();
  } catch (err) {
    next(err);
  }
}

// Consultar productos: todos los roles
router.get('/', async (req, res, next) => {
  try {
    const params = [];
    let filtro = '';
    if (req.query.tienda_id) {
      params.push(Number(req.query.tienda_id));
      filtro = 'WHERE p.tienda_id = $1';
    }
    const { rows } = await db.query(
      `SELECT p.*, t.nombre AS tienda
         FROM productos p JOIN tiendas t ON t.id = p.tienda_id
         ${filtro}
        ORDER BY t.nombre, p.nombre`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Crear producto: Admin (cualquier tienda) y Gerente (solo su tienda)
router.post('/', permitirRoles('admin', 'gerente'), async (req, res, next) => {
  try {
    const { sku, nombre, descripcion = null } = req.body;
    const precio = Number(req.body.precio);
    const stock = Number(req.body.stock ?? 0);
    const tiendaId = req.usuario.rol === 'admin' ? Number(req.body.tienda_id) : req.usuario.tienda_id;

    if (!sku || !nombre || !(precio >= 0) || !Number.isInteger(stock) || stock < 0 || !tiendaId) {
      return res.status(400).json({ error: 'Datos del producto inválidos' });
    }

    const { rows } = await db.query(
      `INSERT INTO productos (sku, nombre, descripcion, precio, stock, tienda_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [sku, nombre, descripcion, precio, stock, tiendaId]
    );
    await registrarEvento({ usuarioId: req.usuario.sub, email: req.usuario.email, accion: 'PRODUCTO_CREADO', detalle: sku, ip: req.ip });
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'El SKU ya existe' });
    next(err);
  }
});

// Editar producto (incluye precio): Admin y Gerente de la tienda
router.put('/:id', permitirRoles('admin', 'gerente'), verificarTiendaPropia, async (req, res, next) => {
  try {
    const p = req.producto;
    const nombre = req.body.nombre ?? p.nombre;
    const descripcion = req.body.descripcion ?? p.descripcion;
    const precio = req.body.precio !== undefined ? Number(req.body.precio) : Number(p.precio);
    if (!(precio >= 0)) return res.status(400).json({ error: 'Precio inválido' });

    const { rows } = await db.query(
      `UPDATE productos SET nombre = $1, descripcion = $2, precio = $3, actualizado_en = NOW()
        WHERE id = $4 RETURNING *`,
      [nombre, descripcion, precio, p.id]
    );
    await registrarEvento({
      usuarioId: req.usuario.sub, email: req.usuario.email, accion: 'PRODUCTO_EDITADO',
      detalle: `${p.sku}: precio ${p.precio} -> ${precio}`, ip: req.ip,
    });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// Actualizar stock: Admin, Gerente y Empleado de ventas (NO puede cambiar precios)
router.patch('/:id/stock', permitirRoles('admin', 'gerente', 'empleado'), verificarTiendaPropia, async (req, res, next) => {
  try {
    const stock = Number(req.body.stock);
    if (!Number.isInteger(stock) || stock < 0) return res.status(400).json({ error: 'Stock inválido' });

    const { rows } = await db.query(
      'UPDATE productos SET stock = $1, actualizado_en = NOW() WHERE id = $2 RETURNING *',
      [stock, req.producto.id]
    );
    await registrarEvento({
      usuarioId: req.usuario.sub, email: req.usuario.email, accion: 'STOCK_ACTUALIZADO',
      detalle: `${req.producto.sku}: ${req.producto.stock} -> ${stock}`, ip: req.ip,
    });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// Eliminar producto: Admin y Gerente de la tienda (no puede borrar de otras tiendas)
router.delete('/:id', permitirRoles('admin', 'gerente'), verificarTiendaPropia, async (req, res, next) => {
  try {
    await db.query('DELETE FROM productos WHERE id = $1', [req.producto.id]);
    await registrarEvento({
      usuarioId: req.usuario.sub, email: req.usuario.email, accion: 'PRODUCTO_ELIMINADO',
      detalle: req.producto.sku, ip: req.ip,
    });
    res.json({ mensaje: 'Producto eliminado' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
