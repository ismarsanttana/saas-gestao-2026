package prof

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/gestaozabele/municipio/internal/repo"
	"github.com/gestaozabele/municipio/internal/util"
)

type Service struct {
	users *repo.Queries
	repo  *Repository
}

type Overview struct {
	ProfessorName  string
	ProfessorEmail string
	Turmas         []Turma
	Upcoming       []AulaResumo
	TotalTurmas    int
	TotalAlunos    int
}

type ServiceOption func(*Service)

func NewService(users *repo.Queries, repository *Repository) *Service {
	return &Service{users: users, repo: repository}
}

func (s *Service) GetOverview(ctx context.Context, professorID uuid.UUID) (*Overview, error) {
	usuario, err := s.users.GetUsuarioByID(ctx, professorID)
	if err != nil {
		return nil, err
	}

	turmas, err := s.repo.ListTurmas(ctx, professorID)
	if err != nil {
		return nil, err
	}

	totalTurmas := len(turmas)
	totalAlunos, err := s.repo.CountDistinctAlunos(ctx, professorID)
	if err != nil {
		return nil, err
	}

	now := util.Now()
	upcoming, err := s.repo.ListUpcomingAulas(ctx, professorID, now)
	if err != nil {
		return nil, err
	}

	overview := &Overview{
		ProfessorName:  usuario.Nome,
		ProfessorEmail: usuario.Email,
		Turmas:         turmas,
		Upcoming:       upcoming,
		TotalTurmas:    totalTurmas,
		TotalAlunos:    totalAlunos,
	}

	return overview, nil
}

func (s *Service) ListTurmas(ctx context.Context, professorID uuid.UUID) ([]Turma, error) {
	return s.repo.ListTurmas(ctx, professorID)
}

func (s *Service) ListAlunosByTurma(ctx context.Context, professorID, turmaID uuid.UUID) ([]Aluno, error) {
	if err := s.repo.EnsureProfessorTurma(ctx, professorID, turmaID); err != nil {
		return nil, err
	}

	alunos, err := s.repo.ListAlunosByTurma(ctx, turmaID)
	if err != nil {
		return nil, err
	}
	return alunos, nil
}

func (s *Service) FirstTurmaID(ctx context.Context, professorID uuid.UUID) (*uuid.UUID, error) {
	return s.repo.FirstTurma(ctx, professorID)
}

func (s *Service) UpcomingForDay(ctx context.Context, professorID uuid.UUID, day time.Time) ([]AulaResumo, error) {
	return s.repo.ListUpcomingAulas(ctx, professorID, day)
}

type ChamadaView struct {
	AulaID     *uuid.UUID     `json:"aula_id,omitempty"`
	Data       string         `json:"data"`
	Turno      string         `json:"turno"`
	Disciplina string         `json:"disciplina,omitempty"`
	Itens      []ChamadaAluno `json:"itens"`
}

type ChamadaAluno struct {
	AlunoID       uuid.UUID `json:"aluno_id"`
	Nome          string    `json:"nome"`
	Matricula     *string   `json:"matricula,omitempty"`
	Status        *string   `json:"status,omitempty"`
	Justificativa *string   `json:"justificativa,omitempty"`
}

type ChamadaResponse struct {
	Atual         ChamadaView  `json:"atual"`
	UltimaChamada *ChamadaView `json:"ultima_chamada,omitempty"`
}

type SalvarChamadaInput struct {
	Data       time.Time
	Turno      string
	Disciplina string
	Itens      []SalvarChamadaItem
}

type SalvarChamadaItem struct {
	AlunoID       uuid.UUID
	Status        *string
	Justificativa *string
}

type AlunoDiarioEntrada struct {
	ID           uuid.UUID  `json:"id"`
	AlunoID      uuid.UUID  `json:"aluno_id"`
	ProfessorID  uuid.UUID  `json:"professor_id"`
	TurmaID      *uuid.UUID `json:"turma_id,omitempty"`
	Conteudo     string     `json:"conteudo"`
	CriadoEm     time.Time  `json:"criado_em"`
	AtualizadoEm *time.Time `json:"atualizado_em,omitempty"`
}

