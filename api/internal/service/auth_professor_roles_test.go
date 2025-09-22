package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/redis/go-redis/v9"

	"github.com/gestaozabele/municipio/internal/auth"
	"github.com/gestaozabele/municipio/internal/repo"
)

type stubAuthRepo struct {
	user         repo.Usuario
	secretarias  []repo.SecretariaWithRole
	professor    bool
	refreshCalls int
}

func (s *stubAuthRepo) GetUsuarioByEmail(ctx context.Context, email string) (repo.Usuario, error) {
	if strings.EqualFold(email, s.user.Email) {
		return s.user, nil
	}
	return repo.Usuario{}, repo.ErrNotFound
}

func (s *stubAuthRepo) ListSecretariasByUsuario(ctx context.Context, usuarioID uuid.UUID) ([]repo.SecretariaWithRole, error) {
	return s.secretarias, nil
}

func (s *stubAuthRepo) QueryRowContext(ctx context.Context, sql string, args ...any) pgx.Row {
	return stubRow{value: s.professor}
}

func (s *stubAuthRepo) HasProfessorTurma(ctx context.Context, professorID uuid.UUID) (bool, error) {
	return s.professor, nil
}

func (s *stubAuthRepo) GetCidadaoByEmail(ctx context.Context, email string) (repo.Cidadao, error) {
	return repo.Cidadao{}, repo.ErrNotFound
}

func (s *stubAuthRepo) GetRefreshTokenByHash(ctx context.Context, tokenHash string) (repo.TokenRefresh, error) {
	return repo.TokenRefresh{}, repo.ErrNotFound
}

func (s *stubAuthRepo) GetUsuarioByID(ctx context.Context, id uuid.UUID) (repo.Usuario, error) {
	if id == s.user.ID {
		return s.user, nil
	}
	return repo.Usuario{}, repo.ErrNotFound
}

func (s *stubAuthRepo) UpdateUsuario(ctx context.Context, id uuid.UUID, nome, email string) error {
	if id != s.user.ID {
		return repo.ErrNotFound
	}
	s.user.Nome = nome
	s.user.Email = email
	return nil
}

func (s *stubAuthRepo) GetCidadaoByID(ctx context.Context, id uuid.UUID) (repo.Cidadao, error) {
	return repo.Cidadao{}, repo.ErrNotFound
}

func (s *stubAuthRepo) InsertRefreshToken(ctx context.Context, arg repo.InsertRefreshTokenParams) (repo.TokenRefresh, error) {
	s.refreshCalls++
	return repo.TokenRefresh{
		ID:        arg.ID,
		Subject:   arg.Subject,
		Audience:  arg.Audience,
		TokenHash: arg.TokenHash,
		Expiracao: arg.Expiracao,
		CriadoEm:  arg.CriadoEm,
	}, nil
}

func (s *stubAuthRepo) InvalidateOtherRefreshTokens(ctx context.Context, subject uuid.UUID, audience, keepHash string) error {
	return nil
}

func (s *stubAuthRepo) RevokeRefreshToken(ctx context.Context, tokenHash string) error {
	return nil
}

type stubRow struct {
	value bool
}

func (r stubRow) Scan(dest ...any) error {
	if len(dest) == 0 {
		return errors.New("no destination provided")
	}
	ptr, ok := dest[0].(*bool)
	if !ok {
		return errors.New("destination must be *bool")
	}
	*ptr = r.value
	return nil
}

type stubRedis struct {
	store map[string]string
}

func (s *stubRedis) Set(ctx context.Context, key string, value any, expiration time.Duration) *redis.StatusCmd {
	if s.store == nil {
		s.store = make(map[string]string)
	}
	s.store[key] = toString(value)
	cmd := redis.NewStatusCmd(ctx)
	cmd.SetVal("OK")
	return cmd
}

func (s *stubRedis) Get(ctx context.Context, key string) *redis.StringCmd {
	cmd := redis.NewStringCmd(ctx)
	if s.store == nil {
		cmd.SetErr(redis.Nil)
		return cmd
	}
	val, ok := s.store[key]
	if !ok {
		cmd.SetErr(redis.Nil)
		return cmd
	}
	cmd.SetVal(val)
	return cmd
}

func (s *stubRedis) Del(ctx context.Context, keys ...string) *redis.IntCmd {
	var removed int64
	if s.store != nil {
		for _, key := range keys {
			if _, ok := s.store[key]; ok {
				delete(s.store, key)
				removed++
			}
		}
	}
	cmd := redis.NewIntCmd(ctx)
	cmd.SetVal(removed)
	return cmd
}

func toString(value any) string {
	return fmt.Sprint(value)
}

func containsRole(roles []string, target string) bool {
	for _, role := range roles {
		if role == target {
			return true
		}
	}
	return false
}

func TestLoginBackofficeAddsProfessorRole(t *testing.T) {
	password := "SenhaForte123!"
	hash, err := auth.Hash(password)
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}

	userID := uuid.New()
	repoStub := &stubAuthRepo{
		user: repo.Usuario{
			ID:        userID,
			Nome:      "Professor Teste",
			Email:     "professor@example.com",
			SenhaHash: hash,
			Ativo:     true,
		},
		secretarias: []repo.SecretariaWithRole{{Papel: "ATENDENTE"}},
		professor:   true,
	}

	jwtMgr := auth.NewJWTManager(strings.Repeat("a", 32), time.Minute)

	svc := &AuthService{
		repo:       repoStub,
		redis:      &stubRedis{},
		jwt:        jwtMgr,
		refreshTTL: time.Hour,
	}

	result, err := svc.LoginBackoffice(context.Background(), "professor@example.com", password)
	if err != nil {
		t.Fatalf("login failed: %v", err)
	}

	if len(result.Roles) != 1 || result.Roles[0] != "PROFESSOR" {
		t.Fatalf("expected roles to be [PROFESSOR], got %v", result.Roles)
	}
}

func TestLoginBackofficeRejectsWhenNoEligibleRole(t *testing.T) {
	password := "SenhaForte123!"
	hash, err := auth.Hash(password)
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}

	userID := uuid.New()
	repoStub := &stubAuthRepo{
		user: repo.Usuario{
			ID:        userID,
			Nome:      "Atendente Teste",
			Email:     "atendente@example.com",
			SenhaHash: hash,
			Ativo:     true,
		},
		secretarias: []repo.SecretariaWithRole{{Papel: "ATENDENTE"}},
		professor:   false,
	}

	jwtMgr := auth.NewJWTManager(strings.Repeat("b", 32), time.Minute)

	svc := &AuthService{
		repo:       repoStub,
		redis:      &stubRedis{},
		jwt:        jwtMgr,
		refreshTTL: time.Hour,
	}

	result, err := svc.LoginBackoffice(context.Background(), "atendente@example.com", password)
	if err == nil || !errors.Is(err, ErrNoEligibleRoles) {
		t.Fatalf("expected ErrNoEligibleRoles, got result=%v err=%v", result, err)
	}
}
