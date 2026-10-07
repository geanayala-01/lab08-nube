const token = Api.getToken();
if (!token) window.location.href = '/';

const yo = Api.decodeToken(token);
const ROL = yo?.rol;

const NOMBRES_ROL = {
  admin: 'Administrador',
  gerente: 'Gerente de Tienda',
  empleado: 'Empleado de Ventas',
  auditor: 'Auditor',
};

const PERMISOS = {
  admin: ['Ver productos de todas las tiendas', 'Crear, editar y eliminar cualquier producto', 'Cambiar precios', 'Actualizar stock', 'Gestionar usuarios y roles', 'Ver reportes y auditoría'],
  gerente: ['Ver productos', 'Crear, editar y eliminar productos de SU tienda', 'Cambiar precios de SU tienda', 'Actualizar stock de SU tienda', 'Ver reportes de SU tienda'],
  empleado: ['Ver productos', 'Actualizar stock de SU tienda'],
  auditor: ['Ver todos los datos (solo lectura)', 'Ver reportes y auditoría'],
};
const DENEGADOS = {
  admin: [],
  gerente: ['Modificar/eliminar productos de otras tiendas', 'Gestionar usuarios'],
  empleado: ['Modificar precios', 'Crear o eliminar productos', 'Ver reportes', 'Gestionar usuarios'],
  auditor: ['Cualquier modificación de datos'],
};

let tiendas = [];
let productos = [];

// ---------- Helpers ----------
function h(tag, props = {}, ...hijos) {
  const el = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v);
  });
  hijos.flat().forEach((c) => el.append(c instanceof Node ? c : document.createTextNode(c ?? '')));
  return el;
}

const api = (url, opts = {}) => Api.request(url, { ...opts, token }).then((r) => {
  if (r.status === 401) Api.logout(); // token expirado o inválido
  return r;
});

const fmt = (n) => Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const puedeEditar = (p) => ROL === 'admin' || (ROL === 'gerente' && p.tienda_id === yo.tienda_id);
const puedeStock = (p) => puedeEditar(p) || (ROL === 'empleado' && p.tienda_id === yo.tienda_id);

// ---------- Cabecera y permisos ----------
async function cargarCabecera() {
  const { data } = await api('/api/auth/yo');
  document.getElementById('usuario-nombre').textContent = data.nombre_completo;
  const badge = document.getElementById('usuario-rol');
  badge.textContent = NOMBRES_ROL[data.rol];
  badge.classList.add(`badge-${data.rol}`);
  document.getElementById('usuario-tienda').textContent = data.tienda ? `· ${data.tienda}` : '· Sin tienda asignada';

  const grid = document.getElementById('permisos');
  PERMISOS[ROL].forEach((p) => grid.append(h('div', { class: 'perm si' }, `✓ ${p}`)));
  DENEGADOS[ROL].forEach((p) => grid.append(h('div', { class: 'perm no' }, `✕ ${p}`)));

  document.getElementById('jwt-payload').textContent = JSON.stringify(
    { ...yo, iat: new Date(yo.iat * 1000).toLocaleString(), exp: new Date(yo.exp * 1000).toLocaleString() },
    null,
    2
  );
}

// ---------- Productos ----------
async function cargarProductos() {
  const { data } = await api('/api/productos');
  productos = data;
  const tbody = document.getElementById('tabla-productos');
  tbody.replaceChildren();

  data.forEach((p) => {
    const inputPrecio = h('input', { type: 'number', step: '0.01', min: '0', value: p.precio });
    const inputStock = h('input', { type: 'number', min: '0', value: p.stock });

    const acciones = h('div', { class: 'actions' });
    if (puedeStock(p)) acciones.append(h('button', { class: 'btn-sm', onclick: () => guardarStock(p, inputStock.value) }, 'Guardar stock'));
    if (puedeEditar(p)) {
      acciones.append(h('button', { class: 'btn-sm btn-outline', onclick: () => guardarPrecio(p, inputPrecio.value) }, 'Guardar precio'));
      acciones.append(h('button', { class: 'btn-sm btn-danger', onclick: () => eliminarProducto(p) }, 'Eliminar'));
    }
    if (!acciones.children.length) acciones.append(h('span', { class: 'muted' }, 'Solo lectura'));

    tbody.append(
      h('tr', {},
        h('td', {}, p.sku),
        h('td', {}, p.nombre),
        h('td', {}, p.tienda),
        h('td', {}, puedeEditar(p) ? inputPrecio : fmt(p.precio)),
        h('td', {}, puedeStock(p) ? inputStock : String(p.stock)),
        h('td', {}, acciones)
      )
    );
  });
}

