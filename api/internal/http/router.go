package http

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/gestaozabele/municipio/internal/config"
	httpmiddleware "github.com/gestaozabele/municipio/internal/http/middleware"
	"github.com/gestaozabele/municipio/internal/prof"
	"github.com/gestaozabele/municipio/internal/repo"
	"github.com/gestaozabele/municipio/internal/service"
	"github.com/gestaozabele/municipio/internal/tenant"
)

type Handler struct {
	cfg           *config.Config
	pool          *pgxpool.Pool
	redis         *redis.Client
	authService   *service.AuthService
	tenants       *tenant.Service
	webauthn      *webauthn.WebAuthn
	publicLimiter *httpmiddleware.RateLimiter
	authLimiter   *httpmiddleware.RateLimiter
	devCookies    bool
}

const (
	passkeyRegisterSessionPrefix = "webauthn:register:"
	passkeyLoginSessionPrefix    = "webauthn:login:"
	passkeySessionTTL            = 5 * time.Minute
)

// NewRouter devolve roteador configurado.
func NewRouter(cfg *config.Config, pool *pgxpool.Pool, redisClient *redis.Client, authService *service.AuthService) (http.Handler, error) {
	devCookies := false
	for _, origin := range cfg.AllowOrigins {
		if strings.Contains(origin, "localhost") {
			devCookies = true
			break
		}
	}

	wa, err := webauthn.New(&webauthn.Config{
		RPDisplayName: cfg.WebAuthnRPName,
		RPID:          cfg.WebAuthnRPID,
		RPOrigins:     []string{cfg.WebAuthnRPOrigin},
	})
	if err != nil {
		return nil, fmt.Errorf("webauthn: %w", err)
	}

	h := &Handler{
		cfg:           cfg,
		pool:          pool,
		redis:         redisClient,
		authService:   authService,
		tenants:       tenant.NewService(tenant.NewRepository(pool)),
		webauthn:      wa,
		publicLimiter: httpmiddleware.NewRateLimiter(cfg.RateLimitPublic.RequestsPerSecond, cfg.RateLimitPublic.Burst),
		authLimiter:   httpmiddleware.NewRateLimiter(cfg.RateLimitAuth.RequestsPerSecond, cfg.RateLimitAuth.Burst),
		devCookies:    devCookies,
	}

	profRepo := prof.NewRepository(pool)
	profService := prof.NewService(repo.New(pool), profRepo)
	profHandler := prof.NewHandler(profService)

	r := chi.NewRouter()

	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.RealIP)
	r.Use(httpmiddleware.Logging)
	r.Use(httpmiddleware.Recover)
	r.Use(httpmiddleware.CORS(cfg.AllowOrigins))

	r.Group(func(public chi.Router) {
		public.Use(httpmiddleware.IPRateLimit(h.publicLimiter))

		public.Get("/health", h.Health)
		public.Get("/ready", h.Ready)
		public.Get("/tenant", h.TenantConfig)

		public.Route("/auth", func(auth chi.Router) {
			auth.Post("/cidadao/login", h.LoginCidadao)
			auth.Post("/backoffice/login", h.LoginBackoffice)
			auth.Post("/saas/login", h.LoginSaaS)
			auth.Post("/passkey/login/start", h.PasskeyLoginStart)
			auth.Post("/passkey/login/finish", h.PasskeyLoginFinish)
			auth.Post("/refresh", h.Refresh)
			auth.Post("/logout", h.Logout)
		})
	})

	r.Group(func(private chi.Router) {
		private.Use(httpmiddleware.Auth(authService.JWT()))
		private.Use(httpmiddleware.UserRateLimit(h.authLimiter))

		private.Get("/me", h.Me)
		private.Route("/auth/passkey/register", func(r chi.Router) {
			r.Post("/start", h.PasskeyRegisterStart)
			r.Post("/finish", h.PasskeyRegisterFinish)
		})
		private.Group(func(protected chi.Router) {
			protected.Use(httpmiddleware.RequireProfessor)
			protected.Route("/prof", func(r chi.Router) {
				prof.Mount(r, profHandler)
			})
		})
	})

	saasRouter := chi.NewRouter()
	saasRouter.Use(httpmiddleware.Auth(h.authService.JWT()))
	saasRouter.Use(httpmiddleware.RequireSaaSAdmin)
	saasRouter.Get("/tenants", h.ListTenants)
	saasRouter.Post("/tenants", h.CreateTenant)

	r.Mount("/saas", saasRouter)

	return r, nil
}

