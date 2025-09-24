package http

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/gestaozabele/municipio/internal/support"
)

// ListSupportTickets lista chamados filtrando por tenant/status.
func (h *Handler) ListSupportTickets(w http.ResponseWriter, r *http.Request) {
	if h.support == nil {
		WriteError(w, http.StatusServiceUnavailable, "INTERNAL", "módulo de suporte indisponível", nil)
		return
	}

	var filter support.TicketFilter

	if tenantIDStr := strings.TrimSpace(r.URL.Query().Get("tenant_id")); tenantIDStr != "" {
		tenantID, err := uuid.Parse(tenantIDStr)
		if err != nil {
			WriteError(w, http.StatusBadRequest, "VALIDATION", "tenant_id inválido", nil)
			return
		}
		filter.TenantID = &tenantID
	}

	if statusParam := strings.TrimSpace(r.URL.Query().Get("status")); statusParam != "" {
		parts := strings.Split(statusParam, ",")
		filter.Status = make([]string, 0, len(parts))
		for _, part := range parts {
			part = strings.TrimSpace(part)
			if part != "" {
				filter.Status = append(filter.Status, part)
			}
		}
	}

	if limitStr := strings.TrimSpace(r.URL.Query().Get("limit")); limitStr != "" {
		if v, err := strconv.Atoi(limitStr); err == nil {
			filter.Limit = v
		}
	}
	if offsetStr := strings.TrimSpace(r.URL.Query().Get("offset")); offsetStr != "" {
		if v, err := strconv.Atoi(offsetStr); err == nil {
			filter.Offset = v
		}
	}

	tickets, err := h.support.ListTickets(r.Context(), filter)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível listar tickets", nil)
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"tickets": tickets})
}

// CreateSupportTicket abre novo chamado.
func (h *Handler) CreateSupportTicket(w http.ResponseWriter, r *http.Request) {
	if h.support == nil {
		WriteError(w, http.StatusServiceUnavailable, "INTERNAL", "módulo de suporte indisponível", nil)
		return
	}

	var payload struct {
		TenantID    string   `json:"tenant_id"`
		Subject     string   `json:"subject"`
		Category    string   `json:"category"`
		Description string   `json:"description"`
		Priority    string   `json:"priority"`
		Status      string   `json:"status"`
		Tags        []string `json:"tags"`
		AssignedTo  *string  `json:"assigned_to"`
	}

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "JSON inválido", nil)
		return
	}

	tenantID, err := uuid.Parse(strings.TrimSpace(payload.TenantID))
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "tenant_id inválido", nil)
		return
	}

	creatorID, err := h.subjectUUID(r)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}

	var assigned *uuid.UUID
	if payload.AssignedTo != nil {
		if strings.TrimSpace(*payload.AssignedTo) != "" {
			parsed, err := uuid.Parse(strings.TrimSpace(*payload.AssignedTo))
			if err != nil {
				WriteError(w, http.StatusBadRequest, "VALIDATION", "assigned_to inválido", nil)
				return
			}
			assigned = &parsed
		}
	}

	ticket, err := h.support.CreateTicket(r.Context(), support.CreateTicketInput{
		TenantID:    tenantID,
		Subject:     payload.Subject,
		Category:    payload.Category,
		Description: payload.Description,
		Priority:    payload.Priority,
		Status:      payload.Status,
		Tags:        payload.Tags,
		CreatedBy:   &creatorID,
		AssignedTo:  assigned,
	})
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", err.Error(), nil)
		return
	}

	WriteJSON(w, http.StatusCreated, map[string]any{"ticket": ticket})
}

// GetSupportTicket devolve detalhes do chamado.
func (h *Handler) GetSupportTicket(w http.ResponseWriter, r *http.Request) {
	if h.support == nil {
		WriteError(w, http.StatusServiceUnavailable, "INTERNAL", "módulo de suporte indisponível", nil)
		return
	}

	ticketID, err := uuid.Parse(strings.TrimSpace(chi.URLParam(r, "id")))
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "id inválido", nil)
		return
	}

	ticket, err := h.support.GetTicket(r.Context(), ticketID)
	if err != nil {
		if errors.Is(err, support.ErrNotFound) {
			WriteError(w, http.StatusNotFound, "NOT_FOUND", "ticket não encontrado", nil)
			return
		}
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível carregar ticket", nil)
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"ticket": ticket})
}

