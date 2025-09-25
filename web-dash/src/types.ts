export type Tenant = {
  id: string;
  slug: string;
  display_name: string;
  domain: string;
  status: string;
  dns_status: string;
  dns_last_checked_at?: string | null;
  dns_error?: string | null;
  logo_url?: string | null;
  notes?: string | null;
  contact: Record<string, unknown>;
  theme: Record<string, unknown>;
  settings: Record<string, unknown>;
  created_by?: string | null;
  activated_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type SaaSUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  invited_at?: string | null;
  last_login_at?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
};

export type SaaSInvite = {
  id: string;
  email: string;
  name: string;
  role: string;
  expires_at: string;
  created_at: string;
  created_by?: string | null;
  accepted_at?: string | null;
};

export type SupportTicket = {
  id: string;
  tenant_id: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  description: string;
  tags: string[];
  created_by?: string | null;
  assigned_to?: string | null;
  created_at: string;
  updated_at: string;
  closed_at?: string | null;
};

export type SupportMessage = {
  id: string;
  ticket_id: string;
  author_type: string;
  author_id?: string | null;
  body: string;
  created_at: string;
};

export type SupportTicketInput = {
  tenant_id: string;
  subject: string;
  category: string;
  description: string;
  priority?: string;
  status?: string;
  tags?: string[];
  assigned_to?: string | null;
};

export type TenantImportResult = {
  line: number;
  slug: string;
  success: boolean;
  error?: string;
  tenant?: Tenant;
};

export type TenantImportResponse = {
  dry_run: boolean;
  created: number;
  results: TenantImportResult[];
};

export type CloudflareConfig = {
  zone_id?: string;
  base_domain?: string;
  target_hostname?: string;
  account_id?: string;
  proxied_default: boolean;
  has_token: boolean;
  updated_at?: string;
  updated_by?: string | null;
};

export type CloudflareSettingsResponse = {
  config: CloudflareConfig;
  configured: boolean;
};

export type MonitorSummary = {
  tenant_id: string;
  slug: string;
  name: string;
  domain: string;
  uptime_24h: number;
  response_p95_ms?: number | null;
  last_status?: string | null;
  last_checked_at?: string | null;
  error_rate_24h: number;
  dns_status?: string | null;
  updated_at: string;
};

export type MonitorAlert = {
  id: string;
  tenant_id?: string | null;
  alert_type: string;
  severity: string;
  message: string;
  triggered_at: string;
  delivered: boolean;
  delivery_channel?: string | null;
  delivered_at?: string | null;
  metadata?: Record<string, unknown>;
};

export type MonitorSummaryResponse = {
  summaries: MonitorSummary[];
  alerts: MonitorAlert[];
};

export type DashboardProject = {
  id: string;
  name: string;
  status: string;
  owner?: string;
  description?: string;
  progress?: number;
  updated_at?: string;
};

export type DashboardOverviewMetrics = {
  citizens_total?: number;
  managers_total?: number;
  secretaries_total?: number;
  requests_total?: number;
  requests_resolved?: number;
  requests_pending?: number;
  tenants_active?: number;
  tenants_total?: number;
  traffic_gb?: number;
  mrr?: number;
  expenses_forecast?: number;
  revenue_forecast?: number;
  staff_total?: number;
  projects_in_development?: number;
};

export type DashboardOverviewResponse = {
  metrics?: DashboardOverviewMetrics;
  projects?: DashboardProject[];
};
