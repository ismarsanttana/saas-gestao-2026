package tenant

import (
	"context"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

// Service contém as regras de negócio para resolução e cadastro de tenants.
type Service struct {
	repo     *Repository
	cache    sync.Map
	cacheTTL time.Duration
}

// cachedTenant armazena dados no cache em memória.
type cachedTenant struct {
	tenant   Tenant
	expireAt time.Time
}

// NewService cria uma nova instância de Service.
func NewService(repo *Repository) *Service {
	return &Service{repo: repo, cacheTTL: 2 * time.Minute}
}

// Resolve encontra tenant pelo host informado.
func (s *Service) Resolve(ctx context.Context, host string) (*Tenant, error) {
	normalized := normalizeDomain(host)
	if normalized == "" {
		return nil, ErrNotFound
	}

	if v, ok := s.cache.Load(normalized); ok {
		entry := v.(cachedTenant)
		if time.Now().Before(entry.expireAt) {
			tenantCopy := entry.tenant
			return &tenantCopy, nil
		}
		s.cache.Delete(normalized)
	}

	tenant, err := s.repo.GetByDomain(ctx, normalized)
	if err != nil {
		return nil, err
	}

	s.cache.Store(normalized, cachedTenant{tenant: *tenant, expireAt: time.Now().Add(s.cacheTTL)})

	tenantCopy := *tenant
	return &tenantCopy, nil
}

// Create registra um novo tenant.
func (s *Service) Create(ctx context.Context, input CreateTenantInput) (*Tenant, error) {
	input.Slug = normalizeSlug(input.Slug)
	input.Domain = normalizeDomain(input.Domain)
	input.Status = NormalizeStatus(input.Status)

	if !IsValidStatus(input.Status) {
		return nil, ErrInvalidStatus
	}
	if input.Contact == nil {
		input.Contact = map[string]any{}
	}
	if input.Theme == nil {
		input.Theme = map[string]any{}
	}
	if input.Settings == nil {
		input.Settings = map[string]any{}
	}

	tenant, err := s.repo.Create(ctx, input)
	if err != nil {
		return nil, err
	}

	s.cache.Store(tenant.Domain, cachedTenant{tenant: *tenant, expireAt: time.Now().Add(s.cacheTTL)})
	return tenant, nil
}

// GetByID retorna tenant pelo identificador.
// GetBySlug retorna tenant pelo slug normalizado.
func (s *Service) GetBySlug(ctx context.Context, slug string) (*Tenant, error) {
	slug = normalizeSlug(slug)
	tenant, err := s.repo.GetBySlug(ctx, slug)
	if err != nil {
		return nil, err
	}
	s.cache.Store(tenant.Domain, cachedTenant{tenant: *tenant, expireAt: time.Now().Add(s.cacheTTL)})
	tenantCopy := *tenant
	return &tenantCopy, nil
}

func (s *Service) GetByID(ctx context.Context, id uuid.UUID) (*Tenant, error) {
	tenant, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	s.cache.Store(tenant.Domain, cachedTenant{tenant: *tenant, expireAt: time.Now().Add(s.cacheTTL)})
	tenantCopy := *tenant
	return &tenantCopy, nil
}

// UpdateDNSStatus atualiza informações de DNS e limpa cache relacionado.
func (s *Service) UpdateDNSStatus(ctx context.Context, tenantID uuid.UUID, status string, lastChecked *time.Time, errMsg *string) error {
	status = NormalizeDNSStatus(status)
	if !IsValidDNSStatus(status) {
		return ErrInvalidDNS
	}
	if err := s.repo.UpdateDNSStatus(ctx, tenantID, status, lastChecked, errMsg); err != nil {
		return err
	}
	s.cache.Range(func(key, value any) bool {
		entry := value.(cachedTenant)
		if entry.tenant.ID == tenantID {
			s.cache.Delete(key)
			return false
		}
		return true
	})
	return nil
}

// UpdateSettings substitui o JSON de configuração do tenant.
func (s *Service) UpdateSettings(ctx context.Context, tenantID string, settings map[string]any) error {
	id, err := uuid.Parse(strings.TrimSpace(tenantID))
	if err != nil {
		return err
	}
	if settings == nil {
		settings = map[string]any{}
	}

	if err := s.repo.UpdateSettings(ctx, id, settings); err != nil {
		return err
	}

	// Limpa cache forçando refetch na próxima resolução.
	s.cache.Range(func(key, value any) bool {
		entry := value.(cachedTenant)
		if entry.tenant.ID == id {
			s.cache.Delete(key)
			return false
		}
		return true
	})

	return nil
}

// List devolve todos os tenants.
func (s *Service) List(ctx context.Context) ([]Tenant, error) {
	tenants, err := s.repo.List(ctx)
	if err != nil {
		return nil, err
	}

	// Atualiza cache com o snapshot atual.
	for _, tenant := range tenants {
		s.cache.Store(tenant.Domain, cachedTenant{tenant: tenant, expireAt: time.Now().Add(s.cacheTTL)})
	}

	return tenants, nil
}

func normalizeDomain(domain string) string {
	domain = strings.TrimSpace(strings.ToLower(domain))
	domain = strings.TrimSuffix(domain, ".")
	if idx := strings.Index(domain, ":"); idx != -1 {
		domain = domain[:idx]
	}
	return domain
}

func normalizeSlug(slug string) string {
	slug = strings.TrimSpace(strings.ToLower(slug))
	slug = strings.ReplaceAll(slug, " ", "-")
	return slug
}
