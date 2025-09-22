import { useSyncExternalStore } from 'react';

export type CitizenProfile = {
  id: string;
  nome: string;
  email: string | null;
};

export type SessionState = {
  user: CitizenProfile | null;
  accessToken: string | null;
  initialized: boolean;
};

type Listener = () => void;

const listeners = new Set<Listener>();
let state: SessionState = {
  user: null,
  accessToken: null,
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

export function setSession(user: CitizenProfile, token?: string) {
  const accessToken = token ?? state.accessToken;
  update({ user, accessToken: accessToken ?? null });
}

export function clearSession() {
  update({ user: null, accessToken: null });
}

export function markInitialized() {
  if (!state.initialized) {
    update({ initialized: true });
  }
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

    update({
      accessToken: data.access_token,
      user: {
        id: data.user.id,
        nome: data.user.nome,
        email: data.user.email ?? null
      }
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