func (s *Service) GetChamada(ctx context.Context, professorID, turmaID uuid.UUID, day time.Time, turno string) (*ChamadaResponse, error) {
	if err := s.repo.EnsureProfessorTurma(ctx, professorID, turmaID); err != nil {
		return nil, err
	}

	turno = normalizeTurno(turno)
	aulaID, err := s.repo.findAula(ctx, turmaID, day, turno)
	var itens []ChamadaItem
	if err == nil {
		itens, err = s.repo.ListChamadaItens(ctx, turmaID, *aulaID)
		if err != nil {
			return nil, err
		}
	} else if !errors.Is(err, ErrNotFound) {
		return nil, err
	} else {
		// No aula yet; list students without status
		alunos, err := s.repo.ListAlunosByTurma(ctx, turmaID)
		if err != nil {
			return nil, err
		}
		itens = make([]ChamadaItem, 0, len(alunos))
		for _, aluno := range alunos {
			itens = append(itens, ChamadaItem{AlunoID: aluno.ID, Nome: aluno.Nome, Matricula: aluno.Matricula})
		}
	}

	atual := ChamadaView{
		Data:  day.Format("2006-01-02"),
		Turno: turno,
		Itens: toChamadaAluno(itens),
	}
	if aulaID != nil {
		atual.AulaID = aulaID
		if aula, err := s.repo.AulaByID(ctx, *aulaID); err == nil {
			atual.Disciplina = aula.Disciplina
		}
	}

	start, _ := turnoWindow(day, turno)
	lastID, err := s.repo.LastChamadaBefore(ctx, turmaID, start)
	var ultima *ChamadaView
	if err == nil && lastID != nil {
		lastItens, err := s.repo.ListChamadaItens(ctx, turmaID, *lastID)
		if err != nil {
			return nil, err
		}
		aula, err := s.repo.AulaByID(ctx, *lastID)
		if err != nil {
			return nil, err
		}
		ultimoTurno := inferTurno(aula.Inicio)
		view := ChamadaView{
			AulaID:     lastID,
			Data:       aula.Inicio.Format("2006-01-02"),
			Turno:      ultimoTurno,
			Disciplina: aula.Disciplina,
			Itens:      toChamadaAluno(lastItens),
		}
		ultima = &view
	}

	return &ChamadaResponse{Atual: atual, UltimaChamada: ultima}, nil
}

func (s *Service) SalvarChamada(ctx context.Context, professorID, turmaID uuid.UUID, input SalvarChamadaInput) (uuid.UUID, error) {
	if err := s.repo.EnsureProfessorTurma(ctx, professorID, turmaID); err != nil {
		return uuid.Nil, err
	}

	turno := normalizeTurno(input.Turno)
	aulaID, err := s.repo.FindOrCreateAula(ctx, turmaID, professorID, input.Data, turno, input.Disciplina)
	if err != nil {
		return uuid.Nil, err
	}

	// Map alunos to matriculas
	itens := make([]ChamadaItem, 0, len(input.Itens))
	// Fetch matriculas from repository list to obtain ids
	matriculaIndex, err := s.repo.MatriculasByTurma(ctx, turmaID)
	if err != nil {
		return uuid.Nil, err
	}

	for _, item := range input.Itens {
		matriculaID, ok := matriculaIndex[item.AlunoID]
		if !ok || matriculaID == uuid.Nil {
			return uuid.Nil, errors.New("aluno sem matrícula ativa")
		}
		itens = append(itens, ChamadaItem{
			AlunoID:     item.AlunoID,
			Status:      item.Status,
			MatriculaID: matriculaID,
			Observacao:  item.Justificativa,
		})
	}

	if err := s.repo.UpsertPresencas(ctx, aulaID, itens); err != nil {
		return uuid.Nil, err
	}

	if err := s.repo.InsertAuditoria(ctx, aulaID, aulaID, professorID, false); err != nil {
		return uuid.Nil, err
	}

	return aulaID, nil
}

