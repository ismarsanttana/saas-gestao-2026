package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"

	"github.com/gestaozabele/municipio/internal/auth"
	"github.com/gestaozabele/municipio/internal/repo"
	"github.com/gestaozabele/municipio/internal/util"
)

var (
	// ErrInvalidCredentials indica falha na autenticação.
	ErrInvalidCredentials = errors.New("credenciais inválidas")
	// ErrAccountDisabled indica conta desativada.
	ErrAccountDisabled = errors.New("conta desativada")
	// ErrRefreshInvalid indica refresh token inválido ou expirado.
	ErrRefreshInvalid = errors.New("refresh token inválido")
	// ErrNoEligibleRoles indica ausência de papéis autorizados.
	ErrNoEligibleRoles = errors.New("usuário sem papel elegível")
)

type authRepository interface {
	GetUsuarioByEmail(ctx context.Context, email string) (repo.Usuario, error)
	ListSecretariasByUsuario(ctx context.Context, usuarioID uuid.UUID) ([]repo.SecretariaWithRole, error)
	QueryRowContext(ctx context.Context, sql string, args ...any) pgx.Row
	HasProfessorTurma(ctx context.Context, professorID uuid.UUID) (bool, error)
	GetCidadaoByEmail(ctx context.Context, email string) (repo.Cidadao, error)
	GetRefreshTokenByHash(ctx context.Context, tokenHash string) (repo.TokenRefresh, error)
	GetUsuarioByID(ctx context.Context, id uuid.UUID) (repo.Usuario, error)
	GetCidadaoByID(ctx context.Context, id uuid.UUID) (repo.Cidadao, error)
	InsertRefreshToken(ctx context.Context, arg repo.InsertRefreshTokenParams) (repo.TokenRefresh, error)
	InvalidateOtherRefreshTokens(ctx context.Context, subject uuid.UUID, audience, keepHash string) error
	RevokeRefreshToken(ctx context.Context, tokenHash string) error
	UpdateUsuario(ctx context.Context, id uuid.UUID, nome, email string) error
}

type redisCommander interface {
	Set(ctx context.Context, key string, value any, expiration time.Duration) *redis.StatusCmd
	Get(ctx context.Context, key string) *redis.StringCmd
	Del(ctx context.Context, keys ...string) *redis.IntCmd
}

// AuthService concentra regras de autenticação e sessões.
type AuthService struct {
	repo       authRepository
	redis      redisCommander
	jwt        *auth.JWTManager
	refreshTTL time.Duration
	pool       *pgxpool.Pool
}

// NewAuthService cria novo serviço.
func NewAuthService(r *repo.Queries, pool *pgxpool.Pool, redisClient *redis.Client, jwtMgr *auth.JWTManager, refreshTTL time.Duration) *AuthService {
	return &AuthService{repo: r, pool: pool, redis: redisClient, jwt: jwtMgr, refreshTTL: refreshTTL}
}

// JWT expõe gerenciador de JWT (útil em middlewares).
func (s *AuthService) JWT() *auth.JWTManager {
	return s.jwt
}

// LoginResult representa retorno padrão de autenticações.
type LoginResult struct {
	Audience      string
	AccessToken   string
	RefreshToken  string
	Subject       uuid.UUID
	Roles         []string
	Profile       any
	RefreshHash   string
	RefreshExpiry time.Time
}

type PasskeyCredential struct {
	ID           uuid.UUID
	UsuarioID    uuid.UUID
	CredentialID []byte
	PublicKey    []byte
	SignCount    uint32
	Transports   []string
	AAGUID       []byte
	Nickname     *string
	Cloned       bool
	CreatedAt    time.Time
	UpdatedAt    *time.Time
}

// BackofficeProfile descreve usuária(o) do backoffice.
type BackofficeProfile struct {
	ID          string                 `json:"id"`
	Nome        string                 `json:"nome"`
	Email       string                 `json:"email"`
	Secretarias []BackofficeSecretaria `json:"secretarias"`
}

// BackofficeSecretaria apresenta vínculo e papel.
type BackofficeSecretaria struct {
	ID    string `json:"id"`
	Nome  string `json:"nome"`
	Slug  string `json:"slug"`
	Papel string `json:"papel"`
}

// CidadaoProfile descreve usuário do app cidadão.
type CidadaoProfile struct {
	ID    string  `json:"id"`
	Nome  string  `json:"nome"`
	Email *string `json:"email"`
}

