const jwt = require('jsonwebtoken');

function leerToken(req) {
  const header = req.headers.authorization || '';
  const [tipo, token] = header.split(' ');
  return tipo === 'Bearer' && token ? token : null;
}

function verificarConTipo(tipoEsperado) {
  return (req, res, next) => {
    const token = leerToken(req);
    if (!token) return res.status(401).json({ error: 'Token no proporcionado' });

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      if (payload.tipo !== tipoEsperado) {
        return res.status(401).json({ error: 'Tipo de token inválido para esta operación' });
      }
      req.usuario = payload;
      next();
    } catch (err) {
      const mensaje = err.name === 'TokenExpiredError' ? 'Token expirado' : 'Token inválido';
      return res.status(401).json({ error: mensaje });
    }
  };
}

// JWT completo (después del MFA)
const autenticar = verificarConTipo('acceso');

// JWT temporal (entre la contraseña y el MFA)
const autenticarMfaPendiente = verificarConTipo('mfa_pendiente');

// Control de acceso basado en roles (RBAC)
function permitirRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.usuario.rol)) {
      return res.status(403).json({
        error: `Acceso denegado: el rol "${req.usuario.rol}" no tiene permiso para esta operación`,
      });
    }
    next();
  };
}

module.exports = { autenticar, autenticarMfaPendiente, permitirRoles };
