package edu

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"

	httpmiddleware "github.com/gestaozabele/municipio/internal/http/middleware"
)

type stubRepo struct {
	turmas       []Turma
	aulas        []Aula
	chamadaAula  Aula
	alunos       []ChamadaAluno
	notas        []Nota
	avaliacoes   []Avaliacao
	ultimoRepeat uuid.UUID
	avaliacaoID  uuid.UUID
	questaoID    uuid.UUID
	matriculaID  uuid.UUID
}

func (s *stubRepo) ListTurmas(ctx context.Context, professorID uuid.UUID) ([]Turma, error) {
	return s.turmas, nil
}
func (s *stubRepo) ListAulasByDate(ctx context.Context, professorID uuid.UUID, day time.Time) ([]Aula, error) {
	return s.aulas, nil
}
func (s *stubRepo) GetAulaChamada(ctx context.Context, professorID, aulaID uuid.UUID) (Aula, []ChamadaAluno, error) {
	return s.chamadaAula, s.alunos, nil
}
func (s *stubRepo) FindRepeatSource(ctx context.Context, professorID, aulaID uuid.UUID) (*uuid.UUID, error) {
	return &s.ultimoRepeat, nil
}
func (s *stubRepo) RepeatPresencas(ctx context.Context, aulaDestino, aulaOrigem, userID uuid.UUID, merge bool) error {
	return nil
}
func (s *stubRepo) UpsertPresencas(ctx context.Context, aulaID uuid.UUID, itens []PresencaItem) error {
	return nil
}
func (s *stubRepo) ListNotas(ctx context.Context, professorID, turmaID uuid.UUID, disciplina string, bimestre int) ([]Nota, error) {
	return s.notas, nil
}
func (s *stubRepo) UpsertNotas(ctx context.Context, turmaID uuid.UUID, disciplina string, bimestre int, itens []NotaItem) error {
	return nil
}
func (s *stubRepo) ListAvaliacoes(ctx context.Context, professorID uuid.UUID, turmaID *uuid.UUID, disciplina string) ([]Avaliacao, error) {
	return s.avaliacoes, nil
}
func (s *stubRepo) SaveAvaliacao(ctx context.Context, avaliacao Avaliacao, questoes []AvaliacaoQuestao) (uuid.UUID, error) {
	if s.avaliacaoID == uuid.Nil {
		s.avaliacaoID = uuid.New()
	}
	if s.questaoID == uuid.Nil {
		s.questaoID = uuid.New()
	}
	if s.matriculaID == uuid.Nil && len(s.alunos) > 0 {
		s.matriculaID = s.alunos[0].MatriculaID
	}
	return s.avaliacaoID, nil
}
func (s *stubRepo) UpdateAvaliacaoStatus(ctx context.Context, avaliacaoID uuid.UUID, status string) error {
	return nil
}
func (s *stubRepo) ListQuestoes(ctx context.Context, avaliacaoID uuid.UUID) ([]AvaliacaoQuestao, error) {
	if s.questaoID == uuid.Nil {
		s.questaoID = uuid.New()
	}
	return []AvaliacaoQuestao{{ID: s.questaoID, Correta: 0}}, nil
}
func (s *stubRepo) ListRespostas(ctx context.Context, avaliacaoID uuid.UUID) ([]Resposta, error) {
	if s.matriculaID == uuid.Nil {
		s.matriculaID = uuid.New()
	}
	if s.questaoID == uuid.Nil {
		s.questaoID = uuid.New()
	}
	return []Resposta{{MatriculaID: s.matriculaID, QuestaoID: s.questaoID, Alternativa: intPtr(0)}}, nil
}
func (s *stubRepo) UpsertNotaFromAvaliacao(ctx context.Context, turmaID uuid.UUID, disciplina string, bimestre int, matriculaID uuid.UUID, nota float64) error {
	return nil
}
func (s *stubRepo) GetAvaliacao(ctx context.Context, avaliacaoID uuid.UUID) (Avaliacao, error) {
	turmaID := uuid.New()
	if len(s.turmas) > 0 {
		turmaID = s.turmas[0].ID
	}
	return Avaliacao{ID: avaliacaoID, TurmaID: turmaID, Disciplina: "LP", Inicio: timePtr(time.Now())}, nil
}
func (s *stubRepo) EnsureProfessorTurma(ctx context.Context, professorID, turmaID uuid.UUID) error {
	return nil
}
func (s *stubRepo) AulaOwner(ctx context.Context, aulaID uuid.UUID) (uuid.UUID, error) {
	return uuid.New(), nil
}

