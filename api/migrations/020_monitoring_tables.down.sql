DROP INDEX IF EXISTS idx_monitor_alerts_tenant_time;
DROP TABLE IF EXISTS monitor_alerts;

DROP TRIGGER IF EXISTS trg_monitor_health_updated_at ON monitor_health;
DROP FUNCTION IF EXISTS set_monitor_health_updated_at();
DROP TABLE IF EXISTS monitor_health;

DROP INDEX IF EXISTS idx_monitor_check_events_source_time;
DROP INDEX IF EXISTS idx_monitor_check_events_tenant_time;
DROP TABLE IF EXISTS monitor_check_events;
