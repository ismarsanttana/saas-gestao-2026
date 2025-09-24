import { Tenant } from "../types";

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  review: "Revisão",
  active: "Ativo",
  suspended: "Suspenso",
  archived: "Arquivado"
};

const DNS_STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  configuring: "Configurando",
  configured: "Ok",
  failed: "Erro"
};

type TenantTableProps = {
  tenants: Tenant[];
  onProvision?: (tenant: Tenant) => void;
  onCheckDNS?: (tenant: Tenant) => void;
};

export default function TenantTable({ tenants, onProvision, onCheckDNS }: TenantTableProps) {
  const list = Array.isArray(tenants) ? tenants : [];

  if (list.length === 0) {
    return <p style={{ color: "#64748b" }}>Nenhuma prefeitura cadastrada ainda.</p>;
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="table">
        <thead>
          <tr>
            <th>Município</th>
            <th>Status</th>
            <th>DNS</th>
            <th>Domínio</th>
            <th>Criado em</th>
            {(onProvision || onCheckDNS) && <th>Ações</th>}
          </tr>
        </thead>
        <tbody>
          {list.map((tenant) => (
            <tr key={tenant.id}>
              <td>
                <strong>{tenant.display_name}</strong>
                <div className="muted">/{tenant.slug}</div>
              </td>
              <td>
                <span className={`status-badge status-${tenant.status}`}>
                  {STATUS_LABELS[tenant.status] ?? tenant.status}
                </span>
              </td>
              <td>
                <div className={`status-badge status-${tenant.dns_status}`}>
                  {DNS_STATUS_LABELS[tenant.dns_status] ?? tenant.dns_status}
                </div>
                {tenant.dns_error && <div className="inline-error">{tenant.dns_error}</div>}
                {tenant.dns_last_checked_at && (
                  <div className="muted">
                    Atualizado {new Date(tenant.dns_last_checked_at).toLocaleString()}
                  </div>
                )}
              </td>
              <td>
                <a href={`https://${tenant.domain}`} target="_blank" rel="noreferrer">
                  {tenant.domain}
                </a>
              </td>
              <td>
                <div>{new Date(tenant.created_at).toLocaleDateString()}</div>
                {tenant.activated_at && (
                  <small className="muted">
                    Ativado em {new Date(tenant.activated_at).toLocaleDateString()}
                  </small>
                )}
              </td>
              {(onProvision || onCheckDNS) && (
                <td>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    {onProvision && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => onProvision(tenant)}
                      >
                        Provisionar DNS
                      </button>
                    )}
                    {onCheckDNS && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => onCheckDNS(tenant)}
                      >
                        Revalidar
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
