ALTER TABLE tenants
    ADD COLUMN status TEXT NOT NULL DEFAULT 'draft',
    ADD COLUMN logo_url TEXT,
    ADD COLUMN notes TEXT,
    ADD COLUMN contact JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN theme JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN created_by UUID,
    ADD COLUMN activated_at TIMESTAMPTZ;

ALTER TABLE tenants
    ADD CONSTRAINT tenants_status_check CHECK (status IN ('draft', 'review', 'active', 'suspended', 'archived'));

ALTER TABLE tenants
    ADD CONSTRAINT tenants_created_by_fkey FOREIGN KEY (created_by) REFERENCES saas_users(id) ON DELETE SET NULL;
