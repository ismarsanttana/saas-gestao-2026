import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis
} from 'recharts';

import { professorApi } from '../../lib/api';
import { useThemeStore } from '../../stores/themeStore';
import type { AgendaItem, ProfessorOverview, Turma } from '../../types/edu';
import { Info, School } from 'lucide-react';

interface AnalyticsData {
  averages: Array<{ turma_id: string; turma: string; media: number }>;
  top_students: Array<{ aluno_id: string; nome: string; turma: string; media: number }>;
  attendance: Array<{ turma_id: string; turma: string; frequencia: number }>;
  alerts: Array<{ aluno_id: string; nome: string; turma: string; motivo: string; valor: number }>;
  workload?: {
    horas_semana: number;
    horas_concluidas: number;
    horas_restantes: number;
    percentual: number;
  };
}

interface LivePresence {
  turma_id: string;
  turma: string;
  presentes: number;
  esperados: number;
  percentual: number;
  atualizado_em?: string;
}

export default function ProfessorHome() {
  const [overview, setOverview] = useState<ProfessorOverview | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const theme = useThemeStore((state) => state.theme);
  const isLight = theme === 'light';
  const [live, setLive] = useState<LivePresence[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<AgendaItem[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const [overviewData, analyticsData] = await Promise.all([
          professorApi.getOverview(),
          professorApi.getDashboardAnalytics()
        ]);
        setOverview(overviewData);
        setAnalytics(analyticsData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Não foi possível carregar o painel.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    let timer: number | undefined;
    async function loadLive() {
      try {
        const data = await professorApi.getLivePresence();
        setLive(data);
      } catch (error) {
        // silenciosamente
      }
    }
    loadLive();
    timer = window.setInterval(loadLive, 10000);
    return () => {
      if (timer) window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    async function loadCalendar() {
      if (!overview?.turmas?.length) return;
      const today = new Date();
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
      try {
        const eventos = await professorApi.getAgenda(firstDay, lastDay);
        setCalendarEvents(eventos);
      } catch (error) {
        // ignore
      }
    }
    loadCalendar();
  }, [overview?.turmas]);

  const turmas = overview?.turmas ?? [];
  const eventos = (overview?.proximas_aulas ?? []).slice(0, 5);
  const mediasTurma = analytics?.averages ?? [];
  const topAlunos = analytics?.top_students ?? [];
  const frequencias = analytics?.attendance ?? [];
  const alertas = analytics?.alerts ?? [];
  const workload = analytics?.workload ?? {
    horas_semana: 0,
    horas_concluidas: 0,
    horas_restantes: 0,
    percentual: 0
  };
  const progressoCarga = Math.max(0, Math.min(100, Number.isFinite(workload.percentual) ? workload.percentual : 0));
  const horasPlanejadas = workload.horas_semana || workload.horas_concluidas + workload.horas_restantes;

  const escolas = useMemo(() => {
    const nomes = turmas
      .map((turma) => turma.escolaNome?.trim())
      .filter((nome): nome is string => Boolean(nome && nome.length));
    return Array.from(new Set(nomes));
  }, [turmas]);

  const eventosFormatados = useMemo(
    () =>
      eventos.map((evento: AgendaItem) => ({
        ...evento,
        inicioFormatado: new Date(evento.inicio).toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        })
      })),
    [eventos]
  );

  useEffect(() => {
    const onProfileUpdated = () => {
      professorApi
        .getOverview()
        .then((overviewData) => setOverview(overviewData))
        .catch(() => null);
    };

    window.addEventListener('professor:profile-updated', onProfileUpdated);
    return () => window.removeEventListener('professor:profile-updated', onProfileUpdated);
  }, []);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="flex flex-col gap-4 rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-6 shadow-sm backdrop-blur md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {overview ? `Olá, ${overview.nome}!` : 'Painel do Professor'}
          </h1>
          <p className="text-sm text-emerald-50/80">
            Acompanhe presença, avaliações e materiais das suas turmas em um só lugar.
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-500/30 bg-slate-950/30 p-4 text-sm text-emerald-100 shadow-inner">
          <p className="text-xs uppercase tracking-wide text-emerald-200/80">Escolas vinculadas</p>
          {escolas.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {escolas.map((nome) => (
                <span
                  key={nome}
                  className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-100"
                >
                  <School size={14} />
                  {nome}
                </span>
              ))}
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-2 text-xs text-emerald-100/70">
              <Info size={14} />
              <span>Sem escola vinculada nas suas turmas atuais.</span>
            </div>
          )}
        </div>
      </header>

      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          {error}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPI light={isLight} title="Turmas" loading={loading} value={overview?.contadores.turmas ?? 0} />
        <KPI light={isLight} title="Alunos" loading={loading} value={overview?.contadores.alunos ?? 0} />
        <KPI light={isLight} title="Próximas aulas" loading={loading} value={eventos.length} />
        <KPI light={isLight} title="Avaliações" loading={loading} value={turmas.length} suffix="turmas" />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div
          className={`rounded-3xl border p-6 shadow ${
            isLight
              ? 'border-blue-100 bg-white/90 text-slate-800'
              : 'border-slate-800 bg-slate-900/70 text-slate-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-emerald-400/80">Carga horária</p>
              <h2 className="text-xl font-semibold">Resumo semanal</h2>
              <p className="text-sm text-slate-400">Acompanhe as horas previstas, concluídas e pendentes.</p>
            </div>
            <div className="rounded-2xl bg-emerald-500/10 px-3 py-2 text-right text-xs text-emerald-200">
              <span>{new Intl.NumberFormat('pt-BR', { minimumIntegerDigits: 2 }).format(Math.round(progressoCarga))}%</span>
              <p className="text-[10px] uppercase tracking-wide text-emerald-300/70">progresso</p>
            </div>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-800/50 bg-slate-900/40 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Horas aula esta semana</p>
              <p className="mt-2 text-2xl font-semibold text-emerald-400">
                {horasPlanejadas.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}h
              </p>
            </div>
            <div className="rounded-xl border border-slate-800/50 bg-slate-900/40 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Horas concluídas</p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {workload.horas_concluidas.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}h
              </p>
            </div>
            <div className="rounded-xl border border-slate-800/50 bg-slate-900/40 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Horas restantes</p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {Math.max(0, workload.horas_restantes).toLocaleString('pt-BR', {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 1
                })}
                h
              </p>
            </div>
          </div>
        </div>

        <div
          className={`relative flex min-h-[220px] flex-col items-center justify-center overflow-hidden rounded-3xl border p-6 shadow ${
            isLight ? 'border-blue-100 bg-white/90 text-slate-800' : 'border-slate-800 bg-slate-900/70 text-slate-100'
          }`}
        >
          <ResponsiveContainer width="100%" height={220}>
            <RadialBarChart
              cx="50%"
              cy="50%"
              innerRadius="60%"
              outerRadius="100%"
              data={[{ name: 'Progresso', value: progressoCarga }]}
              startAngle={90}
              endAngle={90 + (360 * progressoCarga) / 100}
            >
              <PolarAngleAxis type="number" domain={[0, 100]} tick={false} angleAxisId={0} />
              <RadialBar
                minAngle={15}
                clockWise
                dataKey="value"
                cornerRadius={12}
                fill={isLight ? '#22c55e' : '#34d399'}
                background={{ fill: isLight ? '#e2e8f0' : '#0f172a' }}
              />
            </RadialBarChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <p className="text-3xl font-semibold text-emerald-400">
              {progressoCarga.toLocaleString('pt-BR', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 1
              })}
              %
            </p>
            <p className="text-xs uppercase tracking-wide text-slate-400">Progresso semanal</p>
            <p className="mt-1 text-xs text-slate-500">
              {workload.horas_concluidas.toLocaleString('pt-BR', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 1
              })}
              h de {horasPlanejadas.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}h
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <ChartCard light={isLight} title="Média por turma" loading={loading} empty={mediasTurma.length === 0}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={mediasTurma}>
              <CartesianGrid strokeDasharray="3 3" stroke={isLight ? '#e2e8f0' : '#1e293b'} />
              <XAxis dataKey="turma" stroke={isLight ? '#475569' : '#94a3b8'} />
              <YAxis domain={[0, 10]} stroke={isLight ? '#475569' : '#94a3b8'} />
              <Tooltip
                formatter={(value: number) => value.toFixed(1)}
                contentStyle={{ background: isLight ? '#ffffff' : '#0f172a', border: '1px solid var(--tw-ring-color, #1e3a8a)' }}
              />
              <Bar
                dataKey="media"
                fill={isLight ? '#2563eb' : '#34d399'}
                radius={[6, 6, 0, 0]}
                isAnimationActive
                animationDuration={900}
                animationBegin={100}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          light={isLight}
          title="Frequência (últimos 30 dias)"
          loading={loading}
          empty={frequencias.length === 0}
        >
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={frequencias}>
              <CartesianGrid strokeDasharray="3 3" stroke={isLight ? '#e2e8f0' : '#1e293b'} />
              <XAxis dataKey="turma" stroke={isLight ? '#475569' : '#94a3b8'} />
              <YAxis
                domain={[0, 1]}
                stroke={isLight ? '#475569' : '#94a3b8'}
                tickFormatter={(value) => `${Math.round(value * 100)}%`}
              />
              <Tooltip
                formatter={(value: number) => `${Math.round(value * 100)}%`}
                contentStyle={{ background: isLight ? '#ffffff' : '#0f172a', border: '1px solid var(--tw-ring-color, #1e3a8a)' }}
              />
              <Line
                type="monotone"
                dataKey="frequencia"
                stroke={isLight ? '#2563eb' : '#60a5fa'}
                strokeWidth={2}
                dot={{ r: 3 }}
                isAnimationActive
                animationDuration={900}
                animationBegin={150}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>

        <section className="mt-8 grid gap-4 lg:grid-cols-2">
          <div
            className={`rounded-xl border p-5 shadow ${isLight ? 'border-blue-100 bg-white/90 text-slate-800' : 'border-slate-800 bg-slate-900/70'}`}
          >
            <h2 className="text-lg font-semibold">Top alunos</h2>
            <p className="text-sm text-slate-400">Ranking das maiores médias registradas.</p>
            <ul className="mt-4 space-y-3 text-sm">
              {topAlunos.length === 0 && <li className="text-slate-500">Nenhuma nota lançada.</li>}
              {topAlunos.map((aluno) => (
                <li key={aluno.aluno_id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
                  <div>
                    <p className="font-medium">{aluno.nome}</p>
                    <span className="text-xs text-slate-400">{aluno.turma}</span>
                  </div>
                  <span className="text-sm font-semibold text-emerald-400">{Number(aluno.media ?? 0).toFixed(1)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div
            className={`rounded-xl border p-5 shadow ${isLight ? 'border-blue-100 bg-white/90 text-slate-800' : 'border-slate-800 bg-slate-900/70'}`}
          >
            <h2 className="text-lg font-semibold">Alertas de frequência</h2>
            <p className="text-sm text-slate-400">Alunos com presença abaixo de 75% nos últimos 30 dias.</p>
            <ul className="mt-4 space-y-3 text-sm">
              {alertas.length === 0 && <li className="text-slate-500">Nenhum alerta.</li>}
              {alertas.map((alerta) => (
                <li
                  key={alerta.aluno_id}
                  className="rounded-lg border border-rose-200/60 bg-rose-100/20 px-3 py-2 text-rose-900"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{alerta.nome}</p>
                      <span className="text-xs text-rose-700/70">{alerta.turma}</span>
                    </div>
                    <span className="text-xs font-semibold text-rose-500">{Math.round((alerta.valor ?? 0) * 100)}%</span>
                  </div>
                  <p className="mt-1 text-xs text-rose-700/80">{alerta.motivo}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mt-10 grid gap-4 lg:grid-cols-3">
          <ShortcutCard
            light={isLight}
            title="Registrar chamada"
            description="Selecione turma, data e turno para lançar a presença."
            to="/prof/chamada"
          />
          <ShortcutCard
            light={isLight}
            title="Avaliações"
            description="Crie, publique e acompanhe avaliações objetivas."
            to="/prof/avaliacoes"
          />
          <ShortcutCard
            light={isLight}
            title="Materiais e agenda"
            description="Compartilhe materiais e acompanhe eventos próximos."
            to="/prof/materiais"
          />
        </section>

        <section className="mt-12 grid gap-4 lg:grid-cols-2">
          <div
            className={`rounded-xl border p-5 shadow ${isLight ? 'border-blue-100 bg-white/90 text-slate-800' : 'border-slate-800 bg-slate-900/70'}`}
          >
            <h2 className="text-lg font-semibold">Turmas vinculadas</h2>
            <p className="mt-1 text-sm text-slate-400">
              Acesse rapidamente a turma desejada para registrar presença, notas ou materiais.
            </p>
            <ul className="mt-4 space-y-3 text-sm">
              {turmas.length === 0 && <li className="text-slate-500">Nenhuma turma vinculada.</li>}
              {turmas.map((turma: Turma, index) => (
                <li
                  key={turma.id}
                  className={`flex items-center justify-between rounded-xl border px-3 py-3 shadow-sm transition ${badgeColor(index, isLight)}`}
                >
                  <div>
                    <p className="font-medium">{turma.nome}</p>
                    <span className="text-xs uppercase tracking-wide text-slate-500">{turma.turno}</span>
                  </div>
                  <Link
                    to={`/prof/chamada?turma=${turma.id}`}
                    className="text-xs font-semibold text-white/90 hover:text-white"
                  >
                    Abrir chamada
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div
            className={`rounded-xl border p-5 shadow ${isLight ? 'border-blue-100 bg-white/90 text-slate-800' : 'border-slate-800 bg-slate-900/70'}`}
          >
            <h2 className="text-lg font-semibold">Próximos compromissos</h2>
            <p className="mt-1 text-sm text-slate-400">Aulas e avaliações agendadas para hoje e próximos dias.</p>
            <ul className="mt-4 space-y-3 text-sm">
              {eventosFormatados.length === 0 && (
                <li className="text-slate-500">Nenhum evento futuro encontrado.</li>
              )}
              {eventosFormatados.map((evento) => (
                <li
                  key={`${evento.tipo}-${evento.id}`}
                  className="rounded border border-blue-100 bg-white/90 px-3 py-2 text-slate-800 shadow-sm"
                >
                  <div className="flex items-center justify-between text-xs uppercase tracking-wide text-blue-500">
                    <span>{evento.tipo}</span>
                    <span>{evento.inicioFormatado}</span>
                  </div>
                  <p className="mt-1 font-medium">{evento.titulo}</p>
                  <p className="text-xs text-slate-500">{evento.turmaNome}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mt-10 grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div
            className={`rounded-xl border p-6 shadow ${isLight ? 'border-blue-100 bg-white text-slate-800' : 'border-slate-800 bg-slate-900/70 text-white'}`}
          >
            <h2 className="text-lg font-semibold">Calendário do mês</h2>
            <MonthlyCalendar light={isLight} eventos={calendarEvents} />
          </div>

          <div
            className={`rounded-xl border p-6 shadow ${isLight ? 'border-blue-100 bg-white text-slate-800' : 'border-slate-800 bg-slate-900/70 text-white'}`}
          >
            <h2 className="text-lg font-semibold">Entrada em tempo real</h2>
            <p className="mt-1 text-sm text-slate-400">Atualiza automaticamente a cada 10 segundos.</p>
            <ul className="mt-4 space-y-3 text-sm">
              {live.length === 0 && <li className="text-slate-500">Nenhum registro disponível.</li>}
              {live.map((item) => (
                <li
                  key={item.turma_id}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                    item.percentual < 0.75
                      ? 'border border-rose-200/70 bg-rose-100/30 text-rose-900'
                      : 'border border-emerald-200/70 bg-emerald-100/30 text-emerald-900'
                  }`}
                >
                  <div>
                    <p className="font-medium">{item.turma}</p>
                    <span className="text-xs text-slate-600">
                      {item.presentes}/{item.esperados} presentes
                    </span>
                  </div>
                  <span className="text-xs font-semibold">
                    {Math.round((item.percentual ?? 0) * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
    </div>
  );
}

