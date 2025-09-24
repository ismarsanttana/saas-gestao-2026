CREATE TABLE saas_cloudflare_config (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE,
    api_token TEXT,
    zone_id TEXT,
    base_domain TEXT,
    target_hostname TEXT,
    account_id TEXT,
    proxied_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES saas_users(id),
    CHECK (singleton)
);

CREATE OR REPLACE FUNCTION set_saas_cloudflare_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_saas_cloudflare_config_updated_at
BEFORE UPDATE ON saas_cloudflare_config
FOR EACH ROW EXECUTE FUNCTION set_saas_cloudflare_config_updated_at();
