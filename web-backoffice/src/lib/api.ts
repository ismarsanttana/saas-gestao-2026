import { apiFetch } from '../api/client';
import type {
  AgendaItem,
  Aluno,
  AlunoDiarioEntrada,
  Avaliacao,
  AvaliacaoDetalhe,
  ChamadaResponse,
  CriarChamadaPayload,
  FrequenciaAluno,
  Materia,
  ProfessorOverview,
  RelatorioAvaliacao,
  Turma
} from '../types/edu';

function unwrap<T>(payload: any): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return payload.data as T;
  }
  return payload as T;
}

function ensureArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export const professorApi = {
  async getOverview(): Promise<ProfessorOverview> {
    return unwrap<ProfessorOverview>(await apiFetch('/prof/me'));
  },

  async updateProfile(body: { nome: string; email: string }) {
    const res = unwrap<{ usuario: { id: string; nome: string; email: string } }>(
      await apiFetch('/prof/me', {
        method: 'PUT',
        body: JSON.stringify(body)
      })
    );
    return res.usuario;
  },

  async getDashboardAnalytics() {
    const res = unwrap<{ analytics: any }>(await apiFetch('/prof/dashboard/analytics'));
    return res.analytics;
  },

  async getLivePresence() {
    const res = unwrap<{ live: Array<{ turma_id: string; turma: string; presentes: number; esperados: number; percentual: number; atualizado_em?: string }> }>(
      await apiFetch('/prof/dashboard/live')
    );
    return res.live ?? [];
  },

  async getTurmas(): Promise<Turma[]> {
    const res = unwrap<{ turmas?: Turma[] }>(await apiFetch('/prof/turmas'));
    return res.turmas ?? [];
  },

  async getAlunos(turmaId: string): Promise<Aluno[]> {
    const res = unwrap<{ alunos?: Aluno[] }>(await apiFetch(`/prof/turmas/${turmaId}/alunos`));
    return res.alunos ?? [];
  },

  async getChamada(turmaId: string, data: string, turno: string): Promise<ChamadaResponse> {
    const raw = unwrap<any>(
      await apiFetch(`/prof/turmas/${turmaId}/chamada?data=${data}&turno=${turno}`)
    );

    const mapItens = (lista: any[]): ChamadaResponse['atual']['itens'] =>
      (lista ?? []).map((item) => ({
        alunoId: item.aluno_id,
        nome: item.nome,
        matricula: item.matricula ?? null,
        status: item.status ?? null,
        justificativa: item.justificativa ?? item.observacao ?? null
      }));

    const atual = raw.atual ?? raw.data?.atual ?? {};
    const ultima = raw.ultima_chamada ?? raw.data?.ultima_chamada ?? null;

    return {
      atual: {
        aulaId: atual.aula_id ?? atual.aulaId ?? undefined,
        data: atual.data,
        turno: atual.turno,
        disciplina: atual.disciplina,
        itens: mapItens(atual.itens)
      },
      ultima_chamada: ultima
        ? {
            aulaId: ultima.aula_id ?? ultima.aulaId ?? undefined,
            data: ultima.data,
            turno: ultima.turno,
            disciplina: ultima.disciplina,
            itens: mapItens(ultima.itens)
          }
        : null
    };
  },

  async salvarChamada(turmaId: string, payload: CriarChamadaPayload) {
    return unwrap<{ aula_id: string }>(
      await apiFetch(`/prof/turmas/${turmaId}/chamada`, {
        method: 'POST',
        body: JSON.stringify({
          data: payload.data,
          turno: payload.turno,
          disciplina: payload.disciplina,
            itens: payload.itens.map((item) => ({
            aluno_id: item.aluno_id,
            status: item.status ?? null,
            justificativa: item.justificativa ?? null
          }))
        })
      })
    );
  },

  async getAlunoDiario(turmaId: string, alunoId: string): Promise<AlunoDiarioEntrada[]> {
    const fetchEntries = async (path: string) => {
      const res = unwrap<{ anotacoes?: AlunoDiarioEntrada[] }>(await apiFetch(path));
      const registros = res.anotacoes ?? [];
      return registros.slice().sort((a, b) => {
        const dataA = a.atualizadoEm ?? a.criadoEm;
        const dataB = b.atualizadoEm ?? b.criadoEm;
        return new Date(dataB).getTime() - new Date(dataA).getTime();
      });
    };

    try {
      return await fetchEntries(`/prof/turmas/${turmaId}/alunos/${alunoId}/diario`);
    } catch (error) {
      return fetchEntries(`/prof/alunos/${alunoId}/diario`);
    }
  },

  async criarAlunoDiario(turmaId: string, alunoId: string, payload: { conteudo: string }) {
    const buildInit = () => ({
      method: 'POST',
      body: JSON.stringify(payload)
    });

    try {
      const res = unwrap<{ anotacao: AlunoDiarioEntrada }>(
        await apiFetch(`/prof/turmas/${turmaId}/alunos/${alunoId}/diario`, buildInit())
      );
      return res.anotacao;
    } catch (error) {
      const res = unwrap<{ anotacao: AlunoDiarioEntrada }>(
        await apiFetch(`/prof/alunos/${alunoId}/diario`, buildInit())
      );
      return res.anotacao;
    }
  },

  async atualizarAlunoDiario(
    turmaId: string,
    alunoId: string,
    anotacaoId: string,
    payload: { conteudo: string }
  ) {
    const buildInit = () => ({
      method: 'PUT',
      body: JSON.stringify(payload)
    });

    try {
      const res = unwrap<{ anotacao: AlunoDiarioEntrada }>(
        await apiFetch(`/prof/turmas/${turmaId}/alunos/${alunoId}/diario/${anotacaoId}`, buildInit())
      );
      return res.anotacao;
    } catch (error) {
      const res = unwrap<{ anotacao: AlunoDiarioEntrada }>(
        await apiFetch(`/prof/alunos/${alunoId}/diario/${anotacaoId}`, buildInit())
      );
      return res.anotacao;
    }
  },

  async removerAlunoDiario(turmaId: string, alunoId: string, anotacaoId: string) {
    const buildInit = () => ({ method: 'DELETE' as const });
    try {
      await apiFetch(`/prof/turmas/${turmaId}/alunos/${alunoId}/diario/${anotacaoId}`, buildInit());
    } catch (error) {
      await apiFetch(`/prof/alunos/${alunoId}/diario/${anotacaoId}`, buildInit());
    }
  },

  async getAvaliacoes(turmaId: string): Promise<Avaliacao[]> {
    const res = unwrap<{ avaliacoes?: Avaliacao[] }>(
      await apiFetch(`/prof/turmas/${turmaId}/avaliacoes`)
    );
    return res.avaliacoes ?? [];
  },

  async createAvaliacao(turmaId: string, body: any) {
    return unwrap<{ avaliacao_id: string }>(
      await apiFetch(`/prof/turmas/${turmaId}/avaliacoes`, {
        method: 'POST',
        body: JSON.stringify(body)
      })
    );
  },

  async getAvaliacao(avaliacaoId: string): Promise<AvaliacaoDetalhe> {
    return unwrap<AvaliacaoDetalhe>(await apiFetch(`/prof/avaliacoes/${avaliacaoId}`));
  },

  async publicarAvaliacao(avaliacaoId: string) {
    return unwrap<{ status: string }>(
      await apiFetch(`/prof/avaliacoes/${avaliacaoId}/publicar`, { method: 'POST' })
    );
  },

  async lancarNotas(
    avaliacaoId: string,
    payload: { bimestre: number; notas: Array<{ aluno_id: string; nota: number; observacao?: string | null }> }
  ) {
    return unwrap<{ status: string }>(
      await apiFetch(`/prof/avaliacoes/${avaliacaoId}/notas`, {
        method: 'POST',
        body: JSON.stringify(payload)
      })
    );
  },

  async getNotas(
    turmaId: string,
    bimestre: number
  ): Promise<Array<{ aluno_id: string; nome: string; matricula?: string | null; nota?: number | null; observacao?: string | null }>> {
    const res = unwrap<{ notas?: Array<{ aluno_id: string; nome: string; matricula?: string | null; nota?: number | null; observacao?: string | null }> }>(
      await apiFetch(`/prof/turmas/${turmaId}/notas?bimestre=${bimestre}`)
    );
    return res.notas ?? [];
  },

  async getMateriais(turmaId: string): Promise<Materia[]> {
    const res = unwrap<{ materiais?: Materia[] }>(
      await apiFetch(`/prof/turmas/${turmaId}/materiais`)
    );
    return res.materiais ?? [];
  },

  async criarMaterial(
    turmaId: string,
    payload: { titulo: string; descricao?: string | null; url?: string | null }
  ): Promise<Materia> {
    const res = unwrap<{ material: Materia }>(
      await apiFetch(`/prof/turmas/${turmaId}/materiais`, {
        method: 'POST',
        body: JSON.stringify(payload)
      })
    );
    return res.material;
  },

  async getAgenda(from: string, to: string): Promise<AgendaItem[]> {
    const res = unwrap<{ eventos?: AgendaItem[] }>(
      await apiFetch(`/prof/agenda?from=${from}&to=${to}`)
    );
    return res.eventos ?? [];
  },

  async getRelatorioFrequencia(
    turmaId: string,
    from: string,
    to: string
  ): Promise<FrequenciaAluno[]> {
    const res = unwrap<{ frequencia?: FrequenciaAluno[] }>(
      await apiFetch(
        `/prof/relatorios/frequencia?turmaId=${turmaId}&from=${from}&to=${to}`
      )
    );
    return res.frequencia ?? [];
  },

  async getRelatorioAvaliacoes(turmaId: string, bimestre: number): Promise<RelatorioAvaliacao[]> {
    const res = unwrap<{ avaliacoes?: RelatorioAvaliacao[] }>(
      await apiFetch(`/prof/relatorios/avaliacoes?turmaId=${turmaId}&bimestre=${bimestre}`)
    );
    return ensureArray(res.avaliacoes);
  }
};
