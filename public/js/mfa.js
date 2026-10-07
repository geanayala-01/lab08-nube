const alerta = document.getElementById('alerta');
const form = document.getElementById('form-mfa');
const btnVolver = document.getElementById('btn-volver');

// Desde el login social el token llega en el fragmento: /mfa.html#token=...&configurar=1
const hash = new URLSearchParams(window.location.hash.slice(1));
if (hash.get('token')) {
  Api.setMfaToken(hash.get('token'));
  sessionStorage.setItem('configurarMfa', hash.get('configurar'));
  history.replaceState(null, '', '/mfa.html'); // borra el token de la barra de direcciones
}

const mfaToken = Api.getMfaToken();
if (!mfaToken) window.location.href = '/';

function terminarSesionMfa(mensaje) {
  sessionStorage.removeItem('mfaToken');
  mostrarAlerta(alerta, 'error', mensaje);
  form.classList.add('hidden');
  document.getElementById('seccion-configurar').classList.add('hidden');
  btnVolver.classList.remove('hidden');
}

async function cargarQr() {
  const { ok, data } = await Api.request('/api/auth/mfa/configurar', { token: mfaToken });
  if (!ok) {
    if (data.reiniciar) return terminarSesionMfa(data.error);
    return mostrarAlerta(alerta, 'error', data.error);
  }
  document.getElementById('qr').src = data.qr;
  document.getElementById('secreto').textContent = data.secreto;
  document.getElementById('seccion-configurar').classList.remove('hidden');
  document.getElementById('texto-verificar').classList.add('hidden');
}

if (sessionStorage.getItem('configurarMfa') === '1') cargarQr();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btn-verificar');
  btn.disabled = true;

  const { ok, data } = await Api.request('/api/auth/mfa/verificar', {
    method: 'POST',
    token: mfaToken,
    body: { codigo: document.getElementById('codigo').value },
  });

  btn.disabled = false;

  if (ok) {
    sessionStorage.removeItem('mfaToken');
    sessionStorage.removeItem('configurarMfa');
    Api.setToken(data.token);
    mostrarAlerta(alerta, 'ok', '✅ Acceso concedido. Entrando…');
    setTimeout(() => (window.location.href = '/dashboard.html'), 800);
    return;
  }

  if (data.reiniciar) return terminarSesionMfa(`🔒 ${data.error}`);

  const resto = data.intentosRestantes !== undefined ? ` Te quedan ${data.intentosRestantes} intento(s).` : '';
  mostrarAlerta(alerta, 'warn', `${data.error}.${resto}`);
  document.getElementById('codigo').value = '';
});
