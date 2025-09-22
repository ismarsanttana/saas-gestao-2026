import { useSyncExternalStore } from 'react';

export type Secretaria = {
  id: string;
  nome: string;
  slug: string;
  papel: string;
};

export type BackofficeProfile = {
  id: string;
  nome: string;
  email: string;
  secretarias: Secretaria[];
};

export type SessionState = {
  user: BackofficeProfile | null;
  accessToken: string | null;
  activeSecretaria: Secretaria | null;
  initialized: boolean;
};

type Listener = () => void;

const STORAGE_KEY = 'gz_backoffice_secretaria_slug';
const listeners = new Set<Listener>();
let state: SessionState = {
  user: null,
  accessToken: null,
  activeSecretaria: null,
  initialized: false
};

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';

function emit() {
  listeners.forEach((listener) => listener());
}

function update(partial: Partial<SessionState>) {
  state = { ...state, ...partial };
  emit();
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot() {
  return state;
}

export function useSession() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function getAccessToken() {
  return state.accessToken;
}

function selectActiveSecretaria(user: BackofficeProfile | null, preferred?: string | null) {
  if (!user) return null;
  if (!user.secretarias.length) {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }

  const stored = preferred ?? sessionStorage.getItem(STORAGE_KEY);
  let active = stored ? user.secretarias.find((item) => item.slug === stored) ?? null : null;

  if (!active && user.secretarias.length === 1) {
    active = user.secretarias[0];
  }

  if (active) {
    sessionStorage.setItem(STORAGE_KEY, active.slug);
  } else {
    sessionStorage.removeItem(STORAGE_KEY);
  }

  return active;
}

export function setSession(user: BackofficeProfile, token?: string) {
  const accessToken = token ?? state.accessToken;
  const active = selectActiveSecretaria(user, state.activeSecretaria?.slug ?? null);
  update({ user, accessToken: accessToken ?? null, activeSecretaria: active });
}

export function clearSession() {
  sessionStorage.removeItem(STORAGE_KEY);
  update({ user: null, accessToken: null, activeSecretaria: null });
}

export function markInitialized() {
  if (!state.initialized) {
    update({ initialized: true });
  }
}

export function setActiveSecretariaBySlug(slug: string) {
  if (!state.user) return false;
  const secretaria = state.user.secretarias.find((item) => item.slug === slug);
  if (!secretaria) {
    return false;
  }
  sessionStorage.setItem(STORAGE_KEY, secretaria.slug);
  update({ activeSecretaria: secretaria });
  return true;
}

export async function refreshAccessToken(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include'
    });

    if (!response.ok) {
      clearSession();
      return false;
    }

    const payload = await response.json();
    const data = payload?.data;
    if (!data?.access_token || !data?.user) {
      clearSession();
      return false;
    }

    const user: BackofficeProfile = {
      id: data.user.id,
      nome: data.user.nome,
      email: data.user.email,
      secretarias: data.user.secretarias ?? []
    };

    const active = selectActiveSecretaria(user, state.activeSecretaria?.slug ?? null);

    update({
      accessToken: data.access_token,
      user,
      activeSecretaria: active
    });

    return true;
  } catch (error) {
    clearSession();
    return false;
  }
}

export async function bootstrapSession() {
  if (state.initialized) {
    return;
  }
  await refreshAccessToken();
  markInitialized();
}