func (s *Service) ListAlunoDiario(ctx context.Context, professorID, alunoID uuid.UUID) ([]AlunoDiarioEntrada, error) {
	entries, err := s.repo.ListAlunoDiario(ctx, professorID, alunoID)
	if err != nil {
		return nil, err
	}
	return toAlunoDiarioEntrada(entries), nil
}

func (s *Service) CreateAlunoDiario(ctx context.Context, professorID, alunoID uuid.UUID, conteudo string) (AlunoDiarioEntrada, error) {
	conteudo = strings.TrimSpace(conteudo)
	if conteudo == "" {
		return AlunoDiarioEntrada{}, errors.New("conteúdo obrigatório")
	}
	entry, err := s.repo.CreateAlunoDiario(ctx, professorID, alunoID, nil, conteudo)
	if err != nil {
		return AlunoDiarioEntrada{}, err
	}
	return toAlunoDiarioEntrada([]DiarioEntrada{entry})[0], nil
}

func (s *Service) UpdateAlunoDiario(ctx context.Context, professorID, alunoID, anotacaoID uuid.UUID, conteudo string) (AlunoDiarioEntrada, error) {
	conteudo = strings.TrimSpace(conteudo)
	if conteudo == "" {
		return AlunoDiarioEntrada{}, errors.New("conteúdo obrigatório")
	}
	entry, err := s.repo.UpdateAlunoDiario(ctx, professorID, alunoID, anotacaoID, conteudo)
	if err != nil {
		return AlunoDiarioEntrada{}, err
	}
	return toAlunoDiarioEntrada([]DiarioEntrada{entry})[0], nil
}

func (s *Service) DeleteAlunoDiario(ctx context.Context, professorID, alunoID, anotacaoID uuid.UUID) error {
	return s.repo.DeleteAlunoDiario(ctx, professorID, alunoID, anotacaoID)
}

type CreateAvaliacaoInput struct {
	Tipo       string
	Titulo     string
	Disciplina string
	Data       *time.Time
	Peso       float64
	Questoes   []QuestaoInput
}

type QuestaoInput struct {
	Enunciado    string
	Alternativas []string
	Correta      *int
}

type LancarNotasItem struct {
	AlunoID    uuid.UUID
	Nota       float64
	Observacao *string
}

type LancarNotasInput struct {
	Bimestre int
	Itens    []LancarNotasItem
}

func (s *Service) ListAvaliacoes(ctx context.Context, professorID, turmaID uuid.UUID) ([]Avaliacao, error) {
	return s.repo.ListAvaliacoes(ctx, professorID, turmaID)
}

func (s *Service) CreateAvaliacao(ctx context.Context, professorID, turmaID uuid.UUID, input CreateAvaliacaoInput) (uuid.UUID, error) {
	if strings.TrimSpace(input.Titulo) == "" {
		return uuid.Nil, errors.New("titulo obrigatório")
	}
	tipo := strings.ToUpper(strings.TrimSpace(input.Tipo))
	if tipo == "" {
		tipo = "PROVA"
	}
	if input.Peso <= 0 {
		input.Peso = 1
	}
	disciplina := strings.TrimSpace(input.Disciplina)
	if disciplina == "" {
		return uuid.Nil, errors.New("disciplina obrigatória")
	}

	avaliacaoID, err := rInsertAvaliacao(ctx, s.repo, professorID, turmaID, tipo, input.Titulo, disciplina, input.Data, input.Peso)
	if err != nil {
		return uuid.Nil, err
	}

	questoes := make([]AvaliacaoQuestao, 0, len(input.Questoes))
	for idx, q := range input.Questoes {
		enunciado := strings.TrimSpace(q.Enunciado)
		if enunciado == "" {
			return uuid.Nil, errors.New("questão " + strconv.Itoa(idx+1) + " sem enunciado")
		}

		var correta *int16
		if len(q.Alternativas) > 0 {
			if q.Correta == nil {
				return uuid.Nil, errors.New("questão " + strconv.Itoa(idx+1) + " sem resposta correta")
			}
			if *q.Correta < 0 || *q.Correta >= len(q.Alternativas) {
				return uuid.Nil, errors.New("questão " + strconv.Itoa(idx+1) + " com resposta inválida")
			}
			val := int16(*q.Correta)
			correta = &val
		}

		questoes = append(questoes, AvaliacaoQuestao{
			Enunciado:    enunciado,
			Alternativas: q.Alternativas,
			Correta:      correta,
		})
	}

	if err := s.repo.InsertQuestoes(ctx, avaliacaoID, questoes); err != nil {
		return uuid.Nil, err
	}

	return avaliacaoID, nil
}

