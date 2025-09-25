import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";

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
};

type ContractFormState = {
  status: string;
  contractValue: string;
  startDate: string;
  renewalDate: string;
  modules: Record<string, boolean>;
  contractFileName?: string;
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
  attachments: FinanceAttachment[];
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
  staff_total: 0
};

const DEFAULT_PROJECTS: DashboardProject[] = [
  {
    id: "urbanbyte-metrics",
    name: "Módulo de indicadores urbanos",
    status: "Discovery",
    description: "Levantamento de requisitos com prefeituras piloto.",
    progress: 25
  }
];

const DEFAULT_FINANCE_ENTRIES: FinanceEntry[] = [
  {
    id: "finance-op-001",
    entry_type: "expense",
    category: "Operacional",
    description: "Licenciamento plataforma GOV.BR",
    amount: 1890,
    due_date: new Date().toISOString().slice(0, 10),
    paid: false,
    method: "Transferência bancária",
    cost_center: "SaaS",
    responsible: "Equipe Operações",
    notes: "Renovação trimestral.",
    attachments: [],
    created_at: new Date().toISOString()
  },
  {
    id: "finance-rec-001",
    entry_type: "revenue",
    category: "Financeiro",
    description: "Fatura SaaS — Prefeitura de Zabelê",
    amount: 9200,
    due_date: new Date().toISOString().slice(0, 10),
    paid: true,
    paid_at: new Date().toISOString(),
    method: "PIX",
    cost_center: "Receita recorrente",
    responsible: "Financeiro",
    notes: "Pago via conciliação automática.",
    attachments: [],
    created_at: new Date().toISOString()
  }
];

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
  { value: "rascunho", label: "Rascunho" },
  { value: "em-analise", label: "Em análise" },
  { value: "ativo", label: "Ativo" },
  { value: "em-renovacao", label: "Em renovação" },
  { value: "encerrado", label: "Encerrado" }
];

