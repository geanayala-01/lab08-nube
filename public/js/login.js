const form = document.getElementById('form-login');
const alerta = document.getElementById('alerta');
const btn = document.getElementById('btn-login');

// Errores que llegan desde el login social (?error=...)
const errorUrl = new URLSearchParams(window.location.search).get('error');
if (errorUrl) mostrarAlerta(alerta, 'error', errorUrl);

// Si un proveedor social no está configurado, se avisa en el botón
Api.request('/api/auth/proveedores').then(({ data }) => {
  ['google', 'github'].forEach((p) => {
    if (!data[p]) document.getElementById(`btn-${p}`).title = `Falta configurar ${p} en el archivo .env`;
  });
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  btn.disabled = true;

  const { ok, status, data } = await Api.request('/api/auth/login', {
    method: 'POST',
    body: {
      email: document.getElementById('email').value,
      password: document.getElementById('password').value,
    },
  });

  btn.disabled = false;

  if (ok && data.mfaRequerido) {
    Api.setMfaToken(data.tempToken);
    sessionStorage.setItem('configurarMfa', data.configurarMfa ? '1' : '0');
    window.location.href = '/mfa.html';
    return;
  }

  if (status === 423) {
    mostrarAlerta(alerta, 'error', `🔒 ${data.error}`);
  } else if (data.intentosRestantes !== undefined) {
    mostrarAlerta(alerta, 'warn', `${data.error}. Te quedan ${data.intentosRestantes} intento(s) antes del bloqueo.`);
  } else {
    mostrarAlerta(alerta, 'error', data.error || 'Error al iniciar sesión');
  }
});
