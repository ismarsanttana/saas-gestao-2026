package edu

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
	"github.com/rs/zerolog/log"

	httpmiddleware "github.com/gestaozabele/municipio/internal/http/middleware"
)

// Handler orquestra rotas do módulo educação.
type Handler struct {
	service *ProfessorService
}

func NewHandler(service *ProfessorService) *Handler {
	return &Handler{service: service}
}

func (h *Handler) RegisterRoutes(r chi.Router) {
	r.Route("/prof", func(r chi.Router) {
		r.Get("/turmas", h.handleListTurmas)
		r.Get("/aulas", h.handleListAulas)
		r.Get("/notas", h.handleListNotas)
		r.Post("/notas", h.handleUpsertNotas)
		r.Get("/avaliacoes", h.handleListAvaliacoes)
		r.Post("/avaliacoes", h.handleSaveAvaliacao)
		r.Post("/avaliacoes/{id}/publicar", h.handlePublicarAvaliacao)
		r.Post("/avaliacoes/{id}/encerrar", h.handleEncerrarAvaliacao)
	})

	r.Route("/chamada", func(r chi.Router) {
		r.Get("/aula/{id}", h.handleGetChamada)
		r.Get("/aula/{id}/ultima", h.handleGetUltimaChamada)
		r.Post("/aula/{id}/repetir", h.handleRepetirChamada)
		r.Post("/aula/{id}/confirmar", h.handleConfirmarChamada)
	})
}

func (h *Handler) handleListTurmas(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	start := time.Now()
	profID, err := subjectAsUUID(ctx)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}

	if !hasProfessorRole(ctx) {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "sem acesso", nil)
		return
	}

	turmas, err := h.service.ListTurmas(ctx, profID)
	if err != nil {
		writeInternalError(w, err)
		return
	}

	logRequest(ctx, "GET /prof/turmas", profID, start)
	writeJSON(w, http.StatusOK, map[string]any{"turmas": turmas})
}

func (h *Handler) handleListAulas(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	start := time.Now()
	profID, err := subjectAsUUID(ctx)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}
	if !hasProfessorRole(ctx) {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "sem acesso", nil)
		return
	}

	dateStr := r.URL.Query().Get("data")
	day := time.Now()
	if dateStr != "" {
		tmp, err := time.Parse("2006-01-02", dateStr)
		if err != nil {
			writeError(w, http.StatusBadRequest, "VALIDATION", "data inválida", nil)
			return
		}
		day = tmp
	}

	aulas, err := h.service.ListAulas(ctx, profID, day)
	if err != nil {
		writeInternalError(w, err)
		return
	}

	logRequest(ctx, "GET /prof/aulas", profID, start)
	writeJSON(w, http.StatusOK, map[string]any{"aulas": aulas})
}

func (h *Handler) handleGetChamada(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	start := time.Now()
	profID, err := subjectAsUUID(ctx)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}
	if !hasProfessorRole(ctx) {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "sem acesso", nil)
		return
	}

	aulaID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION", "aula inválida", nil)
		return
	}

	aula, alunos, err := h.service.GetChamada(ctx, profID, aulaID)
	if err != nil {
		handleDomainError(w, err)
		return
	}

	logRequest(ctx, "GET /chamada/aula", profID, start)
	writeJSON(w, http.StatusOK, map[string]any{"aula": aula, "alunos": alunos})
}

func (h *Handler) handleGetUltimaChamada(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	profID, err := subjectAsUUID(ctx)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}
	if !hasProfessorRole(ctx) {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "sem acesso", nil)
		return
	}

	aulaID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION", "aula inválida", nil)
		return
	}

	src, err := h.service.GetUltimaChamada(ctx, profID, aulaID)
	if err != nil {
		handleDomainError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"aula_origem": src})
}