function KPI({ light, title, value, loading, suffix }: { light: boolean; title: string; value: string | number; loading?: boolean; suffix?: string }) {
  return (
    <div
      className={`rounded-xl border p-4 shadow transition ${
        light ? 'border-blue-100 bg-white text-slate-800' : 'border-slate-800 bg-slate-900/70'
      }`}
    >
      <p className={`text-xs uppercase tracking-wide ${light ? 'text-blue-500' : 'text-slate-400'}`}>{title}</p>
      <p className={`mt-2 text-2xl font-semibold ${light ? 'text-slate-900' : 'text-white'}`}>
        {loading ? '…' : value}
        {suffix ? <span className="ml-1 text-xs text-slate-400">{suffix}</span> : null}
      </p>
    </div>
  );
}

function ShortcutCard({ light, title, description, to }: { light: boolean; title: string; description: string; to: string }) {
  return (
    <Link
      to={to}
      className={`rounded-xl border p-6 shadow transition ${
        light
          ? 'border-blue-100 bg-white hover:border-blue-300 hover:bg-blue-50'
          : 'border-slate-800 bg-slate-900/60 hover:border-emerald-500/40 hover:bg-slate-900'
      }`}
    >
      <h2 className={`text-lg font-semibold ${light ? 'text-slate-900' : 'text-white'}`}>{title}</h2>
      <p className={`mt-2 text-sm ${light ? 'text-slate-500' : 'text-slate-400'}`}>{description}</p>
    </Link>
  );
}

