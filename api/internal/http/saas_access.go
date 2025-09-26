package http

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
)

type accessLogPayload struct {
	User      string  `json:"user"`
	Role      *string `json:"role"`
	TenantID  *string `json:"tenant_id"`
	LoggedAt  *string `json:"logged_at"`
	IP        *string `json:"ip"`
	Location  *string `json:"location"`
	UserAgent *string `json:"user_agent"`
	Status    *string `json:"status"`
}

// ListAccessLogs retorna o histórico recente de autenticações.
func (h *Handler) ListAccessLogs(w http.ResponseWriter, r *http.Request) {
	logs, err := h.loadAccessLogs(r.Context())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível listar acessos", nil)
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"access_logs": logs})
}

// CreateAccessLog registra um novo evento de acesso.
func (h *Handler) CreateAccessLog(w http.ResponseWriter, r *http.Request) {
	var payload accessLogPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "JSON inválido", nil)
		return
	}

	user := strings.TrimSpace(payload.User)
	if user == "" {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "usuário é obrigatório", nil)
		return
	}

	var tenantID uuid.NullUUID
	if payload.TenantID != nil && strings.TrimSpace(*payload.TenantID) != "" {
		if id, err := uuid.Parse(strings.TrimSpace(*payload.TenantID)); err == nil {
			tenantID = uuid.NullUUID{UUID: id, Valid: true}
		}
	}

	loggedAt := time.Now()
	if payload.LoggedAt != nil && strings.TrimSpace(*payload.LoggedAt) != "" {
		if ts, err := parseISODate(*payload.LoggedAt); err == nil {
			loggedAt = ts
		}
	}

	role := ""
	if payload.Role != nil {
		role = strings.TrimSpace(*payload.Role)
	}

	ip := ""
	if payload.IP != nil {
		ip = strings.TrimSpace(*payload.IP)
	}

	location := ""
	if payload.Location != nil {
		location = strings.TrimSpace(*payload.Location)
	}

	ua := ""
	if payload.UserAgent != nil {
		ua = strings.TrimSpace(*payload.UserAgent)
	}

	status := ""
	if payload.Status != nil {
		status = strings.TrimSpace(*payload.Status)
	}

	const insert = `
        INSERT INTO saas_access_logs (user_name, role, tenant_id, logged_at, ip_address, location, user_agent, status)
        VALUES ($1, NULLIF($2,''), $3, $4, NULLIF($5,''), NULLIF($6,''), NULLIF($7,''), NULLIF($8,''))
        RETURNING id
    `

	var id uuid.UUID
	if err := h.pool.QueryRow(r.Context(), insert, user, role, nullableUUID(tenantID), loggedAt, ip, location, ua, status).Scan(&id); err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível registrar acesso", nil)
		return
	}

	logs, err := h.loadAccessLogs(r.Context())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "falha ao listar acessos", nil)
		return
	}

	WriteJSON(w, http.StatusCreated, map[string]any{"id": id, "access_logs": logs})
}
