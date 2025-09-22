import { create } from 'zustand';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  token: string | null;
  roles: string[];
  setAuth: (user: User, token: string | null) => void;
  clear: () => void;
  has: (papel: string, slug?: string) => boolean;
}

function extractRoles(token: string | null): string[] {
  if (!token) return [];
  try {
    const [, payload] = token.split('.');
    const data = JSON.parse(atob(payload));
    const roles = data?.roles;
    if (Array.isArray(roles)) {
      return roles.map((role) => String(role).toUpperCase());
    }
  } catch (error) {
    return [];
  }
  return [];
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  token: sessionStorage.getItem('access_token'),
  roles: extractRoles(sessionStorage.getItem('access_token')),
  setAuth: (user, token) => {
    const roles = extractRoles(token ?? get().token ?? null);
    set({ user, token, roles });
    if (token) sessionStorage.setItem('access_token', token);
  },
  clear: () => {
    sessionStorage.removeItem('access_token');
    set({ user: null, token: null, roles: [] });
  },
  has: (papel, slug) => {
    const papelUpper = papel.toUpperCase();
    const { roles } = get();
    if (roles.includes(papelUpper)) {
      return true;
    }
    const u = get().user;
    if (!u || !u.secretarias) return false;
    return u.secretarias.some((s) => s.papel === papelUpper && (slug ? s.slug === slug : true));
  }
}));
