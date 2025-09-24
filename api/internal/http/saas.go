package http

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/gestaozabele/municipio/internal/cloudflare"
	"github.com/gestaozabele/municipio/internal/monitor"
	"github.com/gestaozabele/municipio/internal/provision"
	"github.com/gestaozabele/municipio/internal/saas"
	"github.com/gestaozabele/municipio/internal/settings"
	"github.com/gestaozabele/municipio/internal/storage"
	"github.com/gestaozabele/municipio/internal/tenant"
	"github.com/gestaozabele/municipio/internal/util"
)

const maxLogoSizeBytes int64 = 5 << 20 // 5 MB

type tenantPayload struct {
	Slug        string              `json:"slug"`
	DisplayName string              `json:"display_name"`
	Domain      string              `json:"domain"`
	Status      string              `json:"status"`
	Notes       *string             `json:"notes"`
	Contact     map[string]any      `json:"contact"`
	Theme       map[string]any      `json:"theme"`
	Settings    map[string]any      `json:"settings"`
	InitialTeam []teamMemberPayload `json:"initial_team"`
}

type teamMemberPayload struct {
	Name  string `json:"name"`
	Email string `json:"email"`
	Role  string `json:"role"`
}

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
	payload, logoFile, err := h.decodeTenantPayload(r)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", err.Error(), nil)
		return
	}

	if strings.TrimSpace(payload.Slug) == "" || strings.TrimSpace(payload.DisplayName) == "" || strings.TrimSpace(payload.Domain) == "" {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "slug, display_name e domain são obrigatórios", nil)
		return
	}

	status := tenant.NormalizeStatus(payload.Status)
	if !tenant.IsValidStatus(status) {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "status inválido", map[string]any{"allowed": []string{tenant.StatusDraft, tenant.StatusReview, tenant.StatusActive, tenant.StatusSuspended, tenant.StatusArchived}})
		return
	}

	creatorID, err := h.subjectUUID(r)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}
	createdBy := &creatorID

	if payload.Contact == nil {
		payload.Contact = map[string]any{}
	}
	if payload.Theme == nil {
		payload.Theme = map[string]any{}
	}
	if payload.Settings == nil {
		payload.Settings = map[string]any{}
	}

	var logoURL *string
	if logoFile != nil {
		uploadedLogo, err := h.uploadTenantLogo(r.Context(), payload.Slug, logoFile)
		if err != nil {
			WriteError(w, http.StatusBadRequest, "UPLOAD", err.Error(), nil)
			return
		}
		logoURL = uploadedLogo
	}

	tenantCreated, err := h.tenants.Create(r.Context(), tenant.CreateTenantInput{
		Slug:        payload.Slug,
		DisplayName: payload.DisplayName,
		Domain:      payload.Domain,
		Status:      status,
		Contact:     payload.Contact,
		Theme:       payload.Theme,
		Settings:    payload.Settings,
		LogoURL:     logoURL,
		Notes:       payload.Notes,
		CreatedBy:   createdBy,
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

	teamInvites, err := h.inviteInitialTeam(r.Context(), payload.InitialTeam, createdBy)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", err.Error(), nil)
		return
	}

	response := map[string]any{
		"tenant":       tenantCreated,
		"team_invites": teamInvites,
	}

	if h.provisioner != nil && h.provisioner.IsConfigured() && status == tenant.StatusActive {
		updated, provErr := h.provisioner.ProvisionTenant(r.Context(), tenantCreated.ID, false)
		if provErr != nil {
			response["dns_warning"] = provErr.Error()
		} else if updated != nil {
			response["tenant"] = updated
			tenantCreated = updated
		}
	}

	WriteJSON(w, http.StatusCreated, response)
}

// ListSaaSUsers devolve os administradores cadastrados.
func (h *Handler) ListSaaSUsers(w http.ResponseWriter, r *http.Request) {
	if h.saasUsers == nil {
		WriteError(w, http.StatusServiceUnavailable, "INTERNAL", "gestão de usuários indisponível", nil)
		return
	}

	users, err := h.saasUsers.ListUsers(r.Context())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível carregar usuários", nil)
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"users": users})
}

