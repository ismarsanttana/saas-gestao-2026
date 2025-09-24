import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { useAuth } from "../state/auth";
import { Tenant } from "../types";

const STATUS_OPTIONS = [
  { value: "draft", label: "Rascunho" },
  { value: "active", label: "Ativo" },
  { value: "suspended", label: "Suspenso" }
];

const ROLE_OPTIONS = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "support", label: "Suporte" },
  { value: "finance", label: "Financeiro" }
];

type TenantFormProps = {
  onCreated: (tenant: Tenant) => void;
};

type TeamMember = {
  name: string;
  email: string;
  role: string;
};

type PreviewTenant = {
  display_name?: string;
  logo_url?: string | null;
  theme?: Record<string, unknown>;
  status?: string;
};

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8081";

export default function TenantForm({ onCreated }: TenantFormProps) {
  const { authorizedFetch, user } = useAuth();
  const [step, setStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [publicPreview, setPublicPreview] = useState<PreviewTenant | null>(null);
  const [isFetchingPreview, setIsFetchingPreview] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const [form, setForm] = useState({
    displayName: "",
    slug: "",
    domain: "",
    status: STATUS_OPTIONS[0].value,
    contactEmail: "",
    contactPhone: "",
    supportUrl: "",
    notes: "",
    themePrimary: "#1d4ed8",
    themeAccent: "#22d3ee",
    logoFile: null as File | null,
    team: [] as TeamMember[]
  });

  useEffect(() => {
    if (!form.logoFile) {
      setLogoPreview(null);
      return;
    }
    const objectUrl = URL.createObjectURL(form.logoFile);
    setLogoPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [form.logoFile]);

  useEffect(() => {
    if (!form.domain || form.domain.length < 5) {
      setPublicPreview(null);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();

    async function fetchPreview() {
      try {
        setIsFetchingPreview(true);
        const response = await fetch(`${API_URL}/tenant?domain=${encodeURIComponent(form.domain)}`, {
          signal: controller.signal
        });
        if (!response.ok) {
          if (response.status === 404) {
            if (!cancelled) {
              setPublicPreview(null);
            }
            return;
          }
          throw new Error("falha ao buscar preview");
        }
        const data = await response.json();
        if (!cancelled) {
          setPublicPreview(data as PreviewTenant);
        }
      } catch (err) {
        if (!cancelled) {
          setPublicPreview(null);
        }
      } finally {
        if (!cancelled) {
          setIsFetchingPreview(false);
        }
      }
    }

    fetchPreview();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [form.domain]);

  useEffect(() => {
    setSuccess(null);
    setError(null);
  }, [step]);

  const canProceedStep1 = useMemo(() => {
    return (
      form.displayName.trim().length > 2 &&
      form.slug.trim().length > 2 &&
      form.domain.trim().length > 4
    );
  }, [form.displayName, form.slug, form.domain]);

  const canProceedStep2 = true;
  const canProceedStep3 = true;

  const updateField = (key: keyof typeof form, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSlugChange = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    const sanitized = raw
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/--+/g, "-");
    updateField("slug", sanitized);
  };

  const handleDomainChange = (event: ChangeEvent<HTMLInputElement>) => {
    updateField("domain", event.target.value.toLowerCase().trim());
  };

  const handleLogoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const [file] = event.target.files ?? [];
    if (!file) {
      updateField("logoFile", null);
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Envie um arquivo de imagem (PNG, JPG, SVG).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Logo deve ter até 5 MB.");
      return;
    }
    setError(null);
    updateField("logoFile", file);
  };

  const handleAddMember = () => {
    const last = form.team[form.team.length - 1];
    if (last && (!last.name || !last.email)) {
      setError("Complete os dados do membro anterior antes de adicionar outro.");
      return;
    }
    updateField("team", [...form.team, { name: "", email: "", role: "admin" }]);
  };

  const handleMemberChange = (index: number, key: keyof TeamMember, value: string) => {
    const updated = form.team.map((member, current) =>
      current === index ? { ...member, [key]: value } : member
    );
    updateField("team", updated);
  };

  const handleRemoveMember = (index: number) => {
    updateField(
      "team",
      form.team.filter((_, current) => current !== index)
    );
  };

  const resetForm = () => {
    setForm({
      displayName: "",
      slug: "",
      domain: "",
      status: STATUS_OPTIONS[0].value,
      contactEmail: "",
      contactPhone: "",
      supportUrl: "",
      notes: "",
      themePrimary: "#1d4ed8",
      themeAccent: "#22d3ee",
      logoFile: null,
      team: []
    });
    setLogoPreview(null);
    setPublicPreview(null);
    setStep(0);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if ((step === 0 && !canProceedStep1) || (step === 1 && !canProceedStep2)) {
      return;
    }

    if (step < 2) {
      setStep((prev) => prev + 1);
      return;
    }

    const initialTeam = form.team
      .filter((member) => member.email.trim())
      .map((member) => ({
        name: member.name.trim(),
        email: member.email.trim(),
        role: member.role || "admin"
      }));

    const payload = {
      slug: form.slug,
      display_name: form.displayName,
      domain: form.domain,
      status: form.status,
      notes: form.notes?.trim() || undefined,
      contact: {
        email: form.contactEmail.trim() || undefined,
        phone: form.contactPhone.trim() || undefined,
        support_url: form.supportUrl.trim() || undefined
      },
      theme: {
        primary_color: form.themePrimary,
        accent_color: form.themeAccent
      },
      settings: {
        branding: {
          primary_color: form.themePrimary,
          accent_color: form.themeAccent
        }
      },
      initial_team: initialTeam
    };

    try {
      setIsSubmitting(true);
      const formData = new FormData();
      formData.append("payload", JSON.stringify(payload));
      if (form.logoFile) {
        formData.append("logo", form.logoFile);
      }

      const response = await authorizedFetch<{ tenant: Tenant }>("/saas/tenants", {
        method: "POST",
        body: formData
      });

      onCreated(response.tenant);
      setSuccess(`Tenant ${response.tenant.display_name} criado com sucesso!`);
      resetForm();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao criar tenant";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="wizard" onSubmit={handleSubmit}>
      <header className="wizard-header">
        <div className="wizard-steps">
          {STEP_LABELS.map((label, index) => (
            <div key={label} className={`wizard-step ${index === step ? "active" : index < step ? "done" : ""}`}>
              <span className="wizard-index">{index + 1}</span>
              <span>{label}</span>
            </div>
          ))}
        </div>
        {user && <div className="wizard-owner">Criado por {formatUserName(user)}</div>}
      </header>

      {step === 0 && (
        <section className="wizard-panel">
          <div className="grid grid-two">
            <label>
              Nome da prefeitura
              <input
                value={form.displayName}
                onChange={(event) => {
                  updateField("displayName", event.target.value);
                  if (!form.slug) {
                    updateField(
                      "slug",
                      event.target.value
                        .toLowerCase()
                        .trim()
                        .replace(/[^a-z0-9-]/g, "-")
                        .replace(/--+/g, "-")
                    );
                  }
                }}
                placeholder="Prefeitura de Cabaceiras"
                required
              />
            </label>
            <label>
              Slug
              <input
                value={form.slug}
                onChange={handleSlugChange}
                placeholder="cabaceiras"
                required
              />
            </label>
          </div>

          <label>
            Domínio completo
            <input
              value={form.domain}
              onChange={handleDomainChange}
              placeholder="cabaceiras.urbanbyte.com.br"
              required
            />
          </label>

          <div className="grid grid-two">
            <label>
              Status
              <select
                value={form.status}
                onChange={(event) => updateField("status", event.target.value)}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              E-mail de contato
              <input
                value={form.contactEmail}
                onChange={(event) => updateField("contactEmail", event.target.value)}
                placeholder="contato@prefeitura.gov.br"
                type="email"
              />
            </label>
          </div>

          <div className="grid grid-two">
            <label>
              Telefone
              <input
                value={form.contactPhone}
                onChange={(event) => updateField("contactPhone", event.target.value)}
                placeholder="(83) 99999-9999"
              />
            </label>
            <label>
              URL de suporte
              <input
                value={form.supportUrl}
                onChange={(event) => updateField("supportUrl", event.target.value)}
                placeholder="https://prefeitura.gov.br/suporte"
              />
            </label>
          </div>

          <label>
            Observações internas
            <textarea
              value={form.notes}
              onChange={(event) => updateField("notes", event.target.value)}
              rows={3}
            />
          </label>
        </section>
      )}

      {step === 1 && (
        <section className="wizard-panel">
          <div className="grid grid-two">
            <label>
              Cor primária
              <input
                type="color"
                value={form.themePrimary}
                onChange={(event) => updateField("themePrimary", event.target.value)}
              />
            </label>
            <label>
              Cor de destaque
              <input
                type="color"
                value={form.themeAccent}
                onChange={(event) => updateField("themeAccent", event.target.value)}
              />
            </label>
          </div>

          <label>
            Logo da prefeitura
            <input type="file" accept="image/*" onChange={handleLogoChange} />
          </label>

          <div className="preview-wrapper">
            <ThemePreview
              displayName={form.displayName || form.slug || "Cidade"}
              primary={form.themePrimary}
              accent={form.themeAccent}
              logoUrl={logoPreview}
            />
            <div className="preview-side">
              <h4>Preview público</h4>
              {isFetchingPreview && <span className="muted">Consultando…</span>}
              {!isFetchingPreview && publicPreview && (
                <ThemePreview
                  displayName={publicPreview.display_name || "Cidade"}
                  primary={pickColor(publicPreview.theme, "primary_color", form.themePrimary)}
                  accent={pickColor(publicPreview.theme, "accent_color", form.themeAccent)}
                  logoUrl={publicPreview.logo_url || undefined}
                />
              )}
              {!isFetchingPreview && !publicPreview && (
                <span className="muted">
                  Nenhuma personalização publicada para este domínio ainda.
                </span>
              )}
            </div>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="wizard-panel">
          <p className="muted">
            Convites são enviados por e-mail e expiram em 7 dias. Recomende senhas fortes ou
            ative 2FA depois do primeiro acesso.
          </p>
          <div className="team-list">
            {form.team.map((member, index) => (
              <div key={index} className="team-row">
                <input
                  value={member.name}
                  onChange={(event) => handleMemberChange(index, "name", event.target.value)}
                  placeholder="Nome"
                />
                <input
                  value={member.email}
                  onChange={(event) => handleMemberChange(index, "email", event.target.value)}
                  placeholder="email@prefeitura.gov.br"
                  type="email"
                />
                <select
                  value={member.role}
                  onChange={(event) => handleMemberChange(index, "role", event.target.value)}
                >
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => handleRemoveMember(index)}
                >
                  Remover
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-secondary" onClick={handleAddMember}>
            Adicionar membro
          </button>
        </section>
      )}

      {error && <span className="inline-error">{error}</span>}
      {success && <span className="inline-success">{success}</span>}

      <footer className="wizard-footer">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setStep((prev) => Math.max(0, prev - 1))}
          disabled={step === 0 || isSubmitting}
        >
          Voltar
        </button>
        <div className="wizard-actions">
          <button
            type="submit"
            className="btn"
            disabled={
              isSubmitting ||
              (step === 0 && !canProceedStep1) ||
              (step === 1 && !canProceedStep2) ||
              (step === 2 && !canProceedStep3)
            }
          >
            {isSubmitting ? "Criando..." : step === 2 ? "Concluir" : "Avançar"}
          </button>
        </div>
      </footer>
    </form>
  );
}

const STEP_LABELS = ["Dados básicos", "Branding", "Equipe inicial"];

function ThemePreview({
  displayName,
  primary,
  accent,
  logoUrl
}: {
  displayName: string;
  primary: string;
  accent: string;
  logoUrl?: string | null;
}) {
  return (
    <div className="theme-preview" style={{ borderColor: primary }}>
      <div className="theme-header" style={{ background: primary }}>
        {logoUrl ? <img src={logoUrl} alt="Logo preview" /> : <span>{displayName.charAt(0)}</span>}
        <div>
          <strong>{displayName}</strong>
          <small style={{ color: accent }}>Portal do cidadão</small>
        </div>
      </div>
      <div className="theme-body">
        <button style={{ background: accent }}>Simular botão</button>
        <div className="theme-palette">
          <span style={{ background: primary }} />
          <span style={{ background: accent }} />
        </div>
      </div>
    </div>
  );
}

function pickColor(theme: Record<string, unknown> | undefined, key: string, fallback: string) {
  if (!theme) return fallback;
  const value = theme[key];
  return typeof value === "string" ? value : fallback;
}

function formatUserName(user: { name: string; role: string } | null) {
  if (!user) return "";
  const [first] = user.name.split(" ");
  return `${first} (${user.role.toUpperCase()})`;
}
