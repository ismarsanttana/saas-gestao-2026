package provision

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/gestaozabele/municipio/internal/cloudflare"
	"github.com/gestaozabele/municipio/internal/tenant"
)

// Service coordena provisionamento de DNS via Cloudflare.
type Service struct {
	tenants *tenant.Service

	mu             sync.RWMutex
	cloudflare     *cloudflare.Client
	baseDomain     string
	targetHost     string
	defaultTTL     int
	defaultProxied bool
}

// Config reúne parâmetros necessários para provisionamento.
type Config struct {
	BaseDomain     string
	TargetHost     string
	TTL            int
	DefaultProxied bool
}

type RuntimeConfig struct {
	Client *cloudflare.Client
	Config Config
}

// New cria um novo serviço de provisionamento (configuração pode ser aplicada depois).
func New(tenants *tenant.Service) *Service {
	return &Service{
		tenants:    tenants,
		defaultTTL: 3600,
	}
}

// Apply atualiza configuração e cliente do Cloudflare.
func (s *Service) Apply(cfg RuntimeConfig) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.cloudflare = cfg.Client
	s.baseDomain = strings.TrimSpace(cfg.Config.BaseDomain)
	s.targetHost = strings.TrimSpace(cfg.Config.TargetHost)
	s.defaultTTL = cfg.Config.TTL
	if s.defaultTTL <= 0 {
		s.defaultTTL = 3600
	}
	s.defaultProxied = cfg.Config.DefaultProxied
}

// IsConfigured indica se há configuração ativa.
func (s *Service) IsConfigured() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return s.cloudflare != nil && s.baseDomain != "" && s.targetHost != ""
}

// DefaultProxied indica se proxied deve ser ligado por padrão.
func (s *Service) DefaultProxied() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return s.defaultProxied
}

func (s *Service) snapshot() (*cloudflare.Client, string, string, int, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	configured := s.cloudflare != nil && s.baseDomain != "" && s.targetHost != ""
	return s.cloudflare, s.baseDomain, s.targetHost, s.defaultTTL, configured
}

// ProvisionTenant garante que o CNAME esteja criado e retorna tenant atualizado.
func (s *Service) ProvisionTenant(ctx context.Context, tenantID uuid.UUID, proxied bool) (*tenant.Tenant, error) {
	client, baseDomain, targetHost, ttl, ok := s.snapshot()
	if !ok {
		return nil, fmt.Errorf("cloudflare não configurado")
	}

	t, err := s.tenants.GetByID(ctx, tenantID)
	if err != nil {
		return nil, err
	}

	fqdn := fmt.Sprintf("%s.%s", t.Slug, baseDomain)
	recordID, err := client.EnsureCNAME(ctx, fqdn, targetHost, proxied, ttl)
	if err != nil {
		now := time.Now()
		msg := err.Error()
		_ = s.tenants.UpdateDNSStatus(ctx, tenantID, tenant.DNSStatusFailed, &now, &msg)
		return nil, err
	}

	_ = recordID // currently unused but kept for future logging

	// Immediately check propagation (non-blocking if fails)
	var status = tenant.DNSStatusConfiguring
	var dnsErr *string
	now := time.Now()
	if ok, checkErr := client.CheckCNAMEPropagation(ctx, fqdn, targetHost); checkErr == nil && ok {
		status = tenant.DNSStatusConfigured
	} else if checkErr != nil {
		message := checkErr.Error()
		dnsErr = &message
	}

	if err := s.tenants.UpdateDNSStatus(ctx, tenantID, status, &now, dnsErr); err != nil {
		return nil, err
	}

	return s.tenants.GetByID(ctx, tenantID)
}

// CheckTenant revalida propagação do CNAME.
func (s *Service) CheckTenant(ctx context.Context, tenantID uuid.UUID) (*tenant.Tenant, error) {
	client, baseDomain, targetHost, _, ok := s.snapshot()
	if !ok {
		return nil, fmt.Errorf("cloudflare não configurado")
	}

	t, err := s.tenants.GetByID(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	fqdn := fmt.Sprintf("%s.%s", t.Slug, baseDomain)
	ok, checkErr := client.CheckCNAMEPropagation(ctx, fqdn, targetHost)
	status := tenant.DNSStatusConfiguring
	if ok {
		status = tenant.DNSStatusConfigured
	}

	var errMsg *string
	if checkErr != nil {
		message := checkErr.Error()
		errMsg = &message
	}

	now := time.Now()
	if err := s.tenants.UpdateDNSStatus(ctx, tenantID, status, &now, errMsg); err != nil {
		return nil, err
	}
	return s.tenants.GetByID(ctx, tenantID)
}