// ListSaaSInvites devolve convites pendentes ou todos.
func (h *Handler) ListSaaSInvites(w http.ResponseWriter, r *http.Request) {
	if h.saasUsers == nil {
		WriteError(w, http.StatusServiceUnavailable, "INTERNAL", "gestão de usuários indisponível", nil)
		return
	}

	pendingOnly := false
	switch strings.ToLower(strings.TrimSpace(r.URL.Query().Get("pending"))) {
	case "1", "true", "yes", "sim", "pendente":
		pendingOnly = true
	}

	invites, err := h.saasUsers.ListInvites(r.Context(), pendingOnly)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível carregar convites", nil)
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"invites": invites})
}

// CreateSaaSUser cria um administrador imediatamente ativo.
func (h *Handler) CreateSaaSUser(w http.ResponseWriter, r *http.Request) {
	if h.saasUsers == nil {
		WriteError(w, http.StatusServiceUnavailable, "INTERNAL", "gestão de usuários indisponível", nil)
		return
	}

	var payload struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
		Role     string `json:"role"`
		Active   *bool  `json:"active"`
	}

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "JSON inválido", nil)
		return
	}

	if strings.TrimSpace(payload.Name) == "" {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "nome obrigatório", nil)
		return
	}
	if err := util.ValidateEmail(payload.Email); err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", err.Error(), nil)
		return
	}
	if strings.TrimSpace(payload.Password) == "" {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "senha obrigatória", nil)
		return
	}

	active := true
	if payload.Active != nil {
		active = *payload.Active
	}

	creatorID, err := h.subjectUUID(r)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}

	user, err := h.saasUsers.CreateUser(r.Context(), payload.Name, payload.Email, payload.Role, payload.Password, active, &creatorID)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			WriteError(w, http.StatusConflict, "CONFLICT", "já existe administrador com esse e-mail", nil)
			return
		}
		WriteError(w, http.StatusBadRequest, "VALIDATION", err.Error(), nil)
		return
	}

	WriteJSON(w, http.StatusCreated, map[string]any{"user": user})
}

// InviteSaaSUser gera um convite para um novo administrador.
func (h *Handler) InviteSaaSUser(w http.ResponseWriter, r *http.Request) {
	if h.saasUsers == nil {
		WriteError(w, http.StatusServiceUnavailable, "INTERNAL", "gestão de usuários indisponível", nil)
		return
	}

	var payload struct {
		Name  string `json:"name"`
		Email string `json:"email"`
		Role  string `json:"role"`
	}

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "JSON inválido", nil)
		return
	}

	if err := util.ValidateEmail(payload.Email); err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", err.Error(), nil)
		return
	}

	creatorID, err := h.subjectUUID(r)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}

	invite, err := h.saasUsers.InviteUser(r.Context(), payload.Name, payload.Email, payload.Role, &creatorID)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", err.Error(), nil)
		return
	}

	WriteJSON(w, http.StatusCreated, map[string]any{
		"invite": invite.Invite,
		"token":  invite.Token,
	})
}

// UpdateSaaSUser altera papel e status do administrador.
func (h *Handler) UpdateSaaSUser(w http.ResponseWriter, r *http.Request) {
	if h.saasUsers == nil {
		WriteError(w, http.StatusServiceUnavailable, "INTERNAL", "gestão de usuários indisponível", nil)
		return
	}

	userIDParam := chi.URLParam(r, "id")
	userID, err := uuid.Parse(strings.TrimSpace(userIDParam))
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "id inválido", nil)
		return
	}

	var payload struct {
		Name   string `json:"name"`
		Role   string `json:"role"`
		Active *bool  `json:"active"`
	}

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "JSON inválido", nil)
		return
	}
	if payload.Active == nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "campo active é obrigatório", nil)
		return
	}
	if strings.TrimSpace(payload.Name) == "" {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "nome obrigatório", nil)
		return
	}

	updaterID, err := h.subjectUUID(r)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}

	updated, err := h.saasUsers.UpdateUser(r.Context(), saas.UpdateUserInput{
		ID:        userID,
		Name:      payload.Name,
		Role:      payload.Role,
		Active:    *payload.Active,
		UpdatedBy: &updaterID,
	})
	if err != nil {
		if errors.Is(err, saas.ErrNotFound) {
			WriteError(w, http.StatusNotFound, "NOT_FOUND", "usuário não encontrado", nil)
			return
		}
		WriteError(w, http.StatusBadRequest, "VALIDATION", err.Error(), nil)
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"user": updated})
}