func rInsertAvaliacao(ctx context.Context, repo *Repository, professorID, turmaID uuid.UUID, tipo, titulo, disciplina string, data *time.Time, peso float64) (uuid.UUID, error) {
	trimmedTitulo := strings.TrimSpace(titulo)
	return repo.InsertAvaliacao(ctx, turmaID, professorID, tipo, trimmedTitulo, disciplina, data, peso)
}

func (s *Service) GetAvaliacaoDetalhes(ctx context.Context, professorID, avaliacaoID uuid.UUID) (Avaliacao, []AvaliacaoQuestao, error) {
	return s.repo.GetAvaliacao(ctx, professorID, avaliacaoID)
}

func (s *Service) AtualizarStatusAvaliacao(ctx context.Context, professorID, avaliacaoID uuid.UUID, status string) error {
	status = strings.ToUpper(strings.TrimSpace(status))
	if status == "" {
		return errors.New("status inválido")
	}
	return s.repo.UpdateAvaliacaoStatus(ctx, professorID, avaliacaoID, status)
}

func (s *Service) LancarNotas(ctx context.Context, professorID, avaliacaoID uuid.UUID, input LancarNotasInput) error {
	if input.Bimestre < 1 || input.Bimestre > 4 {
		return errors.New("bimestre inválido")
	}
	avaliacao, _, err := s.repo.GetAvaliacao(ctx, professorID, avaliacaoID)
	if err != nil {
		return err
	}

	matriculas, err := s.repo.MatriculasByTurma(ctx, avaliacao.TurmaID)
	if err != nil {
		return err
	}

	notas := make([]NotaLancamento, 0, len(input.Itens))
	for _, item := range input.Itens {
		if item.Nota < 0 || item.Nota > 10 {
			return errors.New("nota inválida")
		}
		matriculaID, ok := matriculas[item.AlunoID]
		if !ok {
			return errors.New("aluno sem matrícula ativa")
		}
		notas = append(notas, NotaLancamento{MatriculaID: matriculaID, Nota: item.Nota, Observacao: item.Observacao})
	}

	return s.repo.UpsertNotas(ctx, professorID, avaliacaoID, avaliacao.Disciplina, avaliacao.TurmaID, input.Bimestre, notas)
}

func (s *Service) ListarNotas(ctx context.Context, professorID, turmaID uuid.UUID, bimestre int) ([]NotaResumo, error) {
	if bimestre < 1 || bimestre > 4 {
		return nil, errors.New("bimestre inválido")
	}
	return s.repo.ListNotasBimestre(ctx, professorID, turmaID, bimestre)
}

func (s *Service) ListMateriais(ctx context.Context, professorID, turmaID uuid.UUID) ([]Material, error) {
	return s.repo.ListMateriais(ctx, professorID, turmaID)
}

