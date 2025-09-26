package http

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/gestaozabele/municipio/internal/storage"
)

type contractPayload struct {
	Status        *string  `json:"status"`
	ContractValue *float64 `json:"contract_value"`
	StartDate     *string  `json:"start_date"`
	RenewalDate   *string  `json:"renewal_date"`
	Notes         *string  `json:"notes"`
}

type contractModulePayload struct {
	Modules map[string]bool `json:"modules"`
}

type contractView struct {
	Status        string              `json:"status"`
	ContractValue *float64            `json:"contract_value"`
	StartDate     *time.Time          `json:"start_date"`
	RenewalDate   *time.Time          `json:"renewal_date"`
	Notes         *string             `json:"notes"`
	ContractFile  *string             `json:"contract_file_url"`
	Modules       map[string]bool     `json:"modules"`
	Invoices      []tenantInvoiceView `json:"invoices"`
}

type tenantInvoiceView struct {
	ID             uuid.UUID `json:"id"`
	ReferenceMonth time.Time `json:"reference_month"`
	Amount         *float64  `json:"amount"`
	Status         string    `json:"status"`
	FileURL        *string   `json:"file_url"`
	UploadedAt     time.Time `json:"uploaded_at"`
	Notes          *string   `json:"notes"`
}

// GetTenantContract retorna os detalhes contratuais da prefeitura.
func (h *Handler) GetTenantContract(w http.ResponseWriter, r *http.Request) {
	tenantID, err := parseUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "id inválido", nil)
		return
	}

	contract, err := h.fetchTenantContract(r.Context(), tenantID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			WriteError(w, http.StatusNotFound, "NOT_FOUND", "contrato não encontrado", nil)
			return
		}
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível carregar contrato", nil)
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"contract": contract})
}

// UpdateTenantContract ajusta status, valores e datas principais do contrato.
func (h *Handler) UpdateTenantContract(w http.ResponseWriter, r *http.Request) {
	tenantID, err := parseUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "id inválido", nil)
		return
	}

	var payload contractPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "JSON inválido", nil)
		return
	}

	setParts := make([]string, 0, 6)
	args := make([]any, 0, 6)
	idx := 1

	if payload.Status != nil && strings.TrimSpace(*payload.Status) != "" {
		status := strings.ToLower(strings.TrimSpace(*payload.Status))
		setParts = append(setParts, fmt.Sprintf("status = $%d", idx))
		args = append(args, status)
		idx++
	}
	if payload.ContractValue != nil {
		setParts = append(setParts, fmt.Sprintf("contract_value = $%d", idx))
		args = append(args, *payload.ContractValue)
		idx++
	}
	if payload.StartDate != nil {
		var t any
		if strings.TrimSpace(*payload.StartDate) != "" {
			if ts, err := parseISODate(*payload.StartDate); err == nil {
				t = ts
			}
		}
		setParts = append(setParts, fmt.Sprintf("start_date = $%d", idx))
		args = append(args, t)
		idx++
	}
	if payload.RenewalDate != nil {
		var t any
		if strings.TrimSpace(*payload.RenewalDate) != "" {
			if ts, err := parseISODate(*payload.RenewalDate); err == nil {
				t = ts
			}
		}
		setParts = append(setParts, fmt.Sprintf("renewal_date = $%d", idx))
		args = append(args, t)
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

	if len(setParts) == 0 {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "nenhum campo para atualizar", nil)
		return
	}

	args = append(args, tenantID)
	query := fmt.Sprintf("UPDATE saas_tenant_contracts SET %s, updated_at = now() WHERE tenant_id = $%d", strings.Join(setParts, ", "), idx)

	tag, err := h.pool.Exec(r.Context(), query, args...)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível atualizar contrato", nil)
		return
	}
	if tag.RowsAffected() == 0 {
		WriteError(w, http.StatusNotFound, "NOT_FOUND", "contrato não encontrado", nil)
		return
	}

	contract, err := h.fetchTenantContract(r.Context(), tenantID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "falha ao carregar contrato", nil)
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"contract": contract})
}

// UpdateTenantModules atualiza os módulos ativos do contrato.
func (h *Handler) UpdateTenantModules(w http.ResponseWriter, r *http.Request) {
	tenantID, err := parseUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "id inválido", nil)
		return
	}

	var payload contractModulePayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "JSON inválido", nil)
		return
	}

	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível atualizar módulos", nil)
		return
	}
	defer tx.Rollback(r.Context())

	if _, err := tx.Exec(r.Context(), "DELETE FROM saas_tenant_contract_modules WHERE tenant_id = $1", tenantID); err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível limpar módulos", nil)
		return
	}

	if len(payload.Modules) > 0 {
		const insert = `
            INSERT INTO saas_tenant_contract_modules (tenant_id, module_code, enabled)
            VALUES ($1, $2, $3)
        `
		for code, enabled := range payload.Modules {
			code = strings.TrimSpace(code)
			if code == "" {
				continue
			}
			if _, err := tx.Exec(r.Context(), insert, tenantID, code, enabled); err != nil {
				WriteError(w, http.StatusInternalServerError, "INTERNAL", "falha ao registrar módulo", nil)
				return
			}
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível salvar módulos", nil)
		return
	}

	contract, err := h.fetchTenantContract(r.Context(), tenantID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "falha ao carregar contrato", nil)
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"contract": contract})
}

