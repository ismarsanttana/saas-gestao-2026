import { FormEvent, useEffect, useMemo, useState } from "react";

import { useAuth } from "../state/auth";
import { CloudflareSettingsResponse } from "../types";

type FormState = {
  zoneId: string;
  baseDomain: string;
  targetHostname: string;
  accountId: string;
  proxiedDefault: boolean;
  apiToken: string;
  tokenDirty: boolean;
};

const initialForm: FormState = {
  zoneId: "",
  baseDomain: "",
  targetHostname: "",
  accountId: "",
  proxiedDefault: false,
  apiToken: "",
  tokenDirty: false
};

export default function CloudflareSettings() {
  const { authorizedFetch } = useAuth();
  const [form, setForm] = useState<FormState>(initialForm);
  const [hasToken, setHasToken] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | undefined>(undefined);

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        const response = await authorizedFetch<CloudflareSettingsResponse>(
          "/saas/settings/cloudflare"
        );
        const config = response?.config ?? ({
          proxied_default: false,
          has_token: false
        } as CloudflareSettingsResponse["config"]);

        setForm((prev) => ({
          ...prev,
          zoneId: config.zone_id ?? "",
          baseDomain: config.base_domain ?? "",
          targetHostname: config.target_hostname ?? "",
          accountId: config.account_id ?? "",
          proxiedDefault: config.proxied_default ?? false,
          apiToken: "",
          tokenDirty: false
        }));
        setHasToken(Boolean(config.has_token));
        setConfigured(Boolean(response?.configured));
        setUpdatedAt(config.updated_at ?? undefined);
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Falha ao carregar integração";
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [authorizedFetch]);

  const saveDisabled = useMemo(() => {
    if (isSaving || isLoading) return true;
    if (!form.zoneId.trim() || !form.baseDomain.trim() || !form.targetHostname.trim()) {
      return true;
    }
    return false;
  }, [form.baseDomain, form.targetHostname, form.zoneId, isLoading, isSaving]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saveDisabled) return;

    const payload: Record<string, unknown> = {
      zone_id: form.zoneId.trim(),
      base_domain: form.baseDomain.trim(),
      target_hostname: form.targetHostname.trim(),
      account_id: form.accountId.trim() || undefined,
      proxied_default: form.proxiedDefault
    };

    if (form.tokenDirty) {
      payload.api_token = form.apiToken;
    }

    try {
      setIsSaving(true);
      setError(null);
      setSuccess(null);
      const response = await authorizedFetch<CloudflareSettingsResponse>(
        "/saas/settings/cloudflare",
        {
          method: "PUT",
          body: JSON.stringify(payload)
        }
      );

      const config = response?.config;
      setHasToken(Boolean(config?.has_token));
      setConfigured(Boolean(response?.configured));
      setUpdatedAt(config?.updated_at ?? undefined);
      setForm((prev) => ({
        ...prev,
        zoneId: config?.zone_id ?? prev.zoneId,
        baseDomain: config?.base_domain ?? prev.baseDomain,
        targetHostname: config?.target_hostname ?? prev.targetHostname,
        accountId: config?.account_id ?? prev.accountId,
        proxiedDefault: config?.proxied_default ?? prev.proxiedDefault,
        apiToken: "",
        tokenDirty: false
      }));
      setSuccess("Configuração atualizada com sucesso.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível salvar";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (patch: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const handleTokenReset = () => {
    setError(null);
    setSuccess(null);
    handleChange({ apiToken: "", tokenDirty: true });
    setHasToken(false);
  };

  return (
    <form className="cloudflare-settings" onSubmit={handleSubmit}>
      <h2>Integração Cloudflare</h2>
      <p className="muted" style={{ marginBottom: "1rem" }}>
        Defina as credenciais usadas para provisionar CNAMEs automaticamente no onboarding. O
        token deve ter permissão de edição DNS na zona informada.
      </p>

      {isLoading ? (
        <p>Carregando...</p>
      ) : (
        <div className="grid grid-two">
          <label>
            Zone ID
            <input
              value={form.zoneId}
              onChange={(event) => handleChange({ zoneId: event.target.value })}
              placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              required
            />
          </label>
          <label>
            Domínio base
            <input
              value={form.baseDomain}
              onChange={(event) => handleChange({ baseDomain: event.target.value })}
              placeholder="prefeituras.urbanbyte.com.br"
              required
            />
          </label>
          <label>
            Host de destino (CNAME)
            <input
              value={form.targetHostname}
              onChange={(event) => handleChange({ targetHostname: event.target.value })}
              placeholder="app.urbanbyte.com.br"
              required
            />
          </label>
          <label>
            Account ID (opcional)
            <input
              value={form.accountId}
              onChange={(event) => handleChange({ accountId: event.target.value })}
              placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            />
          </label>
        </div>
      )}

      <div className="grid" style={{ marginTop: "1rem" }}>
        <label>
          Token API
          <input
            type="password"
            value={form.apiToken}
            onChange={(event) =>
              handleChange({ apiToken: event.target.value, tokenDirty: true })
            }
            placeholder={hasToken ? "Token configurado — digite para substituir" : "Token da Cloudflare"}
          />
          <small className="muted">
            O valor atual não é exibido por segurança. Informe um novo token para substituí-lo ou
            use o botão abaixo para limpar.
          </small>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <input
            type="checkbox"
            checked={form.proxiedDefault}
            onChange={(event) => handleChange({ proxiedDefault: event.target.checked })}
          />
          <span>Ativar proxy por padrão (Cloudflare orange cloud)</span>
        </label>
      </div>

      <div style={{ marginTop: "0.75rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <span className="muted">
          {configured ? "Provisionamento ativo" : "Provisionamento desativado"}
          {updatedAt && ` • Atualizado ${new Date(updatedAt).toLocaleString()}`}
        </span>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleTokenReset}
            disabled={isSaving}
          >
            Limpar token
          </button>
          <button type="submit" className="btn" disabled={saveDisabled}>
            {isSaving ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </div>

      {error && <div className="inline-error" style={{ marginTop: "0.5rem" }}>{error}</div>}
      {success && <div className="inline-success" style={{ marginTop: "0.5rem" }}>{success}</div>}
    </form>
  );
}
