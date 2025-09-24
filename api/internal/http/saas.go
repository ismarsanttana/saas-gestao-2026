package http

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgconn"

	"github.com/gestaozabele/municipio/internal/tenant"
)

// ListTenants devolve todos os tenants cadastrados (SaaS admin).
func (h *Handler) ListTenants(w http.ResponseWriter, r *http.Request) {
	tenants, err := h.tenants.List(r.Context())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível listar tenants", nil)
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"tenants": tenants})
}

// CreateTenant registra um novo tenant (SaaS admin).
func (h *Handler) CreateTenant(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Slug     string         `json:"slug"`
		Nome     string         `json:"display_name"`
		Domain   string         `json:"domain"`
		Settings map[string]any `json:"settings"`
	}

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "JSON inválido", nil)
		return
	}

	if strings.TrimSpace(payload.Slug) == "" || strings.TrimSpace(payload.Nome) == "" || strings.TrimSpace(payload.Domain) == "" {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "slug, display_name e domain são obrigatórios", nil)
		return
	}

	tenantCreated, err := h.tenants.Create(r.Context(), tenant.CreateTenantInput{
		Slug:        payload.Slug,
		DisplayName: payload.Nome,
		Domain:      payload.Domain,
		Settings:    payload.Settings,
	})
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			WriteError(w, http.StatusConflict, "CONFLICT", "slug ou domínio já cadastrados", nil)
			return
		}
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível criar tenant", nil)
		return
	}

	WriteJSON(w, http.StatusCreated, map[string]any{"tenant": tenantCreated})
}

// TenantConfig devolve informações públicas do município, identificando o host.
func (h *Handler) TenantConfig(w http.ResponseWriter, r *http.Request) {
	host := r.Host
	tenantInfo, err := h.tenants.Resolve(r.Context(), host)
	if err != nil {
		if err == tenant.ErrNotFound {
			WriteError(w, http.StatusNotFound, "TENANT_NOT_FOUND", "tenant não configurado para este domínio", nil)
			return
		}
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível carregar tenant", nil)
		return
	}

	WriteJSON(w, http.StatusOK, tenantInfo)
}