function ChartCard({ light, title, loading, empty, children }: { light: boolean; title: string; loading: boolean; empty: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`rounded-xl border p-6 shadow ${
        light ? 'border-blue-100 bg-white text-slate-800' : 'border-slate-800 bg-slate-900/70'
      }`}
    >
      <h2 className={`text-lg font-semibold ${light ? 'text-slate-900' : 'text-white'}`}>{title}</h2>
      <div className="mt-4 h-60">
        {loading ? (
          <p className="flex h-full items-center justify-center text-sm text-slate-500">Carregando…</p>
        ) : empty ? (
          <p className="flex h-full items-center justify-center text-sm text-slate-500">Nenhum dado disponível.</p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function badgeColor(index: number, light: boolean) {
  const darkColors = [
    'border-emerald-500/40 bg-emerald-500/10 text-emerald-100',
    'border-sky-500/40 bg-sky-500/10 text-sky-100',
    'border-violet-500/40 bg-violet-500/10 text-violet-100',
    'border-amber-500/40 bg-amber-500/10 text-amber-100'
  ];
  const lightColors = [
    'border-emerald-200 bg-emerald-100/80 text-emerald-800',
    'border-sky-200 bg-sky-100/80 text-sky-800',
    'border-violet-200 bg-violet-100/80 text-violet-800',
    'border-amber-200 bg-amber-100/80 text-amber-800'
  ];
  return (light ? lightColors : darkColors)[index % darkColors.length];
}

function MonthlyCalendar({ light, eventos }: { light: boolean; eventos: AgendaItem[] }) {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const weeks: Array<Array<{ date: Date | null; events: AgendaItem[] }>> = [];

  let current = new Date(firstDay);
  current.setDate(current.getDate() - current.getDay());

  while (current <= lastDay || current.getDay() !== 0) {
    const week: Array<{ date: Date | null; events: AgendaItem[] }> = [];
    for (let i = 0; i < 7; i++) {
      const dateCopy = new Date(current);
      const inMonth = dateCopy.getMonth() === today.getMonth();
      const dayEvents = eventos.filter((evento) => {
        const date = new Date(evento.inicio);
        return (
          date.getDate() === dateCopy.getDate() &&
          date.getMonth() === dateCopy.getMonth() &&
          date.getFullYear() === dateCopy.getFullYear()
        );
      });
      week.push({ date: inMonth ? dateCopy : null, events: dayEvents });
      current.setDate(current.getDate() + 1);
    }
    weeks.push(week);
  }

  return (
    <div className="mt-4 grid grid-cols-7 gap-2 text-xs">
      {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((dia) => (
        <div key={dia} className="text-center font-semibold text-slate-400">
          {dia}
        </div>
      ))}
      {weeks.flat().map((cell, index) => {
        if (!cell.date) {
          return <div key={`empty-${index}`} className="rounded-lg border border-transparent" />;
        }
        const isToday = cell.date.toDateString() === new Date().toDateString();
        return (
          <div
            key={cell.date.toISOString()}
            className={`rounded-lg border px-2 py-2 min-h-[72px] transition ${
              light
                ? 'border-blue-100 bg-blue-50/60'
                : 'border-slate-800 bg-slate-900/60'
            } ${isToday ? 'ring-2 ring-emerald-400' : ''}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">{cell.date.getDate()}</span>
              {cell.events.length > 0 && (
                <span className="text-[10px] font-semibold text-emerald-400">
                  {cell.events.length}
                </span>
              )}
            </div>
            <ul className="mt-1 space-y-1">
              {cell.events.slice(0, 2).map((evento) => (
                <li key={`${evento.id}-${evento.titulo}`}
                    className="truncate rounded bg-emerald-500/10 px-1 text-[10px] text-emerald-300">
                  {evento.titulo}
                </li>
              ))}
              {cell.events.length > 2 && (
                <li className="text-[10px] text-slate-400">+ {cell.events.length - 2} eventos</li>
              )}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
