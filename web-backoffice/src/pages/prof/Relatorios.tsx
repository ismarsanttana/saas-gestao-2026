import { useEffect, useState } from 'react';
import { professorApi } from '../../lib/api';
import type { FrequenciaAluno, RelatorioAvaliacao, Turma } from '../../types/edu';
import { TurmaSelect } from '../../components/prof/TurmaSelect';

function defaultRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 7);
  const fmt = (date: Date) => date.toISOString().slice(0, 10);
  return { from: fmt(start), to: fmt(end) };
}

export default function ProfessorRelatorios() {
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [turmaId, setTurmaId] = useState<string | null>(null);
  const [{ from, to }, setRange] = useState(defaultRange);
  const [bimestre, setBimestre] = useState(1);
  const [frequencia, setFrequencia] = useState<FrequenciaAluno[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<RelatorioAvaliacao[]>([]);
  const [loadingFreq, setLoadingFreq] = useState(false);
  const [loadingAval, setLoadingAval] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

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
    async function load() {
      if (!turmaId) return;
      setErro(null);
      setLoadingFreq(true);
      try {
        const data = await professorApi.getRelatorioFrequencia(turmaId, from, to);
        setFrequencia(data);
      } catch (err) {
        setErro(err instanceof Error ? err.message : 'Falha ao carregar relatório de frequência');
      } finally {
        setLoadingFreq(false);
      }
    }
    load();
  }, [turmaId, from, to]);

  useEffect(() => {
    async function load() {
      if (!turmaId) return;
      setLoadingAval(true);
      try {
        const data = await professorApi.getRelatorioAvaliacoes(turmaId, bimestre);
        setAvaliacoes(data);
      } catch (err) {
        setErro(err instanceof Error ? err.message : 'Falha ao carregar relatório de avaliações');
      } finally {
        setLoadingAval(false);
      }
    }
    load();
  }, [turmaId, bimestre]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <header className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Relatórios</h1>
            <p className="text-sm text-slate-400">Indicadores de frequência e desempenho das avaliações.</p>
          </div>
          <TurmaSelect turmas={turmas} value={turmaId} onChange={setTurmaId} />
        </header>

        {erro && (
          <div className="mt-4 rounded border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
            {erro}
          </div>
        )}

        <section className="mt-6 rounded-xl border border-slate-800 bg-slate-900/70 p-6 shadow">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Frequência</h2>
              <p className="text-sm text-slate-400">Distribuição de presenças e faltas por aluno.</p>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-slate-300">
              <label className="flex flex-col">
                <span className="mb-1 text-xs uppercase tracking-wide text-slate-400">De</span>
                <input
                  type="date"
                  value={from}
                  onChange={(event) => setRange((prev) => ({ ...prev, from: event.target.value }))}
                  className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </label>
              <label className="flex flex-col">
                <span className="mb-1 text-xs uppercase tracking-wide text-slate-400">Até</span>
                <input
                  type="date"
                  value={to}
                  onChange={(event) => setRange((prev) => ({ ...prev, to: event.target.value }))}
                  className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </label>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm text-slate-200">
              <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3 text-left">Aluno</th>
                  <th className="px-4 py-3 text-left">Matrícula</th>
                  <th className="px-4 py-3 text-left">Presentes</th>
                  <th className="px-4 py-3 text-left">Faltas</th>
                  <th className="px-4 py-3 text-left">Justificadas</th>
                  <th className="px-4 py-3 text-left">% Presença</th>
                </tr>
              </thead>
              <tbody>
                {loadingFreq && (
                  <tr>
                    <td className="px-4 py-6 text-center text-slate-500" colSpan={6}>
                      Carregando…
                    </td>
                  </tr>
                )}
                {!loadingFreq && frequencia.length === 0 && (
                  <tr>
                    <td className="px-4 py-6 text-center text-slate-500" colSpan={6}>
                      Nenhum registro encontrado para o período.
                    </td>
                  </tr>
                )}
                {frequencia.map((aluno) => {
                  const percentual = aluno.total > 0 ? Math.round((aluno.presentes / aluno.total) * 100) : 0;
                  return (
                    <tr key={aluno.alunoId} className="border-t border-slate-800/70">
                      <td className="px-4 py-3 font-medium text-white">{aluno.nome}</td>
                      <td className="px-4 py-3 text-slate-400">{aluno.matricula ?? '—'}</td>
                      <td className="px-4 py-3 text-emerald-300">{aluno.presentes}</td>
                      <td className="px-4 py-3 text-rose-300">{aluno.faltas}</td>
                      <td className="px-4 py-3 text-amber-200">{aluno.justificadas}</td>
                      <td className="px-4 py-3 text-slate-200">{percentual}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8 rounded-xl border border-slate-800 bg-slate-900/70 p-6 shadow">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Avaliações</h2>
              <p className="text-sm text-slate-400">Médias por avaliação no bimestre selecionado.</p>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-wide text-slate-400">Bimestre</span>
              <select
                value={bimestre}
                onChange={(event) => setBimestre(Number(event.target.value))}
                className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
              >
                {[1, 2, 3, 4].map((valor) => (
                  <option key={valor} value={valor}>
                    {valor}º
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm text-slate-200">
              <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3 text-left">Avaliação</th>
                  <th className="px-4 py-3 text-left">Disciplina</th>
                  <th className="px-4 py-3 text-left">Média</th>
                  <th className="px-4 py-3 text-left">Aplicada em</th>
                  <th className="px-4 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {loadingAval && (
                  <tr>
                    <td className="px-4 py-6 text-center text-slate-500" colSpan={5}>
                      Carregando…
                    </td>
                  </tr>
                )}
                {!loadingAval && avaliacoes.length === 0 && (
                  <tr>
                    <td className="px-4 py-6 text-center text-slate-500" colSpan={5}>
                      Nenhuma avaliação encontrada.
                    </td>
                  </tr>
                )}
                {avaliacoes.map((avaliacao) => (
                  <tr key={avaliacao.avaliacaoId} className="border-t border-slate-800/70">
                    <td className="px-4 py-3 font-medium text-white">{avaliacao.titulo}</td>
                    <td className="px-4 py-3 text-slate-400">{avaliacao.disciplina}</td>
                    <td className="px-4 py-3 text-emerald-300">
                      {avaliacao.media != null ? avaliacao.media.toFixed(1) : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {avaliacao.aplicadaEm
                        ? new Date(avaliacao.aplicadaEm).toLocaleDateString('pt-BR')
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{avaliacao.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
