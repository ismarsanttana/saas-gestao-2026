import { useEffect, useMemo, useState } from 'react';
import {
  NotebookPen,
  FileUp,
  Link as LinkIcon,
  Trash2,
  Download,
  Layers,
  FolderOpen,
  ListChecks,
  CheckCircle2,
  CalendarClock
} from 'lucide-react';
import type { Turma } from '../../types/edu';
import { professorApi } from '../../lib/api';
import { TurmaSelect } from '../../components/prof/TurmaSelect';

const STORAGE_KEY = 'professor-planning-v1';
const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;

type BaseAttachment = {
  id: string;
  label: string;
  createdAt: string;
};

type LinkAttachment = BaseAttachment & {
  type: 'link';
  url: string;
};

type FileAttachment = BaseAttachment & {
  type: 'file';
  filename: string;
  mimeType?: string;
  size: number;
  dataUrl: string;
};

type Attachment = LinkAttachment | FileAttachment;

type LessonPlan = {
  id: string;
  turmaId: string;
  titulo: string;
  objetivos: string;
  conteudos: string;
  metodologia: string;
  recursos: string;
  avaliacao: string;
  observacoes?: string;
  anexos: Attachment[];
  criadoEm: string;
  atualizadoEm: string;
};

type MaterialItem = {
  id: string;
  turmaId: string;
  titulo: string;
  descricao?: string;
  categoria: 'texto' | 'video' | 'apresentacao' | 'outro';
  tags: string[];
  compartilhamento: 'privado' | 'turma';
  link?: string;
  anexos: Attachment[];
  criadoEm: string;
};

type QuizQuestion = {
  id: string;
  enunciado: string;
  alternativas: string[];
  correta: number | null;
};

type QuizActivity = {
  id: string;
  turmaId: string;
  titulo: string;
  descricao?: string;
  entrega?: string | null;
  correcaoAutomatica: boolean;
  questoes: QuizQuestion[];
  criadoEm: string;
};

type PlannerStorage = {
  planos: LessonPlan[];
  materiais: MaterialItem[];
  quizzes: QuizActivity[];
};

type PlanFormState = {
  titulo: string;
  objetivos: string;
  conteudos: string;
  metodologia: string;
  recursos: string;
  avaliacao: string;
  observacoes: string;
  anexos: Attachment[];
};

type MaterialFormState = {
  titulo: string;
  descricao: string;
  categoria: MaterialItem['categoria'];
  tags: string;
  link: string;
  anexos: Attachment[];
  compartilhamento: MaterialItem['compartilhamento'];
};

type QuizFormState = {
  titulo: string;
  descricao: string;
  entrega: string;
  correcaoAutomatica: boolean;
  questoes: QuizQuestion[];
};

function createEmptyStorage(): PlannerStorage {
  return { planos: [], materiais: [], quizzes: [] };
}

function uid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 10);
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short'
    });
  } catch {
    return value;
  }
}

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

async function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Falha ao ler arquivo'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

function createEmptyQuestion(): QuizQuestion {
  return {
    id: uid(),
    enunciado: '',
    alternativas: ['', '', '', ''],
    correta: null
  };
}

