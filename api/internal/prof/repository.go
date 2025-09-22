package prof

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrNotFound  = errors.New("not found")
	ErrForbidden = errors.New("forbidden")
)

const dbTimeout = 3 * time.Second

// Repository encapsula consultas do módulo professor.
type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

type Turma struct {
	ID         uuid.UUID  `json:"id"`
	Nome       string     `json:"nome"`
	Turno      string     `json:"turno"`
	EscolaID   *uuid.UUID `json:"escola_id,omitempty"`
	EscolaNome *string    `json:"escola_nome,omitempty"`
}

type AulaResumo struct {
	ID         uuid.UUID `json:"id"`
	TurmaID    uuid.UUID `json:"turma_id"`
	TurmaNome  string    `json:"turma_nome"`
	Disciplina string    `json:"disciplina"`
	Inicio     time.Time `json:"inicio"`
	Fim        time.Time `json:"fim"`
}

type Aluno struct {
	ID        uuid.UUID `json:"id"`
	Nome      string    `json:"nome"`
	Matricula *string   `json:"matricula,omitempty"`
}

type Avaliacao struct {
	ID         uuid.UUID  `json:"id"`
	TurmaID    uuid.UUID  `json:"turma_id"`
	Disciplina string     `json:"disciplina"`
	Titulo     string     `json:"titulo"`
	Tipo       string     `json:"tipo"`
	Status     string     `json:"status"`
	Data       *time.Time `json:"data,omitempty"`
	Peso       float64    `json:"peso"`
	CreatedAt  time.Time  `json:"created_at"`
	CreatedBy  uuid.UUID  `json:"created_by"`
}

type AvaliacaoQuestao struct {
	ID           uuid.UUID `json:"id"`
	AvaliacaoID  uuid.UUID `json:"avaliacao_id"`
	Enunciado    string    `json:"enunciado"`
	Alternativas []string  `json:"alternativas,omitempty"`
	Correta      *int16    `json:"correta,omitempty"`
}

type NotaResumo struct {
	AlunoID    uuid.UUID `json:"aluno_id"`
	Nome       string    `json:"nome"`
	Matricula  *string   `json:"matricula,omitempty"`
	Nota       *float64  `json:"nota,omitempty"`
	Observacao *string   `json:"observacao,omitempty"`
}

type NotaLancamento struct {
	MatriculaID uuid.UUID `json:"matricula_id"`
	Nota        float64   `json:"nota"`
	Observacao  *string   `json:"observacao,omitempty"`
}

type ChamadaItem struct {
	AlunoID     uuid.UUID `json:"aluno_id"`
	Nome        string    `json:"nome"`
	Matricula   *string   `json:"matricula,omitempty"`
	Status      *string   `json:"status,omitempty"`
	MatriculaID uuid.UUID `json:"matricula_id"`
	Observacao  *string   `json:"observacao,omitempty"`
}

type DiarioEntrada struct {
	ID           uuid.UUID  `json:"id"`
	ProfessorID  uuid.UUID  `json:"professor_id"`
	AlunoID      uuid.UUID  `json:"aluno_id"`
	TurmaID      *uuid.UUID `json:"turma_id,omitempty"`
	Conteudo     string     `json:"conteudo"`
	CriadoEm     time.Time  `json:"criado_em"`
	AtualizadoEm *time.Time `json:"atualizado_em,omitempty"`
}

type Material struct {
	ID          uuid.UUID `json:"id"`
	TurmaID     uuid.UUID `json:"turma_id"`
	ProfessorID uuid.UUID `json:"professor_id"`
	Titulo      string    `json:"titulo"`
	Descricao   *string   `json:"descricao,omitempty"`
	URL         *string   `json:"url,omitempty"`
	CriadoEm    time.Time `json:"criado_em"`
}

type AgendaItem struct {
	ID        uuid.UUID  `json:"id"`
	Tipo      string     `json:"tipo"`
	TurmaID   uuid.UUID  `json:"turma_id"`
	TurmaNome string     `json:"turma_nome"`
	Titulo    string     `json:"titulo"`
	Inicio    time.Time  `json:"inicio"`
	Fim       *time.Time `json:"fim,omitempty"`
}

type FrequenciaAluno struct {
	AlunoID      uuid.UUID `json:"aluno_id"`
	Nome         string    `json:"nome"`
	Matricula    *string   `json:"matricula,omitempty"`
	Presentes    int       `json:"presentes"`
	Faltas       int       `json:"faltas"`
	Justificadas int       `json:"justificadas"`
	Total        int       `json:"total"`
}

type RelatorioAvaliacao struct {
	AvaliacaoID uuid.UUID  `json:"avaliacao_id"`
	Titulo      string     `json:"titulo"`
	Disciplina  string     `json:"disciplina"`
	Bimestre    int        `json:"bimestre"`
	Media       *float64   `json:"media,omitempty"`
	AplicadaEm  *time.Time `json:"aplicada_em,omitempty"`
	Status      string     `json:"status"`
}

type DashboardAnalytics struct {
	Averages    []TurmaMedia      `json:"averages"`
	TopStudents []AlunoMedia      `json:"top_students"`
	Attendance  []TurmaFrequencia `json:"attendance"`
	Alerts      []AlunoAlerta     `json:"alerts"`
}

