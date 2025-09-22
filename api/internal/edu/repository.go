package edu

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	errNotFound = errors.New("not found")
)

const dbTimeout = 3 * time.Second

// Repository fornece acesso aos dados de educação.
type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

type Turma struct {
	ID    uuid.UUID `json:"id"`
	Nome  string    `json:"nome"`
	Turno string    `json:"turno"`
}

type Aula struct {
	ID         uuid.UUID `json:"id"`
	TurmaID    uuid.UUID `json:"turma_id"`
	TurmaNome  string    `json:"turma_nome"`
	Disciplina string    `json:"disciplina"`
	Inicio     time.Time `json:"inicio"`
	Fim        time.Time `json:"fim"`
}

type ChamadaAluno struct {
	MatriculaID uuid.UUID `json:"matricula_id"`
	AlunoNome   string    `json:"aluno_nome"`
	Matricula   string    `json:"matricula"`
	Status      *string   `json:"status,omitempty"`
}

type AulaResumo struct {
	Aula  Aula
	Owner uuid.UUID
}

type Nota struct {
	ID          uuid.UUID `json:"id"`
	MatriculaID uuid.UUID `json:"matricula_id"`
	Nota        float64   `json:"nota"`
	Obs         *string   `json:"obs,omitempty"`
	AlunoNome   string    `json:"aluno_nome"`
	Matricula   string    `json:"matricula"`
}

