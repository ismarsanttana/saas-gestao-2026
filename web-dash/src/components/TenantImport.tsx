import { FormEvent, useMemo, useState } from "react";
import { useAuth } from "../state/auth";
import { Tenant, TenantImportResponse, TenantImportResult } from "../types";

type TenantImportProps = {
  onImported: (created: Tenant[]) => void;
};

export default function TenantImport({ onImported }: TenantImportProps) {
  const { authorizedFetch } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<TenantImportResult[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Tenant[] | null>(null);

  const successCount = useMemo(() => {
    if (!preview) return 0;
    return preview.filter((row) => row.success).length;
  }, [preview]);

  const handleFileChange = async (event: FormEvent<HTMLInputElement>) => {
    const [selected] = event.currentTarget.files ?? [];
    if (!selected) {
      setFile(null);
      setPreview(null);
      return;
    }
    if (!selected.name.endsWith(".csv")) {
      setError("Envie um arquivo CSV.");
      return;
    }

    setFile(selected);
    await runPreview(selected);
  };

  const runPreview = async (csv: File) => {
    setError(null);
    setPreview(null);
    setCreated(null);

    const formData = new FormData();
    formData.append("file", csv);

    try {
      setIsLoading(true);
      const response = await authorizedFetch<TenantImportResponse>("/saas/tenants/import?dry_run=1", {
        method: "POST",
        body: formData,
        parseJson: true
      });
      setPreview(response.results);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao processar CSV";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    setError(null);

    try {
      setIsLoading(true);
      const response = await authorizedFetch<TenantImportResponse>("/saas/tenants/import", {
        method: "POST",
        body: formData,
        parseJson: true
      });
      setPreview(response.results);
      const createdTenants = (response.results ?? [])
        .filter((row) => row.success && row.tenant)
        .map((row) => row.tenant!)
        .filter(Boolean);
      setCreated(createdTenants);
      if (createdTenants.length) {
        onImported(createdTenants);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao importar";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="card-secondary">
      <h4>Importação em massa</h4>
      <p className="muted">Envie um CSV com colunas slug, display_name, domain, status, contact_email...</p>
      <input type="file" accept=".csv" onChange={handleFileChange} disabled={isLoading} />

      {error && <div className="inline-error">{error}</div>}

      {preview && (
        <div className="import-preview">
          <h5>Pré-visualização ({successCount} válidos)</h5>
          <table className="table">
            <thead>
              <tr>
                <th>Linha</th>
                <th>Slug</th>
                <th>Status</th>
                <th>Mensagem</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((row) => (
                <tr key={`${row.line}-${row.slug}`}>
                  <td>{row.line}</td>
                  <td>{row.slug}</td>
                  <td>{row.success ? "OK" : "Erro"}</td>
                  <td className={row.error ? "inline-error" : "muted"}>{row.error ?? "Pronto"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="wizard-footer" style={{ marginTop: "1rem" }}>
        <span>{isLoading ? "Processando..." : created ? `Criados ${created.length}` : null}</span>
        <div className="wizard-actions">
          <button
            type="button"
            className="btn"
            disabled={!file || isLoading}
            onClick={handleConfirm}
          >
            Confirmar importação
          </button>
        </div>
      </div>
    </div>
  );
}
