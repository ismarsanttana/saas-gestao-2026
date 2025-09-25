import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import UrbanbyteLogo from "../components/UrbanbyteLogo";
import { useAuth } from "../state/auth";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    <div className="login-page">
      <section className="login-hero">
        <div className="login-hero__content">
          <UrbanbyteLogo />
          <div className="login-hero__copy">
            <div className="login-hero__heading">
              <h1>Urbanbyte Startup Control Center</h1>
              <span className="login-hero__subtitle">Tecnologia para governos digitais.</span>
            </div>
            <p>Monitore saúde operacional, provisionamento de domínios e onboarding de novas prefeituras em um cockpit projetado para equipes de tecnologia cívica.</p>
          </div>
        </div>
        <div className="login-hero__glow" />
      </section>

      <section className="login-panel">
        <div className="login-card">
          <header>
            <h2>Entrar na plataforma</h2>
            <span className="muted">Autentique-se com o seu e-mail corporativo Urbanbyte.</span>
          </header>

          <form className="login-form" onSubmit={handleSubmit}>
            <label>
              E-mail corporativo
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
                placeholder="voce@urbanbyte.com.br"
                required
              />
            </label>

            <label>
              Senha
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
                required
              />
            </label>

            {error && <span className="inline-error">{error}</span>}

            <button className="btn" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Verificando..." : "Acessar painel"}
            </button>

            <button className="btn btn-biometrics" type="button">
              Entrar com biometria
            </button>
          </form>
        </div>

        <footer className="login-footer">
          <span>© {new Date().getFullYear()} Urbanbyte. Todos os direitos reservados.</span>
          <span className="login-footer__tag">Tecnologia para governos digitais.</span>
        </footer>
      </section>
    </div>
  );
}
