import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";

type SaaSUser = {
  id: string;
  nome: string;
  email: string;
};

type ApiError = {
  code?: string;
  message?: string;
};

type ApiEnvelope<T> = {
  data: T | null;
  error: ApiError | null;
};

type AuthContextValue = {
  user: SaaSUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  authorizedFetch: <T = unknown>(
    path: string,
    options?: RequestInit & { parseJson?: boolean }
  ) => Promise<T>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const STORAGE_KEY = "urbanbyte_saas_session";
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8081";

type StoredSession = {
  token: string;
  user: SaaSUser;
};

async function parseResponse<T>(response: Response): Promise<ApiEnvelope<T>> {
  const text = await response.text();
  if (!text) {
    return { data: null, error: null };
  }
  const parsed = JSON.parse(text) as Partial<ApiEnvelope<T>>;
  return {
    data: (parsed.data ?? null) as T | null,
    error: parsed.error ?? null
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SaaSUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const storeSession = useCallback((token: string, profile: SaaSUser) => {
    setAccessToken(token);
    setUser(profile);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ token, user: profile } satisfies StoredSession)
    );
  }, []);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include"
      });
      if (!response.ok) {
        throw new Error("refresh failed");
      }
      const payload = await parseResponse<{ access_token: string; user: SaaSUser }>(response);
      if (!payload.data?.access_token || !payload.data.user) {
        const message = payload.error?.message ?? "token ausente";
        throw new Error(message);
      }
      storeSession(payload.data.access_token, payload.data.user);
      return true;
    } catch (err) {
      clearSession();
      return false;
    }
  }, [clearSession, storeSession]);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as StoredSession;
          setAccessToken(parsed.token);
          setUser(parsed.user);
        } else {
          await refreshSession();
        }
      } catch (err) {
        console.error("failed to bootstrap auth", err);
        clearSession();
      } finally {
        setIsLoading(false);
      }
    };

    bootstrap();
  }, [clearSession, refreshSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await fetch(`${API_URL}/auth/saas/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, senha: password }),
        credentials: "include"
      });

      if (!response.ok) {
        const payload = await parseResponse<unknown>(response);
        const message = payload.error?.message ?? "Credenciais inválidas";
        throw new Error(message);
      }

      const payload = await parseResponse<{ access_token: string; user: SaaSUser }>(response);
      if (!payload.data?.access_token || !payload.data.user) {
        const message = payload.error?.message ?? "Resposta inválida da API";
        throw new Error(message);
      }
      storeSession(payload.data.access_token, payload.data.user);
    },
    [storeSession]
  );

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        credentials: "include"
      });
    } catch (err) {
      console.warn("logout falhou", err);
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const authorizedFetch = useCallback<AuthContextValue["authorizedFetch"]>(
    async (path, options = {}) => {
      const { parseJson = true, headers, ...rest } = options;

      const requestWithToken = async () => {
        const mergedHeaders = new Headers(headers);
        mergedHeaders.set("Accept", "application/json");
        if (
          rest.body !== undefined &&
          !(rest.body instanceof FormData) &&
          !mergedHeaders.has("Content-Type")
        ) {
          mergedHeaders.set("Content-Type", "application/json");
        }
        const token = accessToken;
        if (token) {
          mergedHeaders.set("Authorization", `Bearer ${token}`);
        }

        const response = await fetch(`${API_URL}${path}`, {
          ...rest,
          headers: mergedHeaders,
          credentials: "include"
        });

        if (response.status === 401) {
          return { response, needsRetry: true } as const;
        }

        return { response, needsRetry: false } as const;
      };

      let { response, needsRetry } = await requestWithToken();

      if (needsRetry) {
        const refreshed = await refreshSession();
        if (!refreshed) {
          throw new Error("Sessão expirada. Faça login novamente.");
        }
        ({ response } = await requestWithToken());
      }

      if (!response.ok) {
        const payload = parseJson ? await parseResponse<unknown>(response) : null;
        const message = payload?.error?.message ?? "Falha ao comunicar com a API";
        throw new Error(message);
      }

      if (!parseJson) {
        return {} as any;
      }

      const payload = await parseResponse<T>(response);
      if (payload.error) {
        throw new Error(payload.error.message ?? "Falha ao comunicar com a API");
      }
      return (payload.data ?? ({} as T)) as T;
    },
    [accessToken, refreshSession]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      accessToken,
      isAuthenticated: Boolean(user && accessToken),
      isLoading,
      login,
      logout,
      authorizedFetch
    }),
    [user, accessToken, isLoading, login, logout, authorizedFetch]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider");
  }
  return ctx;
}
