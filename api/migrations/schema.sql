CREATE FUNCTION trigger_set_timestamp() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE tenants (
    id UUID PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    domain TEXT NOT NULL UNIQUE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tenants_domain ON tenants (domain);
CREATE INDEX idx_tenants_slug ON tenants (slug);

CREATE TABLE saas_users (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE secretarias (
    id UUID PRIMARY KEY,
    nome TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    ativa BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_secretarias_slug ON secretarias (slug);

CREATE TABLE usuarios (
    id UUID PRIMARY KEY,
    nome TEXT,
    email TEXT UNIQUE NOT NULL,
    senha_hash TEXT NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_usuarios_email ON usuarios (email);

CREATE TABLE cidadaos (
    id UUID PRIMARY KEY,
    nome TEXT,
    email TEXT UNIQUE,
    senha_hash TEXT,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cidadaos_email ON cidadaos (email);

CREATE TABLE usuarios_secretarias (
    usuario_id UUID NOT NULL,
    secretaria_id UUID NOT NULL,
    papel TEXT NOT NULL CHECK (papel IN ('ATENDENTE', 'SECRETARIO', 'PREFEITO', 'ADMIN_TEC')),
    PRIMARY KEY (usuario_id, secretaria_id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE,
    FOREIGN KEY (secretaria_id) REFERENCES secretarias (id) ON DELETE CASCADE
);

CREATE INDEX idx_usuarios_secretarias_secretaria ON usuarios_secretarias (secretaria_id);
CREATE INDEX idx_usuarios_secretarias_usuario_papel ON usuarios_secretarias (usuario_id, papel);

CREATE TABLE tokens_refresh (
    id UUID PRIMARY KEY,
    subject UUID NOT NULL,
    audience TEXT NOT NULL CHECK (audience IN ('backoffice', 'cidadao')),
    token_hash TEXT UNIQUE NOT NULL,
    expiracao TIMESTAMPTZ NOT NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revogado BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_tokens_refresh_subject_audience_expiracao
    ON tokens_refresh (subject, audience, expiracao);

CREATE TABLE matriculas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aluno_id UUID NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
    turma_id UUID NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (aluno_id, turma_id)
);

CREATE TABLE aulas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    turma_id UUID NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
    disciplina TEXT NOT NULL,
    inicio TIMESTAMPTZ NOT NULL,
    fim TIMESTAMPTZ NOT NULL,
    criado_por UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE presencas (
    aula_id UUID NOT NULL REFERENCES aulas(id) ON DELETE CASCADE,
    matricula_id UUID NOT NULL REFERENCES matriculas(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('PRESENTE','FALTA','ATRASO','JUSTIFICADA')),
    origem TEXT NOT NULL DEFAULT 'MANUAL',
    justificativa TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (aula_id, matricula_id)
);

CREATE TABLE professor_diario_aluno (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    professor_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    aluno_id UUID NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
    turma_id UUID REFERENCES turmas(id) ON DELETE SET NULL,
    conteudo TEXT NOT NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ
);

CREATE TABLE webauthn_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    credential_id BYTEA UNIQUE NOT NULL,
    public_key BYTEA NOT NULL,
    sign_count BIGINT NOT NULL DEFAULT 0,
    transports TEXT[],
    aaguid BYTEA,
    nickname TEXT,
    cloned BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ
);
