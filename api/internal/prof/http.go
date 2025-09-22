package prof

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	httpmiddleware "github.com/gestaozabele/municipio/internal/http/middleware"
	"github.com/gestaozabele/municipio/internal/repo"
)

type ServiceProvider interface {
	GetOverview(ctx context.Context, professorID uuid.UUID) (*Overview, error)
	ListTurmas(ctx context.Context, professorID uuid.UUID) ([]Turma, error)
	ListAlunosByTurma(ctx context.Context, professorID, turmaID uuid.UUID) ([]Aluno, error)
	GetChamada(ctx context.Context, professorID, turmaID uuid.UUID, day time.Time, turno string) (*ChamadaResponse, error)
	SalvarChamada(ctx context.Context, professorID, turmaID uuid.UUID, input SalvarChamadaInput) (uuid.UUID, error)
	ListAlunoDiario(ctx context.Context, professorID, alunoID uuid.UUID) ([]AlunoDiarioEntrada, error)
	CreateAlunoDiario(ctx context.Context, professorID, alunoID uuid.UUID, conteudo string) (AlunoDiarioEntrada, error)
	UpdateAlunoDiario(ctx context.Context, professorID, alunoID, anotacaoID uuid.UUID, conteudo string) (AlunoDiarioEntrada, error)
	DeleteAlunoDiario(ctx context.Context, professorID, alunoID, anotacaoID uuid.UUID) error
	ListAvaliacoes(ctx context.Context, professorID, turmaID uuid.UUID) ([]Avaliacao, error)
	CreateAvaliacao(ctx context.Context, professorID, turmaID uuid.UUID, input CreateAvaliacaoInput) (uuid.UUID, error)
	GetAvaliacaoDetalhes(ctx context.Context, professorID, avaliacaoID uuid.UUID) (Avaliacao, []AvaliacaoQuestao, error)
	AtualizarStatusAvaliacao(ctx context.Context, professorID, avaliacaoID uuid.UUID, status string) error
	LancarNotas(ctx context.Context, professorID, avaliacaoID uuid.UUID, input LancarNotasInput) error
	ListarNotas(ctx context.Context, professorID, turmaID uuid.UUID, bimestre int) ([]NotaResumo, error)
	ListMateriais(ctx context.Context, professorID, turmaID uuid.UUID) ([]Material, error)
	CreateMaterial(ctx context.Context, professorID, turmaID uuid.UUID, titulo string, descricao, url *string) (Material, error)
	ListAgenda(ctx context.Context, professorID uuid.UUID, from, to time.Time) ([]AgendaItem, error)
	RelatorioFrequencia(ctx context.Context, professorID, turmaID uuid.UUID, from, to time.Time) ([]FrequenciaAluno, error)
	RelatorioAvaliacoes(ctx context.Context, professorID, turmaID uuid.UUID, bimestre int) ([]RelatorioAvaliacao, error)
	DashboardAnalytics(ctx context.Context, professorID uuid.UUID) (DashboardAnalytics, error)
	LivePresence(ctx context.Context, professorID uuid.UUID) ([]LivePresence, error)
	UpdateProfile(ctx context.Context, professorID uuid.UUID, nome, email string) (*repo.Usuario, error)
}

// Handler expõe endpoints REST do professor.
type Handler struct {
	service ServiceProvider
}

func NewHandler(service ServiceProvider) *Handler {
	return &Handler{service: service}
}

