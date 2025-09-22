import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Loader2, LogOut, User } from 'lucide-react';

import { useAuth } from '../../stores/authStore';
import { professorApi } from '../../lib/api';
import {
  fetchProfile,
  beginPasskeyRegistration,
  finishPasskeyRegistration
} from '../../services/auth';
import {
  credentialToJSON,
  publicKeyCredentialCreationOptionsFromJSON
} from '../../utils/webauthn';

interface ProfileMenuProps {
  onSignOut: () => void;
  theme: 'light' | 'dark';
}

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

export function ProfileMenu({ onSignOut, theme }: ProfileMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [error, setError] = useState<string | null>(null);
  const user = useAuth((state) => state.user);
  const token = useAuth((state) => state.token);
  const setAuth = useAuth((state) => state.setAuth);
  const [nome, setNome] = useState(user?.nome ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [passkeyState, setPasskeyState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [passkeyMessage, setPasskeyMessage] = useState<string | null>(null);

  const supportsPasskey = useMemo(
    () => typeof window !== 'undefined' && 'PublicKeyCredential' in window,
    []
  );

  useEffect(() => {
    setNome(user?.nome ?? '');
    setEmail(user?.email ?? '');
  }, [user?.nome, user?.email]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!isOpen) return;
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setIsOpen(false);
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (submitState !== 'success') return;
    const timeout = window.setTimeout(() => setSubmitState('idle'), 2500);
    return () => window.clearTimeout(timeout);
  }, [submitState]);

  const initials = buildInitials(nome || user?.nome || '');
  const isLight = theme === 'light';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!nome.trim() || !email.trim()) {
      setError('Preencha nome e e-mail.');
      return;
    }

    setError(null);
    setSubmitState('submitting');

    try {
      await professorApi.updateProfile({ nome: nome.trim(), email: email.trim() });
      const updated = await fetchProfile();
      if (updated) {
        setAuth(updated, token ?? null);
      }
      setSubmitState('success');
      window.dispatchEvent(new CustomEvent('professor:profile-updated'));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível salvar.';
      setError(message);
      setSubmitState('error');
    }
  }

  const handleRegisterPasskey = async () => {
    if (!supportsPasskey) {
      setPasskeyMessage('Seu dispositivo não suporta login por biometria.');
      return;
    }

    setPasskeyMessage(null);
    setPasskeyState('loading');

    try {
      const startResponse = (await beginPasskeyRegistration()) as {
        session: string;
        options: { publicKey: PublicKeyCredentialCreationOptions };
      };

      const publicKey = publicKeyCredentialCreationOptionsFromJSON(
        startResponse.options.publicKey
      );

      const credential = (await navigator.credentials.create({
        publicKey
      })) as PublicKeyCredential;

      const payload = credentialToJSON(credential);
      await finishPasskeyRegistration(startResponse.session, payload);

      setPasskeyState('success');
      setPasskeyMessage('Biometria cadastrada! Você já pode utilizar "Entrar com biometria" na tela de login.');
    } catch (err) {
      setPasskeyState('error');
      setPasskeyMessage(
        err instanceof Error ? err.message : 'Não foi possível registrar a biometria agora.'
      );
    }
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-left text-sm font-semibold shadow-sm transition ${
          isLight
            ? 'border-emerald-600/40 bg-white/70 text-emerald-700 hover:border-emerald-500/60 hover:bg-white'
            : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100 hover:border-emerald-400 hover:bg-emerald-500/20'
        }`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <div
          className={`flex h-8 w-8 items-center justify-center overflow-hidden rounded-full text-sm font-bold ${
            isLight ? 'bg-emerald-500 text-emerald-900' : 'bg-emerald-400/90 text-emerald-950'
          }`}
        >
          {initials || <User size={16} />}
        </div>
        <div className="hidden text-left md:block">
          <span
            className={`block text-xs uppercase tracking-wide ${
              isLight ? 'text-emerald-700/70' : 'text-emerald-200/80'
            }`}
          >
            Meu perfil
          </span>
          <span className={`block text-sm font-semibold ${isLight ? 'text-emerald-900' : 'text-white'}`}>
            {user?.nome ?? 'Professor'}
          </span>
        </div>
        <ChevronDown className={`transition ${isOpen ? 'rotate-180' : ''}`} size={16} />
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          className={`absolute right-0 z-50 mt-3 w-80 origin-top-right rounded-2xl border p-4 shadow-2xl backdrop-blur ${
            isLight
              ? 'border-emerald-500/40 bg-white/95 text-slate-900'
              : 'border-emerald-500/30 bg-slate-900/95 text-white'
          }`}
        >
          <div
            className={`flex items-center gap-3 border-b pb-3 ${
              isLight ? 'border-emerald-100' : 'border-slate-700'
            }`}
          >
            <div
              className={`flex h-14 w-14 items-center justify-center overflow-hidden rounded-full text-lg font-bold ${
                isLight ? 'bg-emerald-500 text-emerald-900' : 'bg-emerald-500 text-emerald-900'
              }`}
            >
              {initials || <User size={24} />}
            </div>
            <div>
              <p className={`text-sm font-semibold ${isLight ? 'text-emerald-900' : 'text-white'}`}>
                {user?.nome ?? 'Professor(a)'}
              </p>
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{user?.email ?? '---'}</p>
            </div>
          </div>

          <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
            <fieldset className="space-y-1">
              <label
                className={`text-xs font-semibold uppercase tracking-wide ${
                  isLight ? 'text-slate-500' : 'text-slate-400'
                }`}
              >
                Nome completo
              </label>
              <input
                type="text"
                value={nome}
                onChange={(event) => setNome(event.target.value)}
                className={`w-full rounded-lg border px-3 py-2 text-sm placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 ${
                  isLight
                    ? 'border-slate-200 bg-white text-slate-900'
                    : 'border-slate-700 bg-slate-900/60 text-white'
                }`}
                placeholder="Seu nome"
              />
            </fieldset>

            <fieldset className="space-y-1">
              <label
                className={`text-xs font-semibold uppercase tracking-wide ${
                  isLight ? 'text-slate-500' : 'text-slate-400'
                }`}
              >
                E-mail de contato
              </label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={`w-full rounded-lg border px-3 py-2 text-sm placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 ${
                  isLight
                    ? 'border-slate-200 bg-white text-slate-900'
                    : 'border-slate-700 bg-slate-900/60 text-white'
                }`}
                placeholder="nome@exemplo.com"
              />
            </fieldset>

            {error && <p className="text-xs font-semibold text-rose-300">{error}</p>}
            {submitState === 'success' && (
              <p
                className={`text-xs font-semibold ${
                  isLight ? 'text-emerald-600' : 'text-emerald-300'
                }`}
              >
                Dados atualizados com sucesso!
              </p>
            )}

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={onSignOut}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                  isLight
                    ? 'border-rose-500/50 text-rose-600 hover:border-rose-500 hover:bg-rose-500/10'
                    : 'border-rose-500/40 text-rose-200 hover:border-rose-400 hover:bg-rose-500/10'
                }`}
              >
                <LogOut size={14} />
                Sair
              </button>
              <button
                type="submit"
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold uppercase tracking-wide transition disabled:pointer-events-none disabled:opacity-70 ${
                  isLight
                    ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                    : 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400'
                }`}
                disabled={submitState === 'submitting'}
              >
                {submitState === 'submitting' && <Loader2 className="animate-spin" size={14} />}
                Salvar alterações
              </button>
            </div>
          </form>

          <div
            className={`mt-4 rounded-xl border p-4 ${
              isLight
                ? 'border-emerald-100 bg-emerald-50'
                : 'border-emerald-500/40 bg-emerald-500/10'
            }`}
          >
            <div className="flex flex-col gap-2">
              <div>
                <p className={`text-xs font-semibold uppercase tracking-wide ${isLight ? 'text-emerald-700' : 'text-emerald-200'}`}>
                  Login por biometria
                </p>
                <p className={`text-xs ${isLight ? 'text-emerald-700/80' : 'text-emerald-100/80'}`}>
                  Ative o acesso usando a digital ou reconhecimento facial do dispositivo.
                </p>
              </div>
              {passkeyMessage && (
                <p
                  className={`text-xs font-semibold ${
                    passkeyState === 'success'
                      ? isLight
                        ? 'text-emerald-600'
                        : 'text-emerald-200'
                      : 'text-rose-300'
                  }`}
                >
                  {passkeyMessage}
                </p>
              )}
              <button
                type="button"
                onClick={handleRegisterPasskey}
                disabled={passkeyState === 'loading' || !supportsPasskey}
                className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  isLight
                    ? 'border border-emerald-400 text-emerald-700 hover:bg-emerald-500/10'
                    : 'border border-emerald-400/60 text-emerald-200 hover:border-emerald-300 hover:bg-emerald-500/10'
                }`}
              >
                {passkeyState === 'loading' && <Loader2 className="h-4 w-4 animate-spin" />}
                {supportsPasskey
                  ? passkeyState === 'success'
                    ? 'Biometria ativada'
                    : 'Ativar biometria'
                  : 'Dispositivo não suportado'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function buildInitials(value: string) {
  const normalized = value.trim();
  if (!normalized) return '';
  const parts = normalized.split(/\s+/).slice(0, 2);
  return parts
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
    .slice(0, 2);
}
