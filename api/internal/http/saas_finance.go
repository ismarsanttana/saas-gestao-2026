package http

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/gestaozabele/municipio/internal/storage"
)

var allowedEntryTypes = map[string]struct{}{
	"expense":      {},
	"revenue":      {},
	"investment":   {},
	"payroll":      {},
	"subscription": {},
}

type financeEntryPayload struct {
	EntryType   string  `json:"entry_type"`
	Category    string  `json:"category"`
	Description string  `json:"description"`
	Amount      float64 `json:"amount"`
	DueDate     *string `json:"due_date"`
	Paid        *bool   `json:"paid"`
	Method      *string `json:"method"`
	CostCenter  *string `json:"cost_center"`
	Responsible *string `json:"responsible"`
	Notes       *string `json:"notes"`
	TenantID    *string `json:"tenant_id"`
}

type financeEntryView struct {
	ID          uuid.UUID           `json:"id"`
	EntryType   string              `json:"entry_type"`
	Category    string              `json:"category"`
	Description string              `json:"description"`
	Amount      float64             `json:"amount"`
	DueDate     *time.Time          `json:"due_date,omitempty"`
	Paid        bool                `json:"paid"`
	PaidAt      *time.Time          `json:"paid_at,omitempty"`
	Method      *string             `json:"method,omitempty"`
	CostCenter  *string             `json:"cost_center,omitempty"`
	Responsible *string             `json:"responsible,omitempty"`
	Notes       *string             `json:"notes,omitempty"`
	Attachments []financeAttachment `json:"attachments"`
	CreatedAt   time.Time           `json:"created_at"`
}

type financeAttachment struct {
	ID         uuid.UUID `json:"id"`
	Name       string    `json:"name"`
	URL        string    `json:"url"`
	UploadedAt time.Time `json:"uploaded_at"`
}

// ListFinanceEntries retorna os lançamentos financeiros cadastrados.
func (h *Handler) ListFinanceEntries(w http.ResponseWriter, r *http.Request) {
	entries, err := h.loadFinanceEntries(r.Context())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível listar lançamentos", nil)
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"entries": entries})
}

// CreateFinanceEntry registra um novo lançamento de caixa.
func (h *Handler) CreateFinanceEntry(w http.ResponseWriter, r *http.Request) {
	var payload financeEntryPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "JSON inválido", nil)
		return
	}

	entryType := strings.ToLower(strings.TrimSpace(payload.EntryType))
	if _, ok := allowedEntryTypes[entryType]; !ok {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "tipo de lançamento inválido", nil)
		return
	}

	category := strings.TrimSpace(payload.Category)
	if category == "" {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "categoria é obrigatória", nil)
		return
	}

	description := strings.TrimSpace(payload.Description)
	if description == "" {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "descrição é obrigatória", nil)
		return
	}

	amount := payload.Amount
	if amount <= 0 {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "valor deve ser positivo", nil)
		return
	}

	var due sql.NullTime
	if payload.DueDate != nil && strings.TrimSpace(*payload.DueDate) != "" {
		if ts, err := parseISODate(*payload.DueDate); err == nil {
			due = sql.NullTime{Time: ts, Valid: true}
		}
	}

	var method sql.NullString
	if payload.Method != nil && strings.TrimSpace(*payload.Method) != "" {
		method = sql.NullString{String: strings.TrimSpace(*payload.Method), Valid: true}
	}

	var costCenter sql.NullString
	if payload.CostCenter != nil && strings.TrimSpace(*payload.CostCenter) != "" {
		costCenter = sql.NullString{String: strings.TrimSpace(*payload.CostCenter), Valid: true}
	}

	var responsible sql.NullString
	if payload.Responsible != nil && strings.TrimSpace(*payload.Responsible) != "" {
		responsible = sql.NullString{String: strings.TrimSpace(*payload.Responsible), Valid: true}
	}

	var notes sql.NullString
	if payload.Notes != nil && strings.TrimSpace(*payload.Notes) != "" {
		notes = sql.NullString{String: strings.TrimSpace(*payload.Notes), Valid: true}
	}

	var tenantID uuid.NullUUID
	if payload.TenantID != nil && strings.TrimSpace(*payload.TenantID) != "" {
		if tenantUUID, err := uuid.Parse(strings.TrimSpace(*payload.TenantID)); err == nil {
			tenantID = uuid.NullUUID{UUID: tenantUUID, Valid: true}
		}
	}

	creatorID, err := h.subjectUUID(r)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}

	paid := false
	if payload.Paid != nil {
		paid = *payload.Paid
	}

	var paidAt any
	if paid {
		paidAt = time.Now()
	}

	const insert = `
        INSERT INTO saas_finance_entries (tenant_id, entry_type, category, description, amount, due_date, paid, paid_at, method, cost_center, responsible, notes, created_by, updated_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULLIF($9,''), NULLIF($10,''), NULLIF($11,''), $12, $13, $13)
        RETURNING id
    `

	var entryID uuid.UUID
	if err := h.pool.QueryRow(r.Context(), insert,
		nullableUUID(tenantID),
		entryType,
		category,
		description,
		amount,
		nullableTime(due),
		paid,
		paidAt,
		method.String,
		costCenter.String,
		responsible.String,
		nullableString(notes),
		creatorID,
	).Scan(&entryID); err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível registrar lançamento", nil)
		return
	}

	entry, err := h.fetchFinanceEntry(r.Context(), entryID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "falha ao carregar lançamento", nil)
		return
	}

	WriteJSON(w, http.StatusCreated, map[string]any{"entry": entry})
}

