import { useEffect, useState } from 'react';
import { professorApi } from '../../lib/api';
import type { Materia, Turma } from '../../types/edu';
import { TurmaSelect } from '../../components/prof/TurmaSelect';

export default function ProfessorMateriais() {
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [turmaId, setTurmaId] = useState<string | null>(null);
  const [materiais, setMateriais] = useState<Materia[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [url, setUrl] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    async function loadTurmas() {
      const data = await professorApi.getTurmas();
      setTurmas(data);
      if (!turmaId && data.length) {
        setTurmaId(data[0].id);
      }
    }
    loadTurmas();
  }, [turmaId]);

  useEffect(() => {
    async function loadMateriais() {
      if (!turmaId) return;
      setLoading(true);
      setErro(null);
      try {
        const data = await professorApi.getMateriais(turmaId);
        setMateriais(data);
      } catch (err) {
        setErro(err instanceof Error ? err.message : 'Falha ao carregar materiais');
      } finally {
        setLoading(false);
      }
    }
    loadMateriais();
  }, [turmaId]);

  const criarMaterial = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!turmaId) return;
    setSalvando(true);
    setErro(null);
    try {
      await professorApi.criarMaterial(turmaId, {
        titulo,
        descricao: descricao || undefined,
        url: url || undefined
      });
      setTitulo('');
      setDescricao('');
      setUrl('');
      const data = await professorApi.getMateriais(turmaId);
      setMateriais(data);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível cadastrar o material');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <header className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Materiais</h1>
            <p className="text-sm text-slate-400">Publique materiais, links e arquivos úteis para os alunos.</p>
          </div>
          <TurmaSelect turmas={turmas} value={turmaId} onChange={setTurmaId} />
        </header>

        {erro && (
          <div className="mt-4 rounded border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
            {erro}
          </div>
        )}

        <section className="mt-6 rounded-xl border border-slate-800 bg-slate-900/70 p-6 shadow">
          <h2 className="text-lg font-semibold text-white">Novo material</h2>
          <form onSubmit={criarMaterial} className="mt-4 space-y-4">
            <label className="flex flex-col text-sm text-slate-300">
              <span className="mb-1 text-xs uppercase tracking-wide text-slate-400">Título</span>
              <input
                required
                value={titulo}
                onChange={(event) => setTitulo(event.target.value)}
                className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white shadow focus:border-emerald-500 focus:outline-none"
                placeholder="Ex.: Apostila capítulo 1"
              />
            </label>
            <label className="flex flex-col text-sm text-slate-300">
              <span className="mb-1 text-xs uppercase tracking-wide text-slate-400">Descrição</span>
              <textarea
                value={descricao}
                onChange={(event) => setDescricao(event.target.value)}
                className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white shadow focus:border-emerald-500 focus:outline-none"
                rows={3}
                placeholder="Contextualize o material (opcional)"
              />
            </label>
            <label className="flex flex-col text-sm text-slate-300">
              <span className="mb-1 text-xs uppercase tracking-wide text-slate-400">Link (URL)</span>
              <input
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white shadow focus:border-emerald-500 focus:outline-none"
                placeholder="https://"
              />
            </label>
            <button
              type="submit"
              disabled={salvando || !turmaId}
              className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/60"
            >
              {salvando ? 'Publicando…' : 'Publicar material'}
            </button>
          </form>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-lg font-semibold text-white">Materiais publicados</h2>
          {loading && <p className="text-sm text-slate-500">Carregando materiais…</p>}
          {!loading && materiais.length === 0 && (
            <p className="text-sm text-slate-500">Nenhum material publicado para esta turma.</p>
          )}
          <ul className="space-y-3">
            {materiais.map((material) => (
              <li key={material.id} className="rounded border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">{material.titulo}</p>
                    {material.descricao && (
                      <p className="mt-1 text-xs text-slate-400">{material.descricao}</p>
                    )}
                  </div>
                  <span className="text-xs text-slate-500">
                    {new Date(material.criadoEm).toLocaleString('pt-BR')}
                  </span>
                </div>
                {material.url && (
                  <a
                    href={material.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center text-xs font-semibold text-emerald-400 hover:text-emerald-300"
                  >
                    Acessar link
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
