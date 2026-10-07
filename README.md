# TechStore: Sistema de Gestión de Inventario (Lab 08)

Aplicación web con autenticación segura: registro con política de contraseñas, login con JWT,
bloqueo tras 5 intentos fallidos, login con Google y GitHub, MFA con TOTP (Google Authenticator)
y control de acceso por roles (RBAC).

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Node.js + Express 5 |
| Base de datos | PostgreSQL 16 (Docker) + Adminer |
| Contraseñas | bcrypt (12 rondas) |
| Tokens | JWT (`jsonwebtoken`) |
| MFA | TOTP (`otplib` + `qrcode`) |
| OAuth | Passport.js (Google, GitHub) |
| Seguridad extra | Helmet, rate limiting, registro de auditoría |
| Frontend | HTML + CSS + JavaScript |

## Cómo correrlo

1. Abrir **Docker Desktop**.
2. Levantar la base de datos:
   ```bash
   npm run db:up
   ```
3. Cargar datos de prueba (solo la primera vez):
   ```bash
   npm run seed
   ```
4. Iniciar el servidor:
   ```bash
   npm start
   ```
5. Abrir http://localhost:3000

- Base de datos visual (Adminer): http://localhost:8081
  Sistema: PostgreSQL · Servidor: `db` · Usuario: `techstore` · Contraseña: `techstore_dev_2026` · BD: `techstore`
- Para borrar todo y empezar de cero: `npm run db:reset` y luego `npm run seed`.

## Usuarios de prueba

| Rol | Email | Contraseña |
|---|---|---|
| Administrador | admin@techstore.pe | Admin#2026 |
| Gerente (Lima) | gerente.lima@techstore.pe | Gerente#2026 |
| Gerente (Arequipa) | gerente.arequipa@techstore.pe | Gerente#2026 |
| Empleado de Ventas (Lima) | ventas.lima@techstore.pe | Ventas#2026 |
| Auditor | auditor@techstore.pe | Auditor#2026 |

La primera vez que cada usuario inicia sesión, la app le muestra un QR para configurar Google Authenticator.

## Flujo de autenticación

```
Email + contraseña ──► ¿bloqueado? ──sí──► 423 (bloqueado 15 min)
                          │no
                     ¿contraseña OK? ──no──► intentos+1 (al 5.º → bloqueo)
                          │sí
              token TEMPORAL (5 min, solo sirve para MFA)
                          │
          (1.ª vez: QR para Google Authenticator)
                          │
                 código TOTP de 6 dígitos ──mal──► máx. 3 intentos → volver a login
                          │ok
                  JWT COMPLETO (rol + tienda, 1 h)
```

Google y GitHub siguen el mismo camino: después de autenticarse en el proveedor también pasan por el MFA.

## Permisos por rol (RBAC)

| Operación | Admin | Gerente | Empleado | Auditor |
|---|:-:|:-:|:-:|:-:|
| Ver productos | ✅ | ✅ | ✅ | ✅ |
| Crear producto | ✅ | ✅ (su tienda) | ❌ | ❌ |
| Editar / cambiar precio | ✅ | ✅ (su tienda) | ❌ | ❌ |
| Actualizar stock | ✅ | ✅ (su tienda) | ✅ (su tienda) | ❌ |
| Eliminar producto | ✅ | ✅ (su tienda) | ❌ | ❌ |
| Reportes de inventario | ✅ | ✅ (su tienda) | ❌ | ✅ |
| Ver usuarios | ✅ | ❌ | ❌ | ✅ (lectura) |
| Gestionar roles / desbloquear | ✅ | ❌ | ❌ | ❌ |
| Registro de auditoría | ✅ | ❌ | ❌ | ✅ |

Los permisos se validan en el **servidor** (`src/middleware/auth.js`), no solo ocultando botones.

## Estructura

```
lab08-nube/
├── docker-compose.yml       PostgreSQL + Adminer
├── db/init.sql              Esquema de la BD
├── src/
│   ├── server.js            Express, Helmet, rate limit, rutas
│   ├── seed.js              Datos de prueba
│   ├── config/db.js         Conexión a PostgreSQL
│   ├── config/passport.js   Estrategias Google y GitHub
│   ├── middleware/auth.js   Verificación de JWT y RBAC
│   ├── routes/auth.js       Registro, login, bloqueo, MFA, OAuth
│   ├── routes/productos.js  Inventario con permisos por rol/tienda
│   ├── routes/usuarios.js   Gestión de usuarios (admin)
│   ├── routes/reportes.js   Reportes y auditoría
│   └── utils/               Validaciones, tokens, auditoría
└── public/                  Frontend (login, registro, MFA, panel)
```

## Configurar Google y GitHub

Ver la sección **"Configuración de OAuth"** en [EVIDENCIAS.md](EVIDENCIAS.md).
