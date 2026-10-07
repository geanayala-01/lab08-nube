// Mínimo 8 caracteres, al menos una mayúscula, un número y un carácter especial
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validarPassword(password) {
  const errores = [];
  if (typeof password !== 'string') return ['La contraseña es obligatoria'];
  if (password.length < 8) errores.push('Debe tener mínimo 8 caracteres');
  if (!/[A-Z]/.test(password)) errores.push('Debe tener al menos una letra mayúscula');
  if (!/\d/.test(password)) errores.push('Debe tener al menos un número');
  if (!/[^A-Za-z0-9]/.test(password)) errores.push('Debe tener al menos un carácter especial');
  return errores;
}

function validarEmail(email) {
  return typeof email === 'string' && EMAIL_REGEX.test(email) && email.length <= 255;
}

module.exports = { PASSWORD_REGEX, validarPassword, validarEmail };
