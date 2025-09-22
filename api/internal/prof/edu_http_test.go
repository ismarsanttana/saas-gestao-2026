package prof

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	httpmiddleware "github.com/gestaozabele/municipio/internal/http/middleware"
	"github.com/gestaozabele/municipio/internal/repo"
)

type stubService struct {
	overview     *Overview
	turmas       []Turma
	alunos       []Aluno
	err          error
	alunosErr    error
	chamada      *ChamadaResponse
	chamadaErr   error
	salvarErr    error
	diario       []AlunoDiarioEntrada
	diarioErr    error
	diarioEntry  AlunoDiarioEntrada
	avaliacoes   []Avaliacao
	avaliacao    Avaliacao
	questoes     []AvaliacaoQuestao
	avaliacaoErr error
	statusErr    error
	notas        []NotaResumo
	notasErr     error
	materiais    []Material
	materialErr  error
	agenda       []AgendaItem
	frequencia   []FrequenciaAluno
	freqErr      error
	relAval      []RelatorioAvaliacao
	relAvalErr   error
	analytics    DashboardAnalytics
	live         []LivePresence
}

func (s *stubService) GetOverview(_ context.Context, _ uuid.UUID) (*Overview, error) {
	return s.overview, s.err
}

func (s *stubService) ListTurmas(_ context.Context, _ uuid.UUID) ([]Turma, error) {
	return s.turmas, s.err
}

func (s *stubService) ListAlunosByTurma(_ context.Context, _ uuid.UUID, _ uuid.UUID) ([]Aluno, error) {
	return s.alunos, s.alunosErr
}

func (s *stubService) GetChamada(_ context.Context, _ uuid.UUID, _ uuid.UUID, _ time.Time, _ string) (*ChamadaResponse, error) {
	if s.chamada == nil {
		return nil, s.chamadaErr
	}
	return s.chamada, s.chamadaErr
}

func (s *stubService) SalvarChamada(_ context.Context, _ uuid.UUID, _ uuid.UUID, _ SalvarChamadaInput) (uuid.UUID, error) {
	return uuid.New(), s.salvarErr
}

func (s *stubService) ListAlunoDiario(_ context.Context, _ uuid.UUID, _ uuid.UUID) ([]AlunoDiarioEntrada, error) {
	return s.diario, s.diarioErr
}

func (s *stubService) CreateAlunoDiario(_ context.Context, _ uuid.UUID, _ uuid.UUID, _ string) (AlunoDiarioEntrada, error) {
	return s.diarioEntry, s.diarioErr
}

func (s *stubService) UpdateAlunoDiario(_ context.Context, _ uuid.UUID, _ uuid.UUID, _ uuid.UUID, _ string) (AlunoDiarioEntrada, error) {
	return s.diarioEntry, s.diarioErr
}

func (s *stubService) DeleteAlunoDiario(_ context.Context, _ uuid.UUID, _ uuid.UUID, _ uuid.UUID) error {
	return s.diarioErr
}

func (s *stubService) ListAvaliacoes(_ context.Context, _ uuid.UUID, _ uuid.UUID) ([]Avaliacao, error) {
	return s.avaliacoes, s.err
}

func (s *stubService) CreateAvaliacao(_ context.Context, _ uuid.UUID, _ uuid.UUID, _ CreateAvaliacaoInput) (uuid.UUID, error) {
	return uuid.New(), s.err
}

func (s *stubService) GetAvaliacaoDetalhes(_ context.Context, _ uuid.UUID, _ uuid.UUID) (Avaliacao, []AvaliacaoQuestao, error) {
	return s.avaliacao, s.questoes, s.avaliacaoErr
}

func (s *stubService) AtualizarStatusAvaliacao(_ context.Context, _ uuid.UUID, _ uuid.UUID, _ string) error {
	return s.statusErr
}

func (s *stubService) LancarNotas(_ context.Context, _ uuid.UUID, _ uuid.UUID, _ LancarNotasInput) error {
	return s.salvarErr
}

func (s *stubService) ListarNotas(_ context.Context, _ uuid.UUID, _ uuid.UUID, _ int) ([]NotaResumo, error) {
	return s.notas, s.notasErr
}

func (s *stubService) ListMateriais(_ context.Context, _ uuid.UUID, _ uuid.UUID) ([]Material, error) {
	return s.materiais, s.materialErr
}

func (s *stubService) CreateMaterial(_ context.Context, _ uuid.UUID, _ uuid.UUID, titulo string, descricao, url *string) (Material, error) {
	if s.materialErr != nil {
		return Material{}, s.materialErr
	}
	if len(titulo) == 0 {
		return Material{}, errors.New("titulo obrigatório")
	}
	return Material{ID: uuid.New(), Titulo: titulo, Descricao: descricao, URL: url, CriadoEm: time.Now()}, nil
}

