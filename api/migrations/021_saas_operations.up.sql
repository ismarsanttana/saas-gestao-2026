CREATE TABLE saas_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning','discovery','in_progress','blocked','completed')),
    progress NUMERIC(5,2) NOT NULL DEFAULT 0,
    lead_id UUID REFERENCES saas_users(id) ON DELETE SET NULL,
    owner_id UUID REFERENCES saas_users(id) ON DELETE SET NULL,
    started_at DATE,
    target_date DATE,
    created_by UUID REFERENCES saas_users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES saas_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_saas_projects_status ON saas_projects (status);

CREATE TABLE saas_project_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES saas_projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    owner TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','blocked','done')),
    due_date DATE,
    notes TEXT,
    position INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_project_tasks_project ON saas_project_tasks (project_id);
CREATE INDEX idx_project_tasks_status ON saas_project_tasks (status);

CREATE TABLE saas_finance_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    entry_type TEXT NOT NULL CHECK (entry_type IN ('expense','revenue','investment','payroll','subscription')),
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    amount NUMERIC(14,2) NOT NULL,
    due_date DATE,
    paid BOOLEAN NOT NULL DEFAULT FALSE,
    paid_at TIMESTAMPTZ,
    method TEXT,
    cost_center TEXT,
    responsible TEXT,
    notes TEXT,
    attachments_count INT NOT NULL DEFAULT 0,
    created_by UUID REFERENCES saas_users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES saas_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_finance_entries_type ON saas_finance_entries (entry_type);
CREATE INDEX idx_finance_entries_paid ON saas_finance_entries (paid);
CREATE INDEX idx_finance_entries_tenant ON saas_finance_entries (tenant_id);

CREATE TABLE saas_finance_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    finance_entry_id UUID NOT NULL REFERENCES saas_finance_entries(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_url TEXT,
    object_key TEXT,
    uploaded_by UUID REFERENCES saas_users(id) ON DELETE SET NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_finance_attachments_entry ON saas_finance_attachments (finance_entry_id);

CREATE TABLE saas_announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    content TEXT,
    audience TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','published','archived')),
    published_at TIMESTAMPTZ,
    author_id UUID REFERENCES saas_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE saas_push_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('manual','automatic')),
    channel TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','sent','cancelled')),
    subject TEXT NOT NULL,
    body TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    scheduled_for TIMESTAMPTZ,
    created_by UUID REFERENCES saas_users(id) ON DELETE SET NULL,
    decided_by UUID REFERENCES saas_users(id) ON DELETE SET NULL,
    decision_reason TEXT,
    decided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_push_notifications_status ON saas_push_notifications (status);
CREATE INDEX idx_push_notifications_tenant ON saas_push_notifications (tenant_id);

