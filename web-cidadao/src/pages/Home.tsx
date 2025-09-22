import { useEffect, useState } from 'react';
import { fetchProfile, logoutCitizen } from '../api/client';
import { useSession } from '../auth/session';

export function HomePage() {
  const session = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session.user && session.accessToken) {
      setLoading(true);
      fetchProfile()
        .catch(() => setError('Não foi possível carregar seu perfil.'))
        .finally(() => setLoading(false));
    }
  }, [session.user, session.accessToken]);

  async function handleLogout() {
    await logoutCitizen();
    window.location.href = '/login';
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="rounded-lg bg-white px-6 py-4 shadow">Carregando…</div>
      </div>
    );
  }

  if (!session.user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white shadow">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Bem-vindo(a), {session.user.nome}</h1>
            <p className="text-sm text-slate-500">App do Cidadão • Prefeitura de Zabelê</p>
          </div>
          <button
            onClick={handleLogout}
            className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-800"
          >
            Sair
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-10">
        {error ? (
          <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        ) : (
          <section className="rounded-lg bg-white p-6 shadow">
            <h2 className="text-lg font-semibold text-slate-900">Serviços rápidos</h2>
            <p className="mt-2 text-sm text-slate-600">
              Em breve você encontrará aqui seus protocolos, agendamentos e solicitações.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
