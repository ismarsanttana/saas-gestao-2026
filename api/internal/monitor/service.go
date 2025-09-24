package monitor

import (
	"context"
	"fmt"
	"math"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog"

	"github.com/gestaozabele/municipio/internal/config"
	"github.com/gestaozabele/municipio/internal/tenant"
)

// Service executa verificações periódicas e expõe dados consolidados.
type Service struct {
	repo     *Repository
	tenants  *tenant.Service
	cfg      config.MonitoringConfig
	client   *http.Client
	notifier Notifier
	logger   zerolog.Logger

	once     sync.Once
	startErr error
	cancel   context.CancelFunc
}

func NewService(repo *Repository, tenants *tenant.Service, cfg config.MonitoringConfig, logger zerolog.Logger, notifier Notifier) *Service {
	timeout := cfg.RequestTimeout
	if timeout <= 0 {
		timeout = 10 * time.Second
	}
	httpClient := &http.Client{Timeout: timeout}
	return &Service{
		repo:     repo,
		tenants:  tenants,
		cfg:      cfg,
		client:   httpClient,
		notifier: notifier,
		logger:   logger,
	}
}

// Start inicia loop periódico. Safe para chamar múltiplas vezes.
func (s *Service) Start(parent context.Context) error {
	if !s.cfg.Enabled {
		return nil
	}
	s.once.Do(func() {
		ctx, cancel := context.WithCancel(parent)
		s.cancel = cancel
		go s.runLoop(ctx)
	})
	return s.startErr
}

// Stop encerra loop periódico.
func (s *Service) Stop() {
	if s.cancel != nil {
		s.cancel()
	}
}

