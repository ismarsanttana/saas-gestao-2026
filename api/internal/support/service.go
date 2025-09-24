package support

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Service reúne regras de negócio para tickets de suporte.
type Service struct {
	repo *Repository
}

// NewService cria uma nova instância do serviço.
func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// CreateTicket abre um novo chamado para o tenant.
func (s *Service) CreateTicket(ctx context.Context, input CreateTicketInput) (*Ticket, error) {
	input.Subject = strings.TrimSpace(input.Subject)
	input.Category = strings.TrimSpace(input.Category)
	input.Description = strings.TrimSpace(input.Description)
	input.Status = NormalizeStatus(input.Status)
	input.Priority = NormalizePriority(input.Priority)

	if input.Subject == "" {
		return nil, errors.New("assunto obrigatório")
	}
	if input.Category == "" {
		return nil, errors.New("categoria obrigatória")
	}
	if input.Description == "" {
		return nil, errors.New("descrição obrigatória")
	}
	if !IsValidStatus(input.Status) {
		return nil, ErrInvalidStatus
	}
	if !IsValidPriority(input.Priority) {
		return nil, ErrInvalidPriority
	}

	if len(input.Tags) > 0 {
		for i, tag := range input.Tags {
			input.Tags[i] = strings.TrimSpace(tag)
		}
	}

	return s.repo.CreateTicket(ctx, input)
}

// ListTickets lista chamados dentro do filtro informado.
func (s *Service) ListTickets(ctx context.Context, filter TicketFilter) ([]Ticket, error) {
	if len(filter.Status) > 0 {
		normalized := make([]string, 0, len(filter.Status))
		for _, status := range filter.Status {
			status = NormalizeStatus(status)
			if IsValidStatus(status) {
				normalized = append(normalized, status)
			}
		}
		filter.Status = normalized
	}
	return s.repo.ListTickets(ctx, filter)
}

// GetTicket recupera um chamado.
func (s *Service) GetTicket(ctx context.Context, id uuid.UUID) (*Ticket, error) {
	return s.repo.GetTicket(ctx, id)
}

// UpdateTicket altera status/prioridade/atribuição.
func (s *Service) UpdateTicket(ctx context.Context, id uuid.UUID, status, priority *string, assignedTo *uuid.UUID, clearAssignee bool) (*Ticket, error) {
	var statusVal *string
	if status != nil {
		normalized := NormalizeStatus(*status)
		if !IsValidStatus(normalized) {
			return nil, ErrInvalidStatus
		}
		statusVal = &normalized
	}

	var priorityVal *string
	if priority != nil {
		normalized := NormalizePriority(*priority)
		if !IsValidPriority(normalized) {
			return nil, ErrInvalidPriority
		}
		priorityVal = &normalized
	}

	update := UpdateTicketInput{
		ID:            id,
		Status:        statusVal,
		Priority:      priorityVal,
		AssignedTo:    assignedTo,
		ClearAssignee: clearAssignee,
	}

	if statusVal != nil {
		switch *statusVal {
		case StatusResolved, StatusClosed:
			now := time.Now()
			update.ClosedAt = &now
		default:
			// reaberto
			update.ClosedAt = nil
		}
	}

	return s.repo.UpdateTicket(ctx, update)
}

// AddMessage adiciona nova mensagem ao ticket.
func (s *Service) AddMessage(ctx context.Context, input CreateMessageInput) (*Message, error) {
	input.Body = strings.TrimSpace(input.Body)
	if input.Body == "" {
		return nil, errors.New("mensagem obrigatória")
	}

	if input.AuthorType == "" {
		input.AuthorType = AuthorSaaS
	}

	if !IsValidAuthor(input.AuthorType) {
		return nil, ErrInvalidAuthor
	}

	return s.repo.CreateMessage(ctx, input)
}

// ListMessages lista interações do ticket.
func (s *Service) ListMessages(ctx context.Context, ticketID uuid.UUID) ([]Message, error) {
	return s.repo.ListMessages(ctx, ticketID)
}