// UpdateFinanceEntry ajusta informações do lançamento (pagamento, valores, notas, etc.).
func (h *Handler) UpdateFinanceEntry(w http.ResponseWriter, r *http.Request) {
	entryID, err := parseUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "id inválido", nil)
		return
	}

	var payload financeEntryPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "JSON inválido", nil)
		return
	}

	updaterID, err := h.subjectUUID(r)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}

	setParts := make([]string, 0, 10)
	args := make([]any, 0, 10)
	idx := 1

	if payload.Category != "" {
		category := strings.TrimSpace(payload.Category)
		if category == "" {
			WriteError(w, http.StatusBadRequest, "VALIDATION", "categoria inválida", nil)
			return
		}
		setParts = append(setParts, fmt.Sprintf("category = $%d", idx))
		args = append(args, category)
		idx++
	}

	if payload.Description != "" {
		desc := strings.TrimSpace(payload.Description)
		if desc == "" {
			WriteError(w, http.StatusBadRequest, "VALIDATION", "descrição inválida", nil)
			return
		}
		setParts = append(setParts, fmt.Sprintf("description = $%d", idx))
		args = append(args, desc)
		idx++
	}

	if payload.Amount > 0 {
		setParts = append(setParts, fmt.Sprintf("amount = $%d", idx))
		args = append(args, payload.Amount)
		idx++
	}

	if payload.EntryType != "" {
		entryType := strings.ToLower(strings.TrimSpace(payload.EntryType))
		if _, ok := allowedEntryTypes[entryType]; !ok {
			WriteError(w, http.StatusBadRequest, "VALIDATION", "tipo inválido", nil)
			return
		}
		setParts = append(setParts, fmt.Sprintf("entry_type = $%d", idx))
		args = append(args, entryType)
		idx++
	}

	if payload.DueDate != nil {
		var t any
		if strings.TrimSpace(*payload.DueDate) != "" {
			if ts, err := parseISODate(*payload.DueDate); err == nil {
				t = ts
			}
		}
		setParts = append(setParts, fmt.Sprintf("due_date = $%d", idx))
		args = append(args, t)
		idx++
	}

	if payload.Method != nil {
		setParts = append(setParts, fmt.Sprintf("method = NULLIF($%d,'')", idx))
		args = append(args, strings.TrimSpace(*payload.Method))
		idx++
	}

	if payload.CostCenter != nil {
		setParts = append(setParts, fmt.Sprintf("cost_center = NULLIF($%d,'')", idx))
		args = append(args, strings.TrimSpace(*payload.CostCenter))
		idx++
	}

	if payload.Responsible != nil {
		setParts = append(setParts, fmt.Sprintf("responsible = NULLIF($%d,'')", idx))
		args = append(args, strings.TrimSpace(*payload.Responsible))
		idx++
	}

	if payload.Notes != nil {
		note := strings.TrimSpace(*payload.Notes)
		setParts = append(setParts, fmt.Sprintf("notes = $%d", idx))
		if note == "" {
			args = append(args, nil)
		} else {
			args = append(args, note)
		}
		idx++
	}

	if payload.Paid != nil {
		setParts = append(setParts, fmt.Sprintf("paid = $%d", idx))
		args = append(args, *payload.Paid)
		idx++
		if *payload.Paid {
			setParts = append(setParts, "paid_at = now()")
		} else {
			setParts = append(setParts, "paid_at = NULL")
		}
	}

	if len(setParts) == 0 {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "nenhum campo para atualizar", nil)
		return
	}

	setParts = append(setParts, fmt.Sprintf("updated_by = $%d", idx))
	args = append(args, updaterID)
	idx++

	args = append(args, entryID)

	query := fmt.Sprintf("UPDATE saas_finance_entries SET %s, updated_at = now() WHERE id = $%d", strings.Join(setParts, ", "), idx)

	tag, err := h.pool.Exec(r.Context(), query, args...)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível atualizar lançamento", nil)
		return
	}
	if tag.RowsAffected() == 0 {
		WriteError(w, http.StatusNotFound, "NOT_FOUND", "lançamento não encontrado", nil)
		return
	}

	entry, err := h.fetchFinanceEntry(r.Context(), entryID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			WriteError(w, http.StatusNotFound, "NOT_FOUND", "lançamento não encontrado", nil)
			return
		}
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "falha ao carregar lançamento", nil)
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"entry": entry})
}

