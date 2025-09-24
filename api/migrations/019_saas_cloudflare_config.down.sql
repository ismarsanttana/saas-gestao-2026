DROP TRIGGER IF EXISTS trg_saas_cloudflare_config_updated_at ON saas_cloudflare_config;
DROP FUNCTION IF EXISTS set_saas_cloudflare_config_updated_at();
DROP TABLE IF EXISTS saas_cloudflare_config;
