// Utilidades compartidas por todas las páginas
const Api = {
  async request(url, { method = 'GET', body, token } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch { /* respuesta vacía */ }
    return { ok: res.ok, status: res.status, data };
  },

  getToken: () => sessionStorage.getItem('token'),
  setToken: (t) => sessionStorage.setItem('token', t),
  getMfaToken: () => sessionStorage.getItem('mfaToken'),
  setMfaToken: (t) => sessionStorage.setItem('mfaToken', t),

  logout() {
    sessionStorage.clear();
    window.location.href = '/';
  },

  // Decodifica el payload del JWT (solo para mostrar datos; la validación real la hace el servidor)
  decodeToken(token) {
    try {
      const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(decodeURIComponent(escape(atob(base64))));
    } catch {
      return null;
    }
  },
};

function mostrarAlerta(el, tipo, mensaje, detalles = []) {
  el.className = `alert alert-${tipo}`;
  el.textContent = mensaje;
  if (detalles.length) {
    const ul = document.createElement('ul');
    detalles.forEach((d) => {
      const li = document.createElement('li');
      li.textContent = d;
      ul.appendChild(li);
    });
    el.appendChild(ul);
  }
}
