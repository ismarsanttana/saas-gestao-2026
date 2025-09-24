ALTER TABLE tenants
    DROP CONSTRAINT IF EXISTS tenants_dns_status_check;

ALTER TABLE tenants
    DROP COLUMN IF EXISTS dns_error;
ALTER TABLE tenants
    DROP COLUMN IF EXISTS dns_last_checked_at;
ALTER TABLE tenants
    DROP COLUMN IF EXISTS dns_status;
