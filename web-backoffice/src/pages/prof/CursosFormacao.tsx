import { GraduationCap, Info, PlayCircle } from 'lucide-react';

import { useThemeStore } from '../../stores/themeStore';

export default function ProfessorCursosFormacao() {
  const theme = useThemeStore((state) => state.theme);
  const isLight = theme === 'light';

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header
        className={`rounded-3xl border p-6 shadow ${
          isLight
            ? 'border-blue-100 bg-white text-slate-900'
            : 'border-slate-800 bg-slate-900/70 text-white'
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Cursos de Formação</h1>
            <p className={`mt-1 max-w-2xl text-sm ${isLight ? 'text-slate-500' : 'text-slate-300/90'}`}>
              Em breve você poderá acompanhar trilhas de formação continuada, registrar progresso e acessar certificados emitidos pela secretaria.
            </p>
          </div>
          <GraduationCap className="h-10 w-10 text-emerald-400" />
        </div>
      </header>

      <section
        className={`rounded-2xl border p-6 shadow-inner ${
          isLight
            ? 'border-dashed border-blue-200 bg-blue-50/40 text-slate-700'
            : 'border-dashed border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
        }`}
      >
        <div className="flex items-start gap-3">
          <Info className="mt-1 h-5 w-5" />
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide">Trilha em construção</h2>
            <p className="mt-1 text-sm leading-relaxed opacity-90">
              A equipe pedagógica está finalizando o catálogo de cursos. O objetivo é disponibilizar formações alinhadas ao currículo municipal, com aulas síncronas e conteúdo on-demand.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div
          className={`rounded-2xl border p-5 shadow ${
            isLight
              ? 'border-blue-100 bg-white text-slate-800'
              : 'border-slate-800 bg-slate-900/70 text-white'
          }`}
        >
          <h3 className="text-lg font-semibold">O que vem por aí</h3>
          <ul className={`mt-3 space-y-2 text-sm ${isLight ? 'text-slate-500' : 'text-slate-300/90'}`}>
            <li>• Trilhas temáticas (BNCC, letramento, alfabetização).</li>
            <li>• Videoaulas com material complementar para download.</li>
            <li>• Avaliações rápidas para certificação automática.</li>
          </ul>
        </div>
        <div
          className={`rounded-2xl border p-5 shadow ${
            isLight
              ? 'border-blue-100 bg-white text-slate-800'
              : 'border-slate-800 bg-slate-900/70 text-white'
          }`}
        >
          <h3 className="text-lg font-semibold">Planeje-se</h3>
          <p className={`mt-3 text-sm ${isLight ? 'text-slate-500' : 'text-slate-300/90'}`}>
            Prepare sugestões de temas e indique horários preferenciais. Será possível integrar os cursos ao calendário do professor e receber lembretes automáticos.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-dashed border-emerald-400/60 bg-emerald-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-300">
            <PlayCircle size={14} />
            Catálogo de vídeos será liberado em breve
          </div>
        </div>
      </section>
    </div>
  );
}