func (s *stubService) ListAgenda(_ context.Context, _ uuid.UUID, _ time.Time, _ time.Time) ([]AgendaItem, error) {
	if s.err != nil {
		return nil, s.err
	}
	return s.agenda, nil
}

func (s *stubService) RelatorioFrequencia(_ context.Context, _ uuid.UUID, _ uuid.UUID, _ time.Time, _ time.Time) ([]FrequenciaAluno, error) {
	return s.frequencia, s.freqErr
}

func (s *stubService) RelatorioAvaliacoes(_ context.Context, _ uuid.UUID, _ uuid.UUID, _ int) ([]RelatorioAvaliacao, error) {
	return s.relAval, s.relAvalErr
}

func (s *stubService) DashboardAnalytics(_ context.Context, _ uuid.UUID) (DashboardAnalytics, error) {
	if s.err != nil {
		return DashboardAnalytics{}, s.err
	}
	return s.analytics, nil
}

func (s *stubService) LivePresence(_ context.Context, _ uuid.UUID) ([]LivePresence, error) {
	if s.err != nil {
		return nil, s.err
	}
	return s.live, nil
}

func (s *stubService) UpdateProfile(_ context.Context, professorID uuid.UUID, nome, email string) (*repo.Usuario, error) {
	if s.err != nil {
		return nil, s.err
	}
	return &repo.Usuario{ID: professorID, Nome: nome, Email: email}, nil
}

func TestHandler_GetMe(t *testing.T) {
	profID := uuid.New()
	svc := &stubService{
		overview: &Overview{
			ProfessorName:  "Prof. Teste",
			ProfessorEmail: "prof@example.com",
			Turmas:         []Turma{{ID: uuid.New(), Nome: "Turma A", Turno: "MANHA"}},
			Upcoming:       []AulaResumo{{ID: uuid.New(), TurmaID: uuid.New(), TurmaNome: "Turma A", Disciplina: "Matemática", Inicio: time.Now(), Fim: time.Now().Add(1 * time.Hour)}},
			TotalTurmas:    1,
			TotalAlunos:    30,
		},
	}

	h := NewHandler(svc)
	router := chi.NewRouter()
	h.RegisterRoutes(router)

	req := httptest.NewRequest(http.MethodGet, "/me", nil)
	ctx := context.WithValue(req.Context(), httpmiddleware.ContextKeySubject, profID.String())
	req = req.WithContext(ctx)

	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", res.Code)
	}

	var payload map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	dataRaw, ok := payload["data"]
	if !ok {
		t.Fatalf("expected data field")
	}
	data, ok := dataRaw.(map[string]any)
	if !ok {
		t.Fatalf("expected data to be map, got %T", dataRaw)
	}
	if data["nome"] != "Prof. Teste" {
		t.Fatalf("expected nome Prof. Teste, got %v", data["nome"])
	}
}

func TestHandler_ListTurmas_Unauthorized(t *testing.T) {
	svc := &stubService{turmas: []Turma{}}
	h := NewHandler(svc)
	router := chi.NewRouter()
	h.RegisterRoutes(router)

	req := httptest.NewRequest(http.MethodGet, "/turmas", nil)
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	if res.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d", res.Code)
	}
}

func TestHandler_ListAlunos_Forbidden(t *testing.T) {
	profID := uuid.New()
	svc := &stubService{alunosErr: ErrForbidden}
	h := NewHandler(svc)

	router := chi.NewRouter()
	h.RegisterRoutes(router)

	turmaID := uuid.New()
	req := httptest.NewRequest(http.MethodGet, "/turmas/"+turmaID.String()+"/alunos", nil)
	ctx := context.WithValue(req.Context(), httpmiddleware.ContextKeySubject, profID.String())
	req = req.WithContext(ctx)

	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	if res.Code != http.StatusForbidden {
		t.Fatalf("expected status 403, got %d", res.Code)
	}
}

func TestHandler_GetChamada(t *testing.T) {
	profID := uuid.New()
	turmaID := uuid.New()
	svc := &stubService{
		chamada: &ChamadaResponse{
			Atual: ChamadaView{
				Data:  "2024-01-10",
				Turno: "MANHA",
				Itens: []ChamadaAluno{{AlunoID: uuid.New(), Nome: "Aluno"}},
			},
		},
	}

	h := NewHandler(svc)
	router := chi.NewRouter()
	h.RegisterRoutes(router)

	req := httptest.NewRequest(http.MethodGet, "/turmas/"+turmaID.String()+"/chamada?data=2024-01-10&turno=MANHA", nil)
	ctx := context.WithValue(req.Context(), httpmiddleware.ContextKeySubject, profID.String())
	req = req.WithContext(ctx)

	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected 200 got %d", res.Code)
	}
}

