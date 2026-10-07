const express = require('express');
const db = require('../config/db');
const { autenticar, permitirRoles } = require('../middleware/auth');

const router = express.Router();
router.use(autenticar);

// Reporte de inventario: Admin y Auditor ven todas las tiendas, el Gerente solo la suya
router.get('/inventario', permitirRoles('admin', 'auditor', 'gerente'), async (req, res, next) => {
  try {
    const soloSuTienda = req.usuario.rol === 'gerente';
    const { rows } = await db.query(
      `SELECT t.id AS tienda_id, t.nombre AS tienda, t.ciudad,
              COUNT(p.id)::int                         AS productos,
              COALESCE(SUM(p.stock), 0)::int           AS unidades,
              COALESCE(SUM(p.stock * p.precio), 0)     AS valor_inventario,
              COUNT(p.id) FILTER (WHERE p.stock < 5)::int AS productos_stock_bajo
         FROM tiendas t LEFT JOIN productos p ON p.tienda_id = t.id
        ${soloSuTienda ? 'WHERE t.id = $1' : ''}
        GROUP BY t.id
        ORDER BY t.nombre`,
      soloSuTienda ? [req.usuario.tienda_id] : []
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Registro de eventos de seguridad: Admin y Auditor
router.get('/auditoria', permitirRoles('admin', 'auditor'), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT id, email, accion, detalle, ip, creado_en FROM auditoria ORDER BY creado_en DESC LIMIT 100'
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
