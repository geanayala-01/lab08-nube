const form = document.getElementById('form-registro');
const alerta = document.getElementById('alerta');
const selectTienda = document.getElementById('tienda');
const inputPw = document.getElementById('password');

const reglas = {
  len: (p) => p.length >= 8,
  upper: (p) => /[A-Z]/.test(p),
  num: (p) => /\d/.test(p),
  special: (p) => /[^A-Za-z0-9]/.test(p),
};

// Cargar tiendas
Api.request('/api/tiendas').then(({ data }) => {
  data.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = `${t.nombre} (${t.ciudad})`;
    selectTienda.appendChild(opt);
  });
});

// Checklist en vivo de la política de contraseñas
inputPw.addEventListener('input', () => {
  document.querySelectorAll('#pw-rules li').forEach((li) => {
    li.classList.toggle('ok', reglas[li.dataset.rule](inputPw.value));
  });
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (inputPw.value !== document.getElementById('password2').value) {
    mostrarAlerta(alerta, 'error', 'Las contraseñas no coinciden');
    return;
  }

  // La validación de la contraseña se hace también en el servidor:
  // aquí no se bloquea el envío para poder evidenciar que el backend la rechaza.
  const { ok, data } = await Api.request('/api/auth/registro', {
    method: 'POST',
    body: {
      nombre_completo: document.getElementById('nombre').value,
      email: document.getElementById('email').value,
      tienda_id: selectTienda.value,
      password: inputPw.value,
    },
  });

  if (ok) {
    mostrarAlerta(alerta, 'ok', `✅ ${data.mensaje}. Redirigiendo al login…`);
    form.reset();
    setTimeout(() => (window.location.href = '/'), 2000);
  } else {
    mostrarAlerta(alerta, 'error', data.error, data.detalles || []);
  }
});