func (h *Handler) RegisterRoutes(r chi.Router) {
	r.Get("/me", h.getMe)
	r.Put("/me", h.updateProfile)
	r.Get("/turmas", h.listTurmas)
	r.Get("/turmas/{turmaID}/alunos", h.listAlunos)
	r.Get("/alunos/{alunoID}/diario", h.listAlunoDiario)
	r.Post("/alunos/{alunoID}/diario", h.createAlunoDiario)
	r.Put("/alunos/{alunoID}/diario/{anotacaoID}", h.updateAlunoDiario)
	r.Delete("/alunos/{alunoID}/diario/{anotacaoID}", h.deleteAlunoDiario)
	r.Get("/turmas/{turmaID}/chamada", h.getChamada)
	r.Post("/turmas/{turmaID}/chamada", h.saveChamada)
	r.Get("/turmas/{turmaID}/materiais", h.listMateriais)
	r.Post("/turmas/{turmaID}/materiais", h.createMaterial)
	r.Get("/turmas/{turmaID}/avaliacoes", h.listAvaliacoes)
	r.Post("/turmas/{turmaID}/avaliacoes", h.createAvaliacao)
	r.Get("/avaliacoes/{avaliacaoID}", h.getAvaliacao)
	r.Post("/avaliacoes/{avaliacaoID}/publicar", h.publicarAvaliacao)
	r.Post("/avaliacoes/{avaliacaoID}/notas", h.lancarNotas)
	r.Get("/turmas/{turmaID}/notas", h.listNotas)
	r.Get("/agenda", h.listAgenda)
	r.Get("/relatorios/frequencia", h.relatorioFrequencia)
	r.Get("/relatorios/avaliacoes", h.relatorioAvaliacoes)
	r.Get("/dashboard/analytics", h.getAnalytics)
	r.Get("/dashboard/live", h.getLivePresence)
}

func (h *Handler) getMe(w http.ResponseWriter, r *http.Request) {
	professorID, err := subjectAsUUID(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}

	overview, err := h.service.GetOverview(r.Context(), professorID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível carregar painel", nil)
		return
	}

	response := map[string]any{
		"nome":           overview.ProfessorName,
		"email":          overview.ProfessorEmail,
		"turmas":         overview.Turmas,
		"proximas_aulas": overview.Upcoming,
		"contadores": map[string]int{
			"turmas": overview.TotalTurmas,
			"alunos": overview.TotalAlunos,
		},
	}

	writeJSON(w, http.StatusOK, response)
}

func (h *Handler) updateProfile(w http.ResponseWriter, r *http.Request) {
	professorID, err := subjectAsUUID(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}

	var payload struct {
		Nome  string `json:"nome"`
		Email string `json:"email"`
	}

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION", "payload inválido", nil)
		return
	}

	usuario, err := h.service.UpdateProfile(r.Context(), professorID, payload.Nome, payload.Email)
	if err != nil {
		switch err {
		case ErrForbidden:
			writeError(w, http.StatusForbidden, "FORBIDDEN", "sem acesso", nil)
		case ErrNotFound:
			writeError(w, http.StatusNotFound, "NOT_FOUND", "perfil não encontrado", nil)
		default:
			writeError(w, http.StatusBadRequest, "VALIDATION", err.Error(), nil)
		}
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"usuario": usuario})
}

func (h *Handler) listTurmas(w http.ResponseWriter, r *http.Request) {
	professorID, err := subjectAsUUID(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}

	turmas, err := h.service.ListTurmas(r.Context(), professorID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível listar turmas", nil)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"turmas": turmas})
}

func (h *Handler) listAlunos(w http.ResponseWriter, r *http.Request) {
	professorID, err := subjectAsUUID(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}

	turmaIDStr := chi.URLParam(r, "turmaID")
	turmaID, err := uuid.Parse(turmaIDStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION", "turma inválida", nil)
		return
	}

	alunos, err := h.service.ListAlunosByTurma(r.Context(), professorID, turmaID)
	if err != nil {
		switch err {
		case ErrForbidden:
			writeError(w, http.StatusForbidden, "FORBIDDEN", "sem acesso à turma", nil)
		case ErrNotFound:
			writeError(w, http.StatusNotFound, "NOT_FOUND", "turma não encontrada", nil)
		default:
			writeError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível listar alunos", nil)
		}
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"alunos": alunos})
}