CREATE TABLE saas_retention_cohorts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cohort_month DATE NOT NULL UNIQUE,
    tenants_count INT NOT NULL DEFAULT 0,
    churn_count INT NOT NULL DEFAULT 0,
    expansion_count INT NOT NULL DEFAULT 0,
    nps INT NOT NULL DEFAULT 0,
    engagement_score INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE saas_usage_heatmap (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_name TEXT NOT NULL,
    day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    usage_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_usage_heatmap_module_day ON saas_usage_heatmap (module_name, day_of_week);

CREATE TABLE saas_usage_funnel (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stage TEXT NOT NULL,
    position SMALLINT NOT NULL,
    value INT NOT NULL DEFAULT 0,
    conversion NUMERIC(5,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_usage_funnel_position ON saas_usage_funnel (position);

CREATE TABLE saas_usage_secretariat_rankings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    interactions INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE saas_city_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
    population INT NOT NULL DEFAULT 0,
    active_users INT NOT NULL DEFAULT 0,
    requests_total INT NOT NULL DEFAULT 0,
    satisfaction NUMERIC(5,2) NOT NULL DEFAULT 0,
    last_sync TIMESTAMPTZ,
    highlights TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE saas_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    user_name TEXT NOT NULL,
    email TEXT,
    role TEXT,
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    logged_at TIMESTAMPTZ NOT NULL,
    ip_address TEXT,
    location TEXT,
    user_agent TEXT,
    status TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_access_logs_logged_at ON saas_access_logs (logged_at DESC);
CREATE INDEX idx_access_logs_tenant ON saas_access_logs (tenant_id);
CREATE INDEX idx_access_logs_role ON saas_access_logs (role);

CREATE TABLE saas_tenant_contracts (
    tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','suspended','terminated','renewal')),
    contract_value NUMERIC(14,2),
    start_date DATE,
    renewal_date DATE,
    notes TEXT,
    contract_file_url TEXT,
    contract_file_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID REFERENCES saas_users(id) ON DELETE SET NULL
);

CREATE TABLE saas_tenant_contract_modules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    module_code TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID REFERENCES saas_users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX idx_contract_modules_unique ON saas_tenant_contract_modules (tenant_id, module_code);

CREATE TABLE saas_tenant_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    reference_month DATE NOT NULL,
    amount NUMERIC(14,2),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','overdue')),
    file_url TEXT,
    file_key TEXT,
    notes TEXT,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    uploaded_by UUID REFERENCES saas_users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX idx_tenant_invoices_reference ON saas_tenant_invoices (tenant_id, reference_month);

CREATE TABLE saas_app_customizations (
    tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    logo_url TEXT,
    logo_key TEXT,
    primary_color TEXT NOT NULL DEFAULT '#06AA48',
    secondary_color TEXT NOT NULL DEFAULT '#0F172A',
    weather_provider TEXT,
    weather_api_key TEXT,
    welcome_message TEXT,
    enable_push BOOLEAN NOT NULL DEFAULT TRUE,
    enable_weather BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID REFERENCES saas_users(id) ON DELETE SET NULL
);

CREATE TABLE saas_compliance_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    actor TEXT,
    action TEXT NOT NULL,
    performed_at TIMESTAMPTZ NOT NULL,
    channel TEXT,
    sla_breach BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_compliance_audits_tenant ON saas_compliance_audits (tenant_id);

CREATE TABLE saas_compliance_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    period TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_progress','delivered','overdue')),
    url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_compliance_reports_tenant ON saas_compliance_reports (tenant_id);

CREATE TRIGGER trg_saas_projects_touch
    BEFORE UPDATE ON saas_projects
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER trg_saas_project_tasks_touch
    BEFORE UPDATE ON saas_project_tasks
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER trg_saas_finance_entries_touch
    BEFORE UPDATE ON saas_finance_entries
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER trg_saas_announcements_touch
    BEFORE UPDATE ON saas_announcements
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER trg_saas_push_notifications_touch
    BEFORE UPDATE ON saas_push_notifications
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER trg_saas_city_insights_touch
    BEFORE UPDATE ON saas_city_insights
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER trg_saas_tenant_contracts_touch
    BEFORE UPDATE ON saas_tenant_contracts
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER trg_saas_tenant_contract_modules_touch
    BEFORE UPDATE ON saas_tenant_contract_modules
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER trg_saas_app_customizations_touch
    BEFORE UPDATE ON saas_app_customizations
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER trg_saas_compliance_reports_touch
    BEFORE UPDATE ON saas_compliance_reports
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

CREATE OR REPLACE FUNCTION update_finance_attachments_counter() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE saas_finance_entries
            SET attachments_count = attachments_count + 1,
                updated_at = now()
        WHERE id = NEW.finance_entry_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE saas_finance_entries
            SET attachments_count = GREATEST(attachments_count - 1, 0),
                updated_at = now()
        WHERE id = OLD.finance_entry_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_finance_attachments_counter
    AFTER INSERT OR DELETE ON saas_finance_attachments
    FOR EACH ROW
    EXECUTE FUNCTION update_finance_attachments_counter();
