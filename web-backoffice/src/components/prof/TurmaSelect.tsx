import type { Turma } from '../../types/edu';

interface TurmaSelectProps {
  turmas: Turma[];
  value: string | null;
  onChange: (turmaId: string | null) => void;
  placeholder?: string;
}

export function TurmaSelect({ turmas, value, onChange, placeholder }: TurmaSelectProps) {
  return (
    <label className="flex flex-col text-sm text-slate-300">
      <span className="mb-1 text-xs uppercase tracking-wide text-slate-400">Turma</span>
      <select
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
        className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white shadow focus:border-emerald-500 focus:outline-none"
      >
        <option value="">{placeholder ?? 'Selecione uma turma'}</option>
        {turmas.map((turma) => (
          <option key={turma.id} value={turma.id}>
            {turma.nome}
          </option>
        ))}
      </select>
    </label>
  );
}
