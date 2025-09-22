export type Turma = {
  id: string;
  nome: string;
  turno: string;
  escolaId?: string | null;
  escolaNome?: string | null;
};

export type Aluno = {
  id: string;
  nome: string;
  matricula?: string | null;
};

export type ProfessorOverview = {
  nome: string;
  email: string;
  turmas: Turma[];
  proximas_aulas: AgendaItem[];
  contadores: {
    turmas: number;
    alunos: number;
  };
};

export type AgendaItem = {
  id: string;
  tipo: 'AULA' | 'AVALIACAO';
  turmaId: string;
  turmaNome: string;
  titulo: string;
  inicio: string;
  fim?: string | null;
};

export type ChamadaAluno = {
  alunoId: string;
  nome: string;
  matricula?: string | null;
  status?: string | null;
  justificativa?: string | null;
};

export type ChamadaResponse = {
  atual: {
    aulaId?: string;
    data: string;
    turno: 'MANHA' | 'TARDE' | 'NOITE';
    disciplina?: string;
    itens: ChamadaAluno[];
  };
  ultima_chamada?: {
    aulaId?: string;
    data: string;
    turno: 'MANHA' | 'TARDE' | 'NOITE';
    disciplina?: string;
    itens: ChamadaAluno[];
  } | null;
};

export type CriarChamadaPayload = {
  data: string;
  turno: string;
  disciplina?: string;
  itens: Array<{ aluno_id: string; status?: string | null; justificativa?: string | null }>;
};

export type AlunoDiarioEntrada = {
  id: string;
  alunoId: string;
  professorId: string;
  conteudo: string;
  criadoEm: string;
  atualizadoEm?: string | null;
};

export type Avaliacao = {
  id: string;
  turmaId: string;
  titulo: string;
  disciplina: string;
  tipo: string;
  status: string;
  data?: string | null;
  peso: number;
};

export type AvaliacaoDetalhe = {
  avaliacao: Avaliacao;
  questoes: AvaliacaoQuestao[];
};

export type AvaliacaoQuestao = {
  id: string;
  enunciado: string;
  alternativas?: string[];
  correta?: number | null;
};

export type Materia = {
  id: string;
  turmaId: string;
  professorId: string;
  titulo: string;
  descricao?: string | null;
  url?: string | null;
  criadoEm: string;
};

export type FrequenciaAluno = {
  alunoId: string;
  nome: string;
  matricula?: string | null;
  presentes: number;
  faltas: number;
  justificadas: number;
  total: number;
};

export type RelatorioAvaliacao = {
  avaliacaoId: string;
  titulo: string;
  disciplina: string;
  bimestre: number;
  media?: number | null;
  aplicadaEm?: string | null;
  status: string;
};
