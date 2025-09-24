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
        SELECT id, slug, display_name, domain, status, dns_status, dns_last_checked_at, dns_error, logo_url, notes, contact, theme, settings, created_by, activated_at, created_at, updated_at
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

// GetByID busca tenant pelo identificador.
func (r *Repository) GetByID(ctx context.Context, id uuid.UUID) (*Tenant, error) {
	const query = `
        SELECT id, slug, display_name, domain, status, dns_status, dns_last_checked_at, dns_error, logo_url, notes, contact, theme, settings, created_by, activated_at, created_at, updated_at
        FROM tenants
        WHERE id = $1
    `

	row := r.pool.QueryRow(ctx, query, id)
	tenant, err := scanTenant(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return tenant, nil
}

// GetBySlug busca tenant pelo slug.
func (r *Repository) GetBySlug(ctx context.Context, slug string) (*Tenant, error) {
	const query = `
        SELECT id, slug, display_name, domain, status, dns_status, dns_last_checked_at, dns_error, logo_url, notes, contact, theme, settings, created_by, activated_at, created_at, updated_at
        FROM tenants
        WHERE slug = $1
    `

	row := r.pool.QueryRow(ctx, query, slug)
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
        SELECT id, slug, display_name, domain, status, dns_status, dns_last_checked_at, dns_error, logo_url, notes, contact, theme, settings, created_by, activated_at, created_at, updated_at
        FROM tenants
        ORDER BY created_at DESC
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
        INSERT INTO tenants (slug, display_name, domain, status, contact, theme, settings, logo_url, notes, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, slug, display_name, domain, status, dns_status, dns_last_checked_at, dns_error, logo_url, notes, contact, theme, settings, created_by, activated_at, created_at, updated_at
    `

	contactJSON, err := jsonMarshalMap(input.Contact)
	if err != nil {
		return nil, err
	}
	themeJSON, err := jsonMarshalMap(input.Theme)
	if err != nil {
		return nil, err
	}
	settingsJSON, err := jsonMarshalMap(input.Settings)
	if err != nil {
		return nil, err
	}

	row := r.pool.QueryRow(ctx, query,
		strings.TrimSpace(strings.ToLower(input.Slug)),
		strings.TrimSpace(input.DisplayName),
		strings.TrimSpace(strings.ToLower(input.Domain)),
		strings.TrimSpace(strings.ToLower(input.Status)),
		contactJSON,
		themeJSON,
		settingsJSON,
		input.LogoURL,
		input.Notes,
		input.CreatedBy,
	)

	return scanTenant(row)
}

// UpdateSettings atualiza apenas o campo settings e o timestamp.
// UpdateDNSStatus atualiza campos de DNS do tenant.
func (r *Repository) UpdateDNSStatus(ctx context.Context, tenantID uuid.UUID, status string, lastChecked *time.Time, dnsErr *string) error {
	const query = `
        UPDATE tenants
        SET dns_status = $2,
            dns_last_checked_at = $3,
            dns_error = $4,
            updated_at = now()
        WHERE id = $1
    `

	tag, err := r.pool.Exec(ctx, query, tenantID, status, lastChecked, dnsErr)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// UpdateSettings atualiza apenas o campo settings e o timestamp.
func (r *Repository) UpdateSettings(ctx context.Context, tenantID uuid.UUID, settings map[string]any) error {
	const query = `
        UPDATE tenants
        SET settings = $2,
            updated_at = $3
        WHERE id = $1
    `

	settingsJSON, err := jsonMarshalMap(settings)
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

func scanTenant(row pgx.Row) (*Tenant, error) {
	var (
		t              Tenant
		dnsLastChecked *time.Time
		dnsError       *string
		logoURL        *string
		notes          *string
		contactRaw     []byte
		themeRaw       []byte
		settingsRaw    []byte
		createdBy      *uuid.UUID
		activatedAt    *time.Time
	)

	if err := row.Scan(&t.ID, &t.Slug, &t.DisplayName, &t.Domain, &t.Status, &t.DNSStatus, &dnsLastChecked, &dnsError, &logoURL, &notes, &contactRaw, &themeRaw, &settingsRaw, &createdBy, &activatedAt, &t.CreatedAt, &t.UpdatedAt); err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, err
	}

	if dnsLastChecked != nil {
		t.DNSLastChecked = dnsLastChecked
	}
	if dnsError != nil {
		t.DNSError = dnsError
	}
	if logoURL != nil {
		t.LogoURL = logoURL
	}
	if notes != nil {
		t.Notes = notes
	}
	if createdBy != nil {
		t.CreatedBy = createdBy
	}
	if activatedAt != nil {
		t.ActivatedAt = activatedAt
	}

	contact, err := decodeJSONMap(contactRaw)
	if err != nil {
		return nil, err
	}
	theme, err := decodeJSONMap(themeRaw)
	if err != nil {
		return nil, err
	}
	settings, err := decodeJSONMap(settingsRaw)
	if err != nil {
		return nil, err
	}

	t.Contact = contact
	t.Theme = theme
	t.Settings = settings

	return &t, nil
}

func decodeJSONMap(raw []byte) (map[string]any, error) {
	if len(raw) == 0 {
		return map[string]any{}, nil
	}
	var result map[string]any
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, err
	}
	if result == nil {
		return map[string]any{}, nil
	}
	return result, nil
}

func jsonMarshalMap(m map[string]any) ([]byte, error) {
	if m == nil {
		return []byte("{}"), nil
	}
	return json.Marshal(m)
}