// Health responde status simples.
func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// Ready valida conexões com Postgres e Redis.
func (h *Handler) Ready(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()

	dbErr := h.pool.Ping(ctx)
	redisErr := h.redis.Ping(ctx).Err()

	if dbErr != nil || redisErr != nil {
		WriteError(w, http.StatusServiceUnavailable, "INTERNAL", "dependências indisponíveis", map[string]any{
			"db":    errorString(dbErr),
			"redis": errorString(redisErr),
		})
		return
	}

	WriteJSON(w, http.StatusOK, map[string]bool{"ready": true})
}

func errorString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

// LoginBackoffice realiza autenticação de colaboradores.
func (h *Handler) LoginBackoffice(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Email string `json:"email"`
		Senha string `json:"senha"`
	}

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "JSON inválido", nil)
		return
	}

	if strings.TrimSpace(payload.Email) == "" || strings.TrimSpace(payload.Senha) == "" {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "email e senha são obrigatórios", nil)
		return
	}

	result, err := h.authService.LoginBackoffice(r.Context(), payload.Email, payload.Senha)
	if err != nil {
		h.handleAuthError(w, err)
		return
	}

	h.writeLoginSuccess(w, result)
}

func (h *Handler) PasskeyRegisterStart(w http.ResponseWriter, r *http.Request) {
	userID, err := h.subjectUUID(r)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}

	ctx := r.Context()
	user, err := h.authService.GetUsuarioByID(ctx, userID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível carregar usuário", nil)
		return
	}

	passkeys, err := h.authService.ListPasskeys(ctx, userID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível carregar biometria", nil)
		return
	}

	waUser, err := newWebAuthnUser(user, passkeys)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", err.Error(), nil)
		return
	}

	exclusions := make([]protocol.CredentialDescriptor, 0, len(waUser.WebAuthnCredentials()))
	for _, cred := range waUser.WebAuthnCredentials() {
		exclusions = append(exclusions, cred.Descriptor())
	}

	selection := protocol.AuthenticatorSelection{UserVerification: protocol.VerificationRequired}

	opts, sessionData, err := h.webauthn.BeginRegistration(
		waUser,
		webauthn.WithExclusions(exclusions),
		webauthn.WithAuthenticatorSelection(selection),
	)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", err.Error(), nil)
		return
	}

	sessionID := uuid.NewString()
	if err := h.storeWebauthnSession(ctx, passkeyRegisterSessionPrefix, sessionID, sessionData, userID); err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível preparar registro", nil)
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"session": sessionID,
		"options": map[string]any{"publicKey": opts.Response},
	})
}

func (h *Handler) PasskeyRegisterFinish(w http.ResponseWriter, r *http.Request) {
	sessionID := r.URL.Query().Get("session")
	if sessionID == "" {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "session ausente", nil)
		return
	}

	ctx := r.Context()
	sessionData, userID, err := h.consumeWebauthnSession(ctx, passkeyRegisterSessionPrefix, sessionID)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "sessão inválida ou expirada", nil)
		return
	}

	user, err := h.authService.GetUsuarioByID(ctx, userID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "usuário não encontrado", nil)
		return
	}

	passkeys, err := h.authService.ListPasskeys(ctx, userID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível carregar biometria", nil)
		return
	}

	waUser, err := newWebAuthnUser(user, passkeys)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", err.Error(), nil)
		return
	}

	creationResponse, err := protocol.ParseCredentialCreationResponseBody(r.Body)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "resposta inválida", nil)
		return
	}

	credential, err := h.webauthn.CreateCredential(waUser, *sessionData, creationResponse)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", err.Error(), nil)
		return
	}

	transports := make([]string, 0, len(credential.Transport))
	for _, transport := range credential.Transport {
		transports = append(transports, string(transport))
	}

	if _, err := h.authService.CreatePasskey(
		ctx,
		userID,
		credential.ID,
		credential.PublicKey,
		credential.Authenticator.SignCount,
		transports,
		credential.Authenticator.AAGUID,
		nil,
		credential.Authenticator.CloneWarning,
	); err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível salvar a biometria", nil)
		return
	}

	WriteJSON(w, http.StatusCreated, map[string]string{"status": "ok"})
}