type Avaliacao struct {
	ID         uuid.UUID  `json:"id"`
	TurmaID    uuid.UUID  `json:"turma_id"`
	Disciplina string     `json:"disciplina"`
	Titulo     string     `json:"titulo"`
	Status     string     `json:"status"`
	Inicio     *time.Time `json:"inicio,omitempty"`
	Fim        *time.Time `json:"fim,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
	CreatedBy  uuid.UUID  `json:"created_by"`
}

type AvaliacaoQuestao struct {
	ID           uuid.UUID `json:"id"`
	Enunciado    string    `json:"enunciado"`
	Alternativas []string  `json:"alternativas"`
	Correta      int16     `json:"correta"`
}

type PresencaItem struct {
	MatriculaID uuid.UUID
	Status      string
}

type NotaItem struct {
	MatriculaID uuid.UUID
	Nota        float64
	Obs         *string
}

func (r *Repository) ListTurmas(ctx context.Context, professorID uuid.UUID) ([]Turma, error) {
	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	rows, err := r.db.Query(ctx, `
		SELECT t.id, t.nome, t.turno
		FROM professores_turmas pt
		JOIN turmas t ON t.id = pt.turma_id
		WHERE pt.professor_id = $1
		ORDER BY t.nome
	`, professorID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var turmas []Turma
	for rows.Next() {
		var t Turma
		if err := rows.Scan(&t.ID, &t.Nome, &t.Turno); err != nil {
			return nil, err
		}
		turmas = append(turmas, t)
	}

	return turmas, rows.Err()
}

func (r *Repository) ListAulasByDate(ctx context.Context, professorID uuid.UUID, day time.Time) ([]Aula, error) {
	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	start := time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, day.Location())
	end := start.Add(24 * time.Hour)

	rows, err := r.db.Query(ctx, `
		SELECT a.id, a.turma_id, t.nome, a.disciplina, a.inicio, a.fim
		FROM aulas a
		JOIN turmas t ON t.id = a.turma_id
		JOIN professores_turmas pt ON pt.turma_id = a.turma_id AND pt.professor_id = $1
		WHERE a.inicio >= $2 AND a.inicio < $3
		ORDER BY a.inicio
	`, professorID, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var aulas []Aula
	for rows.Next() {
		var a Aula
		if err := rows.Scan(&a.ID, &a.TurmaID, &a.TurmaNome, &a.Disciplina, &a.Inicio, &a.Fim); err != nil {
			return nil, err
		}
		aulas = append(aulas, a)
	}
	return aulas, rows.Err()
}

func (r *Repository) GetAulaChamada(ctx context.Context, professorID, aulaID uuid.UUID) (Aula, []ChamadaAluno, error) {
	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	var aula Aula
	err := r.db.QueryRow(ctx, `
		SELECT a.id, a.turma_id, t.nome, a.disciplina, a.inicio, a.fim
		FROM aulas a
		JOIN turmas t ON t.id = a.turma_id
		JOIN professores_turmas pt ON pt.turma_id = a.turma_id AND pt.professor_id = $1
		WHERE a.id = $2
	`, professorID, aulaID).Scan(&aula.ID, &aula.TurmaID, &aula.TurmaNome, &aula.Disciplina, &aula.Inicio, &aula.Fim)
	if errors.Is(err, pgx.ErrNoRows) {
		return aula, nil, errNotFound
	}
	if err != nil {
		return aula, nil, err
	}

	rows, err := r.db.Query(ctx, `
		SELECT m.id, al.nome, al.matricula, p.status
		FROM matriculas m
		JOIN alunos al ON al.id = m.aluno_id
		LEFT JOIN presencas p ON p.aula_id = $1 AND p.matricula_id = m.id
		WHERE m.turma_id = $2 AND m.ativo = TRUE
		ORDER BY al.nome
	`, aula.ID, aula.TurmaID)
	if err != nil {
		return aula, nil, err
	}
	defer rows.Close()

	var alunos []ChamadaAluno
	for rows.Next() {
		var item ChamadaAluno
		if err := rows.Scan(&item.MatriculaID, &item.AlunoNome, &item.Matricula, &item.Status); err != nil {
			return aula, nil, err
		}
		alunos = append(alunos, item)
	}
	return aula, alunos, rows.Err()
}

func (r *Repository) FindRepeatSource(ctx context.Context, professorID, aulaID uuid.UUID) (*uuid.UUID, error) {
	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	var turmaID uuid.UUID
	var inicio time.Time
	if err := r.db.QueryRow(ctx, `
		SELECT a.turma_id, a.inicio
		FROM aulas a
		JOIN professores_turmas pt ON pt.turma_id = a.turma_id AND pt.professor_id = $1
		WHERE a.id = $2
	`, professorID, aulaID).Scan(&turmaID, &inicio); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errNotFound
		}
		return nil, err
	}

	var source uuid.UUID
	err := r.db.QueryRow(ctx, `
		SELECT a2.id
		FROM aulas a2
		WHERE a2.turma_id = $1
		  AND a2.id <> $2
		  AND DATE(a2.inicio) = DATE($3)
		ORDER BY a2.inicio DESC
		LIMIT 1
	`, turmaID, aulaID, inicio).Scan(&source)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errNotFound
	}
	if err != nil {
		return nil, err
	}
	return &source, nil
}

func (r *Repository) RepeatPresencas(ctx context.Context, aulaDestino, aulaOrigem, userID uuid.UUID, mergeBiometria bool) error {
	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	tx, err := r.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	rows, err := tx.Query(ctx, `
		SELECT matricula_id, status, origem
		FROM presencas
		WHERE aula_id = $1
	`, aulaOrigem)
	if err != nil {
		return err
	}
	defer rows.Close()

	type entry struct {
		MatriculaID uuid.UUID
		Status      string
		Origem      string
	}
	var entries []entry
	for rows.Next() {
		var e entry
		if err := rows.Scan(&e.MatriculaID, &e.Status, &e.Origem); err != nil {
			return err
		}
		if mergeBiometria && e.Origem == "BIOMETRIA" {
			e.Origem = "MERGE"
		}
		if !mergeBiometria {
			e.Origem = "REPETICAO"
		}
		entries = append(entries, e)
	}
	if err := rows.Err(); err != nil {
		return err
	}

	for _, e := range entries {
		if _, err := tx.Exec(ctx, `
			INSERT INTO presencas (aula_id, matricula_id, status, origem, updated_at)
			VALUES ($1,$2,$3,$4,now())
			ON CONFLICT (aula_id, matricula_id)
			DO UPDATE SET status = EXCLUDED.status, origem = EXCLUDED.origem, updated_at = now()
		`, aulaDestino, e.MatriculaID, e.Status, e.Origem); err != nil {
			return err
		}
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO chamada_auditoria (aula_destino, aula_origem, merge_biometria, user_id)
		VALUES ($1,$2,$3,$4)
	`, aulaDestino, aulaOrigem, mergeBiometria, userID); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func (r *Repository) UpsertPresencas(ctx context.Context, aulaID uuid.UUID, itens []PresencaItem) error {
	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	tx, err := r.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	for _, item := range itens {
		if _, err := tx.Exec(ctx, `
			INSERT INTO presencas (aula_id, matricula_id, status, origem, updated_at)
			VALUES ($1,$2,$3,'MANUAL',now())
			ON CONFLICT (aula_id, matricula_id)
			DO UPDATE SET status = EXCLUDED.status, origem = 'MANUAL', updated_at = now()
		`, aulaID, item.MatriculaID, item.Status); err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func (r *Repository) ListNotas(ctx context.Context, professorID, turmaID uuid.UUID, disciplina string, bimestre int) ([]Nota, error) {
	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	rows, err := r.db.Query(ctx, `
		SELECT n.id, n.matricula_id, n.nota, n.obs, al.nome, al.matricula
		FROM matriculas m
		JOIN alunos al ON al.id = m.aluno_id
		LEFT JOIN notas n ON n.matricula_id = m.id AND n.turma_id = m.turma_id AND n.disciplina = $3 AND n.bimestre = $4
		JOIN professores_turmas pt ON pt.turma_id = m.turma_id AND pt.professor_id = $1
		WHERE m.turma_id = $2 AND m.ativo = TRUE
		ORDER BY al.nome
	`, professorID, turmaID, disciplina, bimestre)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var notas []Nota
	for rows.Next() {
		var n Nota
		if err := rows.Scan(&n.ID, &n.MatriculaID, &n.Nota, &n.Obs, &n.AlunoNome, &n.Matricula); err != nil {
			return nil, err
		}
		notas = append(notas, n)
	}
	return notas, rows.Err()
}

func (r *Repository) UpsertNotas(ctx context.Context, turmaID uuid.UUID, disciplina string, bimestre int, itens []NotaItem) error {
	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	tx, err := r.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	for _, item := range itens {
		if _, err := tx.Exec(ctx, `
			INSERT INTO notas (turma_id, disciplina, bimestre, matricula_id, nota, obs)
			VALUES ($1,$2,$3,$4,$5,$6)
			ON CONFLICT (turma_id, disciplina, bimestre, matricula_id)
			DO UPDATE SET nota = EXCLUDED.nota, obs = EXCLUDED.obs
		`, turmaID, disciplina, bimestre, item.MatriculaID, item.Nota, item.Obs); err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func (r *Repository) ListAvaliacoes(ctx context.Context, professorID uuid.UUID, turmaID *uuid.UUID, disciplina string) ([]Avaliacao, error) {
	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	rows, err := r.db.Query(ctx, `
        SELECT a.id, a.turma_id, a.disciplina, a.titulo, a.status, a.inicio, a.fim, a.created_at, a.created_by
        FROM avaliacoes a
        JOIN professores_turmas pt ON pt.turma_id = a.turma_id AND pt.professor_id = $1
        WHERE ($2::uuid IS NULL OR a.turma_id = $2)
          AND ($3 = '' OR a.disciplina = $3)
        ORDER BY a.created_at DESC
    `, professorID, turmaID, disciplina)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var avaliaciones []Avaliacao
	for rows.Next() {
		var a Avaliacao
		if err := rows.Scan(&a.ID, &a.TurmaID, &a.Disciplina, &a.Titulo, &a.Status, &a.Inicio, &a.Fim, &a.CreatedAt, &a.CreatedBy); err != nil {
			return nil, err
		}
		avaliaciones = append(avaliaciones, a)
	}
	return avaliaciones, rows.Err()
}

func (r *Repository) SaveAvaliacao(ctx context.Context, avaliacao Avaliacao, questoes []AvaliacaoQuestao) (uuid.UUID, error) {
	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	tx, err := r.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return uuid.Nil, err
	}
	defer tx.Rollback(ctx)

	id := avaliacao.ID
	if id == uuid.Nil {
		if err := tx.QueryRow(ctx, `
			INSERT INTO avaliacoes (turma_id, disciplina, titulo, status, inicio, fim, created_by)
			VALUES ($1,$2,$3,$4,$5,$6,$7)
			RETURNING id, created_at
		`, avaliacao.TurmaID, avaliacao.Disciplina, avaliacao.Titulo, avaliacao.Status, avaliacao.Inicio, avaliacao.Fim, avaliacao.CreatedBy).Scan(&id, &avaliacao.CreatedAt); err != nil {
			return uuid.Nil, err
		}
	} else {
		if _, err := tx.Exec(ctx, `
			UPDATE avaliacoes
			SET turma_id=$1, disciplina=$2, titulo=$3, status=$4, inicio=$5, fim=$6
			WHERE id=$7
		`, avaliacao.TurmaID, avaliacao.Disciplina, avaliacao.Titulo, avaliacao.Status, avaliacao.Inicio, avaliacao.Fim, id); err != nil {
			return uuid.Nil, err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM aval_questoes WHERE avaliacao_id = $1`, id); err != nil {
			return uuid.Nil, err
		}
	}

	for _, q := range questoes {
		if _, err := tx.Exec(ctx, `
			INSERT INTO aval_questoes (avaliacao_id, enunciado, alternativas, correta)
			VALUES ($1,$2,$3,$4)
		`, id, q.Enunciado, q.Alternativas, q.Correta); err != nil {
			return uuid.Nil, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return uuid.Nil, err
	}
	return id, nil
}

func (r *Repository) UpdateAvaliacaoStatus(ctx context.Context, avaliacaoID uuid.UUID, status string) error {
	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	_, err := r.db.Exec(ctx, `UPDATE avaliacoes SET status=$1 WHERE id=$2`, status, avaliacaoID)
	return err
}

func (r *Repository) ListQuestoes(ctx context.Context, avaliacaoID uuid.UUID) ([]AvaliacaoQuestao, error) {
	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	rows, err := r.db.Query(ctx, `
		SELECT id, enunciado, alternativas, correta
		FROM aval_questoes
		WHERE avaliacao_id = $1
		ORDER BY id
	`, avaliacaoID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var questoes []AvaliacaoQuestao
	for rows.Next() {
		var q AvaliacaoQuestao
		if err := rows.Scan(&q.ID, &q.Enunciado, &q.Alternativas, &q.Correta); err != nil {
			return nil, err
		}
		questoes = append(questoes, q)
	}
	return questoes, rows.Err()
}

type Resposta struct {
	MatriculaID uuid.UUID
	QuestaoID   uuid.UUID
	Alternativa *int16
}

func (r *Repository) ListRespostas(ctx context.Context, avaliacaoID uuid.UUID) ([]Resposta, error) {
	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	rows, err := r.db.Query(ctx, `
        SELECT matricula_id, questao_id, alternativa
		FROM aval_respostas
		WHERE avaliacao_id = $1
	`, avaliacaoID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var itens []Resposta
	for rows.Next() {
		var resp Resposta
		if err := rows.Scan(&resp.MatriculaID, &resp.QuestaoID, &resp.Alternativa); err != nil {
			return nil, err
		}
		itens = append(itens, resp)
	}
	return itens, rows.Err()
}

func (r *Repository) UpsertNotaFromAvaliacao(ctx context.Context, turmaID uuid.UUID, disciplina string, bimestre int, matriculaID uuid.UUID, nota float64) error {
	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	_, err := r.db.Exec(ctx, `
		INSERT INTO notas (turma_id, disciplina, bimestre, matricula_id, nota)
		VALUES ($1,$2,$3,$4,$5)
		ON CONFLICT (turma_id, disciplina, bimestre, matricula_id)
		DO UPDATE SET nota = EXCLUDED.nota
	`, turmaID, disciplina, bimestre, matriculaID, nota)
	return err
}

func (r *Repository) GetAvaliacao(ctx context.Context, avaliacaoID uuid.UUID) (Avaliacao, error) {
	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	var a Avaliacao
	err := r.db.QueryRow(ctx, `
        SELECT id, turma_id, disciplina, titulo, status, inicio, fim, created_at, created_by
        FROM avaliacoes
        WHERE id = $1
    `, avaliacaoID).Scan(&a.ID, &a.TurmaID, &a.Disciplina, &a.Titulo, &a.Status, &a.Inicio, &a.Fim, &a.CreatedAt, &a.CreatedBy)
	if errors.Is(err, pgx.ErrNoRows) {
		return a, errNotFound
	}
	return a, err
}

func (r *Repository) EnsureProfessorTurma(ctx context.Context, professorID, turmaID uuid.UUID) error {
	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	var exists bool
	err := r.db.QueryRow(ctx, `
		SELECT TRUE
		FROM professores_turmas
		WHERE professor_id = $1 AND turma_id = $2
	`, professorID, turmaID).Scan(&exists)
	if errors.Is(err, pgx.ErrNoRows) {
		return errNotFound
	}
	return err
}

func (r *Repository) AulaOwner(ctx context.Context, aulaID uuid.UUID) (uuid.UUID, error) {
	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	var turmaID uuid.UUID
	err := r.db.QueryRow(ctx, `SELECT turma_id FROM aulas WHERE id = $1`, aulaID).Scan(&turmaID)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, errNotFound
	}
	return turmaID, err
}
