package saas

import (
	"context"
	"strings"

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
        SELECT id, name, email, password_hash, active, created_at, updated_at
        FROM saas_users
        WHERE email = $1
    `

	row := r.pool.QueryRow(ctx, query, strings.ToLower(strings.TrimSpace(email)))
	return scanUser(row)
}

// GetByID recupera usuário pelo ID.
func (r *Repository) GetByID(ctx context.Context, id uuid.UUID) (*User, error) {
	const query = `
        SELECT id, name, email, password_hash, active, created_at, updated_at
        FROM saas_users
        WHERE id = $1
    `

	row := r.pool.QueryRow(ctx, query, id)
	return scanUser(row)
}

func scanUser(row pgx.Row) (*User, error) {
	var u User
	if err := row.Scan(&u.ID, &u.Name, &u.Email, &u.PasswordHash, &u.Active, &u.CreatedAt, &u.UpdatedAt); err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &u, nil
}
