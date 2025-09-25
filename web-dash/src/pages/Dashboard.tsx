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

  const navItems = useMemo(
    () => [
      { id: "overview", label: "Visão geral", icon: "home", ref: overviewRef },
      { id: "tenants", label: "Prefeituras", icon: "building", ref: tenantsRef },
      { id: "automation", label: "Automação & DNS", icon: "cloud", ref: automationRef },
      { id: "admins", label: "Equipe", icon: "team", ref: adminsRef },
      { id: "support", label: "Suporte", icon: "support", ref: supportRef }
    ],
    []
  );

  const scrollToSection = (sectionId: string) => {
    const target = navItems.find((item) => item.id === sectionId)?.ref.current;
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
          const match = navItems.find((item) => item.ref.current === visible.target);
          if (match) {
            setActiveSection(match.id);
          }
        }
      },
      { threshold: 0.35 }
    );

    navItems.forEach((section) => {
      const node = section.ref.current;
      if (node) observer.observe(node);
    });

    return () => observer.disconnect();
  }, [navItems]);

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

  const renderIcon = (icon: string) => {
    switch (icon) {
      case "home":
        return (
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 11.25L12 3l9 8.25v9.5a.75.75 0 01-.75.75h-5.25a.75.75 0 01-.75-.75V14.25h-4.5v6.5a.75.75 0 01-.75.75H3.75a.75.75 0 01-.75-.75v-9.5z" strokeLinecap="round" strokeLinejoin="round" /></svg>
        );
      case "building":
        return (
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3.75 21.75h16.5M5.25 21.75V4.5a.75.75 0 01.75-.75h4.5a.75.75 0 01.75.75v17.25m-6 0h6m0 0V9a.75.75 0 01.75-.75h4.5a.75.75 0 01.75.75v12.75m-6 0h6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        );
      case "cloud":
        return (
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4.5 15.75a4.5 4.5 0 010-9c.69 0 1.342.147 1.931.41A6 6 0 0118 7.5a4.5 4.5 0 01.75 8.928" strokeLinecap="round" strokeLinejoin="round" /></svg>
        );
      case "team":
        return (
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M15.75 6A3.75 3.75 0 1112 2.25 3.75 3.75 0 0115.75 6zm-7.5 5.25A3.75 3.75 0 114.5 7.5a3.75 3.75 0 013.75 3.75zm8.25 7.5a3.75 3.75 0 10-7.5 0" strokeLinecap="round" strokeLinejoin="round" /><path d="M2.905 21.75a6.38 6.38 0 0110.19-4.926M21.095 21.75a6.378 6.378 0 00-5.206-6.279" strokeLinecap="round" strokeLinejoin="round" /></svg>
        );
      case "support":
        return (
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 6a6 6 0 00-6 6v4.5A1.5 1.5 0 007.5 18h9a1.5 1.5 0 001.5-1.5V12a6 6 0 00-6-6zm0 0V3m0 15v3" strokeLinecap="round" strokeLinejoin="round" /></svg>
        );
      default:
        return null;
    }
  };

  return (
    <div className={`dashboard theme-${theme}`}>
      <header className="dashboard-topbar">
        <div className="topbar-info">
          <div className="topbar-monogram">UB</div>
          <div>
            <span className="topbar-caption">Conectado como {user ? user.name : "Operador"}</span>
            <strong>Painel Operacional</strong>
          </div>
        </div>
        <div className="topbar-actions">
          <button type="button" className="topbar-button" onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}>
            <span>{theme === "dark" ? "☀️" : "🌙"}</span>
            <span className="hide-sm">Tema</span>
          </button>
          <button type="button" className="topbar-button hide-md">Demo</button>
          <button type="button" className="topbar-primary">Exportar</button>
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
            <button type="button" className="sidebar-refresh" title="Atualizar" onClick={() => navItems[0].ref.current?.scrollIntoView({ behavior: "smooth" })}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>

          <nav className="sidebar-nav">
            {navItems.map((item) => {
              const badge = navBadges[item.id] ?? 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`sidebar-link ${activeSection === item.id ? "is-active" : ""}`}
                  onClick={() => scrollToSection(item.id)}
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
            <button type="button" onClick={() => scrollToSection("tenants")}>Iniciar onboarding</button>
          </div>
        </aside>

        <main className="dashboard-main">
          <nav className="dashboard-mobile-nav">
            {navItems.map((item) => {
              const badge = navBadges[item.id] ?? 0;
              return (
                <button
                  key={`mobile-${item.id}`}
                  type="button"
                  className={`mobile-nav-link ${activeSection === item.id ? "is-active" : ""}`}
                  onClick={() => scrollToSection(item.id)}
                >
                  <span className="sidebar-icon">{renderIcon(item.icon)}</span>
                  <span>{item.label}</span>
                  {badge > 0 && <span className="nav-badge">{badge}</span>}
                </button>
              );
            })}
          </nav>

          <section className="dashboard-hero">
            <div className="hero-copy">
              <h2>Bem-vindo ao hub operacional do seu SaaS municipal</h2>
              <p>Gerencie DNS, onboarding, equipe e saúde de todos os tenants com um visual moderno e ações rápidas.</p>
              <div className="hero-actions">
                <button type="button" className="topbar-primary" onClick={() => scrollToSection("tenants")}>Provisionar nova prefeitura</button>
                <button type="button" className="topbar-button">Ver tour</button>
              </div>
            </div>
            <div className="hero-art" aria-hidden="true" />
          </section>

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
  </div>
  );
}