// DeleteSaaSUser remove um administrador.
func (h *Handler) DeleteSaaSUser(w http.ResponseWriter, r *http.Request) {
	if h.saasUsers == nil {
		WriteError(w, http.StatusServiceUnavailable, "INTERNAL", "gestão de usuários indisponível", nil)
		return
	}

	userIDParam := chi.URLParam(r, "id")
	userID, err := uuid.Parse(strings.TrimSpace(userIDParam))
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "id inválido", nil)
		return
	}

	currentID, err := h.subjectUUID(r)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}

	if userID == currentID {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "não é possível remover o próprio usuário", nil)
		return
	}

	if err := h.saasUsers.DeleteUser(r.Context(), userID); err != nil {
		if errors.Is(err, saas.ErrNotFound) {
			WriteError(w, http.StatusNotFound, "NOT_FOUND", "usuário não encontrado", nil)
			return
		}
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível remover usuário", nil)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// TenantConfig devolve informações públicas do município, identificando o host.
func (h *Handler) TenantConfig(w http.ResponseWriter, r *http.Request) {
	host := r.Host
	if domain := strings.TrimSpace(r.URL.Query().Get("domain")); domain != "" {
		host = domain
	}
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

func (h *Handler) decodeTenantPayload(r *http.Request) (tenantPayload, *multipart.FileHeader, error) {
	var payload tenantPayload
	contentType := r.Header.Get("Content-Type")

	if strings.HasPrefix(strings.ToLower(contentType), "multipart/form-data") {
		if err := r.ParseMultipartForm(25 << 20); err != nil {
			return payload, nil, fmt.Errorf("não foi possível ler formulário: %w", err)
		}
		raw := r.FormValue("payload")
		if strings.TrimSpace(raw) == "" {
			return payload, nil, errors.New("payload JSON obrigatório em multipart")
		}
		if err := json.Unmarshal([]byte(raw), &payload); err != nil {
			return payload, nil, errors.New("payload JSON inválido")
		}
		file, header, err := r.FormFile("logo")
		if err == nil {
			_ = file.Close()
			return payload, header, nil
		}
		if err != http.ErrMissingFile {
			return payload, nil, fmt.Errorf("falha ao ler logo: %w", err)
		}
		return payload, nil, nil
	}

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		return payload, nil, errors.New("JSON inválido")
	}
	return payload, nil, nil
}

func (h *Handler) uploadTenantLogo(ctx context.Context, slug string, fh *multipart.FileHeader) (*string, error) {
	if fh == nil {
		return nil, nil
	}

	if h.storage == nil {
		return nil, errors.New("upload de logo indisponível")
	}

	switch h.storage.(type) {
	case storage.NoopUploader, *storage.NoopUploader:
		return nil, errors.New("upload de logo indisponível no ambiente atual")
	}

	if fh.Size > maxLogoSizeBytes {
		return nil, fmt.Errorf("arquivo excede %d bytes", maxLogoSizeBytes)
	}

	file, err := fh.Open()
	if err != nil {
		return nil, fmt.Errorf("falha ao ler arquivo: %w", err)
	}
	defer file.Close()

	data, err := io.ReadAll(io.LimitReader(file, maxLogoSizeBytes))
	if err != nil {
		return nil, fmt.Errorf("falha ao ler arquivo: %w", err)
	}

	contentType := fh.Header.Get("Content-Type")
	if strings.TrimSpace(contentType) == "" {
		contentType = http.DetectContentType(data)
	}

	ext := strings.ToLower(strings.TrimSpace(filepath.Ext(fh.Filename)))
	if ext == "" {
		ext = ".png"
	}

	normalizedSlug := strings.TrimSpace(strings.ToLower(slug))
	key := fmt.Sprintf("tenants/%s/branding/logo-%d%s", normalizedSlug, time.Now().Unix(), ext)

	result, err := h.storage.Upload(ctx, storage.UploadInput{
		Key:          key,
		Body:         data,
		ContentType:  contentType,
		CacheControl: "public,max-age=31536000,immutable",
	})
	if err != nil {
		return nil, fmt.Errorf("falha ao enviar logo: %w", err)
	}
	return &result.URL, nil
}

func (h *Handler) inviteInitialTeam(ctx context.Context, members []teamMemberPayload, createdBy *uuid.UUID) ([]map[string]any, error) {
	if len(members) == 0 || h.saasUsers == nil {
		return nil, nil
	}

	seen := make(map[string]struct{})
	var invites []map[string]any

	for _, member := range members {
		email := strings.TrimSpace(strings.ToLower(member.Email))
		if email == "" {
			continue
		}
		if _, ok := seen[email]; ok {
			continue
		}
		seen[email] = struct{}{}

		if err := util.ValidateEmail(email); err != nil {
			return nil, fmt.Errorf("e-mail inválido (%s): %w", member.Email, err)
		}

		role := saas.NormalizeRole(member.Role)
		if !saas.IsValidRole(role) {
			return nil, fmt.Errorf("papel inválido para %s", member.Email)
		}

		invite, err := h.saasUsers.InviteUser(ctx, member.Name, email, role, createdBy)
		if err != nil {
			return nil, fmt.Errorf("falha ao convidar %s: %w", member.Email, err)
		}

		invites = append(invites, map[string]any{
			"invite": invite.Invite,
			"token":  invite.Token,
		})
	}

	return invites, nil
}

func (h *Handler) ProvisionTenantDNS(w http.ResponseWriter, r *http.Request) {
	if h.provisioner == nil || !h.provisioner.IsConfigured() {
		WriteError(w, http.StatusServiceUnavailable, "INTERNAL", "provisionamento de DNS indisponível", nil)
		return
	}

	tenantID, err := uuid.Parse(strings.TrimSpace(chi.URLParam(r, "id")))
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "id inválido", nil)
		return
	}

	proxied := strings.EqualFold(r.URL.Query().Get("proxied"), "true")
	if !proxied {
		proxied = h.provisioner.DefaultProxied()
	}

	updated, err := h.provisioner.ProvisionTenant(r.Context(), tenantID, proxied)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "PROVISION", err.Error(), nil)
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"tenant": updated})
}

