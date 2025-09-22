import { useNavigate } from 'react-router-dom';
import { useSession, setActiveSecretariaBySlug } from '../auth/session';

export function SelectSecretariaPage() {
  const session = useSession();
  const navigate = useNavigate();

  if (!session.user) {
    return null;
  }

  async function handleSelect(slug: string) {
    if (setActiveSecretariaBySlug(slug)) {
      navigate(`/dashboard/${slug}`, { replace: true });
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
      <div className="w-full max-w-2xl rounded-xl border border-slate-800 bg-slate-900/70 p-8 shadow-xl">
        <h2 className="text-xl font-semibold">Selecione a secretaria</h2>
        <p className="mt-2 text-sm text-slate-400">
          Você possui acesso a múltiplas secretarias. Escolha uma para continuar.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {session.user.secretarias.map((secretaria) => (
            <button
              key={secretaria.id}
              onClick={() => handleSelect(secretaria.slug)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-4 text-left transition hover:border-accent hover:bg-slate-800/80"
            >
              <p className="text-sm uppercase text-slate-400">{secretaria.papel}</p>
              <p className="mt-1 text-lg font-semibold text-white">{secretaria.nome}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
