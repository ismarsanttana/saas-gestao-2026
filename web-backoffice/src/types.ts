export type Papel = 'ADMIN_TEC' | 'SECRETARIO' | 'ATENDENTE' | 'PROFESSOR';

export interface SecretariaVinculo {
  id: string;
  nome: string;
  slug: string;
  papel: Papel;
}

export interface User {
  id: string;
  nome: string;
  email: string;
  secretarias?: SecretariaVinculo[] | null;
}

export interface Turma {
  id: string;
  nome: string;
  escola?: { id: string; nome: string };
}

export interface Aluno {
  id: string;
  nome: string;
  matricula?: string;
}

export interface Presenca {
  id: string;
  aluno_id: string;
  presente: boolean;
  data: string;
}

export interface Avaliacao {
  id: string;
  titulo: string;
  publicada: boolean;
  encerrada: boolean;
  data?: string;
}

export interface Nota {
  id: string;
  aluno_id: string;
  avaliacao_id: string;
  valor: number | null;
}
