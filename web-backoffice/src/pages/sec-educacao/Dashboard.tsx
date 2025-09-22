import { useNavigate } from 'react-router-dom';
import { useSession } from '../../auth/session';
import { useAuth } from '../../stores/authStore';

export default function SecEducacaoDashboard() {
  const navigate = useNavigate();
  const session = useSession();
  const roles = useAuth((state) => state.roles);
  const isProfessor = roles.includes('PROFESSOR');
  const secretariaAtiva = session.activeSecretaria ?? session.user?.secretarias?.[0] ?? null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Secretaria de Educação</h1>
        <p className="mt-1 text-sm text-slate-400">Acompanhe indicadores e ações da educação municipal.</p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {secretariaAtiva && (
            <span className="rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1 text-xs uppercase tracking-wide text-slate-300">
              {secretariaAtiva.nome}
            </span>
          )}
          {isProfessor && (
            <span className="rounded-full border border-emerald-500/60 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
              Professor
            </span>
          )}
        </div>

        {isProfessor && (
          <section className="mt-8 space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-6 shadow">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">Módulo do Professor</h2>
                  <p className="mt-2 text-sm text-slate-400">Acesso rápido às ferramentas de sala de aula.</p>
                </div>
                <span className="rounded-full border border-emerald-400 px-3 py-1 text-xs font-semibold text-emerald-300">
                  Professor
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-3 text-sm">
                <button
                  onClick={() => navigate('/prof')}
                  className="rounded bg-emerald-500 px-4 py-2 font-semibold text-emerald-950 transition hover:bg-emerald-400"
                >
                  Abrir painel do professor
                </button>
                <button
                  onClick={() => navigate('/prof/chamadas')}
                  className="rounded border border-emerald-500 px-4 py-2 font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
                >
                  Ir para chamadas
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
