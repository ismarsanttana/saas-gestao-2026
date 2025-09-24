ALTER TABLE saas_users
    ADD COLUMN role TEXT NOT NULL DEFAULT 'admin',
    ADD COLUMN last_login_at TIMESTAMPTZ,
    ADD COLUMN invited_at TIMESTAMPTZ,
    ADD COLUMN created_by UUID;

ALTER TABLE saas_users
    ADD CONSTRAINT saas_users_role_check CHECK (role IN ('owner', 'admin', 'support', 'finance'));

ALTER TABLE saas_users
    ADD CONSTRAINT saas_users_created_by_fkey FOREIGN KEY (created_by) REFERENCES saas_users(id) ON DELETE SET NULL;

UPDATE saas_users SET role = 'owner' WHERE role = 'admin' AND email = 'admin@urbanbyte.com.br';
