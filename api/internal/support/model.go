package support

import (
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
)

var (
	ErrNotFound        = errors.New("ticket not found")
	ErrMessageNotFound = errors.New("message not found")
	ErrInvalidStatus   = errors.New("invalid status")
	ErrInvalidPriority = errors.New("invalid priority")
	ErrInvalidAuthor   = errors.New("invalid author type")
)

const (
	StatusOpen       = "open"
	StatusInProgress = "in_progress"
	StatusResolved   = "resolved"
	StatusClosed     = "closed"

	PriorityLow    = "low"
	PriorityNormal = "normal"
	PriorityHigh   = "high"
	PriorityUrgent = "urgent"

	AuthorSaaS   = "saas_user"
	AuthorTenant = "tenant_user"
	AuthorSystem = "system"
)

var (
	validStatuses = map[string]struct{}{
		StatusOpen:       {},
		StatusInProgress: {},
		StatusResolved:   {},
		StatusClosed:     {},
	}
	validPriorities = map[string]struct{}{
		PriorityLow:    {},
		PriorityNormal: {},
		PriorityHigh:   {},
		PriorityUrgent: {},
	}
	validAuthorTypes = map[string]struct{}{
		AuthorSaaS:   {},
		AuthorTenant: {},
		AuthorSystem: {},
	}
)

// Ticket representa um chamado aberto por um tenant.
type Ticket struct {
	ID          uuid.UUID  `json:"id"`
	TenantID    uuid.UUID  `json:"tenant_id"`
	Subject     string     `json:"subject"`
	Category    string     `json:"category"`
	Status      string     `json:"status"`
	Priority    string     `json:"priority"`
	Description string     `json:"description"`
	Tags        []string   `json:"tags"`
	CreatedBy   *uuid.UUID `json:"created_by,omitempty"`
	AssignedTo  *uuid.UUID `json:"assigned_to,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	ClosedAt    *time.Time `json:"closed_at,omitempty"`
}

// Message representa uma interação no chamado.
type Message struct {
	ID         uuid.UUID  `json:"id"`
	TicketID   uuid.UUID  `json:"ticket_id"`
	AuthorType string     `json:"author_type"`
	AuthorID   *uuid.UUID `json:"author_id,omitempty"`
	Body       string     `json:"body"`
	CreatedAt  time.Time  `json:"created_at"`
}

// CreateTicketInput encapsula campos para abertura de ticket.
type CreateTicketInput struct {
	TenantID    uuid.UUID
	Subject     string
	Category    string
	Description string
	Priority    string
	Status      string
	Tags        []string
	CreatedBy   *uuid.UUID
	AssignedTo  *uuid.UUID
}

// UpdateTicketInput permite atualizar status/atribuições.
type UpdateTicketInput struct {
	ID            uuid.UUID
	Status        *string
	Priority      *string
	AssignedTo    *uuid.UUID
	ClearAssignee bool
	ClosedAt      *time.Time
}

// CreateMessageInput encapsula nova mensagem no ticket.
type CreateMessageInput struct {
	TicketID   uuid.UUID
	AuthorType string
	AuthorID   *uuid.UUID
	Body       string
}

// TicketFilter permite filtrar listagem de tickets.
type TicketFilter struct {
	TenantID *uuid.UUID
	Status   []string
	Limit    int
	Offset   int
}

// NormalizeStatus garante padrão em letras minúsculas.
func NormalizeStatus(status string) string {
	status = strings.ToLower(strings.TrimSpace(status))
	if status == "" {
		return StatusOpen
	}
	return status
}

// NormalizePriority padroniza prioridade.
func NormalizePriority(priority string) string {
	priority = strings.ToLower(strings.TrimSpace(priority))
	if priority == "" {
		return PriorityNormal
	}
	return priority
}

// IsValidStatus indica se o status é aceito.
func IsValidStatus(status string) bool {
	_, ok := validStatuses[strings.ToLower(strings.TrimSpace(status))]
	return ok
}

// IsValidPriority indica se prioridade é válida.
func IsValidPriority(priority string) bool {
	_, ok := validPriorities[strings.ToLower(strings.TrimSpace(priority))]
	return ok
}

// IsValidAuthor verifica tipo de autor.
func IsValidAuthor(author string) bool {
	_, ok := validAuthorTypes[strings.ToLower(strings.TrimSpace(author))]
	return ok
}
