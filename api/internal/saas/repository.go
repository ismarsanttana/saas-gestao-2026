package saas

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Repository fornece acesso aos dados dos administradores SaaS.
type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// GetByEmail recupera usuário pelo e-mail.
func (r *Repository) GetByEmail(ctx context.Context, email string) (*User, error) {
	const query = `
        SELECT id, name, email, password_hash, role, active, last_login_at, invited_at, created_at, updated_at, created_by
        FROM saas_users
        WHERE email = $1
    `

	normalized := strings.ToLower(strings.TrimSpace(email))
	row := r.pool.QueryRow(ctx, query, normalized)
	return scanUser(row)
}

// GetByID recupera usuário pelo ID.
func (r *Repository) GetByID(ctx context.Context, id uuid.UUID) (*User, error) {
	const query = `
        SELECT id, name, email, password_hash, role, active, last_login_at, invited_at, created_at, updated_at, created_by
        FROM saas_users
        WHERE id = $1
    `

	row := r.pool.QueryRow(ctx, query, id)
	return scanUser(row)
}

// List devolve todos os usuários do SaaS.
func (r *Repository) List(ctx context.Context) ([]User, error) {
	const query = `
        SELECT id, name, email, password_hash, role, active, last_login_at, invited_at, created_at, updated_at, created_by
        FROM saas_users
        ORDER BY created_at ASC
    `

	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		users = append(users, *u)
	}

	if rows.Err() != nil {
		return nil, rows.Err()
	}

	return users, nil
}

// Create insere novo usuário SaaS.
func (r *Repository) Create(ctx context.Context, input CreateUserInput) (*User, error) {
	const query = `
        INSERT INTO saas_users (id, name, email, password_hash, role, active, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, name, email, password_hash, role, active, last_login_at, invited_at, created_at, updated_at, created_by
    `

	id := uuid.New()
	row := r.pool.QueryRow(ctx, query,
		id,
		strings.TrimSpace(input.Name),
		strings.ToLower(strings.TrimSpace(input.Email)),
		input.PasswordHash,
		strings.TrimSpace(strings.ToLower(input.Role)),
		input.Active,
		input.CreatedBy,
	)

	return scanUser(row)
}

// Update altera dados principais do usuário.
func (r *Repository) Update(ctx context.Context, input UpdateUserInput) (*User, error) {
	const query = `
        UPDATE saas_users
        SET name = $2,
            role = $3,
            active = $4,
            updated_at = now()
        WHERE id = $1
        RETURNING id, name, email, password_hash, role, active, last_login_at, invited_at, created_at, updated_at, created_by
    `

	row := r.pool.QueryRow(ctx, query,
		input.ID,
		strings.TrimSpace(input.Name),
		strings.TrimSpace(strings.ToLower(input.Role)),
		input.Active,
	)

	return scanUser(row)
}

// UpdatePassword atualiza hash da senha.
func (r *Repository) UpdatePassword(ctx context.Context, id uuid.UUID, hash string) error {
	const query = `
        UPDATE saas_users SET password_hash = $2, updated_at = now() WHERE id = $1
    `

	tag, err := r.pool.Exec(ctx, query, id, hash)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// RecordLogin atualiza o último acesso.
func (r *Repository) RecordLogin(ctx context.Context, id uuid.UUID) error {
	const query = `UPDATE saas_users SET last_login_at = now(), updated_at = now() WHERE id = $1`
	tag, err := r.pool.Exec(ctx, query, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// Delete remove definitivamente um usuário.
func (r *Repository) Delete(ctx context.Context, id uuid.UUID) error {
	const query = `DELETE FROM saas_users WHERE id = $1`
	tag, err := r.pool.Exec(ctx, query, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// CreateInvite registra um convite.
func (r *Repository) CreateInvite(ctx context.Context, invite Invite) (*Invite, error) {
	const query = `
        INSERT INTO saas_user_invites (id, email, name, role, token_hash, expires_at, created_by, accepted_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, email, name, role, token_hash, expires_at, created_by, accepted_at, created_at
    `

	row := r.pool.QueryRow(ctx, query,
		invite.ID,
		strings.ToLower(strings.TrimSpace(invite.Email)),
		strings.TrimSpace(invite.Name),
		strings.TrimSpace(strings.ToLower(invite.Role)),
		invite.TokenHash,
		invite.ExpiresAt,
		invite.CreatedBy,
		invite.AcceptedAt,
	)

	return scanInvite(row)
}

// GetInviteByTokenHash retorna convite pelo hash.
func (r *Repository) GetInviteByTokenHash(ctx context.Context, hash string) (*Invite, error) {
	const query = `
        SELECT id, email, name, role, token_hash, expires_at, created_by, accepted_at, created_at
        FROM saas_user_invites
        WHERE token_hash = $1
    `

	row := r.pool.QueryRow(ctx, query, hash)
	return scanInvite(row)
}

// MarkInviteAccepted marca convite como aceito.
func (r *Repository) MarkInviteAccepted(ctx context.Context, id uuid.UUID) error {
	const query = `UPDATE saas_user_invites SET accepted_at = now() WHERE id = $1`
	tag, err := r.pool.Exec(ctx, query, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ListInvites retorna convites (opcionalmente apenas pendentes).
func (r *Repository) ListInvites(ctx context.Context, filter InviteFilter) ([]Invite, error) {
	query := `
        SELECT id, email, name, role, token_hash, expires_at, created_by, accepted_at, created_at
        FROM saas_user_invites`
	if filter.PendingOnly {
		query += " WHERE accepted_at IS NULL"
	}
	query += " ORDER BY created_at DESC"

	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var invites []Invite
	for rows.Next() {
		inv, err := scanInvite(rows)
		if err != nil {
			return nil, err
		}
		invites = append(invites, *inv)
	}
	if rows.Err() != nil {
		return nil, rows.Err()
	}
	return invites, nil
}

func scanUser(row pgx.Row) (*User, error) {
	var (
		u         User
		createdBy *uuid.UUID
		lastLogin *time.Time
		invitedAt *time.Time
	)

	if err := row.Scan(&u.ID, &u.Name, &u.Email, &u.PasswordHash, &u.Role, &u.Active, &lastLogin, &invitedAt, &u.CreatedAt, &u.UpdatedAt, &createdBy); err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, err
	}

	if createdBy != nil {
		u.CreatedBy = createdBy
	}
	if lastLogin != nil {
		u.LastLoginAt = lastLogin
	}
	if invitedAt != nil {
		u.InvitedAt = invitedAt
	}

	return &u, nil
}

func scanInvite(row pgx.Row) (*Invite, error) {
	var (
		inv       Invite
		createdBy *uuid.UUID
		accepted  *time.Time
	)

	if err := row.Scan(&inv.ID, &inv.Email, &inv.Name, &inv.Role, &inv.TokenHash, &inv.ExpiresAt, &createdBy, &accepted, &inv.CreatedAt); err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrInviteNotFound
		}
		return nil, err
	}
	if createdBy != nil {
		inv.CreatedBy = createdBy
	}
	if accepted != nil {
		inv.AcceptedAt = accepted
	}
	return &inv, nil
}
