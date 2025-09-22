CREATE TABLE IF NOT EXISTS tokens_refresh (
    id UUID PRIMARY KEY,
    subject UUID NOT NULL,
    audience TEXT NOT NULL CHECK (audience IN ('backoffice', 'cidadao')),
    token_hash TEXT UNIQUE NOT NULL,
    expiracao TIMESTAMPTZ NOT NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revogado BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_tokens_refresh_subject_audience_expiracao
    ON tokens_refresh (subject, audience, expiracao);
