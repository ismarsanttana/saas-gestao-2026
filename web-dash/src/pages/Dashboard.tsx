import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import TenantForm from "../components/TenantForm";
import TenantTable from "../components/TenantTable";
import SaasAdminManager from "../components/SaasAdminManager";
import SupportTickets from "../components/SupportTickets";
import TenantImport from "../components/TenantImport";
import CloudflareSettings from "../components/CloudflareSettings";
import MonitorDashboard from "../components/MonitorDashboard";
import { useAuth } from "../state/auth";
import { Tenant } from "../types";

const getInitialTheme = (): "light" | "dark" => {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem("dashboard-theme");
  return stored === "light" ? "light" : "dark";
};

export default function DashboardPage() {
  const { user, logout, authorizedFetch } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState("overview");
  const [theme, setTheme] = useState<"light" | "dark">(() => getInitialTheme());
  const [monitorSignals, setMonitorSignals] = useState({ critical: 0, warning: 0, totalAlerts: 0 });
  const [supportSignals, setSupportSignals] = useState({ open: 0, urgent: 0 });
  const [tenantSignals, setTenantSignals] = useState({ pending: 0, dnsIssues: 0 });

  const overviewRef = useRef<HTMLElement | null>(null);
  const automationRef = useRef<HTMLElement | null>(null);
  const tenantsRef = useRef<HTMLElement | null>(null);
  const adminsRef = useRef<HTMLElement | null>(null);
  const supportRef = useRef<HTMLElement | null>(null);

  const sections = useMemo(
    () => [
      { id: "overview", label: "Visão geral", ref: overviewRef },
      { id: "automation", label: "Automação & DNS", ref: automationRef },
      { id: "tenants", label: "Prefeituras", ref: tenantsRef },
      { id: "admins", label: "Equipe SaaS", ref: adminsRef },
      { id: "support", label: "Suporte", ref: supportRef }
    ],
    []
  );

  const scrollToSection = (sectionId: string) => {
    const target = sections.find((item) => item.id === sectionId)?.ref.current;
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveSection(sectionId);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("dashboard-theme", theme);
  }, [theme]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target) {
          const match = sections.find((item) => item.ref.current === visible.target);
          if (match) {
            setActiveSection(match.id);
          }
        }
      },
      { threshold: 0.35 }
    );

    sections.forEach((section) => {
      const node = section.ref.current;
      if (node) observer.observe(node);
    });

    return () => observer.disconnect();
  }, [sections]);

  useEffect(() => {
    if (!user) {
      setTenants([]);
      setIsLoading(false);
      return;
    }

    const loadTenants = async () => {
      try {
        const data = await authorizedFetch<{ tenants?: Tenant[] }>("/saas/tenants");
        setTenants(Array.isArray(data.tenants) ? data.tenants : []);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Falha ao carregar tenants";
        setError(msg);
      } finally {
        setIsLoading(false);
      }
    };

    void loadTenants();
  }, [authorizedFetch, user]);

  const upsertTenant = (updated: Tenant) => {
    setTenants((prev) => {
      const map = new Map(prev.map((item) => [item.id, item] as const));
      map.set(updated.id, { ...map.get(updated.id), ...updated });
      return Array.from(map.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    });
  };

  const handleCreated = (tenant: Tenant) => {
    upsertTenant(tenant);
    setMessage(`Tenant ${tenant.display_name} criado.`);
  };

  const handleProvision = async (tenant: Tenant) => {
    try {
      setError(null);
      const response = await authorizedFetch<{ tenant: Tenant }>(`/saas/tenants/${tenant.id}/dns/provision`, {
        method: "POST"
      });
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
      const response = await authorizedFetch<{ tenant: Tenant }>(`/saas/tenants/${tenant.id}/dns/check`, {
        method: "POST"
      });
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
    setTenants((prev) => {
      const map = new Map(prev.map((item) => [item.id, item] as const));
      for (const tenant of created) {
        map.set(tenant.id, tenant);
      }
      return Array.from(map.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    });
    setMessage(`${created.length} prefeitura(s) importadas.`);
  };

  const metrics = useMemo(() => {
    const total = tenants.length;
    const active = tenants.filter((tenant) => tenant.status === "active").length;
    const pending = tenants.filter((tenant) => tenant.status !== "active").length;
    const lastCreated = tenants[0]?.display_name;

    return [
      {
        id: "total",
        label: "Prefeituras",
        value: total.toString().padStart(2, "0"),
        hint: total ? "Total onboardings" : "Nenhum cadastro ainda"
      },
      {
        id: "active",
        label: "Ativas",
        value: active.toString().padStart(2, "0"),
        hint: active === total && total > 0 ? "Todas em produção" : `${pending} pendente(s)`
      },
      {
        id: "latest",
        label: "Último cadastro",
        value: lastCreated ? lastCreated : "—",
        hint: lastCreated ? "Onboarding concluído" : "Aguardando primeiro tenant"
      }
    ];
  }, [tenants]);

  useEffect(() => {
    const pending = tenants.filter((tenant) => tenant.status !== "active").length;
    const dnsIssues = tenants.filter((tenant) => {
      const status = (tenant.dns_status ?? "").toLowerCase();
      return status && status !== "ok";
    }).length;
    setTenantSignals({ pending, dnsIssues });
  }, [tenants]);

  const handleMonitorStats = useCallback((stats: { critical: number; warning: number; totalAlerts: number }) => {
    setMonitorSignals(stats);
  }, []);

  const handleSupportStats = useCallback((stats: { open: number; urgent: number }) => {
    setSupportSignals(stats);
  }, []);

  const navBadges = useMemo(() => {
    const automationIssues = tenantSignals.dnsIssues + monitorSignals.critical;
    const overviewSignals = monitorSignals.totalAlerts;
    const supportTotal = supportSignals.open + supportSignals.urgent;
    return {
      overview: overviewSignals,
      automation: automationIssues,
      tenants: tenantSignals.pending,
      admins: 0,
      support: supportTotal
    } as Record<string, number>;
  }, [monitorSignals, supportSignals, tenantSignals]);

  return (
    <div className={`dashboard theme-${theme}`}>
      <header className="dashboard-header">
        <div className="dashboard-brand">
          <img src="/assets/urbanbyte-lockup.png" alt="Urbanbyte" />
          <div className="dashboard-brand__copy">
            <span>Startup Control Center</span>
            <h1>Governança SaaS Urbanbyte</h1>
          </div>
        </div>
        <div className="dashboard-header__actions">
          <button type="button" className="theme-toggle" onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}>
            {theme === "dark" ? "Modo claro" : "Modo escuro"}
          </button>
          {user && (
            <div className="dashboard-user">
              <span>{user.name}</span>
              <small>{user.role}</small>
            </div>
          )}
          <button type="button" className="logout-btn" onClick={logout}>
            Sair
          </button>
        </div>
      </header>

      <nav className="dashboard-nav">
        {sections.map((section) => {
          const badge = navBadges[section.id] ?? 0;
          return (
            <button
              key={section.id}
              type="button"
              className={`dashboard-nav__link ${activeSection === section.id ? "is-active" : ""}`}
              onClick={() => scrollToSection(section.id)}
            >
              {section.label}
              {badge > 0 && <span className="nav-badge">{badge}</span>}
            </button>
          );
        })}
      </nav>

      <main className="dashboard-body">
        {(error || message) && (
          <div className="dashboard-banner">
            {error && <span className="dashboard-banner__error">{error}</span>}
            {message && <span className="dashboard-banner__success">{message}</span>}
          </div>
        )}

        <section ref={overviewRef} id="overview" className="dashboard-section">
          <header className="dashboard-section__header">
            <h2>Visão geral</h2>
            <p>Indicadores operacionais e estado consolidado do SaaS municipal.</p>
          </header>
          <div className="metric-row">
            {metrics.map((metric) => (
              <article key={metric.id} className="metric-tile">
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <small>{metric.hint}</small>
              </article>
            ))}
          </div>
          <div className="panel-grid">
            <article className="panel-card">
              <MonitorDashboard onStatsChange={handleMonitorStats} />
            </article>
          </div>
        </section>

        <section ref={automationRef} id="automation" className="dashboard-section">
          <header className="dashboard-section__header">
            <h2>Automação & DNS</h2>
            <p>Gerencie provisionamento Cloudflare e monitoramento de domínios.</p>
          </header>
          <div className="panel-grid">
            <article className="panel-card">
              <CloudflareSettings />
            </article>
          </div>
        </section>

        <section ref={tenantsRef} id="tenants" className="dashboard-section">
          <header className="dashboard-section__header">
            <h2>Prefeituras</h2>
            <p>Fluxos de onboarding, importação e acompanhamento de status.</p>
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
                <h3>Prefeituras cadastradas</h3>
                <p>Controle status de DNS, ativação e equipes municipais.</p>
              </div>
            </div>
            {isLoading ? (
              <p>Carregando…</p>
            ) : error ? (
              <p className="inline-error">{error}</p>
            ) : (
              <TenantTable tenants={tenants} onProvision={handleProvision} onCheckDNS={handleCheckDNS} />
            )}
          </article>
        </section>

        <section ref={adminsRef} id="admins" className="dashboard-section">
          <header className="dashboard-section__header">
            <h2>Equipe SaaS</h2>
            <p>Convide, gerencie papéis e mantenha governança da operação.</p>
          </header>
          <article className="panel-card">
            <SaasAdminManager />
          </article>
        </section>

        <section ref={supportRef} id="support" className="dashboard-section">
          <header className="dashboard-section__header">
            <h2>Suporte & Tickets</h2>
            <p>Acompanhe interações com prefeituras e responda chamados críticos.</p>
          </header>
          <article className="panel-card">
            <SupportTickets tenants={tenants} onStatsChange={handleSupportStats} />
          </article>
        </section>
      </main>
    </div>
  );
}