function avisoProductos(r, textoOk) {
  const el = document.getElementById('alerta-productos');
  if (r.ok) mostrarAlerta(el, 'ok', textoOk);
  else mostrarAlerta(el, 'error', `HTTP ${r.status}: ${r.data.error}`);
}

async function guardarStock(p, stock) {
  const r = await api(`/api/productos/${p.id}/stock`, { method: 'PATCH', body: { stock: Number(stock) } });
  avisoProductos(r, `Stock de ${p.sku} actualizado a ${stock}`);
  recargar();
}

async function guardarPrecio(p, precio) {
  const r = await api(`/api/productos/${p.id}`, { method: 'PUT', body: { precio: Number(precio) } });
  avisoProductos(r, `Precio de ${p.sku} actualizado a S/ ${fmt(precio)}`);
  recargar();
}

async function eliminarProducto(p) {
  if (!confirm(`¿Eliminar ${p.nombre}?`)) return;
  const r = await api(`/api/productos/${p.id}`, { method: 'DELETE' });
  avisoProductos(r, `Producto ${p.sku} eliminado`);
  recargar();
}

function configurarFormProducto() {
  if (!['admin', 'gerente'].includes(ROL)) return;
  const form = document.getElementById('form-producto');
  form.classList.remove('hidden');

  if (ROL === 'admin') {
    document.getElementById('p-tienda-wrap').classList.remove('hidden');
    const sel = document.getElementById('p-tienda');
    tiendas.forEach((t) => sel.append(h('option', { value: t.id }, t.nombre)));
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await api('/api/productos', {
      method: 'POST',
      body: {
        sku: document.getElementById('p-sku').value,
        nombre: document.getElementById('p-nombre').value,
        precio: document.getElementById('p-precio').value,
        stock: Number(document.getElementById('p-stock').value),
        tienda_id: document.getElementById('p-tienda').value,
      },
    });
    avisoProductos(r, 'Producto creado');
    if (r.ok) form.reset();
    recargar();
  });
}

// ---------- Reportes ----------
async function cargarReportes() {
  if (!['admin', 'auditor', 'gerente'].includes(ROL)) return;
  document.getElementById('seccion-reportes').classList.remove('hidden');
  const { data } = await api('/api/reportes/inventario');
  document.getElementById('tabla-reportes').replaceChildren(
    ...data.map((r) =>
      h('tr', {},
        h('td', {}, r.tienda), h('td', {}, r.ciudad), h('td', {}, String(r.productos)),
        h('td', {}, String(r.unidades)), h('td', {}, fmt(r.valor_inventario)), h('td', {}, String(r.productos_stock_bajo))
      )
    )
  );
}

// ---------- Usuarios ----------
async function cargarUsuarios() {
  if (!['admin', 'auditor'].includes(ROL)) return;
  document.getElementById('seccion-usuarios').classList.remove('hidden');
  const { data } = await api('/api/usuarios');
  const esAdmin = ROL === 'admin';
  const aviso = document.getElementById('alerta-usuarios');

  const accion = async (url, body, texto) => {
    const r = await api(url, { method: body ? 'PATCH' : 'POST', body });
    mostrarAlerta(aviso, r.ok ? 'ok' : 'error', r.ok ? texto : `HTTP ${r.status}: ${r.data.error}`);
    recargar();
  };

  document.getElementById('tabla-usuarios').replaceChildren(
    ...data.map((u) => {
      const bloqueado = u.bloqueado_hasta && new Date(u.bloqueado_hasta) > new Date();
      const estado = bloqueado
        ? `🔒 Bloqueado hasta ${new Date(u.bloqueado_hasta).toLocaleTimeString()}`
        : u.intentos_fallidos > 0 ? `${u.intentos_fallidos} intento(s) fallido(s)` : 'Activo';

      let celdaRol = NOMBRES_ROL[u.rol];
      let celdaTienda = u.tienda || '—';
      const acciones = h('div', { class: 'actions' });

      if (esAdmin) {
        celdaRol = h('select', { onchange: (e) => accion(`/api/usuarios/${u.id}`, { rol: e.target.value }, `Rol de ${u.email} actualizado`) },
          Object.entries(NOMBRES_ROL).map(([v, n]) => h('option', { value: v, selected: v === u.rol }, n)));
        celdaTienda = h('select', { onchange: (e) => accion(`/api/usuarios/${u.id}`, { tienda_id: e.target.value || null }, `Tienda de ${u.email} actualizada`) },
          h('option', { value: '' }, '— Sin tienda —'),
          tiendas.map((t) => h('option', { value: t.id, selected: t.id === u.tienda_id }, t.nombre)));
        if (u.intentos_fallidos > 0 || bloqueado) {
          acciones.append(h('button', { class: 'btn-sm', onclick: () => accion(`/api/usuarios/${u.id}/desbloquear`, null, `${u.email} desbloqueado`) }, 'Desbloquear'));
        }
        if (u.mfa_habilitado) {
          acciones.append(h('button', { class: 'btn-sm btn-outline', onclick: () => accion(`/api/usuarios/${u.id}/reset-mfa`, null, `MFA de ${u.email} reiniciado`) }, 'Reiniciar MFA'));
        }
      }

      return h('tr', {},
        h('td', {}, u.email), h('td', {}, u.nombre_completo), h('td', {}, u.proveedor),
        h('td', {}, celdaRol), h('td', {}, celdaTienda),
        h('td', {}, u.mfa_habilitado ? '✓' : '—'), h('td', {}, estado), h('td', {}, acciones)
      );
    })
  );
}

