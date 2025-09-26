package http

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/gestaozabele/municipio/internal/storage"
)

type appCustomizationPayload struct {
	PrimaryColor    *string `json:"primary_color"`
	SecondaryColor  *string `json:"secondary_color"`
	WeatherProvider *string `json:"weather_provider"`
	WeatherAPIKey   *string `json:"weather_api_key"`
	WelcomeMessage  *string `json:"welcome_message"`
	EnablePush      *bool   `json:"enable_push"`
	EnableWeather   *bool   `json:"enable_weather"`
}

type appCustomizationView struct {
	TenantID        uuid.UUID `json:"tenant_id"`
	LogoURL         *string   `json:"logo_url"`
	PrimaryColor    string    `json:"primary_color"`
	SecondaryColor  string    `json:"secondary_color"`
	WeatherProvider *string   `json:"weather_provider"`
	WeatherAPIKey   *string   `json:"weather_api_key"`
	WelcomeMessage  *string   `json:"welcome_message"`
	EnablePush      bool      `json:"enable_push"`
	EnableWeather   bool      `json:"enable_weather"`
}

// GetAppCustomization devolve as configurações do app do município.
func (h *Handler) GetAppCustomization(w http.ResponseWriter, r *http.Request) {
	tenantID, err := parseUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "id inválido", nil)
		return
	}

	customization, err := h.fetchAppCustomization(r.Context(), tenantID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível carregar personalização", nil)
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"app": customization})
}

// UpdateAppCustomization atualiza cores/mensagens do app.
func (h *Handler) UpdateAppCustomization(w http.ResponseWriter, r *http.Request) {
	tenantID, err := parseUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "id inválido", nil)
		return
	}

	var payload appCustomizationPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "JSON inválido", nil)
		return
	}

	setParts := make([]string, 0, 7)
	args := make([]any, 0, 7)
	idx := 1

	if payload.PrimaryColor != nil && strings.TrimSpace(*payload.PrimaryColor) != "" {
		setParts = append(setParts, fmt.Sprintf("primary_color = $%d", idx))
		args = append(args, strings.TrimSpace(*payload.PrimaryColor))
		idx++
	}
	if payload.SecondaryColor != nil && strings.TrimSpace(*payload.SecondaryColor) != "" {
		setParts = append(setParts, fmt.Sprintf("secondary_color = $%d", idx))
		args = append(args, strings.TrimSpace(*payload.SecondaryColor))
		idx++
	}
	if payload.WeatherProvider != nil {
		provider := strings.TrimSpace(*payload.WeatherProvider)
		setParts = append(setParts, fmt.Sprintf("weather_provider = NULLIF($%d,'')", idx))
		args = append(args, provider)
		idx++
	}
	if payload.WeatherAPIKey != nil {
		key := strings.TrimSpace(*payload.WeatherAPIKey)
		setParts = append(setParts, fmt.Sprintf("weather_api_key = NULLIF($%d,'')", idx))
		args = append(args, key)
		idx++
	}
	if payload.WelcomeMessage != nil {
		message := strings.TrimSpace(*payload.WelcomeMessage)
		setParts = append(setParts, fmt.Sprintf("welcome_message = $%d", idx))
		if message == "" {
			args = append(args, nil)
		} else {
			args = append(args, message)
		}
		idx++
	}
	if payload.EnablePush != nil {
		setParts = append(setParts, fmt.Sprintf("enable_push = $%d", idx))
		args = append(args, *payload.EnablePush)
		idx++
	}
	if payload.EnableWeather != nil {
		setParts = append(setParts, fmt.Sprintf("enable_weather = $%d", idx))
		args = append(args, *payload.EnableWeather)
		idx++
	}

	if len(setParts) == 0 {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "nenhum campo para atualizar", nil)
		return
	}

	args = append(args, tenantID)
	query := fmt.Sprintf("UPDATE saas_app_customizations SET %s, updated_at = now() WHERE tenant_id = $%d", strings.Join(setParts, ", "), idx)

	tag, err := h.pool.Exec(r.Context(), query, args...)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível atualizar personalização", nil)
		return
	}
	if tag.RowsAffected() == 0 {
		WriteError(w, http.StatusNotFound, "NOT_FOUND", "personalização não encontrada", nil)
		return
	}

	customization, err := h.fetchAppCustomization(r.Context(), tenantID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "falha ao carregar personalização", nil)
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"app": customization})
}

// UploadAppLogo envia a logo específica da cidade.
func (h *Handler) UploadAppLogo(w http.ResponseWriter, r *http.Request) {
	tenantID, err := parseUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "id inválido", nil)
		return
	}

	if err := r.ParseMultipartForm(5 << 20); err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "form inválido", nil)
		return
	}

	fileHeader, err := getFirstFile(r.MultipartForm, "logo")
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

	data, contentType, err := readMultipartFile(fileHeader, 5<<20)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", err.Error(), nil)
		return
	}

	ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
	if ext == "" {
		ext = ".png"
	}

	key := fmt.Sprintf("apps/%s/logo-%d%s", tenantID.String(), time.Now().UnixNano(), ext)
	result, err := h.storage.Upload(r.Context(), storage.UploadInput{
		Key:          key,
		Body:         data,
		ContentType:  contentType,
		CacheControl: "public,max-age=31536000,immutable",
	})
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível enviar logo", nil)
		return
	}

	update := `
        INSERT INTO saas_app_customizations (tenant_id, logo_url, logo_key)
        VALUES ($1, $2, $3)
        ON CONFLICT (tenant_id) DO UPDATE SET logo_url = EXCLUDED.logo_url, logo_key = EXCLUDED.logo_key, updated_at = now()
    `

	if _, err := h.pool.Exec(r.Context(), update, tenantID, result.URL, key); err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível registrar logo", nil)
		return
	}

	customization, err := h.fetchAppCustomization(r.Context(), tenantID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "falha ao carregar personalização", nil)
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"app": customization})
}

func (h *Handler) fetchAppCustomization(ctx context.Context, tenantID uuid.UUID) (appCustomizationView, error) {
	const query = `
        SELECT tenant_id, logo_url, primary_color, secondary_color, weather_provider, weather_api_key, welcome_message, enable_push, enable_weather
        FROM saas_app_customizations
        WHERE tenant_id = $1
    `

	var (
		view     appCustomizationView
		logo     sql.NullString
		provider sql.NullString
		apiKey   sql.NullString
		welcome  sql.NullString
	)

	if err := h.pool.QueryRow(ctx, query, tenantID).Scan(&view.TenantID, &logo, &view.PrimaryColor, &view.SecondaryColor, &provider, &apiKey, &welcome, &view.EnablePush, &view.EnableWeather); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// create default record and retry
			if _, insertErr := h.pool.Exec(ctx, "INSERT INTO saas_app_customizations (tenant_id) VALUES ($1) ON CONFLICT DO NOTHING", tenantID); insertErr != nil {
				return appCustomizationView{}, insertErr
			}
			return h.fetchAppCustomization(ctx, tenantID)
		}
		return appCustomizationView{}, err
	}

	if logo.Valid {
		str := strings.TrimSpace(logo.String)
		view.LogoURL = &str
	}
	if provider.Valid {
		str := strings.TrimSpace(provider.String)
		if str != "" {
			view.WeatherProvider = &str
		}
	}
	if apiKey.Valid {
		str := strings.TrimSpace(apiKey.String)
		if str != "" {
			view.WeatherAPIKey = &str
		}
	}
	if welcome.Valid {
		str := strings.TrimSpace(welcome.String)
		if str != "" {
			view.WelcomeMessage = &str
		}
	}

	return view, nil
}
