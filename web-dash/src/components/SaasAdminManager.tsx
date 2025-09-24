import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAuth } from "../state/auth";
import { SaaSInvite, SaaSUser } from "../types";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  support: "Suporte",
  finance: "Financeiro"
};

const ROLE_ORDER = ["owner", "admin", "support", "finance"];

export default function SaasAdminManager() {
  const { authorizedFetch } = useAuth();
  const [users, setUsers] = useState<SaaSUser[]>([]);
  const [invites, setInvites] = useState<SaaSInvite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", role: "admin" });

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reload = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [usersResponse, inviteResponse] = await Promise.all([
        authorizedFetch<{ users: SaaSUser[] }>("/saas/users"),
        authorizedFetch<{ invites: SaaSInvite[] }>("/saas/users/invites?pending=1")
      ]);
      setUsers(usersResponse.users ?? []);
      setInvites(inviteResponse.invites ?? []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao carregar administradores";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      const aIndex = ROLE_ORDER.indexOf(a.role ?? "");
      const bIndex = ROLE_ORDER.indexOf(b.role ?? "");
      if (aIndex === bIndex) {
        return a.name.localeCompare(b.name);
      }
      return aIndex - bIndex;
    });
  }, [users]);

  const handleInvite = async (event: FormEvent) => {
    event.preventDefault();
    setInviteSuccess(null);
    setError(null);

    if (!form.name.trim() || !form.email.trim()) {
      setError("Informe nome e e-mail do convidado.");
      return;
    }

    try {
      await authorizedFetch("/saas/users/invite", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          role: form.role
        })
      });
      setInviteSuccess(`Convite enviado para ${form.email.trim()}`);
      setForm({ name: "", email: "", role: form.role });
      await reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao enviar convite";
      setError(message);
    }
  };

  const updateUser = async (user: SaaSUser, partial: Partial<SaaSUser>) => {
    try {
      await authorizedFetch<{ user: SaaSUser }>(`/saas/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: partial.name ?? user.name,
          role: partial.role ?? user.role,
          active: partial.active ?? user.active
        })
      });
      await reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao atualizar usuário";
      setError(message);
    }
  };

  const handleDelete = async (user: SaaSUser) => {
    if (!window.confirm(`Remover ${user.name}?`)) {
      return;
    }
    try {
      await authorizedFetch(`/saas/users/${user.id}`, { method: "DELETE", parseJson: false });
      await reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao remover usuário";
      setError(message);
    }
  };

  return (
    <div className="admin-manager">
      <header className="admin-header">
        <div>
          <h3>Administradores do SaaS</h3>
          <p className="muted">
            Gerencie os perfis com acesso ao painel e acompanhe convites pendentes.
          </p>
        </div>
      </header>

      <section className="card-secondary">
        <h4>Novo convite</h4>
        <form className="invite-form" onSubmit={handleInvite}>
          <input
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Nome completo"
            required
          />
          <input
            value={form.email}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            placeholder="email@prefeitura.gov.br"
            type="email"
            required
          />
          <select
            value={form.role}
            onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value }))}
          >
            {ROLE_ORDER.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
          <button className="btn" type="submit">
            Enviar convite
          </button>
        </form>
        {inviteSuccess && <span className="inline-success">{inviteSuccess}</span>}
      </section>

      {error && <div className="inline-error">{error}</div>}

      <section className="card-secondary">
        <h4>Convites pendentes</h4>
        {invites.length === 0 ? (
          <p className="muted">Nenhum convite aguardando aceitação.</p>
        ) : (
          <ul className="invite-list">
            {invites.map((invite) => (
              <li key={invite.id}>
                <div>
                  <strong>{invite.name}</strong>
                  <div className="muted">{invite.email}</div>
                </div>
                <div className="muted">
                  expira em {new Date(invite.expires_at).toLocaleDateString()}
                </div>
                <span className="badge">{ROLE_LABELS[invite.role] ?? invite.role}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card-secondary">
        <h4>Equipe</h4>
        {isLoading ? (
          <p>Carregando…</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Papel</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedUsers.map((admin) => (
                <tr key={admin.id}>
                  <td>{admin.name}</td>
                  <td className="muted">{admin.email}</td>
                  <td>
                    <select
                      value={admin.role}
                      onChange={(event) =>
                        updateUser(admin, { role: event.target.value })
                      }
                    >
                      {ROLE_ORDER.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={admin.active}
                        onChange={(event) => updateUser(admin, { active: event.target.checked })}
                      />
                      <span className="slider" />
                    </label>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handleDelete(admin)}
                    >
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
