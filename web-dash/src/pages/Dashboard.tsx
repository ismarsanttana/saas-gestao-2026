import { useEffect, useState } from "react";

import TenantForm from "../components/TenantForm";
import TenantTable from "../components/TenantTable";
import { useAuth } from "../state/auth";
import { Tenant } from "../types";

export default function DashboardPage() {
  const { user, logout, authorizedFetch } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadTenants = async () => {
      try {
        const data = await authorizedFetch<{ tenants: Tenant[] }>("/saas/tenants");
        setTenants(data.tenants);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Falha ao carregar tenants";
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };

    loadTenants();
  }, [authorizedFetch]);

  const handleCreated = (tenant: Tenant) => {
    setTenants((prev) => [tenant, ...prev]);
  };

  return (
    <div className="app-shell">
      <header className="header">
        <div>
          <strong>Urbanbyte • SaaS Control Center</strong>
          {user && (
            <div style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "0.25rem" }}>
              Conectado como <strong>{user.nome}</strong> ({user.email})
            </div>
          )}
        </div>
        <button className="btn btn-secondary" onClick={logout}>
          Sair
        </button>
      </header>

      <main className="container">
        <section className="card" style={{ marginBottom: "2rem" }}>
          <h2>Adicionar nova prefeitura</h2>
          <p style={{ marginTop: "0.25rem", color: "#475569" }}>
            Informe slug, domínio e cores base. O backend provisiona toda a estrutura e
            o cidadão passa a enxergar o app personalizado assim que o domínio estiver
            configurado no Cloudflare/Vercel.
          </p>

          <TenantForm onCreated={handleCreated} />
        </section>

        <section className="card">
          <h2>Prefeituras cadastradas</h2>
          {isLoading ? (
            <p>Carregando...</p>
          ) : error ? (
            <p className="inline-error">{error}</p>
          ) : (
            <TenantTable tenants={tenants} />
          )}
        </section>
      </main>
    </div>
  );
}
