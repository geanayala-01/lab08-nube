# Guía de evidencias (capturas) – Lab 08

Guarda las capturas en la carpeta `evidencias/` con el número de cada una (ej. `01-login.png`).
En Mac: **Cmd + Shift + 4** para capturar una zona, o **Cmd + Shift + 4 y luego Espacio** para capturar una ventana.

> Antes de empezar: Docker Desktop abierto → `npm run db:up` → `npm start` → abrir http://localhost:3000

---

## 0. Entorno

| # | Qué capturar | Cómo |
|---|---|---|
| 01 | Contenedores corriendo | Terminal: `docker ps` (se ven `techstore-db` y `techstore-adminer`) |
| 02 | Servidor iniciado | Terminal donde corre `npm start` ("TechStore corriendo en http://localhost:3000") |
| 03 | Tablas de la BD | http://localhost:8081 (Adminer) → entra con los datos del README → lista de tablas |

## Parte 1: Registro

| # | Qué capturar | Cómo |
|---|---|---|
| 04 | Formulario de registro | Pantalla "Crear cuenta" con la lista de tiendas desplegada |
| 05 | **Contraseña débil rechazada** | Escribe `abc123` como contraseña → Registrarme → se ve el error del servidor con lo que falta |
| 06 | Checklist de contraseña en verde | Escribe una válida (ej. `MiClave#2026`) y captura los ✓ |
| 07 | Registro exitoso | Mensaje verde "Usuario registrado correctamente" |
| 08 | **Email duplicado** | Registra otra vez el mismo email → "El email ya está registrado" |
| 09 | Contraseña guardada con hash | Adminer → tabla `usuarios` → columna `password_hash` (empieza con `$2b$12$…`, no se ve la contraseña) |

## Parte 1: Login, JWT y bloqueo

| # | Qué capturar | Cómo |
|---|---|---|
| 10 | Login con contraseña incorrecta | Usa tu usuario nuevo con una contraseña mala → "Te quedan 4 intento(s)" |
| 11 | **Cuenta bloqueada** | Falla 5 veces seguidas → "🔒 Cuenta bloqueada por 15 minutos…" |
| 12 | Bloqueada aunque la contraseña sea correcta | Ahora pon la contraseña correcta → sigue bloqueada |
| 13 | Bloqueo en la BD | Adminer → `usuarios` → `intentos_fallidos = 5` y `bloqueado_hasta` con fecha |
| 14 | Admin desbloquea | Entra como admin → sección "Usuarios y roles" → botón **Desbloquear** |

## Parte 2: MFA (TOTP)

| # | Qué capturar | Cómo |
|---|---|---|
| 15 | **QR de configuración** | Primer login de un usuario → pantalla con el QR |
| 16 | App autenticadora | Captura del celular con Google Authenticator mostrando "TechStore Inventario" y el código |
| 17 | **Código MFA incorrecto** | Escribe `000000` → "Código MFA incorrecto. Te quedan 2 intento(s)" |
| 18 | **3 intentos agotados** | Falla 3 veces → "Superaste los 3 intentos de MFA. Vuelve a iniciar sesión" |
| 19 | **MFA correcto** | Vuelve a entrar, pon el código real → "Acceso concedido" → panel |
| 20 | **JWT generado** | En el panel: "Tus permisos" → abre **Ver contenido del JWT** (se ve rol, tienda, expiración) |
| 21 | Segundo login (sin QR) | Cierra sesión y entra de nuevo → ya solo pide el código, sin QR |

## Login con redes sociales

| # | Qué capturar | Cómo |
|---|---|---|
| 22 | Pantalla de Google | Botón **Google** → pantalla de elegir cuenta de Google |
| 23 | Google → MFA → panel | Después de Google aparece el QR o el código MFA → panel |
| 24 | Pantalla de GitHub | Botón **GitHub** → pantalla "Authorize" de GitHub |
| 25 | GitHub → MFA → panel | Igual que con Google |
| 26 | Usuarios sociales en la BD | Panel admin → "Usuarios y roles" → columna Método = `google` / `github` |

## Perfiles de usuario (RBAC)

Usa la sección **"Prueba de permisos (RBAC)"** del panel: muestra el código HTTP que responde el servidor.

| # | Rol | Qué capturar |
|---|---|---|
| 27 | Administrador | Panel completo: usuarios, reportes, auditoría y cambio de rol de un usuario |
| 28 | Gerente (Lima) | Puede editar precios de Lima. Productos de otras tiendas en "Solo lectura". Prueba **Eliminar producto de OTRA tienda** → **HTTP 403** |
| 29 | Empleado de Ventas | Solo ve "Guardar stock". Prueba **Cambiar precio** → **HTTP 403** y **Actualizar stock** → **HTTP 200** |
| 30 | Auditor | Ve reportes, usuarios y auditoría sin botones de edición. Prueba **Actualizar stock** → **HTTP 403** |
| 31 | Intento de escalar privilegios | Con empleado: **Cambiar mi rol a admin** → **HTTP 403** |
| 32 | Registro de auditoría | Como admin o auditor: tabla de eventos (LOGIN_FALLIDO, CUENTA_BLOQUEADA, MFA_FALLIDO, LOGIN_EXITOSO…) |

---

## Configuración de OAuth (lo haces tú una sola vez)

### Google
1. Entra a https://console.cloud.google.com/ y crea un proyecto (ej. `techstore-lab08`).
2. **APIs y servicios → Pantalla de consentimiento de OAuth**: tipo *Externo*, pon nombre de la app y tu correo, y agrégate como *usuario de prueba*.
3. **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**
   - Tipo: **Aplicación web**
   - Orígenes autorizados de JavaScript: `http://localhost:3000`
   - URI de redireccionamiento autorizado: `http://localhost:3000/api/auth/google/callback`
4. Copia el **Client ID** y el **Client Secret** en `.env`:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   ```

### GitHub
1. Entra a https://github.com/settings/developers → **OAuth Apps → New OAuth App**.
2. Completa:
   - Application name: `TechStore Lab08`
   - Homepage URL: `http://localhost:3000`
   - Authorization callback URL: `http://localhost:3000/api/auth/github/callback`
3. **Register application** → copia el Client ID → **Generate a new client secret**.
4. Pégalos en `.env`:
   ```
   GITHUB_CLIENT_ID=...
   GITHUB_CLIENT_SECRET=...
   ```

Después de editar `.env`, reinicia el servidor (Ctrl + C y `npm start` otra vez).

> Los usuarios que entran por Google o GitHub se crean como **Empleado** sin tienda.
> El admin les asigna la tienda y el rol desde el panel.
