import { useEffect, useMemo, useState } from 'react';
import { professorApi } from '../../lib/api';
import type { Avaliacao, Turma } from '../../types/edu';
import { TurmaSelect } from '../../components/prof/TurmaSelect';
import { StatusBadge } from '../../components/prof/StatusBadge';

const TIPOS = [
  { value: 'PROVA', label: 'Prova' },
  { value: 'ATIVIDADE', label: 'Atividade' }
];

interface QuestaoForm {
  enunciado: string;
  alternativas: string[];
  correta?: number | null;
}

export default function ProfessorAvaliacoes() {
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [selectedTurma, setSelectedTurma] = useState<string | null>(null);
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState({
    titulo: '',
    disciplina: '',
    tipo: 'PROVA',
    data: '',
    peso: 1
  });
  const [questoes, setQuestoes] = useState<QuestaoForm[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    async function loadTurmas() {
      const data = await professorApi.getTurmas();
      setTurmas(data);
      if (!selectedTurma && data.length) {
        setSelectedTurma(data[0].id);
      }
    }
    loadTurmas();
  }, [selectedTurma]);

  const turmaAtual = useMemo(() => turmas.find((t) => t.id === selectedTurma) ?? null, [turmas, selectedTurma]);

  useEffect(() => {
    async function loadAvaliacoes() {
      if (!selectedTurma) return;
      setLoading(true);
      setErro(null);
      try {
        const data = await professorApi.getAvaliacoes(selectedTurma);
        setAvaliacoes(data);
      } catch (err) {
        setErro(err instanceof Error ? err.message : 'Não foi possível carregar avaliações.');
      } finally {
        setLoading(false);
      }
    }
    loadAvaliacoes();
  }, [selectedTurma]);

  const adicionarQuestao = () => {
    setQuestoes((prev) => [...prev, { enunciado: '', alternativas: ['', '', '', ''], correta: 0 }]);
  };

  const atualizarQuestao = (index: number, data: Partial<QuestaoForm>) => {
    setQuestoes((prev) => prev.map((questao, idx) => (idx === index ? { ...questao, ...data } : questao)));
  };

  const removerQuestao = (index: number) => {
    setQuestoes((prev) => prev.filter((_, idx) => idx !== index));
  };

  const criarAvaliacao = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTurma) return;
    setSalvando(true);
    setErro(null);
    try {
      await professorApi.createAvaliacao(selectedTurma, {
        titulo: form.titulo,
        disciplina: form.disciplina,
        tipo: form.tipo,
        data: form.data || undefined,
        peso: Number(form.peso) || 1,
        questoes: questoes.map((questao) => ({
          enunciado: questao.enunciado,
          alternativas: questao.alternativas,
          correta: questao.correta
        }))
      });
      setForm({ titulo: '', disciplina: '', tipo: 'PROVA', data: '', peso: 1 });
      setQuestoes([]);
      const data = await professorApi.getAvaliacoes(selectedTurma);
      setAvaliacoes(data);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível criar a avaliação.');
    } finally {
      setSalvando(false);
    }
  };

  const publicar = async (avaliacaoId: string) => {
    try {
      await professorApi.publicarAvaliacao(avaliacaoId);
      if (selectedTurma) {
        const data = await professorApi.getAvaliacoes(selectedTurma);
        setAvaliacoes(data);
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha ao publicar avaliação.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <header className="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Avaliações</h1>
            <p className="text-sm text-slate-400">Crie atividades, publique gabaritos e acompanhe o progresso das turmas.</p>
          </div>
          <TurmaSelect turmas={turmas} value={selectedTurma} onChange={setSelectedTurma} />
        </header>

        {erro && (
          <div className="mb-4 rounded border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
            {erro}
          </div>
        )}

        <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-6 shadow">
          <h2 className="text-lg font-semibold text-white">Nova avaliação</h2>
          <p className="mt-1 text-sm text-slate-400">Preencha os campos abaixo e adicione questões objetivas se desejar.</p>

          <form onSubmit={criarAvaliacao} className="mt-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col text-sm text-slate-300">
                <span className="mb-1 text-xs uppercase tracking-wide text-slate-400">Título</span>
                <input
                  required
                  value={form.titulo}
                  onChange={(event) => setForm((prev) => ({ ...prev, titulo: event.target.value }))}
                  className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white shadow focus:border-emerald-500 focus:outline-none"
                  placeholder="Ex.: Prova Bimestral"
                />
              </label>
              <label className="flex flex-col text-sm text-slate-300">
                <span className="mb-1 text-xs uppercase tracking-wide text-slate-400">Disciplina</span>
                <input
                  required
                  value={form.disciplina}
                  onChange={(event) => setForm((prev) => ({ ...prev, disciplina: event.target.value }))}
                  className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white shadow focus:border-emerald-500 focus:outline-none"
                  placeholder="Ex.: Matemática"
                />
              </label>
              <label className="flex flex-col text-sm text-slate-300">
                <span className="mb-1 text-xs uppercase tracking-wide text-slate-400">Tipo</span>
                <select
                  value={form.tipo}
                  onChange={(event) => setForm((prev) => ({ ...prev, tipo: event.target.value }))}
                  className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white shadow focus:border-emerald-500 focus:outline-none"
                >
                  {TIPOS.map((tipo) => (
                    <option key={tipo.value} value={tipo.value}>
                      {tipo.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col text-sm text-slate-300">
                <span className="mb-1 text-xs uppercase tracking-wide text-slate-400">Data</span>
                <input
                  type="date"
                  value={form.data}
                  onChange={(event) => setForm((prev) => ({ ...prev, data: event.target.value }))}
                  className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white shadow focus:border-emerald-500 focus:outline-none"
                />
              </label>
              <label className="flex flex-col text-sm text-slate-300">
                <span className="mb-1 text-xs uppercase tracking-wide text-slate-400">Peso</span>
                <input
                  type="number"
                  min={0.1}
                  step="0.1"
                  value={form.peso}
                  onChange={(event) => setForm((prev) => ({ ...prev, peso: Number(event.target.value) }))}
                  className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white shadow focus:border-emerald-500 focus:outline-none"
                />
              </label>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-white">Questões objetivas</h3>
                <button
                  type="button"
                  className="text-xs font-semibold text-emerald-400 hover:text-emerald-300"
                  onClick={adicionarQuestao}
                >
                  Adicionar questão
                </button>
              </div>
              {questoes.length === 0 && (
                <p className="text-sm text-slate-500">Nenhuma questão adicionada. Esse passo é opcional.</p>
              )}
              {questoes.map((questao, index) => (
                <div key={`questao-${index}`} className="rounded border border-slate-800 bg-slate-900/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <label className="flex-1 text-sm text-slate-300">
                      <span className="mb-1 block text-xs uppercase tracking-wide text-slate-400">Enunciado</span>
                      <textarea
                        required
                        value={questao.enunciado}
                        onChange={(event) => atualizarQuestao(index, { enunciado: event.target.value })}
                        className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white shadow focus:border-emerald-500 focus:outline-none"
                        rows={2}
                      />
                    </label>
                    <button
                      type="button"
                      className="text-xs font-semibold text-rose-300 hover:text-rose-200"
                      onClick={() => removerQuestao(index)}
                    >
                      Remover
                    </button>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {questao.alternativas.map((alt, altIndex) => (
                      <label key={`alt-${index}-${altIndex}`} className="flex items-center gap-2 text-xs text-slate-400">
                        <input
                          type="radio"
                          name={`questao-${index}`}
                          checked={questao.correta === altIndex}
                          onChange={() => atualizarQuestao(index, { correta: altIndex })}
                        />
                        <input
                          value={alt}
                          onChange={(event) => {
                            const novas = [...questao.alternativas];
                            novas[altIndex] = event.target.value;
                            atualizarQuestao(index, { alternativas: novas });
                          }}
                          placeholder={`Alternativa ${altIndex + 1}`}
                          className="flex-1 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <button
              type="submit"
              disabled={salvando || !selectedTurma}
              className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/60"
            >
              {salvando ? 'Salvando…' : 'Criar avaliação'}
            </button>
          </form>
        </section>

        <section className="mt-10 rounded-xl border border-slate-800 bg-slate-900/70 p-6 shadow">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Avaliações cadastradas</h2>
            {turmaAtual && <p className="text-xs uppercase tracking-wide text-slate-500">{turmaAtual.nome}</p>}
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm text-slate-200">
              <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3 text-left">Título</th>
                  <th className="px-4 py-3 text-left">Disciplina</th>
                  <th className="px-4 py-3 text-left">Tipo</th>
                  <th className="px-4 py-3 text-left">Data</th>
                  <th className="px-4 py-3 text-left">Peso</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td className="px-4 py-6 text-center text-slate-500" colSpan={7}>
                      Carregando avaliações…
                    </td>
                  </tr>
                )}
                {!loading && avaliacoes.length === 0 && (
                  <tr>
                    <td className="px-4 py-6 text-center text-slate-500" colSpan={7}>
                      Nenhuma avaliação cadastrada para a turma selecionada.
                    </td>
                  </tr>
                )}
                {avaliacoes.map((avaliacao) => (
                  <tr key={avaliacao.id} className="border-t border-slate-800/70">
                    <td className="px-4 py-3 font-medium text-white">{avaliacao.titulo}</td>
                    <td className="px-4 py-3 text-slate-400">{avaliacao.disciplina}</td>
                    <td className="px-4 py-3 text-slate-400">{avaliacao.tipo}</td>
                    <td className="px-4 py-3 text-slate-400">
                      {avaliacao.data
                        ? new Date(avaliacao.data).toLocaleDateString('pt-BR')
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{avaliacao.peso}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={avaliacao.status} />
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {avaliacao.status !== 'PUBLICADA' && (
                        <button
                          type="button"
                          onClick={() => publicar(avaliacao.id)}
                          className="rounded border border-emerald-500/40 px-3 py-1 font-semibold text-emerald-200 transition hover:border-emerald-400 hover:text-emerald-100"
                        >
                          Publicar
                        </button>
                      )}
                    </td>
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
