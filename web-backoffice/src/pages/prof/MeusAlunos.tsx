import { useEffect, useMemo, useState } from 'react';
import { FileText, Info, Loader2, Pencil, PlusCircle, ShieldCheck, Trash2 } from 'lucide-react';

import { professorApi } from '../../lib/api';
import { useThemeStore } from '../../stores/themeStore';
import type { Aluno, AlunoDiarioEntrada, Turma } from '../../types/edu';

export default function ProfessorMeusAlunos() {
  const theme = useThemeStore((state) => state.theme);
  const isLight = theme === 'light';

  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [selectedTurma, setSelectedTurma] = useState<string | null>(null);
  const [selectedAlunoId, setSelectedAlunoId] = useState<string | null>(null);
  const [diario, setDiario] = useState<AlunoDiarioEntrada[]>([]);
  const [loadingTurmas, setLoadingTurmas] = useState(false);
  const [loadingAlunos, setLoadingAlunos] = useState(false);
  const [loadingDiario, setLoadingDiario] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tipo: 'erro' | 'sucesso'; texto: string } | null>(null);
  const [novoRegistro, setNovoRegistro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editandoTexto, setEditandoTexto] = useState('');

  useEffect(() => {
    async function loadTurmas() {
      setLoadingTurmas(true);
      setErro(null);
      try {
        const lista = await professorApi.getTurmas();
        setTurmas(lista);
        if (!selectedTurma && lista.length) {
          setSelectedTurma(lista[0].id);
        }
      } catch (error) {
        setErro('Não foi possível carregar suas turmas.');
      } finally {
        setLoadingTurmas(false);
      }
    }
    loadTurmas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const turmaId = selectedTurma;
    if (!turmaId) {
      setAlunos([]);
      setSelectedAlunoId(null);
      return;
    }
    const currentTurmaId = turmaId;
    async function loadAlunos() {
      setLoadingAlunos(true);
      setErro(null);
      try {
        const lista = await professorApi.getAlunos(currentTurmaId);
        setAlunos(lista);
        const firstAlunoId = lista[0]?.id ?? null;
        setSelectedAlunoId((prev) => {
          if (prev && lista.some((aluno) => aluno.id === prev)) {
            return prev;
          }
          return firstAlunoId;
        });
      } catch (error) {
        setErro('Não foi possível carregar os alunos da turma.');
      } finally {
        setLoadingAlunos(false);
      }
    }
    loadAlunos();
  }, [selectedTurma]);

  const alunoSelecionado = useMemo(
    () => alunos.find((aluno) => aluno.id === selectedAlunoId) ?? null,
    [alunos, selectedAlunoId]
  );

  const alunoSelecionadoId = alunoSelecionado?.id ?? null;

  useEffect(() => {
    if (!alunoSelecionadoId || !selectedTurma) {
      setDiario([]);
      return;
    }
    const currentAlunoId = alunoSelecionadoId;
    const currentTurmaId = selectedTurma;
    async function loadDiario() {
      setLoadingDiario(true);
      setFeedback(null);
      setErro(null);
      try {
        const registros = await professorApi.getAlunoDiario(currentTurmaId, currentAlunoId);
        setDiario(registros);
        cancelarEdicao();
        setNovoRegistro('');
      } catch (error) {
        setErro('Não foi possível carregar o diário deste aluno.');
        setDiario([]);
      } finally {
        setLoadingDiario(false);
      }
    }
    loadDiario();
  }, [alunoSelecionadoId, selectedTurma]);

  const handleAdicionarRegistro = async () => {
    if (!alunoSelecionado || !selectedTurma) return;
    if (!novoRegistro.trim()) {
      setFeedback({ tipo: 'erro', texto: 'Descreva a anotação antes de salvar.' });
      return;
    }
    setSalvando(true);
    setFeedback(null);
    try {
      const registro = await professorApi.criarAlunoDiario(selectedTurma, alunoSelecionado.id, {
        conteudo: novoRegistro.trim()
      });
      setDiario((prev) => [registro, ...prev]);
      setNovoRegistro('');
      setFeedback({ tipo: 'sucesso', texto: 'Registro adicionado ao diário.' });
    } catch (error) {
      setFeedback({ tipo: 'erro', texto: 'Não foi possível salvar essa anotação.' });
    } finally {
      setSalvando(false);
    }
  };

  const iniciarEdicao = (registro: AlunoDiarioEntrada) => {
    setEditandoId(registro.id);
    setEditandoTexto(registro.conteudo);
  };

  const cancelarEdicao = () => {
    setEditandoId(null);
    setEditandoTexto('');
  };

  const handleAtualizarRegistro = async () => {
    if (!alunoSelecionado || !editandoId || !selectedTurma) return;
    if (!editandoTexto.trim()) {
      setFeedback({ tipo: 'erro', texto: 'O conteúdo não pode ficar vazio.' });
      return;
    }
    setSalvando(true);
    setFeedback(null);
    try {
      const atualizado = await professorApi.atualizarAlunoDiario(
        selectedTurma,
        alunoSelecionado.id,
        editandoId,
        {
          conteudo: editandoTexto.trim()
        }
      );
      setDiario((prev) => prev.map((item) => (item.id === atualizado.id ? atualizado : item)));
      cancelarEdicao();
      setFeedback({ tipo: 'sucesso', texto: 'Anotação atualizada.' });
    } catch (error) {
      setFeedback({ tipo: 'erro', texto: 'Não foi possível atualizar essa anotação.' });
    } finally {
      setSalvando(false);
    }
  };

  const handleRemoverRegistro = async (registro: AlunoDiarioEntrada) => {
    if (!alunoSelecionado || !selectedTurma) return;
    setSalvando(true);
    setFeedback(null);
    try {
      await professorApi.removerAlunoDiario(selectedTurma, alunoSelecionado.id, registro.id);
      setDiario((prev) => prev.filter((item) => item.id !== registro.id));
      setFeedback({ tipo: 'sucesso', texto: 'Registro removido.' });
    } catch (error) {
      setFeedback({ tipo: 'erro', texto: 'Não foi possível remover essa anotação.' });
    } finally {
      setSalvando(false);
    }
  };

  const tratativaErro = erro;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header
        className={`rounded-3xl border p-6 shadow ${
          isLight
            ? 'border-blue-100 bg-white text-slate-900'
            : 'border-slate-800 bg-slate-900/70 text-white'
        }`}
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Meus Alunos</h1>
            <p className={`text-sm ${isLight ? 'text-slate-500' : 'text-slate-300/80'}`}>
              Crie anotações pessoais sobre cada estudante. Apenas você visualizará essas informações no painel.
            </p>
          </div>
          <div
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
              isLight
                ? 'border-emerald-400 text-emerald-600'
                : 'border-emerald-500/50 text-emerald-200'
            }`}
          >
            <ShieldCheck size={14} /> Acesso restrito ao professor
          </div>
        </div>
      </header>

      {tratativaErro && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          {tratativaErro}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside
          className={`space-y-4 rounded-2xl border p-4 shadow ${
            isLight
              ? 'border-blue-100 bg-white text-slate-800'
              : 'border-slate-800 bg-slate-900/70 text-white'
          }`}
        >
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Turma
            </label>
            <select
              value={selectedTurma ?? ''}
              onChange={(event) => setSelectedTurma(event.target.value || null)}
              disabled={loadingTurmas}
              className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 ${
                isLight
                  ? 'border-slate-200 bg-white text-slate-900'
                  : 'border-slate-700 bg-slate-900 text-white'
              }`}
            >
              <option value="">{loadingTurmas ? 'Carregando turmas…' : 'Selecione uma turma'}</option>
              {turmas.map((turma) => (
                <option key={turma.id} value={turma.id}>
                  {turma.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Alunos</p>
            {loadingAlunos ? (
              <div className="flex items-center gap-2 rounded-lg border border-slate-700/60 px-3 py-2 text-xs text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando alunos…
              </div>
            ) : alunos.length === 0 ? (
              <p className="text-xs text-slate-500">Nenhum aluno nesta turma.</p>
            ) : (
              <ul className="space-y-1">
                {alunos.map((aluno) => {
                  const ativo = aluno.id === selectedAlunoId;
                  return (
                    <li key={aluno.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedAlunoId(aluno.id)}
                        className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                          ativo
                            ? 'bg-emerald-500/90 text-emerald-950 shadow'
                            : isLight
                            ? 'hover:bg-slate-100'
                            : 'hover:bg-slate-800/60'
                        }`}
                      >
                        <p className="font-semibold">{aluno.nome}</p>
                        {aluno.matricula && (
                          <span className="text-xs uppercase tracking-wide text-slate-400">
                            Matrícula {aluno.matricula}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        <section
          className={`space-y-4 rounded-2xl border p-6 shadow ${
            isLight
              ? 'border-blue-100 bg-white text-slate-900'
              : 'border-slate-800 bg-slate-900/70 text-white'
          }`}
        >
          {!selectedTurma || !alunoSelecionado ? (
            <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 text-center text-sm text-slate-400">
              <FileText className="h-10 w-10 text-slate-500" />
              <p>Selecione uma turma e um aluno para visualizar o diário.</p>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">{alunoSelecionado.nome}</h2>
                  <p className="text-sm text-slate-400">
                    {turmas.find((turma) => turma.id === selectedTurma)?.nome ?? 'Turma'} ·{' '}
                    {alunoSelecionado.matricula ? `Matrícula ${alunoSelecionado.matricula}` : 'Sem matrícula cadastrada'}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Info size={14} />
                  Apenas você visualiza este diário.
                </div>
              </div>

              <div
                className={`rounded-2xl border p-4 ${
                  isLight
                    ? 'border-emerald-200 bg-emerald-50'
                    : 'border-emerald-500/40 bg-emerald-500/10'
                }`}
              >
                <label
                  className={`text-xs font-semibold uppercase tracking-wide ${
                    isLight ? 'text-emerald-600' : 'text-emerald-300'
                  }`}
                >
                  Novo registro
                </label>
                <textarea
                  value={novoRegistro}
                  onChange={(event) => setNovoRegistro(event.target.value)}
                  rows={3}
                  placeholder="Anote observações sobre o desempenho, comportamento ou comunicados importantes."
                  className={`mt-2 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 ${
                    isLight
                      ? 'border-emerald-200 bg-white text-slate-900'
                      : 'border-emerald-500/40 bg-slate-950/60 text-white'
                  }`}
                />
                <div className="mt-3 flex items-center justify-end gap-3">
                  {feedback && (
                    <span
                      className={`text-xs ${
                        feedback.tipo === 'erro'
                          ? isLight
                            ? 'text-rose-500'
                            : 'text-rose-300'
                          : isLight
                          ? 'text-emerald-600'
                          : 'text-emerald-200'
                      }`}
                    >
                      {feedback.texto}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleAdicionarRegistro}
                    disabled={salvando || !novoRegistro.trim()}
                    className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      isLight
                        ? 'bg-emerald-500 text-white hover:bg-emerald-400'
                        : 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400'
                    }`}
                  >
                    {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle size={16} />}
                    Adicionar registro
                  </button>
                </div>
              </div>

              {loadingDiario ? (
                <div className="flex items-center gap-2 rounded-xl border border-slate-700/60 px-3 py-2 text-sm text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando diário…
                </div>
              ) : diario.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Nenhuma anotação por enquanto. Use o campo acima para iniciar o diário deste aluno.
                </p>
              ) : (
                <ul className="space-y-4">
                  {diario.map((registro) => {
                    const emEdicao = registro.id === editandoId;
                    return (
                      <li
                        key={registro.id}
                        className={`rounded-2xl border p-4 shadow-sm transition ${
                          isLight
                            ? 'border-slate-200 bg-white'
                            : 'border-slate-800 bg-slate-900/60'
                        }`}
                      >
                        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                          <div className="flex-1">
                            {emEdicao ? (
                              <textarea
                                value={editandoTexto}
                                onChange={(event) => setEditandoTexto(event.target.value)}
                                rows={3}
                                className={`w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 ${
                                  isLight
                                    ? 'border-slate-200 bg-white text-slate-900'
                                    : 'border-slate-700 bg-slate-900 text-white'
                                }`}
                              />
                            ) : (
                              <p
                                className={`text-sm leading-relaxed ${
                                  isLight ? 'text-slate-600' : 'text-slate-200'
                                }`}
                              >
                                {registro.conteudo}
                              </p>
                            )}
                          </div>
                          <div className="flex shrink-0 gap-2 text-xs text-slate-400">
                            <span>{new Date(registro.criadoEm).toLocaleString('pt-BR')}</span>
                            {registro.atualizadoEm && (
                              <span>· Atualizado {new Date(registro.atualizadoEm).toLocaleString('pt-BR')}</span>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-end gap-2 text-xs">
                          {emEdicao ? (
                            <>
                              <button
                                type="button"
                                onClick={handleAtualizarRegistro}
                                disabled={salvando || !editandoTexto.trim()}
                                className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-3 py-1.5 font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-60"
                              >
                                <ShieldCheck size={14} /> Salvar
                              </button>
                              <button
                                type="button"
                                onClick={cancelarEdicao}
                                className="inline-flex items-center gap-2 rounded-full border border-slate-600 px-3 py-1.5 font-semibold text-slate-300 transition hover:border-slate-400 hover:text-white"
                              >
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => iniciarEdicao(registro)}
                                className="inline-flex items-center gap-2 rounded-full border border-slate-600 px-3 py-1.5 font-semibold text-slate-300 transition hover:border-emerald-400 hover:text-emerald-200"
                              >
                                <Pencil size={14} /> Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoverRegistro(registro)}
                                className="inline-flex items-center gap-2 rounded-full border border-rose-500/60 px-3 py-1.5 font-semibold text-rose-200 transition hover:border-rose-400 hover:text-rose-100"
                              >
                                <Trash2 size={14} /> Remover
                              </button>
                            </>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
