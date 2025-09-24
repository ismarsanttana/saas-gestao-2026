CREATE TABLE monitor_check_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status_code INTEGER,
    response_ms INTEGER,
    success BOOLEAN NOT NULL,
    error TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_monitor_check_events_tenant_time ON monitor_check_events (tenant_id, occurred_at DESC);
CREATE INDEX idx_monitor_check_events_source_time ON monitor_check_events (source, occurred_at DESC);

CREATE TABLE monitor_health (
    tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    uptime_24h NUMERIC(5,2) NOT NULL DEFAULT 0,
    response_p95_ms INTEGER,
    last_status TEXT,
    last_checked_at TIMESTAMPTZ,
    storage_mb NUMERIC(12,2),
    storage_checked_at TIMESTAMPTZ,
    error_rate_24h NUMERIC(5,2) NOT NULL DEFAULT 0,
    dns_status TEXT,
    notes TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_monitor_health_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_monitor_health_updated_at
BEFORE UPDATE ON monitor_health
FOR EACH ROW EXECUTE FUNCTION set_monitor_health_updated_at();

CREATE TABLE monitor_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    alert_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    message TEXT NOT NULL,
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered BOOLEAN NOT NULL DEFAULT FALSE,
    delivery_channel TEXT,
    delivered_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_monitor_alerts_tenant_time ON monitor_alerts (tenant_id, triggered_at DESC);
