-- Seed Educação P0

-- Escola
INSERT INTO escolas (id, nome)
VALUES (gen_random_uuid(), 'Escola Municipal Modelo')
ON CONFLICT (id) DO NOTHING;

-- Turma
WITH escola AS (
    SELECT id FROM escolas WHERE nome = 'Escola Municipal Modelo' LIMIT 1
)
INSERT INTO turmas (id, nome, turno, escola_id)
SELECT gen_random_uuid(), '7º ANO E', 'VESPERTINO', e.id
FROM escola e
WHERE NOT EXISTS (SELECT 1 FROM turmas WHERE nome = '7º ANO E')
ON CONFLICT (id) DO NOTHING;

-- Alunos e matrículas
WITH turma AS (
    SELECT id FROM turmas WHERE nome = '7º ANO E' LIMIT 1
)
INSERT INTO alunos (nome, matricula)
SELECT 'ALUNO ' || LPAD(i::text, 2, '0') AS nome,
       'M2025' || LPAD(i::text, 4, '0') AS matricula
FROM generate_series(1, 30) s(i)
ON CONFLICT (matricula) DO NOTHING;

WITH turma AS (
    SELECT id FROM turmas WHERE nome = '7º ANO E' LIMIT 1
)
INSERT INTO matriculas (aluno_id, turma_id)
SELECT a.id, t.id
FROM alunos a
CROSS JOIN turma t
LEFT JOIN matriculas m ON m.aluno_id = a.id AND m.turma_id = t.id
WHERE m.id IS NULL;

-- Professores vinculados
WITH turma AS (
    SELECT id FROM turmas WHERE nome = '7º ANO E' LIMIT 1
),
usuarios_prof AS (
    SELECT id FROM usuarios WHERE email IN ('admin@prefeitura.local','secretario.saude@prefeitura.local')
)
INSERT INTO professores_turmas (professor_id, turma_id, disciplinas)
SELECT up.id, t.id, ARRAY['LP']::TEXT[]
FROM usuarios_prof up
CROSS JOIN turma t
ON CONFLICT (professor_id, turma_id) DO NOTHING;

-- Aulas do dia atual
WITH turma AS (
    SELECT id FROM turmas WHERE nome = '7º ANO E' LIMIT 1
),
prof AS (
    SELECT id FROM usuarios WHERE email IN ('admin@prefeitura.local','secretario.saude@prefeitura.local')
    ORDER BY CASE WHEN email = 'admin@prefeitura.local' THEN 0 ELSE 1 END
    LIMIT 1
),
slots AS (
    SELECT generate_series(0,2) AS slot
)
INSERT INTO aulas (turma_id, disciplina, inicio, fim, criado_por)
SELECT t.id,
       'LP',
       date_trunc('day', now()) + make_interval(hours => 14 + slot),
       date_trunc('day', now()) + make_interval(hours => 15 + slot),
       p.id
FROM slots s
CROSS JOIN turma t
CROSS JOIN prof p
ON CONFLICT DO NOTHING;
