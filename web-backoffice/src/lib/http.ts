import axios from "axios";
import axios from "axios";

const baseURL =
  (import.meta as any).env?.VITE_API_URL ||
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_URL) ||
  "/api";

export const api = axios.create({
  baseURL,
  withCredentials: true,
});

// Interceptor de refresh (se houver), sempre usando baseURL relativo
api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original.__isRetry) {
      original.__isRetry = true;
      try {
        await api.post("/auth/refresh"); // relativo ao baseURL
        return api(original);
      } catch (e) {
        // opcional: redirecionar pra /login
      }
    }
    return Promise.reject(err);
  }
);