func (h *Handler) listAlunoDiario(w http.ResponseWriter, r *http.Request) {
	professorID, err := subjectAsUUID(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}

	alunoID, err := uuid.Parse(chi.URLParam(r, "alunoID"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION", "aluno inválido", nil)
		return
	}

	registros, err := h.service.ListAlunoDiario(r.Context(), professorID, alunoID)
	if err != nil {
		switch err {
		case ErrForbidden:
			writeError(w, http.StatusForbidden, "FORBIDDEN", "sem acesso ao aluno", nil)
		default:
			writeError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível carregar o diário", nil)
		}
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"anotacoes": registros})
}

func (h *Handler) createAlunoDiario(w http.ResponseWriter, r *http.Request) {
	professorID, err := subjectAsUUID(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}

	alunoID, err := uuid.Parse(chi.URLParam(r, "alunoID"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION", "aluno inválido", nil)
		return
	}

	var payload struct {
		Conteudo string `json:"conteudo"`
	}

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION", "payload inválido", nil)
		return
	}

	entrada, err := h.service.CreateAlunoDiario(r.Context(), professorID, alunoID, payload.Conteudo)
	if err != nil {
		switch err {
		case ErrForbidden:
			writeError(w, http.StatusForbidden, "FORBIDDEN", "sem acesso ao aluno", nil)
		default:
			writeError(w, http.StatusBadRequest, "VALIDATION", err.Error(), nil)
		}
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{"anotacao": entrada})
}

func (h *Handler) updateAlunoDiario(w http.ResponseWriter, r *http.Request) {
	professorID, err := subjectAsUUID(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}

	alunoID, err := uuid.Parse(chi.URLParam(r, "alunoID"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION", "aluno inválido", nil)
		return
	}

	anotacaoID, err := uuid.Parse(chi.URLParam(r, "anotacaoID"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION", "anotação inválida", nil)
		return
	}

	var payload struct {
		Conteudo string `json:"conteudo"`
	}

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION", "payload inválido", nil)
		return
	}

	entrada, err := h.service.UpdateAlunoDiario(r.Context(), professorID, alunoID, anotacaoID, payload.Conteudo)
	if err != nil {
		switch err {
		case ErrForbidden:
			writeError(w, http.StatusForbidden, "FORBIDDEN", "sem acesso ao aluno", nil)
		case ErrNotFound:
			writeError(w, http.StatusNotFound, "NOT_FOUND", "anotação não encontrada", nil)
		default:
			writeError(w, http.StatusBadRequest, "VALIDATION", err.Error(), nil)
		}
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"anotacao": entrada})
}

