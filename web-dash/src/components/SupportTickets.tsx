import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAuth } from "../state/auth";
import { SaaSUser, SupportMessage, SupportTicket, Tenant } from "../types";

const STATUS_OPTIONS = [
  { value: "open", label: "Aberto" },
  { value: "in_progress", label: "Em andamento" },
  { value: "resolved", label: "Resolvido" },
  { value: "closed", label: "Fechado" }
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "Baixa" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "Alta" },
  { value: "urgent", label: "Urgente" }
];

type SupportTicketsProps = {
  tenants: Tenant[];
  onStatsChange?: (stats: { open: number; urgent: number }) => void;
};

export default function SupportTickets({ tenants, onStatsChange }: SupportTicketsProps) {
  const { authorizedFetch } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [admins, setAdmins] = useState<SaaSUser[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newTicket, setNewTicket] = useState({
    tenant_id: tenants[0]?.id ?? "",
    subject: "",
    category: "Suporte",
    description: "",
    priority: "normal"
  });
  const [newMessage, setNewMessage] = useState("");

  useEffect(() => {
    if (!newTicket.tenant_id && tenants.length > 0) {
      setNewTicket((prev) => ({ ...prev, tenant_id: tenants[0].id }));
    }
  }, [tenants]);

  useEffect(() => {
    void Promise.all([loadTickets(), loadAdmins()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const loadTickets = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const query = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
      const response = await authorizedFetch<{ tickets: SupportTicket[] }>(
        `/saas/tickets${query}`
      );
      setTickets(response.tickets ?? []);
      if (response.tickets && response.tickets.length > 0) {
        setSelectedTicket(response.tickets[0]);
        void loadMessages(response.tickets[0].id);
      } else {
        setSelectedTicket(null);
        setMessages([]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao carregar tickets";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const loadAdmins = async () => {
    try {
      const response = await authorizedFetch<{ users: SaaSUser[] }>("/saas/users");
      setAdmins(response.users ?? []);
    } catch (err) {
      console.warn("Falha ao carregar administradores", err);
    }
  };

  const loadMessages = async (ticketId: string) => {
    try {
      const response = await authorizedFetch<{ messages: SupportMessage[] }>(
        `/saas/tickets/${ticketId}/messages`
      );
      setMessages(response.messages ?? []);
    } catch (err) {
      console.warn("Falha ao carregar mensagens", err);
    }
  };

  const handleCreateTicket = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!newTicket.tenant_id) {
      setError("Selecione um tenant");
      return;
    }
    if (!newTicket.subject.trim() || !newTicket.description.trim()) {
      setError("Preencha assunto e descrição");
      return;
    }

    try {
      const response = await authorizedFetch<{ ticket: SupportTicket }>("/saas/tickets", {
        method: "POST",
        body: JSON.stringify({
          tenant_id: newTicket.tenant_id,
          subject: newTicket.subject.trim(),
          category: newTicket.category.trim() || "Suporte",
          description: newTicket.description.trim(),
          priority: newTicket.priority,
          status: "open"
        })
      });
      setNewTicket({
        tenant_id: newTicket.tenant_id,
        subject: "",
        category: newTicket.category,
        description: "",
        priority: newTicket.priority
      });
      await loadTickets();
      if (response.ticket) {
        setSelectedTicket(response.ticket);
        void loadMessages(response.ticket.id);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao criar ticket";
      setError(message);
    }
  };

  const handleUpdateTicket = async (update: {
    status?: string;
    priority?: string;
    assigned_to?: string | null;
  }) => {
    if (!selectedTicket) return;
    try {
      const payload: Record<string, unknown> = {};
      if (update.status) payload.status = update.status;
      if (update.priority) payload.priority = update.priority;
      if (update.assigned_to === null) {
        payload.clear_assignee = true;
      } else if (typeof update.assigned_to === "string") {
        payload.assigned_to = update.assigned_to;
      }
      const response = await authorizedFetch<{ ticket: SupportTicket }>(
        `/saas/tickets/${selectedTicket.id}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload)
        }
      );
      setSelectedTicket(response.ticket);
      await loadTickets();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao atualizar ticket";
      setError(message);
    }
  };

  const handleSendMessage = async () => {
    if (!selectedTicket || !newMessage.trim()) {
      return;
    }
    try {
      await authorizedFetch<{ message: SupportMessage }>(
        `/saas/tickets/${selectedTicket.id}/messages`,
        {
          method: "POST",
          body: JSON.stringify({ body: newMessage.trim() })
        }
      );
      setNewMessage("");
      await loadMessages(selectedTicket.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao registrar resposta";
      setError(message);
    }
  };

  const currentTenant = useMemo(() => {
    if (!selectedTicket) return null;
    return tenants.find((tenant) => tenant.id === selectedTicket.tenant_id) ?? null;
  }, [selectedTicket, tenants]);

  useEffect(() => {
    if (!onStatsChange) return;
    const activeTickets = tickets.filter((ticket) => ticket.status === "open" || ticket.status === "in_progress").length;
    const urgentTickets = tickets.filter(
      (ticket) => (ticket.priority === "urgent" || ticket.priority === "high") && (ticket.status === "open" || ticket.status === "in_progress")
    ).length;
    onStatsChange({ open: activeTickets, urgent: urgentTickets });
  }, [tickets, onStatsChange]);

  return (
    <div className="support-center">
      <header className="support-header">
        <div>
          <h3>Central de suporte</h3>
          <p className="muted">
            Acompanhe chamados dos municípios e responda rapidamente pela plataforma.
          </p>
        </div>
        <div className="filter">
          <label>
            Status
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">Todos</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {error && <div className="inline-error">{error}</div>}

      <section className="card-secondary">
        <h4>Abrir chamado</h4>
        <form className="ticket-form" onSubmit={handleCreateTicket}>
          <label>
            Município
            <select
              value={newTicket.tenant_id}
              onChange={(event) => setNewTicket((prev) => ({ ...prev, tenant_id: event.target.value }))}
            >
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.display_name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Assunto
            <input
              value={newTicket.subject}
              onChange={(event) => setNewTicket((prev) => ({ ...prev, subject: event.target.value }))}
              placeholder="Erro ao sincronizar matrícula"
              required
            />
          </label>
          <label>
            Categoria
            <input
              value={newTicket.category}
              onChange={(event) => setNewTicket((prev) => ({ ...prev, category: event.target.value }))}
              placeholder="Suporte"
            />
          </label>
          <label>
            Prioridade
            <select
              value={newTicket.priority}
              onChange={(event) => setNewTicket((prev) => ({ ...prev, priority: event.target.value }))}
            >
              {PRIORITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Detalhes
            <textarea
              value={newTicket.description}
              onChange={(event) =>
                setNewTicket((prev) => ({ ...prev, description: event.target.value }))
              }
              rows={3}
              placeholder="Descreva o problema com máximo de detalhes."
              required
            />
          </label>
          <button className="btn" type="submit">
            Abrir chamado
          </button>
        </form>
      </section>

      <div className="support-content">
        <aside className="ticket-list">
          {isLoading ? (
            <p>Carregando…</p>
          ) : tickets.length === 0 ? (
            <p className="muted">Nenhum ticket encontrado.</p>
          ) : (
            <ul>
              {tickets.map((ticket) => (
                <li
                  key={ticket.id}
                  className={selectedTicket?.id === ticket.id ? "active" : ""}
                  onClick={() => {
                    setSelectedTicket(ticket);
                    void loadMessages(ticket.id);
                  }}
                >
                  <div>
                    <strong>{ticket.subject}</strong>
                    <div className="muted">{formatStatus(ticket.status)}</div>
                  </div>
                  <div className={`priority priority-${ticket.priority}`}>
                    {formatPriority(ticket.priority)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="ticket-details">
          {selectedTicket ? (
            <>
              <header className="ticket-header">
                <div>
                  <h4>{selectedTicket.subject}</h4>
                  {currentTenant && <span className="muted">{currentTenant.display_name}</span>}
                </div>
                <div className="ticket-meta">
                  <label>
                    Status
                    <select
                      value={selectedTicket.status}
                      onChange={(event) => handleUpdateTicket({ status: event.target.value })}
                    >
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Prioridade
                    <select
                      value={selectedTicket.priority}
                      onChange={(event) => handleUpdateTicket({ priority: event.target.value })}
                    >
                      {PRIORITY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Responsável
                    <select
                      value={selectedTicket.assigned_to ?? ""}
                      onChange={(event) => {
                        const value = event.target.value;
                        handleUpdateTicket({ assigned_to: value ? value : null });
                      }}
                    >
                      <option value="">Não atribuído</option>
                      {admins.map((admin) => (
                        <option key={admin.id} value={admin.id}>
                          {admin.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </header>

              <article className="ticket-description">
                <p>{selectedTicket.description}</p>
              </article>

              <section className="ticket-messages">
                <h5>Histórico</h5>
                {messages.length === 0 ? (
                  <p className="muted">Nenhuma interação ainda.</p>
                ) : (
                  <ul>
                    {messages.map((message) => (
                      <li key={message.id} className={`message message-${message.author_type}`}>
                        <div className="message-meta">
                          <span>{formatAuthor(message, admins)}</span>
                          <span className="muted">
                            {new Date(message.created_at).toLocaleString()}
                          </span>
                        </div>
                        <p>{message.body}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <footer className="message-composer">
                <textarea
                  rows={3}
                  placeholder="Responder chamado"
                  value={newMessage}
                  onChange={(event) => setNewMessage(event.target.value)}
                />
                <button className="btn" type="button" onClick={handleSendMessage}>
                  Enviar resposta
                </button>
              </footer>
            </>
          ) : (
            <p className="muted">Selecione um ticket ao lado para visualizar os detalhes.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function formatStatus(status: string) {
  const entry = STATUS_OPTIONS.find((option) => option.value === status);
  return entry ? entry.label : status;
}

function formatPriority(priority: string) {
  const entry = PRIORITY_OPTIONS.find((option) => option.value === priority);
  return entry ? entry.label : priority;
}

function formatAuthor(message: SupportMessage, admins: SaaSUser[]) {
  if (message.author_type === "saas_user") {
    if (message.author_id) {
      const admin = admins.find((item) => item.id === message.author_id);
      if (admin) {
        return admin.name;
      }
    }
    return "Equipe Urbanbyte";
  }
  if (message.author_type === "tenant_user") {
    return "Prefeitura";
  }
  return message.author_type;
}