func (h *Handler) PasskeyLoginStart(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "JSON inválido", nil)
		return
	}
	if strings.TrimSpace(payload.Email) == "" {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "email é obrigatório", nil)
		return
	}

	ctx := r.Context()
	user, err := h.authService.GetUsuarioByEmail(ctx, payload.Email)
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			WriteError(w, http.StatusUnauthorized, "AUTH", "biometria não configurada", nil)
			return
		}
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível preparar biometria", nil)
		return
	}

	passkeys, err := h.authService.ListPasskeys(ctx, user.ID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível preparar biometria", nil)
		return
	}
	if len(passkeys) == 0 {
		WriteError(w, http.StatusUnauthorized, "AUTH", "biometria não configurada", nil)
		return
	}

	waUser, err := newWebAuthnUser(user, passkeys)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", err.Error(), nil)
		return
	}

	opts, sessionData, err := h.webauthn.BeginLogin(waUser)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", err.Error(), nil)
		return
	}

	sessionID := uuid.NewString()
	if err := h.storeWebauthnSession(ctx, passkeyLoginSessionPrefix, sessionID, sessionData, user.ID); err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível preparar biometria", nil)
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"session": sessionID,
		"options": map[string]any{"publicKey": opts.Response},
	})
}

func (h *Handler) PasskeyLoginFinish(w http.ResponseWriter, r *http.Request) {
	sessionID := r.URL.Query().Get("session")
	if sessionID == "" {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "session ausente", nil)
		return
	}

	ctx := r.Context()
	sessionData, userID, err := h.consumeWebauthnSession(ctx, passkeyLoginSessionPrefix, sessionID)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "sessão inválida ou expirada", nil)
		return
	}

	user, err := h.authService.GetUsuarioByID(ctx, userID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "usuário não encontrado", nil)
		return
	}

	passkeys, err := h.authService.ListPasskeys(ctx, user.ID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível validar biometria", nil)
		return
	}

	waUser, err := newWebAuthnUser(user, passkeys)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", err.Error(), nil)
		return
	}

	assertionResponse, err := protocol.ParseCredentialRequestResponseBody(r.Body)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "resposta inválida", nil)
		return
	}

	credential, err := h.webauthn.ValidateLogin(waUser, *sessionData, assertionResponse)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "AUTH", err.Error(), nil)
		return
	}

	stored, err := h.authService.GetPasskeyByCredentialID(ctx, credential.ID)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "AUTH", "credencial desconhecida", nil)
		return
	}
	if stored.UsuarioID != user.ID {
		WriteError(w, http.StatusUnauthorized, "AUTH", "credencial inválida", nil)
		return
	}

	if err := h.authService.UpdatePasskeyCounter(ctx, stored.ID, credential.Authenticator.SignCount, credential.Authenticator.CloneWarning); err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível atualizar biometria", nil)
		return
	}

	result, err := h.authService.LoginBackofficeWithUser(ctx, user)
	if err != nil {
		h.handleAuthError(w, err)
		return
	}

	h.writeLoginSuccess(w, result)
}

// LoginCidadao autentica cidadãos.
func (h *Handler) LoginCidadao(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Email string `json:"email"`
		Senha string `json:"senha"`
	}

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "JSON inválido", nil)
		return
	}

	if strings.TrimSpace(payload.Email) == "" || strings.TrimSpace(payload.Senha) == "" {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "email e senha são obrigatórios", nil)
		return
	}

	result, err := h.authService.LoginCidadao(r.Context(), payload.Email, payload.Senha)
	if err != nil {
		h.handleAuthError(w, err)
		return
	}

	h.writeLoginSuccess(w, result)
}

// LoginSaaS autentica administradores da plataforma.
func (h *Handler) LoginSaaS(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Email string `json:"email"`
		Senha string `json:"senha"`
	}

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "JSON inválido", nil)
		return
	}

	if strings.TrimSpace(payload.Email) == "" || strings.TrimSpace(payload.Senha) == "" {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "email e senha são obrigatórios", nil)
		return
	}

	result, err := h.authService.LoginSaaS(r.Context(), payload.Email, payload.Senha)
	if err != nil {
		h.handleAuthError(w, err)
		return
	}

	h.writeLoginSuccess(w, result)
}

// Refresh rotaciona token de acesso.

