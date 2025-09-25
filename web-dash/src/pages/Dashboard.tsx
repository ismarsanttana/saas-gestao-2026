import { useCallback, useEffect, useMemo, useState } from "react";

import CloudflareSettings from "../components/CloudflareSettings";
import MonitorDashboard from "../components/MonitorDashboard";
import SaasAdminManager from "../components/SaasAdminManager";
import SupportTickets from "../components/SupportTickets";
import TenantForm from "../components/TenantForm";
import TenantImport from "../components/TenantImport";
import TenantTable from "../components/TenantTable";
import { useAuth } from "../state/auth";
import { DashboardOverviewMetrics, DashboardOverviewResponse, DashboardProject, Tenant } from "../types";

const NAV_ITEMS = [
  { id: "overview", label: "Visão geral", icon: "home" },
  { id: "tenants", label: "Prefeituras", icon: "building" },
  { id: "automation", label: "Automação & DNS", icon: "cloud" },
  { id: "admins", label: "Equipe", icon: "team" },
  { id: "support", label: "Suporte", icon: "support" }
] as const;

type NavItemId = (typeof NAV_ITEMS)[number]["id"];

type MonitorSignals = { critical: number; warning: number; totalAlerts: number };
type SupportSignals = { open: number; urgent: number };
type TenantSignals = { pending: number; dnsIssues: number };

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

const INITIAL_MONITOR_SIGNALS: MonitorSignals = { critical: 0, warning: 0, totalAlerts: 0 };
const INITIAL_SUPPORT_SIGNALS: SupportSignals = { open: 0, urgent: 0 };
const INITIAL_TENANT_SIGNALS: TenantSignals = { pending: 0, dnsIssues: 0 };

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

const formatNumber = (value?: number | null) =>
  (value ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

const formatCurrency = (value?: number | null) =>
  (value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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

  const [contractForms, setContractForms] = useState<Record<string, ContractFormState>>({});
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");

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

  const navBadges = useMemo(() => {
    const supportTotal = supportSignals.open + supportSignals.urgent;
    return {
      overview: monitorSignals.totalAlerts,
      tenants: tenantSignals.pending,
      automation: tenantSignals.dnsIssues + monitorSignals.critical,
      admins: 0,
      support: supportTotal
    } as Record<NavItemId, number>;
  }, [monitorSignals, supportSignals, tenantSignals]);

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

  const selectedTenant = tenants.find((tenant) => tenant.id === selectedTenantId) ?? null;
  const selectedContract = selectedTenant ? getContractForm(selectedTenant.id) : createDefaultContractForm();

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
