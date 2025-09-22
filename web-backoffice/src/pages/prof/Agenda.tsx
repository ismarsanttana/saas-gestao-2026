import { useEffect, useState } from 'react';
import { professorApi } from '../../lib/api';
import type { AgendaItem } from '../../types/edu';

function today(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export default function ProfessorAgenda() {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today(7));
  const [eventos, setEventos] = useState<AgendaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setErro(null);
      try {
        const data = await professorApi.getAgenda(from, to);
        setEventos(data);
      } catch (err) {
        setErro(err instanceof Error ? err.message : 'Falha ao carregar agenda');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [from, to]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <header className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Agenda</h1>
            <p className="text-sm text-slate-400">Visualize aulas, avaliações e eventos no período selecionado.</p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-slate-300">
            <label className="flex flex-col">
              <span className="mb-1 text-xs uppercase tracking-wide text-slate-400">De</span>
              <input
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white shadow focus:border-emerald-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col">
              <span className="mb-1 text-xs uppercase tracking-wide text-slate-400">Até</span>
              <input
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white shadow focus:border-emerald-500 focus:outline-none"
              />
            </label>
          </div>
        </header>

        {erro && (
          <div className="mt-4 rounded border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
            {erro}
          </div>
        )}

        <div className="mt-6 space-y-3">
          {loading && <p className="text-sm text-slate-500">Carregando eventos…</p>}
          {!loading && eventos.length === 0 && (
            <p className="text-sm text-slate-500">Nenhum evento encontrado para o período informado.</p>
          )}
          {eventos.map((evento) => (
            <div key={`${evento.tipo}-${evento.id}`} className="rounded border border-slate-800 bg-slate-900/60 px-4 py-3">
              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-400">
                <span>{evento.tipo}</span>
                <span>
                  {new Date(evento.inicio).toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </div>
              <p className="mt-1 text-sm font-semibold text-white">{evento.titulo}</p>
              <p className="text-xs text-slate-400">{evento.turmaNome}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