func (h *Handler) deleteAlunoDiario(w http.ResponseWriter, r *http.Request) {
	professorID, err := subjectAsUUID(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}

	alunoID, err := uuid.Parse(chi.URLParam(r, "alunoID"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION", "aluno inválido", nil)
		return
	}

	anotacaoID, err := uuid.Parse(chi.URLParam(r, "anotacaoID"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION", "anotação inválida", nil)
		return
	}

	if err := h.service.DeleteAlunoDiario(r.Context(), professorID, alunoID, anotacaoID); err != nil {
		switch err {
		case ErrForbidden:
			writeError(w, http.StatusForbidden, "FORBIDDEN", "sem acesso ao aluno", nil)
		case ErrNotFound:
			writeError(w, http.StatusNotFound, "NOT_FOUND", "anotação não encontrada", nil)
		default:
			writeError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível remover a anotação", nil)
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) getChamada(w http.ResponseWriter, r *http.Request) {
	professorID, err := subjectAsUUID(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}

	turmaIDStr := chi.URLParam(r, "turmaID")
	turmaID, err := uuid.Parse(turmaIDStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION", "turma inválida", nil)
		return
	}

	dateStr := r.URL.Query().Get("data")
	turno := r.URL.Query().Get("turno")
	if dateStr == "" {
		writeError(w, http.StatusBadRequest, "VALIDATION", "data é obrigatória", nil)
		return
	}
	day, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION", "data inválida", nil)
		return
	}

	resp, err := h.service.GetChamada(r.Context(), professorID, turmaID, day, turno)
	if err != nil {
		switch err {
		case ErrForbidden:
			writeError(w, http.StatusForbidden, "FORBIDDEN", "sem acesso à turma", nil)
		case ErrNotFound:
			writeError(w, http.StatusNotFound, "NOT_FOUND", "turma não encontrada", nil)
		default:
			writeError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível carregar chamada", nil)
		}
		return
	}

	writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) saveChamada(w http.ResponseWriter, r *http.Request) {
	professorID, err := subjectAsUUID(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}

	turmaIDStr := chi.URLParam(r, "turmaID")
	turmaID, err := uuid.Parse(turmaIDStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION", "turma inválida", nil)
		return
	}

	var payload struct {
		Data       string `json:"data"`
		Turno      string `json:"turno"`
		Disciplina string `json:"disciplina"`
		Itens      []struct {
			AlunoID       uuid.UUID `json:"aluno_id"`
			Status        *string   `json:"status"`
			Justificativa *string   `json:"justificativa"`
		} `json:"itens"`
	}

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION", "payload inválido", nil)
		return
	}

	if payload.Data == "" || payload.Turno == "" {
		writeError(w, http.StatusBadRequest, "VALIDATION", "data e turno são obrigatórios", nil)
		return
	}

	day, err := time.Parse("2006-01-02", payload.Data)
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION", "data inválida", nil)
		return
	}

	itens := make([]SalvarChamadaItem, 0, len(payload.Itens))
	for _, item := range payload.Itens {
		if item.AlunoID == uuid.Nil {
			writeError(w, http.StatusBadRequest, "VALIDATION", "aluno_id inválido", nil)
			return
		}
		itens = append(itens, SalvarChamadaItem{AlunoID: item.AlunoID, Status: item.Status, Justificativa: item.Justificativa})
	}

	aulaID, err := h.service.SalvarChamada(r.Context(), professorID, turmaID, SalvarChamadaInput{
		Data:       day,
		Turno:      payload.Turno,
		Disciplina: payload.Disciplina,
		Itens:      itens,
	})
	if err != nil {
		switch err {
		case ErrForbidden:
			writeError(w, http.StatusForbidden, "FORBIDDEN", "sem acesso à turma", nil)
		default:
			writeError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível registrar chamada", nil)
		}
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"aula_id": aulaID})
}

func (h *Handler) listMateriais(w http.ResponseWriter, r *http.Request) {
	professorID, err := subjectAsUUID(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}

	turmaID, err := uuid.Parse(chi.URLParam(r, "turmaID"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION", "turma inválida", nil)
		return
	}

	materiais, err := h.service.ListMateriais(r.Context(), professorID, turmaID)
	if err != nil {
		switch err {
		case ErrForbidden:
			writeError(w, http.StatusForbidden, "FORBIDDEN", "sem acesso à turma", nil)
		default:
			writeError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível listar materiais", nil)
		}
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"materiais": materiais})
}

func (h *Handler) createMaterial(w http.ResponseWriter, r *http.Request) {
	professorID, err := subjectAsUUID(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}

	turmaID, err := uuid.Parse(chi.URLParam(r, "turmaID"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION", "turma inválida", nil)
		return
	}

	var payload struct {
		Titulo    string  `json:"titulo"`
		Descricao *string `json:"descricao"`
		URL       *string `json:"url"`
	}

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION", "payload inválido", nil)
		return
	}

	material, err := h.service.CreateMaterial(r.Context(), professorID, turmaID, payload.Titulo, payload.Descricao, payload.URL)
	if err != nil {
		switch err {
		case ErrForbidden:
			writeError(w, http.StatusForbidden, "FORBIDDEN", "sem acesso à turma", nil)
		default:
			writeError(w, http.StatusBadRequest, "VALIDATION", err.Error(), nil)
		}
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{"material": material})
}

