package tenant

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Repository provê acesso ao armazenamento de tenants.
type Repository struct {
	pool *pgxpool.Pool
}

// NewRepository cria um novo repositório de tenants.
func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// GetByDomain busca tenant pelo domínio normalizado.
func (r *Repository) GetByDomain(ctx context.Context, domain string) (*Tenant, error) {
	const query = `
        SELECT id, slug, display_name, domain, settings, created_at, updated_at
        FROM tenants
        WHERE domain = $1
    `

	row := r.pool.QueryRow(ctx, query, domain)

	tenant, err := scanTenant(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return tenant, nil
}

// List devolve todos os tenants ordenados por criação.
func (r *Repository) List(ctx context.Context) ([]Tenant, error) {
	const query = `
        SELECT id, slug, display_name, domain, settings, created_at, updated_at
        FROM tenants
        ORDER BY created_at ASC
    `

	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tenants []Tenant
	for rows.Next() {
		t, err := scanTenant(rows)
		if err != nil {
			return nil, err
		}
		tenants = append(tenants, *t)
	}

	if rows.Err() != nil {
		return nil, rows.Err()
	}

	return tenants, nil
}

// Create insere um novo tenant e devolve os dados persistidos.
func (r *Repository) Create(ctx context.Context, input CreateTenantInput) (*Tenant, error) {
	const query = `
        INSERT INTO tenants (slug, display_name, domain, settings)
        VALUES ($1, $2, $3, $4)
        RETURNING id, slug, display_name, domain, settings, created_at, updated_at
    `

	settingsJSON, err := json.Marshal(input.Settings)
	if err != nil {
		return nil, err
	}

	row := r.pool.QueryRow(ctx, query,
		strings.TrimSpace(strings.ToLower(input.Slug)),
		strings.TrimSpace(input.DisplayName),
		strings.TrimSpace(strings.ToLower(input.Domain)),
		settingsJSON,
	)

	return scanTenant(row)
}

func scanTenant(row pgx.Row) (*Tenant, error) {
	var t Tenant
	var settingsRaw []byte
	if err := row.Scan(&t.ID, &t.Slug, &t.DisplayName, &t.Domain, &settingsRaw, &t.CreatedAt, &t.UpdatedAt); err != nil {
		return nil, err
	}

	if len(settingsRaw) == 0 {
		t.Settings = map[string]any{}
	} else {
		if err := json.Unmarshal(settingsRaw, &t.Settings); err != nil {
			return nil, err
		}
	}

	return &t, nil
}

// UpsertSettings atualiza apenas o campo settings e o timestamp.
func (r *Repository) UpsertSettings(ctx context.Context, tenantID uuid.UUID, settings map[string]any) error {
	const query = `
        UPDATE tenants
        SET settings = $2,
            updated_at = $3
        WHERE id = $1
    `

	settingsJSON, err := json.Marshal(settings)
	if err != nil {
		return err
	}

	tag, err := r.pool.Exec(ctx, query, tenantID, settingsJSON, time.Now())
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
