import { apiFetch } from '../api/client';
import { clearSession } from '../auth/session';
import { useAuth } from '../stores/authStore';
import type { User } from '../types';

export async function fetchProfile(): Promise<User | null> {
  const res = await apiFetch('/me');
  const data = (res as { data?: { user?: User } })?.data ?? (res as { user?: User });
  const user = data?.user ?? null;
  if (user) {
    useAuth.getState().setAuth(user, useAuth.getState().token);
  }
  return user;
}

export async function logoutBackoffice() {
  await apiFetch('/auth/logout', { method: 'POST' });
  useAuth.getState().clear();
  clearSession();
}

export async function beginPasskeyRegistration() {
  return apiFetch('/auth/passkey/register/start', { method: 'POST' });
}

export async function finishPasskeyRegistration(sessionId: string, payload: Record<string, any>) {
  return apiFetch(`/auth/passkey/register/finish?session=${sessionId}`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function beginPasskeyLogin(email: string) {
  return apiFetch(
    '/auth/passkey/login/start',
    {
      method: 'POST',
      body: JSON.stringify({ email })
    },
    false
  );
}

export async function finishPasskeyLogin(sessionId: string, payload: Record<string, any>) {
  return apiFetch(
    `/auth/passkey/login/finish?session=${sessionId}`,
    {
      method: 'POST',
      body: JSON.stringify(payload)
    },
    false
  );
}
