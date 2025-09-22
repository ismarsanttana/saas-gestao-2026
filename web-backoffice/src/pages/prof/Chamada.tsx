import { useEffect, useMemo, useState } from 'react';
import { professorApi } from '../../lib/api';
import { useProfStore } from '../../stores/profStore';
import type { ChamadaAluno, ChamadaResponse, Turma } from '../../types/edu';
import { TurmaSelect } from '../../components/prof/TurmaSelect';

const TURNOS: Array<{ value: 'MANHA' | 'TARDE' | 'NOITE'; label: string }> = [
  { value: 'MANHA', label: 'Manhã' },
  { value: 'TARDE', label: 'Tarde' },
  { value: 'NOITE', label: 'Noite' }
];

export default function ProfessorChamada() {
  const { selectedTurma, setTurma, data, setData, turno, setTurno } = useProfStore();
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [chamada, setChamada] = useState<ChamadaResponse | null>(null);
  const [itens, setItens] = useState<Record<string, string | undefined>>({});
  const [observacoes, setObservacoes] = useState<Record<string, string | undefined>>({});

  useEffect(() => {
    async function loadTurmas() {
      const res = await professorApi.getTurmas();
      setTurmas(res);
      if (!selectedTurma && res.length) {
        setTurma(res[0].id);
      }
    }
    loadTurmas();
  }, [selectedTurma, setTurma]);

  useEffect(() => {
    async function loadChamada() {
      if (!selectedTurma) return;
      setLoading(true);
      setErro(null);
      try {
        const response = await professorApi.getChamada(selectedTurma, data, turno);
        setChamada(response);
        const estados: Record<string, string | undefined> = {};
        const notas: Record<string, string | undefined> = {};
        response.atual.itens.forEach((item) => {
          estados[item.alunoId] = item.status ?? undefined;
          notas[item.alunoId] = item.justificativa ?? undefined;
        });
        setItens(estados);
        setObservacoes(notas);
        setMensagem(null);
      } catch (err) {
        setErro(err instanceof Error ? err.message : 'Falha ao carregar chamada');
        setChamada(null);
        setItens({});
        setObservacoes({});
        setMensagem(null);
      } finally {
        setLoading(false);
      }
    }
    loadChamada();
  }, [selectedTurma, data, turno]);

  const alunos = useMemo<ChamadaAluno[]>(() => chamada?.atual.itens ?? [], [chamada]);

  const repetirUltima = () => {
    if (!chamada?.ultima_chamada) return;
    const estados: Record<string, string | undefined> = {};
    const notas: Record<string, string | undefined> = {};
    chamada.ultima_chamada.itens.forEach((item) => {
      estados[item.alunoId] = item.status ?? undefined;
      notas[item.alunoId] = item.justificativa ?? undefined;
    });
    setItens(estados);
    setObservacoes(notas);
  };

  const alterarStatus = (alunoId: string, status: string) => {
    setItens((prev) => ({ ...prev, [alunoId]: status }));
    if (status === 'PRESENTE') {
      setObservacoes((prev) => {
        if (!prev[alunoId]) return prev;
        const copia = { ...prev };
        delete copia[alunoId];
        return copia;
      });
    }
  };

  const alterarObservacao = (alunoId: string, texto: string) => {
    setObservacoes((prev) => ({ ...prev, [alunoId]: texto }));
  };

  const salvar = async () => {
    if (!selectedTurma) {
      setErro('Selecione uma turma para lançar a chamada');
      return;
    }
    setSalvando(true);
    setErro(null);
    setMensagem(null);
    try {
      await professorApi.salvarChamada(selectedTurma, {
        data,
        turno,
        itens: alunos.map((aluno) => {
          const statusAtual = itens[aluno.alunoId] ?? undefined;
          const justificativa = observacoes[aluno.alunoId]?.trim();
          return {
            aluno_id: aluno.alunoId,
            status: statusAtual,
            justificativa:
              statusAtual && statusAtual !== 'PRESENTE' ? justificativa || null : null
          };
        })
      });
      setMensagem('Chamada salva com sucesso.');
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível salvar a chamada');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <header className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Chamada</h1>
            <p className="text-sm text-slate-400">Selecione a turma, data e turno para registrar presença.</p>
          </div>
          <div className="flex flex-wrap gap-4">
            <TurmaSelect turmas={turmas} value={selectedTurma} onChange={setTurma} />
            <label className="flex flex-col text-sm text-slate-300">
              <span className="mb-1 text-xs uppercase tracking-wide text-slate-400">Data</span>
              <input
                type="date"
                value={data}
                onChange={(event) => setData(event.target.value)}
                className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white shadow focus:border-emerald-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col text-sm text-slate-300">
              <span className="mb-1 text-xs uppercase tracking-wide text-slate-400">Turno</span>
              <select
                value={turno}
                onChange={(event) => setTurno(event.target.value as any)}
                className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white shadow focus:border-emerald-500 focus:outline-none"
              >
                {TURNOS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
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
              <p className="font-medium text-white">
                {chamada?.atual.disciplina ? chamada.atual.disciplina : 'Disciplina não informada'}
              </p>
              <p className="text-xs text-slate-400">
                {new Date(`${chamada?.atual.data ?? data}T00:00:00`).toLocaleDateString('pt-BR')} •{' '}
                {turno}
              </p>
            </div>
            <div className="flex gap-3 text-xs">
              <button
                type="button"
                onClick={repetirUltima}
                disabled={!chamada?.ultima_chamada || salvando}
                className="rounded border border-slate-700 px-3 py-2 font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-200 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600"
              >
                Repetir última chamada
              </button>
              <button
                type="button"
                onClick={salvar}
                disabled={salvando || loading || !selectedTurma}
                className="rounded bg-emerald-500 px-4 py-2 font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/60"
              >
                {salvando ? 'Salvando…' : 'Salvar chamada'}
              </button>
            </div>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm text-slate-200">
              <thead className="sticky top-0 bg-slate-900/90 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3 text-left">Aluno</th>
                  <th className="px-4 py-3 text-left">Matrícula</th>
                  <th className="px-4 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td className="px-4 py-6 text-center text-slate-500" colSpan={3}>
                      Carregando chamada…
                    </td>
                  </tr>
                )}
                {!loading && alunos.length === 0 && (
                  <tr>
                    <td className="px-4 py-6 text-center text-slate-500" colSpan={3}>
                      Nenhum aluno encontrado para a turma selecionada.
                    </td>
                  </tr>
                )}
                {alunos.map((aluno) => {
                  const status = itens[aluno.alunoId] ?? '';
                  return (
                    <tr key={aluno.alunoId} className="border-t border-slate-800/70">
                      <td className="px-4 py-3 font-medium text-white">{aluno.nome}</td>
                      <td className="px-4 py-3 text-slate-400">{aluno.matricula ?? '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-3">
                          <div className="flex flex-wrap gap-2">
                            {['PRESENTE', 'FALTA', 'JUSTIFICADA'].map((valor) => (
                              <button
                                key={valor}
                                type="button"
                                onClick={() => alterarStatus(aluno.alunoId, valor)}
                              className={`rounded px-3 py-1 text-xs font-semibold transition ${
                                status === valor
                                  ? 'bg-emerald-500 text-emerald-950'
                                  : 'border border-slate-700 text-slate-200 hover:border-emerald-500/60'
                              }`}
                            >
                                {valor.charAt(0) + valor.slice(1).toLowerCase()}
                              </button>
                            ))}
                          </div>
                          {status && status !== 'PRESENTE' && (
                            <div className="flex flex-col gap-1">
                              <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                                Descrição da falta (opcional)
                              </label>
                              <textarea
                                value={observacoes[aluno.alunoId] ?? ''}
                                onChange={(event) => alterarObservacao(aluno.alunoId, event.target.value)}
                                rows={2}
                                placeholder="Ex.: aluno apresentou atestado médico"
                                className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                              />
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
