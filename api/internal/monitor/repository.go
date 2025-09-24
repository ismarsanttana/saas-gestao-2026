package monitor

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNoData = errors.New("monitor: no data")

// Repository encapsula interações com tabelas de monitoramento.
type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

type CheckEvent struct {
	TenantID   uuid.UUID
	Source     string
	OccurredAt time.Time
	StatusCode *int
	ResponseMS *int
	Success    bool
	Error      *string
	Metadata   map[string]any
}

func (r *Repository) InsertCheckEvent(ctx context.Context, event CheckEvent) error {
	const query = `
        INSERT INTO monitor_check_events (tenant_id, source, occurred_at, status_code, response_ms, success, error, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::jsonb, '{}'::jsonb))
    `

	var statusCode any
	if event.StatusCode != nil {
		statusCode = *event.StatusCode
	}

	var responseMS any
	if event.ResponseMS != nil {
		responseMS = *event.ResponseMS
	}

	var errVal any
	if event.Error != nil {
		errVal = *event.Error
	}

	var metadata any
	if event.Metadata != nil {
		metadata = event.Metadata
	}

	_, err := r.pool.Exec(ctx, query,
		event.TenantID,
		event.Source,
		event.OccurredAt,
		statusCode,
		responseMS,
		event.Success,
		errVal,
		metadata,
	)
	return err
}

type Aggregates struct {
	Total       int
	Success     int
	P95Response *int
	LastStatus  *string
	LastChecked *time.Time
}

func (r *Repository) AggregatesSince(ctx context.Context, tenantID uuid.UUID, source string, since time.Time) (*Aggregates, error) {
	const summaryQuery = `
        SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE success)::int AS success,
            (SELECT CAST(percentile_cont(0.95) WITHIN GROUP (ORDER BY response_ms) AS int)
             FROM monitor_check_events
             WHERE tenant_id = $1 AND source = $2 AND occurred_at >= $3 AND response_ms IS NOT NULL) AS p95_response
        FROM monitor_check_events
        WHERE tenant_id = $1
          AND source = $2
          AND occurred_at >= $3
    `

	var agg Aggregates
	if err := r.pool.QueryRow(ctx, summaryQuery, tenantID, source, since).Scan(&agg.Total, &agg.Success, &agg.P95Response); err != nil {
		return nil, err
	}

	const lastQuery = `
        SELECT status_code, occurred_at
        FROM monitor_check_events
        WHERE tenant_id = $1 AND source = $2
        ORDER BY occurred_at DESC
        LIMIT 1
    `

	var statusCode *int
	var occurredAt *time.Time
	if err := r.pool.QueryRow(ctx, lastQuery, tenantID, source).Scan(&statusCode, &occurredAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return &agg, nil
		}
		return nil, err
	}

	if statusCode != nil {
		value := toStatusLabel(*statusCode)
		agg.LastStatus = &value
	}
	agg.LastChecked = occurredAt
	return &agg, nil
}

type Health struct {
	TenantID       uuid.UUID
	Uptime24h      float64
	ResponseP95MS  *int
	LastStatus     *string
	LastCheckedAt  *time.Time
	StorageMB      *float64
	StorageChecked *time.Time
	ErrorRate24h   float64
	DNSStatus      *string
	Notes          *string
	UpdatedAt      time.Time
}

func (r *Repository) UpsertHealth(ctx context.Context, health Health) error {
	const query = `
        INSERT INTO monitor_health (tenant_id, uptime_24h, response_p95_ms, last_status, last_checked_at, storage_mb, storage_checked_at, error_rate_24h, dns_status, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (tenant_id) DO UPDATE SET
            uptime_24h = EXCLUDED.uptime_24h,
            response_p95_ms = EXCLUDED.response_p95_ms,
            last_status = EXCLUDED.last_status,
            last_checked_at = EXCLUDED.last_checked_at,
            storage_mb = EXCLUDED.storage_mb,
            storage_checked_at = EXCLUDED.storage_checked_at,
            error_rate_24h = EXCLUDED.error_rate_24h,
            dns_status = EXCLUDED.dns_status,
            notes = EXCLUDED.notes
    `

	_, err := r.pool.Exec(ctx, query,
		health.TenantID,
		health.Uptime24h,
		health.ResponseP95MS,
		health.LastStatus,
		health.LastCheckedAt,
		health.StorageMB,
		health.StorageChecked,
		health.ErrorRate24h,
		health.DNSStatus,
		health.Notes,
	)
	return err
}

func (r *Repository) GetHealth(ctx context.Context, tenantID uuid.UUID) (*Health, error) {
	const query = `
        SELECT tenant_id, uptime_24h, response_p95_ms, last_status, last_checked_at, storage_mb, storage_checked_at, error_rate_24h, dns_status, notes, updated_at
        FROM monitor_health
        WHERE tenant_id = $1
    `

	var h Health
	if err := r.pool.QueryRow(ctx, query, tenantID).Scan(
		&h.TenantID,
		&h.Uptime24h,
		&h.ResponseP95MS,
		&h.LastStatus,
		&h.LastCheckedAt,
		&h.StorageMB,
		&h.StorageChecked,
		&h.ErrorRate24h,
		&h.DNSStatus,
		&h.Notes,
		&h.UpdatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNoData
		}
		return nil, err
	}
	return &h, nil
}