// DeleteFinanceEntry remove permanentemente um lançamento.
func (h *Handler) DeleteFinanceEntry(w http.ResponseWriter, r *http.Request) {
	entryID, err := parseUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "id inválido", nil)
		return
	}

	tag, err := h.pool.Exec(r.Context(), "DELETE FROM saas_finance_entries WHERE id = $1", entryID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível remover lançamento", nil)
		return
	}
	if tag.RowsAffected() == 0 {
		WriteError(w, http.StatusNotFound, "NOT_FOUND", "lançamento não encontrado", nil)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// UploadFinanceAttachment adiciona um anexo ao lançamento.
func (h *Handler) UploadFinanceAttachment(w http.ResponseWriter, r *http.Request) {
	entryID, err := parseUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "id inválido", nil)
		return
	}

	if err := r.ParseMultipartForm(10 << 20); err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "dados multipart inválidos", nil)
		return
	}

	fileHeader, err := getFirstFile(r.MultipartForm, "file")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", err.Error(), nil)
		return
	}

	if h.storage == nil {
		WriteError(w, http.StatusServiceUnavailable, "INTERNAL", "armazenamento indisponível", nil)
		return
	}
	switch h.storage.(type) {
	case storage.NoopUploader, *storage.NoopUploader:
		WriteError(w, http.StatusServiceUnavailable, "INTERNAL", "armazenamento indisponível", nil)
		return
	}

	data, contentType, err := readMultipartFile(fileHeader, 10<<20)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", err.Error(), nil)
		return
	}

	ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
	if ext == "" {
		ext = ".bin"
	}

	key := fmt.Sprintf("finance/%s/%d%s", entryID.String(), time.Now().UnixNano(), ext)

	result, err := h.storage.Upload(r.Context(), storage.UploadInput{
		Key:          key,
		Body:         data,
		ContentType:  contentType,
		CacheControl: "private,max-age=31536000",
	})
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "falha ao enviar arquivo", nil)
		return
	}

	const insert = `
        INSERT INTO saas_finance_attachments (finance_entry_id, file_name, file_url, object_key, uploaded_by)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, uploaded_at
    `

	uploaderID, _ := h.subjectUUID(r)
	var (
		attachmentID uuid.UUID
		uploadedAt   time.Time
	)
	if err := h.pool.QueryRow(r.Context(), insert, entryID, fileHeader.Filename, result.URL, key, uploaderID).Scan(&attachmentID, &uploadedAt); err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível registrar anexo", nil)
		return
	}

	attachment := financeAttachment{
		ID:         attachmentID,
		Name:       fileHeader.Filename,
		URL:        result.URL,
		UploadedAt: uploadedAt,
	}

	WriteJSON(w, http.StatusCreated, map[string]any{"attachment": attachment})
}

// DeleteFinanceAttachment remove um anexo específico.
func (h *Handler) DeleteFinanceAttachment(w http.ResponseWriter, r *http.Request) {
	entryID, err := parseUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "id inválido", nil)
		return
	}
	attachmentID, err := parseUUIDParam(r, "attachmentID")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "id do anexo inválido", nil)
		return
	}

	tag, err := h.pool.Exec(r.Context(), "DELETE FROM saas_finance_attachments WHERE id = $1 AND finance_entry_id = $2", attachmentID, entryID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível remover anexo", nil)
		return
	}
	if tag.RowsAffected() == 0 {
		WriteError(w, http.StatusNotFound, "NOT_FOUND", "anexo não encontrado", nil)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) loadFinanceEntries(ctx context.Context) ([]financeEntryView, error) {
	const query = `
        SELECT id, entry_type, category, description, amount, due_date, paid, paid_at, method, cost_center, responsible, notes, created_at
        FROM saas_finance_entries
        ORDER BY created_at DESC
    `

	rows, err := h.pool.Query(ctx, query)
	if err != nil {
		if err == pgx.ErrNoRows {
			return []financeEntryView{}, nil
		}
		return nil, err
	}
	defer rows.Close()

	var entries []financeEntryView
	for rows.Next() {
		var (
			entry       financeEntryView
			due         sql.NullTime
			paidAt      sql.NullTime
			method      sql.NullString
			cost        sql.NullString
			responsible sql.NullString
			notes       sql.NullString
		)
		if err := rows.Scan(&entry.ID, &entry.EntryType, &entry.Category, &entry.Description, &entry.Amount, &due, &entry.Paid, &paidAt, &method, &cost, &responsible, &notes, &entry.CreatedAt); err != nil {
			return nil, err
		}
		if due.Valid {
			ts := due.Time
			entry.DueDate = &ts
		}
		if paidAt.Valid {
			ts := paidAt.Time
			entry.PaidAt = &ts
		}
		if method.Valid {
			str := strings.TrimSpace(method.String)
			entry.Method = &str
		}
		if cost.Valid {
			str := strings.TrimSpace(cost.String)
			entry.CostCenter = &str
		}
		if responsible.Valid {
			str := strings.TrimSpace(responsible.String)
			entry.Responsible = &str
		}
		if notes.Valid {
			str := strings.TrimSpace(notes.String)
			entry.Notes = &str
		}

		attachments, err := h.loadFinanceAttachments(ctx, entry.ID)
		if err != nil {
			return nil, err
		}
		entry.Attachments = attachments
		entries = append(entries, entry)
	}

	return entries, rows.Err()
}