func (h *Handler) Refresh(w http.ResponseWriter, r *http.Request) {
	audience, token, err := getRefreshFromRequest(r)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "AUTH", "refresh ausente", nil)
		return
	}

	result, err := h.authService.Refresh(r.Context(), audience, token)
	if err != nil {
		if errors.Is(err, service.ErrRefreshInvalid) {
			WriteError(w, http.StatusUnauthorized, "AUTH", "refresh inválido", nil)
			return
		}
		if errors.Is(err, service.ErrNoEligibleRoles) {
			WriteError(w, http.StatusUnauthorized, "AUTH", err.Error(), nil)
			return
		}
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "erro ao renovar sessão", nil)
		return
	}

	h.writeLoginSuccess(w, result)
}

// Logout revoga refresh token atual.
func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	if audience, token, err := getRefreshFromRequest(r); err == nil {
		_ = h.authService.Logout(r.Context(), audience, token)
	}

	h.clearRefreshCookie(w, "cidadao")
	h.clearRefreshCookie(w, "backoffice")
	h.clearRefreshCookie(w, "saas")
	WriteJSON(w, http.StatusOK, map[string]string{"status": "logged_out"})
}

// Me retorna informações do usuário autenticado.
func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	subjectStr := httpmiddleware.GetSubject(r.Context())
	audience := httpmiddleware.GetAudience(r.Context())

	subject, err := uuid.Parse(subjectStr)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "AUTH", "subject inválido", nil)
		return
	}

	profile, roles, err := h.authService.GetMe(r.Context(), audience, subject)
	if err != nil {
		if errors.Is(err, service.ErrNoEligibleRoles) {
			WriteError(w, http.StatusUnauthorized, "AUTH", err.Error(), nil)
			return
		}
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível carregar perfil", nil)
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"user":  profile,
		"roles": roles,
	})
}

func (h *Handler) handleAuthError(w http.ResponseWriter, err error) {
	switch err {
	case service.ErrInvalidCredentials:
		WriteError(w, http.StatusUnauthorized, "AUTH", err.Error(), nil)
	case service.ErrAccountDisabled:
		WriteError(w, http.StatusForbidden, "FORBIDDEN", err.Error(), nil)
	case service.ErrNoEligibleRoles:
		WriteError(w, http.StatusUnauthorized, "AUTH", err.Error(), nil)
	default:
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "erro ao autenticar", nil)
	}
}

func (h *Handler) writeLoginSuccess(w http.ResponseWriter, result *service.LoginResult) {
	h.setRefreshCookie(w, result.Audience, result.RefreshToken, result.RefreshExpiry)

	WriteJSON(w, http.StatusOK, map[string]any{
		"access_token": result.AccessToken,
		"user":         result.Profile,
	})
}

type webauthnSessionEnvelope struct {
	Session *webauthn.SessionData `json:"session"`
	UserID  string                `json:"user_id"`
}

func (h *Handler) storeWebauthnSession(ctx context.Context, prefix, sessionID string, data *webauthn.SessionData, userID uuid.UUID) error {
	envelope := webauthnSessionEnvelope{Session: data, UserID: userID.String()}
	payload, err := json.Marshal(envelope)
	if err != nil {
		return err
	}
	return h.redis.Set(ctx, prefix+sessionID, payload, passkeySessionTTL).Err()
}

func (h *Handler) consumeWebauthnSession(ctx context.Context, prefix, sessionID string) (*webauthn.SessionData, uuid.UUID, error) {
	key := prefix + sessionID
	raw, err := h.redis.Get(ctx, key).Bytes()
	if err != nil {
		if errors.Is(err, redis.Nil) {
			return nil, uuid.Nil, errors.New("sessão não encontrada")
		}
		return nil, uuid.Nil, err
	}
	_ = h.redis.Del(ctx, key)

	var envelope webauthnSessionEnvelope
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return nil, uuid.Nil, err
	}
	userID, err := uuid.Parse(envelope.UserID)
	if err != nil {
		return nil, uuid.Nil, err
	}
	return envelope.Session, userID, nil
}

func (h *Handler) subjectUUID(r *http.Request) (uuid.UUID, error) {
	subjectStr := httpmiddleware.GetSubject(r.Context())
	if strings.TrimSpace(subjectStr) == "" {
		return uuid.Nil, errors.New("subject ausente")
	}
	subject, err := uuid.Parse(subjectStr)
	if err != nil {
		return uuid.Nil, err
	}
	return subject, nil
}

type webAuthnUser struct {
	id          uuid.UUID
	name        string
	displayName string
	credentials []webauthn.Credential
}