func (h *Handler) CheckTenantDNS(w http.ResponseWriter, r *http.Request) {
	if h.provisioner == nil || !h.provisioner.IsConfigured() {
		WriteError(w, http.StatusServiceUnavailable, "INTERNAL", "provisionamento de DNS indisponível", nil)
		return
	}

	tenantID, err := uuid.Parse(strings.TrimSpace(chi.URLParam(r, "id")))
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "id inválido", nil)
		return
	}

	updated, err := h.provisioner.CheckTenant(r.Context(), tenantID)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "PROVISION", err.Error(), nil)
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"tenant": updated})
}

func (h *Handler) ImportTenants(w http.ResponseWriter, r *http.Request) {
	dryRun := false
	switch strings.ToLower(strings.TrimSpace(r.URL.Query().Get("dry_run"))) {
	case "1", "true", "yes", "sim":
		dryRun = true
	}

	if err := r.ParseMultipartForm(25 << 20); err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "não foi possível ler arquivo", nil)
		return
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "arquivo CSV obrigatório", nil)
		return
	}
	defer file.Close()

	reader := csv.NewReader(file)
	reader.TrimLeadingSpace = true

	headers, err := reader.Read()
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "CSV vazio ou inválido", nil)
		return
	}

	columnIndex := map[string]int{}
	for idx, col := range headers {
		columnIndex[strings.ToLower(strings.TrimSpace(col))] = idx
	}

	required := []string{"slug", "display_name", "domain"}
	for _, key := range required {
		if _, ok := columnIndex[key]; !ok {
			WriteError(w, http.StatusBadRequest, "VALIDATION", fmt.Sprintf("coluna %s obrigatória", key), nil)
			return
		}
	}

	type result struct {
		Line    int            `json:"line"`
		Slug    string         `json:"slug"`
		Success bool           `json:"success"`
		Error   string         `json:"error,omitempty"`
		Tenant  *tenant.Tenant `json:"tenant,omitempty"`
	}

	results := []result{}
	seenSlugs := map[string]int{}
	seenDomains := map[string]int{}
	createdCount := 0

	lineNumber := 1
	for {
		record, err := reader.Read()
		if err != nil {
			if errors.Is(err, io.EOF) {
				break
			}
			WriteError(w, http.StatusBadRequest, "VALIDATION", fmt.Sprintf("erro ao ler CSV: %v", err), nil)
			return
		}
		lineNumber++

		slug := strings.TrimSpace(strings.ToLower(valueFromCSV(record, columnIndex, "slug")))
		displayName := strings.TrimSpace(valueFromCSV(record, columnIndex, "display_name"))
		domain := strings.TrimSpace(strings.ToLower(valueFromCSV(record, columnIndex, "domain")))
		status := strings.TrimSpace(strings.ToLower(valueFromCSV(record, columnIndex, "status")))
		if status == "" {
			status = tenant.StatusDraft
		}

		res := result{Line: lineNumber, Slug: slug}
		if slug == "" || displayName == "" || domain == "" {
			res.Error = "slug, display_name e domain são obrigatórios"
			results = append(results, res)
			continue
		}
		if prevLine, ok := seenSlugs[slug]; ok {
			res.Error = fmt.Sprintf("slug duplicado (linha %d)", prevLine)
			results = append(results, res)
			continue
		}
		if prevLine, ok := seenDomains[domain]; ok {
			res.Error = fmt.Sprintf("domínio duplicado (linha %d)", prevLine)
			results = append(results, res)
			continue
		}

		seenSlugs[slug] = lineNumber
		seenDomains[domain] = lineNumber

		if _, err := h.tenants.GetBySlug(r.Context(), slug); err == nil {
			res.Error = "slug já registrado"
			results = append(results, res)
			continue
		} else if err != nil && !errors.Is(err, tenant.ErrNotFound) {
			res.Error = err.Error()
			results = append(results, res)
			continue
		}

		if existing, err := h.tenants.Resolve(r.Context(), domain); err == nil && existing != nil {
			res.Error = "domínio já utilizado"
			results = append(results, res)
			continue
		}

		contact := map[string]any{}
		if email := strings.TrimSpace(valueFromCSV(record, columnIndex, "contact_email")); email != "" {
			contact["email"] = email
		}
		if phone := strings.TrimSpace(valueFromCSV(record, columnIndex, "contact_phone")); phone != "" {
			contact["phone"] = phone
		}
		if supportURL := strings.TrimSpace(valueFromCSV(record, columnIndex, "support_url")); supportURL != "" {
			contact["support_url"] = supportURL
		}

		theme := map[string]any{}
		if primary := strings.TrimSpace(valueFromCSV(record, columnIndex, "theme_primary")); primary != "" {
			theme["primary_color"] = primary
		}
		if accent := strings.TrimSpace(valueFromCSV(record, columnIndex, "theme_accent")); accent != "" {
			theme["accent_color"] = accent
		}

		notes := strings.TrimSpace(valueFromCSV(record, columnIndex, "notes"))

		if dryRun {
			res.Success = true
			results = append(results, res)
			continue
		}

		created, err := h.tenants.Create(r.Context(), tenant.CreateTenantInput{
			Slug:        slug,
			DisplayName: displayName,
			Domain:      domain,
			Status:      status,
			Contact:     contact,
			Theme:       theme,
			Settings:    map[string]any{},
			Notes:       optionalString(notes),
		})
		if err != nil {
			res.Error = err.Error()
			results = append(results, res)
			continue
		}

		createdCount++
		res.Success = true
		res.Tenant = created

		if h.provisioner != nil && h.provisioner.IsConfigured() && created.Status == tenant.StatusActive {
			if updated, provErr := h.provisioner.ProvisionTenant(r.Context(), created.ID, false); provErr == nil {
				res.Tenant = updated
			} else {
				res.Error = fmt.Sprintf("criado mas DNS pendente: %v", provErr)
			}
		}

		results = append(results, res)
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"dry_run": dryRun,
		"created": createdCount,
		"results": results,
	})
}