type TurmaMedia struct {
	TurmaID uuid.UUID `json:"turma_id"`
	Turma   string    `json:"turma"`
	Media   float64   `json:"media"`
}

type AlunoMedia struct {
	AlunoID uuid.UUID `json:"aluno_id"`
	Nome    string    `json:"nome"`
	Turma   string    `json:"turma"`
	Media   float64   `json:"media"`
}

type TurmaFrequencia struct {
	TurmaID    uuid.UUID `json:"turma_id"`
	Turma      string    `json:"turma"`
	Frequencia float64   `json:"frequencia"`
}

type AlunoAlerta struct {
	AlunoID uuid.UUID `json:"aluno_id"`
	Nome    string    `json:"nome"`
	Turma   string    `json:"turma"`
	Motivo  string    `json:"motivo"`
	Valor   float64   `json:"valor"`
}

type LivePresence struct {
	TurmaID      uuid.UUID  `json:"turma_id"`
	Turma        string     `json:"turma"`
	Presentes    int        `json:"presentes"`
	Esperados    int        `json:"esperados"`
	Percentual   float64    `json:"percentual"`
	AtualizadoEm *time.Time `json:"atualizado_em,omitempty"`
}

var turnoRanges = map[string]struct {
	start int
	end   int
}{
	"MANHA": {start: 8, end: 12},
	"TARDE": {start: 13, end: 17},
	"NOITE": {start: 18, end: 22},
}

func turnoWindow(day time.Time, turno string) (time.Time, time.Time) {
	rng, ok := turnoRanges[turno]
	if !ok {
		rng = turnoRanges["MANHA"]
	}
	loc := day.Location()
	start := time.Date(day.Year(), day.Month(), day.Day(), rng.start, 0, 0, 0, loc)
	end := time.Date(day.Year(), day.Month(), day.Day(), rng.end, 0, 0, 0, loc)
	return start, end
}

func normalizeTurno(turno string) string {
	turno = strings.ToUpper(strings.TrimSpace(turno))
	if _, ok := turnoRanges[turno]; ok {
		return turno
	}
	return "MANHA"
}