func (h *Handler) handleRepetirChamada(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	start := time.Now()
	profID, err := subjectAsUUID(ctx)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}
	if !hasProfessorRole(ctx) {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "sem acesso", nil)
		return
	}

	aulaID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION", "aula inválida", nil)
		return
	}

	var payload struct {
		MergeBiometria bool `json:"merge_biometria"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil && err.Error() != "EOF" {
		writeError(w, http.StatusBadRequest, "VALIDATION", "payload inválido", nil)
		return
	}

	if err := h.service.RepetirChamada(ctx, profID, aulaID, payload.MergeBiometria); err != nil {
		handleDomainError(w, err)
		return
	}

	logRequest(ctx, "POST /chamada/aula/repetir", profID, start)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) handleConfirmarChamada(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	start := time.Now()
	profID, err := subjectAsUUID(ctx)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}
	if !hasProfessorRole(ctx) {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "sem acesso", nil)
		return
	}

	aulaID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION", "aula inválida", nil)
		return
	}

	var payload struct {
		Itens []PresencaItem `json:"itens"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION", "payload inválido", nil)
		return
	}

	if len(payload.Itens) == 0 {
		writeError(w, http.StatusBadRequest, "VALIDATION", "nenhum item informado", nil)
		return
	}

	if err := h.service.ConfirmarChamada(ctx, profID, aulaID, payload.Itens); err != nil {
		handleDomainError(w, err)
		return
	}

	logRequest(ctx, "POST /chamada/aula/confirmar", profID, start)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) handleListNotas(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	start := time.Now()
	profID, err := subjectAsUUID(ctx)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}
	if !hasProfessorRole(ctx) {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "sem acesso", nil)
		return
	}

	turmaID, err := uuid.Parse(r.URL.Query().Get("turma"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION", "turma inválida", nil)
		return
	}
	disciplina := strings.TrimSpace(r.URL.Query().Get("disciplina"))
	if disciplina == "" {
		writeError(w, http.StatusBadRequest, "VALIDATION", "disciplina obrigatória", nil)
		return
	}
	bimestre, err := strconv.Atoi(r.URL.Query().Get("bimestre"))
	if err != nil || bimestre < 1 || bimestre > 4 {
		writeError(w, http.StatusBadRequest, "VALIDATION", "bimestre inválido", nil)
		return
	}

	notas, err := h.service.ListNotas(ctx, profID, turmaID, disciplina, bimestre)
	if err != nil {
		handleDomainError(w, err)
		return
	}

	logRequest(ctx, "GET /prof/notas", profID, start)
	writeJSON(w, http.StatusOK, map[string]any{"notas": notas})
}

func (h *Handler) handleUpsertNotas(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	start := time.Now()
	profID, err := subjectAsUUID(ctx)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}
	if !hasProfessorRole(ctx) {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "sem acesso", nil)
		return
	}

	var payload struct {
		Turma      uuid.UUID  `json:"turma"`
		Disciplina string     `json:"disciplina"`
		Bimestre   int        `json:"bimestre"`
		Itens      []NotaItem `json:"itens"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION", "payload inválido", nil)
		return
	}

	if payload.Turma == uuid.Nil || payload.Disciplina == "" || payload.Bimestre < 1 || payload.Bimestre > 4 {
		writeError(w, http.StatusBadRequest, "VALIDATION", "dados inválidos", nil)
		return
	}

	if err := h.service.UpsertNotas(ctx, profID, payload.Turma, payload.Disciplina, payload.Bimestre, payload.Itens); err != nil {
		handleDomainError(w, err)
		return
	}

	logRequest(ctx, "POST /prof/notas", profID, start)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) handleListAvaliacoes(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	start := time.Now()
	profID, err := subjectAsUUID(ctx)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}
	if !hasProfessorRole(ctx) {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "sem acesso", nil)
		return
	}

	var turmaPtr *uuid.UUID
	if turmaStr := r.URL.Query().Get("turma"); turmaStr != "" {
		tid, err := uuid.Parse(turmaStr)
		if err != nil {
			writeError(w, http.StatusBadRequest, "VALIDATION", "turma inválida", nil)
			return
		}
		turmaPtr = &tid
	}
	disciplina := r.URL.Query().Get("disciplina")

	avaliacoes, err := h.service.ListAvaliacoes(ctx, profID, turmaPtr, disciplina)
	if err != nil {
		handleDomainError(w, err)
		return
	}

	logRequest(ctx, "GET /prof/avaliacoes", profID, start)
	writeJSON(w, http.StatusOK, map[string]any{"avaliacoes": avaliacoes})
}

func (h *Handler) handleSaveAvaliacao(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	start := time.Now()
	profID, err := subjectAsUUID(ctx)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}
	if !hasProfessorRole(ctx) {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "sem acesso", nil)
		return
	}

	var payload struct {
		ID         *uuid.UUID         `json:"id"`
		Turma      uuid.UUID          `json:"turma"`
		Disciplina string             `json:"disciplina"`
		Titulo     string             `json:"titulo"`
		Inicio     *time.Time         `json:"inicio"`
		Fim        *time.Time         `json:"fim"`
		Status     string             `json:"status"`
		Questoes   []AvaliacaoQuestao `json:"questoes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION", "payload inválido", nil)
		return
	}

	if payload.Turma == uuid.Nil || strings.TrimSpace(payload.Titulo) == "" || payload.Disciplina == "" {
		writeError(w, http.StatusBadRequest, "VALIDATION", "dados obrigatórios ausentes", nil)
		return
	}

	avaliacao := Avaliacao{
		ID:         uuid.Nil,
		TurmaID:    payload.Turma,
		Disciplina: payload.Disciplina,
		Titulo:     payload.Titulo,
		Status:     payload.Status,
		Inicio:     payload.Inicio,
		Fim:        payload.Fim,
	}
	if payload.ID != nil {
		avaliacao.ID = *payload.ID
	}

	id, err := h.service.SaveAvaliacao(ctx, profID, avaliacao, payload.Questoes)
	if err != nil {
		handleDomainError(w, err)
		return
	}

	logRequest(ctx, "POST /prof/avaliacoes", profID, start)
	writeJSON(w, http.StatusOK, map[string]any{"id": id})
}