// LoginBackoffice autentica usuários internos.
func (s *AuthService) LoginBackoffice(ctx context.Context, email, password string) (*LoginResult, error) {
	user, err := s.repo.GetUsuarioByEmail(ctx, strings.ToLower(email))
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			log.Warn().Msg("login backoffice: usuário não encontrado")
			return nil, ErrInvalidCredentials
		}
		return nil, err
	}

	ok, err := auth.Verify(password, user.SenhaHash)
	if err != nil {
		log.Warn().Err(err).Msg("login backoffice: verify password failed")
		return nil, ErrInvalidCredentials
	}
	if !ok {
		log.Warn().Msg("login backoffice: senha inválida")
		return nil, ErrInvalidCredentials
	}

	return s.loginBackofficeFromUser(ctx, user)
}

func (s *AuthService) LoginBackofficeWithUser(ctx context.Context, user repo.Usuario) (*LoginResult, error) {
	return s.loginBackofficeFromUser(ctx, user)
}

func (s *AuthService) loginBackofficeFromUser(ctx context.Context, user repo.Usuario) (*LoginResult, error) {
	if !user.Ativo {
		return nil, ErrAccountDisabled
	}

	secretarias, err := s.repo.ListSecretariasByUsuario(ctx, user.ID)
	if err != nil {
		return nil, err
	}

	roles := buildRolesFromSecretarias(secretarias)

	var isProf bool
	if err := s.repo.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM professores_turmas WHERE professor_id=$1)`, user.ID).Scan(&isProf); err != nil {
		return nil, err
	}
	if isProf {
		roles = appendIfMissing(roles, "PROFESSOR")
	}
	roles = normalizeRoles(roles)
	if hasRole(roles, "PROFESSOR") {
		roles = removeRole(roles, "ATENDENTE")
	}
	if len(roles) == 0 {
		return nil, ErrNoEligibleRoles
	}

	token, _, err := s.jwt.GenerateAccessToken(user.ID.String(), "backoffice", roles)
	if err != nil {
		return nil, err
	}

	rawRefresh, refreshHash, err := auth.GenerateRefreshToken()
	if err != nil {
		return nil, err
	}

	expires := util.Now().Add(s.refreshTTL)
	if err := s.persistRefresh(ctx, user.ID, "backoffice", refreshHash, expires); err != nil {
		return nil, err
	}

	profile := &BackofficeProfile{
		ID:    user.ID.String(),
		Nome:  user.Nome,
		Email: user.Email,
	}
	for _, sec := range secretarias {
		profile.Secretarias = append(profile.Secretarias, BackofficeSecretaria{
			ID:    sec.SecretariaID.String(),
			Nome:  sec.Secretaria,
			Slug:  sec.Slug,
			Papel: sec.Papel,
		})
	}

	return &LoginResult{
		Audience:      "backoffice",
		AccessToken:   token,
		RefreshToken:  rawRefresh,
		Subject:       user.ID,
		Roles:         roles,
		Profile:       profile,
		RefreshHash:   refreshHash,
		RefreshExpiry: expires,
	}, nil
}

func (s *AuthService) GetUsuarioByID(ctx context.Context, id uuid.UUID) (repo.Usuario, error) {
	return s.repo.GetUsuarioByID(ctx, id)
}

func (s *AuthService) GetUsuarioByEmail(ctx context.Context, email string) (repo.Usuario, error) {
	return s.repo.GetUsuarioByEmail(ctx, strings.ToLower(email))
}

func (s *AuthService) ListPasskeys(ctx context.Context, usuarioID uuid.UUID) ([]PasskeyCredential, error) {
	rows, err := s.pool.Query(ctx, `
        SELECT id, usuario_id, credential_id, public_key, sign_count, transports, aaguid, nickname, cloned, created_at, updated_at
        FROM webauthn_credentials
        WHERE usuario_id = $1
        ORDER BY created_at DESC
    `, usuarioID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var creds []PasskeyCredential
	for rows.Next() {
		var (
			cred PasskeyCredential
			sign int64
		)
		if err := rows.Scan(&cred.ID, &cred.UsuarioID, &cred.CredentialID, &cred.PublicKey, &sign, &cred.Transports, &cred.AAGUID, &cred.Nickname, &cred.Cloned, &cred.CreatedAt, &cred.UpdatedAt); err != nil {
			return nil, err
		}
		if sign < 0 {
			sign = 0
		}
		cred.SignCount = uint32(sign)
		creds = append(creds, cred)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return creds, nil
}

func (s *AuthService) GetPasskeyByCredentialID(ctx context.Context, credentialID []byte) (*PasskeyCredential, error) {
	var (
		cred PasskeyCredential
		sign int64
	)
	err := s.pool.QueryRow(ctx, `
        SELECT id, usuario_id, credential_id, public_key, sign_count, transports, aaguid, nickname, cloned, created_at, updated_at
        FROM webauthn_credentials
        WHERE credential_id = $1
    `, credentialID).Scan(&cred.ID, &cred.UsuarioID, &cred.CredentialID, &cred.PublicKey, &sign, &cred.Transports, &cred.AAGUID, &cred.Nickname, &cred.Cloned, &cred.CreatedAt, &cred.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, repo.ErrNotFound
		}
		return nil, err
	}
	if sign < 0 {
		sign = 0
	}
	cred.SignCount = uint32(sign)
	return &cred, nil
}

func (s *AuthService) CreatePasskey(ctx context.Context, usuarioID uuid.UUID, credentialID, publicKey []byte, signCount uint32, transports []string, aaguid []byte, nickname *string, cloned bool) (*PasskeyCredential, error) {
	var (
		cred      PasskeyCredential
		updatedAt *time.Time
		signVal   int64
	)
	err := s.pool.QueryRow(ctx, `
        INSERT INTO webauthn_credentials (usuario_id, credential_id, public_key, sign_count, transports, aaguid, nickname, cloned)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, usuario_id, credential_id, public_key, sign_count, transports, aaguid, nickname, cloned, created_at, updated_at
    `, usuarioID, credentialID, publicKey, int64(signCount), transports, aaguid, nickname, cloned).Scan(
		&cred.ID,
		&cred.UsuarioID,
		&cred.CredentialID,
		&cred.PublicKey,
		&signVal,
		&cred.Transports,
		&cred.AAGUID,
		&cred.Nickname,
		&cred.Cloned,
		&cred.CreatedAt,
		&updatedAt,
	)
	if err != nil {
		return nil, err
	}
	if signVal < 0 {
		signVal = 0
	}
	cred.SignCount = uint32(signVal)
	cred.UpdatedAt = updatedAt
	return &cred, nil
}

func (s *AuthService) UpdatePasskeyCounter(ctx context.Context, credentialID uuid.UUID, signCount uint32, cloned bool) error {
	cmd, err := s.pool.Exec(ctx, `
        UPDATE webauthn_credentials
        SET sign_count = $2, cloned = $3, updated_at = now()
        WHERE id = $1
    `, credentialID, int64(signCount), cloned)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return repo.ErrNotFound
	}
	return nil
}

// LoginCidadao autentica o app do cidadão.
func (s *AuthService) LoginCidadao(ctx context.Context, email, password string) (*LoginResult, error) {
	cidadao, err := s.repo.GetCidadaoByEmail(ctx, strings.ToLower(email))
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			log.Warn().Msg("login cidadão: usuário não encontrado")
			return nil, ErrInvalidCredentials
		}
		return nil, err
	}
	if !cidadao.Ativo {
		return nil, ErrAccountDisabled
	}

	if cidadao.SenhaHash == nil {
		return nil, ErrInvalidCredentials
	}

	ok, err := auth.Verify(password, *cidadao.SenhaHash)
	if err != nil {
		log.Warn().Err(err).Msg("login cidadão: verify password failed")
		return nil, ErrInvalidCredentials
	}
	if !ok {
		log.Warn().Msg("login cidadão: senha inválida")
		return nil, ErrInvalidCredentials
	}

	roles := []string{"CIDADAO"}
	token, _, err := s.jwt.GenerateAccessToken(cidadao.ID.String(), "cidadao", roles)
	if err != nil {
		return nil, err
	}

	rawRefresh, refreshHash, err := auth.GenerateRefreshToken()
	if err != nil {
		return nil, err
	}

	expires := util.Now().Add(s.refreshTTL)
	if err := s.persistRefresh(ctx, cidadao.ID, "cidadao", refreshHash, expires); err != nil {
		return nil, err
	}

	profile := &CidadaoProfile{
		ID:    cidadao.ID.String(),
		Nome:  cidadao.Nome,
		Email: cidadao.Email,
	}

	return &LoginResult{
		Audience:      "cidadao",
		AccessToken:   token,
		RefreshToken:  rawRefresh,
		Subject:       cidadao.ID,
		Roles:         roles,
		Profile:       profile,
		RefreshHash:   refreshHash,
		RefreshExpiry: expires,
	}, nil
}

// Refresh troca refresh token por novos tokens.
func (s *AuthService) Refresh(ctx context.Context, audience, rawToken string) (*LoginResult, error) {
	if rawToken == "" {
		return nil, ErrRefreshInvalid
	}

	hash := auth.HashRefreshToken(rawToken)
	record, err := s.repo.GetRefreshTokenByHash(ctx, hash)
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			return nil, ErrRefreshInvalid
		}
		return nil, err
	}

	if record.Revogado || time.Now().UTC().After(record.Expiracao) || record.Audience != audience {
		return nil, ErrRefreshInvalid
	}

	redisKey := auth.RefreshRedisKey(audience, hash)
	status, err := s.redis.Get(ctx, redisKey).Result()
	if err == redis.Nil {
		return nil, ErrRefreshInvalid
	}
	if err != nil {
		return nil, err
	}
	if status != "active" {
		return nil, ErrRefreshInvalid
	}

	var result *LoginResult
	switch audience {
	case "backoffice":
		user, err := s.repo.GetUsuarioByID(ctx, record.Subject)
		if err != nil {
			return nil, err
		}

		secretarias, err := s.repo.ListSecretariasByUsuario(ctx, user.ID)
		if err != nil {
			return nil, err
		}
		roles := buildRolesFromSecretarias(secretarias)
		if prof, err := s.repo.HasProfessorTurma(ctx, user.ID); err == nil && prof {
			roles = appendIfMissing(roles, "PROFESSOR")
		}
		roles = normalizeRoles(roles)
		if hasRole(roles, "PROFESSOR") {
			roles = removeRole(roles, "ATENDENTE")
		}
		if len(roles) == 0 {
			return nil, ErrNoEligibleRoles
		}

		profile := &BackofficeProfile{
			ID:    user.ID.String(),
			Nome:  user.Nome,
			Email: user.Email,
		}
		for _, sec := range secretarias {
			profile.Secretarias = append(profile.Secretarias, BackofficeSecretaria{
				ID:    sec.SecretariaID.String(),
				Nome:  sec.Secretaria,
				Slug:  sec.Slug,
				Papel: sec.Papel,
			})
		}

		token, _, err := s.jwt.GenerateAccessToken(user.ID.String(), audience, roles)
		if err != nil {
			return nil, err
		}

		rawRefresh, refreshHash, err := auth.GenerateRefreshToken()
		if err != nil {
			return nil, err
		}

		expires := util.Now().Add(s.refreshTTL)
		if err := s.persistRefresh(ctx, user.ID, audience, refreshHash, expires); err != nil {
			return nil, err
		}

		result = &LoginResult{
			Audience:      audience,
			AccessToken:   token,
			RefreshToken:  rawRefresh,
			Subject:       user.ID,
			Roles:         roles,
			Profile:       profile,
			RefreshHash:   refreshHash,
			RefreshExpiry: expires,
		}
	case "cidadao":
		cidadao, err := s.repo.GetCidadaoByID(ctx, record.Subject)
		if err != nil {
			return nil, err
		}

		roles := []string{"CIDADAO"}
		token, _, err := s.jwt.GenerateAccessToken(cidadao.ID.String(), audience, roles)
		if err != nil {
			return nil, err
		}

		rawRefresh, refreshHash, err := auth.GenerateRefreshToken()
		if err != nil {
			return nil, err
		}

		expires := util.Now().Add(s.refreshTTL)
		if err := s.persistRefresh(ctx, cidadao.ID, audience, refreshHash, expires); err != nil {
			return nil, err
		}

		profile := &CidadaoProfile{
			ID:    cidadao.ID.String(),
			Nome:  cidadao.Nome,
			Email: cidadao.Email,
		}

		result = &LoginResult{
			Audience:      audience,
			AccessToken:   token,
			RefreshToken:  rawRefresh,
			Subject:       cidadao.ID,
			Roles:         roles,
			Profile:       profile,
			RefreshHash:   refreshHash,
			RefreshExpiry: expires,
		}
	default:
		return nil, ErrRefreshInvalid
	}

	// Revoga token anterior (DB + Redis)
	if err := s.repo.RevokeRefreshToken(ctx, hash); err != nil && !errors.Is(err, repo.ErrNotFound) {
		return nil, err
	}
	if err := s.redis.Del(ctx, redisKey).Err(); err != nil && err != redis.Nil {
		return nil, err
	}

	return result, nil
}

// Logout revoga refresh token atual.
func (s *AuthService) Logout(ctx context.Context, audience, rawToken string) error {
	if rawToken == "" {
		return nil
	}
	hash := auth.HashRefreshToken(rawToken)
	if err := s.repo.RevokeRefreshToken(ctx, hash); err != nil && !errors.Is(err, repo.ErrNotFound) {
		return err
	}
	redisKey := auth.RefreshRedisKey(audience, hash)
	if err := s.redis.Del(ctx, redisKey).Err(); err != nil && err != redis.Nil {
		return err
	}
	return nil
}

// GetMe retorna perfil completo para subject/audience.
func (s *AuthService) GetMe(ctx context.Context, audience string, subject uuid.UUID) (any, []string, error) {
	switch audience {
	case "backoffice":
		user, err := s.repo.GetUsuarioByID(ctx, subject)
		if err != nil {
			return nil, nil, err
		}

		secretarias, err := s.repo.ListSecretariasByUsuario(ctx, subject)
		if err != nil {
			return nil, nil, err
		}

		profile := &BackofficeProfile{
			ID:    user.ID.String(),
			Nome:  user.Nome,
			Email: user.Email,
		}
		for _, sec := range secretarias {
			profile.Secretarias = append(profile.Secretarias, BackofficeSecretaria{
				ID:    sec.SecretariaID.String(),
				Nome:  sec.Secretaria,
				Slug:  sec.Slug,
				Papel: sec.Papel,
			})
		}

		roles := buildRolesFromSecretarias(secretarias)
		if prof, err := s.repo.HasProfessorTurma(ctx, subject); err == nil && prof {
			roles = appendIfMissing(roles, "PROFESSOR")
		}
		roles = normalizeRoles(roles)
		if hasRole(roles, "PROFESSOR") {
			roles = removeRole(roles, "ATENDENTE")
		}
		if len(roles) == 0 {
			return nil, nil, ErrNoEligibleRoles
		}

		return profile, roles, nil
	case "cidadao":
		cidadao, err := s.repo.GetCidadaoByID(ctx, subject)
		if err != nil {
			return nil, nil, err
		}
		profile := &CidadaoProfile{
			ID:    cidadao.ID.String(),
			Nome:  cidadao.Nome,
			Email: cidadao.Email,
		}
		return profile, []string{"CIDADAO"}, nil
	default:
		return nil, nil, errors.New("audience desconhecida")
	}
}

func (s *AuthService) persistRefresh(ctx context.Context, subject uuid.UUID, audience, hash string, expires time.Time) error {
	_, err := s.repo.InsertRefreshToken(ctx, repo.InsertRefreshTokenParams{
		ID:        uuid.New(),
		Subject:   subject,
		Audience:  audience,
		TokenHash: hash,
		Expiracao: expires,
		CriadoEm:  util.Now(),
	})
	if err != nil {
		return err
	}

	if err := s.repo.InvalidateOtherRefreshTokens(ctx, subject, audience, hash); err != nil {
		return err
	}

	return s.redis.Set(ctx, auth.RefreshRedisKey(audience, hash), "active", time.Until(expires)).Err()
}

func buildRolesFromSecretarias(secretarias []repo.SecretariaWithRole) []string {
	roles := make([]string, 0, len(secretarias))
	for _, s := range secretarias {
		role := strings.ToUpper(strings.TrimSpace(s.Papel))
		if role == "" || role == "ATENDENTE" {
			continue
		}
		roles = appendIfMissing(roles, role)
	}
	return roles
}

func normalizeRoles(roles []string) []string {
	seen := make(map[string]struct{}, len(roles))
	normalized := make([]string, 0, len(roles))
	for _, role := range roles {
		role = strings.ToUpper(strings.TrimSpace(role))
		if role == "" {
			continue
		}
		if _, ok := seen[role]; ok {
			continue
		}
		seen[role] = struct{}{}
		normalized = append(normalized, role)
	}
	return normalized
}

func appendIfMissing(values []string, value string) []string {
	value = strings.ToUpper(strings.TrimSpace(value))
	if value == "" {
		return values
	}
	for _, existing := range values {
		if existing == value {
			return values
		}
	}
	return append(values, value)
}

func appendRole(roles []string, role string) []string {
	role = strings.ToUpper(strings.TrimSpace(role))
	if role == "" {
		return roles
	}
	return appendIfMissing(roles, role)
}

func hasRole(roles []string, role string) bool {
	role = strings.ToUpper(strings.TrimSpace(role))
	if role == "" {
		return false
	}
	for _, existing := range roles {
		if existing == role {
			return true
		}
	}
	return false
}

func removeRole(roles []string, target string) []string {
	target = strings.ToUpper(strings.TrimSpace(target))
	if target == "" {
		return roles
	}
	filtered := make([]string, 0, len(roles))
	for _, role := range roles {
		if role == target {
			continue
		}
		filtered = append(filtered, role)
	}
	return filtered
}
