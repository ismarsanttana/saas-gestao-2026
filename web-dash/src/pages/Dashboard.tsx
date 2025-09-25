import { useEffect, useMemo, useState } from "react";

import TenantForm from "../components/TenantForm";
import TenantTable from "../components/TenantTable";
import SaasAdminManager from "../components/SaasAdminManager";
import SupportTickets from "../components/SupportTickets";
import TenantImport from "../components/TenantImport";
import CloudflareSettings from "../components/CloudflareSettings";
import MonitorDashboard from "../components/MonitorDashboard";
import { useAuth } from "../state/auth";
import { Tenant } from "../types";

export default function DashboardPage() {
  const { user, logout, authorizedFetch } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState("overview");

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

  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <div className="sidebar-brand">
          <img src="/assets/urbanbyte-lockup.png" alt="Urbanbyte" />
        </div>
        <nav className="sidebar-nav">
          <span className="sidebar-label">Operação</span>
          <button
            type="button"
            className={`sidebar-link ${activeSection === "overview" ? "is-active" : ""}`}
            onClick={() => setActiveSection("overview")}
          >
            Visão geral
          </button>
          <button
            type="button"
            className={`sidebar-link ${activeSection === "tenants" ? "is-active" : ""}`}
            onClick={() => setActiveSection("tenants")}
          >
            Prefeituras
          </button>
          <button
            type="button"
            className={`sidebar-link ${activeSection === "automation" ? "is-active" : ""}`}
            onClick={() => setActiveSection("automation")}
          >
            Automação & DNS
          </button>

          <span className="sidebar-label">Administração</span>
          <button
            type="button"
            className={`sidebar-link ${activeSection === "admins" ? "is-active" : ""}`}
            onClick={() => setActiveSection("admins")}
          >
            Equipe SaaS
          </button>
          <button
            type="button"
            className={`sidebar-link ${activeSection === "support" ? "is-active" : ""}`}
            onClick={() => setActiveSection("support")}
          >
            Suporte & Tickets
          </button>
        </nav>

        {user && (
          <div className="sidebar-user">
            <span className="sidebar-user__role">{user.role}</span>
            <strong>{user.name}</strong>
            <button type="button" onClick={logout}>
              Encerrar sessão
            </button>
          </div>
        )}
      </aside>

      <div className="dashboard-main">
        <header className="dashboard-topbar">
          <div>
            <p className="dashboard-topbar__kicker">Urbanbyte Startup Control Center</p>
            <h1>Visão consolidada do SaaS municipal</h1>
          </div>
          <div className="dashboard-actions">
            <button type="button" className="btn-ghost" onClick={() => setActiveSection("overview")}>
              Atualizar dados
            </button>
            <button type="button" className="btn-primary" onClick={() => setActiveSection("tenants")}>
              Nova prefeitura
            </button>
          </div>
        </header>

        <main className="dashboard-content">
          {(error || message) && (
            <div className="dashboard-alert">
              {error && <span className="alert-error">{error}</span>}
              {message && <span className="alert-success">{message}</span>}
            </div>
          )}

          <section className="dashboard-metrics">
            {metrics.map((metric) => (
              <article key={metric.id} className="metric-card">
                <span className="metric-label">{metric.label}</span>
                <strong className="metric-value">{metric.value}</strong>
                <span className="metric-hint">{metric.hint}</span>
              </article>
            ))}
          </section>

          <section className="surface surface-grid">
            <article className="surface-card large">
              <CloudflareSettings />
            </article>
            <article className="surface-card">
              <MonitorDashboard />
            </article>
          </section>

          <section className="surface">
            <article className="surface-card">
              <div className="section-heading">
                <div>
                  <h2>Onboarding de nova prefeitura</h2>
                  <p>Configure branding, equipe e ativos para liberar o ambiente municipal.</p>
                </div>
                <span className="tag">Workflow assistido</span>
              </div>
              <TenantForm onCreated={handleCreated} />
            </article>
            <article className="surface-card narrow">
              <TenantImport onImported={handleImport} />
            </article>
          </section>

          <section className="surface">
            <article className="surface-card full">
              <div className="section-heading">
                <div>
                  <h2>Prefeituras cadastradas</h2>
                  <p>Gerencie provisionamento, checagens DNS e status operacionais.</p>
                </div>
                <div className="section-actions">
                  <button type="button" className="btn-ghost" onClick={() => setActiveSection("automation")}>
                    Ver automações
                  </button>
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

          <section className="surface surface-split">
            <article className="surface-card">
              <SaasAdminManager />
            </article>
            <article className="surface-card">
              <SupportTickets tenants={tenants} />
            </article>
          </section>
        </main>
      </div>
    </div>
  );
}
