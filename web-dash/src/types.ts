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
  users_online?: number;
  total_accesses?: number;
};

export type DashboardOverviewResponse = {
  metrics?: DashboardOverviewMetrics;
  projects?: DashboardProject[];
  retention?: RetentionSummary;
  usage?: UsageAnalytics;
  compliance?: ComplianceRecord[];
  communication?: CommunicationCenter;
  city_insights?: CityInsight[];
  access_logs?: AccessLogEntry[];
};

export type ProjectTask = {
  id: string;
  title: string;
  owner: string;
  status: "pending" | "in_progress" | "blocked" | "done";
  due_date?: string;
  notes?: string;
  created_at: string;
  completed_at?: string | null;
};

export type ProjectRecord = {
  id: string;
  name: string;
  description?: string;
  status: string;
  progress: number;
  lead?: string;
  squad?: string[];
  started_at?: string;
  target_date?: string;
  tasks: ProjectTask[];
  updated_at: string;
};

export type FinanceAttachment = {
  id: string;
  name: string;
  uploaded_at: string;
};

export type FinanceEntry = {
  id: string;
  entry_type: "expense" | "revenue" | "investment" | "payroll" | "subscription";
  category: string;
  description: string;
  amount: number;
  due_date?: string;
  paid: boolean;
  paid_at?: string | null;
  method?: string;
  cost_center?: string;
  responsible?: string;
  notes?: string;
  attachments: FinanceAttachment[];
  created_at: string;
};

export type FinanceSummary = {
  cash_in: number;
  cash_out: number;
  net: number;
  pending: number;
};

export type RetentionCohort = {
  month: string;
  tenants: number;
  churn: number;
  expansion: number;
  nps: number;
  engagement: number;
};

export type RetentionSummary = {
  cohorts: RetentionCohort[];
  churn_rate: number;
  expansion_rate: number;
  nps_global: number;
  active_tenants: number;
};

export type ModuleUsageHeatmap = {
  module: string;
  labels: string[];
  usage: number[];
};

export type FunnelStage = {
  stage: string;
  value: number;
  conversion: number;
};

export type SecretariatRanking = {
  name: string;
  interactions: number;
};

export type UsageAnalytics = {
  heatmap: ModuleUsageHeatmap[];
  citizen_funnel: FunnelStage[];
  top_secretariats: SecretariatRanking[];
};

export type ComplianceAudit = {
  id: string;
  actor: string;
  action: string;
  performed_at: string;
  channel: string;
  sla_breach?: boolean;
};

export type ComplianceReport = {
  id: string;
  title: string;
  period: string;
  status: string;
  url?: string;
};

export type ComplianceRecord = {
  tenant_id: string;
  tenant_name: string;
  audits: ComplianceAudit[];
  reports: ComplianceReport[];
};

export type CommunicationAnnouncement = {
  id: string;
  title: string;
  published_at: string;
  author: string;
  audience: string;
  status: string;
};

export type PushNotificationRequest = {
  id: string;
  tenant_name: string;
  created_at: string;
  type: "manual" | "automatic";
  channel: string;
  status: "pending" | "approved" | "rejected";
  subject: string;
  summary?: string;
  scheduled_for?: string;
};

export type CommunicationCenter = {
  announcements: CommunicationAnnouncement[];
  push_queue: PushNotificationRequest[];
  history: PushNotificationRequest[];
};

export type CityInsight = {
  id: string;
  name: string;
  population: number;
  active_users: number;
  requests_total: number;
  satisfaction: number;
  last_sync: string;
  highlights: string[];
};

export type AccessLogEntry = {
  id: string;
  user: string;
  role: string;
  tenant?: string;
  logged_at: string;
  ip: string;
  location: string;
  user_agent: string;
  status: string;
};