// UpdateSupportTicket altera status/prioridade/atribuição.
func (h *Handler) UpdateSupportTicket(w http.ResponseWriter, r *http.Request) {
	if h.support == nil {
		WriteError(w, http.StatusServiceUnavailable, "INTERNAL", "módulo de suporte indisponível", nil)
		return
	}

	ticketID, err := uuid.Parse(strings.TrimSpace(chi.URLParam(r, "id")))
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "id inválido", nil)
		return
	}

	var payload struct {
		Status        *string `json:"status"`
		Priority      *string `json:"priority"`
		AssignedTo    *string `json:"assigned_to"`
		ClearAssignee bool    `json:"clear_assignee"`
	}

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "JSON inválido", nil)
		return
	}

	var assignedUUID *uuid.UUID
	if payload.AssignedTo != nil && strings.TrimSpace(*payload.AssignedTo) != "" {
		parsed, err := uuid.Parse(strings.TrimSpace(*payload.AssignedTo))
		if err != nil {
			WriteError(w, http.StatusBadRequest, "VALIDATION", "assigned_to inválido", nil)
			return
		}
		assignedUUID = &parsed
	}

	ticket, err := h.support.UpdateTicket(r.Context(), ticketID, payload.Status, payload.Priority, assignedUUID, payload.ClearAssignee)
	if err != nil {
		switch {
		case errors.Is(err, support.ErrNotFound):
			WriteError(w, http.StatusNotFound, "NOT_FOUND", "ticket não encontrado", nil)
		case errors.Is(err, support.ErrInvalidStatus), errors.Is(err, support.ErrInvalidPriority):
			WriteError(w, http.StatusBadRequest, "VALIDATION", err.Error(), nil)
		default:
			WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível atualizar ticket", nil)
		}
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"ticket": ticket})
}

// ListSupportTicketMessages lista mensagens do chamado.
func (h *Handler) ListSupportTicketMessages(w http.ResponseWriter, r *http.Request) {
	if h.support == nil {
		WriteError(w, http.StatusServiceUnavailable, "INTERNAL", "módulo de suporte indisponível", nil)
		return
	}

	ticketID, err := uuid.Parse(strings.TrimSpace(chi.URLParam(r, "id")))
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "id inválido", nil)
		return
	}

	messages, err := h.support.ListMessages(r.Context(), ticketID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível listar mensagens", nil)
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"messages": messages})
}

// AddSupportTicketMessage adiciona resposta no chamado.
func (h *Handler) AddSupportTicketMessage(w http.ResponseWriter, r *http.Request) {
	if h.support == nil {
		WriteError(w, http.StatusServiceUnavailable, "INTERNAL", "módulo de suporte indisponível", nil)
		return
	}

	ticketID, err := uuid.Parse(strings.TrimSpace(chi.URLParam(r, "id")))
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "id inválido", nil)
		return
	}

	var payload struct {
		Body string `json:"body"`
	}

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "JSON inválido", nil)
		return
	}

	authorID, err := h.subjectUUID(r)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}

	message, err := h.support.AddMessage(r.Context(), support.CreateMessageInput{
		TicketID:   ticketID,
		AuthorType: support.AuthorSaaS,
		AuthorID:   &authorID,
		Body:       payload.Body,
	})
	if err != nil {
		switch {
		case errors.Is(err, support.ErrInvalidAuthor):
			WriteError(w, http.StatusBadRequest, "VALIDATION", err.Error(), nil)
		default:
			WriteError(w, http.StatusBadRequest, "VALIDATION", err.Error(), nil)
		}
		return
	}

	WriteJSON(w, http.StatusCreated, map[string]any{"message": message})
}