func (s *Service) CreateMaterial(ctx context.Context, professorID, turmaID uuid.UUID, titulo string, descricao, url *string) (Material, error) {
	titulo = strings.TrimSpace(titulo)
	if titulo == "" {
		return Material{}, errors.New("titulo obrigatório")
	}
	if descricao != nil {
		trimmed := strings.TrimSpace(*descricao)
		descricao = &trimmed
	}
	if url != nil {
		trimmed := strings.TrimSpace(*url)
		if trimmed == "" {
			url = nil
		} else {
			url = &trimmed
		}
	}
	return s.repo.CreateMaterial(ctx, professorID, turmaID, titulo, descricao, url)
}

func (s *Service) ListAgenda(ctx context.Context, professorID uuid.UUID, from, to time.Time) ([]AgendaItem, error) {
	if to.Before(from) {
		return nil, errors.New("intervalo inválido")
	}
	return s.repo.ListAgenda(ctx, professorID, from, to)
}

func (s *Service) RelatorioFrequencia(ctx context.Context, professorID, turmaID uuid.UUID, from, to time.Time) ([]FrequenciaAluno, error) {
	if to.Before(from) {
		return nil, errors.New("intervalo inválido")
	}
	return s.repo.RelatorioFrequencia(ctx, professorID, turmaID, from, to)
}

func (s *Service) RelatorioAvaliacoes(ctx context.Context, professorID, turmaID uuid.UUID, bimestre int) ([]RelatorioAvaliacao, error) {
	if bimestre < 1 || bimestre > 4 {
		return nil, errors.New("bimestre inválido")
	}
	return s.repo.RelatorioAvaliacoes(ctx, professorID, turmaID, bimestre)
}

func (s *Service) DashboardAnalytics(ctx context.Context, professorID uuid.UUID) (DashboardAnalytics, error) {
	return s.repo.DashboardAnalytics(ctx, professorID)
}

func (s *Service) LivePresence(ctx context.Context, professorID uuid.UUID) ([]LivePresence, error) {
	return s.repo.LivePresence(ctx, professorID)
}

func (s *Service) UpdateProfile(ctx context.Context, professorID uuid.UUID, nome, email string) (*repo.Usuario, error) {
	nome = strings.TrimSpace(nome)
	email = strings.TrimSpace(email)
	if nome == "" {
		return nil, errors.New("nome obrigatório")
	}
	if email == "" {
		return nil, errors.New("email obrigatório")
	}

	if err := s.users.UpdateUsuario(ctx, professorID, nome, email); err != nil {
		return nil, err
	}

	usuario, err := s.users.GetUsuarioByID(ctx, professorID)
	if err != nil {
		return nil, err
	}

	return &usuario, nil
}

func toChamadaAluno(items []ChamadaItem) []ChamadaAluno {
	result := make([]ChamadaAluno, 0, len(items))
	for _, item := range items {
		result = append(result, ChamadaAluno{
			AlunoID:       item.AlunoID,
			Nome:          item.Nome,
			Matricula:     item.Matricula,
			Status:        normalizeStatus(item.Status),
			Justificativa: item.Observacao,
		})
	}
	return result
}

func toAlunoDiarioEntrada(items []DiarioEntrada) []AlunoDiarioEntrada {
	result := make([]AlunoDiarioEntrada, 0, len(items))
	for _, item := range items {
		entry := AlunoDiarioEntrada{
			ID:           item.ID,
			AlunoID:      item.AlunoID,
			ProfessorID:  item.ProfessorID,
			TurmaID:      item.TurmaID,
			Conteudo:     item.Conteudo,
			CriadoEm:     item.CriadoEm,
			AtualizadoEm: item.AtualizadoEm,
		}
		result = append(result, entry)
	}
	return result
}

func normalizeStatus(statusPtr *string) *string {
	if statusPtr == nil {
		return nil
	}
	status := strings.ToUpper(strings.TrimSpace(*statusPtr))
	if status == "" {
		return nil
	}
	return &status
}

func inferTurno(t time.Time) string {
	hour := t.Hour()
	for turno, rng := range turnoRanges {
		if hour >= rng.start && hour < rng.end {
			return turno
		}
	}
	return "MANHA"
}
