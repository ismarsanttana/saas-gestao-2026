ALTER TABLE tenants
    DROP CONSTRAINT IF EXISTS tenants_created_by_fkey;

ALTER TABLE tenants
    DROP CONSTRAINT IF EXISTS tenants_status_check;

ALTER TABLE tenants
    DROP COLUMN IF EXISTS activated_at;
ALTER TABLE tenants
    DROP COLUMN IF EXISTS created_by;
ALTER TABLE tenants
    DROP COLUMN IF EXISTS theme;
ALTER TABLE tenants
    DROP COLUMN IF EXISTS contact;
ALTER TABLE tenants
    DROP COLUMN IF EXISTS notes;
ALTER TABLE tenants
    DROP COLUMN IF EXISTS logo_url;
ALTER TABLE tenants
    DROP COLUMN IF EXISTS status;