func (h *Handler) listAvaliacoes(w http.ResponseWriter, r *http.Request) {
	professorID, err := subjectAsUUID(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}

	turmaID, err := uuid.Parse(chi.URLParam(r, "turmaID"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION", "turma inválida", nil)
		return
	}

	avaliacoes, err := h.service.ListAvaliacoes(r.Context(), professorID, turmaID)
	if err != nil {
		switch err {
		case ErrForbidden:
			writeError(w, http.StatusForbidden, "FORBIDDEN", "sem acesso à turma", nil)
		default:
			writeError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível listar avaliações", nil)
		}
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"avaliacoes": avaliacoes})
}

func (h *Handler) createAvaliacao(w http.ResponseWriter, r *http.Request) {
	professorID, err := subjectAsUUID(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}

	turmaID, err := uuid.Parse(chi.URLParam(r, "turmaID"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION", "turma inválida", nil)
		return
	}

	var payload struct {
		Tipo       string   `json:"tipo"`
		Titulo     string   `json:"titulo"`
		Disciplina string   `json:"disciplina"`
		Data       *string  `json:"data"`
		Peso       *float64 `json:"peso"`
		Questoes   []struct {
			Enunciado    string   `json:"enunciado"`
			Alternativas []string `json:"alternativas"`
			Correta      *int     `json:"correta"`
		} `json:"questoes"`
	}

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION", "payload inválido", nil)
		return
	}

	var dataPtr *time.Time
	if payload.Data != nil && *payload.Data != "" {
		t, err := time.Parse("2006-01-02", *payload.Data)
		if err != nil {
			writeError(w, http.StatusBadRequest, "VALIDATION", "data inválida", nil)
			return
		}
		dataPtr = &t
	}

	peso := 1.0
	if payload.Peso != nil {
		peso = *payload.Peso
	}

	questoes := make([]QuestaoInput, 0, len(payload.Questoes))
	for _, q := range payload.Questoes {
		questoes = append(questoes, QuestaoInput{Enunciado: q.Enunciado, Alternativas: q.Alternativas, Correta: q.Correta})
	}

	id, err := h.service.CreateAvaliacao(r.Context(), professorID, turmaID, CreateAvaliacaoInput{
		Tipo:       payload.Tipo,
		Titulo:     payload.Titulo,
		Disciplina: payload.Disciplina,
		Data:       dataPtr,
		Peso:       peso,
		Questoes:   questoes,
	})
	if err != nil {
		switch err {
		case ErrForbidden:
			writeError(w, http.StatusForbidden, "FORBIDDEN", "sem acesso à turma", nil)
		default:
			writeError(w, http.StatusBadRequest, "VALIDATION", err.Error(), nil)
		}
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{"avaliacao_id": id})
}

func (h *Handler) getAvaliacao(w http.ResponseWriter, r *http.Request) {
	professorID, err := subjectAsUUID(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}

	avaliacaoID, err := uuid.Parse(chi.URLParam(r, "avaliacaoID"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION", "avaliação inválida", nil)
		return
	}

	avaliacao, questoes, err := h.service.GetAvaliacaoDetalhes(r.Context(), professorID, avaliacaoID)
	if err != nil {
		switch err {
		case ErrNotFound:
			writeError(w, http.StatusNotFound, "NOT_FOUND", "avaliação não encontrada", nil)
		case ErrForbidden:
			writeError(w, http.StatusForbidden, "FORBIDDEN", "sem acesso", nil)
		default:
			writeError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível carregar avaliação", nil)
		}
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"avaliacao": avaliacao,
		"questoes":  questoes,
	})
}

