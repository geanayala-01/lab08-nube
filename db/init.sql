-- =========================================================
-- TechStore - Esquema de base de datos
-- =========================================================

CREATE TABLE IF NOT EXISTS tiendas (
    id          SERIAL PRIMARY KEY,
    nombre      VARCHAR(100) NOT NULL UNIQUE,
    ciudad      VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS usuarios (
    id                  SERIAL PRIMARY KEY,
    email               VARCHAR(255) NOT NULL UNIQUE,
    password_hash       VARCHAR(255),                 -- NULL para usuarios de Google/GitHub
    nombre_completo     VARCHAR(150) NOT NULL,
    tienda_id           INT REFERENCES tiendas(id),
    rol                 VARCHAR(20)  NOT NULL DEFAULT 'empleado'
                        CHECK (rol IN ('admin', 'gerente', 'empleado', 'auditor')),
    proveedor           VARCHAR(20)  NOT NULL DEFAULT 'local'
                        CHECK (proveedor IN ('local', 'google', 'github')),
    proveedor_id        VARCHAR(255),
    intentos_fallidos   INT          NOT NULL DEFAULT 0,
    bloqueado_hasta     TIMESTAMPTZ,
    mfa_secret          VARCHAR(255),
    mfa_habilitado      BOOLEAN      NOT NULL DEFAULT FALSE,
    creado_en           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (proveedor, proveedor_id)
);

CREATE TABLE IF NOT EXISTS productos (
    id              SERIAL PRIMARY KEY,
    sku             VARCHAR(50)    NOT NULL UNIQUE,
    nombre          VARCHAR(150)   NOT NULL,
    descripcion     TEXT,
    precio          NUMERIC(10, 2) NOT NULL CHECK (precio >= 0),
    stock           INT            NOT NULL DEFAULT 0 CHECK (stock >= 0),
    tienda_id       INT            NOT NULL REFERENCES tiendas(id),
    actualizado_en  TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- Sesiones de MFA pendientes: se crean tras validar usuario/contraseña
CREATE TABLE IF NOT EXISTS mfa_sesiones (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id  INT         NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    intentos    INT         NOT NULL DEFAULT 0,
    usado       BOOLEAN     NOT NULL DEFAULT FALSE,
    expira_en   TIMESTAMPTZ NOT NULL,
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Registro de eventos de seguridad (lo consulta el Auditor)
CREATE TABLE IF NOT EXISTS auditoria (
    id          SERIAL PRIMARY KEY,
    usuario_id  INT REFERENCES usuarios(id) ON DELETE SET NULL,
    email       VARCHAR(255),
    accion      VARCHAR(50)  NOT NULL,
    detalle     TEXT,
    ip          VARCHAR(64),
    creado_en   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_productos_tienda ON productos(tienda_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON auditoria(creado_en DESC);
