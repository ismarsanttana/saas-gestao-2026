package support

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Repository provê acesso às tabelas de suporte.
type Repository struct {
	pool *pgxpool.Pool
}

// NewRepository cria instância do repositório.
func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// CreateTicket insere um novo chamado.
func (r *Repository) CreateTicket(ctx context.Context, input CreateTicketInput) (*Ticket, error) {
	const query = `
        INSERT INTO support_tickets (tenant_id, subject, category, status, priority, description, tags, created_by, assigned_to)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, tenant_id, subject, category, status, priority, description, tags, created_by, assigned_to, created_at, updated_at, closed_at
    `

	tags := input.Tags
	if tags == nil {
		tags = []string{}
	}

	row := r.pool.QueryRow(ctx, query,
		input.TenantID,
		strings.TrimSpace(input.Subject),
		strings.TrimSpace(input.Category),
		strings.ToLower(input.Status),
		strings.ToLower(input.Priority),
		strings.TrimSpace(input.Description),
		tags,
		input.CreatedBy,
		input.AssignedTo,
	)

	return scanTicket(row)
}

// GetTicket busca um ticket específico.
func (r *Repository) GetTicket(ctx context.Context, id uuid.UUID) (*Ticket, error) {
	const query = `
        SELECT id, tenant_id, subject, category, status, priority, description, tags, created_by, assigned_to, created_at, updated_at, closed_at
        FROM support_tickets
        WHERE id = $1
    `

	row := r.pool.QueryRow(ctx, query, id)
	return scanTicket(row)
}

// ListTickets lista tickets aplicando filtros simples.
func (r *Repository) ListTickets(ctx context.Context, filter TicketFilter) ([]Ticket, error) {
	base := `
        SELECT id, tenant_id, subject, category, status, priority, description, tags, created_by, assigned_to, created_at, updated_at, closed_at
        FROM support_tickets`

	var (
		clauses []string
		args    []any
		idx     = 1
	)

	if filter.TenantID != nil {
		clauses = append(clauses, fmt.Sprintf("tenant_id = $%d", idx))
		args = append(args, *filter.TenantID)
		idx++
	}

	if len(filter.Status) > 0 {
		normalized := make([]string, len(filter.Status))
		for i, status := range filter.Status {
			normalized[i] = strings.ToLower(strings.TrimSpace(status))
		}
		clauses = append(clauses, fmt.Sprintf("status = ANY($%d)", idx))
		args = append(args, normalized)
		idx++
	}

	query := base
	if len(clauses) > 0 {
		query += " WHERE " + strings.Join(clauses, " AND ")
	}

	limit := filter.Limit
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	offset := filter.Offset
	if offset < 0 {
		offset = 0
	}

	query += fmt.Sprintf(" ORDER BY created_at DESC LIMIT $%d OFFSET $%d", idx, idx+1)
	args = append(args, limit, offset)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tickets []Ticket
	for rows.Next() {
		ticket, err := scanTicket(rows)
		if err != nil {
			return nil, err
		}
		tickets = append(tickets, *ticket)
	}

	if rows.Err() != nil {
		return nil, rows.Err()
	}

	return tickets, nil
}

// UpdateTicket atualiza campos do ticket.
func (r *Repository) UpdateTicket(ctx context.Context, input UpdateTicketInput) (*Ticket, error) {
	setParts := []string{}
	args := []any{}
	idx := 1

	if input.Status != nil {
		setParts = append(setParts, fmt.Sprintf("status = $%d", idx))
		args = append(args, strings.ToLower(strings.TrimSpace(*input.Status)))
		idx++
	}
	if input.Priority != nil {
		setParts = append(setParts, fmt.Sprintf("priority = $%d", idx))
		args = append(args, strings.ToLower(strings.TrimSpace(*input.Priority)))
		idx++
	}
	if input.AssignedTo != nil {
		setParts = append(setParts, fmt.Sprintf("assigned_to = $%d", idx))
		args = append(args, *input.AssignedTo)
		idx++
	} else if input.ClearAssignee {
		setParts = append(setParts, "assigned_to = NULL")
	}

	if input.ClosedAt != nil {
		setParts = append(setParts, fmt.Sprintf("closed_at = $%d", idx))
		args = append(args, *input.ClosedAt)
		idx++
	} else if input.Status != nil {
		// quando reabrir, limpa closed_at
		setParts = append(setParts, "closed_at = NULL")
	}

	if len(setParts) == 0 {
		return r.GetTicket(ctx, input.ID)
	}

	setParts = append(setParts, "updated_at = now()")

	args = append(args, input.ID)
	query := fmt.Sprintf(`
        UPDATE support_tickets
        SET %s
        WHERE id = $%d
        RETURNING id, tenant_id, subject, category, status, priority, description, tags, created_by, assigned_to, created_at, updated_at, closed_at
    `, strings.Join(setParts, ", "), idx)

	row := r.pool.QueryRow(ctx, query, args...)
	return scanTicket(row)
}

// CreateMessage insere mensagem no ticket.
func (r *Repository) CreateMessage(ctx context.Context, input CreateMessageInput) (*Message, error) {
	const query = `
        INSERT INTO support_ticket_messages (ticket_id, author_type, author_id, body)
        VALUES ($1, $2, $3, $4)
        RETURNING id, ticket_id, author_type, author_id, body, created_at
    `

	row := r.pool.QueryRow(ctx, query,
		input.TicketID,
		strings.ToLower(strings.TrimSpace(input.AuthorType)),
		input.AuthorID,
		strings.TrimSpace(input.Body),
	)

	return scanMessage(row)
}

// ListMessages lista interações do ticket.
func (r *Repository) ListMessages(ctx context.Context, ticketID uuid.UUID) ([]Message, error) {
	const query = `
        SELECT id, ticket_id, author_type, author_id, body, created_at
        FROM support_ticket_messages
        WHERE ticket_id = $1
        ORDER BY created_at ASC
    `

	rows, err := r.pool.Query(ctx, query, ticketID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []Message
	for rows.Next() {
		msg, err := scanMessage(rows)
		if err != nil {
			return nil, err
		}
		messages = append(messages, *msg)
	}

	if rows.Err() != nil {
		return nil, rows.Err()
	}

	return messages, nil
}

func scanTicket(row pgx.Row) (*Ticket, error) {
	var t Ticket
	if err := row.Scan(&t.ID, &t.TenantID, &t.Subject, &t.Category, &t.Status, &t.Priority, &t.Description, &t.Tags, &t.CreatedBy, &t.AssignedTo, &t.CreatedAt, &t.UpdatedAt, &t.ClosedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &t, nil
}

func scanMessage(row pgx.Row) (*Message, error) {
	var m Message
	if err := row.Scan(&m.ID, &m.TicketID, &m.AuthorType, &m.AuthorID, &m.Body, &m.CreatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrMessageNotFound
		}
		return nil, err
	}
	return &m, nil
}