func TestHandler_SaveChamada_Validation(t *testing.T) {
	profID := uuid.New()
	turmaID := uuid.New()
	svc := &stubService{}
	h := NewHandler(svc)
	router := chi.NewRouter()
	h.RegisterRoutes(router)

	req := httptest.NewRequest(http.MethodPost, "/turmas/"+turmaID.String()+"/chamada", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")
	ctx := context.WithValue(req.Context(), httpmiddleware.ContextKeySubject, profID.String())
	req = req.WithContext(ctx)

	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	if res.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", res.Code)
	}
}

func TestHandler_ListAvaliacoes(t *testing.T) {
	profID := uuid.New()
	turmaID := uuid.New()
	svc := &stubService{avaliacoes: []Avaliacao{{ID: uuid.New(), Titulo: "Prova 1"}}}
	h := NewHandler(svc)
	router := chi.NewRouter()
	h.RegisterRoutes(router)

	req := httptest.NewRequest(http.MethodGet, "/turmas/"+turmaID.String()+"/avaliacoes", nil)
	ctx := context.WithValue(req.Context(), httpmiddleware.ContextKeySubject, profID.String())
	req = req.WithContext(ctx)

	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", res.Code)
	}
}

func TestHandler_CreateAvaliacao_Invalid(t *testing.T) {
	profID := uuid.New()
	turmaID := uuid.New()
	svc := &stubService{err: errors.New("invalid")}
	h := NewHandler(svc)
	router := chi.NewRouter()
	h.RegisterRoutes(router)

	req := httptest.NewRequest(http.MethodPost, "/turmas/"+turmaID.String()+"/avaliacoes", strings.NewReader(`{"titulo":""}`))
	req.Header.Set("Content-Type", "application/json")
	ctx := context.WithValue(req.Context(), httpmiddleware.ContextKeySubject, profID.String())
	req = req.WithContext(ctx)

	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	if res.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", res.Code)
	}
}

func TestHandler_ListNotas_RequiresBimestre(t *testing.T) {
	profID := uuid.New()
	turmaID := uuid.New()
	svc := &stubService{}
	h := NewHandler(svc)
	router := chi.NewRouter()
	h.RegisterRoutes(router)

	req := httptest.NewRequest(http.MethodGet, "/turmas/"+turmaID.String()+"/notas", nil)
	ctx := context.WithValue(req.Context(), httpmiddleware.ContextKeySubject, profID.String())
	req = req.WithContext(ctx)

	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	if res.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", res.Code)
	}
}

func TestHandler_ListMateriais(t *testing.T) {
	profID := uuid.New()
	turmaID := uuid.New()
	svc := &stubService{materiais: []Material{{ID: uuid.New(), Titulo: "Slide"}}}
	h := NewHandler(svc)
	router := chi.NewRouter()
	h.RegisterRoutes(router)

	req := httptest.NewRequest(http.MethodGet, "/turmas/"+turmaID.String()+"/materiais", nil)
	ctx := context.WithValue(req.Context(), httpmiddleware.ContextKeySubject, profID.String())
	req = req.WithContext(ctx)

	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", res.Code)
	}
}

func TestHandler_CreateMaterial_Validation(t *testing.T) {
	profID := uuid.New()
	turmaID := uuid.New()
	svc := &stubService{materialErr: errors.New("titulo obrigatório")}
	h := NewHandler(svc)
	router := chi.NewRouter()
	h.RegisterRoutes(router)

	req := httptest.NewRequest(http.MethodPost, "/turmas/"+turmaID.String()+"/materiais", strings.NewReader(`{"titulo":""}`))
	req.Header.Set("Content-Type", "application/json")
	ctx := context.WithValue(req.Context(), httpmiddleware.ContextKeySubject, profID.String())
	req = req.WithContext(ctx)

	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	if res.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", res.Code)
	}
}

func TestHandler_ListAgenda_InvalidDates(t *testing.T) {
	profID := uuid.New()
	svc := &stubService{}
	h := NewHandler(svc)
	router := chi.NewRouter()
	h.RegisterRoutes(router)

	req := httptest.NewRequest(http.MethodGet, "/agenda?from=invalid", nil)
	ctx := context.WithValue(req.Context(), httpmiddleware.ContextKeySubject, profID.String())
	req = req.WithContext(ctx)

	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	if res.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", res.Code)
	}
}

func TestHandler_RelatorioFrequencia_MissingParams(t *testing.T) {
	profID := uuid.New()
	svc := &stubService{}
	h := NewHandler(svc)
	router := chi.NewRouter()
	h.RegisterRoutes(router)

	req := httptest.NewRequest(http.MethodGet, "/relatorios/frequencia", nil)
	ctx := context.WithValue(req.Context(), httpmiddleware.ContextKeySubject, profID.String())
	req = req.WithContext(ctx)

	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	if res.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", res.Code)
	}
}
