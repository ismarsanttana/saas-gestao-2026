interface StatusBadgeProps {
  status: string | undefined;
}

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  RASCUNHO: {
    label: 'Rascunho',
    className:
      'border-slate-600/60 text-slate-300 bg-slate-800/60'
  },
  PUBLICADA: {
    label: 'Publicada',
    className:
      'border-emerald-500/50 text-emerald-200 bg-emerald-500/10'
  },
  ENCERRADA: {
    label: 'Encerrada',
    className:
      'border-slate-500/40 text-slate-200 bg-slate-500/10'
  }
};

export function StatusBadge({ status }: StatusBadgeProps) {
  if (!status) return null;
  const info = STATUS_MAP[status.toUpperCase()] ?? {
    label: status,
    className: 'border-slate-700 text-slate-300 bg-slate-900'
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wide ${info.className}`}>
      {info.label}
    </span>
  );
}
