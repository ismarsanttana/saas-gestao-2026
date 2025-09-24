package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/gestaozabele/municipio/internal/auth"
	"github.com/gestaozabele/municipio/internal/saas"
)

// SaaSUserService centraliza casos de uso de administradores SaaS.
type SaaSUserService struct {
	repo      *saas.Repository
	inviteTTL time.Duration
}

// NewSaaSUserService cria nova instância do serviço.
func NewSaaSUserService(repo *saas.Repository, inviteTTL time.Duration) *SaaSUserService {
	if inviteTTL <= 0 {
		inviteTTL = 7 * 24 * time.Hour
	}
	return &SaaSUserService{repo: repo, inviteTTL: inviteTTL}
}

// ListUsers retorna os usuários cadastrados.
func (s *SaaSUserService) ListUsers(ctx context.Context) ([]saas.User, error) {
	return s.repo.List(ctx)
}

// CreateUser cria um usuário ativo imediatamente (senha bruta será hasheada).
func (s *SaaSUserService) CreateUser(ctx context.Context, name, email, role, password string, active bool, createdBy *uuid.UUID) (*saas.User, error) {
	password = strings.TrimSpace(password)
	if len(password) < 8 {
		return nil, errors.New("senha deve ter pelo menos 8 caracteres")
	}

	normalizedRole := saas.NormalizeRole(role)
	if !saas.IsValidRole(normalizedRole) {
		return nil, errors.New("papel inválido")
	}

	hash, err := auth.Hash(password)
	if err != nil {
		return nil, err
	}

	return s.repo.Create(ctx, saas.CreateUserInput{
		Name:         strings.TrimSpace(name),
		Email:        strings.TrimSpace(email),
		PasswordHash: hash,
		Role:         normalizedRole,
		Active:       active,
		CreatedBy:    createdBy,
	})
}

// UpdateUser atualiza papel/estado do usuário.
func (s *SaaSUserService) UpdateUser(ctx context.Context, input saas.UpdateUserInput) (*saas.User, error) {
	normalizedRole := saas.NormalizeRole(input.Role)
	if !saas.IsValidRole(normalizedRole) {
		return nil, errors.New("papel inválido")
	}
	input.Role = normalizedRole
	return s.repo.Update(ctx, input)
}

// DeleteUser remove definitivamente o usuário.
func (s *SaaSUserService) DeleteUser(ctx context.Context, id uuid.UUID) error {
	return s.repo.Delete(ctx, id)
}

// ListInvites retorna convites com filtro opcional.
func (s *SaaSUserService) ListInvites(ctx context.Context, pendingOnly bool) ([]saas.Invite, error) {
	return s.repo.ListInvites(ctx, saas.InviteFilter{PendingOnly: pendingOnly})
}

// InviteResult encapsula dados do convite e o token bruto para envio via e-mail.
type InviteResult struct {
	Invite saas.Invite
	Token  string
}

// InviteUser gera um convite e devolve o token bruto.
func (s *SaaSUserService) InviteUser(ctx context.Context, name, email, role string, createdBy *uuid.UUID) (*InviteResult, error) {
	normalizedRole := saas.NormalizeRole(role)
	if !saas.IsValidRole(normalizedRole) {
		return nil, errors.New("papel inválido")
	}

	rawToken, hash, err := auth.GenerateRefreshToken()
	if err != nil {
		return nil, err
	}

	inv := saas.Invite{
		ID:        uuid.New(),
		Email:     strings.TrimSpace(email),
		Name:      strings.TrimSpace(name),
		Role:      normalizedRole,
		TokenHash: hash,
		ExpiresAt: time.Now().Add(s.inviteTTL),
	}
	if createdBy != nil {
		inv.CreatedBy = createdBy
	}

	stored, err := s.repo.CreateInvite(ctx, inv)
	if err != nil {
		return nil, err
	}

	return &InviteResult{Invite: *stored, Token: rawToken}, nil
}

// AcceptInvite consome o convite e cria usuário com nova senha.
func (s *SaaSUserService) AcceptInvite(ctx context.Context, token, password string) (*saas.User, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return nil, saas.ErrInviteNotFound
	}

	hash := auth.HashRefreshToken(token)
	invite, err := s.repo.GetInviteByTokenHash(ctx, hash)
	if err != nil {
		return nil, err
	}
	if invite.AcceptedAt != nil {
		return nil, saas.ErrInviteAlreadyUsed
	}
	if time.Now().After(invite.ExpiresAt) {
		return nil, saas.ErrInviteExpired
	}

	pwd := strings.TrimSpace(password)
	if len(pwd) < 8 {
		return nil, errors.New("senha deve ter pelo menos 8 caracteres")
	}
	hashed, err := auth.Hash(pwd)
	if err != nil {
		return nil, err
	}

	normalizedRole := saas.NormalizeRole(invite.Role)
	if !saas.IsValidRole(normalizedRole) {
		normalizedRole = saas.RoleAdmin
	}

	user, err := s.repo.Create(ctx, saas.CreateUserInput{
		Name:         invite.Name,
		Email:        invite.Email,
		PasswordHash: hashed,
		Role:         normalizedRole,
		Active:       true,
		CreatedBy:    invite.CreatedBy,
	})
	if err != nil {
		return nil, err
	}

	if err := s.repo.MarkInviteAccepted(ctx, invite.ID); err != nil {
		return nil, err
	}

	return user, nil
}
