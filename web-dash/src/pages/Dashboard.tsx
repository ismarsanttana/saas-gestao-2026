import { useEffect, useState } from "react";

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

  return (
    <div className="app-shell">
      <header className="header">
        <div>
          <strong>Urbanbyte • SaaS Control Center</strong>
          {user && (
            <div className="muted" style={{ marginTop: "0.25rem" }}>
              Conectado como <strong>{user.name}</strong> ({user.role})
            </div>
          )}
        </div>
        <button className="btn btn-secondary" onClick={logout}>
          Sair
        </button>
      </header>

      <main className="container">
        <section className="card">
          <CloudflareSettings />
        </section>

        <section className="card">
          <MonitorDashboard />
        </section>

        <section className="card">
          <h2>Onboarding de nova prefeitura</h2>
          <p className="muted" style={{ marginBottom: "1rem" }}>
            Configure identidade visual, contatos e equipe inicial. Após ativação, o domínio
            provisionado ficará disponível para o cidadão.
          </p>
          <TenantForm onCreated={handleCreated} />
        </section>

        <section className="card">
          <TenantImport onImported={handleImport} />
        </section>

        <section className="card">
          <h2>Prefeituras cadastradas</h2>
          {isLoading ? (
            <p>Carregando…</p>
          ) : error ? (
            <p className="inline-error">{error}</p>
          ) : (
            <TenantTable tenants={tenants} onProvision={handleProvision} onCheckDNS={handleCheckDNS} />
          )}
          {message && <div className="inline-success" style={{ marginTop: "0.5rem" }}>{message}</div>}
        </section>

        <section className="card">
          <SaasAdminManager />
        </section>

        <section className="card">
          <SupportTickets tenants={tenants} />
        </section>
      </main>
    </div>
  );
}
