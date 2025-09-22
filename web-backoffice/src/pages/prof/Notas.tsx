import { useEffect, useMemo, useState } from 'react';
import { professorApi } from '../../lib/api';
import type { Avaliacao, Turma } from '../../types/edu';
import { TurmaSelect } from '../../components/prof/TurmaSelect';

export default function ProfessorNotas() {
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [turmaId, setTurmaId] = useState<string | null>(null);
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([]);
  const [avaliacaoSelecionada, setAvaliacaoSelecionada] = useState<string | null>(null);
  const [bimestre, setBimestre] = useState(1);
  const [notas, setNotas] = useState<Array<{ aluno_id: string; nome: string; matricula?: string | null; nota?: number | null; observacao?: string | null }>>([]);
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

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
    async function loadAvaliacoes() {
      if (!turmaId) return;
      const data = await professorApi.getAvaliacoes(turmaId);
      setAvaliacoes(data);
      if (!avaliacaoSelecionada && data.length) {
        setAvaliacaoSelecionada(data[0].id);
      }
    }
    loadAvaliacoes();
  }, [turmaId]);

  useEffect(() => {
    async function loadNotas() {
      if (!turmaId) return;
      setLoading(true);
      setErro(null);
      try {
        const data = await professorApi.getNotas(turmaId, bimestre);
        setNotas(data);
        setMensagem(null);
      } catch (err) {
        setErro(err instanceof Error ? err.message : 'Falha ao carregar notas.');
      } finally {
        setLoading(false);
      }
    }
    loadNotas();
  }, [turmaId, bimestre]);

  const tabelaNotas = useMemo(() => notas, [notas]);

  const atualizarNota = (alunoId: string, valor: string) => {
    const parsed = valor === '' ? null : Number(valor);
    setNotas((prev) =>
      prev.map((nota) =>
        nota.aluno_id === alunoId
          ? {
              ...nota,
              nota: parsed === null || Number.isNaN(parsed) ? null : parsed
            }
          : nota
      )
    );
  };

  const salvar = async () => {
    if (!avaliacaoSelecionada) {
      setErro('Selecione uma avaliação para lançar as notas.');
      return;
    }
    setSalvando(true);
    setErro(null);
    setMensagem(null);
    try {
      await professorApi.lancarNotas(
        avaliacaoSelecionada,
        {
          bimestre,
          notas: notas.map((item) => ({
            aluno_id: item.aluno_id,
            nota: item.nota ?? 0,
            observacao: item.observacao ?? undefined
          }))
        }
      );
      setMensagem('Notas atualizadas com sucesso.');
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível salvar as notas.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <header className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Lançar notas finais</h1>
            <p className="text-sm text-slate-400">Lance e revise notas por bimestre e avaliação.</p>
          </div>
          <div className="flex flex-wrap gap-4">
            <TurmaSelect turmas={turmas} value={turmaId} onChange={setTurmaId} />
            <label className="flex flex-col text-sm text-slate-300">
              <span className="mb-1 text-xs uppercase tracking-wide text-slate-400">Bimestre</span>
              <select
                value={bimestre}
                onChange={(event) => setBimestre(Number(event.target.value))}
                className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white shadow focus:border-emerald-500 focus:outline-none"
              >
                {[1, 2, 3, 4].map((valor) => (
                  <option key={valor} value={valor}>
                    {valor}º
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col text-sm text-slate-300">
              <span className="mb-1 text-xs uppercase tracking-wide text-slate-400">Avaliação</span>
              <select
                value={avaliacaoSelecionada ?? ''}
                onChange={(event) => setAvaliacaoSelecionada(event.target.value || null)}
                className="min-w-[220px] rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white shadow focus:border-emerald-500 focus:outline-none"
              >
                <option value="">Selecione</option>
                {avaliacoes.map((avaliacao) => (
                  <option key={avaliacao.id} value={avaliacao.id}>
                    {avaliacao.titulo}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>

        {erro && (
          <div className="mt-4 rounded border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
            {erro}
          </div>
        )}
        {mensagem && (
          <div className="mt-4 rounded border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
            {mensagem}
          </div>
        )}

        <div className="mt-6 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 shadow">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 text-sm text-slate-300">
            <div>
              <p className="font-medium text-white">Notas por aluno</p>
              <p className="text-xs text-slate-400">Informe as notas de 0 a 100. Deixe em branco para ausente.</p>
            </div>
            <button
              type="button"
              disabled={salvando || !avaliacaoSelecionada}
              onClick={salvar}
              className="rounded bg-emerald-500 px-4 py-2 text-xs font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/60"
            >
              {salvando ? 'Salvando…' : 'Salvar notas'}
            </button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full min-w-[640px] text-sm text-slate-200">
              <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3 text-left">Aluno</th>
                  <th className="px-4 py-3 text-left">Matrícula</th>
                  <th className="px-4 py-3 text-left">Nota</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td className="px-4 py-6 text-center text-slate-500" colSpan={3}>
                      Carregando notas…
                    </td>
                  </tr>
                )}
                {!loading && tabelaNotas.length === 0 && (
                  <tr>
                    <td className="px-4 py-6 text-center text-slate-500" colSpan={3}>
                      Nenhum registro encontrado.
                    </td>
                  </tr>
                )}
                {tabelaNotas.map((item) => (
                  <tr key={item.aluno_id} className="border-t border-slate-800/70">
                    <td className="px-4 py-3 font-medium text-white">{item.nome}</td>
                    <td className="px-4 py-3 text-slate-400">{item.matricula ?? '—'}</td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min={0}
                        max={10}
                        step="0.1"
                        value={item.nota ?? ''}
                        onChange={(event) => atualizarNota(item.aluno_id, event.target.value)}
                        className="w-24 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
