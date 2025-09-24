ALTER TABLE tenants
    ADD COLUMN dns_status TEXT NOT NULL DEFAULT 'pending',
    ADD COLUMN dns_last_checked_at TIMESTAMPTZ,
    ADD COLUMN dns_error TEXT;

ALTER TABLE tenants
    ADD CONSTRAINT tenants_dns_status_check CHECK (dns_status IN ('pending', 'configuring', 'configured', 'failed'));
