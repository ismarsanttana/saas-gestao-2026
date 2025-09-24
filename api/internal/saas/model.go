package saas

import (
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
)

var (
	ErrNotFound          = errors.New("saas user not found")
	ErrInviteNotFound    = errors.New("invite not found")
	ErrInviteExpired     = errors.New("invite expired")
	ErrInviteAlreadyUsed = errors.New("invite already used")
)

const (
	RoleOwner   = "owner"
	RoleAdmin   = "admin"
	RoleSupport = "support"
	RoleFinance = "finance"
)

var validRoles = map[string]struct{}{
	RoleOwner:   {},
	RoleAdmin:   {},
	RoleSupport: {},
	RoleFinance: {},
}

// User representa um administrador do SaaS.
type User struct {
	ID           uuid.UUID  `json:"id"`
	Name         string     `json:"name"`
	Email        string     `json:"email"`
	PasswordHash string     `json:"-"`
	Role         string     `json:"role"`
	Active       bool       `json:"active"`
	LastLoginAt  *time.Time `json:"last_login_at,omitempty"`
	InvitedAt    *time.Time `json:"invited_at,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
	CreatedBy    *uuid.UUID `json:"created_by,omitempty"`
}

type CreateUserInput struct {
	Name         string
	Email        string
	PasswordHash string
	Role         string
	Active       bool
	CreatedBy    *uuid.UUID
}

type UpdateUserInput struct {
	ID        uuid.UUID
	Name      string
	Role      string
	Active    bool
	UpdatedBy *uuid.UUID
}

type InviteFilter struct {
	PendingOnly bool
}

// Invite representa um convite pendente para o SaaS.
type Invite struct {
	ID         uuid.UUID  `json:"id"`
	Email      string     `json:"email"`
	Name       string     `json:"name"`
	Role       string     `json:"role"`
	TokenHash  string     `json:"-"`
	ExpiresAt  time.Time  `json:"expires_at"`
	CreatedBy  *uuid.UUID `json:"created_by,omitempty"`
	AcceptedAt *time.Time `json:"accepted_at,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
}

// NormalizeRole padroniza o papel informado, caindo em admin caso vazio.
func NormalizeRole(role string) string {
	role = strings.ToLower(strings.TrimSpace(role))
	if role == "" {
		return RoleAdmin
	}
	if _, ok := validRoles[role]; ok {
		return role
	}
	return role
}

// IsValidRole informa se o papel é suportado.
func IsValidRole(role string) bool {
	_, ok := validRoles[strings.ToLower(strings.TrimSpace(role))]
	return ok
}
