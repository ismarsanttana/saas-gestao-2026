import { FormEvent, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { setSession as setLegacySession, markInitialized as legacyInit } from '../auth/session';
import { useAuth } from '../stores/authStore';
import type { User } from '../types';
import {
  beginPasskeyLogin,
  finishPasskeyLogin
} from '../services/auth';
import {
  credentialToJSON,
  publicKeyCredentialRequestOptionsFromJSON
} from '../utils/webauthn';

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);

  const supportsPasskey = useMemo(
    () => typeof window !== 'undefined' && 'PublicKeyCredential' in window,
    []
  );

  const applyLoginResult = (payload: { access_token?: string; user?: User }) => {
    if (!payload || !payload.user) {
      throw new Error('Resposta inválida da API');
    }

    useAuth.getState().setAuth(payload.user, payload.access_token ?? null);
    setLegacySession(
      {
        id: payload.user.id,
        nome: payload.user.nome,
        email: payload.user.email,
        secretarias: payload.user.secretarias ?? []
      },
      payload.access_token ?? undefined
    );
    legacyInit();

    const { has } = useAuth.getState();
    if (has('ADMIN_TEC')) {
      navigate('/admin', { replace: true });
      return;
    }
    if (has('SECRETARIO', 'educacao') || has('ATENDENTE', 'educacao')) {
      navigate('/sec/educacao', { replace: true });
      return;
    }
    if (has('PROFESSOR')) {
      navigate('/prof', { replace: true });
      return;
    }
    navigate('/', { replace: true });
  };

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = (await apiFetch(
        '/auth/backoffice/login',
        {
          method: 'POST',
          body: JSON.stringify({ email, senha })
        },
        false
      )) as { data?: { access_token: string; user: User }; access_token?: string; user?: User };

      const payload = response?.data ?? response;
      applyLoginResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível autenticar');
    } finally {
      setLoading(false);
    }
  }

  const handlePasskeyLogin = async () => {
    if (!supportsPasskey || loading) return;
    if (!email.trim()) {
      setError('Informe o e-mail para continuar com a biometria.');
      return;
    }

    setError(null);
    setPasskeyLoading(true);

    try {
      const startResponse = (await beginPasskeyLogin(email.trim())) as {
        session: string;
        options: { publicKey: PublicKeyCredentialRequestOptions };
      };

      const publicKey = publicKeyCredentialRequestOptionsFromJSON(startResponse.options.publicKey);
      const assertion = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential;
      const credentialPayload = credentialToJSON(assertion);

      const finishResponse = (await finishPasskeyLogin(startResponse.session, credentialPayload)) as {
        access_token?: string;
        user?: User;
      };

      applyLoginResult(finishResponse);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Não foi possível autenticar via biometria.';
      setError(message);
    } finally {
      setPasskeyLoading(false);
    }
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center"
      style={{
        backgroundColor: '#2A7B9B',
        backgroundImage:
          'linear-gradient(90deg, rgba(42, 123, 155, 1) 0%, rgba(87, 199, 133, 1) 50%, rgba(237, 221, 83, 1) 100%)'
      }}
    >
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900/60 p-8 shadow-lg">
        <h1 className="text-2xl font-semibold text-white">Backoffice Municipal</h1>
        <p className="mt-2 text-sm text-slate-400">
          Gerencie demandas das secretarias de Zabelê.
        </p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-300">
              E-mail institucional
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white shadow-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="senha" className="block text-sm font-medium text-slate-300">
              Senha
            </label>
            <input
              id="senha"
              type="password"
              autoComplete="current-password"
              className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white shadow-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
              value={senha}
              onChange={(event) => setSenha(event.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-accent px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-accent/60"
          >
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
          {supportsPasskey ? (
            <button
              type="button"
              onClick={handlePasskeyLogin}
              disabled={passkeyLoading || loading}
              className="w-full rounded border border-accent/40 px-4 py-2 text-sm font-medium text-accent transition hover:border-accent hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {passkeyLoading ? 'Verificando biometria…' : 'Entrar com biometria'}
            </button>
          ) : (
            <p className="text-xs text-slate-500">
              Seu dispositivo ou navegador não oferece suporte a login por biometria.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
