import { FormEvent, useState } from "react";

import { useAuth } from "../state/auth";
import { Tenant } from "../types";

type TenantFormProps = {
  onCreated: (tenant: Tenant) => void;
};

export default function TenantForm({ onCreated }: TenantFormProps) {
  const { authorizedFetch } = useAuth();
  const [slug, setSlug] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [domain, setDomain] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#2563EB");
  const [accentColor, setAccentColor] = useState("#9333EA");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const normalizedSlug = slug.trim().toLowerCase();
      const trimmedDomain = domain.trim().toLowerCase();
      if (!trimmedDomain.includes(".")) {
        throw new Error("Informe um domínio válido (ex.: cidade.urbanbyte.com.br)");
      }

      const payload = {
        slug: normalizedSlug,
        display_name: displayName.trim(),
        domain: trimmedDomain,
        settings: {
          theme: {
            primaryColor,
            accentColor
          }
        }
      };

      const response = await authorizedFetch<{ tenant: Tenant }>("/saas/tenants", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      onCreated(response.tenant);
      setSuccess(`Tenant ${response.tenant.display_name} criado com sucesso!`);
      setSlug("");
      setDisplayName("");
      setDomain("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao criar tenant";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="form-grid" onSubmit={handleSubmit}>
      <label>
        Nome da prefeitura
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Prefeitura de Cabaceiras"
          required
        />
      </label>

      <label>
        Slug (sem espaços)
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value.replace(/[^a-z0-9-]/gi, ""))}
          placeholder="cabaceiras"
          required
        />
      </label>

        <label>
          Domínio completo
          <input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="cabaceiras.urbanbyte.com.br"
            required
          />
        </label>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "1rem" }}>
        <label>
          Cor primária
          <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} />
        </label>
        <label>
          Cor de destaque
          <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} />
        </label>
      </div>

      {error && <span className="inline-error">{error}</span>}
      {success && <span className="inline-success">{success}</span>}

      <button className="btn" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Criando..." : "Criar cidade"}
      </button>
    </form>
  );
}
