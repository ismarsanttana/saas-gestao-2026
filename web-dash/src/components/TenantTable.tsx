import { Tenant } from "../types";

type TenantTableProps = {
  tenants: Tenant[];
};

export default function TenantTable({ tenants }: TenantTableProps) {
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
            <th>Slug</th>
            <th>Domínio</th>
            <th>Criado em</th>
          </tr>
        </thead>
        <tbody>
          {list.map((tenant) => (
            <tr key={tenant.id}>
              <td>
                <strong>{tenant.display_name}</strong>
              </td>
              <td>
                <code>{tenant.slug}</code>
              </td>
              <td>
                <a href={`https://${tenant.domain}`} target="_blank" rel="noreferrer">
                  {tenant.domain}
                </a>
              </td>
              <td>{new Date(tenant.created_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
