DROP TABLE IF EXISTS professor_diario_aluno;

ALTER TABLE presencas
    DROP COLUMN IF EXISTS justificativa;
