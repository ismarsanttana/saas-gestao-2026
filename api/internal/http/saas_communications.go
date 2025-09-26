package http

import (
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/google/uuid"
)

type announcementPayload struct {
	Title       string  `json:"title"`
	Audience    *string `json:"audience"`
	Status      *string `json:"status"`
	PublishedAt *string `json:"published_at"`
	Content     *string `json:"content"`
}

type pushDecisionPayload struct {
	Reason *string `json:"reason"`
}

// GetCommunicationCenter devolve anúncios e fila de notificações.
func (h *Handler) GetCommunicationCenter(w http.ResponseWriter, r *http.Request) {
	center, err := h.loadCommunication(r.Context())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível carregar hub de comunicação", nil)
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"communication": center})
}

// CreateAnnouncement publica um novo anúncio interno.
func (h *Handler) CreateAnnouncement(w http.ResponseWriter, r *http.Request) {
	var payload announcementPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "JSON inválido", nil)
		return
	}

	title := strings.TrimSpace(payload.Title)
	if title == "" {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "título é obrigatório", nil)
		return
	}

	audience := "Todos"
	if payload.Audience != nil && strings.TrimSpace(*payload.Audience) != "" {
		audience = strings.TrimSpace(*payload.Audience)
	}

	status := "draft"
	if payload.Status != nil && strings.TrimSpace(*payload.Status) != "" {
		status = strings.TrimSpace(strings.ToLower(*payload.Status))
	}

	var published sql.NullTime
	if payload.PublishedAt != nil && strings.TrimSpace(*payload.PublishedAt) != "" {
		if ts, err := parseISODate(*payload.PublishedAt); err == nil {
			published = sql.NullTime{Time: ts, Valid: true}
		}
	}

	var content sql.NullString
	if payload.Content != nil && strings.TrimSpace(*payload.Content) != "" {
		content = sql.NullString{String: strings.TrimSpace(*payload.Content), Valid: true}
	}

	authorID, err := h.subjectUUID(r)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}

	const insert = `
        INSERT INTO saas_announcements (title, audience, status, published_at, author_id, content)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, published_at
    `

	var (
		announcementID uuid.UUID
		publishedAt    sql.NullTime
	)

	if err := h.pool.QueryRow(r.Context(), insert, title, audience, status, nullableTime(published), authorID, nullableString(content)).Scan(&announcementID, &publishedAt); err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível criar anúncio", nil)
		return
	}

	center, err := h.loadCommunication(r.Context())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "falha ao atualizar hub", nil)
		return
	}

	WriteJSON(w, http.StatusCreated, map[string]any{"announcement_id": announcementID, "communication": center})
}

// ApprovePushNotification aprova notificação pendente e registra auditoria.
func (h *Handler) ApprovePushNotification(w http.ResponseWriter, r *http.Request) {
	pushID, err := parseUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "id inválido", nil)
		return
	}

	actorID, err := h.subjectUUID(r)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}

	var payload pushDecisionPayload
	_ = json.NewDecoder(r.Body).Decode(&payload)

	const update = `
        UPDATE saas_push_notifications
        SET status = 'approved', decided_by = $1, decided_at = now(), decision_reason = NULL, updated_at = now()
        WHERE id = $2 AND status = 'pending'
    `

	tag, err := h.pool.Exec(r.Context(), update, actorID, pushID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível aprovar notificação", nil)
		return
	}
	if tag.RowsAffected() == 0 {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "notificação inexistente ou já processada", nil)
		return
	}

	center, err := h.loadCommunication(r.Context())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "falha ao atualizar hub", nil)
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"communication": center})
}

// RejectPushNotification reprova notificação pendente.
func (h *Handler) RejectPushNotification(w http.ResponseWriter, r *http.Request) {
	pushID, err := parseUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "id inválido", nil)
		return
	}

	actorID, err := h.subjectUUID(r)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}

	var payload pushDecisionPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil && !errors.Is(err, io.EOF) {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "JSON inválido", nil)
		return
	}

	var reason sql.NullString
	if payload.Reason != nil && strings.TrimSpace(*payload.Reason) != "" {
		reason = sql.NullString{String: strings.TrimSpace(*payload.Reason), Valid: true}
	}

	const update = `
        UPDATE saas_push_notifications
        SET status = 'rejected', decided_by = $1, decided_at = now(), decision_reason = $2, updated_at = now()
        WHERE id = $3 AND status = 'pending'
    `

	tag, err := h.pool.Exec(r.Context(), update, actorID, nullableString(reason), pushID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível reprovar notificação", nil)
		return
	}
	if tag.RowsAffected() == 0 {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "notificação inexistente ou já processada", nil)
		return
	}

	center, err := h.loadCommunication(r.Context())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "falha ao atualizar hub", nil)
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"communication": center})
}