func (h *Handler) fetchFinanceEntry(ctx context.Context, entryID uuid.UUID) (financeEntryView, error) {
	const query = `
        SELECT id, entry_type, category, description, amount, due_date, paid, paid_at, method, cost_center, responsible, notes, created_at
        FROM saas_finance_entries
        WHERE id = $1
    `

	var (
		entry       financeEntryView
		due         sql.NullTime
		paidAt      sql.NullTime
		method      sql.NullString
		cost        sql.NullString
		responsible sql.NullString
		notes       sql.NullString
	)

	if err := h.pool.QueryRow(ctx, query, entryID).Scan(&entry.ID, &entry.EntryType, &entry.Category, &entry.Description, &entry.Amount, &due, &entry.Paid, &paidAt, &method, &cost, &responsible, &notes, &entry.CreatedAt); err != nil {
		return financeEntryView{}, err
	}

	if due.Valid {
		ts := due.Time
		entry.DueDate = &ts
	}
	if paidAt.Valid {
		ts := paidAt.Time
		entry.PaidAt = &ts
	}
	if method.Valid {
		str := strings.TrimSpace(method.String)
		entry.Method = &str
	}
	if cost.Valid {
		str := strings.TrimSpace(cost.String)
		entry.CostCenter = &str
	}
	if responsible.Valid {
		str := strings.TrimSpace(responsible.String)
		entry.Responsible = &str
	}
	if notes.Valid {
		str := strings.TrimSpace(notes.String)
		entry.Notes = &str
	}

	attachments, err := h.loadFinanceAttachments(ctx, entry.ID)
	if err != nil {
		return financeEntryView{}, err
	}
	entry.Attachments = attachments
	return entry, nil
}

func (h *Handler) loadFinanceAttachments(ctx context.Context, entryID uuid.UUID) ([]financeAttachment, error) {
	rows, err := h.pool.Query(ctx, `
        SELECT id, file_name, file_url, uploaded_at
        FROM saas_finance_attachments
        WHERE finance_entry_id = $1
        ORDER BY uploaded_at DESC
    `, entryID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return []financeAttachment{}, nil
		}
		return nil, err
	}
	defer rows.Close()

	var attachments []financeAttachment
	for rows.Next() {
		var att financeAttachment
		if err := rows.Scan(&att.ID, &att.Name, &att.URL, &att.UploadedAt); err != nil {
			return nil, err
		}
		attachments = append(attachments, att)
	}
	return attachments, rows.Err()
}

func getFirstFile(form *multipart.Form, field string) (*multipart.FileHeader, error) {
	if form == nil {
		return nil, errors.New("arquivo ausente")
	}
	files := form.File[field]
	if len(files) == 0 {
		return nil, errors.New("arquivo ausente")
	}
	return files[0], nil
}

func readMultipartFile(header *multipart.FileHeader, limit int64) ([]byte, string, error) {
	file, err := header.Open()
	if err != nil {
		return nil, "", fmt.Errorf("falha ao abrir arquivo: %w", err)
	}
	defer file.Close()

	buf := bytes.NewBuffer(nil)
	if _, err := io.Copy(buf, io.LimitReader(file, limit)); err != nil {
		return nil, "", fmt.Errorf("falha ao ler arquivo: %w", err)
	}

	if int64(buf.Len()) >= limit {
		return nil, "", fmt.Errorf("arquivo excede %d bytes", limit)
	}

	contentType := header.Header.Get("Content-Type")
	if strings.TrimSpace(contentType) == "" {
		contentType = http.DetectContentType(buf.Bytes())
	}

	return buf.Bytes(), contentType, nil
}

func nullableUUID(value uuid.NullUUID) any {
	if value.Valid {
		return value.UUID
	}
	return nil
}
