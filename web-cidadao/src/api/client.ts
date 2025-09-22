import {
  CitizenProfile,
  clearSession,
  getAccessToken,
  markInitialized,
  refreshAccessToken,
  setSession
} from '../auth/session';

type ApiError = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

type ApiEnvelope<T> = {
  data: T;
  error: ApiError | null;
};

type LoginResponse = {
  access_token: string;
  user: CitizenProfile;
};

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';

interface ApiRequestOptions extends RequestInit {
  json?: unknown;
}

async function apiFetch<T>(path: string, options: ApiRequestOptions = {}, retry = true): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.json !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  const token = getAccessToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include',
    body: options.json !== undefined ? JSON.stringify(options.json) : options.body
  });

  if (response.status === 401 && retry) {
    const renewed = await refreshAccessToken();
    if (renewed) {
      return apiFetch<T>(path, options, false);
    }
  }

  const payload = (await response.json()) as ApiEnvelope<T>;

  if (!response.ok || payload.error) {
    if (response.status === 401) {
      clearSession();
    }
    const error = payload.error ?? { code: 'INTERNAL', message: 'Falha inesperada' };
    throw new Error(error.message);
  }

  return payload.data;
}

export async function loginCitizen(email: string, senha: string) {
  const data = await apiFetch<LoginResponse>('/auth/cidadao/login', {
    method: 'POST',
    json: { email, senha }
  });

  setSession(data.user, data.access_token);
  markInitialized();
  return data.user;
}

export async function logoutCitizen() {
  try {
    await apiFetch<{ status: string }>('/auth/logout', { method: 'POST' });
  } finally {
    clearSession();
  }
}

export async function fetchProfile() {
  const data = await apiFetch<{ user: CitizenProfile }>(
    '/me',
    {
      method: 'GET'
    }
  );
  setSession(data.user, getAccessToken() ?? '');
  return data.user;
}

export async function ensureSession() {
  const token = getAccessToken();
  if (!token) {
    const renewed = await refreshAccessToken();
    if (!renewed) {
      clearSession();
    }
  }
}
