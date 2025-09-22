CREATE TABLE IF NOT EXISTS usuarios_secretarias (
    usuario_id UUID NOT NULL,
    secretaria_id UUID NOT NULL,
    papel TEXT NOT NULL CHECK (papel IN ('ATENDENTE', 'SECRETARIO', 'PREFEITO', 'ADMIN_TEC')),
    PRIMARY KEY (usuario_id, secretaria_id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE,
    FOREIGN KEY (secretaria_id) REFERENCES secretarias (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_usuarios_secretarias_secretaria ON usuarios_secretarias (secretaria_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_secretarias_usuario_papel ON usuarios_secretarias (usuario_id, papel);
