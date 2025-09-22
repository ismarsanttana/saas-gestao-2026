-- Migration 005 - Educação P0

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS escolas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS turmas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    turno TEXT NOT NULL,
    escola_id UUID REFERENCES escolas(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_turmas_escola ON turmas(escola_id);

CREATE TABLE IF NOT EXISTS professores_turmas (
    professor_id UUID NOT NULL,
    turma_id UUID NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
    disciplinas TEXT[] NOT NULL DEFAULT '{}',
    PRIMARY KEY (professor_id, turma_id)
);
CREATE INDEX IF NOT EXISTS idx_prof_turma_p ON professores_turmas(professor_id);
CREATE INDEX IF NOT EXISTS idx_prof_turma_t ON professores_turmas(turma_id);

CREATE TABLE IF NOT EXISTS alunos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    matricula TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS matriculas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aluno_id UUID NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
    turma_id UUID NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (aluno_id, turma_id)
);
CREATE INDEX IF NOT EXISTS idx_matriculas_t ON matriculas(turma_id);

CREATE TABLE IF NOT EXISTS aulas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    turma_id UUID NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
    disciplina TEXT NOT NULL,
    inicio TIMESTAMPTZ NOT NULL,
    fim TIMESTAMPTZ NOT NULL,
    criado_por UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_aulas_turma_data ON aulas(turma_id, inicio);

CREATE TABLE IF NOT EXISTS presencas (
    aula_id UUID NOT NULL REFERENCES aulas(id) ON DELETE CASCADE,
    matricula_id UUID NOT NULL REFERENCES matriculas(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('PRESENTE','FALTA','ATRASO','JUSTIFICADA')),
    origem TEXT NOT NULL DEFAULT 'MANUAL',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (aula_id, matricula_id)
);
CREATE INDEX IF NOT EXISTS idx_presencas_aula ON presencas(aula_id);

CREATE TABLE IF NOT EXISTS notas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    turma_id UUID NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
    disciplina TEXT NOT NULL,
    bimestre INT NOT NULL CHECK (bimestre BETWEEN 1 AND 4),
    matricula_id UUID NOT NULL REFERENCES matriculas(id) ON DELETE CASCADE,
    nota NUMERIC(5,2) NOT NULL CHECK (nota BETWEEN 0 AND 100),
    obs TEXT,
    UNIQUE (turma_id, disciplina, bimestre, matricula_id)
);
CREATE INDEX IF NOT EXISTS idx_notas_tdb ON notas(turma_id, disciplina, bimestre);

CREATE TABLE IF NOT EXISTS avaliacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    turma_id UUID NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
    disciplina TEXT NOT NULL,
    titulo TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('RASCUNHO','PUBLICADA','ENCERRADA')) DEFAULT 'RASCUNHO',
    inicio TIMESTAMPTZ,
    fim TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_turma ON avaliacoes(turma_id);

CREATE TABLE IF NOT EXISTS aval_questoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    avaliacao_id UUID NOT NULL REFERENCES avaliacoes(id) ON DELETE CASCADE,
    enunciado TEXT NOT NULL,
    alternativas TEXT[] NOT NULL,
    correta SMALLINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_aval_questoes_av ON aval_questoes(avaliacao_id);

CREATE TABLE IF NOT EXISTS aval_respostas (
    avaliacao_id UUID NOT NULL REFERENCES avaliacoes(id) ON DELETE CASCADE,
    matricula_id UUID NOT NULL REFERENCES matriculas(id) ON DELETE CASCADE,
    questao_id UUID NOT NULL REFERENCES aval_questoes(id) ON DELETE CASCADE,
    alternativa SMALLINT,
    PRIMARY KEY (avaliacao_id, matricula_id, questao_id)
);

CREATE TABLE IF NOT EXISTS chamada_auditoria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aula_destino UUID NOT NULL REFERENCES aulas(id) ON DELETE CASCADE,
    aula_origem  UUID NOT NULL REFERENCES aulas(id) ON DELETE CASCADE,
    merge_biometria BOOLEAN NOT NULL DEFAULT FALSE,
    user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
