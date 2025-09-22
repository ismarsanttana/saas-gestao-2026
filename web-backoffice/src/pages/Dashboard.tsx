import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchProfile, logoutBackoffice } from '../services/auth';
import { useSession } from '../auth/session';
import { canUseProfessor } from '../router/guards';

export function DashboardPage() {
  const session = useSession();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isProfessor, setIsProfessor] = useState(canUseProfessor());

  useEffect(() => {
    if (!session.user) {
      return;
    }
    if (!session.user.secretarias.length) {
      return;
    }
    if (!session.accessToken) {
      return;
    }
    if (!session.user.nome) {
      setLoading(true);
      fetchProfile()
        .catch(() => setError('Não foi possível carregar seu perfil.'))
        .finally(() => setLoading(false));
    }
  }, [session.user, session.accessToken]);

  if (!session.user) {
    return null;
  }

  const secretariaAtiva = session.activeSecretaria ?? session.user.secretarias[0] ?? null;
  useEffect(() => {
    setIsProfessor(canUseProfessor());
  }, [session.user]);

  async function handleLogout() {
    await logoutBackoffice();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold">Gestão Municipal</h1>
            <p className="text-sm text-slate-400">{session.user.nome}</p>
          </div>
          <div className="flex items-center gap-3">
            {secretariaAtiva ? (
              <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs uppercase tracking-wide text-slate-300">
                {secretariaAtiva.nome}
              </span>
            ) : (
              <button
                onClick={() => navigate('/select-secretaria')}
                className="rounded border border-accent/40 px-3 py-1 text-xs font-semibold text-accent hover:border-accent"
              >
                Escolher secretaria
              </button>
            )}
            {isProfessor && (
              <button
                onClick={() => navigate('/prof')}
                className="rounded border border-emerald-500/40 px-3 py-1 text-xs font-semibold text-emerald-200 transition hover:border-emerald-400 hover:text-emerald-100"
              >
                Professor
              </button>
            )}
            <button
              onClick={handleLogout}
              className="rounded border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
            >
              Sair
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">
        {error && (
          <div className="rounded border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
            {error}
          </div>
        )}
        {!error && (
          <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow">
            <h2 className="text-lg font-semibold text-white">Painel da secretaria</h2>
            {secretariaAtiva ? (
              <div className="mt-4 text-sm text-slate-300">
                <p>
                  <span className="font-semibold">Secretaria:</span> {secretariaAtiva.nome}
                </p>
                <p>
                  <span className="font-semibold">Papel:</span> {secretariaAtiva.papel}
                </p>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-300">
                Selecione uma secretaria para visualizar os indicadores.
              </p>
            )}
            {session.user.secretarias.length > 1 && (
              <button
                onClick={() => navigate('/select-secretaria')}
                className="mt-6 rounded border border-accent/40 px-4 py-2 text-sm font-medium text-accent transition hover:border-accent hover:text-white hover:bg-accent/20"
              >
                Trocar de secretaria
              </button>
            )}
          </section>
        )}
        {loading && (
          <p className="mt-4 text-sm text-slate-500">Sincronizando dados…</p>
        )}
        {isProfessor && (
          <section className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6 shadow">
            <h2 className="text-lg font-semibold text-emerald-200">Módulo do Professor</h2>
            <p className="mt-2 text-sm text-emerald-100/80">
              Acesse o painel do professor para registrar chamadas, notas e avaliações.
            </p>
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
          </section>
        )}
      </main>
    </div>
  );
}