// ---------- Auditoría ----------
async function cargarAuditoria() {
  if (!['admin', 'auditor'].includes(ROL)) return;
  document.getElementById('seccion-auditoria').classList.remove('hidden');
  const { data } = await api('/api/reportes/auditoria');
  document.getElementById('tabla-auditoria').replaceChildren(
    ...data.map((e) =>
      h('tr', {},
        h('td', {}, new Date(e.creado_en).toLocaleString()), h('td', {}, e.email || '—'),
        h('td', {}, e.accion), h('td', {}, e.detalle || ''), h('td', {}, e.ip || '')
      )
    )
  );
}

// ---------- Pruebas RBAC ----------
function configurarPruebas() {
  const log = document.getElementById('resultado-pruebas');
  const propio = () => productos.find((p) => p.tienda_id === yo.tienda_id) || productos[0];
  const ajeno = () => productos.find((p) => p.tienda_id !== yo.tienda_id) || productos[0];

  const pruebas = [
    ['Ver productos', () => ['GET', '/api/productos']],
    ['Cambiar precio (mi tienda)', () => ['PUT', `/api/productos/${propio().id}`, { precio: Number(propio().precio) }]],
    ['Actualizar stock (mi tienda)', () => ['PATCH', `/api/productos/${propio().id}/stock`, { stock: propio().stock }]],
    ['Eliminar producto de OTRA tienda', () => ['DELETE', `/api/productos/${ajeno().id}`]],
    ['Crear producto', () => ['POST', '/api/productos', { sku: `TEST-${Date.now()}`, nombre: 'Producto de prueba', precio: 1, stock: 1, tienda_id: yo.tienda_id || 1 }]],
    ['Ver usuarios', () => ['GET', '/api/usuarios']],
    ['Cambiar mi rol a admin', () => ['PATCH', `/api/usuarios/${yo.sub}`, { rol: 'admin' }]],
    ['Ver auditoría', () => ['GET', '/api/reportes/auditoria']],
  ];

  const cont = document.getElementById('pruebas');
  pruebas.forEach(([nombre, fn]) => {
    cont.append(h('button', {
      class: 'btn-sm btn-outline',
      onclick: async () => {
        // La prueba de "eliminar de otra tienda" no se ejecuta como admin para no borrar datos reales
        if (ROL === 'admin' && nombre.startsWith('Eliminar')) {
          log.replaceChildren(h('span', {}, 'Como Administrador esta operación sí está permitida (se omite para no borrar datos).'));
          return;
        }
        const [method, url, body] = fn();
        const r = await api(url, { method, body });
        const clase = r.ok ? 'status-ok' : 'status-err';
        const resumen = r.ok ? (Array.isArray(r.data) ? `${r.data.length} registro(s)` : JSON.stringify(r.data)) : r.data.error;
        log.replaceChildren(
          h('span', {}, `${nombre}\n${method} ${url}\n`),
          h('span', { class: clase }, `→ HTTP ${r.status} ${r.ok ? 'PERMITIDO' : 'DENEGADO'}\n`),
          h('span', {}, resumen)
        );
        recargar();
      },
    }, nombre));
  });
}

function recargar() {
  cargarProductos();
  cargarReportes();
  cargarUsuarios();
  cargarAuditoria();
}

// ---------- Inicio ----------
document.getElementById('btn-logout').addEventListener('click', Api.logout);

(async () => {
  tiendas = (await Api.request('/api/tiendas')).data;
  await cargarCabecera();
  configurarFormProducto();
  configurarPruebas();
  recargar();
})();