type HealthRow struct {
	Health
	TenantSlug   string
	TenantName   string
	TenantDomain string
}

func (r *Repository) ListHealth(ctx context.Context) ([]HealthRow, error) {
	const query = `
        SELECT h.tenant_id, t.slug, t.display_name, t.domain,
               h.uptime_24h, h.response_p95_ms, h.last_status, h.last_checked_at,
               h.storage_mb, h.storage_checked_at, h.error_rate_24h, h.dns_status,
               h.notes, h.updated_at
        FROM monitor_health h
        JOIN tenants t ON t.id = h.tenant_id
        ORDER BY h.updated_at DESC
    `

	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []HealthRow
	for rows.Next() {
		var row HealthRow
		if err := rows.Scan(
			&row.TenantID,
			&row.TenantSlug,
			&row.TenantName,
			&row.TenantDomain,
			&row.Uptime24h,
			&row.ResponseP95MS,
			&row.LastStatus,
			&row.LastCheckedAt,
			&row.StorageMB,
			&row.StorageChecked,
			&row.ErrorRate24h,
			&row.DNSStatus,
			&row.Notes,
			&row.UpdatedAt,
		); err != nil {
			return nil, err
		}
		result = append(result, row)
	}

	if rows.Err() != nil {
		return nil, rows.Err()
	}

	return result, nil
}

type Alert struct {
	ID              uuid.UUID
	TenantID        *uuid.UUID
	AlertType       string
	Severity        string
	Message         string
	TriggeredAt     time.Time
	Delivered       bool
	DeliveryChannel *string
	DeliveredAt     *time.Time
	Metadata        map[string]any
}

func (r *Repository) InsertAlert(ctx context.Context, alert Alert) error {
	const query = `
        INSERT INTO monitor_alerts (id, tenant_id, alert_type, severity, message, triggered_at, delivered, delivery_channel, delivered_at, metadata)
        VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10::jsonb, '{}'::jsonb))
    `

	_, err := r.pool.Exec(ctx, query,
		alert.ID,
		alert.TenantID,
		alert.AlertType,
		alert.Severity,
		alert.Message,
		alert.TriggeredAt,
		alert.Delivered,
		alert.DeliveryChannel,
		alert.DeliveredAt,
		alert.Metadata,
	)
	return err
}

func (r *Repository) MarkAlertDelivered(ctx context.Context, id uuid.UUID, channel string) error {
	const query = `
        UPDATE monitor_alerts
        SET delivered = TRUE,
            delivery_channel = $2,
            delivered_at = now()
        WHERE id = $1
    `

	_, err := r.pool.Exec(ctx, query, id, channel)
	return err
}

func (r *Repository) RecentAlerts(ctx context.Context, limit int) ([]Alert, error) {
	if limit <= 0 {
		limit = 20
	}

	const query = `
        SELECT id, tenant_id, alert_type, severity, message, triggered_at, delivered, delivery_channel, delivered_at, metadata
        FROM monitor_alerts
        ORDER BY triggered_at DESC
        LIMIT $1
    `

	rows, err := r.pool.Query(ctx, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var alerts []Alert
	for rows.Next() {
		var alert Alert
		var metadata map[string]any
		if err := rows.Scan(
			&alert.ID,
			&alert.TenantID,
			&alert.AlertType,
			&alert.Severity,
			&alert.Message,
			&alert.TriggeredAt,
			&alert.Delivered,
			&alert.DeliveryChannel,
			&alert.DeliveredAt,
			&metadata,
		); err != nil {
			return nil, err
		}
		alert.Metadata = metadata
		alerts = append(alerts, alert)
	}
	if rows.Err() != nil {
		return nil, rows.Err()
	}

	return alerts, nil
}

func (r *Repository) LastAlertSince(ctx context.Context, tenantID *uuid.UUID, alertType string, since time.Time) (*Alert, error) {
	const query = `
        SELECT id, tenant_id, alert_type, severity, message, triggered_at, delivered, delivery_channel, delivered_at, metadata
        FROM monitor_alerts
        WHERE alert_type = $1
          AND triggered_at >= $2
          AND ($3::uuid IS NULL OR tenant_id = $3)
        ORDER BY triggered_at DESC
        LIMIT 1
    `

	var alert Alert
	var metadata map[string]any
	err := r.pool.QueryRow(ctx, query, alertType, since, tenantID).Scan(
		&alert.ID,
		&alert.TenantID,
		&alert.AlertType,
		&alert.Severity,
		&alert.Message,
		&alert.TriggeredAt,
		&alert.Delivered,
		&alert.DeliveryChannel,
		&alert.DeliveredAt,
		&metadata,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNoData
		}
		return nil, err
	}
	alert.Metadata = metadata
	return &alert, nil
}

func toStatusLabel(code int) string {
	if code >= 200 && code < 300 {
		return "ok"
	}
	if code >= 500 {
		return "error"
	}
	return "warning"
}