func newWebAuthnUser(user repo.Usuario, passkeys []service.PasskeyCredential) (*webAuthnUser, error) {
	credentials, err := toWebauthnCredentials(passkeys)
	if err != nil {
		return nil, err
	}
	return &webAuthnUser{
		id:          user.ID,
		name:        user.Email,
		displayName: user.Nome,
		credentials: credentials,
	}, nil
}

func (u *webAuthnUser) WebAuthnID() []byte {
	id := make([]byte, 16)
	copy(id, u.id[:])
	return id
}

func (u *webAuthnUser) WebAuthnName() string {
	return u.name
}

func (u *webAuthnUser) WebAuthnDisplayName() string {
	return u.displayName
}

func (u *webAuthnUser) WebAuthnIcon() string {
	return ""
}

func (u *webAuthnUser) WebAuthnCredentials() []webauthn.Credential {
	return u.credentials
}

func toWebauthnCredentials(passkeys []service.PasskeyCredential) ([]webauthn.Credential, error) {
	creds := make([]webauthn.Credential, 0, len(passkeys))
	for _, pk := range passkeys {
		cred := webauthn.Credential{
			ID:        append([]byte(nil), pk.CredentialID...),
			PublicKey: append([]byte(nil), pk.PublicKey...),
			Transport: toAuthenticatorTransports(pk.Transports),
		}
		cred.Authenticator.SignCount = pk.SignCount
		cred.Authenticator.CloneWarning = pk.Cloned
		if len(pk.AAGUID) > 0 {
			cred.Authenticator.AAGUID = append([]byte(nil), pk.AAGUID...)
		}
		creds = append(creds, cred)
	}
	return creds, nil
}

func toAuthenticatorTransports(values []string) []protocol.AuthenticatorTransport {
	if len(values) == 0 {
		return nil
	}
	transports := make([]protocol.AuthenticatorTransport, 0, len(values))
	for _, value := range values {
		switch strings.ToLower(strings.TrimSpace(value)) {
		case "usb":
			transports = append(transports, protocol.USB)
		case "nfc":
			transports = append(transports, protocol.NFC)
		case "ble":
			transports = append(transports, protocol.BLE)
		case "internal":
			transports = append(transports, protocol.Internal)
		case "smart-card":
			transports = append(transports, protocol.SmartCard)
		case "hybrid", "cable":
			transports = append(transports, protocol.Hybrid)
		default:
			transports = append(transports, protocol.AuthenticatorTransport(value))
		}
	}
	return transports
}

const (
	refreshCookieCidadao    = "cidadao"
	refreshCookieBackoffice = "backoffice"
	refreshCookieSaaS       = "saas"
)

func getRefreshFromRequest(r *http.Request) (string, string, error) {
	if c, err := r.Cookie(refreshCookieSaaS); err == nil && c.Value != "" {
		return "saas", c.Value, nil
	}
	if c, err := r.Cookie(refreshCookieBackoffice); err == nil && c.Value != "" {
		return "backoffice", c.Value, nil
	}
	if c, err := r.Cookie(refreshCookieCidadao); err == nil && c.Value != "" {
		return "cidadao", c.Value, nil
	}
	return "", "", errors.New("refresh ausente")
}

func (h *Handler) setRefreshCookie(w http.ResponseWriter, audience, token string, expires time.Time) {
    name := refreshCookieCidadao
    switch audience {
    case "backoffice":
        name = refreshCookieBackoffice
    case "saas":
        name = refreshCookieSaaS
    }
    secure := !h.devCookies
    sameSite := http.SameSiteNoneMode
    if h.devCookies {
        sameSite = http.SameSiteLaxMode
    }
    http.SetCookie(w, &http.Cookie{
        Name:     name,
        Value:    token,
        Path:     "/",
        Expires:  expires,
		HttpOnly: true,
		Secure:   secure,
		SameSite: sameSite,
	})
}

func (h *Handler) clearRefreshCookie(w http.ResponseWriter, audience string) {
    name := refreshCookieCidadao
    switch audience {
    case "backoffice":
        name = refreshCookieBackoffice
    case "saas":
        name = refreshCookieSaaS
    }
    secure := !h.devCookies
    sameSite := http.SameSiteNoneMode
    if h.devCookies {
        sameSite = http.SameSiteLaxMode
    }
    http.SetCookie(w, &http.Cookie{
        Name:     name,
        Value:    "",
        Path:     "/",
        MaxAge:   -1,
		HttpOnly: true,
		Secure:   secure,
		SameSite: sameSite,
	})
}
