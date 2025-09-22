CREATE TABLE IF NOT EXISTS usuarios (
    id UUID PRIMARY KEY,
    nome TEXT,
    email TEXT UNIQUE NOT NULL,
    senha_hash TEXT NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios (email);

CREATE TABLE IF NOT EXISTS cidadaos (
    id UUID PRIMARY KEY,
    nome TEXT,
    email TEXT UNIQUE,
    senha_hash TEXT,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cidadaos_email ON cidadaos (email);