func (s *Service) runLoop(ctx context.Context) {
	interval := s.cfg.Interval
	if interval <= 0 {
		interval = 5 * time.Minute
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	s.logger.Info().Dur("interval", interval).Msg("monitor: loop iniciado")

	if err := s.RunOnce(ctx); err != nil {
		s.logger.Error().Err(err).Msg("monitor: primeira execução falhou")
	}

	for {
		select {
		case <-ctx.Done():
			s.logger.Info().Msg("monitor: loop encerrado")
			return
		case <-ticker.C:
			if err := s.RunOnce(ctx); err != nil {
				s.logger.Error().Err(err).Msg("monitor: execução periódica falhou")
			}
		}
	}
}

// RunOnce coleta métricas e atualiza snapshots.
func (s *Service) RunOnce(ctx context.Context) error {
	tenants, err := s.tenants.List(ctx)
	if err != nil {
		return fmt.Errorf("listar tenants: %w", err)
	}

	for _, t := range tenants {
		if err := s.checkTenant(ctx, &t); err != nil {
			s.logger.Warn().Err(err).Str("tenant", t.Slug).Msg("monitor: check falhou")
		}
	}

	return nil
}

func (s *Service) checkTenant(ctx context.Context, t *tenant.Tenant) error {
	readyURL := fmt.Sprintf("https://%s/ready", t.Domain)
	if t.Domain == "" {
		return fmt.Errorf("tenant sem domínio")
	}

	requestCtx, cancel := context.WithTimeout(ctx, s.client.Timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(requestCtx, http.MethodGet, readyURL, nil)
	if err != nil {
		return err
	}

	start := time.Now()
	resp, err := s.client.Do(req)
	duration := time.Since(start)

	var statusCode *int
	var responseMS *int
	var success bool
	var errorMsg *string

	if err != nil {
		msg := err.Error()
		errorMsg = &msg
		success = false
	} else {
		defer resp.Body.Close()
		code := resp.StatusCode
		statusCode = &code
		ms := int(duration.Milliseconds())
		responseMS = &ms
		success = code >= 200 && code < 400
	}

	event := CheckEvent{
		TenantID:   t.ID,
		Source:     "ready",
		OccurredAt: time.Now(),
		StatusCode: statusCode,
		ResponseMS: responseMS,
		Success:    success,
		Error:      errorMsg,
	}

	if err := s.repo.InsertCheckEvent(ctx, event); err != nil {
		return fmt.Errorf("salvar evento: %w", err)
	}

	since := time.Now().Add(-24 * time.Hour)
	agg, err := s.repo.AggregatesSince(ctx, t.ID, "ready", since)
	if err != nil {
		return fmt.Errorf("aggregates: %w", err)
	}

	uptime := 0.0
	errRate := 0.0
	if agg.Total > 0 {
		uptime = float64(agg.Success) / float64(agg.Total)
		errRate = 1 - uptime
	}

	var p95 *int
	if agg.P95Response != nil {
		p95 = agg.P95Response
	}

	lastStatus := agg.LastStatus
	lastChecked := agg.LastChecked
	dnsStatus := &t.DNSStatus

	health := Health{
		TenantID:      t.ID,
		Uptime24h:     round2(uptime * 100),
		ResponseP95MS: p95,
		LastStatus:    lastStatus,
		LastCheckedAt: lastChecked,
		ErrorRate24h:  round2(errRate * 100),
		DNSStatus:     dnsStatus,
	}

	if err := s.repo.UpsertHealth(ctx, health); err != nil {
		return fmt.Errorf("upsert health: %w", err)
	}

	s.evaluateAlerts(ctx, t, health, responseMS, errRate)

	return nil
}

func (s *Service) evaluateAlerts(ctx context.Context, t *tenant.Tenant, health Health, latestResponse *int, errRate float64) {
	if !s.cfg.Enabled {
		return
	}

	now := time.Now()
	const alertTypeLatency = "latency"
	const alertTypeErrors = "error_rate"

	var alerts []struct {
		alertType string
		severity  string
		message   string
		threshold time.Duration
		rate      float64
	}

	if latestResponse != nil {
		latency := time.Duration(*latestResponse) * time.Millisecond
		if s.cfg.LatencyCritical > 0 && latency > s.cfg.LatencyCritical {
			alerts = append(alerts, struct {
				alertType string
				severity  string
				message   string
				threshold time.Duration
				rate      float64
			}{alertTypeLatency, "critical", fmt.Sprintf("Resposta %s acima do limite (%s)", latency, s.cfg.LatencyCritical), s.cfg.LatencyCritical, 0})
		} else if s.cfg.LatencyWarning > 0 && latency > s.cfg.LatencyWarning {
			alerts = append(alerts, struct {
				alertType string
				severity  string
				message   string
				threshold time.Duration
				rate      float64
			}{alertTypeLatency, "warning", fmt.Sprintf("Resposta %s acima do limite (%s)", latency, s.cfg.LatencyWarning), s.cfg.LatencyWarning, 0})
		}
	}

	if s.cfg.ErrorRateCrit > 0 && errRate >= s.cfg.ErrorRateCrit {
		alerts = append(alerts, struct {
			alertType string
			severity  string
			message   string
			threshold time.Duration
			rate      float64
		}{alertTypeErrors, "critical", fmt.Sprintf("Taxa de erro %.0f%% acima do limite crítico %.0f%%", errRate*100, s.cfg.ErrorRateCrit*100), 0, errRate})
	} else if s.cfg.ErrorRateWarn > 0 && errRate >= s.cfg.ErrorRateWarn {
		alerts = append(alerts, struct {
			alertType string
			severity  string
			message   string
			threshold time.Duration
			rate      float64
		}{alertTypeErrors, "warning", fmt.Sprintf("Taxa de erro %.0f%% acima do limite %.0f%%", errRate*100, s.cfg.ErrorRateWarn*100), 0, errRate})
	}

	for _, candidate := range alerts {
		if s.shouldThrottleAlert(ctx, &t.ID, candidate.alertType, now) {
			continue
		}
		alert := Alert{
			TenantID:    &t.ID,
			AlertType:   candidate.alertType,
			Severity:    candidate.severity,
			Message:     candidate.message,
			TriggeredAt: now,
		}
		if err := s.repo.InsertAlert(ctx, alert); err != nil {
			s.logger.Error().Err(err).Str("tenant", t.Slug).Msg("monitor: falha ao registrar alerta")
			continue
		}

		if s.notifier != nil {
			title := fmt.Sprintf("Tenant %s (%s)", t.DisplayName, t.Slug)
			msg := AlertMessage{Title: title, Text: candidate.message, Severity: candidate.severity}
			if err := s.notifier.Notify(ctx, msg); err != nil {
				s.logger.Error().Err(err).Str("tenant", t.Slug).Msg("monitor: falha ao enviar alerta")
				continue
			}
			if err := s.repo.MarkAlertDelivered(ctx, alert.ID, "slack"); err != nil {
				s.logger.Error().Err(err).Msg("monitor: falha ao marcar alerta entregue")
			}
		}
	}
}

func (s *Service) shouldThrottleAlert(ctx context.Context, tenantID *uuid.UUID, alertType string, now time.Time) bool {
	window := now.Add(-30 * time.Minute)
	if _, err := s.repo.LastAlertSince(ctx, tenantID, alertType, window); err == nil {
		return true
	}
	return false
}

// Summary agrupa métricas para exibição no dashboard.
type Summary struct {
	TenantID      uuid.UUID  `json:"tenant_id"`
	Slug          string     `json:"slug"`
	Name          string     `json:"name"`
	Domain        string     `json:"domain"`
	Uptime24h     float64    `json:"uptime_24h"`
	ResponseP95MS *int       `json:"response_p95_ms"`
	LastStatus    *string    `json:"last_status"`
	LastCheckedAt *time.Time `json:"last_checked_at"`
	ErrorRate24h  float64    `json:"error_rate_24h"`
	DNSStatus     *string    `json:"dns_status"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

func (s *Service) Summaries(ctx context.Context) ([]Summary, error) {
	rows, err := s.repo.ListHealth(ctx)
	if err != nil {
		return nil, err
	}

	summaries := make([]Summary, 0, len(rows))
	for _, row := range rows {
		summaries = append(summaries, Summary{
			TenantID:      row.TenantID,
			Slug:          row.TenantSlug,
			Name:          row.TenantName,
			Domain:        row.TenantDomain,
			Uptime24h:     row.Uptime24h,
			ResponseP95MS: row.ResponseP95MS,
			LastStatus:    row.LastStatus,
			LastCheckedAt: row.LastCheckedAt,
			ErrorRate24h:  row.ErrorRate24h,
			DNSStatus:     row.DNSStatus,
			UpdatedAt:     row.UpdatedAt,
		})
	}
	return summaries, nil
}

func (s *Service) TenantHealth(ctx context.Context, tenantID uuid.UUID) (*Health, error) {
	return s.repo.GetHealth(ctx, tenantID)
}

func (s *Service) Alerts(ctx context.Context, limit int) ([]Alert, error) {
	return s.repo.RecentAlerts(ctx, limit)
}

func round2(value float64) float64 {
	return math.Round(value*100) / 100
}
