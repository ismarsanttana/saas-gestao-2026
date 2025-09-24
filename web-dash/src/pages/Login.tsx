import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../state/auth";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@urbanbyte.com.br");
  const [password, setPassword] = useState("Urbanbyte#2025");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      navigate("/", { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível entrar";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="header">
        <strong>Urbanbyte • SaaS Control Center</strong>
      </header>
      <main className="container" style={{ maxWidth: "420px" }}>
        <div className="card">
          <h2>Acessar painel</h2>
          <p style={{ marginTop: "0.25rem", color: "#64748b" }}>
            Gere novas prefeituras, acompanhe saúde da plataforma e configure experiências
            do cidadão.
          </p>

          <form className="form-grid" style={{ marginTop: "1.5rem" }} onSubmit={handleSubmit}>
            <label>
              E-mail corporativo
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                placeholder="admin@urbanbyte.com.br"
                required
              />
            </label>

            <label>
              Senha
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••"
                required
              />
            </label>

            {error && <span className="inline-error">{error}</span>}

            <button className="btn" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
