import { create } from 'zustand';

export type Turno = 'MANHA' | 'TARDE' | 'NOITE';

interface ProfState {
  selectedTurma: string | null;
  data: string;
  turno: Turno;
  setTurma: (turmaId: string | null) => void;
  setData: (data: string) => void;
  setTurno: (turno: Turno) => void;
}

const today = new Date();
const pad = (value: number) => value.toString().padStart(2, '0');
const defaultDate = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

export const useProfStore = create<ProfState>((set) => ({
  selectedTurma: null,
  data: defaultDate,
  turno: 'MANHA',
  setTurma: (id) => set({ selectedTurma: id }),
  setData: (data) => set({ data }),
  setTurno: (turno) => set({ turno })
}));