func (h *Handler) handlePublicarAvaliacao(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	profID, err := subjectAsUUID(ctx)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}
	if !hasProfessorRole(ctx) {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "sem acesso", nil)
		return
	}

	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION", "avaliacao inválida", nil)
		return
	}

	if err := h.service.PublicarAvaliacao(ctx, profID, id); err != nil {
		handleDomainError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "PUBLICADA"})
}

func (h *Handler) handleEncerrarAvaliacao(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	profID, err := subjectAsUUID(ctx)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}
	if !hasProfessorRole(ctx) {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "sem acesso", nil)
		return
	}

	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION", "avaliacao inválida", nil)
		return
	}

	if err := h.service.EncerrarAvaliacao(ctx, profID, id); err != nil {
		handleDomainError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ENCERRADA"})
}

func subjectAsUUID(ctx context.Context) (uuid.UUID, error) {
	sub := httpmiddleware.GetSubject(ctx)
	return uuid.Parse(sub)
}

func hasProfessorRole(ctx context.Context) bool {
	roles := httpmiddleware.GetRoles(ctx)
	for _, role := range roles {
		switch role {
		case "PROFESSOR", "ADMIN_TEC":
			return true
		}
	}
	return false
}

func handleDomainError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrForbidden):
		writeError(w, http.StatusForbidden, "FORBIDDEN", "sem acesso", nil)
	case errors.Is(err, errNotFound):
		writeError(w, http.StatusNotFound, "NOT_FOUND", "registro não encontrado", nil)
	default:
		writeInternalError(w, err)
	}
}

func writeInternalError(w http.ResponseWriter, err error) {
	log.Error().Err(err).Msg("edu handler error")
	writeError(w, http.StatusInternalServerError, "INTERNAL", "erro interno", nil)
}

func logRequest(ctx context.Context, label string, userID uuid.UUID, start time.Time) {
	logger := log.Ctx(ctx)
	if logger == nil {
		logger = &log.Logger
	}
	reqID := chimiddleware.GetReqID(ctx)
	logger.Info().Str("request_id", reqID).Str("user_id", userID.String()).Str("label", label).Dur("duration", time.Since(start)).Msg("edu_request")
}

// Helpers de resposta JSON compatíveis com o resto do projeto.
type successEnvelope struct {
	Data  any `json:"data"`
	Error any `json:"error"`
}

type errorEnvelope struct {
	Data  any            `json:"data"`
	Error *errorResponse `json:"error"`
}

type errorResponse struct {
	Code    string      `json:"code"`
	Message string      `json:"message"`
	Details interface{} `json:"details,omitempty"`
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(successEnvelope{Data: payload, Error: nil})
}

func writeError(w http.ResponseWriter, status int, code, message string, details interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(errorEnvelope{Data: nil, Error: &errorResponse{Code: code, Message: message, Details: details}})
}
