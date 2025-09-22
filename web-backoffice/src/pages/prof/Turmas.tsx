import { useEffect, useState } from 'react';
import { professorApi } from '../../lib/api';
import { useThemeStore } from '../../stores/themeStore';
import type { Turma } from '../../types/edu';

export default function ProfessorTurmas() {
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const theme = useThemeStore((state) => state.theme);
  const isLight = theme === 'light';

  useEffect(() => {
    async function load() {
      try {
        const data = await professorApi.getTurmas();
        setTurmas(data);
      } catch (err) {
        setErro(err instanceof Error ? err.message : 'Não foi possível carregar turmas.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className={`min-h-screen ${isLight ? 'bg-slate-50 text-slate-900' : 'bg-slate-950 text-slate-100'}`}>
      <div className="mx-auto max-w-5xl px-6 py-8">
        <header>
          <h1 className="text-2xl font-semibold">Turmas vinculadas</h1>
          <p className="mt-1 text-sm text-slate-400">Lista das turmas nas quais você leciona atualmente.</p>
        </header>

        {erro && (
          <div className="mt-4 rounded border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
            {erro}
          </div>
        )}

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {loading && (
            <div className={`rounded border p-4 ${isLight ? 'border-blue-100 bg-white' : 'border-slate-800 bg-slate-900/60'}`}>
              Carregando…
            </div>
          )}
          {!loading && turmas.length === 0 && (
            <div className={`rounded border p-4 text-sm ${isLight ? 'border-blue-100 bg-white text-slate-500' : 'border-slate-800 bg-slate-900/60 text-slate-400'}`}>
              Nenhuma turma vinculada.
            </div>
          )}
          {turmas.map((turma, index) => (
            <div
              key={turma.id}
              className={`rounded-xl border px-4 py-4 shadow ${badgeColor(index, isLight)}`}
            >
              <h2 className={`text-lg font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>{turma.nome}</h2>
              <p className={`text-xs uppercase tracking-wide ${isLight ? 'text-slate-600' : 'text-white/80'}`}>
                {turma.turno}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function badgeColor(index: number, light: boolean) {
  const dark = [
    'border-emerald-500/40 bg-emerald-500/10',
    'border-sky-500/40 bg-sky-500/10',
    'border-violet-500/40 bg-violet-500/10',
    'border-amber-500/40 bg-amber-500/10'
  ];
  const lightPalette = [
    'border-emerald-200 bg-emerald-100/80 text-emerald-800',
    'border-sky-200 bg-sky-100/80 text-sky-800',
    'border-violet-200 bg-violet-100/80 text-violet-800',
    'border-amber-200 bg-amber-100/80 text-amber-800'
  ];
  return (light ? lightPalette : dark)[index % dark.length];
}