const PROJECT_STATUS_OPTIONS = [
  { value: "Discovery", label: "Discovery" },
  { value: "Em andamento", label: "Em andamento" },
  { value: "Em validação", label: "Em validação" },
  { value: "Concluído", label: "Concluído" }
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
  status: "rascunho",
  contractValue: "",
  startDate: "",
  renewalDate: "",
  modules: MODULE_CATALOG.reduce<Record<string, boolean>>((acc, module) => {
    acc[module.id] = false;
    return acc;
  }, {}),
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

const makeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const dashboardProjectToRecord = (project: DashboardProject): ProjectRecord => ({
  id: project.id,
  name: project.name,
  description: project.description ?? "",
  status: project.status ?? "Em andamento",
  progress: project.progress ?? 0,
  lead: project.owner ?? "",
  squad: [],
  started_at: project.updated_at ?? new Date().toISOString(),
  target_date: undefined,
  tasks: [],
  updated_at: new Date().toISOString()
});

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

const withUpdatedTasks = (project: ProjectRecord, tasks: ProjectTask[]): ProjectRecord => {
  const progress = computeProjectProgress(tasks, project.progress);
  const status = progress >= 100 ? "Concluído" : project.status;
  return {
    ...project,
    tasks,
    progress,
    status,
    updated_at: new Date().toISOString()
  };
};

export default function DashboardPage() {
  const { user, logout, authorizedFetch } = useAuth();

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

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("dashboard-theme", theme);
      document.documentElement.classList.toggle("dark", theme === "dark");
    }
  }, [theme]);

  useEffect(() => {
    if (!user) {
      setTenants([]);
      setIsLoadingTenants(false);
      return;
    }

    const load = async () => {
      try {
        setIsLoadingTenants(true);
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
        if (list.length && !selectedTenantId) {
          setSelectedTenantId(list[0].id);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Falha ao carregar prefeituras";
        setError(msg);
      } finally {
        setIsLoadingTenants(false);
      }
    };

    void load();
  }, [authorizedFetch, user, selectedTenantId]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await authorizedFetch<DashboardOverviewResponse>(
          "/saas/metrics/overview"
        );
        if (cancelled) return;
        const metrics = response?.metrics ?? {};
        setOverviewMetrics((prev) => ({ ...prev, ...metrics }));
        setProjects(
          response?.projects && response.projects.length > 0 ? response.projects : DEFAULT_PROJECTS
        );
      } catch (err) {
        // Mantém métricas padrão se a API não estiver disponível
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [authorizedFetch]);

  useEffect(() => {
    if (!tenants.length) return;
    if (!selectedTenantId) {
      setSelectedTenantId(tenants[0].id);
    }
  }, [tenants, selectedTenantId]);

  useEffect(() => {
    if (!projects.length) return;
    setProjectBoard((prev) => {
      const map = new Map(prev.map((project) => [project.id, project] as const));
      const nowIso = new Date().toISOString();
      projects.forEach((project, index) => {
        const id = project.id || `project-${index}`;
        const current = map.get(id);
        const tasks = current?.tasks ?? [];
        const progress = computeProjectProgress(tasks, project.progress ?? current?.progress ?? 0);
        map.set(id, {
          id,
          name: project.name,
          description: project.description ?? current?.description ?? "",
          status: project.status ?? current?.status ?? "Em andamento",
          progress,
          lead: project.owner ?? current?.lead ?? "",
          squad: current?.squad ?? [],
          started_at: current?.started_at ?? project.updated_at ?? nowIso,
          target_date: current?.target_date,
          tasks,
          updated_at: nowIso
        });
      });
      return Array.from(map.values());
    });
  }, [projects]);

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
    const active = projectBoard.filter((project) => project.status !== "Concluído").length;
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
    const completed = projectBoard.filter((project) => project.status === "Concluído").length;
    const avgProgress =
      projectBoard.reduce((sum, project) => sum + project.progress, 0) / projectBoard.length;
    return { total: projectBoard.length, completed, avgProgress };
  }, [projectBoard]);

  const selectedProject = useMemo(() => {
    if (!projectBoard.length) return null;
    return projectBoard.find((project) => project.id === activeProjectId) ?? projectBoard[0];
  }, [projectBoard, activeProjectId]);

  const navBadges = useMemo(() => {
    const supportTotal = supportSignals.open + supportSignals.urgent;
    return {
      overview: monitorSignals.totalAlerts,
      tenants: tenantSignals.pending,
      automation: tenantSignals.dnsIssues + monitorSignals.critical,
      projects: projectSignals.attention,
      finance: financePending,
      admins: 0,
      support: supportTotal
    } as Record<NavItemId, number>;
  }, [financePending, monitorSignals, projectSignals, supportSignals, tenantSignals]);

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

  const handleModuleToggle = (tenantId: string, moduleId: string) => {
    const current = getContractForm(tenantId);
    updateContractForm(tenantId, {
      modules: { ...current.modules, [moduleId]: !current.modules[moduleId] }
    });
  };

  const handleContractFile = (tenantId: string, files: FileList | null) => {
    if (!files || files.length === 0) {
      updateContractForm(tenantId, { contractFileName: undefined });
      return;
    }
    updateContractForm(tenantId, { contractFileName: files[0].name });
  };

  const handleInvoicesUpload = (tenantId: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const additions: ContractAttachment[] = Array.from(files).map((file) => ({
      id: `${tenantId}-${file.name}-${Date.now()}`,
      name: file.name,
      uploadedAt: new Date().toLocaleDateString("pt-BR")
    }));
    const current = getContractForm(tenantId);
    updateContractForm(tenantId, { invoices: [...current.invoices, ...additions] });
  };

  const handleRemoveInvoice = (tenantId: string, attachmentId: string) => {
    const current = getContractForm(tenantId);
    updateContractForm(tenantId, {
      invoices: current.invoices.filter((invoice) => invoice.id !== attachmentId)
    });
  };

  const handleCreateProject = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectForm.name.trim()) {
      setError("Informe um nome de projeto.");
      return;
    }
    const id = makeId();
    const record: ProjectRecord = {
      id,
      name: projectForm.name.trim(),
      description: projectForm.description.trim(),
      status: projectForm.status,
      progress: 0,
      lead: projectForm.lead.trim(),
      squad: [],
      started_at: new Date().toISOString(),
      target_date: projectForm.targetDate || undefined,
      tasks: [],
      updated_at: new Date().toISOString()
    };
    setProjectBoard((prev) => [...prev, record]);
    setProjectForm(createDefaultProjectForm());
    setTaskForm(createDefaultTaskForm());
    setActiveProjectId(id);
    setMessage(`Projeto ${record.name} cadastrado.`);
    setError(null);
  };

  const handleProjectStatusChange = (projectId: string, status: string) => {
    setProjectBoard((prev) =>
      prev.map((project) =>
        project.id === projectId
          ? { ...project, status, updated_at: new Date().toISOString() }
          : project
      )
    );
  };

  const handleAddTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeProjectId) return;
    if (!taskForm.title.trim()) {
      setError("Informe um título para a atividade.");
      return;
    }
    const newTask: ProjectTask = {
      id: makeId(),
      title: taskForm.title.trim(),
      owner: taskForm.owner.trim() || "Equipe",
      status: "pending",
      due_date: taskForm.dueDate || undefined,
      notes: taskForm.notes.trim() || undefined,
      created_at: new Date().toISOString(),
      completed_at: null
    };
    setProjectBoard((prev) =>
      prev.map((project) => {
        if (project.id !== activeProjectId) return project;
        const tasks = [...project.tasks, newTask];
        return withUpdatedTasks(project, tasks);
      })
    );
    setTaskForm(createDefaultTaskForm());
    setMessage(`Atividade ${newTask.title} adicionada.`);
    setError(null);
  };

  const handleTaskStatusChange = (
    projectId: string,
    taskId: string,
    status: ProjectTask["status"]
  ) => {
    setProjectBoard((prev) =>
      prev.map((project) => {
        if (project.id !== projectId) return project;
        const tasks = project.tasks.map((task) => {
          if (task.id !== taskId) return task;
          return {
            ...task,
            status,
            completed_at: status === "done" ? new Date().toISOString() : task.completed_at
          };
        });
        return withUpdatedTasks(project, tasks);
      })
    );
  };

  const handleRemoveTask = (projectId: string, taskId: string) => {
    setProjectBoard((prev) =>
      prev.map((project) => {
        if (project.id !== projectId) return project;
        const tasks = project.tasks.filter((task) => task.id !== taskId);
        return withUpdatedTasks(project, tasks);
      })
    );
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
    const attachments: FinanceAttachment[] = Array.from(files).map((file) => ({
      id: makeId(),
      name: file.name,
      uploaded_at: new Date().toLocaleDateString("pt-BR")
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

  const handleCreateFinanceEntry = (event: FormEvent<HTMLFormElement>) => {
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
    const entry: FinanceEntry = {
      id: makeId(),
      entry_type: financeForm.entryType,
      category: financeForm.category,
      description: financeForm.description.trim(),
      amount: amountValue,
      due_date: financeForm.dueDate || undefined,
      paid: false,
      paid_at: null,
      method: financeForm.method,
      cost_center: financeForm.costCenter || undefined,
      responsible: financeForm.responsible || undefined,
      notes: financeForm.notes || undefined,
      attachments: financeForm.attachments,
      created_at: new Date().toISOString()
    };
    setFinanceEntries((prev) => [entry, ...prev]);
    setFinanceForm(createDefaultFinanceForm());
    setMessage(`Lançamento financeiro ${entry.description} criado.`);
    setError(null);
  };

  const handleFinanceTogglePaid = (entryId: string) => {
    setFinanceEntries((prev) =>
      prev.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              paid: !entry.paid,
              paid_at: !entry.paid ? new Date().toISOString() : null
            }
          : entry
      )
    );
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
      { label: "Funcionários Urbanbyte", value: formatNumber(derivedMetrics.staff_total) }
    ];

    const displayProjects = projects.length ? projects : DEFAULT_PROJECTS;

    return (
      <div className="dashboard-section">
        <section className="dashboard-hero">
          <div className="hero-copy">
            <h2>Bem-vindo ao hub operacional do seu SaaS municipal</h2>
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
                    <span>{project.status}</span>
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

      <div className="panel-grid two-columns">
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
                      <span>{project.status}</span>
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
                            {task.owner} • {task.due_date ? task.due_date : "Sem prazo"}
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

      <div className="panel-grid two-columns">
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
                      <td>{entry.due_date || "—"}</td>
                      <td>
                        <span className={`status-pill ${entry.paid ? "is-paid" : "is-pending"}`}>
                          {entry.paid ? "Pago" : "Pendente"}
                        </span>
                      </td>
                      <td>
                        <button type="button" onClick={() => handleFinanceTogglePaid(entry.id)}>
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
                    <small>{attachment.uploaded_at}</small>
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
                {selectedContract.contractFileName ? (
                  <p className="upload-item">
                    <span>{selectedContract.contractFileName}</span>
                    <button
                      type="button"
                      onClick={() =>
                        selectedTenant && updateContractForm(selectedTenant.id, { contractFileName: undefined })
                      }
                    >
                      Remover
                    </button>
                  </p>
                ) : (
                  <p className="muted">Anexe o PDF ou link do contrato vigente.</p>
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
                        <span>{invoice.name}</span>
                        <small>{invoice.uploadedAt}</small>
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
