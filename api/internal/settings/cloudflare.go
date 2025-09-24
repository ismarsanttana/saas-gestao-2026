package settings

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("cloudflare config not found")

type CloudflareConfig struct {
	APIToken       string
	ZoneID         string
	BaseDomain     string
	TargetHostname string
	AccountID      string
	ProxiedDefault bool
	CreatedAt      time.Time
	UpdatedAt      time.Time
	UpdatedBy      *uuid.UUID
}

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (r *Repository) GetCloudflareConfig(ctx context.Context) (*CloudflareConfig, error) {
	const query = `
        SELECT api_token, zone_id, base_domain, target_hostname, account_id, proxied_default, created_at, updated_at, updated_by
        FROM saas_cloudflare_config
        WHERE singleton = TRUE
        LIMIT 1
    `

	row := r.pool.QueryRow(ctx, query)

	var cfg CloudflareConfig
	var updatedBy *uuid.UUID
	if err := row.Scan(
		&cfg.APIToken,
		&cfg.ZoneID,
		&cfg.BaseDomain,
		&cfg.TargetHostname,
		&cfg.AccountID,
		&cfg.ProxiedDefault,
		&cfg.CreatedAt,
		&cfg.UpdatedAt,
		&updatedBy,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	cfg.UpdatedBy = updatedBy
	return &cfg, nil
}

func (r *Repository) SaveCloudflareConfig(ctx context.Context, cfg CloudflareConfig) (*CloudflareConfig, error) {
	const query = `
        INSERT INTO saas_cloudflare_config (singleton, api_token, zone_id, base_domain, target_hostname, account_id, proxied_default, updated_by)
        VALUES (TRUE, $1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (singleton)
        DO UPDATE SET
            api_token = EXCLUDED.api_token,
            zone_id = EXCLUDED.zone_id,
            base_domain = EXCLUDED.base_domain,
            target_hostname = EXCLUDED.target_hostname,
            account_id = EXCLUDED.account_id,
            proxied_default = EXCLUDED.proxied_default,
            updated_by = EXCLUDED.updated_by
        RETURNING api_token, zone_id, base_domain, target_hostname, account_id, proxied_default, created_at, updated_at, updated_by
    `

	row := r.pool.QueryRow(ctx, query,
		strings.TrimSpace(cfg.APIToken),
		strings.TrimSpace(cfg.ZoneID),
		strings.TrimSpace(cfg.BaseDomain),
		strings.TrimSpace(cfg.TargetHostname),
		strings.TrimSpace(cfg.AccountID),
		cfg.ProxiedDefault,
		cfg.UpdatedBy,
	)

	var updated CloudflareConfig
	var updatedBy *uuid.UUID
	if err := row.Scan(
		&updated.APIToken,
		&updated.ZoneID,
		&updated.BaseDomain,
		&updated.TargetHostname,
		&updated.AccountID,
		&updated.ProxiedDefault,
		&updated.CreatedAt,
		&updated.UpdatedAt,
		&updatedBy,
	); err != nil {
		return nil, err
	}

	updated.UpdatedBy = updatedBy
	return &updated, nil
}

type Service struct {
	repo *Repository
}

type UpdateCloudflareConfigInput struct {
	APIToken       *string
	ZoneID         *string
	BaseDomain     *string
	TargetHostname *string
	AccountID      *string
	ProxiedDefault *bool
	UpdatedBy      uuid.UUID
}

type SanitizedCloudflareConfig struct {
	ZoneID         string     `json:"zone_id"`
	BaseDomain     string     `json:"base_domain"`
	TargetHostname string     `json:"target_hostname"`
	AccountID      string     `json:"account_id"`
	ProxiedDefault bool       `json:"proxied_default"`
	HasToken       bool       `json:"has_token"`
	UpdatedAt      time.Time  `json:"updated_at"`
	UpdatedBy      *uuid.UUID `json:"updated_by"`
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) GetCloudflareConfig(ctx context.Context) (*CloudflareConfig, error) {
	cfg, err := s.repo.GetCloudflareConfig(ctx)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return cfg, nil
}

func (s *Service) GetSanitizedCloudflareConfig(ctx context.Context) (*SanitizedCloudflareConfig, error) {
	cfg, err := s.repo.GetCloudflareConfig(ctx)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return &SanitizedCloudflareConfig{HasToken: false}, nil
		}
		return nil, err
	}

	return &SanitizedCloudflareConfig{
		ZoneID:         cfg.ZoneID,
		BaseDomain:     cfg.BaseDomain,
		TargetHostname: cfg.TargetHostname,
		AccountID:      cfg.AccountID,
		ProxiedDefault: cfg.ProxiedDefault,
		HasToken:       strings.TrimSpace(cfg.APIToken) != "",
		UpdatedAt:      cfg.UpdatedAt,
		UpdatedBy:      cfg.UpdatedBy,
	}, nil
}

func (s *Service) MergeCloudflareConfig(ctx context.Context, input UpdateCloudflareConfigInput) (*CloudflareConfig, error) {
	existing, err := s.repo.GetCloudflareConfig(ctx)
	if err != nil && !errors.Is(err, ErrNotFound) {
		return nil, err
	}

	var cfg CloudflareConfig
	if existing != nil {
		cfg = *existing
	}

	if input.APIToken != nil {
		cfg.APIToken = strings.TrimSpace(*input.APIToken)
	}
	if input.ZoneID != nil {
		cfg.ZoneID = strings.TrimSpace(*input.ZoneID)
	}
	if input.BaseDomain != nil {
		cfg.BaseDomain = normalizeDomain(*input.BaseDomain)
	}
	if input.TargetHostname != nil {
		cfg.TargetHostname = normalizeHostname(*input.TargetHostname)
	}
	if input.AccountID != nil {
		cfg.AccountID = strings.TrimSpace(*input.AccountID)
	}
	if input.ProxiedDefault != nil {
		cfg.ProxiedDefault = *input.ProxiedDefault
	}

	cfg.UpdatedBy = &input.UpdatedBy

	return &cfg, nil
}

func (s *Service) ClearCloudflareToken(ctx context.Context, updatedBy uuid.UUID) (*CloudflareConfig, error) {
	cfg, err := s.repo.GetCloudflareConfig(ctx)
	if err != nil {
		return nil, err
	}
	cfg.APIToken = ""
	cfg.UpdatedBy = &updatedBy
	return s.repo.SaveCloudflareConfig(ctx, *cfg)
}

func (s *Service) SaveCloudflareConfig(ctx context.Context, cfg CloudflareConfig) (*CloudflareConfig, error) {
	return s.repo.SaveCloudflareConfig(ctx, cfg)
}

func (s *Service) UpdateCloudflareConfig(ctx context.Context, input UpdateCloudflareConfigInput) (*CloudflareConfig, error) {
	cfg, err := s.MergeCloudflareConfig(ctx, input)
	if err != nil {
		return nil, err
	}
	return s.repo.SaveCloudflareConfig(ctx, *cfg)
}

func normalizeDomain(value string) string {
	value = strings.TrimSpace(strings.ToLower(value))
	value = strings.TrimSuffix(value, ".")
	return value
}

func normalizeHostname(value string) string {
	value = strings.TrimSpace(strings.ToLower(value))
	value = strings.TrimSuffix(value, ".")
	return value
}

func (cfg *CloudflareConfig) IsComplete() bool {
	return strings.TrimSpace(cfg.APIToken) != "" &&
		strings.TrimSpace(cfg.ZoneID) != "" &&
		strings.TrimSpace(cfg.BaseDomain) != "" &&
		strings.TrimSpace(cfg.TargetHostname) != ""
}