func (h *Handler) publicarAvaliacao(w http.ResponseWriter, r *http.Request) {
	professorID, err := subjectAsUUID(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}

	avaliacaoID, err := uuid.Parse(chi.URLParam(r, "avaliacaoID"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION", "avaliação inválida", nil)
		return
	}

	if err := h.service.AtualizarStatusAvaliacao(r.Context(), professorID, avaliacaoID, "PUBLICADA"); err != nil {
		switch err {
		case ErrNotFound:
			writeError(w, http.StatusNotFound, "NOT_FOUND", "avaliação não encontrada", nil)
		case ErrForbidden:
			writeError(w, http.StatusForbidden, "FORBIDDEN", "sem acesso", nil)
		default:
			writeError(w, http.StatusBadRequest, "VALIDATION", err.Error(), nil)
		}
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "publicada"})
}

func (h *Handler) lancarNotas(w http.ResponseWriter, r *http.Request) {
	professorID, err := subjectAsUUID(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}

	avaliacaoID, err := uuid.Parse(chi.URLParam(r, "avaliacaoID"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION", "avaliação inválida", nil)
		return
	}

	var payload struct {
		Bimestre int `json:"bimestre"`
		Notas    []struct {
			AlunoID    uuid.UUID `json:"aluno_id"`
			Nota       float64   `json:"nota"`
			Observacao *string   `json:"observacao"`
		} `json:"notas"`
	}

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION", "payload inválido", nil)
		return
	}

	itens := make([]LancarNotasItem, 0, len(payload.Notas))
	for _, item := range payload.Notas {
		if item.AlunoID == uuid.Nil {
			writeError(w, http.StatusBadRequest, "VALIDATION", "aluno_id inválido", nil)
			return
		}
		itens = append(itens, LancarNotasItem{AlunoID: item.AlunoID, Nota: item.Nota, Observacao: item.Observacao})
	}

	if err := h.service.LancarNotas(r.Context(), professorID, avaliacaoID, LancarNotasInput{Bimestre: payload.Bimestre, Itens: itens}); err != nil {
		switch err {
		case ErrForbidden:
			writeError(w, http.StatusForbidden, "FORBIDDEN", "sem acesso", nil)
		case ErrNotFound:
			writeError(w, http.StatusNotFound, "NOT_FOUND", "avaliação não encontrada", nil)
		default:
			writeError(w, http.StatusBadRequest, "VALIDATION", err.Error(), nil)
		}
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "notas_atualizadas"})
}

func (h *Handler) listNotas(w http.ResponseWriter, r *http.Request) {
	professorID, err := subjectAsUUID(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}

	turmaID, err := uuid.Parse(chi.URLParam(r, "turmaID"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION", "turma inválida", nil)
		return
	}

	bimestreStr := r.URL.Query().Get("bimestre")
	if bimestreStr == "" {
		writeError(w, http.StatusBadRequest, "VALIDATION", "bimestre é obrigatório", nil)
		return
	}
	bimestre, err := strconv.Atoi(bimestreStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION", "bimestre inválido", nil)
		return
	}

	notas, err := h.service.ListarNotas(r.Context(), professorID, turmaID, bimestre)
	if err != nil {
		switch err {
		case ErrForbidden:
			writeError(w, http.StatusForbidden, "FORBIDDEN", "sem acesso", nil)
		default:
			writeError(w, http.StatusBadRequest, "VALIDATION", err.Error(), nil)
		}
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"notas": notas})
}

func (h *Handler) listAgenda(w http.ResponseWriter, r *http.Request) {
	professorID, err := subjectAsUUID(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}

	fromStr := r.URL.Query().Get("from")
	toStr := r.URL.Query().Get("to")

	now := time.Now().UTC()
	from := now
	to := now.Add(7 * 24 * time.Hour)

	if fromStr != "" {
		if parsed, err := time.Parse("2006-01-02", fromStr); err == nil {
			from = parsed
		} else {
			writeError(w, http.StatusBadRequest, "VALIDATION", "from inválido", nil)
			return
		}
	}
	if toStr != "" {
		if parsed, err := time.Parse("2006-01-02", toStr); err == nil {
			to = parsed
		} else {
			writeError(w, http.StatusBadRequest, "VALIDATION", "to inválido", nil)
			return
		}
	}

	agenda, err := h.service.ListAgenda(r.Context(), professorID, from, to)
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION", err.Error(), nil)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"eventos": agenda})
}