// UploadTenantContractFile envia o PDF do contrato assinado.
func (h *Handler) UploadTenantContractFile(w http.ResponseWriter, r *http.Request) {
	tenantID, err := parseUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "id inválido", nil)
		return
	}

	if err := r.ParseMultipartForm(20 << 20); err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "formulário inválido", nil)
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

	data, contentType, err := readMultipartFile(fileHeader, 20<<20)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", err.Error(), nil)
		return
	}

	ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
	if ext == "" {
		ext = ".pdf"
	}

	key := fmt.Sprintf("contracts/%s/%d%s", tenantID.String(), time.Now().UnixNano(), ext)
	result, err := h.storage.Upload(r.Context(), storage.UploadInput{
		Key:          key,
		Body:         data,
		ContentType:  contentType,
		CacheControl: "private,max-age=31536000",
	})
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "falha ao enviar contrato", nil)
		return
	}

	const update = `
        INSERT INTO saas_tenant_contracts (tenant_id, contract_file_url, contract_file_key)
        VALUES ($1, $2, $3)
        ON CONFLICT (tenant_id) DO UPDATE SET contract_file_url = EXCLUDED.contract_file_url, contract_file_key = EXCLUDED.contract_file_key, updated_at = now()
    `

	if _, err := h.pool.Exec(r.Context(), update, tenantID, result.URL, key); err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível registrar arquivo", nil)
		return
	}

	contract, err := h.fetchTenantContract(r.Context(), tenantID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "falha ao carregar contrato", nil)
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"contract": contract})
}

// UploadTenantInvoice adiciona nota fiscal vinculada ao contrato.
func (h *Handler) UploadTenantInvoice(w http.ResponseWriter, r *http.Request) {
	tenantID, err := parseUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "id inválido", nil)
		return
	}

	if err := r.ParseMultipartForm(20 << 20); err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "formulário inválido", nil)
		return
	}

	fileHeader, err := getFirstFile(r.MultipartForm, "file")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", err.Error(), nil)
		return
	}

	referenceMonthStr := strings.TrimSpace(r.FormValue("reference_month"))
	if referenceMonthStr == "" {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "reference_month é obrigatório", nil)
		return
	}
	referenceMonth, err := time.Parse("2006-01", referenceMonthStr)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "reference_month deve estar no formato YYYY-MM", nil)
		return
	}

	amount := sql.NullFloat64{}
	if value := strings.TrimSpace(r.FormValue("amount")); value != "" {
		if parsed, err := strconv.ParseFloat(value, 64); err == nil {
			amount = sql.NullFloat64{Float64: parsed, Valid: true}
		}
	}

	status := strings.TrimSpace(r.FormValue("status"))
	if status == "" {
		status = "pending"
	}

	notesVal := strings.TrimSpace(r.FormValue("notes"))

	if h.storage == nil {
		WriteError(w, http.StatusServiceUnavailable, "INTERNAL", "armazenamento indisponível", nil)
		return
	}
	switch h.storage.(type) {
	case storage.NoopUploader, *storage.NoopUploader:
		WriteError(w, http.StatusServiceUnavailable, "INTERNAL", "armazenamento indisponível", nil)
		return
	}

	data, contentType, err := readMultipartFile(fileHeader, 20<<20)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", err.Error(), nil)
		return
	}

	ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
	if ext == "" {
		ext = ".pdf"
	}

	key := fmt.Sprintf("contracts/%s/invoices/%d%s", tenantID.String(), time.Now().UnixNano(), ext)
	result, err := h.storage.Upload(r.Context(), storage.UploadInput{
		Key:          key,
		Body:         data,
		ContentType:  contentType,
		CacheControl: "private,max-age=31536000",
	})
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "falha ao enviar nota", nil)
		return
	}

	const insert = `
        INSERT INTO saas_tenant_invoices (tenant_id, reference_month, amount, status, file_url, file_key, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (tenant_id, reference_month) DO UPDATE SET amount = EXCLUDED.amount, status = EXCLUDED.status, file_url = EXCLUDED.file_url, file_key = EXCLUDED.file_key, notes = EXCLUDED.notes, uploaded_at = now()
        RETURNING id
    `

	var invoiceID uuid.UUID
	if err := h.pool.QueryRow(r.Context(), insert, tenantID, referenceMonth, nullableFloat(amount), status, result.URL, key, nullableString(sql.NullString{String: notesVal, Valid: notesVal != ""})).Scan(&invoiceID); err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível registrar nota", nil)
		return
	}

	contract, err := h.fetchTenantContract(r.Context(), tenantID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "falha ao carregar contrato", nil)
		return
	}

	WriteJSON(w, http.StatusCreated, map[string]any{"invoice_id": invoiceID, "contract": contract})
}

