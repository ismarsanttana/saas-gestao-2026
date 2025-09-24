package tenant

import (
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
)

var (
	ErrNotFound      = errors.New("tenant not found")
	ErrInvalidStatus = errors.New("invalid tenant status")
	ErrInvalidDNS    = errors.New("invalid tenant dns status")
)

const (
	StatusDraft     = "draft"
	StatusReview    = "review"
	StatusActive    = "active"
	StatusSuspended = "suspended"
	StatusArchived  = "archived"
)

const (
	DNSStatusPending     = "pending"
	DNSStatusConfiguring = "configuring"
	DNSStatusConfigured  = "configured"
	DNSStatusFailed      = "failed"
)

var validTenantStatuses = map[string]struct{}{
	StatusDraft:     {},
	StatusReview:    {},
	StatusActive:    {},
	StatusSuspended: {},
	StatusArchived:  {},
}

var validDNSStatuses = map[string]struct{}{
	DNSStatusPending:     {},
	DNSStatusConfiguring: {},
	DNSStatusConfigured:  {},
	DNSStatusFailed:      {},
}

// Tenant representa um município/cliente na plataforma.
type Tenant struct {
	ID             uuid.UUID      `json:"id"`
	Slug           string         `json:"slug"`
	DisplayName    string         `json:"display_name"`
	Domain         string         `json:"domain"`
	Status         string         `json:"status"`
	DNSStatus      string         `json:"dns_status"`
	DNSLastChecked *time.Time     `json:"dns_last_checked_at,omitempty"`
	DNSError       *string        `json:"dns_error,omitempty"`
	LogoURL        *string        `json:"logo_url,omitempty"`
	Notes          *string        `json:"notes,omitempty"`
	Contact        map[string]any `json:"contact"`
	Theme          map[string]any `json:"theme"`
	Settings       map[string]any `json:"settings"`
	CreatedBy      *uuid.UUID     `json:"created_by,omitempty"`
	ActivatedAt    *time.Time     `json:"activated_at,omitempty"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
}

// CreateTenantInput contém os campos necessários para registrar um tenant.
type CreateTenantInput struct {
	Slug        string
	DisplayName string
	Domain      string
	Status      string
	Contact     map[string]any
	Theme       map[string]any
	Settings    map[string]any
	LogoURL     *string
	Notes       *string
	CreatedBy   *uuid.UUID
}

// IsValidStatus informa se o status informado é permitido.
func IsValidStatus(status string) bool {
	_, ok := validTenantStatuses[strings.ToLower(strings.TrimSpace(status))]
	return ok
}

// NormalizeStatus padroniza string de status.
func NormalizeStatus(status string) string {
	status = strings.ToLower(strings.TrimSpace(status))
	if status == "" {
		return StatusDraft
	}
	if _, ok := validTenantStatuses[status]; ok {
		return status
	}
	return status
}

// NormalizeDNSStatus padroniza status DNS.
func NormalizeDNSStatus(status string) string {
	status = strings.ToLower(strings.TrimSpace(status))
	if status == "" {
		return DNSStatusPending
	}
	if _, ok := validDNSStatuses[status]; ok {
		return status
	}
	return status
}

// IsValidDNSStatus verifica se o status DNS é aceito.
func IsValidDNSStatus(status string) bool {
	_, ok := validDNSStatuses[strings.ToLower(strings.TrimSpace(status))]
	return ok
}