func TestEduHandlers(t *testing.T) {
	repo := &stubRepo{
		turmas: []Turma{{ID: uuid.New(), Nome: "7º ANO E", Turno: "VESPERTINO"}},
		aulas: []Aula{{ID: uuid.New(), TurmaID: uuid.New(), TurmaNome: "7º ANO E", Disciplina: "LP", Inicio: time.Now(), Fim: time.Now().Add(time.Hour)}},
		chamadaAula: Aula{ID: uuid.New(), TurmaID: uuid.New(), TurmaNome: "7º ANO E", Disciplina: "LP", Inicio: time.Now(), Fim: time.Now().Add(time.Hour)},
		alunos: []ChamadaAluno{{MatriculaID: uuid.New(), AlunoNome: "Aluno", Matricula: "123"}},
		notas: []Nota{{MatriculaID: uuid.New(), Nota: 90}},
		avaliacoes: []Avaliacao{{ID: uuid.New(), TurmaID: uuid.New(), Disciplina: "LP", Titulo: "Prova", Status: "RASCUNHO"}},
		ultimoRepeat: uuid.New(),
		avaliacaoID: uuid.New(),
	}

	svc := NewProfessorService(repo, redis.NewClient(&redis.Options{Addr: "localhost:0"}))
	handler := NewHandler(svc)

	tests := []struct {
		name     string
		method   string
		path     string
		body     any
		status   int
	}{
		{"turmas", http.MethodGet, "/prof/turmas", nil, http.StatusOK},
		{"aulas", http.MethodGet, "/prof/aulas", nil, http.StatusOK},
		{"chamada", http.MethodGet, "/chamada/aula/" + repo.chamadaAula.ID.String(), nil, http.StatusOK},
		{"confirmar", http.MethodPost, "/chamada/aula/" + repo.chamadaAula.ID.String() + "/confirmar", map[string]any{"itens": []map[string]any{{"matricula_id": repo.alunos[0].MatriculaID, "status": "PRESENTE"}}}, http.StatusOK},
		{"repetir", http.MethodPost, "/chamada/aula/" + repo.chamadaAula.ID.String() + "/repetir", map[string]any{"merge_biometria": true}, http.StatusOK},
		{"notas", http.MethodGet, "/prof/notas?turma=" + repo.turmas[0].ID.String() + "&disciplina=LP&bimestre=1", nil, http.StatusOK},
		{"notas-upsert", http.MethodPost, "/prof/notas", map[string]any{"turma": repo.turmas[0].ID, "disciplina": "LP", "bimestre": 1, "itens": []map[string]any{{"matricula_id": repo.alunos[0].MatriculaID, "nota": 95}}}, http.StatusOK},
		{"avaliacoes", http.MethodGet, "/prof/avaliacoes", nil, http.StatusOK},
		{"avaliacao-save", http.MethodPost, "/prof/avaliacoes", map[string]any{"turma": repo.turmas[0].ID, "disciplina": "LP", "titulo": "Nova", "questoes": []map[string]any{{"enunciado": "1+1", "alternativas": []string{"2", "3"}, "correta": 0}}}, http.StatusOK},
		{"avaliacao-publicar", http.MethodPost, "/prof/avaliacoes/" + repo.avaliacaoID.String() + "/publicar", nil, http.StatusOK},
		{"avaliacao-encerrar", http.MethodPost, "/prof/avaliacoes/" + repo.avaliacaoID.String() + "/encerrar", nil, http.StatusOK},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, tc.path, requestBody(tc.body))
			req = withAuth(req, repo)
			rec := httptest.NewRecorder()

			r := chi.NewRouter()
			handler.RegisterRoutes(r)
			r.ServeHTTP(rec, req)

			if rec.Code != tc.status {
				t.Fatalf("expected %d got %d", tc.status, rec.Code)
			}
		})
	}
}

func requestBody(body any) *bytes.Buffer {
	if body == nil {
		return bytes.NewBuffer(nil)
	}
	b, _ := json.Marshal(body)
	return bytes.NewBuffer(b)
}

func withAuth(req *http.Request, repo *stubRepo) *http.Request {
	ctx := req.Context()
	prof := uuid.New()
	ctx = context.WithValue(ctx, httpmiddleware.ContextKeySubject, prof.String())
	ctx = context.WithValue(ctx, httpmiddleware.ContextKeyRoles, []string{"PROFESSOR"})
	ctx = context.WithValue(ctx, httpmiddleware.ContextKeyAudience, "backoffice")
	return req.WithContext(ctx)
}

func intPtr(i int16) *int16 { return &i }
func timePtr(t time.Time) *time.Time { return &t }
