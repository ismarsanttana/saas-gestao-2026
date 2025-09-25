import { useEffect, useMemo, useState } from "react";

import { useAuth } from "../state/auth";
import { MonitorAlert, MonitorSummary, MonitorSummaryResponse } from "../types";

type HealthBucket = "ok" | "warning" | "critical";

type MonitorDashboardProps = {
  onRefresh?: () => void;
  onStatsChange?: (stats: { critical: number; warning: number; totalAlerts: number }) => void;
};

export default function MonitorDashboard({ onRefresh, onStatsChange }: MonitorDashboardProps) {
  const { authorizedFetch } = useAuth();
  const [summaries, setSummaries] = useState<MonitorSummary[]>([]);
  const [alerts, setAlerts] = useState<MonitorAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setError(null);
      setIsLoading(true);
      const response = await authorizedFetch<MonitorSummaryResponse>("/saas/monitor/summary");
      setSummaries(response.summaries ?? []);
      setAlerts(response.alerts ?? []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao carregar monitoramento";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleForceRun = async () => {
    try {
      setIsRefreshing(true);
      setError(null);
      await authorizedFetch("/saas/monitor/run", { method: "POST", parseJson: false });
      if (onRefresh) onRefresh();
      // aguarda alguns segundos antes de recarregar
      setTimeout(() => {
        void load();
      }, 1500);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao executar coleta";
      setError(message);
    } finally {
      setIsRefreshing(false);
    }
  };

  const aggregates = useMemo(() => {
    if (!summaries.length) {
      return { avgUptime: 0, critical: 0, warning: 0 };
    }
    let critical = 0;
    let warning = 0;
    const uptimeSum = summaries.reduce((acc, summary) => acc + (summary.uptime_24h ?? 0), 0);
    summaries.forEach((summary) => {
      const bucket = classifySummary(summary);
      if (bucket === "critical") critical += 1;
      if (bucket === "warning") warning += 1;
    });
    return {
      avgUptime: uptimeSum / summaries.length,
      critical,
      warning
    };
  }, [summaries]);

  useEffect(() => {
    if (!onStatsChange) return;
    onStatsChange({
      critical: aggregates.critical,
      warning: aggregates.warning,
      totalAlerts: alerts.length
    });
  }, [aggregates.critical, aggregates.warning, alerts.length, onStatsChange]);

  return (
    <section>
      <div className="monitor-header">
        <div>
          <h2>Saúde operacional</h2>
          <p className="muted">
            Acompanhe uptime, latência e alertas gerados pelas checagens automáticas dos tenants.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn btn-secondary" type="button" onClick={() => void load()} disabled={isLoading || isRefreshing}>
            Recarregar
          </button>
          <button className="btn" type="button" onClick={handleForceRun} disabled={isRefreshing}>
            {isRefreshing ? "Executando..." : "Rodar agora"}
          </button>
        </div>
      </div>

      {error && <div className="inline-error" style={{ marginTop: "0.5rem" }}>{error}</div>}

      <div className="monitor-summary">
        <div>
          <span className="muted">Uptime médio 24h</span>
          <strong>{formatPercent(aggregates.avgUptime)}</strong>
        </div>
        <div>
          <span className="muted">Alertas críticos</span>
          <strong className={aggregates.critical ? "text-critical" : "text-muted"}>{aggregates.critical}</strong>
        </div>
        <div>
          <span className="muted">Alertas em atenção</span>
          <strong className={aggregates.warning ? "text-warning" : "text-muted"}>{aggregates.warning}</strong>
        </div>
      </div>

      {isLoading ? (
        <p>Carregando métricas…</p>
      ) : summaries.length === 0 ? (
        <p className="muted">Nenhum dado coletado ainda. Execute o monitoramento para preencher este painel.</p>
      ) : (
        <div className="monitor-grid">
          {summaries.map((summary) => (
            <article key={summary.tenant_id} className={`monitor-card monitor-${classifySummary(summary)}`}>
              <header>
                <div>
                  <strong>{summary.name}</strong>
                  <span className="muted">/{summary.slug}</span>
                </div>
                <span className="monitor-status">{statusLabel(summary.last_status)}</span>
              </header>
              <dl>
                <div>
                  <dt>Uptime 24h</dt>
                  <dd>{formatPercent(summary.uptime_24h)}</dd>
                </div>
                <div>
                  <dt>P95 resposta</dt>
                  <dd>{summary.response_p95_ms != null ? `${summary.response_p95_ms} ms` : "—"}</dd>
                </div>
                <div>
                  <dt>DNS</dt>
                  <dd>{summary.dns_status ?? "—"}</dd>
                </div>
                <div>
                  <dt>Erros 24h</dt>
                  <dd>{formatPercent(summary.error_rate_24h)}</dd>
                </div>
              </dl>
              <footer>
                <span className="muted">Última verificação {summary.last_checked_at ? new Date(summary.last_checked_at).toLocaleString() : "—"}</span>
                <a className="link" href={`https://${summary.domain}`} target="_blank" rel="noreferrer">
                  {summary.domain}
                </a>
              </footer>
            </article>
          ))}
        </div>
      )}

      <div className="monitor-alerts">
        <h3>Alertas recentes</h3>
        {alerts.length === 0 ? (
          <p className="muted">Nenhum alerta nas últimas execuções.</p>
        ) : (
          <ul>
              {alerts.map((alert) => (
              <li key={alert.id} className={`alert-${alert.severity ?? "info"}`}>
                <div>
                  <strong>{(alert.severity ?? "info").toUpperCase()}</strong>
                  <span className="muted">
                    {new Date(alert.triggered_at).toLocaleString()}
                    {alert.tenant_id ? ` • ${alert.tenant_id}` : ""}
                  </span>
                </div>
                <p>{alert.message}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function classifySummary(summary: MonitorSummary): HealthBucket {
  if (summary.error_rate_24h >= 30 || summary.uptime_24h <= 70) {
    return "critical";
  }
  if (summary.error_rate_24h >= 10 || summary.uptime_24h < 95) {
    return "warning";
  }
  return "ok";
}

function formatPercent(value?: number | null) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toFixed(2)}%`;
}

function statusLabel(status?: string | null) {
  if (!status) return "Sem dados";
  switch (status.toLowerCase()) {
    case "ok":
      return "Estável";
    case "warning":
      return "Instável";
    case "error":
      return "Erro";
    default:
      return status;
  }
}