func (h *Handler) relatorioFrequencia(w http.ResponseWriter, r *http.Request) {
	professorID, err := subjectAsUUID(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}

	turmaIDStr := r.URL.Query().Get("turmaId")
	fromStr := r.URL.Query().Get("from")
	toStr := r.URL.Query().Get("to")

	if turmaIDStr == "" || fromStr == "" || toStr == "" {
		writeError(w, http.StatusBadRequest, "VALIDATION", "turmaId, from e to são obrigatórios", nil)
		return
	}

	turmaID, err := uuid.Parse(turmaIDStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION", "turmaId inválido", nil)
		return
	}

	from, err := time.Parse("2006-01-02", fromStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION", "from inválido", nil)
		return
	}
	to, err := time.Parse("2006-01-02", toStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION", "to inválido", nil)
		return
	}

	relatorio, err := h.service.RelatorioFrequencia(r.Context(), professorID, turmaID, from, to)
	if err != nil {
		switch err {
		case ErrForbidden:
			writeError(w, http.StatusForbidden, "FORBIDDEN", "sem acesso", nil)
		default:
			writeError(w, http.StatusBadRequest, "VALIDATION", err.Error(), nil)
		}
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"frequencia": relatorio})
}

func (h *Handler) relatorioAvaliacoes(w http.ResponseWriter, r *http.Request) {
	professorID, err := subjectAsUUID(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}

	turmaIDStr := r.URL.Query().Get("turmaId")
	bimestreStr := r.URL.Query().Get("bimestre")

	if turmaIDStr == "" || bimestreStr == "" {
		writeError(w, http.StatusBadRequest, "VALIDATION", "turmaId e bimestre são obrigatórios", nil)
		return
	}

	turmaID, err := uuid.Parse(turmaIDStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION", "turmaId inválido", nil)
		return
	}

	bimestre, err := strconv.Atoi(bimestreStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION", "bimestre inválido", nil)
		return
	}

	relatorio, err := h.service.RelatorioAvaliacoes(r.Context(), professorID, turmaID, bimestre)
	if err != nil {
		switch err {
		case ErrForbidden:
			writeError(w, http.StatusForbidden, "FORBIDDEN", "sem acesso", nil)
		default:
			writeError(w, http.StatusBadRequest, "VALIDATION", err.Error(), nil)
		}
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"avaliacoes": relatorio})
}

func (h *Handler) getAnalytics(w http.ResponseWriter, r *http.Request) {
	professorID, err := subjectAsUUID(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}

	analytics, err := h.service.DashboardAnalytics(r.Context(), professorID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível carregar indicadores", nil)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"analytics": analytics})
}

func (h *Handler) getLivePresence(w http.ResponseWriter, r *http.Request) {
	professorID, err := subjectAsUUID(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}

	live, err := h.service.LivePresence(r.Context(), professorID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível carregar presença em tempo real", nil)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"live": live})
}

func subjectAsUUID(r *http.Request) (uuid.UUID, error) {
	subject := httpmiddleware.GetSubject(r.Context())
	return uuid.Parse(subject)
}

type successEnvelope struct {
	Data  any `json:"data"`
	Error any `json:"error"`
}

type errorEnvelope struct {
	Data  any        `json:"data"`
	Error *errorBody `json:"error"`
}

type errorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Details any    `json:"details,omitempty"`
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(successEnvelope{Data: data})
}

func writeError(w http.ResponseWriter, status int, code, message string, details any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(errorEnvelope{
		Data: nil,
		Error: &errorBody{
			Code:    code,
			Message: message,
			Details: details,
		},
	})
}
