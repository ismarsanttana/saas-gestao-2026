ALTER TABLE tokens_refresh
    DROP CONSTRAINT IF EXISTS tokens_refresh_audience_check;
ALTER TABLE tokens_refresh
    ADD CONSTRAINT tokens_refresh_audience_check
    CHECK (audience IN ('backoffice', 'cidadao'));