func valueFromCSV(record []string, columns map[string]int, key string) string {
	if idx, ok := columns[key]; ok && idx < len(record) {
		return record[idx]
	}
	return ""
}

func optionalString(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

// MonitorSummary lista métricas consolidadas.
func (h *Handler) MonitorSummary(w http.ResponseWriter, r *http.Request) {
	if h.monitor == nil || !h.monitorOn {
		WriteError(w, http.StatusServiceUnavailable, "INTERNAL", "monitoramento indisponível", nil)
		return
	}

	summaries, err := h.monitor.Summaries(r.Context())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível carregar métricas", nil)
		return
	}

	alerts, err := h.monitor.Alerts(r.Context(), 20)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível carregar alertas", nil)
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"summaries": summaries,
		"alerts":    alerts,
	})
}

// MonitorTenant detalha métricas de um tenant específico.
func (h *Handler) MonitorTenant(w http.ResponseWriter, r *http.Request) {
	if h.monitor == nil || !h.monitorOn {
		WriteError(w, http.StatusServiceUnavailable, "INTERNAL", "monitoramento indisponível", nil)
		return
	}

	tenantID, err := uuid.Parse(strings.TrimSpace(chi.URLParam(r, "id")))
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "id inválido", nil)
		return
	}

	health, err := h.monitor.TenantHealth(r.Context(), tenantID)
	if err != nil {
		if errors.Is(err, monitor.ErrNoData) {
			WriteError(w, http.StatusNotFound, "NOT_FOUND", "sem leituras ainda", nil)
			return
		}
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível carregar métricas", nil)
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"health": health})
}

