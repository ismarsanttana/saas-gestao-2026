ALTER TABLE presencas
    ADD COLUMN IF NOT EXISTS justificativa TEXT;

CREATE TABLE IF NOT EXISTS professor_diario_aluno (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    professor_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    aluno_id UUID NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
    turma_id UUID REFERENCES turmas(id) ON DELETE SET NULL,
    conteudo TEXT NOT NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_prof_diario_prof_aluno
    ON professor_diario_aluno(professor_id, aluno_id);