func (r *Repository) FirstTurma(ctx context.Context, professorID uuid.UUID) (*uuid.UUID, error) {
	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	var turmaID uuid.UUID
	err := r.db.QueryRow(ctx, `
        SELECT turma_id
        FROM professores_turmas
        WHERE professor_id = $1
        ORDER BY turma_id
        LIMIT 1
    `, professorID).Scan(&turmaID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &turmaID, nil
}

func (r *Repository) ListTurmas(ctx context.Context, professorID uuid.UUID) ([]Turma, error) {
	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	rows, err := r.db.Query(ctx, `
		SELECT t.id, t.nome, t.turno, t.escola_id, e.nome
		FROM professores_turmas pt
		JOIN turmas t ON t.id = pt.turma_id
		LEFT JOIN escolas e ON e.id = t.escola_id
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
		if err := rows.Scan(&t.ID, &t.Nome, &t.Turno, &t.EscolaID, &t.EscolaNome); err != nil {
			return nil, err
		}
		turmas = append(turmas, t)
	}
	return turmas, rows.Err()
}

func (r *Repository) CountDistinctAlunos(ctx context.Context, professorID uuid.UUID) (int, error) {
	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	var total int
	err := r.db.QueryRow(ctx, `
        SELECT COALESCE(COUNT(DISTINCT m.aluno_id), 0)
        FROM professores_turmas pt
        JOIN matriculas m ON m.turma_id = pt.turma_id AND m.ativo = TRUE
        WHERE pt.professor_id = $1
    `, professorID).Scan(&total)
	if err != nil {
		return 0, err
	}
	return total, nil
}

func (r *Repository) ListUpcomingAulas(ctx context.Context, professorID uuid.UUID, now time.Time) ([]AulaResumo, error) {
	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	loc := now.Location()
	startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	dayEnd := startOfDay.Add(24 * time.Hour)
	if now.After(startOfDay) {
		startOfDay = now
	}

	rows, err := r.db.Query(ctx, `
        SELECT a.id, a.turma_id, t.nome, a.disciplina, a.inicio, a.fim
        FROM aulas a
        JOIN turmas t ON t.id = a.turma_id
        JOIN professores_turmas pt ON pt.turma_id = a.turma_id AND pt.professor_id = $1
        WHERE a.inicio >= $2 AND a.inicio < $3
        ORDER BY a.inicio
        LIMIT 5
    `, professorID, startOfDay, dayEnd)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var aulas []AulaResumo
	for rows.Next() {
		var a AulaResumo
		if err := rows.Scan(&a.ID, &a.TurmaID, &a.TurmaNome, &a.Disciplina, &a.Inicio, &a.Fim); err != nil {
			return nil, err
		}
		aulas = append(aulas, a)
	}
	return aulas, rows.Err()
}

func (r *Repository) ProfessorHasTurma(ctx context.Context, professorID, turmaID uuid.UUID) (bool, error) {
	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	var exists bool
	if err := r.db.QueryRow(ctx, `
        SELECT EXISTS(
            SELECT 1
            FROM professores_turmas
            WHERE professor_id = $1 AND turma_id = $2
        )
    `, professorID, turmaID).Scan(&exists); err != nil {
		return false, err
	}
	return exists, nil
}

func (r *Repository) EnsureProfessorTurma(ctx context.Context, professorID, turmaID uuid.UUID) error {
	ok, err := r.ProfessorHasTurma(ctx, professorID, turmaID)
	if err != nil {
		return err
	}
	if !ok {
		return ErrForbidden
	}
	return nil
}

func (r *Repository) ensureProfessorAluno(ctx context.Context, professorID, alunoID uuid.UUID) (*uuid.UUID, error) {
	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	var turmaID uuid.UUID
	if err := r.db.QueryRow(ctx, `
        SELECT turma_id
        FROM professor_diario_aluno
        WHERE professor_id = $1 AND aluno_id = $2
        ORDER BY criado_em DESC
        LIMIT 1
    `, professorID, alunoID).Scan(&turmaID); err == nil {
		if turmaID == uuid.Nil {
			return nil, nil
		}
		return &turmaID, nil
	} else if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}

	var turma uuid.UUID
	err := r.db.QueryRow(ctx, `
        SELECT m.turma_id
        FROM matriculas m
        JOIN professores_turmas pt ON pt.turma_id = m.turma_id
        WHERE pt.professor_id = $1 AND m.aluno_id = $2 AND m.ativo = TRUE
        ORDER BY m.turma_id
        LIMIT 1
    `, professorID, alunoID).Scan(&turma)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrForbidden
		}
		return nil, err
	}
	return &turma, nil
}

func (r *Repository) EnsureProfessorAluno(ctx context.Context, professorID, alunoID uuid.UUID) error {
	_, err := r.ensureProfessorAluno(ctx, professorID, alunoID)
	return err
}

func (r *Repository) ListAlunosByTurma(ctx context.Context, turmaID uuid.UUID) ([]Aluno, error) {
	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	rows, err := r.db.Query(ctx, `
        SELECT a.id, a.nome, a.matricula
        FROM matriculas m
        JOIN alunos a ON a.id = m.aluno_id
        WHERE m.turma_id = $1 AND m.ativo = TRUE
        ORDER BY a.nome
    `, turmaID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var alunos []Aluno
	for rows.Next() {
		var a Aluno
		if err := rows.Scan(&a.ID, &a.Nome, &a.Matricula); err != nil {
			return nil, err
		}
		alunos = append(alunos, a)
	}
	return alunos, rows.Err()
}

func (r *Repository) findAula(ctx context.Context, turmaID uuid.UUID, day time.Time, turno string) (*uuid.UUID, error) {
	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	turno = normalizeTurno(turno)
	start, end := turnoWindow(day, turno)

	var aulaID uuid.UUID
	err := r.db.QueryRow(ctx, `
        SELECT id
        FROM aulas
        WHERE turma_id = $1 AND inicio >= $2 AND inicio < $3
        ORDER BY inicio DESC
        LIMIT 1
    `, turmaID, start, end).Scan(&aulaID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &aulaID, nil
}

func (r *Repository) createAula(ctx context.Context, turmaID, professorID uuid.UUID, day time.Time, turno, disciplina string) (uuid.UUID, error) {
	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	turno = normalizeTurno(turno)
	start, end := turnoWindow(day, turno)
	disciplina = strings.TrimSpace(disciplina)
	if disciplina == "" {
		disciplina = "Aula"
	}

	var aulaID uuid.UUID
	err := r.db.QueryRow(ctx, `
        INSERT INTO aulas (turma_id, disciplina, inicio, fim, criado_por)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
    `, turmaID, disciplina, start, end, professorID).Scan(&aulaID)
	if err != nil {
		return uuid.Nil, err
	}
	return aulaID, nil
}

func (r *Repository) FindOrCreateAula(ctx context.Context, turmaID, professorID uuid.UUID, day time.Time, turno, disciplina string) (uuid.UUID, error) {
	if aulaID, err := r.findAula(ctx, turmaID, day, turno); err == nil {
		return *aulaID, nil
	} else if !errors.Is(err, ErrNotFound) {
		return uuid.Nil, err
	}

	return r.createAula(ctx, turmaID, professorID, day, turno, disciplina)
}

func (r *Repository) ListChamadaItens(ctx context.Context, turmaID, aulaID uuid.UUID) ([]ChamadaItem, error) {
	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	rows, err := r.db.Query(ctx, `
        WITH alunos_turma AS (
            SELECT m.id AS matricula_id, m.aluno_id, a.nome, a.matricula
            FROM matriculas m
            JOIN alunos a ON a.id = m.aluno_id
            WHERE m.turma_id = $1 AND m.ativo = TRUE
        )
        SELECT at.aluno_id, at.nome, at.matricula, at.matricula_id, p.status, p.justificativa
        FROM alunos_turma at
        LEFT JOIN presencas p ON p.matricula_id = at.matricula_id AND p.aula_id = $2
        ORDER BY at.nome
    `, turmaID, aulaID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var itens []ChamadaItem
	for rows.Next() {
		var item ChamadaItem
		if err := rows.Scan(&item.AlunoID, &item.Nome, &item.Matricula, &item.MatriculaID, &item.Status, &item.Observacao); err != nil {
			return nil, err
		}
		itens = append(itens, item)
	}
	return itens, rows.Err()
}

func (r *Repository) LastChamadaBefore(ctx context.Context, turmaID uuid.UUID, reference time.Time) (*uuid.UUID, error) {
	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	var aulaID uuid.UUID
	err := r.db.QueryRow(ctx, `
        SELECT id
        FROM aulas
        WHERE turma_id = $1 AND inicio < $2
        ORDER BY inicio DESC
        LIMIT 1
    `, turmaID, reference).Scan(&aulaID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &aulaID, nil
}

func (r *Repository) AulaByID(ctx context.Context, aulaID uuid.UUID) (AulaResumo, error) {
	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	var aula AulaResumo
	err := r.db.QueryRow(ctx, `
        SELECT a.id, a.turma_id, t.nome, a.disciplina, a.inicio, a.fim
        FROM aulas a
        JOIN turmas t ON t.id = a.turma_id
        WHERE a.id = $1
    `, aulaID).Scan(&aula.ID, &aula.TurmaID, &aula.TurmaNome, &aula.Disciplina, &aula.Inicio, &aula.Fim)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return AulaResumo{}, ErrNotFound
		}
		return AulaResumo{}, err
	}
	return aula, nil
}

func (r *Repository) UpsertPresencas(ctx context.Context, aulaID uuid.UUID, itens []ChamadaItem) error {
	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	now := time.Now().UTC()
	batch := &pgx.Batch{}
	for _, item := range itens {
		status := "PRESENTE"
		if item.Status != nil {
			status = strings.ToUpper(strings.TrimSpace(*item.Status))
		}
		var justificativa *string
		if item.Observacao != nil {
			if trimmed := strings.TrimSpace(*item.Observacao); trimmed != "" {
				justificativa = &trimmed
			}
		}
		batch.Queue(`
            INSERT INTO presencas (aula_id, matricula_id, status, origem, justificativa, updated_at)
            VALUES ($1, $2, $3, 'MANUAL', $4, $5)
            ON CONFLICT (aula_id, matricula_id)
            DO UPDATE SET status = EXCLUDED.status, origem = EXCLUDED.origem, justificativa = EXCLUDED.justificativa, updated_at = EXCLUDED.updated_at
        `, aulaID, item.MatriculaID, status, justificativa, now)
	}
	br := tx.SendBatch(ctx, batch)
	if err := br.Close(); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func (r *Repository) InsertAuditoria(ctx context.Context, destino, origem, user uuid.UUID, merge bool) error {
	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	_, err := r.db.Exec(ctx, `
        INSERT INTO chamada_auditoria (aula_destino, aula_origem, merge_biometria, user_id)
        VALUES ($1, $2, $3, $4)
    `, destino, origem, merge, user)
	return err
}

func (r *Repository) MatriculasByTurma(ctx context.Context, turmaID uuid.UUID) (map[uuid.UUID]uuid.UUID, error) {
	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	rows, err := r.db.Query(ctx, `
        SELECT m.aluno_id, m.id
        FROM matriculas m
        WHERE m.turma_id = $1 AND m.ativo = TRUE
    `, turmaID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make(map[uuid.UUID]uuid.UUID)
	for rows.Next() {
		var alunoID, matriculaID uuid.UUID
		if err := rows.Scan(&alunoID, &matriculaID); err != nil {
			return nil, err
		}
		out[alunoID] = matriculaID
	}
	return out, rows.Err()
}

func (r *Repository) ListAlunoDiario(ctx context.Context, professorID, alunoID uuid.UUID) ([]DiarioEntrada, error) {
	if err := r.EnsureProfessorAluno(ctx, professorID, alunoID); err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	rows, err := r.db.Query(ctx, `
        SELECT id, professor_id, aluno_id, turma_id, conteudo, criado_em, atualizado_em
        FROM professor_diario_aluno
        WHERE professor_id = $1 AND aluno_id = $2
        ORDER BY COALESCE(atualizado_em, criado_em) DESC
    `, professorID, alunoID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entradas []DiarioEntrada
	for rows.Next() {
		var entry DiarioEntrada
		if err := rows.Scan(&entry.ID, &entry.ProfessorID, &entry.AlunoID, &entry.TurmaID, &entry.Conteudo, &entry.CriadoEm, &entry.AtualizadoEm); err != nil {
			return nil, err
		}
		entradas = append(entradas, entry)
	}
	return entradas, rows.Err()
}

func (r *Repository) CreateAlunoDiario(ctx context.Context, professorID, alunoID uuid.UUID, turmaID *uuid.UUID, conteudo string) (DiarioEntrada, error) {
	ptr, err := r.ensureProfessorAluno(ctx, professorID, alunoID)
	if err != nil {
		return DiarioEntrada{}, err
	}
	if turmaID == nil {
		turmaID = ptr
	}

	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	var entry DiarioEntrada
	err = r.db.QueryRow(ctx, `
        INSERT INTO professor_diario_aluno (professor_id, aluno_id, turma_id, conteudo)
        VALUES ($1, $2, $3, $4)
        RETURNING id, professor_id, aluno_id, turma_id, conteudo, criado_em, atualizado_em
    `, professorID, alunoID, turmaID, conteudo).Scan(&entry.ID, &entry.ProfessorID, &entry.AlunoID, &entry.TurmaID, &entry.Conteudo, &entry.CriadoEm, &entry.AtualizadoEm)
	if err != nil {
		return DiarioEntrada{}, err
	}
	return entry, nil
}

func (r *Repository) UpdateAlunoDiario(ctx context.Context, professorID, alunoID, anotacaoID uuid.UUID, conteudo string) (DiarioEntrada, error) {
	if err := r.EnsureProfessorAluno(ctx, professorID, alunoID); err != nil {
		return DiarioEntrada{}, err
	}

	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	var entry DiarioEntrada
	err := r.db.QueryRow(ctx, `
        UPDATE professor_diario_aluno
        SET conteudo = $1, atualizado_em = now()
        WHERE id = $2 AND professor_id = $3 AND aluno_id = $4
        RETURNING id, professor_id, aluno_id, turma_id, conteudo, criado_em, atualizado_em
    `, conteudo, anotacaoID, professorID, alunoID).Scan(&entry.ID, &entry.ProfessorID, &entry.AlunoID, &entry.TurmaID, &entry.Conteudo, &entry.CriadoEm, &entry.AtualizadoEm)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return DiarioEntrada{}, ErrNotFound
		}
		return DiarioEntrada{}, err
	}
	return entry, nil
}

func (r *Repository) DeleteAlunoDiario(ctx context.Context, professorID, alunoID, anotacaoID uuid.UUID) error {
	if err := r.EnsureProfessorAluno(ctx, professorID, alunoID); err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	cmd, err := r.db.Exec(ctx, `
        DELETE FROM professor_diario_aluno
        WHERE id = $1 AND professor_id = $2 AND aluno_id = $3
    `, anotacaoID, professorID, alunoID)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Repository) ListMateriais(ctx context.Context, professorID, turmaID uuid.UUID) ([]Material, error) {
	if err := r.EnsureProfessorTurma(ctx, professorID, turmaID); err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	rows, err := r.db.Query(ctx, `
        SELECT id, turma_id, professor_id, titulo, descricao, url, criado_em
        FROM materiais
        WHERE turma_id = $1
        ORDER BY criado_em DESC
    `, turmaID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var materiais []Material
	for rows.Next() {
		var m Material
		if err := rows.Scan(&m.ID, &m.TurmaID, &m.ProfessorID, &m.Titulo, &m.Descricao, &m.URL, &m.CriadoEm); err != nil {
			return nil, err
		}
		materiais = append(materiais, m)
	}
	return materiais, rows.Err()
}

func (r *Repository) CreateMaterial(ctx context.Context, professorID, turmaID uuid.UUID, titulo string, descricao, url *string) (Material, error) {
	if err := r.EnsureProfessorTurma(ctx, professorID, turmaID); err != nil {
		return Material{}, err
	}

	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	var material Material
	err := r.db.QueryRow(ctx, `
        INSERT INTO materiais (turma_id, professor_id, titulo, descricao, url)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, turma_id, professor_id, titulo, descricao, url, criado_em
    `, turmaID, professorID, titulo, descricao, url).Scan(&material.ID, &material.TurmaID, &material.ProfessorID, &material.Titulo, &material.Descricao, &material.URL, &material.CriadoEm)
	if err != nil {
		return Material{}, err
	}
	return material, nil
}

func (r *Repository) ListAgenda(ctx context.Context, professorID uuid.UUID, from, to time.Time) ([]AgendaItem, error) {
	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	rows, err := r.db.Query(ctx, `
        SELECT * FROM (
            SELECT a.id, 'AULA' AS tipo, a.turma_id, t.nome, a.disciplina AS titulo, a.inicio, a.fim
            FROM aulas a
            JOIN turmas t ON t.id = a.turma_id
            JOIN professores_turmas pt ON pt.turma_id = a.turma_id AND pt.professor_id = $1
            WHERE a.inicio BETWEEN $2 AND $3
            UNION ALL
            SELECT av.id, 'AVALIACAO' AS tipo, av.turma_id, t.nome, av.titulo, COALESCE(av.inicio, av.created_at), av.fim
            FROM avaliacoes av
            JOIN turmas t ON t.id = av.turma_id
            JOIN professores_turmas pt ON pt.turma_id = av.turma_id AND pt.professor_id = $1
            WHERE COALESCE(av.inicio, av.created_at) BETWEEN $2 AND $3
        ) eventos
        ORDER BY inicio
    `, professorID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var agenda []AgendaItem
	for rows.Next() {
		var item AgendaItem
		if err := rows.Scan(&item.ID, &item.Tipo, &item.TurmaID, &item.TurmaNome, &item.Titulo, &item.Inicio, &item.Fim); err != nil {
			return nil, err
		}
		agenda = append(agenda, item)
	}
	return agenda, rows.Err()
}

func (r *Repository) RelatorioFrequencia(ctx context.Context, professorID, turmaID uuid.UUID, from, to time.Time) ([]FrequenciaAluno, error) {
	if err := r.EnsureProfessorTurma(ctx, professorID, turmaID); err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	rows, err := r.db.Query(ctx, `
        SELECT a.id, a.nome, a.matricula,
            SUM(CASE WHEN p.status = 'PRESENTE' THEN 1 ELSE 0 END) AS presentes,
            SUM(CASE WHEN p.status = 'FALTA' THEN 1 ELSE 0 END) AS faltas,
            SUM(CASE WHEN p.status = 'JUSTIFICADA' THEN 1 ELSE 0 END) AS justificadas,
            COUNT(p.status) AS total
        FROM matriculas m
        JOIN alunos a ON a.id = m.aluno_id
        LEFT JOIN aulas au ON au.turma_id = m.turma_id AND au.inicio BETWEEN $2 AND $3
        LEFT JOIN presencas p ON p.aula_id = au.id AND p.matricula_id = m.id
        WHERE m.turma_id = $1 AND m.ativo = TRUE
        GROUP BY a.id, a.nome, a.matricula
        ORDER BY a.nome
    `, turmaID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var relatorio []FrequenciaAluno
	for rows.Next() {
		var item FrequenciaAluno
		if err := rows.Scan(&item.AlunoID, &item.Nome, &item.Matricula, &item.Presentes, &item.Faltas, &item.Justificadas, &item.Total); err != nil {
			return nil, err
		}
		relatorio = append(relatorio, item)
	}
	return relatorio, rows.Err()
}

func (r *Repository) RelatorioAvaliacoes(ctx context.Context, professorID, turmaID uuid.UUID, bimestre int) ([]RelatorioAvaliacao, error) {
	if err := r.EnsureProfessorTurma(ctx, professorID, turmaID); err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	rows, err := r.db.Query(ctx, `
        SELECT av.id, av.titulo, av.disciplina, $2::int AS bimestre, AVG(n.nota), av.inicio, av.status
        FROM avaliacoes av
        LEFT JOIN notas n ON n.turma_id = av.turma_id AND n.disciplina = av.disciplina AND n.bimestre = $2
        WHERE av.turma_id = $1
        GROUP BY av.id, av.titulo, av.disciplina, av.inicio, av.status
        ORDER BY av.inicio DESC NULLS LAST, av.created_at DESC
    `, turmaID, bimestre)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var relatorio []RelatorioAvaliacao
	for rows.Next() {
		var item RelatorioAvaliacao
		if err := rows.Scan(&item.AvaliacaoID, &item.Titulo, &item.Disciplina, &item.Bimestre, &item.Media, &item.AplicadaEm, &item.Status); err != nil {
			return nil, err
		}
		relatorio = append(relatorio, item)
	}
	return relatorio, rows.Err()
}

func (r *Repository) DashboardAnalytics(ctx context.Context, professorID uuid.UUID) (DashboardAnalytics, error) {
	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	// Médias por turma
	rows, err := r.db.Query(ctx, `
        SELECT t.id, t.nome, COALESCE(AVG(n.nota), 0)
        FROM turmas t
        JOIN professores_turmas pt ON pt.turma_id = t.id AND pt.professor_id = $1
        LEFT JOIN notas n ON n.turma_id = t.id
        GROUP BY t.id, t.nome
        ORDER BY t.nome
    `, professorID)
	if err != nil {
		return DashboardAnalytics{}, err
	}
	defer rows.Close()

	var medias []TurmaMedia
	for rows.Next() {
		var media TurmaMedia
		if err := rows.Scan(&media.TurmaID, &media.Turma, &media.Media); err != nil {
			return DashboardAnalytics{}, err
		}
		medias = append(medias, media)
	}
	if err := rows.Err(); err != nil {
		return DashboardAnalytics{}, err
	}

	// Top alunos
	topRows, err := r.db.Query(ctx, `
        SELECT a.id, a.nome, t.nome, AVG(n.nota) AS media
        FROM notas n
        JOIN matriculas m ON m.id = n.matricula_id
        JOIN alunos a ON a.id = m.aluno_id
        JOIN turmas t ON t.id = n.turma_id
        JOIN professores_turmas pt ON pt.turma_id = t.id AND pt.professor_id = $1
        GROUP BY a.id, a.nome, t.nome
        ORDER BY media DESC
        LIMIT 10
    `, professorID)
	if err != nil {
		return DashboardAnalytics{}, err
	}
	defer topRows.Close()

	var top []AlunoMedia
	for topRows.Next() {
		var aluno AlunoMedia
		if err := topRows.Scan(&aluno.AlunoID, &aluno.Nome, &aluno.Turma, &aluno.Media); err != nil {
			return DashboardAnalytics{}, err
		}
		top = append(top, aluno)
	}
	if err := topRows.Err(); err != nil {
		return DashboardAnalytics{}, err
	}

	// Frequência por turma (últimos 30 dias)
	thirtyDaysAgo := time.Now().AddDate(0, 0, -30)
	freqRows, err := r.db.Query(ctx, `
        SELECT t.id, t.nome,
            COALESCE(SUM(CASE WHEN p.status = 'PRESENTE' THEN 1 ELSE 0 END)::float / NULLIF(COUNT(p.status),0), 0)
        FROM turmas t
        JOIN professores_turmas pt ON pt.turma_id = t.id AND pt.professor_id = $1
        LEFT JOIN aulas a ON a.turma_id = t.id AND a.inicio >= $2
        LEFT JOIN presencas p ON p.aula_id = a.id
        GROUP BY t.id, t.nome
        ORDER BY t.nome
    `, professorID, thirtyDaysAgo)
	if err != nil {
		return DashboardAnalytics{}, err
	}
	defer freqRows.Close()

	var freq []TurmaFrequencia
	for freqRows.Next() {
		var turma TurmaFrequencia
		if err := freqRows.Scan(&turma.TurmaID, &turma.Turma, &turma.Frequencia); err != nil {
			return DashboardAnalytics{}, err
		}
		freq = append(freq, turma)
	}
	if err := freqRows.Err(); err != nil {
		return DashboardAnalytics{}, err
	}

	// Alertas (alunos com presença < 75% no período)
	alertRows, err := r.db.Query(ctx, `
        SELECT a.id, a.nome, t.nome,
            COALESCE(SUM(CASE WHEN p.status = 'PRESENTE' THEN 1 ELSE 0 END)::float / NULLIF(COUNT(p.status),0), 0) AS freq
        FROM matriculas m
        JOIN alunos a ON a.id = m.aluno_id
        JOIN turmas t ON t.id = m.turma_id
        JOIN professores_turmas pt ON pt.turma_id = t.id AND pt.professor_id = $1
        LEFT JOIN aulas au ON au.turma_id = t.id AND au.inicio >= $2
        LEFT JOIN presencas p ON p.aula_id = au.id AND p.matricula_id = m.id
        WHERE m.ativo = TRUE
        GROUP BY a.id, a.nome, t.nome
        HAVING COALESCE(SUM(CASE WHEN p.status = 'PRESENTE' THEN 1 ELSE 0 END)::float / NULLIF(COUNT(p.status),0), 0) < 0.75
        ORDER BY freq ASC
        LIMIT 10
    `, professorID, thirtyDaysAgo)
	if err != nil {
		return DashboardAnalytics{}, err
	}
	defer alertRows.Close()

	var alerts []AlunoAlerta
	for alertRows.Next() {
		var alert AlunoAlerta
		if err := alertRows.Scan(&alert.AlunoID, &alert.Nome, &alert.Turma, &alert.Valor); err != nil {
			return DashboardAnalytics{}, err
		}
		alert.Motivo = "Frequência abaixo de 75%"
		alerts = append(alerts, alert)
	}
	if err := alertRows.Err(); err != nil {
		return DashboardAnalytics{}, err
	}

	return DashboardAnalytics{
		Averages:    medias,
		TopStudents: top,
		Attendance:  freq,
		Alerts:      alerts,
	}, nil
}

func (r *Repository) LivePresence(ctx context.Context, professorID uuid.UUID) ([]LivePresence, error) {
	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	today := time.Now()
	start := time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, today.Location())
	end := start.Add(24 * time.Hour)

	rows, err := r.db.Query(ctx, `
        WITH turmas_prof AS (
            SELECT t.id, t.nome
            FROM turmas t
            JOIN professores_turmas pt ON pt.turma_id = t.id
            WHERE pt.professor_id = $1
        ),
        aula_recente AS (
            SELECT tp.id AS turma_id, tp.nome, a.id AS aula_id, a.inicio
            FROM turmas_prof tp
            LEFT JOIN LATERAL (
                SELECT a1.id, a1.inicio
                FROM aulas a1
                WHERE a1.turma_id = tp.id AND a1.inicio >= $2 AND a1.inicio < $3
                ORDER BY a1.inicio DESC
                LIMIT 1
            ) a ON true
        ),
        presentes AS (
            SELECT au.turma_id, COUNT(*) AS total
            FROM aula_recente au
            JOIN presencas p ON p.aula_id = au.aula_id AND p.status = 'PRESENTE'
            GROUP BY au.turma_id
        ),
        esperados AS (
            SELECT tp.id AS turma_id, COUNT(m.id) AS total
            FROM turmas_prof tp
            LEFT JOIN matriculas m ON m.turma_id = tp.id AND m.ativo = TRUE
            GROUP BY tp.id
        )
        SELECT au.turma_id,
               au.nome,
               COALESCE(pr.total, 0) AS presentes,
               COALESCE(es.total, 0) AS esperados,
               au.inicio
        FROM aula_recente au
        LEFT JOIN presentes pr ON pr.turma_id = au.turma_id
        LEFT JOIN esperados es ON es.turma_id = au.turma_id
        ORDER BY au.nome;
    `, professorID, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []LivePresence
	for rows.Next() {
		var item LivePresence
		var inicio *time.Time
		if err := rows.Scan(&item.TurmaID, &item.Turma, &item.Presentes, &item.Esperados, &inicio); err != nil {
			return nil, err
		}
		item.AtualizadoEm = inicio
		if item.Esperados > 0 {
			item.Percentual = float64(item.Presentes) / float64(item.Esperados)
		}
		result = append(result, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return result, nil
}

func (r *Repository) ListAvaliacoes(ctx context.Context, professorID, turmaID uuid.UUID) ([]Avaliacao, error) {
	if err := r.EnsureProfessorTurma(ctx, professorID, turmaID); err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	rows, err := r.db.Query(ctx, `
        SELECT a.id, a.turma_id, a.disciplina, a.titulo, a.tipo, a.status, a.inicio, a.peso, a.created_at, a.created_by
        FROM avaliacoes a
        WHERE a.turma_id = $1
        ORDER BY a.created_at DESC
    `, turmaID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []Avaliacao
	for rows.Next() {
		var av Avaliacao
		if err := rows.Scan(&av.ID, &av.TurmaID, &av.Disciplina, &av.Titulo, &av.Tipo, &av.Status, &av.Data, &av.Peso, &av.CreatedAt, &av.CreatedBy); err != nil {
			return nil, err
		}
		list = append(list, av)
	}
	return list, rows.Err()
}

func (r *Repository) InsertAvaliacao(ctx context.Context, turmaID, professorID uuid.UUID, tipo, titulo, disciplina string, data *time.Time, peso float64) (uuid.UUID, error) {
	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	if err := r.EnsureProfessorTurma(ctx, professorID, turmaID); err != nil {
		return uuid.Nil, err
	}

	var avaliacaoID uuid.UUID
	err := r.db.QueryRow(ctx, `
        INSERT INTO avaliacoes (turma_id, disciplina, titulo, tipo, status, inicio, peso, created_by)
        VALUES ($1, $2, $3, $4, 'RASCUNHO', $5, $6, $7)
        RETURNING id
    `, turmaID, disciplina, titulo, tipo, data, peso, professorID).Scan(&avaliacaoID)
	if err != nil {
		return uuid.Nil, err
	}
	return avaliacaoID, nil
}

func (r *Repository) InsertQuestoes(ctx context.Context, avaliacaoID uuid.UUID, questoes []AvaliacaoQuestao) error {
	if len(questoes) == 0 {
		return nil
	}

	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	batch := &pgx.Batch{}
	for _, q := range questoes {
		batch.Queue(`
            INSERT INTO aval_questoes (avaliacao_id, enunciado, alternativas, correta)
            VALUES ($1, $2, $3, $4)
        `, avaliacaoID, q.Enunciado, q.Alternativas, q.Correta)
	}
	br := tx.SendBatch(ctx, batch)
	if err := br.Close(); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func (r *Repository) GetAvaliacao(ctx context.Context, professorID, avaliacaoID uuid.UUID) (Avaliacao, []AvaliacaoQuestao, error) {
	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	var av Avaliacao
	err := r.db.QueryRow(ctx, `
        SELECT a.id, a.turma_id, a.disciplina, a.titulo, a.tipo, a.status, a.inicio, a.peso, a.created_at, a.created_by
        FROM avaliacoes a
        JOIN professores_turmas pt ON pt.turma_id = a.turma_id
        WHERE a.id = $1 AND pt.professor_id = $2
    `, avaliacaoID, professorID).Scan(&av.ID, &av.TurmaID, &av.Disciplina, &av.Titulo, &av.Tipo, &av.Status, &av.Data, &av.Peso, &av.CreatedAt, &av.CreatedBy)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Avaliacao{}, nil, ErrNotFound
		}
		return Avaliacao{}, nil, err
	}

	rows, err := r.db.Query(ctx, `
        SELECT id, avaliacao_id, enunciado, alternativas, correta
        FROM aval_questoes
        WHERE avaliacao_id = $1
        ORDER BY id
    `, avaliacaoID)
	if err != nil {
		return Avaliacao{}, nil, err
	}
	defer rows.Close()

	var questoes []AvaliacaoQuestao
	for rows.Next() {
		var q AvaliacaoQuestao
		if err := rows.Scan(&q.ID, &q.AvaliacaoID, &q.Enunciado, &q.Alternativas, &q.Correta); err != nil {
			return Avaliacao{}, nil, err
		}
		questoes = append(questoes, q)
	}

	return av, questoes, rows.Err()
}

func (r *Repository) UpdateAvaliacaoStatus(ctx context.Context, professorID, avaliacaoID uuid.UUID, status string) error {
	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	cmd, err := r.db.Exec(ctx, `
        UPDATE avaliacoes
        SET status = $1
        WHERE id = $2 AND turma_id IN (
            SELECT turma_id FROM professores_turmas WHERE professor_id = $3
        )
    `, status, avaliacaoID, professorID)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Repository) UpsertNotas(ctx context.Context, professorID, avaliacaoID uuid.UUID, disciplina string, turmaID uuid.UUID, bimestre int, notas []NotaLancamento) error {
	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	if err := r.EnsureProfessorTurma(ctx, professorID, turmaID); err != nil {
		return err
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	batch := &pgx.Batch{}
	for _, item := range notas {
		batch.Queue(`
            INSERT INTO notas (turma_id, disciplina, bimestre, matricula_id, nota, obs)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (turma_id, disciplina, bimestre, matricula_id)
            DO UPDATE SET nota = EXCLUDED.nota, obs = EXCLUDED.obs
        `, turmaID, disciplina, bimestre, item.MatriculaID, item.Nota, item.Observacao)
	}

	br := tx.SendBatch(ctx, batch)
	if err := br.Close(); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func (r *Repository) ListNotasBimestre(ctx context.Context, professorID, turmaID uuid.UUID, bimestre int) ([]NotaResumo, error) {
	if err := r.EnsureProfessorTurma(ctx, professorID, turmaID); err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	rows, err := r.db.Query(ctx, `
        SELECT a.id, a.nome, a.matricula, n.nota, n.obs
        FROM matriculas m
        JOIN alunos a ON a.id = m.aluno_id
        LEFT JOIN notas n ON n.matricula_id = m.id AND n.turma_id = $1 AND n.bimestre = $2
        WHERE m.turma_id = $1 AND m.ativo = TRUE
        ORDER BY a.nome
    `, turmaID, bimestre)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []NotaResumo
	for rows.Next() {
		var item NotaResumo
		if err := rows.Scan(&item.AlunoID, &item.Nome, &item.Matricula, &item.Nota, &item.Observacao); err != nil {
			return nil, err
		}
		list = append(list, item)
	}

	return list, rows.Err()
}
