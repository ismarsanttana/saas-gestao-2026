package saas

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

var (
	ErrNotFound = errors.New("saas user not found")
)

// User representa um administrador do SaaS.
type User struct {
	ID           uuid.UUID
	Name         string
	Email        string
	PasswordHash string
	Active       bool
	CreatedAt    time.Time
	UpdatedAt    time.Time
}