// DeleteTenantInvoice remove nota fiscal específica.
func (h *Handler) DeleteTenantInvoice(w http.ResponseWriter, r *http.Request) {
	tenantID, err := parseUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "id inválido", nil)
		return
	}
	invoiceID, err := parseUUIDParam(r, "invoiceID")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "id da nota inválido", nil)
		return
	}

	tag, err := h.pool.Exec(r.Context(), "DELETE FROM saas_tenant_invoices WHERE tenant_id = $1 AND id = $2", tenantID, invoiceID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível remover nota", nil)
		return
	}
	if tag.RowsAffected() == 0 {
		WriteError(w, http.StatusNotFound, "NOT_FOUND", "nota não encontrada", nil)
		return
	}

	contract, err := h.fetchTenantContract(r.Context(), tenantID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "falha ao carregar contrato", nil)
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"contract": contract})
}

func (h *Handler) fetchTenantContract(ctx context.Context, tenantID uuid.UUID) (contractView, error) {
	const contractQuery = `
        SELECT status, contract_value, start_date, renewal_date, notes, contract_file_url
        FROM saas_tenant_contracts
        WHERE tenant_id = $1
    `

	var (
		contract contractView
		value    sql.NullFloat64
		start    sql.NullTime
		renewal  sql.NullTime
		notes    sql.NullString
		fileURL  sql.NullString
	)

	err := h.pool.QueryRow(ctx, contractQuery, tenantID).Scan(&contract.Status, &value, &start, &renewal, &notes, &fileURL)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// initialize default record
			if _, insertErr := h.pool.Exec(ctx, "INSERT INTO saas_tenant_contracts (tenant_id) VALUES ($1) ON CONFLICT DO NOTHING", tenantID); insertErr != nil {
				return contractView{}, insertErr
			}
			return h.fetchTenantContract(ctx, tenantID)
		}
		return contractView{}, err
	}

	if value.Valid {
		amount := value.Float64
		contract.ContractValue = &amount
	}
	if start.Valid {
		ts := start.Time
		contract.StartDate = &ts
	}
	if renewal.Valid {
		ts := renewal.Time
		contract.RenewalDate = &ts
	}
	if notes.Valid {
		note := strings.TrimSpace(notes.String)
		contract.Notes = &note
	}
	if fileURL.Valid {
		url := strings.TrimSpace(fileURL.String)
		contract.ContractFile = &url
	}

	modulesRows, err := h.pool.Query(ctx, `SELECT module_code, enabled FROM saas_tenant_contract_modules WHERE tenant_id = $1`, tenantID)
	if err != nil && err != pgx.ErrNoRows {
		return contractView{}, err
	}
	contract.Modules = make(map[string]bool)
	if modulesRows != nil {
		defer modulesRows.Close()
		for modulesRows.Next() {
			var code string
			var enabled bool
			if err := modulesRows.Scan(&code, &enabled); err != nil {
				return contractView{}, err
			}
			contract.Modules[code] = enabled
		}
	}

	invoicesRows, err := h.pool.Query(ctx, `
        SELECT id, reference_month, amount, status, file_url, uploaded_at, notes
        FROM saas_tenant_invoices
        WHERE tenant_id = $1
        ORDER BY reference_month DESC
    `, tenantID)
	if err != nil && err != pgx.ErrNoRows {
		return contractView{}, err
	}
	if invoicesRows != nil {
		defer invoicesRows.Close()
		for invoicesRows.Next() {
			var (
				invoice tenantInvoiceView
				amount  sql.NullFloat64
				file    sql.NullString
				note    sql.NullString
			)
			if err := invoicesRows.Scan(&invoice.ID, &invoice.ReferenceMonth, &amount, &invoice.Status, &file, &invoice.UploadedAt, &note); err != nil {
				return contractView{}, err
			}
			if amount.Valid {
				val := amount.Float64
				invoice.Amount = &val
			}
			if file.Valid {
				str := strings.TrimSpace(file.String)
				invoice.FileURL = &str
			}
			if note.Valid {
				str := strings.TrimSpace(note.String)
				invoice.Notes = &str
			}
			contract.Invoices = append(contract.Invoices, invoice)
		}
	}

	return contract, nil
}

func nullableFloat(value sql.NullFloat64) any {
	if value.Valid {
		return value.Float64
	}
	return nil
}
