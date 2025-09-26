package http

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type cityInsightPayload struct {
	Population    *int64   `json:"population"`
	ActiveUsers   *int64   `json:"active_users"`
	RequestsTotal *int64   `json:"requests_total"`
	Satisfaction  *float64 `json:"satisfaction"`
	Highlights    []string `json:"highlights"`
	LastSync      *string  `json:"last_sync"`
}

// ListCityInsights devolve os indicadores por cidade.
func (h *Handler) ListCityInsights(w http.ResponseWriter, r *http.Request) {
	insights, err := h.loadCityInsights(r.Context())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível listar cidades", nil)
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"cities": insights})
}

// SyncCityInsight atualiza métricas coletadas e registra timestamp de sincronização.
func (h *Handler) SyncCityInsight(w http.ResponseWriter, r *http.Request) {
	tenantID, err := parseUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "id inválido", nil)
		return
	}

	var payload cityInsightPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil && !errors.Is(err, io.EOF) {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "JSON inválido", nil)
		return
	}

	setParts := make([]string, 0, 6)
	args := make([]any, 0, 6)
	idx := 1

	if payload.Population != nil {
		setParts = append(setParts, fmt.Sprintf("population = $%d", idx))
		args = append(args, *payload.Population)
		idx++
	}
	if payload.ActiveUsers != nil {
		setParts = append(setParts, fmt.Sprintf("active_users = $%d", idx))
		args = append(args, *payload.ActiveUsers)
		idx++
	}
	if payload.RequestsTotal != nil {
		setParts = append(setParts, fmt.Sprintf("requests_total = $%d", idx))
		args = append(args, *payload.RequestsTotal)
		idx++
	}
	if payload.Satisfaction != nil {
		val := minMaxFloat(*payload.Satisfaction, 0, 100)
		setParts = append(setParts, fmt.Sprintf("satisfaction = $%d", idx))
		args = append(args, val)
		idx++
	}
	if payload.Highlights != nil {
		setParts = append(setParts, fmt.Sprintf("highlights = $%d", idx))
		args = append(args, payload.Highlights)
		idx++
	}

	var lastSync any = time.Now()
	if payload.LastSync != nil && strings.TrimSpace(*payload.LastSync) != "" {
		if ts, err := parseISODate(*payload.LastSync); err == nil {
			lastSync = ts
		}
	}
	setParts = append(setParts, fmt.Sprintf("last_sync = $%d", idx))
	args = append(args, lastSync)
	idx++

	args = append(args, tenantID)

	query := fmt.Sprintf("UPDATE saas_city_insights SET %s, updated_at = now() WHERE tenant_id = $%d", strings.Join(setParts, ", "), idx)

	tag, err := h.pool.Exec(r.Context(), query, args...)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível atualizar indicadores", nil)
		return
	}
	if tag.RowsAffected() == 0 {
		WriteError(w, http.StatusNotFound, "NOT_FOUND", "cidade não encontrada", nil)
		return
	}

	insights, err := h.loadCityInsights(r.Context())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "falha ao carregar indicadores", nil)
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"cities": insights})
}
