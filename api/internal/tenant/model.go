package tenant

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

var (
	ErrNotFound = errors.New("tenant not found")
)

// Tenant representa um município/cliente na plataforma.
type Tenant struct {
	ID          uuid.UUID      `json:"id"`
	Slug        string         `json:"slug"`
	DisplayName string         `json:"display_name"`
	Domain      string         `json:"domain"`
	Settings    map[string]any `json:"settings"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
}

// CreateTenantInput contém os campos necessários para registrar um tenant.
type CreateTenantInput struct {
	Slug        string
	DisplayName string
	Domain      string
	Settings    map[string]any
}
