import { ChangeEvent, CSSProperties, FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import CloudflareSettings from "../components/CloudflareSettings";
import MonitorDashboard from "../components/MonitorDashboard";
import SaasAdminManager from "../components/SaasAdminManager";
import SupportTickets from "../components/SupportTickets";
import TenantForm from "../components/TenantForm";
import TenantImport from "../components/TenantImport";
import TenantTable from "../components/TenantTable";
import { useAuth } from "../state/auth";
import {
  DashboardOverviewMetrics,
  DashboardOverviewResponse,
  DashboardProject,
  FinanceAttachment,
  FinanceEntry,
  FinanceSummary,
  AccessLogEntry,
  CityInsight,
  CommunicationCenter,
  ComplianceRecord,
  RetentionSummary,
  UsageAnalytics,
  ProjectRecord,
  ProjectTask,
  Tenant
} from "../types";

const NAV_ITEMS = [
  { id: "overview", label: "Visão geral", icon: "home" },
  { id: "tenants", label: "Prefeituras", icon: "building" },
  { id: "automation", label: "Automação & DNS", icon: "cloud" },
  { id: "projects", label: "Projetos", icon: "projects" },
  { id: "finance", label: "Financeiro", icon: "finance" },
  { id: "app", label: "APP", icon: "app" },
  { id: "config", label: "Configurações", icon: "settings" },
  { id: "urban-city", label: "Urban Cidade", icon: "city" },
  { id: "access-log", label: "Acessos", icon: "access" },
  { id: "admins", label: "Equipe", icon: "team" },
  { id: "support", label: "Suporte", icon: "support" }
] as const;

type NavItemId = (typeof NAV_ITEMS)[number]["id"];

type MonitorSignals = { critical: number; warning: number; totalAlerts: number };
type SupportSignals = { open: number; urgent: number };
type TenantSignals = { pending: number; dnsIssues: number };
type ProjectSignals = { active: number; attention: number };

type ContractAttachment = {
  id: string;
  name: string;
  uploadedAt: string;
  url?: string | null;
  amount?: number | null;
  status?: string | null;
  referenceMonth?: string | null;
  notes?: string | null;
};

type ContractFormState = {
  status: string;
  contractValue: string;
  startDate: string;
  renewalDate: string;
  modules: Record<string, boolean>;
  contractFileUrl?: string | null;
  invoices: ContractAttachment[];
  notes: string;
};

type ProjectFormState = {
  name: string;
  status: string;
  lead: string;
  targetDate: string;
  description: string;
};

type TaskFormState = {
  title: string;
  owner: string;
  dueDate: string;
  notes: string;
};

type PendingAttachment = {
  id: string;
  name: string;
  file: File;
};

type FinanceFormState = {
  entryType: FinanceEntry["entry_type"];
  category: string;
  description: string;
  amount: string;
  dueDate: string;
  method: string;
  costCenter: string;
  responsible: string;
  notes: string;
  attachments: PendingAttachment[];
};

type MetricBreakdown = { label: string; value: number };

type AccessAnalyticsState = {
  cities: MetricBreakdown[];
  operatingSystems: MetricBreakdown[];
  devices: MetricBreakdown[];
};

type ConfigFormState = {
  defaultEmail: string;
  defaultPhone: string;
  chatgptKey: string;
  slackWebhook: string;
  profileName: string;
  password: string;
  confirmPassword: string;
};

type AppCustomizationState = {
  tenantId?: string;
  logoUrl?: string | null;
  pendingLogo?: File | null;
  pendingLogoName?: string;
  primaryColor: string;
  secondaryColor: string;
  weatherProvider?: string | null;
  weatherApiKey?: string | null;
  welcomeMessage?: string | null;
  enablePush: boolean;
  enableWeather: boolean;
};

const MODULE_CATALOG = [
  { id: "portal", label: "Portal do cidadão" },
  { id: "assistente", label: "Assistente virtual" },
  { id: "financeiro", label: "Financeiro" },
  { id: "obras", label: "Projetos & obras" },
  { id: "transparencia", label: "Transparência" }
] as const;

const DEFAULT_OVERVIEW_METRICS: DashboardOverviewMetrics = {
  citizens_total: 0,
  managers_total: 0,
  secretaries_total: 0,
  requests_total: 0,
  requests_resolved: 0,
  requests_pending: 0,
  tenants_active: 0,
  tenants_total: 0,
  traffic_gb: 0,
  mrr: 0,
  expenses_forecast: 0,
  revenue_forecast: 0,
  staff_total: 0,
  users_online: 0,
  total_accesses: 0
};

const DEFAULT_PROJECTS: DashboardProject[] = [];

const DEFAULT_FINANCE_ENTRIES: FinanceEntry[] = [];

const DEFAULT_RETENTION: RetentionSummary = {
  cohorts: [],
  churn_rate: 0,
  expansion_rate: 0,
  nps_global: 0,
  active_tenants: 0
};

const DEFAULT_USAGE_ANALYTICS: UsageAnalytics = {
  heatmap: [],
  citizen_funnel: [],
  top_secretariats: []
};

const DEFAULT_COMPLIANCE: ComplianceRecord[] = [];

const DEFAULT_COMMUNICATION_CENTER: CommunicationCenter = {
  announcements: [],
  push_queue: [],
  history: []
};

const DEFAULT_CITY_INSIGHTS: CityInsight[] = [];

const DEFAULT_ACCESS_LOGS: AccessLogEntry[] = [];

const DEFAULT_APP_SETTINGS: Record<string, AppCustomizationState> = {};

const DEFAULT_ACCESS_ANALYTICS: AccessAnalyticsState = {
  cities: [],
  operatingSystems: [],
  devices: []
};

const INITIAL_MONITOR_SIGNALS: MonitorSignals = { critical: 0, warning: 0, totalAlerts: 0 };
const INITIAL_SUPPORT_SIGNALS: SupportSignals = { open: 0, urgent: 0 };
const INITIAL_TENANT_SIGNALS: TenantSignals = { pending: 0, dnsIssues: 0 };
const INITIAL_PROJECT_SIGNALS: ProjectSignals = { active: 0, attention: 0 };
const INITIAL_FINANCE_SUMMARY: FinanceSummary = { cash_in: 0, cash_out: 0, net: 0, pending: 0 };

const STATUS_BADGES: Record<string, string> = {
  draft: "Rascunho",
  active: "Ativo",
  suspended: "Suspenso"
};

const CONTRACT_STATUS_OPTIONS = [
  { value: "draft", label: "Rascunho" },
  { value: "review", label: "Em análise" },
  { value: "active", label: "Ativo" },
  { value: "renewal", label: "Em renovação" },
  { value: "closed", label: "Encerrado" }
];

const PROJECT_STATUS_OPTIONS = [
  { value: "planning", label: "Discovery" },
  { value: "in_progress", label: "Em andamento" },
  { value: "review", label: "Em validação" },
  { value: "done", label: "Concluído" }
] as const;

const FINANCE_TYPE_OPTIONS = [
  { value: "expense", label: "Despesa" },
  { value: "revenue", label: "Receita" },
  { value: "investment", label: "Investimento" },
  { value: "payroll", label: "Folha" },
  { value: "subscription", label: "Assinatura" }
] as const;

const FINANCE_TYPE_LABELS: Record<FinanceEntry["entry_type"], string> = {
  expense: "Despesa",
  revenue: "Receita",
  investment: "Investimento",
  payroll: "Folha",
  subscription: "Assinatura"
};

const TASK_STATUS_OPTIONS: { value: ProjectTask["status"]; label: string }[] = [
  { value: "pending", label: "Pendente" },
  { value: "in_progress", label: "Em execução" },
  { value: "blocked", label: "Bloqueado" },
  { value: "done", label: "Concluído" }
] as const;

const FINANCE_CATEGORY_OPTIONS = [
  "Operacional",
  "Tecnologia",
  "Marketing",
  "Expansão",
  "Infraestrutura",
  "Financeiro"
] as const;

const FINANCE_METHOD_OPTIONS = [
  "Transferência bancária",
  "Cartão corporativo",
  "Boleto",
  "PIX",
  "Dinheiro"
] as const;

const getInitialTheme = (): "light" | "dark" => {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem("dashboard-theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
};

const createDefaultContractForm = (): ContractFormState => ({
  status: "draft",
  contractValue: "",
  startDate: "",
  renewalDate: "",
  modules: MODULE_CATALOG.reduce<Record<string, boolean>>((acc, module) => {
    acc[module.id] = false;
    return acc;
  }, {}),
  contractFileUrl: null,
  invoices: [],
  notes: ""
});

const createDefaultProjectForm = (): ProjectFormState => ({
  name: "",
  status: PROJECT_STATUS_OPTIONS[0].value,
  lead: "",
  targetDate: "",
  description: ""
});

const createDefaultTaskForm = (): TaskFormState => ({
  title: "",
  owner: "",
  dueDate: "",
  notes: ""
});

const createDefaultFinanceForm = (): FinanceFormState => ({
  entryType: FINANCE_TYPE_OPTIONS[0].value,
  category: FINANCE_CATEGORY_OPTIONS[0],
  description: "",
  amount: "",
  dueDate: "",
  method: FINANCE_METHOD_OPTIONS[0],
  costCenter: "",
  responsible: "",
  notes: "",
  attachments: []
});

const createDefaultConfigForm = (): ConfigFormState => ({
  defaultEmail: "operacoes@urbanbyte.com.br",
  defaultPhone: "+55 83 99999-0000",
  chatgptKey: "",
  slackWebhook: "",
  profileName: "Urbanbyte Admin",
  password: "",
  confirmPassword: ""
});

function createDefaultAppCustomization(
  overrides: Partial<AppCustomizationState> = {}
): AppCustomizationState {
  return {
    tenantId: undefined,
    logoUrl: undefined,
    pendingLogo: null,
    pendingLogoName: undefined,
    primaryColor: "#06AA48",
    secondaryColor: "#0F172A",
    weatherProvider: "OpenWeather",
    weatherApiKey: null,
    welcomeMessage: null,
    enablePush: true,
    enableWeather: true,
    ...overrides
  };
}

const makeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const toDateInput = (value?: string | null) => (value ? value.slice(0, 10) : "");

const formatDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString("pt-BR") : "";

const slugify = (value: string, fallback = "") => {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || fallback;
};

const normalizeContractStatus = (status: string | null | undefined) => {
  const value = slugify(status ?? "", "draft");
  switch (value) {
    case "activo":
    case "ativo":
    case "active":
      return "active";
    case "em_analise":
    case "analysis":
    case "review":
      return "review";
    case "em_renovacao":
    case "renovacao":
    case "renewal":
      return "renewal";
    case "encerrado":
    case "closed":
      return "closed";
    case "rascunho":
    case "draft":
    default:
      return "draft";
  }
};

const projectStatusLabel = (status: string) => {
  const match = PROJECT_STATUS_OPTIONS.find((option) => option.value === status);
  return match?.label ?? status;
};

const normalizeProjectStatus = (status: string | null | undefined) => {
  const value = slugify(status ?? "", "planning");
  switch (value) {
    case "in_progress":
    case "em_andamento":
      return "in_progress";
    case "review":
    case "em_validacao":
      return "review";
    case "done":
    case "concluido":
      return "done";
    case "planning":
    case "discovery":
    default:
      return "planning";
  }
};

const dashboardProjectToRecord = (project: DashboardProject): ProjectRecord => {
  const tasks: ProjectTask[] = (project.tasks ?? []).map((task) => ({
    ...task,
    owner: task.owner ?? undefined,
    due_date: task.due_date ?? null,
    notes: task.notes ?? null
  }));
  const progress = Number.isFinite(project.progress)
    ? project.progress
    : computeProjectProgress(tasks, 0);

  return {
    id: project.id,
    name: project.name,
    description: project.description ?? "",
    status: normalizeProjectStatus(project.status),
    progress,
    owner: project.owner ?? undefined,
    lead: project.lead ?? undefined,
    started_at: project.started_at ?? undefined,
    target_date: project.target_date ?? undefined,
    tasks,
    updated_at: project.updated_at ?? new Date().toISOString()
  };
};

const formatNumber = (value?: number | null) =>
  (value ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

const formatCurrency = (value?: number | null) =>
  (value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatPercent = (value: number) => `${Math.round(value)}%`;

const computeProjectProgress = (tasks: ProjectTask[], fallback = 0) => {
  if (tasks.length === 0) return fallback;
  const completed = tasks.filter((task) => task.status === "done").length;
  return tasks.length === 0 ? fallback : (completed / tasks.length) * 100;
};

const parseCurrencyInput = (input: string) => {
  const normalized = input.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : 0;
};

export default function DashboardPage() {
  const { user, logout, authorizedFetch } = useAuth();

  const userInitials = useMemo(() => {
    if (!user?.name) return "UB";
    const parts = user.name.trim().split(/\s+/);
    const initials = parts
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
    return initials || "UB";
  }, [user]);

  const [theme, setTheme] = useState<"light" | "dark">(() => getInitialTheme());
  const [activeSection, setActiveSection] = useState<NavItemId>("overview");

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoadingTenants, setIsLoadingTenants] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [overviewMetrics, setOverviewMetrics] = useState<DashboardOverviewMetrics>(
    DEFAULT_OVERVIEW_METRICS
  );
  const [projects, setProjects] = useState<DashboardProject[]>(DEFAULT_PROJECTS);
  const [monitorSignals, setMonitorSignals] = useState<MonitorSignals>(INITIAL_MONITOR_SIGNALS);
  const [supportSignals, setSupportSignals] = useState<SupportSignals>(INITIAL_SUPPORT_SIGNALS);
  const [tenantSignals, setTenantSignals] = useState<TenantSignals>(INITIAL_TENANT_SIGNALS);
  const [projectSignals, setProjectSignals] = useState<ProjectSignals>(INITIAL_PROJECT_SIGNALS);

  const [contractForms, setContractForms] = useState<Record<string, ContractFormState>>({});
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");

  const [projectBoard, setProjectBoard] = useState<ProjectRecord[]>(
    DEFAULT_PROJECTS.map(dashboardProjectToRecord)
  );
  const [activeProjectId, setActiveProjectId] = useState<string>(
    DEFAULT_PROJECTS[0]?.id ?? ""
  );
  const [projectForm, setProjectForm] = useState<ProjectFormState>(createDefaultProjectForm);
  const [taskForm, setTaskForm] = useState<TaskFormState>(createDefaultTaskForm);

  const [financeEntries, setFinanceEntries] = useState<FinanceEntry[]>(DEFAULT_FINANCE_ENTRIES);
  const [financeForm, setFinanceForm] = useState<FinanceFormState>(createDefaultFinanceForm);
  const [financeSummary, setFinanceSummary] = useState<FinanceSummary>(INITIAL_FINANCE_SUMMARY);
  const [financeFilter, setFinanceFilter] = useState<"all" | "pending" | "paid">("all");
  const [retentionSummary, setRetentionSummary] = useState<RetentionSummary>(DEFAULT_RETENTION);
  const [usageAnalytics, setUsageAnalytics] = useState<UsageAnalytics>(DEFAULT_USAGE_ANALYTICS);
  const [complianceRecords, setComplianceRecords] = useState<ComplianceRecord[]>(DEFAULT_COMPLIANCE);
  const [communicationCenter, setCommunicationCenter] = useState<CommunicationCenter>(
    DEFAULT_COMMUNICATION_CENTER
  );
  const [communicationFilter, setCommunicationFilter] = useState<"queue" | "history">("queue");
  const [cityInsights, setCityInsights] = useState<CityInsight[]>(DEFAULT_CITY_INSIGHTS);
  const [selectedCityId, setSelectedCityId] = useState<string>("");
  const [accessLogs, setAccessLogs] = useState<AccessLogEntry[]>(DEFAULT_ACCESS_LOGS);
  const [accessAnalytics, setAccessAnalytics] = useState<AccessAnalyticsState>(DEFAULT_ACCESS_ANALYTICS);
  const [configForm, setConfigForm] = useState<ConfigFormState>(createDefaultConfigForm);
  const [appSettings, setAppSettings] = useState<Record<string, AppCustomizationState>>(DEFAULT_APP_SETTINGS);
  const [selectedAppCityId, setSelectedAppCityId] = useState<string>("");

  const loadTenants = useCallback(async () => {
    const data = await authorizedFetch<{ tenants?: Tenant[] }>("/saas/tenants");
    const list = Array.isArray(data.tenants) ? data.tenants : [];
    setTenants(list);
    setTenantSignals({
      pending: list.filter((tenant) => tenant.status !== "active").length,
      dnsIssues: list.filter((tenant) => {
        const status = (tenant.dns_status ?? "").toLowerCase();
        return status && status !== "ok";
      }).length
    });
    return list;
  }, [authorizedFetch]);

  const loadOverview = useCallback(async () => {
    try {
      const response = await authorizedFetch<DashboardOverviewResponse>("/saas/metrics/overview");

      const metrics = response?.metrics ?? DEFAULT_OVERVIEW_METRICS;
      setOverviewMetrics({ ...DEFAULT_OVERVIEW_METRICS, ...metrics });

      const projectData = response?.projects ?? [];
      setProjects(projectData);

      if (response?.retention) {
        setRetentionSummary(response.retention);
      }
      if (response?.usage) {
        setUsageAnalytics(response.usage);
      }
      if (response?.compliance) {
        setComplianceRecords(response.compliance);
      }
      if (response?.communication) {
        setCommunicationCenter(response.communication);
      }

      if (response?.city_insights) {
        setCityInsights(response.city_insights);
        setSelectedCityId((current) => {
          const exists = response.city_insights?.some((city) => city.tenant_id === current);
          if (current && exists) return current;
          return response.city_insights?.[0]?.tenant_id ?? "";
        });
        setSelectedAppCityId((current) => {
          const exists = response.city_insights?.some((city) => city.tenant_id === current);
          if (current && exists) return current;
          return response.city_insights?.[0]?.tenant_id ?? "";
        });
        setAppSettings((prev) => {
          const next = { ...prev };
          response.city_insights?.forEach((city) => {
            const key = city.tenant_id;
            if (!next[key]) {
              next[key] = createDefaultAppCustomization({
                tenantId: key,
                welcomeMessage: `Bem-vindo ao app de ${city.name}`
              });
            } else {
              next[key] = {
                ...next[key],
                tenantId: key,
                welcomeMessage:
                  next[key].welcomeMessage ?? `Bem-vindo ao app de ${city.name}`
              };
            }
          });
          return next;
        });
      }

      if (response?.access_logs) {
        setAccessLogs(response.access_logs);

        if (response.access_logs.length) {
          const cityMap = new Map<string, number>();
          const osMap = new Map<string, number>();
          const deviceMap = new Map<string, number>();

          response.access_logs.forEach((log) => {
            const cityLabel = log.tenant ?? "Outros";
            cityMap.set(cityLabel, (cityMap.get(cityLabel) ?? 0) + 1);

            const agent = (log.user_agent ?? "").toLowerCase();
            let osLabel = "Outros";
            if (agent.includes("android")) osLabel = "Android";
            else if (agent.includes("iphone") || agent.includes("ios")) osLabel = "iOS";
            else if (agent.includes("windows")) osLabel = "Windows";
            else if (agent.includes("mac")) osLabel = "macOS";
            else if (agent.includes("linux")) osLabel = "Linux";
            osMap.set(osLabel, (osMap.get(osLabel) ?? 0) + 1);

            let deviceLabel = "Desktop";
            if (agent.includes("mobile") || agent.includes("android") || agent.includes("iphone")) {
              deviceLabel = "Mobile";
            } else if (agent.includes("tablet") || agent.includes("ipad")) {
              deviceLabel = "Tablet";
            }
            deviceMap.set(deviceLabel, (deviceMap.get(deviceLabel) ?? 0) + 1);
          });

          const top = (source: Map<string, number>): MetricBreakdown[] =>
            Array.from(source.entries())
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([label, value]) => ({ label, value }));

          setAccessAnalytics({
            cities: top(cityMap),
            operatingSystems: top(osMap),
            devices: top(deviceMap)
          });
        } else {
          setAccessAnalytics(DEFAULT_ACCESS_ANALYTICS);
        }
      }
    } catch (err) {
      // Mantém os valores atuais e registra erro em mensagem discreta
      const msg = err instanceof Error ? err.message : "Falha ao carregar métricas";
      setError((current) => current ?? msg);
    }
  }, [authorizedFetch]);

  const loadFinanceEntries = useCallback(async () => {
    try {
      const response = await authorizedFetch<{ entries?: FinanceEntry[] }>(
        "/saas/finance/entries"
      );
      const entries = Array.isArray(response.entries) ? response.entries : [];
      setFinanceEntries(entries);
      return entries;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao carregar lançamentos";
      setError((current) => current ?? msg);
      return [] as FinanceEntry[];
    }
  }, [authorizedFetch]);

  const loadContractForTenant = useCallback(
    async (tenantId: string) => {
      if (!tenantId) return;
      try {
        const response = await authorizedFetch<{ contract: any }>(
          `/saas/tenants/${tenantId}/contract`
        );

        const contract = response.contract;
        if (!contract) return;

        const value =
          typeof contract.contract_value === "number"
            ? contract.contract_value.toFixed(2)
            : "";

        const invoices: ContractAttachment[] = Array.isArray(contract.invoices)
          ? contract.invoices.map((invoice: any) => {
              let referenceLabel = invoice.reference_month ?? "";
              if (typeof invoice.reference_month === "string" && invoice.reference_month) {
                const date = new Date(invoice.reference_month);
                if (!Number.isNaN(date.valueOf())) {
                  referenceLabel = date.toLocaleDateString("pt-BR", {
                    month: "short",
                    year: "numeric"
                  });
                }
              }

              return {
                id: invoice.id,
                name: referenceLabel || invoice.status || `NF ${new Date().toISOString()}`,
                uploadedAt: formatDateTime(invoice.uploaded_at),
                url: invoice.file_url ?? undefined,
                amount: invoice.amount ?? null,
                status: invoice.status ?? null,
                referenceMonth: invoice.reference_month ?? null,
                notes: invoice.notes ?? null
              };
            })
          : [];

        const modules = MODULE_CATALOG.reduce<Record<string, boolean>>((acc, module) => {
          acc[module.id] = Boolean(contract.modules?.[module.id]);
          return acc;
        }, {});

        setContractForms((prev) => ({
          ...prev,
          [tenantId]: {
            status: normalizeContractStatus(contract.status),
            contractValue: value,
            startDate: toDateInput(contract.start_date ?? null),
            renewalDate: toDateInput(contract.renewal_date ?? null),
            modules,
            contractFileUrl: contract.contract_file_url ?? null,
            invoices,
            notes: contract.notes ?? ""
          }
        }));
      } catch (err) {
        // Se contrato não existir (404), mantém padrão vazio
        setContractForms((prev) => ({
          ...prev,
          [tenantId]: {
            status: "draft",
            contractValue: "",
            startDate: "",
            renewalDate: "",
            modules: MODULE_CATALOG.reduce<Record<string, boolean>>((acc, module) => {
              acc[module.id] = false;
              return acc;
            }, {}),
            contractFileUrl: null,
            invoices: [],
            notes: ""
          }
        }));
      }
    },
    [authorizedFetch]
  );

  const loadAppCustomization = useCallback(
    async (tenantId: string) => {
      if (!tenantId) return;
      try {
        const response = await authorizedFetch<{ app: any }>(`/saas/tenants/${tenantId}/app`);
        const app = response.app;
        if (!app) return;

        setAppSettings((prev) => ({
          ...prev,
          [tenantId]: createDefaultAppCustomization({
            tenantId,
            logoUrl: app.logo_url ?? undefined,
            primaryColor: app.primary_color ?? "#06AA48",
            secondaryColor: app.secondary_color ?? "#0F172A",
            weatherProvider: app.weather_provider ?? null,
            weatherApiKey: app.weather_api_key ?? null,
            welcomeMessage: app.welcome_message ?? null,
            enablePush: Boolean(app.enable_push),
            enableWeather: Boolean(app.enable_weather),
            pendingLogo: null,
            pendingLogoName: undefined
          })
        }));
      } catch (err) {
        setAppSettings((prev) => ({
          ...prev,
          [tenantId]: createDefaultAppCustomization({ tenantId })
        }));
      }
    },
    [authorizedFetch]
  );

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("dashboard-theme", theme);
      document.documentElement.classList.toggle("dark", theme === "dark");
    }
  }, [theme]);

  useEffect(() => {
    if (!user) {
      setTenants([]);
      setSelectedTenantId("");
      setIsLoadingTenants(false);
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        setIsLoadingTenants(true);
        const list = await loadTenants();
        if (cancelled) return;
        if (list.length) {
          setSelectedTenantId((current) => (current ? current : list[0].id));
        }
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Falha ao carregar prefeituras";
        setError((current) => current ?? msg);
      } finally {
        if (!cancelled) {
          setIsLoadingTenants(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [user, loadTenants]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    setProjectBoard(projects.map(dashboardProjectToRecord));
  }, [projects]);

  useEffect(() => {
    void loadFinanceEntries();
  }, [loadFinanceEntries]);

  useEffect(() => {
    if (!selectedTenantId) return;
    void loadContractForTenant(selectedTenantId);
  }, [selectedTenantId, loadContractForTenant]);

  useEffect(() => {
    if (!selectedAppCityId) return;
    void loadAppCustomization(selectedAppCityId);
  }, [selectedAppCityId, loadAppCustomization]);

  useEffect(() => {
    if (projectBoard.length === 0) {
      setProjectSignals(INITIAL_PROJECT_SIGNALS);
      setActiveProjectId("");
      return;
    }
    setActiveProjectId((current) => (current ? current : projectBoard[0].id));
    const today = new Date().setHours(0, 0, 0, 0);
    const attention = projectBoard.reduce((count, project) => {
      const overdue = project.tasks.filter((task) => {
        if (task.status === "done") return false;
        if (task.status === "blocked") return true;
        if (!task.due_date) return false;
        return new Date(task.due_date).setHours(0, 0, 0, 0) < today;
      }).length;
      return count + overdue;
    }, 0);
    const active = projectBoard.filter((project) => project.status !== "done").length;
    setProjectSignals({ active, attention });
  }, [projectBoard]);

  useEffect(() => {
    if (financeEntries.length === 0) {
      setFinanceSummary(INITIAL_FINANCE_SUMMARY);
      return;
    }
    const summary = financeEntries.reduce(
      (acc, entry) => {
        if (entry.entry_type === "revenue" || entry.entry_type === "investment") {
          acc.cash_in += entry.amount;
        } else {
          acc.cash_out += entry.amount;
        }
        if (!entry.paid) {
          acc.pending += entry.amount;
        }
        return acc;
      },
      { ...INITIAL_FINANCE_SUMMARY }
    );
    summary.net = summary.cash_in - summary.cash_out;
    setFinanceSummary(summary);
  }, [financeEntries]);

  const derivedMetrics = useMemo(() => {
    const activeTenants = tenants.filter((tenant) => tenant.status === "active").length;
    const totals: DashboardOverviewMetrics = {
      ...overviewMetrics,
      tenants_total: tenants.length,
      tenants_active: activeTenants,
      requests_pending:
        overviewMetrics.requests_pending ??
        Math.max(
          (overviewMetrics.requests_total ?? 0) - (overviewMetrics.requests_resolved ?? 0),
          0
        )
    };
    return totals;
  }, [overviewMetrics, tenants]);

  const financePending = useMemo(
    () => financeEntries.filter((entry) => !entry.paid).length,
    [financeEntries]
  );

  const filteredFinanceEntries = useMemo(() => {
    return financeEntries.filter((entry) => {
      if (financeFilter === "pending") return !entry.paid;
      if (financeFilter === "paid") return entry.paid;
      return true;
    });
  }, [financeEntries, financeFilter]);

  const projectSummary = useMemo(() => {
    if (projectBoard.length === 0) {
      return { total: 0, completed: 0, avgProgress: 0 };
    }
    const completed = projectBoard.filter(
      (project) => project.status === "done" || project.progress >= 100
    ).length;
    const avgProgress =
      projectBoard.reduce((sum, project) => sum + project.progress, 0) / projectBoard.length;
    return { total: projectBoard.length, completed, avgProgress };
  }, [projectBoard]);

  const selectedProject = useMemo(() => {
    if (!projectBoard.length) return null;
    return projectBoard.find((project) => project.id === activeProjectId) ?? projectBoard[0];
  }, [projectBoard, activeProjectId]);

  const selectedCity = useMemo(() => {
    if (!cityInsights.length) return null;
    return (
      cityInsights.find((city) => city.tenant_id === selectedCityId) ?? cityInsights[0]
    );
  }, [cityInsights, selectedCityId]);

  const navBadges = useMemo(() => {
    const supportTotal = supportSignals.open + supportSignals.urgent;
    return {
      overview: monitorSignals.totalAlerts,
      tenants: tenantSignals.pending,
      automation: tenantSignals.dnsIssues + monitorSignals.critical,
      projects: projectSignals.attention,
      finance: financePending,
      app: 0,
      config: 0,
      "urban-city": cityInsights.length,
      "access-log": accessLogs.length,
      admins: 0,
      support: supportTotal
    } as Record<NavItemId, number>;
  }, [accessLogs.length, cityInsights.length, financePending, monitorSignals, projectSignals, supportSignals, tenantSignals]);

  const monitorStatsHandler = useCallback((stats: MonitorSignals) => {
    setMonitorSignals(stats);
  }, []);

  const supportStatsHandler = useCallback((stats: SupportSignals) => {
    setSupportSignals(stats);
  }, []);

  const upsertTenant = (updated: Tenant) => {
    setTenants((prev) => {
      const map = new Map(prev.map((tenant) => [tenant.id, tenant] as const));
      map.set(updated.id, { ...map.get(updated.id), ...updated });
      const next = Array.from(map.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setTenantSignals({
        pending: next.filter((tenant) => tenant.status !== "active").length,
        dnsIssues: next.filter((tenant) => {
          const status = (tenant.dns_status ?? "").toLowerCase();
          return status && status !== "ok";
        }).length
      });
      return next;
    });
  };

  const handleCreated = (tenant: Tenant) => {
    upsertTenant(tenant);
    setMessage(`Tenant ${tenant.display_name} criado.`);
    if (!selectedTenantId) {
      setSelectedTenantId(tenant.id);
    }
  };

  const handleProvision = async (tenant: Tenant) => {
    try {
      setError(null);
      const response = await authorizedFetch<{ tenant: Tenant }>(
        `/saas/tenants/${tenant.id}/dns/provision`,
        { method: "POST" }
      );
      upsertTenant(response.tenant);
      setMessage(`Provisionamento acionado para ${tenant.display_name}.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao provisionar DNS";
      setError(msg);
    }
  };

  const handleCheckDNS = async (tenant: Tenant) => {
    try {
      setError(null);
      const response = await authorizedFetch<{ tenant: Tenant }>(
        `/saas/tenants/${tenant.id}/dns/check`,
        { method: "POST" }
      );
      upsertTenant(response.tenant);
      setMessage(`Registro DNS revalidado para ${tenant.display_name}.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao verificar DNS";
      setError(msg);
    }
  };

  const handleImport = (created: Tenant[]) => {
    if (!created.length) return;
    setError(null);
    created.forEach(upsertTenant);
    setMessage(`${created.length} prefeitura(s) importadas.`);
  };

  const getContractForm = useCallback(
    (tenantId: string | undefined): ContractFormState => {
      if (!tenantId) return createDefaultContractForm();
      return contractForms[tenantId] ?? createDefaultContractForm();
    },
    [contractForms]
  );

  const updateContractForm = (tenantId: string, patch: Partial<ContractFormState>) => {
    setContractForms((prev) => {
      const base = prev[tenantId] ?? createDefaultContractForm();
      return { ...prev, [tenantId]: { ...base, ...patch } };
    });
  };

  const handleModuleToggle = async (tenantId: string, moduleId: string) => {
    const current = getContractForm(tenantId);
    const modules = { ...current.modules, [moduleId]: !current.modules[moduleId] };
    updateContractForm(tenantId, { modules });

    try {
      await authorizedFetch(`/saas/tenants/${tenantId}/contract/modules`, {
        method: "PUT",
        body: JSON.stringify({ modules })
      });
      setError(null);
      setMessage("Módulos atualizados.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar módulos");
      await loadContractForTenant(tenantId);
    }
  };

  const handleContractFile = async (tenantId: string, files: FileList | null) => {
    if (!files || files.length === 0) return;

    const formData = new FormData();
    formData.append("file", files[0]);

    try {
      await authorizedFetch(`/saas/tenants/${tenantId}/contract/file`, {
        method: "POST",
        body: formData
      });
      await loadContractForTenant(tenantId);
      setError(null);
      setMessage("Contrato atualizado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar contrato");
    }
  };

  const handleInvoicesUpload = async (tenantId: string, files: FileList | null) => {
    if (!files || files.length === 0) return;

    const referenceMonth = new Date().toISOString().slice(0, 7);

    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("reference_month", referenceMonth);

      try {
        await authorizedFetch(`/saas/tenants/${tenantId}/contract/invoices`, {
          method: "POST",
          body: formData
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao enviar nota fiscal");
      }
    }

    await loadContractForTenant(tenantId);
    setError(null);
    setMessage("Notas fiscais atualizadas.");
  };

  const handleRemoveInvoice = async (tenantId: string, attachmentId: string) => {
    try {
      await authorizedFetch(`/saas/tenants/${tenantId}/contract/invoices/${attachmentId}`, {
        method: "DELETE",
        parseJson: false
      });
      await loadContractForTenant(tenantId);
      setError(null);
      setMessage("Nota fiscal removida.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao remover nota fiscal");
    }
  };

  const handleContractSave = async (tenantId: string) => {
    const form = getContractForm(tenantId);
    const amount = parseCurrencyInput(form.contractValue);

    const payload: Record<string, unknown> = {
      status: form.status,
      notes: form.notes || undefined,
      contract_value: Number.isFinite(amount) && amount > 0 ? amount : undefined,
      start_date: form.startDate || undefined,
      renewal_date: form.renewalDate || undefined
    };

    try {
      await authorizedFetch(`/saas/tenants/${tenantId}/contract`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      await loadContractForTenant(tenantId);
      setError(null);
      setMessage("Contrato atualizado com sucesso.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar contrato");
    }
  };

  const handleCreateProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectForm.name.trim()) {
      setError("Informe um nome de projeto.");
      return;
    }

    const payload: Record<string, unknown> = {
      name: projectForm.name.trim(),
      status: slugify(projectForm.status, "planning"),
      description: projectForm.description.trim() || undefined,
      target_date: projectForm.targetDate || undefined
    };

    try {
      const response = await authorizedFetch<{ project: DashboardProject }>("/saas/projects", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      const created = response.project;
      setProjectForm(createDefaultProjectForm());
      setTaskForm(createDefaultTaskForm());
      setMessage(`Projeto ${created?.name ?? projectForm.name.trim()} cadastrado.`);
      setError(null);
      await loadOverview();
      if (created?.id) {
        setActiveProjectId(created.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar projeto");
    }
  };

  const handleProjectStatusChange = async (projectId: string, status: string) => {
    const normalized = slugify(status, "in_progress");
    try {
      await authorizedFetch(`/saas/projects/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: normalized })
      });
      await loadOverview();
      setError(null);
      setMessage("Status do projeto atualizado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar status do projeto");
    }
  };

  const handleAddTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeProjectId) {
      setError("Selecione um projeto antes de adicionar atividades.");
      return;
    }
    if (!taskForm.title.trim()) {
      setError("Informe um título para a atividade.");
      return;
    }

    const payload: Record<string, unknown> = {
      title: taskForm.title.trim(),
      owner: taskForm.owner.trim() || undefined,
      status: "pending",
      due_date: taskForm.dueDate || undefined,
      notes: taskForm.notes.trim() || undefined
    };

    try {
      await authorizedFetch(`/saas/projects/${activeProjectId}/tasks`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setTaskForm(createDefaultTaskForm());
      setMessage("Atividade adicionada.");
      setError(null);
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao adicionar atividade");
    }
  };

  const handleTaskStatusChange = async (
    projectId: string,
    taskId: string,
    status: ProjectTask["status"]
  ) => {
    try {
      await authorizedFetch(`/saas/projects/${projectId}/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      await loadOverview();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar atividade");
    }
  };

  const handleRemoveTask = async (projectId: string, taskId: string) => {
    try {
      await authorizedFetch(`/saas/projects/${projectId}/tasks/${taskId}`, {
        method: "DELETE",
        parseJson: false
      });
      await loadOverview();
      setError(null);
      setMessage("Atividade removida.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao remover atividade");
    }
  };

  const handleFinanceFieldChange = <K extends keyof FinanceFormState>(
    field: K,
    value: FinanceFormState[K]
  ) => {
    setFinanceForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleFinanceAttachmentChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { files } = event.target;
    if (!files || files.length === 0) {
      handleFinanceFieldChange("attachments", []);
      event.target.value = "";
      return;
    }
    const attachments: PendingAttachment[] = Array.from(files).map((file) => ({
      id: makeId(),
      name: file.name,
      file
    }));
    handleFinanceFieldChange("attachments", attachments);
    event.target.value = "";
  };

  const handleFinanceAttachmentRemove = (attachmentId: string) => {
    handleFinanceFieldChange(
      "attachments",
      financeForm.attachments.filter((attachment) => attachment.id !== attachmentId)
    );
  };

  const uploadFinanceAttachments = async (entryId: string, attachments: PendingAttachment[]) => {
    for (const attachment of attachments) {
      const formData = new FormData();
      formData.append("file", attachment.file, attachment.name);
      try {
        await authorizedFetch(`/saas/finance/entries/${entryId}/attachments`, {
          method: "POST",
          body: formData
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao enviar anexo financeiro");
      }
    }
  };

  const handleCreateFinanceEntry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!financeForm.description.trim()) {
      setError("Descreva a movimentação financeira.");
      return;
    }
    const amountValue = parseCurrencyInput(financeForm.amount);
    if (amountValue <= 0) {
      setError("Informe um valor positivo.");
      return;
    }

    const payload: Record<string, unknown> = {
      entry_type: financeForm.entryType,
      category: financeForm.category,
      description: financeForm.description.trim(),
      amount: amountValue,
      due_date: financeForm.dueDate || undefined,
      method: financeForm.method || undefined,
      cost_center: financeForm.costCenter || undefined,
      responsible: financeForm.responsible || undefined,
      notes: financeForm.notes || undefined
    };

    try {
      const response = await authorizedFetch<{ entry: FinanceEntry }>("/saas/finance/entries", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      const created = response.entry;

      if (financeForm.attachments.length) {
        await uploadFinanceAttachments(created.id, financeForm.attachments);
      }

      await loadFinanceEntries();
      setFinanceForm(createDefaultFinanceForm());
      setMessage(`Lançamento financeiro ${created.description} criado.`);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao registrar lançamento");
    }
  };

  const handleFinanceTogglePaid = async (entryId: string, currentPaid: boolean) => {
    try {
      await authorizedFetch(`/saas/finance/entries/${entryId}`, {
        method: "PATCH",
        body: JSON.stringify({ paid: !currentPaid })
      });
      await loadFinanceEntries();
      setError(null);
      setMessage(!currentPaid ? "Lançamento marcado como pago." : "Baixa revertida.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar lançamento");
    }
  };

  const handleSyncCity = async (tenantId: string) => {
    if (!tenantId) return;
    try {
      await authorizedFetch(`/saas/cities/${tenantId}/sync`, {
        method: "POST",
        body: JSON.stringify({})
      });
      await loadOverview();
      const city = cityInsights.find((item) => item.tenant_id === tenantId);
      setMessage(
        `Sincronização de dados iniciada para ${city?.name ?? "cidade selecionada"}.`
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao sincronizar cidade");
    }
  };

  const handleConfigFieldChange = <K extends keyof ConfigFormState>(
    field: K,
    value: ConfigFormState[K]
  ) => {
    setConfigForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleConfigSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (configForm.password && configForm.password !== configForm.confirmPassword) {
      setError("As senhas informadas não conferem.");
      return;
    }
    setError(null);
    setMessage("Configurações atualizadas com sucesso.");
    setConfigForm((prev) => ({ ...prev, password: "", confirmPassword: "" }));
  };

  const updateAppSettings = (tenantId: string, patch: Partial<AppCustomizationState>) => {
    setAppSettings((prev) => {
      const city = cityInsights.find((item) => item.tenant_id === tenantId);
      const base = prev[tenantId] ??
        createDefaultAppCustomization({
          tenantId,
          welcomeMessage: `Bem-vindo ao app de ${city?.name ?? "sua cidade"}`
        });
      return { ...prev, [tenantId]: { ...base, ...patch } };
    });
  };

  const handleAppLogoUpload = async (tenantId: string, files: FileList | null) => {
    if (!files || files.length === 0) return;

    const formData = new FormData();
    formData.append("logo", files[0]);

    try {
      await authorizedFetch(`/saas/tenants/${tenantId}/app/logo`, {
        method: "POST",
        body: formData
      });
      await loadAppCustomization(tenantId);
      setError(null);
      setMessage("Logo atualizada com sucesso.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar logo");
    }
  };

  const handleAppSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedAppCityId) return;

    const settings =
      appSettings[selectedAppCityId] ?? createDefaultAppCustomization({ tenantId: selectedAppCityId });

    const payload: Record<string, unknown> = {
      primary_color: settings.primaryColor,
      secondary_color: settings.secondaryColor,
      weather_provider: settings.weatherProvider ?? null,
      weather_api_key: settings.weatherApiKey ?? null,
      welcome_message: settings.welcomeMessage ?? null,
      enable_push: settings.enablePush,
      enable_weather: settings.enableWeather
    };

    try {
      await authorizedFetch(`/saas/tenants/${selectedAppCityId}/app`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      const city = cityInsights.find((item) => item.tenant_id === selectedAppCityId);
      setMessage(`Customizações do app de ${city?.name ?? "cidade selecionada"} atualizadas.`);
      setError(null);
      await loadAppCustomization(selectedAppCityId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar personalização");
    }
  };

  const renderIcon = (icon: string) => {
    switch (icon) {
      case "home":
        return (
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 11.25L12 3l9 8.25v9.5a.75.75 0 01-.75.75h-5.25a.75.75 0 01-.75-.75V14.25h-4.5v6.5a.75.75 0 01-.75.75H3.75a.75.75 0 01-.75-.75v-9.5z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      case "building":
        return (
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3.75 21.75h16.5M5.25 21.75V4.5a.75.75 0 01.75-.75h4.5a.75.75 0 01.75.75v17.25m-6 0h6m0 0V9a.75.75 0 01.75-.75h4.5a.75.75 0 01.75.75v12.75m-6 0h6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      case "cloud":
        return (
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4.5 15.75a4.5 4.5 0 010-9c.69 0 1.342.147 1.931.41A6 6 0 0118 7.5a4.5 4.5 0 01.75 8.928" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      case "projects":
        return (
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path
              d="M9 3h6a2 2 0 012 2v2H7V5a2 2 0 012-2zM7 7h10v12a2 2 0 01-2 2H9a2 2 0 01-2-2V7z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M9.5 11h5M9.5 15H13" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      case "finance":
        return (
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path
              d="M12 3v18m5.5-14H9.75a2.25 2.25 0 100 4.5H14a2.25 2.25 0 010 4.5H6.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        );
      case "app":
        return (
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3.75" y="3.75" width="16.5" height="16.5" rx="3" ry="3" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M8.25 7.5h.01M12 7.5h.01M15.75 7.5h.01M7.5 12h9M7.5 15.75h4.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      case "settings":
        return (
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path
              d="M11.25 2.25h1.5l.34 2.7a6.996 6.996 0 012.3.963l2.308-1.336 1.06 1.06-1.336 2.308c.41.69.715 1.462.88 2.3l2.7.34v1.5l-2.7.34a6.996 6.996 0 01-.963 2.3l1.336 2.308-1.06 1.06-2.308-1.336c-.69.41-1.462.715-2.3.88l-.34 2.7h-1.5l-.34-2.7a6.996 6.996 0 01-2.3-.963l-2.308 1.336-1.06-1.06 1.336-2.308a6.996 6.996 0 01-.88-2.3l-2.7-.34v-1.5l2.7-.34c.165-.838.47-1.61.88-2.3L4.53 5.677l1.06-1.06 2.308 1.336c.69-.41 1.462-.715 2.3-.88l.34-2.7z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M12 9a3 3 0 100 6 3 3 0 000-6z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      case "city":
        return (
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4.5 21.75h15" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M6 21.75V5.25a.75.75 0 01.75-.75H10.5v17.25" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M13.5 21.75V9.75a.75.75 0 01.75-.75H18a.75.75 0 01.75.75v12" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M9 7.5h.01M9 11.25h.01M9 15h.01M9 18.75h.01M15.75 12h.01M15.75 15.75h.01M15.75 19.5h.01" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      case "access":
        return (
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 3a9 9 0 100 18 9 9 0 000-18z" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M12 7.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3z" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M12 12v5.25" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      case "team":
        return (
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M15.75 6A3.75 3.75 0 1112 2.25 3.75 3.75 0 0115.75 6zm-7.5 5.25A3.75 3.75 0 114.5 7.5a3.75 3.75 0 013.75 3.75zm8.25 7.5a3.75 3.75 0 10-7.5 0" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2.905 21.75a6.38 6.38 0 0110.19-4.926M21.095 21.75a6.378 6.378 0 00-5.206-6.279" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      case "support":
        return (
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 6a6 6 0 00-6 6v4.5A1.5 1.5 0 007.5 18h9a1.5 1.5 0 001.5-1.5V12a6 6 0 00-6-6zm0 0V3m0 15v3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      default:
        return null;
    }
  };

  const renderOverview = () => {
    const cards = [
      { label: "Cidadãos cadastrados", value: formatNumber(derivedMetrics.citizens_total) },
      { label: "Gestores", value: formatNumber(derivedMetrics.managers_total) },
      { label: "Secretários", value: formatNumber(derivedMetrics.secretaries_total) },
      { label: "Solicitações realizadas", value: formatNumber(derivedMetrics.requests_total) },
      { label: "Solicitações resolvidas", value: formatNumber(derivedMetrics.requests_resolved) },
      { label: "Solicitações pendentes", value: formatNumber(derivedMetrics.requests_pending) },
      { label: "Prefeituras ativas", value: formatNumber(derivedMetrics.tenants_active) },
      { label: "Prefeituras totais", value: formatNumber(derivedMetrics.tenants_total) },
      { label: "Volume de tráfego", value: `${formatNumber(derivedMetrics.traffic_gb)} GB` },
      { label: "MRR", value: formatCurrency(derivedMetrics.mrr) },
      { label: "Previsão de despesas", value: formatCurrency(derivedMetrics.expenses_forecast) },
      { label: "Previsão de receita", value: formatCurrency(derivedMetrics.revenue_forecast) },
      { label: "Funcionários Urbanbyte", value: formatNumber(derivedMetrics.staff_total) },
      { label: "Online agora", value: formatNumber(derivedMetrics.users_online) },
      { label: "Total de acessos", value: formatNumber(derivedMetrics.total_accesses) }
    ];

    const displayProjects = projects.length ? projects : DEFAULT_PROJECTS;

    return (
      <div className="dashboard-section">
        <section className="dashboard-hero">
          <div className="hero-copy">
            <h2>Bem-vindo ao gerenciador operacional da UrbanByte</h2>
            <p>
              Gerencie DNS, onboarding, equipe e health-checks de todos os tenants com um visual moderno e
              ações rápidas.
            </p>
            <div className="hero-actions">
              <button type="button" className="topbar-primary" onClick={() => setActiveSection("tenants")}>
                Provisionar nova prefeitura
              </button>
              <button type="button" className="topbar-button">Ver tour</button>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true" />
        </section>

        <header className="dashboard-section__header">
          <h2>Visão geral</h2>
          <p>Indicadores operacionais consolidados do SaaS municipal.</p>
        </header>

        <div className="metric-row">
          {cards.map((card) => (
            <article key={card.label} className="metric-tile">
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </article>
          ))}
        </div>

        <section className="panel-grid">
          <article className="panel-card">
            <MonitorDashboard onStatsChange={monitorStatsHandler} />
          </article>
          <article className="panel-card compact">
            <div className="panel-heading">
              <div>
                <h3>Projetos em desenvolvimento</h3>
                <p>Roadmap público de novos módulos e integrações.</p>
              </div>
            </div>
            <ul className="projects-list">
              {displayProjects.map((project) => (
                <li key={project.id}>
                  <div>
                    <strong>{project.name}</strong>
                    <span>{projectStatusLabel(project.status)}</span>
                  </div>
                  {project.description && <p>{project.description}</p>}
                  {project.progress != null && (
                    <div className="progress-bar" aria-label="Progresso do projeto">
                      <div style={{ width: `${Math.min(Math.max(project.progress, 0), 100)}%` }} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </article>
        </section>

        <section className="panel-grid two-columns">
          <article className="panel-card retention-card">
            <div className="panel-heading">
              <div>
                <h3>Retenção de prefeituras</h3>
                <p>Cohorts mensais com churn, expansão e NPS médio.</p>
              </div>
              <span className="badge">Ativas: {retentionSummary.active_tenants}</span>
            </div>
            <div className="retention-kpis">
              <div>
                <span>Churn 90d</span>
                <strong>{formatPercent(retentionSummary.churn_rate)}</strong>
              </div>
              <div>
                <span>Expansão</span>
                <strong>{formatPercent(retentionSummary.expansion_rate)}</strong>
              </div>
              <div>
                <span>NPS global</span>
                <strong>{retentionSummary.nps_global}</strong>
              </div>
            </div>
            <table className="retention-table">
              <thead>
                <tr>
                  <th>Mês</th>
                  <th>Prefeituras</th>
                  <th>Churn</th>
                  <th>Expansão</th>
                  <th>NPS</th>
                  <th>Engajamento</th>
                </tr>
              </thead>
              <tbody>
                {retentionSummary.cohorts.map((cohort) => (
                  <tr key={cohort.month}>
                    <td>{cohort.month}</td>
                    <td>{cohort.tenants}</td>
                    <td>{formatPercent(cohort.churn)}</td>
                    <td>{formatPercent(cohort.expansion)}</td>
                    <td>{cohort.nps}</td>
                    <td>{formatPercent(cohort.engagement)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>

          <article className="panel-card analytics-card">
            <div className="panel-heading">
              <div>
                <h3>Analytics de uso</h3>
                <p>Módulos mais acessados e funil de solicitações cidadãs.</p>
              </div>
            </div>
            <div className="analytics-heatmap">
              {usageAnalytics.heatmap.map((item) => (
                <div key={item.module} className="heatmap-row">
                  <strong>{item.module}</strong>
                  <div className="heatmap-bars">
                    {item.usage.map((value, index) => (
                      <span
                        key={`${item.module}-${index}`}
                        style={{ '--bar-value': `${Math.min(value / Math.max(...item.usage, 1), 1)}` } as CSSProperties}
                      >
                        <em>{item.labels[index]}</em>
                        <b>{value}</b>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="analytics-funnel">
              <h4>Funil do cidadão</h4>
              <ul>
                {usageAnalytics.citizen_funnel.map((stage) => (
                  <li key={stage.stage}>
                    <div>
                      <strong>{stage.stage}</strong>
                      <span>{formatNumber(stage.value)} usuários</span>
                    </div>
                    <span className="funnel-conversion">{stage.conversion}%</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="analytics-ranking">
              <h4>Secretarias destaque</h4>
              <ol>
                {usageAnalytics.top_secretariats.map((item) => (
                  <li key={item.name}>
                    <span>{item.name}</span>
                    <strong>{formatNumber(item.interactions)}</strong>
                  </li>
                ))}
              </ol>
            </div>
          </article>
        </section>

        <section className="panel-grid two-columns">
          <article className="panel-card compliance-card">
            <div className="panel-heading">
              <div>
                <h3>Automação de compliance</h3>
                <p>Auditorias, SLA de chamados e relatórios para órgãos de controle.</p>
              </div>
              <span className="badge">{complianceRecords.length} tenant(s)</span>
            </div>
            <div className="compliance-list">
              {complianceRecords.map((record) => (
                <div key={record.tenant_id} className="compliance-item">
                  <header>
                    <strong>{record.tenant_name}</strong>
                    <span>{record.reports.filter((report) => report.status !== "Entregue").length} pendente(s)</span>
                  </header>
                  <div className="compliance-audits">
                    <h4>Auditorias recentes</h4>
                    <ul>
                      {record.audits.map((audit) => (
                        <li key={audit.id} className={audit.sla_breach ? "is-alert" : ""}>
                          <div>
                            <strong>{audit.action}</strong>
                            <span>{audit.actor}</span>
                          </div>
                          <span>{new Date(audit.performed_at).toLocaleString("pt-BR")}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="compliance-reports">
                    <h4>Relatórios</h4>
                    <ul>
                      {record.reports.map((report) => (
                        <li key={report.id}>
                          <div>
                            <strong>{report.title}</strong>
                            <span>{report.period}</span>
                          </div>
                          <span className={`status-pill ${report.status === "Entregue" ? "is-paid" : "is-pending"}`}>
                            {report.status}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="panel-card communication-card">
            <div className="panel-heading">
              <div>
                <h3>Hub de comunicação</h3>
                <p>Anúncios internos, push notifications e histórico para auditoria.</p>
              </div>
              <div className="communication-tabs">
                <button
                  type="button"
                  className={communicationFilter === "queue" ? "is-active" : ""}
                  onClick={() => setCommunicationFilter("queue")}
                >
                  Aprovações pendentes ({communicationCenter.push_queue.length})
                </button>
                <button
                  type="button"
                  className={communicationFilter === "history" ? "is-active" : ""}
                  onClick={() => setCommunicationFilter("history")}
                >
                  Histórico ({communicationCenter.history.length})
                </button>
              </div>
            </div>

            <div className="communication-announcements">
              <h4>Anúncios recentes</h4>
              <ul>
                {communicationCenter.announcements.map((item) => (
                  <li key={item.id}>
                    <div>
                      <strong>{item.title}</strong>
                      <span>{item.audience}</span>
                    </div>
                    <span>{new Date(item.published_at).toLocaleDateString("pt-BR")}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="communication-queue">
              <h4>{communicationFilter === "queue" ? "Notificações para aprovar" : "Histórico de push"}</h4>
              <ul>
                {(communicationFilter === "queue"
                  ? communicationCenter.push_queue
                  : communicationCenter.history
                ).map((request) => (
                  <li key={request.id} className={`push-item status-${request.status}`}>
                    <div>
                      <strong>{request.subject}</strong>
                      <span>
                        {request.tenant_name} • {request.channel}
                      </span>
                      {request.summary && <p>{request.summary}</p>}
                    </div>
                    <div className="push-meta">
                      <span>{new Date(request.created_at).toLocaleString("pt-BR")}</span>
                      {request.scheduled_for && <span>Envio: {new Date(request.scheduled_for).toLocaleString("pt-BR")}</span>}
                      <div className="push-actions">
                        {communicationFilter === "queue" ? (
                          <>
                            <button type="button">Aprovar</button>
                            <button type="button">Rejeitar</button>
                          </>
                        ) : (
                          <span className={`status-pill ${request.status === "approved" ? "is-paid" : "is-pending"}`}>
                            {request.status}
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </article>
        </section>
      </div>
    );
  };

  const renderAutomation = () => (
    <div className="dashboard-section">
      <header className="dashboard-section__header">
        <h2>Automação & DNS</h2>
        <p>Operações de provisionamento Cloudflare e monitoramento de domínios.</p>
      </header>
      <article className="panel-card">
        <CloudflareSettings />
      </article>
    </div>
  );

  const renderProjects = () => (
    <div className="dashboard-section">
      <header className="dashboard-section__header">
        <h2>Projetos & Roadmap</h2>
        <p>Acompanhe squads, tarefas e progresso das entregas estratégicas.</p>
      </header>

      <div className="panel-stack">
        <article className="panel-card">
          <div className="panel-heading">
            <div>
              <h3>Portfólio ativo</h3>
              <p>Monitoramento contínuo das iniciativas em execução.</p>
            </div>
            <span className="badge">{projectSummary.total} projetos</span>
          </div>

          <div className="metric-row compact">
            <article className="metric-tile">
              <span>Projetos ativos</span>
              <strong>{projectSignals.active}</strong>
            </article>
            <article className="metric-tile">
              <span>Concluídos</span>
              <strong>{projectSummary.completed}</strong>
            </article>
            <article className="metric-tile">
              <span>Progresso médio</span>
              <strong>{formatPercent(projectSummary.avgProgress || 0)}</strong>
            </article>
            <article className="metric-tile">
              <span>Atividades em alerta</span>
              <strong>{projectSignals.attention}</strong>
            </article>
          </div>

          <ul className="project-board-list">
            {projectBoard.map((project) => {
              const isActive = selectedProject?.id === project.id;
              return (
                <li key={project.id} className={`project-board-item ${isActive ? "is-active" : ""}`}>
                  <div className="project-board-head">
                    <div>
                      <strong>{project.name}</strong>
                      <span>{projectStatusLabel(project.status)}</span>
                    </div>
                    <button type="button" onClick={() => setActiveProjectId(project.id)}>
                      Detalhes
                    </button>
                  </div>
                  <div className="project-progress-bar">
                    <div style={{ width: `${Math.min(project.progress, 100)}%` }} />
                  </div>
                  <div className="project-board-meta">
                    <span>{project.tasks.length} atividade(s)</span>
                    <span>{formatPercent(project.progress)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </article>

        <article className="panel-card compact">
          <div className="panel-heading">
            <div>
              <h3>Novo projeto estratégico</h3>
              <p>Defina escopo, responsável e janela de entrega.</p>
            </div>
          </div>
          <form className="form-grid" onSubmit={handleCreateProject}>
            <label className="form-field">
              Nome do projeto
              <input
                value={projectForm.name}
                onChange={(event) =>
                  setProjectForm((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="Ex.: Aplicativo Urbanbyte Cidadão"
              />
            </label>
            <label className="form-field">
              Status
              <select
                value={projectForm.status}
                onChange={(event) =>
                  setProjectForm((prev) => ({ ...prev, status: event.target.value }))
                }
              >
                {PROJECT_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              Líder responsável
              <input
                value={projectForm.lead}
                onChange={(event) =>
                  setProjectForm((prev) => ({ ...prev, lead: event.target.value }))
                }
                placeholder="Nome do gestor"
              />
            </label>
            <label className="form-field">
              Data alvo
              <input
                type="date"
                value={projectForm.targetDate}
                onChange={(event) =>
                  setProjectForm((prev) => ({ ...prev, targetDate: event.target.value }))
                }
              />
            </label>
            <label className="form-field span-2">
              Descrição
              <textarea
                rows={3}
                value={projectForm.description}
                onChange={(event) =>
                  setProjectForm((prev) => ({ ...prev, description: event.target.value }))
                }
                placeholder="Contextualize objetivos, stakeholders e entregáveis."
              />
            </label>
            <div className="form-actions span-2">
              <button type="submit" className="topbar-primary">
                Cadastrar projeto
              </button>
            </div>
          </form>
        </article>
      </div>

      <article className="panel-card">
        {selectedProject ? (
          <div className="project-detail">
            <div className="project-detail-header">
              <div>
                <h3>{selectedProject.name}</h3>
                {selectedProject.description && <p>{selectedProject.description}</p>}
              </div>
              <div className="project-detail-controls">
                <label>
                  Status
                  <select
                    value={selectedProject.status}
                    onChange={(event) =>
                      handleProjectStatusChange(selectedProject.id, event.target.value)
                    }
                  >
                    {PROJECT_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="project-progress-pill">
                  {formatPercent(Math.min(selectedProject.progress, 100))}
                </div>
              </div>
            </div>

            <div className="project-detail-meta">
              <div>
                <span>Responsável</span>
                <strong>{selectedProject.lead || "—"}</strong>
              </div>
              <div>
                <span>Atividades</span>
                <strong>{selectedProject.tasks.length}</strong>
              </div>
              <div>
                <span>Atualizado em</span>
                <strong>{new Date(selectedProject.updated_at).toLocaleString("pt-BR")}</strong>
              </div>
            </div>

            <form className="task-form" onSubmit={handleAddTask}>
              <h4>Registrar atividade</h4>
              <div className="task-form-grid">
                <label>
                  Título
                  <input
                    value={taskForm.title}
                    onChange={(event) =>
                      setTaskForm((prev) => ({ ...prev, title: event.target.value }))
                    }
                    placeholder="Ex.: Integração com Neon"
                  />
                </label>
                <label>
                  Responsável
                  <input
                    value={taskForm.owner}
                    onChange={(event) =>
                      setTaskForm((prev) => ({ ...prev, owner: event.target.value }))
                    }
                    placeholder="Colaborador"
                  />
                </label>
                <label>
                  Prazo
                  <input
                    type="date"
                    value={taskForm.dueDate}
                    onChange={(event) =>
                      setTaskForm((prev) => ({ ...prev, dueDate: event.target.value }))
                    }
                  />
                </label>
                <label className="span-2">
                  Notas
                  <textarea
                    rows={2}
                    value={taskForm.notes}
                    onChange={(event) =>
                      setTaskForm((prev) => ({ ...prev, notes: event.target.value }))
                    }
                    placeholder="Detalhes, dependências ou checkpoints."
                  />
                </label>
              </div>
              <div className="form-actions">
                <button type="submit" className="topbar-primary">
                  Adicionar atividade
                </button>
              </div>
            </form>

            <div className="project-tasks">
              <h4>Backlog & execução</h4>
              {selectedProject.tasks.length === 0 ? (
                <p className="muted">Nenhuma atividade registrada até o momento.</p>
              ) : (
                <ul className="project-task-list">
                  {selectedProject.tasks.map((task) => (
                    <li key={task.id}>
                      <div className="task-main">
                        <div>
                          <strong>{task.title}</strong>
                          <span>
                            {task.owner ?? "Equipe"} • {task.due_date
                              ? new Date(task.due_date).toLocaleDateString("pt-BR")
                              : "Sem prazo"}
                          </span>
                          {task.notes && <p>{task.notes}</p>}
                        </div>
                        <div className="task-actions">
                          <select
                            value={task.status}
                            onChange={(event) =>
                              handleTaskStatusChange(
                                selectedProject.id,
                                task.id,
                                event.target.value as ProjectTask["status"]
                              )
                            }
                          >
                            {TASK_STATUS_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => handleRemoveTask(selectedProject.id, task.id)}
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                      <div className={`task-status task-${task.status}`}>
                        {task.status === "done"
                          ? `Concluído ${task.completed_at ? new Date(task.completed_at).toLocaleDateString("pt-BR") : ""}`
                          : TASK_STATUS_OPTIONS.find((option) => option.value === task.status)?.label}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <p className="muted">Cadastre um projeto para iniciar o acompanhamento.</p>
        )}
      </article>
    </div>
  );

  const selectedTenant = tenants.find((tenant) => tenant.id === selectedTenantId) ?? null;
  const selectedContract = selectedTenant ? getContractForm(selectedTenant.id) : createDefaultContractForm();

  const renderFinance = () => (
    <div className="dashboard-section">
      <header className="dashboard-section__header">
        <h2>Financeiro & caixa</h2>
        <p>Controle fluxos de entrada, despesas operacionais e anexos fiscais.</p>
      </header>

      <div className="panel-stack">
        <article className="panel-card">
          <div className="panel-heading">
            <div>
              <h3>Resumo financeiro</h3>
              <p>Indicadores consolidados do período selecionado.</p>
            </div>
          </div>

          <div className="finance-summary">
            <div>
              <span>Entradas</span>
              <strong>{formatCurrency(financeSummary.cash_in)}</strong>
            </div>
            <div>
              <span>Saídas</span>
              <strong>{formatCurrency(financeSummary.cash_out)}</strong>
            </div>
            <div>
              <span>Saldo projetado</span>
              <strong className={financeSummary.net >= 0 ? "positive" : "negative"}>
                {formatCurrency(financeSummary.net)}
              </strong>
            </div>
            <div>
              <span>Em aberto</span>
              <strong>{formatCurrency(financeSummary.pending)}</strong>
            </div>
          </div>

          <div className="finance-filter">
            <button
              type="button"
              className={financeFilter === "all" ? "is-active" : ""}
              onClick={() => setFinanceFilter("all")}
            >
              Todos
            </button>
            <button
              type="button"
              className={financeFilter === "pending" ? "is-active" : ""}
              onClick={() => setFinanceFilter("pending")}
            >
              Pendentes ({financePending})
            </button>
            <button
              type="button"
              className={financeFilter === "paid" ? "is-active" : ""}
              onClick={() => setFinanceFilter("paid")}
            >
              Quitados
            </button>
          </div>

          <div className="finance-table-wrapper">
            {filteredFinanceEntries.length === 0 ? (
              <p className="muted">Nenhum lançamento encontrado para o filtro atual.</p>
            ) : (
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>Descrição</th>
                    <th>Tipo</th>
                    <th>Categoria</th>
                    <th>Valor</th>
                    <th>Vencimento</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFinanceEntries.map((entry) => (
                    <tr key={entry.id}>
                      <td>
                        <strong>{entry.description}</strong>
                        {entry.notes && <span>{entry.notes}</span>}
                      </td>
                      <td>{FINANCE_TYPE_LABELS[entry.entry_type]}</td>
                      <td>{entry.category}</td>
                      <td>{formatCurrency(entry.amount)}</td>
                      <td>
                        {entry.due_date
                          ? new Date(entry.due_date).toLocaleDateString("pt-BR")
                          : "—"}
                      </td>
                      <td>
                        <span className={`status-pill ${entry.paid ? "is-paid" : "is-pending"}`}>
                          {entry.paid ? "Pago" : "Pendente"}
                        </span>
                      </td>
                      <td>
                        <button type="button" onClick={() => handleFinanceTogglePaid(entry.id, entry.paid)}>
                          {entry.paid ? "Reabrir" : "Dar baixa"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </article>

        <article className="panel-card compact">
          <div className="panel-heading">
            <div>
              <h3>Novo lançamento</h3>
              <p>Registre receitas, despesas e anexos comprobatórios.</p>
            </div>
          </div>
          <form className="form-grid" onSubmit={handleCreateFinanceEntry}>
            <label className="form-field">
              Descrição
              <input
                value={financeForm.description}
                onChange={(event) => handleFinanceFieldChange("description", event.target.value)}
                placeholder="Ex.: Pagamento equipe de suporte"
              />
            </label>
            <label className="form-field">
              Tipo
              <select
                value={financeForm.entryType}
                onChange={(event) =>
                  handleFinanceFieldChange(
                    "entryType",
                    event.target.value as FinanceEntry["entry_type"]
                  )
                }
              >
                {FINANCE_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              Categoria
              <select
                value={financeForm.category}
                onChange={(event) => handleFinanceFieldChange("category", event.target.value)}
              >
                {FINANCE_CATEGORY_OPTIONS.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              Valor
              <input
                value={financeForm.amount}
                onChange={(event) => handleFinanceFieldChange("amount", event.target.value)}
                placeholder="0,00"
              />
            </label>
            <label className="form-field">
              Vencimento
              <input
                type="date"
                value={financeForm.dueDate}
                onChange={(event) => handleFinanceFieldChange("dueDate", event.target.value)}
              />
            </label>
            <label className="form-field">
              Forma de pagamento
              <select
                value={financeForm.method}
                onChange={(event) => handleFinanceFieldChange("method", event.target.value)}
              >
                {FINANCE_METHOD_OPTIONS.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              Centro de custo
              <input
                value={financeForm.costCenter}
                onChange={(event) => handleFinanceFieldChange("costCenter", event.target.value)}
                placeholder="Ex.: Operações"
              />
            </label>
            <label className="form-field">
              Responsável
              <input
                value={financeForm.responsible}
                onChange={(event) => handleFinanceFieldChange("responsible", event.target.value)}
                placeholder="Nome do aprovador"
              />
            </label>
            <label className="form-field span-2">
              Observações
              <textarea
                rows={2}
                value={financeForm.notes}
                onChange={(event) => handleFinanceFieldChange("notes", event.target.value)}
                placeholder="Detalhes adicionais, parcelamentos, referências."
              />
            </label>
            <label className="form-field span-2">
              Comprovantes
              <input type="file" multiple onChange={handleFinanceAttachmentChange} />
            </label>
            {financeForm.attachments.length > 0 && (
              <ul className="attachment-list span-2">
                {financeForm.attachments.map((attachment) => (
                  <li key={attachment.id}>
                    <span>{attachment.name}</span>
                    <button type="button" onClick={() => handleFinanceAttachmentRemove(attachment.id)}>
                      Remover
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="form-actions span-2">
              <button type="submit" className="topbar-primary">
                Registrar lançamento
              </button>
            </div>
          </form>
        </article>
      </div>
    </div>
  );

  const renderConfig = () => (
    <div className="dashboard-section">
      <header className="dashboard-section__header">
        <h2>Configurações</h2>
        <p>Defina padrões de contato, integrações e preferências da conta SaaS.</p>
      </header>

      <article className="panel-card">
        <form className="config-grid" onSubmit={handleConfigSubmit}>
          <div className="config-section">
            <h3>Contato padrão</h3>
            <label>
              E-mail de notificações
              <input
                type="email"
                value={configForm.defaultEmail}
                onChange={(event) => handleConfigFieldChange("defaultEmail", event.target.value)}
                placeholder="notificacoes@urbanbyte.com.br"
              />
            </label>
            <label>
              Telefone (WhatsApp)
              <input
                value={configForm.defaultPhone}
                onChange={(event) => handleConfigFieldChange("defaultPhone", event.target.value)}
                placeholder="+55 83 99999-0000"
              />
            </label>
          </div>

          <div className="config-section">
            <h3>Integrações</h3>
            <label>
              Chave ChatGPT
              <input
                type="password"
                value={configForm.chatgptKey}
                onChange={(event) => handleConfigFieldChange("chatgptKey", event.target.value)}
                placeholder="sk-..."
              />
            </label>
            <label>
              Webhook Slack
              <input
                value={configForm.slackWebhook}
                onChange={(event) => handleConfigFieldChange("slackWebhook", event.target.value)}
                placeholder="https://hooks.slack.com/..."
              />
            </label>
          </div>

          <div className="config-section">
            <h3>Perfil</h3>
            <label>
              Nome exibido
              <input
                value={configForm.profileName}
                onChange={(event) => handleConfigFieldChange("profileName", event.target.value)}
                placeholder="Seu nome"
              />
            </label>
            <label>
              Foto de perfil
              <input type="file" accept="image/*" />
            </label>
          </div>

          <div className="config-section">
            <h3>Segurança</h3>
            <label>
              Nova senha
              <input
                type="password"
                value={configForm.password}
                onChange={(event) => handleConfigFieldChange("password", event.target.value)}
              />
            </label>
            <label>
              Confirmar senha
              <input
                type="password"
                value={configForm.confirmPassword}
                onChange={(event) => handleConfigFieldChange("confirmPassword", event.target.value)}
              />
            </label>
          </div>

          <div className="form-actions span-2">
            <button type="submit" className="topbar-primary">
              Salvar configurações
            </button>
          </div>
        </form>
      </article>
    </div>
  );

  const renderApp = () => {
    const currentAppSettings =
      appSettings[selectedAppCityId] ?? createDefaultAppCustomization({ tenantId: selectedAppCityId });
    return (
      <div className="dashboard-section">
        <header className="dashboard-section__header">
          <h2>Configuração do APP</h2>
          <p>Personalize identidade, integrações e recursos para cada cidade.</p>
        </header>

        <article className="panel-card">
          <form className="app-form" onSubmit={handleAppSubmit}>
            <div className="app-header">
              <label>
                Cidade
                <select
                  value={selectedAppCityId}
                  onChange={(event) => setSelectedAppCityId(event.target.value)}
                >
                  {cityInsights.map((city) => (
                    <option key={`app-${city.tenant_id}`} value={city.tenant_id}>
                      {city.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="topbar-primary">
                Salvar personalização
              </button>
            </div>

            <div className="app-grid">
              <section>
                <h3>Identidade visual</h3>
                <label>
                  Logo do app
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) =>
                      handleAppLogoUpload(selectedAppCityId, event.target.files)
                    }
                  />
                </label>
                {currentAppSettings.logoUrl && (
                  <p className="muted">
                    <a
                      href={currentAppSettings.logoUrl ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Visualizar logo atual
                    </a>
                  </p>
                )}
                <label>
                  Cor primária
                  <input
                    type="color"
                    value={currentAppSettings.primaryColor}
                    onChange={(event) =>
                      updateAppSettings(selectedAppCityId, { primaryColor: event.target.value })
                    }
                  />
                </label>
                <label>
                  Cor secundária
                  <input
                    type="color"
                    value={currentAppSettings.secondaryColor}
                    onChange={(event) =>
                      updateAppSettings(selectedAppCityId, { secondaryColor: event.target.value })
                    }
                  />
                </label>
              </section>

              <section>
                <h3>Conteúdo e mensagens</h3>
                <label>
                  Mensagem de boas-vindas
                  <textarea
                    rows={3}
                    value={currentAppSettings.welcomeMessage ?? ""}
                    onChange={(event) =>
                      updateAppSettings(selectedAppCityId, {
                        welcomeMessage: event.target.value
                      })
                    }
                  />
                </label>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={currentAppSettings.enablePush}
                    onChange={(event) =>
                      updateAppSettings(selectedAppCityId, { enablePush: event.target.checked })
                    }
                  />
                  <span>Ativar push transacionais automáticos</span>
                </label>
              </section>

              <section>
                <h3>Serviços conectados</h3>
                <label>
                  Provedor de clima
                  <select
                    value={currentAppSettings.weatherProvider ?? "OpenWeather"}
                    onChange={(event) =>
                      updateAppSettings(selectedAppCityId, { weatherProvider: event.target.value })
                    }
                  >
                    <option value="OpenWeather">OpenWeather</option>
                    <option value="Climatempo">Climatempo</option>
                    <option value="AccuWeather">AccuWeather</option>
                  </select>
                </label>
                <label>
                  API Key clima
                  <input
                    value={currentAppSettings.weatherApiKey ?? ""}
                    onChange={(event) =>
                      updateAppSettings(selectedAppCityId, { weatherApiKey: event.target.value })
                    }
                    placeholder="Informe a chave de API"
                  />
                </label>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={currentAppSettings.enableWeather}
                    onChange={(event) =>
                      updateAppSettings(selectedAppCityId, { enableWeather: event.target.checked })
                    }
                  />
                  <span>Exibir widget de previsão do tempo</span>
                </label>
              </section>
            </div>
          </form>
        </article>
      </div>
    );
  };


  const renderTenants = () => (
    <div className="dashboard-section">
      <header className="dashboard-section__header">
        <h2>Prefeituras</h2>
        <p>Fluxos de onboarding completos, anexos contratuais e acompanhamento financeiro.</p>
      </header>

      <div className="panel-grid two-columns">
        <article className="panel-card">
          <div className="panel-heading">
            <div>
              <h3>Onboarding de nova prefeitura</h3>
              <p>Personalize branding, contatos e equipe base.</p>
            </div>
            <span className="badge">Workflow assistido</span>
          </div>
          <TenantForm onCreated={handleCreated} />
        </article>
        <article className="panel-card compact">
          <TenantImport onImported={handleImport} />
        </article>
      </div>

      <article className="panel-card">
        <div className="panel-heading">
          <div>
            <h3>Gestão contratual</h3>
            <p>Controle módulos ativos, anexos e fluxo financeiro para cada prefeitura.</p>
          </div>
        </div>

        {tenants.length === 0 ? (
          <p className="muted">Cadastre uma prefeitura para começar.</p>
        ) : (
          <div className="contract-layout">
            <div className="contract-column">
              <label className="contract-label">
                Prefeitura
                <select
                  value={selectedTenantId}
                  onChange={(event) => setSelectedTenantId(event.target.value)}
                >
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.display_name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="contract-grid">
                <label className="contract-label">
                  Status operacional
                  <input value={STATUS_BADGES[selectedTenant?.status ?? ""] ?? selectedTenant?.status ?? "—"} disabled />
                </label>
                <label className="contract-label">
                  Status contratual
                  <select
                    value={selectedContract.status}
                    onChange={(event) =>
                      selectedTenant &&
                      updateContractForm(selectedTenant.id, { status: event.target.value })
                    }
                  >
                    {CONTRACT_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="contract-label">
                  Valor total do contrato (R$)
                  <input
                    placeholder="0,00"
                    value={selectedContract.contractValue}
                    onChange={(event) =>
                      selectedTenant &&
                      updateContractForm(selectedTenant.id, { contractValue: event.target.value })
                    }
                  />
                </label>
                <label className="contract-label">
                  Data de início
                  <input
                    type="date"
                    value={selectedContract.startDate}
                    onChange={(event) =>
                      selectedTenant &&
                      updateContractForm(selectedTenant.id, { startDate: event.target.value })
                    }
                  />
                </label>
                <label className="contract-label">
                  Renovação prevista
                  <input
                    type="date"
                    value={selectedContract.renewalDate}
                    onChange={(event) =>
                      selectedTenant &&
                      updateContractForm(selectedTenant.id, { renewalDate: event.target.value })
                    }
                  />
                </label>
              </div>

              <div className="module-grid">
                {MODULE_CATALOG.map((module) => (
                  <label
                    key={module.id}
                    className={`module-chip ${selectedContract.modules[module.id] ? "is-active" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(selectedContract.modules[module.id])}
                      onChange={() => selectedTenant && handleModuleToggle(selectedTenant.id, module.id)}
                    />
                    <span>{module.label}</span>
                  </label>
                ))}
              </div>

              <label className="contract-label">
                Observações internas
                <textarea
                  rows={4}
                  placeholder="Detalhes adicionais, SLA, cláusulas específicas..."
                  value={selectedContract.notes}
                  onChange={(event) =>
                    selectedTenant &&
                    updateContractForm(selectedTenant.id, { notes: event.target.value })
                  }
                />
              </label>
              <div className="form-actions">
                <button
                  type="button"
                  className="topbar-primary"
                  onClick={() => selectedTenant && handleContractSave(selectedTenant.id)}
                >
                  Salvar contrato
                </button>
              </div>
            </div>

            <div className="contract-column">
              <div className="contract-upload">
                <span>Contrato assinado</span>
                <input
                  type="file"
                  onChange={(event) =>
                    selectedTenant && handleContractFile(selectedTenant.id, event.target.files)
                  }
                />
                {selectedContract.contractFileUrl ? (
                  <p className="upload-item">
                    <a
                      href={selectedContract.contractFileUrl ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Abrir contrato vigente
                    </a>
                  </p>
                ) : (
                  <p className="muted">Anexe o PDF do contrato vigente.</p>
                )}
              </div>

              <div className="contract-upload">
                <span>Notas fiscais mensais</span>
                <input
                  type="file"
                  multiple
                  onChange={(event) =>
                    selectedTenant && handleInvoicesUpload(selectedTenant.id, event.target.files)
                  }
                />
                {selectedContract.invoices.length === 0 ? (
                  <p className="muted">Nenhuma nota fiscal anexada.</p>
                ) : (
                  <ul className="attachment-list">
                    {selectedContract.invoices.map((invoice) => (
                      <li key={invoice.id}>
                        <span>{invoice.referenceMonth ?? invoice.name}</span>
                        <small>{invoice.uploadedAt}</small>
                        {invoice.url && (
                          <a href={invoice.url} target="_blank" rel="noopener noreferrer">
                            Abrir
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => selectedTenant && handleRemoveInvoice(selectedTenant.id, invoice.id)}
                        >
                          Remover
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </article>

      <article className="panel-card">
        <div className="panel-heading">
          <div>
            <h3>Prefeituras cadastradas</h3>
            <p>Controle status de DNS, ativação e equipes municipais.</p>
          </div>
        </div>
        {isLoadingTenants ? (
          <p>Carregando…</p>
        ) : error ? (
          <p className="inline-error">{error}</p>
        ) : (
          <TenantTable tenants={tenants} onProvision={handleProvision} onCheckDNS={handleCheckDNS} />
        )}
      </article>
    </div>
  );

  const renderUrbanCity = () => (
    <div className="dashboard-section">
      <header className="dashboard-section__header">
        <h2>Urban Cidade</h2>
        <p>Visualize indicadores e relatórios específicos por município.</p>
      </header>

      <article className="panel-card city-card">
        <div className="panel-heading">
          <div>
            <h3>Panorama municipal</h3>
            <p>Selecione a cidade e exporte o relatório consolidado em PDF.</p>
          </div>
          <div className="city-actions">
            <label>
              Cidade
              <select value={selectedCityId} onChange={(event) => setSelectedCityId(event.target.value)}>
                {cityInsights.map((city) => (
                  <option key={city.tenant_id} value={city.tenant_id}>
                    {city.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="topbar-button"
              onClick={() => handleSyncCity(selectedCityId)}
            >
              Sincronizar agora
            </button>
            <button type="button" className="topbar-button">
              Exportar PDF
            </button>
          </div>
        </div>

        {selectedCity ? (
          <div className="city-overview">
            <div className="city-kpis">
              <div>
                <span>População</span>
                <strong>{formatNumber(selectedCity.population)}</strong>
              </div>
              <div>
                <span>Usuários ativos</span>
                <strong>{formatNumber(selectedCity.active_users)}</strong>
              </div>
              <div>
                <span>Solicitações</span>
                <strong>{formatNumber(selectedCity.requests_total)}</strong>
              </div>
              <div>
                <span>Satisfação</span>
                <strong>{formatPercent(selectedCity.satisfaction)}</strong>
              </div>
            </div>
            <div className="city-highlights">
              <h4>Destaques recentes</h4>
              <ul>
                {selectedCity.highlights.map((highlight, index) => (
                  <li key={`${selectedCity.tenant_id}-highlight-${index}`}>{highlight}</li>
                ))}
              </ul>
            </div>
            <div className="city-sync">
              <span>Última sincronização:</span>
              <strong>{new Date(selectedCity.last_sync).toLocaleString("pt-BR")}</strong>
            </div>
          </div>
        ) : (
          <p className="muted">Cadastre uma cidade para visualizar o panorama.</p>
        )}
      </article>
    </div>
  );

  const renderAccessLog = () => (
    <div className="dashboard-section">
      <header className="dashboard-section__header">
        <h2>Histórico de acessos</h2>
        <p>Monitoramento completo de autenticações com IP, geolocalização e status.</p>
      </header>

      <article className="panel-card access-card">
        <div className="panel-heading">
          <div>
            <h3>Eventos recentes</h3>
            <p>Sincronizado em tempo real com o serviço de auditoria SaaS.</p>
          </div>
          <button type="button" className="topbar-button">
            Exportar CSV
          </button>
        </div>

        <div className="access-charts">
          <div className="access-chart">
            <h4>Distribuição por cidade</h4>
            <div className="chart-bars">
              {accessAnalytics.cities.map((item) => {
                const max = Math.max(...accessAnalytics.cities.map((c) => c.value), 1);
                const width = Math.max((item.value / max) * 100, 8);
                return (
                  <div key={`city-${item.label}`}>
                    <span>{item.label}</span>
                    <div className="chart-bar">
                      <div style={{ width: `${width}%` }} />
                    </div>
                    <strong>{formatNumber(item.value)}</strong>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="access-chart grid">
            <div>
              <h4>Sistema operacional</h4>
              <ul>
                {accessAnalytics.operatingSystems.map((item) => {
                  const max = Math.max(...accessAnalytics.operatingSystems.map((os) => os.value), 1);
                  const width = Math.max((item.value / max) * 100, 8);
                  return (
                    <li key={`os-${item.label}`}>
                      <span>{item.label}</span>
                      <div className="chart-bar mini">
                        <div style={{ width: `${width}%` }} />
                      </div>
                      <strong>{formatNumber(item.value)}</strong>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div>
              <h4>Dispositivos</h4>
              <ul>
                {accessAnalytics.devices.map((item) => {
                  const max = Math.max(...accessAnalytics.devices.map((device) => device.value), 1);
                  const width = Math.max((item.value / max) * 100, 8);
                  return (
                    <li key={`device-${item.label}`}>
                      <span>{item.label}</span>
                      <div className="chart-bar mini">
                        <div style={{ width: `${width}%` }} />
                      </div>
                      <strong>{formatNumber(item.value)}</strong>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>

        <div className="access-table-wrapper">
          <table className="access-table">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Papel</th>
                <th>Prefeitura</th>
                <th>Horário</th>
                <th>IP</th>
                <th>Localização</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {accessLogs.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <strong>{entry.user}</strong>
                    <span>{entry.user_agent}</span>
                  </td>
                  <td>{entry.role}</td>
                  <td>{entry.tenant ?? "—"}</td>
                  <td>{new Date(entry.logged_at).toLocaleString("pt-BR")}</td>
                  <td>{entry.ip}</td>
                  <td>{entry.location}</td>
                  <td>
                    <span className={`status-pill ${entry.status === "Sucesso" ? "is-paid" : "is-pending"}`}>
                      {entry.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  );

  const renderTeam = () => (
    <div className="dashboard-section">
      <header className="dashboard-section__header">
        <h2>Equipe SaaS</h2>
        <p>Convide, gerencie papéis e mantenha governança da operação.</p>
      </header>
      <article className="panel-card">
        <SaasAdminManager />
      </article>
    </div>
  );

  const renderSupport = () => (
    <div className="dashboard-section">
      <header className="dashboard-section__header">
        <h2>Suporte & Tickets</h2>
        <p>Acompanhe interações com prefeituras e responda chamados críticos.</p>
      </header>
      <article className="panel-card">
        <SupportTickets tenants={tenants} onStatsChange={supportStatsHandler} />
      </article>
    </div>
  );

  return (
    <div className={`dashboard theme-${theme}`}>
      <div className="dashboard-theme">
        <header className="dashboard-topbar">
          <div className="topbar-info">
            <div className="topbar-monogram">UB</div>
            <div>
              <span className="topbar-caption">
                Conectado como {user ? user.name : "Operador"}
              </span>
              <strong>Painel Operacional</strong>
            </div>
          </div>
          <div className="topbar-actions">
            <button
              type="button"
              className="topbar-button"
              onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
            >
              <span>{theme === "dark" ? "☀️" : "🌙"}</span>
              <span className="hide-sm">Tema</span>
            </button>
            <button type="button" className="topbar-button hide-md">
              Demo
            </button>
            <button type="button" className="topbar-primary">
              Exportar
            </button>
            <div className="topbar-user">
              <div className="topbar-avatar">{userInitials}</div>
              <span className="topbar-user-name">{user?.name ?? "Operador"}</span>
            </div>
            <button type="button" className="topbar-button" onClick={logout}>
              Sair
            </button>
          </div>
        </header>

        <div className="dashboard-shell">
          <aside className="dashboard-sidebar">
            <div className="sidebar-header">
              <div className="sidebar-logo">
                <div className="sidebar-monogram">UB</div>
                <div>
                  <strong>Urbanbyte</strong>
                  <span>SaaS Control Center</span>
                </div>
              </div>
              <button
                type="button"
                className="sidebar-refresh"
                title="Atualizar"
                onClick={() => setActiveSection("overview")}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </div>

            <nav className="sidebar-nav">
              {NAV_ITEMS.map((item) => {
                const badge = navBadges[item.id] ?? 0;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`sidebar-link ${activeSection === item.id ? "is-active" : ""}`}
                    onClick={() => setActiveSection(item.id)}
                  >
                    <span className="sidebar-icon">{renderIcon(item.icon)}</span>
                    <span>{item.label}</span>
                    {badge > 0 && <span className="sidebar-badge">{badge}</span>}
                  </button>
                );
              })}
            </nav>

            <div className="sidebar-callout">
              <div className="callout-title">Onboarding acelerado</div>
              <p>Provisionamento automático de DNS, identidade e equipe inicial.</p>
              <button type="button" onClick={() => setActiveSection("tenants")}>Iniciar onboarding</button>
            </div>
          </aside>

          <main className="dashboard-main">
            <nav className="dashboard-mobile-nav">
              {NAV_ITEMS.map((item) => {
                const badge = navBadges[item.id] ?? 0;
                return (
                  <button
                    key={`mobile-${item.id}`}
                    type="button"
                    className={`mobile-nav-link ${activeSection === item.id ? "is-active" : ""}`}
                    onClick={() => setActiveSection(item.id)}
                  >
                    <span className="sidebar-icon">{renderIcon(item.icon)}</span>
                    <span>{item.label}</span>
                    {badge > 0 && <span className="nav-badge">{badge}</span>}
                  </button>
                );
              })}
            </nav>

            {(error || message) && (
              <div className="dashboard-banner">
                {error && <span className="dashboard-banner__error">{error}</span>}
                {message && <span className="dashboard-banner__success">{message}</span>}
              </div>
            )}

            {activeSection === "overview" && renderOverview()}
            {activeSection === "automation" && renderAutomation()}
            {activeSection === "projects" && renderProjects()}
            {activeSection === "finance" && renderFinance()}
            {activeSection === "app" && renderApp()}
            {activeSection === "config" && renderConfig()}
            {activeSection === "urban-city" && renderUrbanCity()}
            {activeSection === "access-log" && renderAccessLog()}
            {activeSection === "tenants" && renderTenants()}
            {activeSection === "admins" && renderTeam()}
            {activeSection === "support" && renderSupport()}

            <footer className="dashboard-footer">
              © {new Date().getFullYear()} Urbanbyte — Plataforma de Cidades Inteligentes
            </footer>
          </main>
        </div>
      </div>
    </div>
  );
}