export default function ProfessorPlanejamento() {
  const [storage, setStorage] = useState<PlannerStorage>(() => {
    if (typeof window === 'undefined') {
      return createEmptyStorage();
    }
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createEmptyStorage();
    try {
      const parsed = JSON.parse(raw);
      return {
        planos: Array.isArray(parsed.planos) ? parsed.planos : [],
        materiais: Array.isArray(parsed.materiais) ? parsed.materiais : [],
        quizzes: Array.isArray(parsed.quizzes) ? parsed.quizzes : []
      } satisfies PlannerStorage;
    } catch {
      return createEmptyStorage();
    }
  });
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [turmaId, setTurmaId] = useState<string | null>(null);
  const [loadingTurmas, setLoadingTurmas] = useState(true);
  const [erroTurmas, setErroTurmas] = useState<string | null>(null);

  const [planForm, setPlanForm] = useState<PlanFormState>({
    titulo: '',
    objetivos: '',
    conteudos: '',
    metodologia: '',
    recursos: '',
    avaliacao: '',
    observacoes: '',
    anexos: []
  });
  const [planLinkLabel, setPlanLinkLabel] = useState('');
  const [planLinkUrl, setPlanLinkUrl] = useState('');
  const [planError, setPlanError] = useState<string | null>(null);
  const [planSuccess, setPlanSuccess] = useState<string | null>(null);

  const [materialForm, setMaterialForm] = useState<MaterialFormState>({
    titulo: '',
    descricao: '',
    categoria: 'texto',
    tags: '',
    link: '',
    anexos: [],
    compartilhamento: 'turma'
  });
  const [materialLinkLabel, setMaterialLinkLabel] = useState('');
  const [materialLinkUrl, setMaterialLinkUrl] = useState('');
  const [materialError, setMaterialError] = useState<string | null>(null);
  const [materialSuccess, setMaterialSuccess] = useState<string | null>(null);

  const [quizForm, setQuizForm] = useState<QuizFormState>({
    titulo: '',
    descricao: '',
    entrega: '',
    correcaoAutomatica: true,
    questoes: [createEmptyQuestion()]
  });
  const [quizError, setQuizError] = useState<string | null>(null);
  const [quizSuccess, setQuizSuccess] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadTurmas() {
      try {
        setErroTurmas(null);
        const data = await professorApi.getTurmas();
        if (!active) return;
        setTurmas(data);
        setTurmaId((prev) => prev ?? (data[0]?.id ?? null));
      } catch (error) {
        if (!active) return;
        setErroTurmas(error instanceof Error ? error.message : 'Não foi possível carregar as turmas');
      } finally {
        if (active) {
          setLoadingTurmas(false);
        }
      }
    }
    loadTurmas();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
  }, [storage]);

  useEffect(() => {
    if (planSuccess) {
      const timer = window.setTimeout(() => setPlanSuccess(null), 4000);
      return () => window.clearTimeout(timer);
    }
  }, [planSuccess]);

  useEffect(() => {
    if (materialSuccess) {
      const timer = window.setTimeout(() => setMaterialSuccess(null), 4000);
      return () => window.clearTimeout(timer);
    }
  }, [materialSuccess]);

  useEffect(() => {
    if (quizSuccess) {
      const timer = window.setTimeout(() => setQuizSuccess(null), 4000);
      return () => window.clearTimeout(timer);
    }
  }, [quizSuccess]);

  const planos = useMemo(() => {
    const items = turmaId ? storage.planos.filter((item) => item.turmaId === turmaId) : storage.planos;
    return items
      .slice()
      .sort((a, b) => new Date(b.atualizadoEm).getTime() - new Date(a.atualizadoEm).getTime());
  }, [storage.planos, turmaId]);

  const materiais = useMemo(() => {
    const items = turmaId ? storage.materiais.filter((item) => item.turmaId === turmaId) : storage.materiais;
    return items
      .slice()
      .sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime());
  }, [storage.materiais, turmaId]);

  const quizzes = useMemo(() => {
    const items = turmaId ? storage.quizzes.filter((item) => item.turmaId === turmaId) : storage.quizzes;
    return items
      .slice()
      .sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime());
  }, [storage.quizzes, turmaId]);

  const addAttachmentLink = (
    label: string,
    url: string,
    update: (updater: (attachments: Attachment[]) => Attachment[]) => void
  ) => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      return false;
    }
    const trimmedLabel = label.trim() || trimmedUrl;
    const attachment: LinkAttachment = {
      id: uid(),
      type: 'link',
      label: trimmedLabel,
      url: trimmedUrl,
      createdAt: new Date().toISOString()
    };
    update((prev) => [...prev, attachment]);
    return true;
  };

  const handlePlanLinkAdd = () => {
    const added = addAttachmentLink(planLinkLabel, planLinkUrl, (updater) => {
      setPlanForm((prev) => ({ ...prev, anexos: updater(prev.anexos) }));
    });
    if (added) {
      setPlanLinkLabel('');
      setPlanLinkUrl('');
    }
  };

  const handleMaterialLinkAdd = () => {
    const added = addAttachmentLink(materialLinkLabel, materialLinkUrl, (updater) => {
      setMaterialForm((prev) => ({ ...prev, anexos: updater(prev.anexos) }));
    });
    if (added) {
      setMaterialLinkLabel('');
      setMaterialLinkUrl('');
    }
  };

  const handlePlanFile = async (file: File) => {
    if (file.size > MAX_ATTACHMENT_SIZE) {
      setPlanError('Limite de 5MB por arquivo.');
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const attachment: FileAttachment = {
        id: uid(),
        type: 'file',
        label: file.name,
        filename: file.name,
        mimeType: file.type,
        size: file.size,
        dataUrl,
        createdAt: new Date().toISOString()
      };
      setPlanForm((prev) => ({ ...prev, anexos: [...prev.anexos, attachment] }));
      setPlanError(null);
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : 'Não foi possível anexar o arquivo');
    }
  };

  const handleMaterialFile = async (file: File) => {
    if (file.size > MAX_ATTACHMENT_SIZE) {
      setMaterialError('Limite de 5MB por arquivo.');
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const attachment: FileAttachment = {
        id: uid(),
        type: 'file',
        label: file.name,
        filename: file.name,
        mimeType: file.type,
        size: file.size,
        dataUrl,
        createdAt: new Date().toISOString()
      };
      setMaterialForm((prev) => ({ ...prev, anexos: [...prev.anexos, attachment] }));
      setMaterialError(null);
    } catch (error) {
      setMaterialError(error instanceof Error ? error.message : 'Não foi possível anexar o arquivo');
    }
  };

  const removePlanAttachment = (id: string) => {
    setPlanForm((prev) => ({ ...prev, anexos: prev.anexos.filter((anexo) => anexo.id !== id) }));
  };

  const removeMaterialAttachment = (id: string) => {
    setMaterialForm((prev) => ({ ...prev, anexos: prev.anexos.filter((anexo) => anexo.id !== id) }));
  };

  const handlePlanSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPlanSuccess(null);
    if (!turmaId) {
      setPlanError('Selecione uma turma para salvar o plano.');
      return;
    }
    if (!planForm.titulo.trim()) {
      setPlanError('Informe um título para o plano de aula.');
      return;
    }
    if (!planForm.objetivos.trim()) {
      setPlanError('Descreva os objetivos planejados.');
      return;
    }
    if (!planForm.conteudos.trim()) {
      setPlanError('Liste os conteúdos que serão trabalhados.');
      return;
    }

    const now = new Date().toISOString();
    const novoPlano: LessonPlan = {
      id: uid(),
      turmaId,
      titulo: planForm.titulo.trim(),
      objetivos: planForm.objetivos.trim(),
      conteudos: planForm.conteudos.trim(),
      metodologia: planForm.metodologia.trim(),
      recursos: planForm.recursos.trim(),
      avaliacao: planForm.avaliacao.trim(),
      observacoes: planForm.observacoes.trim() || undefined,
      anexos: planForm.anexos.map((anexo) => ({ ...anexo })),
      criadoEm: now,
      atualizadoEm: now
    };

    setStorage((prev) => ({ ...prev, planos: [...prev.planos, novoPlano] }));
    setPlanForm({
      titulo: '',
      objetivos: '',
      conteudos: '',
      metodologia: '',
      recursos: '',
      avaliacao: '',
      observacoes: '',
      anexos: []
    });
    setPlanLinkLabel('');
    setPlanLinkUrl('');
    setPlanError(null);
    setPlanSuccess('Plano de aula salvo com sucesso.');
  };

  const removePlano = (id: string) => {
    setStorage((prev) => ({ ...prev, planos: prev.planos.filter((item) => item.id !== id) }));
  };

  const handleMaterialSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMaterialSuccess(null);
    if (!turmaId) {
      setMaterialError('Selecione uma turma para salvar o material.');
      return;
    }
    if (!materialForm.titulo.trim()) {
      setMaterialError('Informe um título para o material.');
      return;
    }

    const tags = materialForm.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    const novoMaterial: MaterialItem = {
      id: uid(),
      turmaId,
      titulo: materialForm.titulo.trim(),
      descricao: materialForm.descricao.trim() || undefined,
      categoria: materialForm.categoria,
      tags,
      compartilhamento: materialForm.compartilhamento,
      link: materialForm.link.trim() || undefined,
      anexos: materialForm.anexos.map((anexo) => ({ ...anexo })),
      criadoEm: new Date().toISOString()
    };

    setStorage((prev) => ({ ...prev, materiais: [...prev.materiais, novoMaterial] }));
    setMaterialForm({
      titulo: '',
      descricao: '',
      categoria: 'texto',
      tags: '',
      link: '',
      anexos: [],
      compartilhamento: 'turma'
    });
    setMaterialLinkLabel('');
    setMaterialLinkUrl('');
    setMaterialError(null);
    setMaterialSuccess('Material adicionado ao banco com sucesso.');
  };

  const removeMaterial = (id: string) => {
    setStorage((prev) => ({ ...prev, materiais: prev.materiais.filter((item) => item.id !== id) }));
  };

  const handleQuizField = (field: keyof QuizFormState, value: string | boolean) => {
    setQuizForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateQuestion = (id: string, updater: (question: QuizQuestion) => QuizQuestion) => {
    setQuizForm((prev) => ({
      ...prev,
      questoes: prev.questoes.map((questao) => (questao.id === id ? updater(questao) : questao))
    }));
  };

  const addQuestion = () => {
    setQuizForm((prev) => ({ ...prev, questoes: [...prev.questoes, createEmptyQuestion()] }));
  };

  const removeQuestion = (id: string) => {
    setQuizForm((prev) => {
      if (prev.questoes.length === 1) {
        return { ...prev, questoes: [createEmptyQuestion()] };
      }
      return { ...prev, questoes: prev.questoes.filter((questao) => questao.id !== id) };
    });
  };

  const handleQuizSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setQuizSuccess(null);
    if (!turmaId) {
      setQuizError('Selecione uma turma para publicar a atividade.');
      return;
    }
    if (!quizForm.titulo.trim()) {
      setQuizError('Informe um título para a atividade ou quiz.');
      return;
    }

    const questoesSanitizadas = quizForm.questoes.map((questao) => ({
      ...questao,
      enunciado: questao.enunciado.trim(),
      alternativas: questao.alternativas.map((alternativa) => alternativa.trim())
    }));

    if (!questoesSanitizadas.length || questoesSanitizadas.every((questao) => !questao.enunciado)) {
      setQuizError('Inclua pelo menos uma questão com enunciado.');
      return;
    }

    const possuiQuestaoIncompleta = questoesSanitizadas.some(
      (questao) => !questao.enunciado || questao.alternativas.filter(Boolean).length < 2
    );
    if (possuiQuestaoIncompleta) {
      setQuizError('Cada questão deve ter enunciado e pelo menos duas alternativas preenchidas.');
      return;
    }

    if (
      quizForm.correcaoAutomatica &&
      questoesSanitizadas.some(
        (questao) => questao.correta === null || !questao.alternativas[questao.correta]?.trim()
      )
    ) {
      setQuizError('Defina a alternativa correta em todas as questões para habilitar a correção automática.');
      return;
    }

    const novaAtividade: QuizActivity = {
      id: uid(),
      turmaId,
      titulo: quizForm.titulo.trim(),
      descricao: quizForm.descricao.trim() || undefined,
      entrega: quizForm.entrega || null,
      correcaoAutomatica: quizForm.correcaoAutomatica,
      questoes: questoesSanitizadas.map((questao) => ({ ...questao })),
      criadoEm: new Date().toISOString()
    };

    setStorage((prev) => ({ ...prev, quizzes: [...prev.quizzes, novaAtividade] }));
    setQuizForm({
      titulo: '',
      descricao: '',
      entrega: '',
      correcaoAutomatica: true,
      questoes: [createEmptyQuestion()]
    });
    setQuizError(null);
    setQuizSuccess('Atividade criada e adicionada ao planejamento.');
  };

  const removeQuiz = (id: string) => {
    setStorage((prev) => ({ ...prev, quizzes: prev.quizzes.filter((item) => item.id !== id) }));
  };

  const renderedTurma = turmaId ? turmas.find((turma) => turma.id === turmaId)?.nome : null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <header className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-6 shadow">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <span className="rounded-2xl bg-emerald-500/20 p-3 text-emerald-200">
                <NotebookPen size={28} />
              </span>
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-emerald-300/80">Planejamento</p>
                <h1 className="text-2xl font-semibold text-white">Planejamento e Conteúdo Pedagógico</h1>
                <p className="mt-1 max-w-2xl text-sm text-emerald-50/80">
                  Organize planos de aula, centralize materiais e crie quizzes personalizados para suas turmas.
                </p>
              </div>
            </div>
            <div className="w-full max-w-xs">
              <TurmaSelect
                turmas={turmas}
                value={turmaId}
                onChange={setTurmaId}
                placeholder="Filtrar por turma"
              />
              {renderedTurma && (
                <p className="mt-1 text-xs text-emerald-100/70">Gerenciando recursos da turma {renderedTurma}.</p>
              )}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-emerald-50/60">
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1">
              <CalendarClock size={14} />
              Planeje, publique e revise em um só lugar
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1">
              <CheckCircle2 size={14} />
              Correção automática disponível para quizzes de múltipla escolha
            </span>
          </div>
        </header>

        {erroTurmas && (
          <div className="mt-4 rounded border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
            {erroTurmas}
          </div>
        )}

        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-slate-800/80 p-2 text-emerald-300">
              <NotebookPen size={20} />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-white">Plano de Aula</h2>
              <p className="text-sm text-slate-400">
                Estruture objetivos, conteúdos, estratégias e recursos do encontro. Adicione anexos e links para não perder referências.
              </p>
            </div>
          </div>

          <form onSubmit={handlePlanSubmit} className="mt-6 space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col text-sm text-slate-300">
                <span className="mb-1 text-xs uppercase tracking-wide text-slate-400">Título</span>
                <input
                  value={planForm.titulo}
                  onChange={(event) => setPlanForm((prev) => ({ ...prev, titulo: event.target.value }))}
                  required
                  className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white shadow focus:border-emerald-500 focus:outline-none"
                  placeholder="Ex.: Aula 03 - Frações equivalentes"
                />
              </label>
              <label className="flex flex-col text-sm text-slate-300">
                <span className="mb-1 text-xs uppercase tracking-wide text-slate-400">Objetivos</span>
                <input
                  value={planForm.objetivos}
                  onChange={(event) => setPlanForm((prev) => ({ ...prev, objetivos: event.target.value }))}
                  required
                  className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white shadow focus:border-emerald-500 focus:outline-none"
                  placeholder="O que os alunos devem alcançar ao final da aula?"
                />
              </label>
            </div>
            <label className="flex flex-col text-sm text-slate-300">
              <span className="mb-1 text-xs uppercase tracking-wide text-slate-400">Conteúdos principais</span>
              <textarea
                value={planForm.conteudos}
                onChange={(event) => setPlanForm((prev) => ({ ...prev, conteudos: event.target.value }))}
                required
                rows={3}
                className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white shadow focus:border-emerald-500 focus:outline-none"
                placeholder="Liste assuntos, habilidades e competências que serão trabalhados."
              />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col text-sm text-slate-300">
                <span className="mb-1 text-xs uppercase tracking-wide text-slate-400">Estratégias e metodologias</span>
                <textarea
                  value={planForm.metodologia}
                  onChange={(event) => setPlanForm((prev) => ({ ...prev, metodologia: event.target.value }))}
                  rows={3}
                  className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white shadow focus:border-emerald-500 focus:outline-none"
                  placeholder="Descreva a dinâmica da aula, como dividir turmas, tempos e abordagens."
                />
              </label>
              <label className="flex flex-col text-sm text-slate-300">
                <span className="mb-1 text-xs uppercase tracking-wide text-slate-400">Recursos didáticos</span>
                <textarea
                  value={planForm.recursos}
                  onChange={(event) => setPlanForm((prev) => ({ ...prev, recursos: event.target.value }))}
                  rows={3}
                  className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white shadow focus:border-emerald-500 focus:outline-none"
                  placeholder="Liste materiais, mídias ou plataformas que serão utilizadas."
                />
              </label>
            </div>
            <label className="flex flex-col text-sm text-slate-300">
              <span className="mb-1 text-xs uppercase tracking-wide text-slate-400">Avaliação e critérios de sucesso</span>
              <textarea
                value={planForm.avaliacao}
                onChange={(event) => setPlanForm((prev) => ({ ...prev, avaliacao: event.target.value }))}
                rows={3}
                className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white shadow focus:border-emerald-500 focus:outline-none"
                placeholder="Como acompanhar o aprendizado? Quais evidências indicarão sucesso?"
              />
            </label>
            <label className="flex flex-col text-sm text-slate-300">
              <span className="mb-1 text-xs uppercase tracking-wide text-slate-400">Observações</span>
              <textarea
                value={planForm.observacoes}
                onChange={(event) => setPlanForm((prev) => ({ ...prev, observacoes: event.target.value }))}
                rows={2}
                className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white shadow focus:border-emerald-500 focus:outline-none"
                placeholder="Registre adaptações, encaminhamentos ou materiais extras (opcional)."
              />
            </label>

            <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Anexos e links de apoio</p>
              <div className="flex flex-col gap-3 md:flex-row">
                <div className="flex flex-1 items-end gap-2">
                  <label className="flex flex-1 flex-col text-sm text-slate-300">
                    <span className="mb-1 text-xs uppercase tracking-wide text-slate-400">Nome do recurso</span>
                    <input
                      value={planLinkLabel}
                      onChange={(event) => setPlanLinkLabel(event.target.value)}
                      className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white shadow focus:border-emerald-500 focus:outline-none"
                      placeholder="Ex.: Vídeo introdutório"
                    />
                  </label>
                  <label className="flex flex-[1.3] flex-col text-sm text-slate-300">
                    <span className="mb-1 text-xs uppercase tracking-wide text-slate-400">Link (URL)</span>
                    <input
                      value={planLinkUrl}
                      onChange={(event) => setPlanLinkUrl(event.target.value)}
                      type="url"
                      className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white shadow focus:border-emerald-500 focus:outline-none"
                      placeholder="https://"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handlePlanLinkAdd}
                    className="inline-flex items-center gap-2 rounded border border-emerald-500/50 bg-emerald-500/20 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/30"
                  >
                    <LinkIcon size={14} />
                    Adicionar link
                  </button>
                </div>
              </div>
              <label className="flex flex-col text-sm text-slate-300">
                <span className="mb-1 text-xs uppercase tracking-wide text-slate-400">Ou anexe um arquivo</span>
                <input
                  type="file"
                  onChange={async (event) => {
                    const file = event.target.files ? event.target.files[0] : undefined;
                    if (file) {
                      await handlePlanFile(file);
                      event.target.value = '';
                    }
                  }}
                  className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white file:mr-3 file:rounded file:border-0 file:bg-emerald-500 file:px-3 file:py-2 file:text-emerald-950 focus:border-emerald-500 focus:outline-none"
                />
                <span className="mt-1 text-xs text-slate-500">Formatos leves (até 5MB). Arquivos ficam disponíveis apenas neste dispositivo.</span>
              </label>
              {planForm.anexos.length > 0 && (
                <div className="flex flex-wrap gap-2 text-xs">
                  {planForm.anexos.map((anexo) => (
                    <span
                      key={anexo.id}
                      className="group inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-slate-200"
                    >
                      {anexo.type === 'link' ? <LinkIcon size={12} className="text-emerald-300" /> : <FileUp size={12} className="text-emerald-300" />}
                      <span>{anexo.label}</span>
                      <button
                        type="button"
                        onClick={() => removePlanAttachment(anexo.id)}
                        className="rounded-full p-1 text-slate-400 transition hover:bg-slate-800 hover:text-white"
                        aria-label="Remover anexo"
                      >
                        <Trash2 size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {planError && (
              <p className="rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{planError}</p>
            )}
            {planSuccess && (
              <p className="rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">{planSuccess}</p>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={loadingTurmas || !turmaId}
                className="inline-flex items-center gap-2 rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/60"
              >
                Salvar plano de aula
              </button>
            </div>
          </form>

          <div className="mt-8 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">Planos salvos</h3>
              <span className="text-xs text-slate-500">
                {planos.length} plano{planos.length === 1 ? '' : 's'} organizados
              </span>
            </div>
            {loadingTurmas ? (
              <p className="text-sm text-slate-500">Carregando turmas…</p>
            ) : planos.length === 0 ? (
              <p className="text-sm text-slate-500">
                Nenhum plano registrado {turmaId ? 'para esta turma ainda.' : 'até o momento. Selecione uma turma para começar.'}
              </p>
            ) : (
              <ul className="space-y-3">
                {planos.map((plano) => (
                  <li key={plano.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{plano.titulo}</p>
                        <span className="text-xs text-slate-500">
                          Atualizado em {formatDate(plano.atualizadoEm)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removePlano(plano.id)}
                        className="rounded-full border border-transparent p-2 text-slate-400 transition hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-200"
                        aria-label="Excluir plano"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <dl className="mt-4 grid gap-3 text-sm text-slate-200 md:grid-cols-2">
                      <div>
                        <dt className="text-xs uppercase text-slate-400">Objetivos</dt>
                        <dd className="mt-1 text-sm text-slate-200">{plano.objetivos || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase text-slate-400">Conteúdos</dt>
                        <dd className="mt-1 text-sm text-slate-200">{plano.conteudos || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase text-slate-400">Metodologia</dt>
                        <dd className="mt-1 text-sm text-slate-200">{plano.metodologia || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase text-slate-400">Recursos</dt>
                        <dd className="mt-1 text-sm text-slate-200">{plano.recursos || '—'}</dd>
                      </div>
                    </dl>
                    <div className="mt-3 text-sm text-slate-300">
                      <span className="text-xs uppercase text-slate-400">Avaliação</span>
                      <p className="text-sm">{plano.avaliacao || '—'}</p>
                    </div>
                    {plano.observacoes && (
                      <div className="mt-3 text-sm text-slate-300">
                        <span className="text-xs uppercase text-slate-400">Observações</span>
                        <p className="text-sm">{plano.observacoes}</p>
                      </div>
                    )}
                    {plano.anexos.length > 0 && (
                      <div className="mt-4 space-y-2">
                        <p className="text-xs uppercase text-slate-400">Anexos</p>
                        <div className="flex flex-wrap gap-2 text-xs">
                          {plano.anexos.map((anexo) => (
                            <a
                              key={anexo.id}
                              href={anexo.type === 'link' ? anexo.url : anexo.dataUrl}
                              target={anexo.type === 'link' ? '_blank' : undefined}
                              rel={anexo.type === 'link' ? 'noreferrer' : undefined}
                              download={anexo.type === 'file' ? anexo.filename : undefined}
                              className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-emerald-100 transition hover:bg-emerald-500/20"
                            >
                              {anexo.type === 'link' ? <LinkIcon size={12} /> : <Download size={12} />}
                              <span>{anexo.label}</span>
                              {anexo.type === 'file' && <span className="text-[10px] text-emerald-200/80">{formatFileSize(anexo.size)}</span>}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="mt-10 rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-slate-800/80 p-2 text-emerald-300">
              <Layers size={20} />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-white">Banco de Materiais</h2>
              <p className="text-sm text-slate-400">
                Guarde textos, vídeos, slides e referências para reutilizar ou compartilhar com a turma selecionada.
              </p>
            </div>
          </div>

          <form onSubmit={handleMaterialSubmit} className="mt-6 space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col text-sm text-slate-300">
                <span className="mb-1 text-xs uppercase tracking-wide text-slate-400">Título</span>
                <input
                  value={materialForm.titulo}
                  onChange={(event) => setMaterialForm((prev) => ({ ...prev, titulo: event.target.value }))}
                  required
                  className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white shadow focus:border-emerald-500 focus:outline-none"
                  placeholder="Ex.: Slide com exercícios"
                />
              </label>
              <label className="flex flex-col text-sm text-slate-300">
                <span className="mb-1 text-xs uppercase tracking-wide text-slate-400">Categoria</span>
                <select
                  value={materialForm.categoria}
                  onChange={(event) => setMaterialForm((prev) => ({ ...prev, categoria: event.target.value as MaterialItem['categoria'] }))}
                  className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white shadow focus:border-emerald-500 focus:outline-none"
                >
                  <option value="texto">Texto</option>
                  <option value="video">Vídeo</option>
                  <option value="apresentacao">Apresentação</option>
                  <option value="outro">Outro</option>
                </select>
              </label>
            </div>
            <label className="flex flex-col text-sm text-slate-300">
              <span className="mb-1 text-xs uppercase tracking-wide text-slate-400">Descrição</span>
              <textarea
                value={materialForm.descricao}
                onChange={(event) => setMaterialForm((prev) => ({ ...prev, descricao: event.target.value }))}
                rows={3}
                className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white shadow focus:border-emerald-500 focus:outline-none"
                placeholder="Explique como o material será usado ou orientações para os alunos."
              />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col text-sm text-slate-300">
                <span className="mb-1 text-xs uppercase tracking-wide text-slate-400">Tags</span>
                <input
                  value={materialForm.tags}
                  onChange={(event) => setMaterialForm((prev) => ({ ...prev, tags: event.target.value }))}
                  className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white shadow focus:border-emerald-500 focus:outline-none"
                  placeholder="Matemática, 6º ano, revisão"
                />
                <span className="mt-1 text-xs text-slate-500">Separe por vírgula para facilitar buscas futuras.</span>
              </label>
              <label className="flex flex-col text-sm text-slate-300">
                <span className="mb-1 text-xs uppercase tracking-wide text-slate-400">Link direto</span>
                <input
                  value={materialForm.link}
                  onChange={(event) => setMaterialForm((prev) => ({ ...prev, link: event.target.value }))}
                  type="url"
                  className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white shadow focus:border-emerald-500 focus:outline-none"
                  placeholder="https://"
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
              <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-400">Links e anexos extras</p>
                <div className="flex flex-col gap-3 md:flex-row">
                  <label className="flex flex-1 flex-col text-sm text-slate-300">
                    <span className="mb-1 text-xs uppercase tracking-wide text-slate-400">Nome</span>
                    <input
                      value={materialLinkLabel}
                      onChange={(event) => setMaterialLinkLabel(event.target.value)}
                      className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white shadow focus:border-emerald-500 focus:outline-none"
                      placeholder="Ex.: Artigo complementar"
                    />
                  </label>
                  <label className="flex flex-1 flex-col text-sm text-slate-300">
                    <span className="mb-1 text-xs uppercase tracking-wide text-slate-400">Link (URL)</span>
                    <input
                      value={materialLinkUrl}
                      onChange={(event) => setMaterialLinkUrl(event.target.value)}
                      type="url"
                      className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white shadow focus:border-emerald-500 focus:outline-none"
                      placeholder="https://"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleMaterialLinkAdd}
                    className="inline-flex items-center gap-2 rounded border border-emerald-500/50 bg-emerald-500/20 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/30"
                  >
                    <LinkIcon size={14} />
                    Adicionar link
                  </button>
                </div>
                <label className="flex flex-col text-sm text-slate-300">
                  <span className="mb-1 text-xs uppercase tracking-wide text-slate-400">Arquivo</span>
                  <input
                    type="file"
                    onChange={async (event) => {
                      const file = event.target.files ? event.target.files[0] : undefined;
                      if (file) {
                        await handleMaterialFile(file);
                        event.target.value = '';
                      }
                    }}
                    className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white file:mr-3 file:rounded file:border-0 file:bg-emerald-500 file:px-3 file:py-2 file:text-emerald-950 focus:border-emerald-500 focus:outline-none"
                  />
                  <span className="mt-1 text-xs text-slate-500">Os arquivos ficam disponíveis apenas localmente.</span>
                </label>
                {materialForm.anexos.length > 0 && (
                  <div className="flex flex-wrap gap-2 text-xs">
                    {materialForm.anexos.map((anexo) => (
                      <span
                        key={anexo.id}
                        className="group inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-slate-200"
                      >
                        {anexo.type === 'link' ? <LinkIcon size={12} className="text-emerald-300" /> : <FileUp size={12} className="text-emerald-300" />}
                        <span>{anexo.label}</span>
                        <button
                          type="button"
                          onClick={() => removeMaterialAttachment(anexo.id)}
                          className="rounded-full p-1 text-slate-400 transition hover:bg-slate-800 hover:text-white"
                          aria-label="Remover anexo"
                        >
                          <Trash2 size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <label className="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300">
                <div>
                  <span className="mb-1 block text-xs uppercase tracking-wide text-slate-400">Compartilhamento</span>
                  <select
                    value={materialForm.compartilhamento}
                    onChange={(event) =>
                      setMaterialForm((prev) => ({
                        ...prev,
                        compartilhamento: event.target.value as MaterialItem['compartilhamento']
                      }))
                    }
                    className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white shadow focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="turma">Disponibilizar para a turma</option>
                    <option value="privado">Somente para uso pessoal</option>
                  </select>
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  Materiais privados ficam visíveis apenas para você. Ao compartilhar com a turma, eles aparecem na área do aluno.
                </p>
              </label>
            </div>

            {materialError && (
              <p className="rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{materialError}</p>
            )}
            {materialSuccess && (
              <p className="rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">{materialSuccess}</p>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={loadingTurmas || !turmaId}
                className="inline-flex items-center gap-2 rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/60"
              >
                Salvar material
              </button>
            </div>
          </form>

          <div className="mt-8 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">Materiais catalogados</h3>
              <span className="text-xs text-slate-500">
                {materiais.length} item{materiais.length === 1 ? '' : 's'} na biblioteca
              </span>
            </div>
            {materiais.length === 0 ? (
              <p className="text-sm text-slate-500">
                Nenhum material registrado {turmaId ? 'para esta turma ainda.' : 'até o momento. Selecione uma turma e cadastre seu primeiro recurso.'}
              </p>
            ) : (
              <ul className="space-y-3">
                {materiais.map((material) => (
                  <li key={material.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-white">{material.titulo}</p>
                        <div className="flex flex-wrap gap-2 text-[11px] text-slate-400">
                          <span className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900 px-2 py-1 uppercase tracking-wide text-[10px]">
                            <FolderOpen size={10} />
                            {material.categoria}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900 px-2 py-1 uppercase tracking-wide text-[10px]">
                            {material.compartilhamento === 'turma' ? 'Compartilhado com a turma' : 'Uso pessoal'}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeMaterial(material.id)}
                        className="rounded-full border border-transparent p-2 text-slate-400 transition hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-200"
                        aria-label="Excluir material"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    {material.descricao && (
                      <p className="mt-3 text-sm text-slate-300">{material.descricao}</p>
                    )}
                    {(material.link || material.anexos.length > 0) && (
                      <div className="mt-4 space-y-2">
                        <p className="text-xs uppercase text-slate-400">Acessos</p>
                        <div className="flex flex-wrap gap-2 text-xs">
                          {material.link && (
                            <a
                              href={material.link}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-emerald-100 transition hover:bg-emerald-500/20"
                            >
                              <LinkIcon size={12} />
                              Link principal
                            </a>
                          )}
                          {material.anexos.map((anexo) => (
                            <a
                              key={anexo.id}
                              href={anexo.type === 'link' ? anexo.url : anexo.dataUrl}
                              target={anexo.type === 'link' ? '_blank' : undefined}
                              rel={anexo.type === 'link' ? 'noreferrer' : undefined}
                              download={anexo.type === 'file' ? anexo.filename : undefined}
                              className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-emerald-100 transition hover:bg-emerald-500/20"
                            >
                              {anexo.type === 'link' ? <LinkIcon size={12} /> : <Download size={12} />}
                              <span>{anexo.label}</span>
                              {anexo.type === 'file' && <span className="text-[10px] text-emerald-200/80">{formatFileSize(anexo.size)}</span>}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                    {material.tags.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-400">
                        {material.tags.map((tag) => (
                          <span key={tag} className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                    <span className="mt-3 block text-xs text-slate-500">
                      Registrado em {formatDate(material.criadoEm)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="mt-10 rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-slate-800/80 p-2 text-emerald-300">
              <ListChecks size={20} />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-white">Criação de Atividades e Quizzes</h2>
              <p className="text-sm text-slate-400">
                Monte avaliações online, organize questões objetivas e habilite correção automática para agilizar o feedback aos alunos.
              </p>
            </div>
          </div>

          <form onSubmit={handleQuizSubmit} className="mt-6 space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col text-sm text-slate-300">
                <span className="mb-1 text-xs uppercase tracking-wide text-slate-400">Título</span>
                <input
                  value={quizForm.titulo}
                  onChange={(event) => handleQuizField('titulo', event.target.value)}
                  required
                  className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white shadow focus:border-emerald-500 focus:outline-none"
                  placeholder="Ex.: Quiz - Revisão de frações"
                />
              </label>
              <label className="flex flex-col text-sm text-slate-300">
                <span className="mb-1 text-xs uppercase tracking-wide text-slate-400">Disponível até</span>
                <input
                  type="date"
                  value={quizForm.entrega}
                  onChange={(event) => handleQuizField('entrega', event.target.value)}
                  className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white shadow focus:border-emerald-500 focus:outline-none"
                />
              </label>
            </div>
            <label className="flex flex-col text-sm text-slate-300">
              <span className="mb-1 text-xs uppercase tracking-wide text-slate-400">Descrição</span>
              <textarea
                value={quizForm.descricao}
                onChange={(event) => handleQuizField('descricao', event.target.value)}
                rows={3}
                className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white shadow focus:border-emerald-500 focus:outline-none"
                placeholder="Informe orientações e critérios para os alunos."
              />
            </label>

            <label className="flex items-center gap-3 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={quizForm.correcaoAutomatica}
                onChange={(event) => handleQuizField('correcaoAutomatica', event.target.checked)}
                className="h-4 w-4 rounded border border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
              />
              <span>Ativar correção automática para questões de múltipla escolha</span>
            </label>

            <div className="space-y-4">
              {quizForm.questoes.map((questao, indice) => (
                <div key={questao.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                  <div className="flex items-start justify-between">
                    <p className="text-sm font-semibold text-white">Questão {indice + 1}</p>
                    <button
                      type="button"
                      onClick={() => removeQuestion(questao.id)}
                      className="rounded-full border border-transparent p-2 text-slate-400 transition hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-200"
                      aria-label="Remover questão"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <label className="mt-3 block text-sm text-slate-300">
                    <span className="mb-1 block text-xs uppercase tracking-wide text-slate-400">Enunciado</span>
                    <textarea
                      value={questao.enunciado}
                      onChange={(event) => updateQuestion(questao.id, (current) => ({ ...current, enunciado: event.target.value }))}
                      rows={2}
                      className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white shadow focus:border-emerald-500 focus:outline-none"
                      placeholder="Descreva a pergunta para os alunos"
                    />
                  </label>
                  <div className="mt-4 space-y-3">
                    {questao.alternativas.map((alternativa, altIndex) => (
                      <div key={altIndex} className="flex items-start gap-3 text-sm text-slate-300">
                        <input
                          type="radio"
                          name={`correta-${questao.id}`}
                          checked={questao.correta === altIndex}
                          onChange={() => updateQuestion(questao.id, (current) => ({ ...current, correta: altIndex }))}
                          className="mt-2 h-4 w-4 border border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                        />
                        <input
                          value={alternativa}
                          onChange={(event) =>
                            updateQuestion(questao.id, (current) => ({
                              ...current,
                              alternativas: current.alternativas.map((alt, idx) => (idx === altIndex ? event.target.value : alt))
                            }))
                          }
                          className="flex-1 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white shadow focus:border-emerald-500 focus:outline-none"
                          placeholder={`Alternativa ${String.fromCharCode(65 + altIndex)}`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap justify-between gap-3">
              <button
                type="button"
                onClick={addQuestion}
                className="inline-flex items-center gap-2 rounded border border-emerald-500/40 bg-transparent px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/10"
              >
                Adicionar questão
              </button>
              <div className="flex gap-3">
                {quizError && (
                  <span className="inline-flex items-center rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                    {quizError}
                  </span>
                )}
                {quizSuccess && (
                  <span className="inline-flex items-center rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                    {quizSuccess}
                  </span>
                )}
                <button
                  type="submit"
                  disabled={loadingTurmas || !turmaId}
                  className="inline-flex items-center gap-2 rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/60"
                >
                  Publicar atividade
                </button>
              </div>
            </div>
          </form>

          <div className="mt-8 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">Atividades cadastradas</h3>
              <span className="text-xs text-slate-500">
                {quizzes.length} atividade{quizzes.length === 1 ? '' : 's'} criada{quizzes.length === 1 ? '' : 's'}
              </span>
            </div>
            {quizzes.length === 0 ? (
              <p className="text-sm text-slate-500">
                Nenhuma atividade criada {turmaId ? 'para esta turma ainda.' : 'até o momento. Selecione uma turma para começar a montar seus quizzes.'}
              </p>
            ) : (
              <ul className="space-y-3">
                {quizzes.map((atividade) => (
                  <li key={atividade.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{atividade.titulo}</p>
                        <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-400">
                          {atividade.entrega && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900 px-2 py-1">
                              <CalendarClock size={12} /> Disponível até {atividade.entrega.split('-').reverse().join('/')}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900 px-2 py-1">
                            <CheckCircle2 size={12} />
                            {atividade.correcaoAutomatica ? 'Correção automática ativa' : 'Correção manual'}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900 px-2 py-1">
                            {atividade.questoes.length} questão{atividade.questoes.length === 1 ? '' : 's'}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeQuiz(atividade.id)}
                        className="rounded-full border border-transparent p-2 text-slate-400 transition hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-200"
                        aria-label="Excluir atividade"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    {atividade.descricao && (
                      <p className="mt-3 text-sm text-slate-300">{atividade.descricao}</p>
                    )}
                    <div className="mt-4 space-y-3">
                      {atividade.questoes.map((questao, index) => (
                        <div key={questao.id} className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-sm text-slate-200">
                          <p className="font-semibold text-white">Questão {index + 1}</p>
                          <p className="mt-1 text-sm text-slate-300">{questao.enunciado}</p>
                          <ul className="mt-2 space-y-1 text-sm">
                            {questao.alternativas.map((alternativa, altIndex) => (
                              <li key={altIndex} className={`flex items-center gap-2 rounded px-2 py-1 ${questao.correta === altIndex ? 'bg-emerald-500/10 text-emerald-200' : 'text-slate-300'}`}>
                                {questao.correta === altIndex ? <CheckCircle2 size={14} /> : <span className="h-2 w-2 rounded-full bg-slate-700" />}
                                <span>
                                  <strong>{String.fromCharCode(65 + altIndex)}.</strong> {alternativa || <em className="text-slate-500">(vazio)</em>}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                    <span className="mt-3 block text-xs text-slate-500">
                      Criado em {formatDate(atividade.criadoEm)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