// MonitorRun força uma coleta imediata.
func (h *Handler) MonitorRun(w http.ResponseWriter, r *http.Request) {
	if h.monitor == nil || !h.monitorOn {
		WriteError(w, http.StatusServiceUnavailable, "INTERNAL", "monitoramento indisponível", nil)
		return
	}

	if err := h.monitor.RunOnce(r.Context()); err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", err.Error(), nil)
		return
	}

	WriteJSON(w, http.StatusAccepted, map[string]any{"status": "running"})
}

// GetCloudflareSettings devolve configuração sanitizada da Cloudflare.
func (h *Handler) GetCloudflareSettings(w http.ResponseWriter, r *http.Request) {
	if h.settings == nil {
		WriteError(w, http.StatusServiceUnavailable, "INTERNAL", "configuração indisponível", nil)
		return
	}

	cfg, err := h.settings.GetSanitizedCloudflareConfig(r.Context())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível carregar configuração", nil)
		return
	}

	response := map[string]any{
		"config":     cfg,
		"configured": h.provisioner != nil && h.provisioner.IsConfigured(),
	}

	WriteJSON(w, http.StatusOK, response)
}

// UpdateCloudflareSettings altera integração com Cloudflare.
func (h *Handler) UpdateCloudflareSettings(w http.ResponseWriter, r *http.Request) {
	if h.settings == nil {
		WriteError(w, http.StatusServiceUnavailable, "INTERNAL", "configuração indisponível", nil)
		return
	}

	var payload struct {
		APIToken       *string `json:"api_token"`
		ZoneID         *string `json:"zone_id"`
		BaseDomain     *string `json:"base_domain"`
		TargetHostname *string `json:"target_hostname"`
		AccountID      *string `json:"account_id"`
		ProxiedDefault *bool   `json:"proxied_default"`
	}

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "JSON inválido", nil)
		return
	}

	updatedBy, err := h.subjectUUID(r)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}

	merged, err := h.settings.MergeCloudflareConfig(r.Context(), settings.UpdateCloudflareConfigInput{
		APIToken:       payload.APIToken,
		ZoneID:         payload.ZoneID,
		BaseDomain:     payload.BaseDomain,
		TargetHostname: payload.TargetHostname,
		AccountID:      payload.AccountID,
		ProxiedDefault: payload.ProxiedDefault,
		UpdatedBy:      updatedBy,
	})
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", err.Error(), nil)
		return
	}

	var client *cloudflare.Client
	if merged.IsComplete() {
		client, err = cloudflare.New(cloudflare.Config{
			APIToken: merged.APIToken,
			ZoneID:   merged.ZoneID,
			APIBase:  "",
			DoHURL:   "",
		})
		if err != nil {
			WriteError(w, http.StatusBadRequest, "VALIDATION", err.Error(), nil)
			return
		}
	}

	saved, err := h.settings.SaveCloudflareConfig(r.Context(), *merged)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível salvar configuração", nil)
		return
	}

	if h.provisioner != nil {
		if client != nil {
			h.provisioner.Apply(provision.RuntimeConfig{
				Client: client,
				Config: provision.Config{
					BaseDomain:     saved.BaseDomain,
					TargetHost:     saved.TargetHostname,
					TTL:            3600,
					DefaultProxied: saved.ProxiedDefault,
				},
			})
		} else {
			h.provisioner.Apply(provision.RuntimeConfig{})
		}
	}

	sanitized, err := h.settings.GetSanitizedCloudflareConfig(r.Context())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível carregar configuração", nil)
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"config":     sanitized,
		"configured": h.provisioner != nil && h.provisioner.IsConfigured(),
	})
}
